import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../../stores/useStore';
import { FilePlus, Eye, Sparkles, Pin, Trash2, Settings, FileText, Maximize2, Minimize2 } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  kbd?: string;
  action: () => void | Promise<void>;
  category: 'Commands' | 'Notes';
}

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    searchResults,
    searchQuery,
    setSearchQuery,
    triggerSearch,
    createNote,
    isPreviewMode,
    setPreviewMode,
    isGeminiPanelOpen,
    setGeminiPanelOpen,
    setSettingsOpen,
    togglePinActiveNote,
    deleteActiveNote,
    notes,
    selectNote,
    showConfirm,
    isFocusMode,
    setFocusMode,
    setEditNotebookModalOpen,
    activeNotebookId,
    notebooks,
  } = useStore();

  const [activeIndex, setActiveIndex] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Static commands list
  const getStaticCommands = (): Command[] => [
    {
      id: 'cmd-create-note',
      label: 'Create New Note',
      icon: <FilePlus size={16} />,
      kbd: 'Ctrl+N',
      action: async () => {
        await createNote();
      },
      category: 'Commands',
    },
    {
      id: 'cmd-toggle-preview',
      label: isPreviewMode ? 'Switch to Editor Mode' : 'Switch to Markdown Preview',
      icon: <Eye size={16} />,
      kbd: 'Ctrl+P',
      action: () => {
        setPreviewMode(!isPreviewMode);
      },
      category: 'Commands',
    },
    {
      id: 'cmd-toggle-ai',
      label: isGeminiPanelOpen ? 'Close AI Panel' : 'Open AI Assist Panel',
      icon: <Sparkles size={16} />,
      kbd: 'Ctrl+J',
      action: () => {
        setGeminiPanelOpen(!isGeminiPanelOpen);
      },
      category: 'Commands',
    },
    {
      id: 'cmd-toggle-focus',
      label: isFocusMode ? 'Exit Focus Mode (Show Sidebar)' : 'Enter Focus Mode (Distraction-Free Writing)',
      icon: isFocusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />,
      kbd: 'Ctrl+\\',
      action: () => {
        setFocusMode(!isFocusMode);
      },
      category: 'Commands',
    },
    {
      id: 'cmd-pin-note',
      label: 'Pin / Unpin Active Note',
      icon: <Pin size={16} />,
      kbd: 'Ctrl+B',
      action: async () => {
        await togglePinActiveNote();
      },
      category: 'Commands',
    },
    {
      id: 'cmd-delete-note',
      label: 'Delete Active Note',
      icon: <Trash2 size={16} />,
      action: async () => {
        showConfirm({
          title: 'Delete Note',
          message: 'Are you sure you want to delete this note? This action cannot be undone.',
          confirmLabel: 'Delete Note',
          cancelLabel: 'Cancel',
          isDestructive: true,
          onConfirm: async () => {
            await deleteActiveNote();
          }
        });
      },
      category: 'Commands',
    },
    {
      id: 'cmd-open-settings',
      label: 'Open Keel Settings',
      icon: <Settings size={16} />,
      action: () => {
        setSettingsOpen(true);
      },
      category: 'Commands',
    },
    {
      id: 'cmd-edit-notebook',
      label: 'Notebook Settings (Edit Name/Icon)',
      icon: <Settings size={16} />,
      action: () => {
        const activeBook = notebooks.find(b => b.id === activeNotebookId);
        if (activeBook) {
          setEditNotebookModalOpen(true, activeBook);
        }
      },
      category: 'Commands',
    },
  ];

  // Combined options (filtered list)
  const [items, setItems] = useState<Command[]>([]);

  // Refocus input whenever opened
  useEffect(() => {
    if (isCommandPaletteOpen) {
      setActiveIndex(0);
      setSearchQuery('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isCommandPaletteOpen, setSearchQuery]);

  // Update filtered items list when query or search results change
  useEffect(() => {
    const isCommandSearch = searchQuery.startsWith('>');
    const cleanQuery = isCommandSearch
      ? searchQuery.slice(1).trim().toLowerCase()
      : searchQuery.trim().toLowerCase();

    const staticCommands = getStaticCommands();

    if (isCommandSearch) {
      // Filter ONLY commands
      const filteredCommands = staticCommands.filter((cmd) =>
        cmd.label.toLowerCase().includes(cleanQuery)
      );
      setItems(filteredCommands);
      setActiveIndex(0);
    } else if (cleanQuery.length > 0) {
      // Perform FTS5 database search + filter commands in list
      const triggerDBSearch = async () => {
        await triggerSearch();
      };
      triggerDBSearch();

      const matchedCommands = staticCommands.filter((cmd) =>
        cmd.label.toLowerCase().includes(cleanQuery)
      );

      const matchedNotes: Command[] = searchResults.map((note) => ({
        id: note.id,
        label: note.title,
        icon: <FileText size={16} />,
        category: 'Notes',
        action: async () => {
          await selectNote(note.id);
        },
      }));

      setItems([...matchedCommands, ...matchedNotes]);
      setActiveIndex(0);
    } else {
      // Empty query: Show all static commands + recent 5 notes
      const recentNotes: Command[] = notes.slice(0, 5).map((note) => ({
        id: note.id,
        label: note.title,
        icon: <FileText size={16} />,
        category: 'Notes',
        action: async () => {
          await selectNote(note.id);
        },
      }));
      setItems([...staticCommands, ...recentNotes]);
    }
  }, [searchQuery, searchResults, notes]);

  // Handle Keyboard Triggers in HUD
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCommandPaletteOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setCommandPaletteOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(1, items.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + items.length) % Math.max(1, items.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[activeIndex]) {
          items[activeIndex].action();
          setCommandPaletteOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, items, activeIndex, setCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      setCommandPaletteOpen(false);
    }
  };

  // Group items by category to render
  const categories: { [key: string]: Command[] } = {};
  items.forEach((item) => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });

  // Keep a running flat index for selected styling
  let flatIndexCounter = 0;

  return (
    <div className="palette-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="command-palette glass-panel">
        <div className="palette-search-row">
          <span className="palette-indicator">{searchQuery.startsWith('>') ? '>' : '?' }</span>
          <input
            ref={inputRef}
            type="text"
            className="palette-search-input"
            placeholder="Type '>' for commands, or write to search notes instantly..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="palette-esc-badge">ESC</span>
        </div>
        <div className="palette-list">
          {Object.keys(categories).map((catName) => (
            <div key={catName}>
              <div className="palette-category">{catName}</div>
              {categories[catName].map((item) => {
                const currentFlatIndex = flatIndexCounter++;
                const isActive = currentFlatIndex === activeIndex;

                return (
                  <div
                    key={item.id}
                    className={`palette-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      item.action();
                      setCommandPaletteOpen(false);
                    }}
                    onMouseEnter={() => setActiveIndex(currentFlatIndex)}
                  >
                    <div className="palette-item-meta">
                      <span className="palette-item-icon">{item.icon}</span>
                      <span className="palette-item-label">{item.label}</span>
                    </div>
                    {item.kbd && <span className="palette-item-kbd">{item.kbd}</span>}
                  </div>
                );
              })}
            </div>
          ))}

          {items.length === 0 && (
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No matches found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
