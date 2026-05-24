import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../../stores/useStore';
import { 
  Inbox, Folder, Book, Archive, Code, Sparkles, Globe, Heart, Lock, X
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

export const CreateNotebookModal: React.FC = () => {
  const { 
    isCreateNotebookModalOpen, 
    setCreateNotebookModalOpen, 
    createNotebook,
    selectNotebook
  } = useStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('folder');
  const [error, setError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreateNotebookModalOpen) {
      setName('');
      setDescription('');
      setSelectedIcon('folder');
      setError('');
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isCreateNotebookModalOpen]);

  if (!isCreateNotebookModalOpen) return null;

  const handleClose = () => {
    setCreateNotebookModalOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Notebook name is required');
      return;
    }
    setError('');

    try {
      const newBook = await createNotebook(name.trim(), selectedIcon, description.trim());
      setCreateNotebookModalOpen(false);
      await selectNotebook(newBook.id);
    } catch (err: any) {
      console.error(err);
      setError(err?.toString() || 'Failed to create notebook');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  return (
    <div className="settings-modal-overlay" style={{ zIndex: 3100 }} onClick={handleClose}>
      <div 
        className="settings-modal glass-panel" 
        style={{ 
          width: '450px', 
          padding: '24px',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          position: 'relative'
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
          Create Notebook
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
              onChange={(e) => setName(e.target.value)}
            />
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

          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: '0 0 16px 0', fontWeight: 500 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
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
              Create Notebook
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
