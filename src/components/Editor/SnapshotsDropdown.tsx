import React from 'react';
import { History } from 'lucide-react';
import { Snapshot } from '../../stores/useStore';

interface SnapshotsDropdownProps {
  snapshots: Snapshot[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  onCreateSnapshot: () => void;
  onRestoreSnapshot: (snapId: string) => void;
}

export const SnapshotsDropdown: React.FC<SnapshotsDropdownProps> = ({
  snapshots,
  isOpen,
  setOpen,
  onCreateSnapshot,
  onRestoreSnapshot,
}) => {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span
        onClick={() => setOpen(!isOpen)}
        style={{ 
          cursor: 'pointer', 
          textDecoration: 'underline', 
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        <History size={12} /> Snapshots ({snapshots.length})
      </span>
      {isOpen && (
        <div className="glass-panel" style={{
          position: 'absolute',
          bottom: '24px',
          left: '0',
          width: '260px',
          maxHeight: '220px',
          overflowY: 'auto',
          padding: '10px',
          zIndex: 100,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: '8px', 
            borderBottom: '1px solid var(--border-color)', 
            paddingBottom: '4px' 
          }}>
            <strong style={{ fontSize: '0.75rem' }}>Delta History</strong>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span
                onClick={onCreateSnapshot}
                style={{ cursor: 'pointer', color: 'var(--cyan)', fontSize: '0.75rem', fontWeight: 600 }}
                title="Save local snapshot"
              >
                + Snap
              </span>
            </div>
          </div>
          {snapshots.length === 0 ? (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px' }}>No snapshots recorded.</div>
          ) : (
            snapshots.map((snap) => (
              <div
                key={snap.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.7rem',
                  padding: '5px 4px',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: 'pointer',
                }}
                onClick={() => onRestoreSnapshot(snap.id)}
              >
                <span style={{ 
                  color: 'var(--text-primary)', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  maxWidth: '140px' 
                }}>
                  {snap.label || 'Auto Snap'}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {snap.created_at.split('T')[1].split('.')[0]}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
