import React, { useState, useEffect } from 'react';
import { useStore } from '../../stores/useStore';
import { invoke } from '@tauri-apps/api/core';
import { Cloud, Laptop, CheckCircle, AlertTriangle, ArrowRight, RefreshCw, RefreshCw as MergeIcon } from 'lucide-react';

export const OnboardingModal: React.FC = () => {
  const {
    isSyncConnected,
    syncStatus,
    syncError,
    connectSync,
    triggerSync,
    cancelSyncConnection,
  } = useStore();

  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<boolean>(true);
  const [step, setStep] = useState<'welcome' | 'checking' | 'conflicts' | 'success'>('welcome');
  const [diffInfo, setDiffInfo] = useState<{
    local_count: number;
    remote_count: number;
    remote_only: boolean;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    const completed = localStorage.getItem('isOnboardingCompleted') === 'true';
    setIsOnboardingCompleted(completed);
    if (!completed) {
      setStep('welcome');
    }
  }, []);

  // Listen to connection changes to automatically run difference check
  useEffect(() => {
    if (!isOnboardingCompleted && isSyncConnected && step === 'welcome') {
      runCollisionCheck();
    }
  }, [isSyncConnected, isOnboardingCompleted, step]);

  const runCollisionCheck = async () => {
    setStep('checking');
    try {
      // Small artificial delay to feel premium and stable
      await new Promise((resolve) => setTimeout(resolve, 800));
      const res: any = await invoke('check_sync_differences');
      
      if (res.has_differences) {
        setDiffInfo({
          local_count: res.local_count,
          remote_count: res.remote_count,
          remote_only: res.remote_only,
        });
        setStep('conflicts');
      } else {
        // No conflicts or clean remote pull: proceed with normal sync
        await triggerSync(true);
        handleOnboardingSuccess();
      }
    } catch (err) {
      console.error('Failed to run onboarding collision check:', err);
      // Fallback: Trigger standard sync and succeed
      await triggerSync(true);
      handleOnboardingSuccess();
    }
  };

  const handleLocalSetup = () => {
    localStorage.setItem('isOnboardingCompleted', 'true');
    setIsOnboardingCompleted(true);
  };

  const handleOnboardingSuccess = () => {
    setStep('success');
    setTimeout(() => {
      localStorage.setItem('isOnboardingCompleted', 'true');
      setIsOnboardingCompleted(true);
    }, 1800);
  };

  const handleOverwriteCloud = async () => {
    setActionLoading(true);
    try {
      await invoke('force_overwrite_cloud');
      await triggerSync(true);
      handleOnboardingSuccess();
    } catch (err) {
      console.error(err);
      alert('Failed to force overwrite cloud. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOverwriteLocal = async () => {
    setActionLoading(true);
    try {
      await invoke('force_overwrite_local');
      await triggerSync(true);
      handleOnboardingSuccess();
    } catch (err) {
      console.error(err);
      alert('Failed to force overwrite local files. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMergeConflicts = async () => {
    setActionLoading(true);
    try {
      await triggerSync(true);
      handleOnboardingSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  if (isOnboardingCompleted) return null;

  return (
    <div className="settings-modal-overlay onboarding-overlay">
      <div className="settings-modal onboarding-modal glass-panel">
        
        {step === 'welcome' && (
          <div className="onboarding-step-content animate-fade-in">
            <div className="onboarding-header">
              <img src="/logo.png" alt="Keel" className="onboarding-logo" />
              <h1 className="onboarding-title">Welcome to Keel</h1>
              <p className="onboarding-subtitle">Your local-first, privacy-focused desktop workspace. Choose how you'd like to configure your documents.</p>
            </div>

            <div className="onboarding-cards">
              {/* Option 1: Cloud Sync */}
              <div className="onboarding-card glass-panel-nested hover-scale" onClick={() => connectSync()}>
                <div className="onboarding-card-icon cloud">
                  <Cloud size={24} />
                </div>
                <div className="onboarding-card-details">
                  <h3 className="onboarding-card-title">Google Drive Sync (Recommended)</h3>
                  <p className="onboarding-card-desc">Automatically synchronize and back up notes to your personal Google Drive AppData folder. Securely access from any device.</p>
                </div>
                <ArrowRight size={18} className="onboarding-arrow" />
              </div>

              {/* Option 2: Local Mode */}
              <div className="onboarding-card glass-panel-nested hover-scale" onClick={handleLocalSetup}>
                <div className="onboarding-card-icon local">
                  <Laptop size={24} />
                </div>
                <div className="onboarding-card-details">
                  <h3 className="onboarding-card-title">Offline Local Workspace</h3>
                  <p className="onboarding-card-desc">Keep your documents entirely on this device. Absolute privacy with zero network connectivity or credentials required.</p>
                </div>
                <ArrowRight size={18} className="onboarding-arrow" />
              </div>
            </div>

            {syncStatus === 'syncing' && (
              <div className="onboarding-spinner-container">
                <RefreshCw size={16} className="spin-slow text-cyan" />
                <span>Waiting for browser authorization...</span>
                <button type="button" className="btn-secondary compact" onClick={cancelSyncConnection} style={{ marginLeft: '12px' }}>
                  Cancel
                </button>
              </div>
            )}

            {syncError && syncStatus !== 'syncing' && (
              <div className="sync-error-card onboarding-error">
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <strong>Connection Failed:</strong> {syncError}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'checking' && (
          <div className="onboarding-step-content checking animate-fade-in" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <RefreshCw size={48} className="spin-slow text-cyan" style={{ marginBottom: '20px' }} />
            <h2 className="onboarding-title">Verifying Workspace Revisions</h2>
            <p className="onboarding-subtitle">Analyzing and comparing your local SQLite workspace database with remote files inside Google Drive AppData...</p>
          </div>
        )}

        {step === 'conflicts' && (
          <div className="onboarding-step-content animate-fade-in">
            <div className="onboarding-header">
              <div className="onboarding-alert-icon">
                <AlertTriangle size={32} />
              </div>
              <h1 className="onboarding-title" style={{ marginTop: '12px' }}>Sync Collision Detected</h1>
              <p className="onboarding-subtitle">
                We found existing note databases in both your local storage ({diffInfo?.local_count} notes) and Google Drive ({diffInfo?.remote_count} notes). How would you like to handle this?
              </p>
            </div>

            <div className="onboarding-cards conflict-options">
              {/* Option 1: Overwrite Cloud */}
              <button 
                type="button" 
                className="onboarding-card glass-panel-nested hover-scale text-left" 
                onClick={handleOverwriteCloud}
                disabled={actionLoading}
                style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}
              >
                <div className="onboarding-card-icon local">
                  <Laptop size={20} />
                </div>
                <div className="onboarding-card-details">
                  <h3 className="onboarding-card-title text-primary">Overwrite Cloud with Local Notes</h3>
                  <p className="onboarding-card-desc text-muted">Use this device's notes as the source of truth. Google Drive notes will be discarded and replaced with local copies.</p>
                </div>
                {actionLoading ? <RefreshCw size={16} className="spin-slow" /> : <ArrowRight size={18} className="onboarding-arrow" />}
              </button>

              {/* Option 2: Overwrite Local */}
              <button 
                type="button" 
                className="onboarding-card glass-panel-nested hover-scale text-left" 
                onClick={handleOverwriteLocal}
                disabled={actionLoading}
                style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}
              >
                <div className="onboarding-card-icon cloud">
                  <Cloud size={20} />
                </div>
                <div className="onboarding-card-details">
                  <h3 className="onboarding-card-title text-primary">Overwrite Local Workspace with Cloud</h3>
                  <p className="onboarding-card-desc text-muted">Discard any local notes on this computer and pull all notes stored inside your Google Drive account instead.</p>
                </div>
                {actionLoading ? <RefreshCw size={16} className="spin-slow" /> : <ArrowRight size={18} className="onboarding-arrow" />}
              </button>

              {/* Option 3: Keep Both */}
              <button 
                type="button" 
                className="onboarding-card glass-panel-nested hover-scale text-left" 
                onClick={handleMergeConflicts}
                disabled={actionLoading}
                style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}
              >
                <div className="onboarding-card-icon merge">
                  <MergeIcon size={20} style={{ color: 'var(--amber)' }} />
                </div>
                <div className="onboarding-card-details">
                  <h3 className="onboarding-card-title text-primary">Keep Both &amp; Merge Conflicts</h3>
                  <p className="onboarding-card-desc text-muted">Run standard bi-directional synchronization. All unique notes will be integrated, and any overlapping file collisions will create sidecar notes.</p>
                </div>
                {actionLoading ? <RefreshCw size={16} className="spin-slow" /> : <ArrowRight size={18} className="onboarding-arrow" />}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="onboarding-step-content success animate-fade-in" style={{ textAlign: 'center', padding: '50px 20px' }}>
            <CheckCircle size={64} className="text-cyan animate-pulse" style={{ marginBottom: '24px', color: 'var(--cyan)' }} />
            <h1 className="onboarding-title">Workspace Unlocked!</h1>
            <p className="onboarding-subtitle">Your Keel workspace environment has been successfully configured. Entering the app...</p>
          </div>
        )}

      </div>
    </div>
  );
};
