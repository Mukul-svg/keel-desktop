import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../stores/useStore';
import { Trash2, Edit } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

export const ContextMenu: React.FC = () => {
  const {
    contextMenu,
    hideContextMenu,
    notes,
    notebooks,
    activeNoteId,
    activeNotebookId,
    deleteActiveNote,
    deleteNotebook,
    setEditNotebookModalOpen,
    showConfirm,
    loadNotes,
    loadAllTags,
  } = useStore();

  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (contextMenu && menuRef.current) {
      const menuWidth = 160; // fixed width of context menu
      const menuHeight = menuRef.current.offsetHeight || 100;
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      let x = contextMenu.x;
      let y = contextMenu.y;

      // Prevent menu from clipping the right viewport edge
      if (x + menuWidth > screenWidth) {
        x = screenWidth - menuWidth - 8;
      }
      // Prevent menu from clipping the bottom viewport edge
      if (y + menuHeight > screenHeight) {
        y = screenHeight - menuHeight - 8;
      }

      setCoords({ x, y });
    }
  }, [contextMenu]);

  // Click outside to close context menu
  useEffect(() => {
    if (!contextMenu || !contextMenu.isOpen) return;

    const handleGlobalClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideContextMenu();
      }
    };

    window.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('resize', hideContextMenu);

    return () => {
      window.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('resize', hideContextMenu);
    };
  }, [contextMenu, hideContextMenu]);

  if (!contextMenu || !contextMenu.isOpen) return null;

  const { type, targetId } = contextMenu;

  // Render Note Context Actions
  const handleNoteDelete = () => {
    hideContextMenu();
    const note = notes.find(n => n.id === targetId);
    const noteTitle = note ? ` "${note.title}"` : '';

    showConfirm({
      title: 'Delete Note',
      message: `Are you sure you want to delete the note${noteTitle}? This action cannot be undone.`,
      confirmLabel: 'Delete Note',
      cancelLabel: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        if (targetId === activeNoteId) {
          await deleteActiveNote();
        } else {
          try {
            await invoke('delete_note', { id: targetId });
            await loadNotes(activeNotebookId);
            await loadAllTags();
          } catch (err) {
            console.error('Failed to delete note:', err);
          }
        }
      },
    });
  };

  // Render Notebook Context Actions
  const handleNotebookEdit = () => {
    hideContextMenu();
    const book = notebooks.find(b => b.id === targetId);
    if (book) {
      setEditNotebookModalOpen(true, book);
    }
  };

  const handleNotebookDelete = () => {
    hideContextMenu();
    const book = notebooks.find(b => b.id === targetId);
    const bookName = book ? ` "${book.name}"` : '';

    showConfirm({
      title: 'Delete Notebook',
      message: `Are you sure you want to delete the notebook${bookName} and all of its notes? This action cannot be undone.`,
      confirmLabel: 'Delete Notebook',
      cancelLabel: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        await deleteNotebook(targetId);
      },
    });
  };

  const isInbox = targetId === 'inbox';

  return (
    <div
      ref={menuRef}
      className="custom-context-menu"
      style={{
        left: `${coords.x}px`,
        top: `${coords.y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'note' && (
        <button className="context-menu-item destructive" onClick={handleNoteDelete}>
          <Trash2 size={13} />
          <span>Delete Note</span>
        </button>
      )}

      {type === 'notebook' && (
        <>
          <button
            className="context-menu-item"
            onClick={handleNotebookEdit}
            disabled={isInbox}
            title={isInbox ? "System Inbox cannot be modified" : undefined}
          >
            <Edit size={13} />
            <span>Rename / Edit</span>
          </button>
          <button
            className="context-menu-item destructive"
            onClick={handleNotebookDelete}
            disabled={isInbox}
            title={isInbox ? "System Inbox cannot be deleted" : undefined}
          >
            <Trash2 size={13} />
            <span>Delete Notebook</span>
          </button>
        </>
      )}
    </div>
  );
};
