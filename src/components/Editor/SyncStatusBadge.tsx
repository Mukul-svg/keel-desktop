import React from 'react';
import { CloudOff, RefreshCw, CloudLightning, AlertTriangle } from 'lucide-react';

interface SyncStatusBadgeProps {
  isSyncConnected: boolean;
  syncStatus: string;
  onBadgeClick: () => void;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  isSyncConnected,
  syncStatus,
  onBadgeClick,
}) => {
  const getTitle = () => {
    if (!isSyncConnected) return "Cloud Sync Offline - Click to connect";
    if (syncStatus === 'syncing') return "Syncing with Google Drive...";
    if (syncStatus === 'synced') return "All notes synced - Click to sync now";
    return "Sync conflict detected! Click to resolve.";
  };

  return (
    <div 
      className={`sync-status-badge ${!isSyncConnected ? 'disconnected' : syncStatus}`}
      onClick={onBadgeClick}
      title={getTitle()}
    >
      {!isSyncConnected ? (
        <>
          <CloudOff size={13} />
          <span>Offline</span>
        </>
      ) : syncStatus === 'syncing' ? (
        <>
          <RefreshCw size={13} className="spin-slow" />
          <span>Syncing...</span>
        </>
      ) : syncStatus === 'synced' ? (
        <>
          <CloudLightning size={13} style={{ color: '#10b981' }} />
          <span>Synced</span>
        </>
      ) : (
        <>
          <AlertTriangle size={13} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 600 }}>Conflict!</span>
        </>
      )}
    </div>
  );
};
