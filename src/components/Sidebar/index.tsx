import React, { useState } from 'react';
import { useStore } from '../../stores/useStore';
import { 
  Folder, Inbox, Settings, Command, Pin, 
  Book, Archive, Code, Sparkles, Globe, Heart, Lock, X
} from 'lucide-react';

const getNotebookIcon = (emojiOrName: string) => {
  switch (emojiOrName?.toLowerCase()) {
    case 'inbox': case '📥': return <Inbox size={14} />;
    case 'book': return <Book size={14} />;
    case 'archive': return <Archive size={14} />;
    case 'code': return <Code size={14} />;
    case 'sparkles': return <Sparkles size={14} />;
    case 'globe': return <Globe size={14} />;
    case 'heart': return <Heart size={14} />;
    case 'lock': return <Lock size={14} />;
    default:
      if (emojiOrName && emojiOrName !== 'folder' && emojiOrName !== '📝') {
        return <span style={{ fontSize: '14px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px' }}>{emojiOrName}</span>;
      }
      return <Folder size={14} />;
  }
};

export const Sidebar: React.FC = () => {
  const {
    notebooks,
    activeNotebookId,
    selectNotebook,
    tags,
    setSettingsOpen,
    setCommandPaletteOpen,
    setCreateNotebookModalOpen,
    setEditNotebookModalOpen,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    setMobileNotesListOpen,
    moveNote,
  } = useStore();

  // Local state for drag-and-drop reordering
  const [draggedOverBookId, setDraggedOverBookId] = useState<string | null>(null);
  const [draggedNotebookId, setDraggedNotebookId] = useState<string | null>(null);
  const [draggedOverReorderBookId, setDraggedOverReorderBookId] = useState<string | null>(null);
  const [isDropAbove, setIsDropAbove] = useState<boolean>(true);

  const handleAddNotebook = () => {
    setCreateNotebookModalOpen(true);
  };

  return (
    <aside className={`sidebar-panel glass-panel ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
      <div className="logo-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo.png" alt="Logo" className="brand-logo" style={{ height: '22px', width: 'auto', objectFit: 'contain' }} />
          <span className="logo-text">Keel</span>
        </div>
        <button className="mobile-drawer-close-btn" onClick={() => setMobileSidebarOpen(false)} title="Close drawer">
          <X size={18} />
        </button>
      </div>

      <div className="nav-section">
        <div className="nav-section-title">Notebooks</div>
        {notebooks.map((book) => (
          <div
            key={book.id}
            className={`nav-item ${activeNotebookId === book.id ? 'active' : ''} ${
              !draggedNotebookId && draggedOverBookId === book.id ? 'drag-over' : ''
            } ${
              draggedNotebookId && draggedOverReorderBookId === book.id
                ? isDropAbove
                  ? 'drag-reorder-above'
                  : 'drag-reorder-below'
                : ''
            }`}
            onClick={() => {
              selectNotebook(book.id);
              // Clear search states globally
              useStore.setState({ searchQuery: '', searchResults: [] });
              if (window.innerWidth <= 767) {
                setMobileSidebarOpen(false);
                setMobileNotesListOpen(true);
              }
            }}
            draggable={true}
            onDragStart={(e) => {
              (window as any).__draggedNotebookId = book.id;
              setDraggedNotebookId(book.id);
              e.dataTransfer.setData('text/plain', book.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              (window as any).__draggedNotebookId = null;
              setDraggedNotebookId(null);
              setDraggedOverReorderBookId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              const activeBookDragId = (window as any).__draggedNotebookId || draggedNotebookId;
              if (activeBookDragId) {
                if (activeBookDragId === book.id) {
                  e.dataTransfer.dropEffect = 'none';
                  return;
                }
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const relativeY = e.clientY - rect.top;
                const above = relativeY < rect.height / 2;
                if (isDropAbove !== above) {
                  setIsDropAbove(above);
                }
                if (draggedOverReorderBookId !== book.id) {
                  setDraggedOverReorderBookId(book.id);
                }
              } else {
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = 'move';
                }
              }
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              const activeBookDragId = (window as any).__draggedNotebookId || draggedNotebookId;
              if (activeBookDragId) {
                if (activeBookDragId === book.id) return;
                setDraggedOverReorderBookId(book.id);
                const rect = e.currentTarget.getBoundingClientRect();
                const relativeY = e.clientY - rect.top;
                setIsDropAbove(relativeY < rect.height / 2);
              } else {
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = 'move';
                }
                setDraggedOverBookId(book.id);
              }
            }}
            onDragLeave={() => {
              const activeBookDragId = (window as any).__draggedNotebookId || draggedNotebookId;
              if (activeBookDragId) {
                setDraggedOverReorderBookId(null);
              } else {
                setDraggedOverBookId(null);
              }
            }}
            onDrop={async (e) => {
              e.preventDefault();
              const activeBookDragId = (window as any).__draggedNotebookId || draggedNotebookId;
              if (activeBookDragId) {
                const sourceId = activeBookDragId;
                const targetId = book.id;
                (window as any).__draggedNotebookId = null;
                setDraggedNotebookId(null);
                setDraggedOverReorderBookId(null);
                
                if (sourceId === targetId) return;

                const currentIds = notebooks.map(b => b.id);
                const sourceIndex = currentIds.indexOf(sourceId);
                let targetIndex = currentIds.indexOf(targetId);

                if (sourceIndex === -1 || targetIndex === -1) return;

                currentIds.splice(sourceIndex, 1);
                targetIndex = currentIds.indexOf(targetId);
                
                if (isDropAbove) {
                  currentIds.splice(targetIndex, 0, sourceId);
                } else {
                  currentIds.splice(targetIndex + 1, 0, sourceId);
                }

                await useStore.getState().updateNotebookOrder(currentIds);
              } else {
                setDraggedOverBookId(null);
                const noteId = (window as any).__draggedNoteId || e.dataTransfer.getData('text/plain');
                if (noteId) {
                  (window as any).__draggedNoteId = null;
                  await moveNote(noteId, book.id);
                }
              }
            }}
          >
            <div className="nav-item-meta">
              {getNotebookIcon(book.emoji)}
              <span className="nav-item-name" style={{ fontWeight: activeNotebookId === book.id ? 600 : 400 }}>
                {book.name}
              </span>
              {book.is_pinned && book.id !== 'inbox' && (
                <Pin 
                  size={10} 
                  style={{ 
                    color: 'var(--cyan)', 
                    transform: 'rotate(45deg)', 
                    flexShrink: 0,
                    opacity: 0.8 
                  }} 
                />
              )}
            </div>
            <button
              className="notebook-edit-btn"
              title="Notebook Settings"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s ease',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setEditNotebookModalOpen(true, book);
              }}
            >
              <Settings size={12} />
            </button>
          </div>
        ))}
        <button className="new-notebook-btn" onClick={handleAddNotebook}>
          + Create Notebook
        </button>
      </div>

      {tags.length > 0 && (
        <div className="nav-section" style={{ marginTop: '24px' }}>
          <div className="nav-section-title">Tag Browser</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 12px' }}>
            {tags.map((tag) => (
              <span
                key={tag.name}
                className="tag-badge"
                style={{
                  borderColor: tag.color_hex + '33',
                  background: tag.color_hex + '0d',
                  color: tag.color_hex,
                }}
              >
                #{tag.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <div
          className="nav-item"
          onClick={() => setSettingsOpen(true)}
        >
          <div className="nav-item-meta"><Settings size={14} /><span>Settings</span></div>
        </div>
        <div
          className="nav-item"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <div className="nav-item-meta"><Command size={14} /><span>HUD Palette <kbd className="kbd-shortcut">Ctrl+K</kbd></span></div>
        </div>
      </div>
    </aside>
  );
};
