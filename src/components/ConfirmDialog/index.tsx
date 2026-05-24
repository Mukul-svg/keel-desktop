import React from 'react';
import { useStore } from '../../stores/useStore';
import { AlertTriangle } from 'lucide-react';

export const ConfirmDialog: React.FC = () => {
  const { confirmDialog, hideConfirm } = useStore();

  if (!confirmDialog || !confirmDialog.isOpen) return null;

  const handleConfirm = async () => {
    try {
      await confirmDialog.onConfirm();
    } catch (e) {
      console.error('Action failed:', e);
    } finally {
      hideConfirm();
    }
  };

  return (
    <div className="settings-modal-overlay" style={{ zIndex: 3500 }} onClick={hideConfirm}>
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
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          {confirmDialog.isDestructive && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              borderRadius: '50%', 
              padding: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#ef4444'
            }}>
              <AlertTriangle size={20} />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <h3 className="settings-title" style={{ marginTop: 0, marginBottom: '8px', fontSize: '1.05rem', fontWeight: 600 }}>
              {confirmDialog.title}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              {confirmDialog.message}
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {confirmDialog.cancelLabel && (
            <button 
              className="btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--bg-void)', borderColor: 'var(--border-color)' }} 
              onClick={hideConfirm}
            >
              {confirmDialog.cancelLabel}
            </button>
          )}
          <button 
            className="btn-primary" 
            style={{ 
              padding: '6px 16px', 
              fontSize: '0.8rem',
              background: confirmDialog.isDestructive ? 'var(--accent-red)' : 'var(--text-primary)',
              borderColor: confirmDialog.isDestructive ? 'var(--accent-red)' : 'var(--text-primary)',
              color: confirmDialog.isDestructive ? '#ffffff' : 'var(--bg-panel)',
              fontWeight: 500
            }} 
            onClick={handleConfirm}
          >
            {confirmDialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
