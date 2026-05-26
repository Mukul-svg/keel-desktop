import React, { useState, useEffect } from 'react';
import { useStore } from '../../stores/useStore';
import { 
  Settings, Plus, X, Search, Pin, Clock, ChevronRight
} from 'lucide-react';

const getNoteCardPreview = (content?: string, title?: string): string => {
  if (!content) return 'Empty note.';
  
  let cleaned = content
    .replace(/#+\s+.*/g, '')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
    
  if (!cleaned) {
    const headings = content.match(/#+\s+(.*)/g);
    if (headings && headings.length > 0) {
      cleaned = headings.map(h => h.replace(/#+\s+/, '').trim()).join(' • ');
    }
  }
  
  if (!cleaned) {
    cleaned = title?.trim() || '';
  }
  
  if (!cleaned) {
    return 'Empty note.';
  }
  
  return cleaned.length > 100 ? cleaned.substring(0, 100) + '...' : cleaned;
};

export const NotesList: React.FC = () => {
  const {
    notes,
    activeNoteId,
    activeNotebookId,
    notebooks,
    searchResults,
    searchQuery,
    setSearchQuery,
    triggerSearch,
    selectNote,
    createNote,
    setMobileNotesListOpen,
    setEditNotebookModalOpen,
    showContextMenu,
    isSidebarCollapsed,
    setSidebarCollapsed,
  } = useStore();

  const [searchText, setSearchText] = useState(searchQuery);

  // Keep local search input synced with store query changes
  useEffect(() => {
    setSearchText(searchQuery);
  }, [searchQuery]);

  // Local state for note drag-and-drop reordering
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [draggedOverNoteId, setDraggedOverNoteId] = useState<string | null>(null);
  const [isDropAboveNote, setIsDropAboveNote] = useState<boolean>(true);

  // Search input typing handler
  const handleSearchTyping = (text: string) => {
    setSearchText(text);
    setSearchQuery(text);
    if (text.trim()) {
      triggerSearch();
    }
  };

  const activeNotebook = notebooks.find(b => b.id === activeNotebookId);

  return (
    <section className={`list-panel glass-panel ${useStore.getState().isMobileNotesListOpen ? 'mobile-open' : ''}`}>
      <div className="list-panel-header">
        <div className="list-title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
            {isSidebarCollapsed && (
              <button
                className="sidebar-expand-btn desktop-only"
                title="Expand Sidebar"
                onClick={() => setSidebarCollapsed(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  marginRight: '2px',
                  transition: 'all 0.15s ease',
                }}
              >
                <ChevronRight size={15} />
              </button>
            )}
            <h2 className="list-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {activeNotebook ? activeNotebook.name : 'Inbox'}
            </h2>
            <button
              className="notebook-header-settings-btn"
              title="Notebook Settings"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.15s ease',
              }}
              onClick={() => {
                if (activeNotebook) {
                  setEditNotebookModalOpen(true, activeNotebook);
                }
              }}
            >
              <Settings size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              className="add-note-btn"
              title="Add New Note (Ctrl+N)"
              onClick={() => {
                createNote();
                setMobileNotesListOpen(false);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <Plus size={14} />
            </button>
            <button className="mobile-drawer-close-btn" onClick={() => setMobileNotesListOpen(false)} title="Close drawer">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="search-input-wrapper">
          <Search size={14} style={{ color: 'var(--text-muted)', marginRight: '6px' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Search notes instantly..."
            value={searchText}
            onChange={(e) => handleSearchTyping(e.target.value)}
          />
          {searchText && (
            <button
              onClick={() => {
                setSearchText('');
                setSearchQuery('');
                useStore.setState({ searchResults: [] });
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '4px',
                flexShrink: 0,
              }}
              title="Clear Search"
              className="clear-search-btn"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div 
        className="note-cards-container"
        onDragOver={(e) => {
          const activeDragId = (window as any).__draggedNoteId || draggedNoteId;
          if (activeDragId) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={async (e) => {
          const activeDragId = (window as any).__draggedNoteId || draggedNoteId;
          if (activeDragId) {
            e.preventDefault();
            (window as any).__draggedNoteId = null;
            setDraggedNoteId(null);
            setDraggedOverNoteId(null);

            const currentIds = notes.map(n => n.id);
            const sourceIndex = currentIds.indexOf(activeDragId);
            if (sourceIndex === -1) return;

            // Move to the end of the array
            currentIds.splice(sourceIndex, 1);
            currentIds.push(activeDragId);

            await useStore.getState().updateNoteOrder(currentIds);
          }
        }}
      >
        {searchText.trim() ? (
          searchResults.length > 0 ? (
            searchResults.map((res) => (
              <div
                key={res.id}
                className={`note-card ${activeNoteId === res.id ? 'active' : ''}`}
                onClick={() => {
                  selectNote(res.id);
                  setMobileNotesListOpen(false);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showContextMenu('note', res.id, e.clientX, e.clientY);
                }}
                draggable={true}
                onDragStart={(e) => {
                  (window as any).__draggedNoteId = res.id;
                  setDraggedNoteId(res.id);
                  e.dataTransfer.setData('text/plain', res.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  (window as any).__draggedNoteId = null;
                  setDraggedNoteId(null);
                }}
              >
                <div className="note-card-title-row">
                  <h4 className="note-card-title">{res.title}</h4>
                </div>
                <p
                  className="note-card-preview"
                  dangerouslySetInnerHTML={{ __html: res.snippet }}
                />
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '16px', textAlign: 'center' }}>
              No match in notebooks.
            </div>
          )
        ) : (
          notes.map((note) => {
            const activeDragNoteId = (window as any).__draggedNoteId || draggedNoteId;
            return (
              <div
                key={note.id}
                className={`note-card ${activeNoteId === note.id ? 'active' : ''} ${
                  activeDragNoteId && draggedOverNoteId === note.id
                    ? isDropAboveNote
                      ? 'drag-reorder-above'
                      : 'drag-reorder-below'
                    : ''
                }`}
                onClick={() => {
                  selectNote(note.id);
                  setMobileNotesListOpen(false);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  showContextMenu('note', note.id, e.clientX, e.clientY);
                }}
                draggable={true}
                onDragStart={(e) => {
                  (window as any).__draggedNoteId = note.id;
                  setDraggedNoteId(note.id);
                  e.dataTransfer.setData('text/plain', note.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {
                  (window as any).__draggedNoteId = null;
                  setDraggedNoteId(null);
                  setDraggedOverNoteId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const innerActiveDragId = (window as any).__draggedNoteId || draggedNoteId;
                  if (innerActiveDragId) {
                    if (innerActiveDragId === note.id) {
                      e.dataTransfer.dropEffect = 'none';
                      return;
                    }
                    e.dataTransfer.dropEffect = 'move';
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relativeY = e.clientY - rect.top;
                    const above = relativeY < rect.height / 2;
                    if (isDropAboveNote !== above) {
                      setIsDropAboveNote(above);
                    }
                    if (draggedOverNoteId !== note.id) {
                      setDraggedOverNoteId(note.id);
                    }
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  const innerActiveDragId = (window as any).__draggedNoteId || draggedNoteId;
                  if (innerActiveDragId) {
                    if (innerActiveDragId === note.id) return;
                    setDraggedOverNoteId(note.id);
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relativeY = e.clientY - rect.top;
                    setIsDropAboveNote(relativeY < rect.height / 2);
                  }
                }}
                onDragLeave={() => {
                  const innerActiveDragId = (window as any).__draggedNoteId || draggedNoteId;
                  if (innerActiveDragId) {
                    setDraggedOverNoteId(null);
                  }
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const innerActiveDragId = (window as any).__draggedNoteId || draggedNoteId;
                  if (innerActiveDragId) {
                    const sourceId = innerActiveDragId;
                    const targetId = note.id;
                    (window as any).__draggedNoteId = null;
                    setDraggedNoteId(null);
                    setDraggedOverNoteId(null);
                    
                    if (sourceId === targetId) return;

                    const currentIds = notes.map(n => n.id);
                    const sourceIndex = currentIds.indexOf(sourceId);
                    let targetIndex = currentIds.indexOf(targetId);

                    if (sourceIndex === -1 || targetIndex === -1) return;

                    currentIds.splice(sourceIndex, 1);
                    targetIndex = currentIds.indexOf(targetId);
                    
                    if (isDropAboveNote) {
                      currentIds.splice(targetIndex, 0, sourceId);
                    } else {
                      currentIds.splice(targetIndex + 1, 0, sourceId);
                    }

                    await useStore.getState().updateNoteOrder(currentIds);
                  }
                }}
              >
                <div className="note-card-title-row">
                  <h4 className="note-card-title">{note.title}</h4>
                  {note.is_pinned && <Pin size={12} className="pin-indicator" />}
                </div>
                <p className="note-card-preview">
                  {getNoteCardPreview(note.content, note.title)}
                </p>
                <div className="note-card-footer">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={10} /> {note.reading_time}s
                  </span>
                  <span>{note.updated_at.split('T')[0]}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
