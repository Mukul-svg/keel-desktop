import React from 'react';

interface EmptyStateProps {
  hasNotes: boolean;
  onCreateNote: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ hasNotes, onCreateNote }) => {
  return (
    <div className="empty-state-container">
      <img 
        src="/logo.png" 
        alt="Keel Logo" 
        className="brand-logo" 
        style={{ height: '48px', width: 'auto', objectFit: 'contain', marginBottom: '16px' }} 
      />
      <h2 className="empty-state-title">Keel</h2>
      <p className="empty-state-subtitle">
        {hasNotes 
          ? "Select a note from the sidebar to start writing, or create a new one." 
          : "Write Beautifully, Think Deeply."}
      </p>
      
      <div className="shortcut-grid">
        <div>New Note</div>
        <div><kbd className="kbd-shortcut">Ctrl + N</kbd></div>
        
        <div>HUD Palette</div>
        <div><kbd className="kbd-shortcut">Ctrl + K</kbd></div>
        
        <div>Toggle Preview</div>
        <div><kbd className="kbd-shortcut">Ctrl + P</kbd></div>
        
        <div>Gemini AI</div>
        <div><kbd className="kbd-shortcut">Ctrl + J</kbd></div>
      </div>

      <button
        className="btn-primary"
        onClick={onCreateNote}
        style={{ marginTop: '32px' }}
      >
        {hasNotes ? "Create Note" : "Create First Note"}
      </button>
    </div>
  );
};
