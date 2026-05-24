import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../../stores/useStore';
import { 
  Inbox, Folder, Book, Archive, Code, Sparkles, Globe, Heart, Lock, X, Trash2
} from 'lucide-react';

const ICONS_GRID = [
  { name: 'folder', icon: <Folder size={18} />, label: 'Folder' },
  { name: 'inbox', icon: <Inbox size={18} />, label: 'Inbox' },
  { name: 'book', icon: <Book size={18} />, label: 'Book' },
  { name: 'archive', icon: <Archive size={18} />, label: 'Archive' },
  { name: 'code', icon: <Code size={18} />, label: 'Code' },
  { name: 'sparkles', icon: <Sparkles size={18} />, label: 'Spark' },
  { name: 'globe', icon: <Globe size={18} />, label: 'Globe' },
  { name: 'heart', icon: <Heart size={18} />, label: 'Heart' },
  { name: 'lock', icon: <Lock size={18} />, label: 'Lock' },
];

export const EditNotebookModal: React.FC = () => {
  const { 
    isEditNotebookModalOpen, 
    setEditNotebookModalOpen, 
    editingNotebook,
    updateNotebook,
    deleteNotebook,
    showConfirm
  } = useStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('folder');
  const [isPinned, setIsPinned] = useState(false);
  const [error, setError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditNotebookModalOpen && editingNotebook) {
      setName(editingNotebook.name || '');
      setDescription(editingNotebook.description || '');
      setSelectedIcon(editingNotebook.emoji || 'folder');
      setIsPinned(editingNotebook.is_pinned || false);
      setError('');
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isEditNotebookModalOpen, editingNotebook]);

  if (!isEditNotebookModalOpen || !editingNotebook) return null;

  const handleClose = () => {
    setEditNotebookModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Notebook name is required');
      return;
    }
    setError('');

    try {
      await updateNotebook(editingNotebook.id, name.trim(), selectedIcon, description.trim(), isPinned);
      setEditNotebookModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setError(err?.toString() || 'Failed to update notebook');
    }
  };

  const handleDelete = () => {
    const notebookId = editingNotebook.id;
    const notebookName = editingNotebook.name;
    const noteCount = editingNotebook.note_count || 0;

    // Close the settings modal first so it doesn't obstruct the confirmation dialog
    setEditNotebookModalOpen(false);

    showConfirm({
      title: `Delete Notebook: ${notebookName}`,
      message: `Are you absolutely sure you want to delete this notebook? All containing notes (${noteCount} notes) and their physical markdown files will be permanently deleted from your system. This action is irreversible.`,
      confirmLabel: 'Delete Permanently',
      cancelLabel: 'Keep Notebook',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteNotebook(notebookId);
        } catch (err: any) {
          console.error('Failed to delete notebook:', err);
        }
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  const isInbox = editingNotebook.id === 'inbox';

  return (
    <div className="settings-modal-overlay" style={{ zIndex: 3100 }} onClick={handleClose}>
      <div 
        className="settings-modal glass-panel" 
        style={{ 
          width: '450px', 
          padding: '24px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto'
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={handleClose}
        >
          <X size={16} />
        </button>

        <h3 className="settings-title" style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.1rem', fontWeight: 600 }}>
          Notebook Settings
        </h3>

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Notebook Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              className="settings-input"
              style={{
                width: '100%',
                borderRadius: '4px',
                padding: '8px 12px',
                fontSize: '0.9rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              placeholder="e.g. Brain Dump, Research, Side Project..."
              value={name}
              disabled={isInbox}
              onChange={(e) => setName(e.target.value)}
            />
            {isInbox && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Default Inbox name cannot be modified.
              </span>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Description <span style={{ color: 'var(--text-muted)', textTransform: 'none' }}>(Optional)</span>
            </label>
            <textarea
              className="settings-input"
              style={{
                width: '100%',
                height: '60px',
                borderRadius: '4px',
                padding: '8px 12px',
                fontSize: '0.9rem',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit'
              }}
              placeholder="Brief purpose of this notebook..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Select Icon
            </label>
            <div 
              className="modal-icon-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              {ICONS_GRID.map((item) => {
                const isSelected = selectedIcon === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    className={`modal-icon-btn ${isSelected ? 'active' : ''}`}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                    onClick={() => setSelectedIcon(item.name)}
                    title={item.label}
                  >
                    {item.icon}
                    <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notebook Pinning option - only show if it's not the default Inbox notebook */}
          {!isInbox && (
            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="pin-notebook-checkbox"
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: 'var(--text-primary)',
                  cursor: 'pointer',
                }}
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
              />
              <label 
                htmlFor="pin-notebook-checkbox"
                style={{ 
                  fontSize: '0.85rem', 
                  color: 'var(--text-primary)', 
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Pin notebook to top of sidebar
              </label>
            </div>
          )}

          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '0 0 16px 0', fontWeight: 500 }}>
              {error}
            </p>
          )}

          {/* Danger Zone */}
          {!isInbox && (
            <div style={{ 
              marginTop: '32px', 
              marginBottom: '24px', 
              padding: '16px', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              background: 'rgba(239, 68, 68, 0.05)', 
              borderRadius: '4px' 
            }}>
              <h4 style={{ 
                margin: '0 0 8px 0', 
                color: '#f87171', 
                fontSize: '0.85rem', 
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Trash2 size={14} /> Danger Zone
              </h4>
              <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                Deleting this notebook will permanently remove the database records and physical note markdown files on your disk.
              </p>
              <button
                type="button"
                className="btn-primary"
                style={{
                  background: 'var(--accent-red)',
                  borderColor: 'var(--accent-red)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  padding: '6px 12px',
                  fontWeight: 500
                }}
                onClick={handleDelete}
              >
                Delete Notebook
              </button>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <button 
              type="button"
              className="btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.8rem' }} 
              onClick={handleClose}
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="btn-primary" 
              style={{ 
                padding: '6px 16px', 
                fontSize: '0.8rem'
              }} 
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
