import React, { useState, useEffect } from 'react';
import { useStore } from '../../stores/useStore';
import { invoke } from '@tauri-apps/api/core';
import { Image, Link2, Check, ToggleLeft, ToggleRight, Cloud, RefreshCw, LogOut, AlertTriangle, Lock } from 'lucide-react';

// Premium curated background presets
export const BG_PRESETS = [
  {
    id: 'none',
    label: 'Default',
    url: '',
    preview: 'none',
  },
  {
    id: 'deep-space',
    label: 'Deep Space',
    url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1000&q=70&auto=format&fit=crop',
    preview: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1000&q=70&auto=format&fit=crop',
    preview: 'linear-gradient(135deg, #0d324d 0%, #7f5a83 100%)',
  },
  {
    id: 'soft-sunset',
    label: 'Soft Sunset',
    url: 'https://images.unsplash.com/photo-1520716082898-62df5aff5e8d?w=1000&q=70&auto=format&fit=crop',
    preview: 'linear-gradient(135deg, #f093fb 0%, #f5576c 50%, #fda085 100%)',
  },
  {
    id: 'ocean-mist',
    label: 'Ocean Mist',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1000&q=70&auto=format&fit=crop',
    preview: 'linear-gradient(135deg, #0f3057 0%, #00587a 50%, #008891 100%)',
  },
  {
    id: 'forest-rays',
    label: 'Forest Rays',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1000&q=70&auto=format&fit=crop',
    preview: 'linear-gradient(135deg, #1d4d1f 0%, #3a7d3c 50%, #a3be8c 100%)',
  },
  {
    id: 'amber-dream',
    label: 'Amber Dream',
    url: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1000&q=70&auto=format&fit=crop',
    preview: 'linear-gradient(135deg, #c79e47 0%, #d4783a 50%, #b5451b 100%)',
  },
  {
    id: 'custom',
    label: 'Custom URL',
    url: 'custom',
    preview: 'custom',
  },
];

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    isKeyringConfigured,
    checkKeyringStatus,
    showConfirm,
    theme,
    setTheme,
    bgImageUrl,
    bgOpacity,
    bgBlur,
    bgOverlayOpacity,
    panelOpacity,
    isGlassEnabled,
    isSnowEnabled,
    setBgImageUrl,
    setBgOpacity,
    setBgBlur,
    setBgOverlayOpacity,
    setPanelOpacity,
    setGlassEnabled,
    setSnowEnabled,
    
    // Sync states and actions
    isSyncConnected,
    syncEmail,
    syncStatus,
    syncError,
    lastSynced,
    connectSync,
    cancelSyncConnection,
    disconnectSync,
    triggerSync,
  } = useStore();

  const [apiKey, setApiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [customUrl, setCustomUrl] = useState('');
  const [activePresetId, setActivePresetId] = useState<string>('none');
  const [activeTab, setActiveTab] = useState<'general' | 'sync'>('general');

  // Reset tab on open
  useEffect(() => {
    if (isSettingsOpen) {
      setActiveTab('general');
    }
  }, [isSettingsOpen]);

  // Derive active preset on open
  useEffect(() => {
    if (isSettingsOpen) {
      checkKeyringStatus();
      setApiKey('');
      setSaveStatus('idle');

      // Determine which preset is active
      if (!bgImageUrl) {
        setActivePresetId('none');
        setCustomUrl('');
      } else {
        const matchedPreset = BG_PRESETS.find(p => p.url === bgImageUrl && p.id !== 'custom');
        if (matchedPreset) {
          setActivePresetId(matchedPreset.id);
          setCustomUrl('');
        } else {
          setActivePresetId('custom');
          setCustomUrl(bgImageUrl);
        }
      }
    }
  }, [isSettingsOpen, checkKeyringStatus, bgImageUrl]);

  if (!isSettingsOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    try {
      if (apiKey.trim()) {
        await invoke('set_gemini_api_key', { key: apiKey });
      }
      await checkKeyringStatus();
      setSaveStatus('saved');
      setApiKey('');
      setTimeout(() => {
        setSettingsOpen(false);
      }, 800);
    } catch (err) {
      console.error(err);
      setSaveStatus('error');
    }
  };

  const handleDeleteKey = () => {
    showConfirm({
      title: 'Delete API Key',
      message: 'Are you sure you want to delete your Gemini API Key from the Windows Credential Manager? This cannot be undone.',
      confirmLabel: 'Delete Key',
      cancelLabel: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await invoke('delete_gemini_api_key');
          await checkKeyringStatus();
        } catch (err) {
          console.error(err);
        }
      }
    });
  };

  const handlePresetSelect = (preset: typeof BG_PRESETS[0]) => {
    setActivePresetId(preset.id);
    if (preset.id === 'none') {
      setBgImageUrl('');
      setCustomUrl('');
    } else if (preset.id !== 'custom') {
      setBgImageUrl(preset.url);
      setCustomUrl('');
    }
    // For custom, we wait for user to confirm the URL
  };

  const handleCustomUrlApply = () => {
    const trimmed = customUrl.trim();
    if (trimmed) {
      setBgImageUrl(trimmed);
    }
  };

  const hasBackground = !!bgImageUrl;

  return (
    <div className="settings-modal-overlay" onClick={() => setSettingsOpen(false)}>
      <div className="settings-modal settings-modal-wide glass-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="settings-title">Settings</h2>

        <div className="settings-tabs">
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General &amp; Appearance
          </button>
          <button
            type="button"
            className={`settings-tab-btn ${activeTab === 'sync' ? 'active' : ''}`}
            onClick={() => setActiveTab('sync')}
          >
            Cloud Sync
          </button>
        </div>

        {activeTab === 'general' ? (
          <form onSubmit={handleSave}>
          {/* === API Key === */}
          <div className="settings-input-group">
            <label className="settings-label">Gemini API Key</label>
            <input
              type="password"
              className="settings-input"
              placeholder={isKeyringConfigured ? '•••••••••••••••• (API Key Configured)' : 'Enter your Gemini API key...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {isKeyringConfigured ? (
                <span>
                  Key is saved securely in Windows Credential Manager.{' '}
                  <span
                    onClick={handleDeleteKey}
                    style={{ color: '#ef4444', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Delete Key
                  </span>
                </span>
              ) : (
                'Key will be stored in your system secure keyring.'
              )}
            </p>
          </div>

          {/* === Theme === */}
          <div className="settings-input-group">
            <label className="settings-label">Theme</label>
            <div className="theme-toggle-group">
              <button
                type="button"
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                Dark Theme
              </button>
              <button
                type="button"
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => setTheme('light')}
              >
                Light Theme
              </button>
            </div>
          </div>

          {/* === Ambient Snowfall === */}
          <div className="settings-input-group settings-bg-controls" style={{ padding: '12px 16px', background: 'var(--bg-void)', marginBottom: '20px' }}>
            <div className="settings-toggle-row" style={{ border: 'none', padding: 0, margin: 0 }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>Ambient Snowfall</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Slow-moving, subtle glowing ambient snow particles</div>
              </div>
              <button
                type="button"
                className="glass-toggle-btn"
                onClick={() => setSnowEnabled(!isSnowEnabled)}
                aria-label="Toggle snow effect"
              >
                {isSnowEnabled
                  ? <ToggleRight size={28} style={{ color: 'var(--cyan)' }} />
                  : <ToggleLeft size={28} style={{ color: 'var(--text-muted)' }} />
                }
              </button>
            </div>
          </div>

          {/* === Workspace Background === */}
          <div className="settings-input-group">
            <label className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Image size={13} style={{ opacity: 0.6 }} />
              Workspace Background
            </label>

            {/* Preset Grid */}
            <div className="bg-presets-grid">
              {BG_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`bg-preset-card ${activePresetId === preset.id ? 'active' : ''}`}
                  onClick={() => handlePresetSelect(preset)}
                  title={preset.label}
                >
                  <div
                    className="bg-preset-thumb"
                    style={{
                      background: preset.preview === 'none'
                        ? 'var(--bg-void)'
                        : preset.preview === 'custom'
                          ? 'repeating-linear-gradient(45deg, var(--bg-card) 0px, var(--bg-card) 4px, var(--bg-void) 4px, var(--bg-void) 8px)'
                          : preset.preview,
                    }}
                  >
                    {preset.id === 'none' && (
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'inherit', textAlign: 'center', lineHeight: 1.3 }}>Default</span>
                    )}
                    {preset.id === 'custom' && (
                      <Link2 size={13} style={{ color: 'var(--text-muted)' }} />
                    )}
                    {activePresetId === preset.id && preset.id !== 'none' && preset.id !== 'custom' && (
                      <div className="bg-preset-check">
                        <Check size={10} />
                      </div>
                    )}
                    {activePresetId === preset.id && (preset.id === 'none' || preset.id === 'custom') && (
                      <div className="bg-preset-check">
                        <Check size={10} />
                      </div>
                    )}
                  </div>
                  <span className="bg-preset-label">{preset.label}</span>
                </button>
              ))}
            </div>

            {/* Custom URL input */}
            {activePresetId === 'custom' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                  type="url"
                  className="settings-input"
                  placeholder="https://images.unsplash.com/..."
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  style={{ flex: 1, fontSize: '0.8rem' }}
                />
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '6px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  onClick={handleCustomUrlApply}
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* === Background Controls (visible only when a background is set) === */}
          {hasBackground && (
            <div className="settings-input-group settings-bg-controls">
              {/* Glass Panels Toggle */}
              <div className="settings-toggle-row">
                <div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>Acrylic Glass Panels</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Translucent frosted-glass effect on panels</div>
                </div>
                <button
                  type="button"
                  className="glass-toggle-btn"
                  onClick={() => setGlassEnabled(!isGlassEnabled)}
                  aria-label="Toggle glass panels"
                >
                  {isGlassEnabled
                    ? <ToggleRight size={28} style={{ color: 'var(--cyan)' }} />
                    : <ToggleLeft size={28} style={{ color: 'var(--text-muted)' }} />
                  }
                </button>
              </div>

              {/* Panel Opacity Slider — always visible in controls, not gated on glass */}
              <div className="settings-slider-group">
                <div className="settings-slider-header">
                  <label className="settings-slider-label">Panel Opacity</label>
                  <span className="settings-slider-value">{Math.round(panelOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="settings-range"
                  min="0" max="1" step="0.01"
                  value={panelOpacity}
                  onChange={(e) => setPanelOpacity(parseFloat(e.target.value))}
                />
                <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Controls sidebar &amp; editor panel transparency
                </p>
              </div>

              {/* Image Opacity Slider */}
              <div className="settings-slider-group">
                <div className="settings-slider-header">
                  <label className="settings-slider-label">Image Opacity</label>
                  <span className="settings-slider-value">{Math.round(bgOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="settings-range"
                  min="0" max="1" step="0.01"
                  value={bgOpacity}
                  onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                />
              </div>

              {/* Blur Slider */}
              <div className="settings-slider-group">
                <div className="settings-slider-header">
                  <label className="settings-slider-label">Background Blur</label>
                  <span className="settings-slider-value">{Math.round(bgBlur)}px</span>
                </div>
                <input
                  type="range"
                  className="settings-range"
                  min="0" max="40" step="1"
                  value={bgBlur}
                  onChange={(e) => setBgBlur(parseFloat(e.target.value))}
                />
              </div>

              {/* Contrast Overlay Slider */}
              <div className="settings-slider-group">
                <div className="settings-slider-header">
                  <label className="settings-slider-label">Contrast Overlay</label>
                  <span className="settings-slider-value">{Math.round(bgOverlayOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="settings-range"
                  min="0" max="0.9" step="0.01"
                  value={bgOverlayOpacity}
                  onChange={(e) => setBgOverlayOpacity(parseFloat(e.target.value))}
                />
                <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Increases a {theme === 'light' ? 'white' : 'dark'} tint to improve text contrast
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSettingsOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'saved'
                  ? 'Saved!'
                  : saveStatus === 'error'
                    ? 'Error!'
                    : 'Save Changes'}
            </button>
          </div>
        </form>
      ) : (
        /* === Cloud Sync Panel (activeTab === 'sync') === */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!isSyncConnected ? (
            /* Disconnected View */
            <div className="sync-connect-container">
              <svg className="sync-google-logo" viewBox="0 0 1256 1111" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M418.667 0L0 725.333L209.333 1088L628 362.667L418.667 0Z" fill="#0066DA"/>
                <path d="M837.333 0L418.667 0L628 362.667L1046.67 362.667L837.333 0Z" fill="#00A25B"/>
                <path d="M628 725.333L418.667 1088L1256 1088L1046.67 725.333L628 725.333Z" fill="#FFC107"/>
                <path d="M628 362.667L209.333 1088L418.667 1088L837.333 362.667L628 362.667Z" fill="#E94235"/>
              </svg>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 600 }}>Google Drive Document Sync</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '440px', lineHeight: 1.4 }}>
                Securely backup your workspace notes to your personal Google Drive. Sync in real-time and access your documents across multiple desktop and mobile devices.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '340px' }}>
                <button
                  type="button"
                  className="sync-connect-btn"
                  onClick={() => connectSync()}
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={syncStatus === 'syncing'}
                >
                  {syncStatus === 'syncing' ? (
                    <>
                      <RefreshCw size={15} className="spin-slow" />
                      &nbsp;Connecting in Browser...
                    </>
                  ) : (
                    <>
                      <Cloud size={15} />
                      &nbsp;Connect Google Drive
                    </>
                  )}
                </button>

                {syncError && syncStatus !== 'syncing' && (
                  <div className="sync-error-card" style={{
                    marginTop: '8px',
                    padding: '12px 16px',
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: '8px',
                    color: '#f87171',
                    fontSize: '0.78rem',
                    textAlign: 'left',
                    width: '100%',
                    boxSizing: 'border-box',
                    lineHeight: '1.4',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                      <AlertTriangle size={15} style={{ color: '#f87171', flexShrink: 0 }} />
                      <span>Google Drive Connection Failed</span>
                    </div>
                    <div style={{
                      maxHeight: '100px',
                      overflowY: 'auto',
                      background: 'rgba(0, 0, 0, 0.3)',
                      padding: '8px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '0.72rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      color: '#fecaca'
                    }}>
                      {syncError}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <strong>Tip:</strong> See the detailed dynamic socket logs and server traces in:
                      <br />
                      <code style={{
                        display: 'block',
                        marginTop: '4px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        color: 'var(--text-primary)',
                        userSelect: 'all'
                      }}>
                        %LOCALAPPDATA%\com.keel.app\keel_sync_debug.log
                      </code>
                    </p>
                  </div>
                )}

                {syncStatus === 'syncing' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={cancelSyncConnection}
                      style={{ width: '100%', padding: '8px', fontSize: '0.85rem' }}
                    >
                      Cancel Connection Flow
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Connected Card View */
            <div className="sync-card">
              <div className="sync-account-info">
                <div className="sync-avatar">
                  {syncEmail ? syncEmail[0].toUpperCase() : 'U'}
                </div>
                <div className="sync-user-details">
                  <div className="sync-user-name">
                    Google Account
                    <span className="sync-badge-connected">Connected</span>
                  </div>
                  <div className="sync-user-email">{syncEmail}</div>
                </div>
                <button
                  type="button"
                  onClick={disconnectSync}
                  style={{ background: 'none', border: 'none', color: '#ef4444', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', borderRadius: '4px' }}
                  title="Disconnect account"
                >
                  <LogOut size={14} />
                  Disconnect
                </button>
              </div>

              {/* Storage usage */}
              <div className="sync-storage-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--border-radius-sm)',
                    background: theme === 'light' ? 'rgba(0, 119, 182, 0.1)' : 'rgba(0, 229, 255, 0.1)',
                    color: 'var(--cyan)',
                    flexShrink: 0
                  }}>
                    <Cloud size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      Storage Used by Keel Docs
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '1px' }}>
                      1.2 MB
                    </div>
                  </div>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Your documents are securely isolated and synced in your private Google Drive AppData folder.
                </p>
              </div>


              {/* Metadata Grid */}
              <div className="sync-meta-grid">
                <div className="sync-meta-item">
                  <span className="sync-meta-label">Last Successful Sync</span>
                  <span className="sync-meta-value">{lastSynced || 'Never'}</span>
                </div>
                <div className="sync-meta-item">
                  <span className="sync-meta-label">Sync Mode</span>
                  <span className="sync-meta-value" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={12} style={{ color: '#10b981' }} />
                    Bidirectional PKCE
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="sync-card-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => triggerSync(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
                  disabled={syncStatus === 'syncing'}
                >
                  <RefreshCw size={14} className={syncStatus === 'syncing' ? 'spin-slow' : ''} />
                  {syncStatus === 'syncing' ? 'Syncing...' : 'Force Sync Now'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setSettingsOpen(false)}
              style={{ padding: '8px 24px' }}
            >
              Close Settings
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
