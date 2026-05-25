import { useEffect } from 'react';
import { useStore } from './stores/useStore';
import './App.css';

// Import extracted layout components
import { Titlebar } from './components/Titlebar';
import { MobileHeader } from './components/MobileHeader';
import { Sidebar } from './components/Sidebar';
import { NotesList } from './components/NotesList';
import { Editor } from './components/Editor';
import { SnowEffect } from './components/SnowEffect';

// Import overlay modals and utility dialog components
import { AIPanel } from './components/AIPanel';
import { CommandPalette } from './components/CommandPalette';
import { SettingsModal, BG_PRESETS } from './components/SettingsModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { PromptDialog } from './components/PromptDialog';
import { CreateNotebookModal } from './components/CreateNotebookModal';
import { EditNotebookModal } from './components/EditNotebookModal';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { SyncToast } from './components/SyncToast';
import { OnboardingModal } from './components/OnboardingModal';

export default function App() {
  const {
    loadNotebooks,
    selectNotebook,
    loadAllTags,
    checkKeyringStatus,
    bgImageUrl,
    bgOpacity,
    bgBlur,
    bgOverlayOpacity,
    panelOpacity,
    isGlassEnabled,
    theme,
    isGeminiPanelOpen,
    isFocusMode,
    isMobileSidebarOpen,
    isMobileNotesListOpen,
    setMobileSidebarOpen,
    setMobileNotesListOpen,
    
    // Cloud sync check on launch
    checkSyncStatus,
    triggerSync,
    syncInterval,
    isSyncConnected,
  } = useStore();

  // Sync keyring status and default notebooks on boot
  useEffect(() => {
    const bootApp = async () => {
      await checkKeyringStatus();
      await checkSyncStatus();
      await loadNotebooks();
      await loadAllTags();
      // Auto-select Inbox notebook
      await selectNotebook('inbox');
      // Trigger background sync silently if connected, only if sync is active and not manual
      if (useStore.getState().isSyncConnected && useStore.getState().syncInterval !== 'manual') {
        triggerSync();
      }
    };
    bootApp();
  }, [checkKeyringStatus, checkSyncStatus, loadNotebooks, loadAllTags, selectNotebook, triggerSync]);

  // Background Cloud Sync Scheduler
  useEffect(() => {
    if (!isSyncConnected || syncInterval === 'manual') {
      return;
    }

    const intervalMsMap: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
    };

    const delay = intervalMsMap[syncInterval] || 5 * 60 * 1000;

    const timerId = setInterval(() => {
      console.log(`[Scheduler] Auto-syncing workspace... (${syncInterval})`);
      triggerSync();
    }, delay);

    return () => clearInterval(timerId);
  }, [syncInterval, isSyncConnected, triggerSync]);

  // Synchronize CSS custom data-theme on boot or theme state changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Find the active background preset gradient for robust, premium offline fallback support
  const activePreset = BG_PRESETS.find(p => p.url === bgImageUrl);
  const fallbackGradient = activePreset && activePreset.preview !== 'custom' ? activePreset.preview : '';

  // Custom background and glass system is entirely disabled in Paper Mode for optimal eye comfort
  const showCustomBg = bgImageUrl && theme !== 'paper';
  const showGlass = isGlassEnabled && theme !== 'paper';

  return (
    <div
      className={`app-container${showCustomBg ? ' has-custom-bg' : ''}${showCustomBg && showGlass ? ' glass-enabled' : ''}`}
      style={{ '--panel-opacity': panelOpacity } as React.CSSProperties}
    >
      {/* Full-viewport Background Canvas Layer (behind all panels) */}
      {showCustomBg && (
        <div 
          className="app-bg-canvas-container"
          style={{ background: fallbackGradient || undefined }}
        >
          <img
            src={bgImageUrl}
            alt=""
            className="app-bg-canvas-image"
            style={{ opacity: bgOpacity, filter: `blur(${bgBlur}px)` }}
          />
          <div
            className="app-bg-canvas-overlay"
            style={{ opacity: bgOverlayOpacity }}
          />
        </div>
      )}

      {/* Ambient glowing snow effect layer */}
      <SnowEffect />

      {/* Custom Titlebar */}
      <Titlebar />

      {/* Mobile Top Navigation Header */}
      <MobileHeader />

      {/* Main Grid Workspace */}
      <div className={`workspace-grid ${isGeminiPanelOpen ? 'with-ai-panel' : ''} ${isFocusMode ? 'focus-mode' : ''}`}>
        {(isMobileSidebarOpen || isMobileNotesListOpen) && (
          <div
            className="mobile-drawer-backdrop visible"
            onClick={() => {
              setMobileSidebarOpen(false);
              setMobileNotesListOpen(false);
            }}
          />
        )}
        
        {/* PANEL 1: Sidebar Nav */}
        <Sidebar />

        {/* PANEL 2: Note Cards List */}
        <NotesList />

        {/* PANEL 3: Textarea Editor & Preview */}
        <Editor />

        {/* AI Assist Sidebar Panel */}
        <AIPanel />
      </div>

      {/* Overlay Dialogs & Command Palette HUD */}
      <CommandPalette />
      <SettingsModal />
      <OnboardingModal />
      <ConfirmDialog />
      <PromptDialog />
      <CreateNotebookModal />
      <EditNotebookModal />
      <ConflictResolutionModal />
      <SyncToast />
    </div>
  );
}
