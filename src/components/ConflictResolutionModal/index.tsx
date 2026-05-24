import React from 'react';
import { useStore } from '../../stores/useStore';
import { AlertTriangle, Check, Cloud, Sparkles, X } from 'lucide-react';

export const ConflictResolutionModal: React.FC = () => {
  const {
    isConflictModalOpen,
    conflictData,
    resolveConflict,
    closeConflictModal,
  } = useStore();

  if (!isConflictModalOpen || !conflictData) return null;

  const { noteTitle, localContent, remoteContent } = conflictData;

  // Split contents by lines to show a beautiful simulated diff layout
  const localLines = localContent.split('\n');
  const remoteLines = remoteContent.split('\n');

  // Simple diff renderer to detect simulated cloud conflict lines and highlight them
  const renderRemoteLine = (line: string, index: number) => {
    // If the line is part of the simulated conflict text added at the end
    const isConflictLine = 
      line.includes('Conflict Edit') || 
      line.includes('simultaneous edit') || 
      line.includes('Device B') ||
      index >= localLines.length;

    if (isConflictLine && line.trim()) {
      return (
        <div key={index} className="conflict-diff-highlight conflict-mark">
          {line || ' '}
        </div>
      );
    }

    return <div key={index}>{line || ' '}</div>;
  };

  return (
    <div className="conflict-overlay" onClick={closeConflictModal}>
      <div className="conflict-modal glass-panel" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="conflict-modal-header">
          <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
          <div>
            <h3>Sync Conflict Detected</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Note: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{noteTitle}</span> was modified on another device.
            </p>
          </div>
          <button 
            onClick={closeConflictModal}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Diff Columns */}
        <div className="conflict-modal-body">
          {/* Local Pane */}
          <div className="conflict-pane">
            <div className="conflict-pane-title local">
              <span>Local Copy (This Device)</span>
              <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>Active Edit</span>
            </div>
            <div className="conflict-pane-content">
              {localLines.map((line, idx) => (
                <div key={idx}>{line || ' '}</div>
              ))}
            </div>
          </div>

          {/* Cloud Pane */}
          <div className="conflict-pane">
            <div className="conflict-pane-title remote">
              <span>Cloud Copy (Google Drive)</span>
              <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>Modified on Device B</span>
            </div>
            <div className="conflict-pane-content">
              {remoteLines.map((line, idx) => renderRemoteLine(line, idx))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="conflict-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => resolveConflict('local')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Check size={14} style={{ color: 'var(--cyan)' }} />
            Keep Local Version
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => resolveConflict('remote')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            <Cloud size={14} style={{ color: '#f59e0b' }} />
            Keep Google Drive Version
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => resolveConflict('merge')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', background: 'linear-gradient(135deg, var(--cyan) 0%, #4285F4 100%)' }}
          >
            <Sparkles size={14} />
            Merge Both Versions
          </button>
        </div>

      </div>
    </div>
  );
};
