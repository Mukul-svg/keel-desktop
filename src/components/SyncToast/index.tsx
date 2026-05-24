import React, { useEffect, useState } from 'react';
import { useStore } from '../../stores/useStore';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export const SyncToast: React.FC = () => {
  const { syncToast, setSyncToast } = useStore();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (syncToast) {
      setIsVisible(true);

      // Auto-dismiss after 4 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        // Clear store toast after slide-out animation completes
        setTimeout(() => {
          setSyncToast(null);
        }, 300);
      }, 4000);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [syncToast, setSyncToast]);

  if (!syncToast) return null;

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      setSyncToast(null);
    }, 300);
  };

  const getIcon = () => {
    switch (syncToast.type) {
      case 'success':
        return <CheckCircle size={16} />;
      case 'warning':
        return <AlertTriangle size={16} />;
      case 'error':
        return <AlertCircle size={16} />;
      default:
        return <Info size={16} />;
    }
  };

  return (
    <div className="sync-toast-container">
      <div className={`sync-toast sync-toast-${syncToast.type} ${isVisible ? 'show' : ''}`}>
        <div className="sync-toast-icon">
          {getIcon()}
        </div>
        <div className="sync-toast-content">
          {syncToast.message}
        </div>
        <button className="sync-toast-close" onClick={handleClose} aria-label="Close notification">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
