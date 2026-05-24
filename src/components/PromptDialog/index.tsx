import React, { useEffect, useState, useRef } from 'react';
import { useStore } from '../../stores/useStore';

export const PromptDialog: React.FC = () => {
  const { promptDialog, hidePrompt } = useStore();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (promptDialog?.isOpen) {
      setInputValue(promptDialog.defaultValue || '');
      // Auto-focus input
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [promptDialog]);

  if (!promptDialog || !promptDialog.isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      await promptDialog.onSubmit(inputValue);
    } catch (err) {
      console.error('Prompt action failed:', err);
    } finally {
      hidePrompt();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hidePrompt();
    }
  };

  return (
    <div className="settings-modal-overlay" style={{ zIndex: 3100 }} onClick={hidePrompt}>
      <div 
        className="settings-modal glass-panel" 
        style={{ 
          width: '400px', 
          padding: '24px', 
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)'
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="settings-title" style={{ marginTop: 0, marginBottom: '8px', fontSize: '1.05rem', fontWeight: 600 }}>
          {promptDialog.title}
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 16px 0' }}>
          {promptDialog.message}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            style={{
              width: '100%',
              marginBottom: '20px',
              background: 'var(--bg-void)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
            placeholder={promptDialog.placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button 
              type="button"
              className="btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--bg-void)', borderColor: 'var(--border-color)' }} 
              onClick={hidePrompt}
            >
              {promptDialog.cancelLabel}
            </button>
            <button 
              type="submit"
              className="btn-primary" 
              style={{ 
                padding: '6px 16px', 
                fontSize: '0.8rem',
                background: 'var(--text-primary)',
                borderColor: 'var(--text-primary)',
                color: 'var(--bg-panel)',
                fontWeight: 500
              }} 
            >
              {promptDialog.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
