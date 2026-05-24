import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { KeelStore } from '../types';

export interface SyncSlice {
  isKeyringConfigured: boolean;
  isSyncConnected: boolean;
  syncEmail: string | null;
  syncStatus: 'disconnected' | 'syncing' | 'synced' | 'conflict';
  lastSynced: string | null;
  isConflictModalOpen: boolean;
  conflictData: { localContent: string; remoteContent: string; noteTitle: string } | null;
  syncToast: { message: string; type: 'success' | 'info' | 'error' | 'warning' } | null;
  syncError: string | null;

  checkKeyringStatus: () => Promise<void>;
  connectSync: (email?: string) => Promise<void>;
  cancelSyncConnection: () => void;
  disconnectSync: () => Promise<void>;
  triggerSync: () => Promise<void>;
  resolveConflict: (resolution: 'local' | 'remote' | 'merge') => Promise<void>;
  closeConflictModal: () => void;
  setSyncToast: (toast: { message: string; type: 'success' | 'info' | 'error' | 'warning' } | null) => void;
  checkSyncStatus: () => Promise<void>;
}

export const createSyncSlice: StateCreator<
  KeelStore,
  [],
  [],
  SyncSlice
> = (set, get) => ({
  isKeyringConfigured: false,
  isSyncConnected: localStorage.getItem('isSyncConnected') === 'true',
  syncEmail: localStorage.getItem('syncEmail') || null,
  syncStatus: (localStorage.getItem('isSyncConnected') === 'true' ? 'synced' : 'disconnected') as any,
  lastSynced: localStorage.getItem('lastSynced') || null,
  isConflictModalOpen: false,
  conflictData: null,
  syncToast: null,
  syncError: null,

  checkKeyringStatus: async () => {
    try {
      const configured: boolean = await invoke('get_gemini_api_key_status');
      set({ isKeyringConfigured: configured });
    } catch (e) {
      console.error('Failed to resolve keyring API key:', e);
    }
  },

  connectSync: async (_email?: string) => {
    set({ syncStatus: 'syncing' });
    try {
      const email: string = await invoke('connect_google_drive');
      
      // If the user cancelled the flow while it was in progress, ignore the response
      if (get().syncStatus !== 'syncing') {
        return;
      }

      const now = new Date().toLocaleTimeString();
      localStorage.setItem('isSyncConnected', 'true');
      localStorage.setItem('syncEmail', email);
      localStorage.setItem('lastSynced', now);

      set({
        isSyncConnected: true,
        syncEmail: email,
        syncStatus: 'synced',
        lastSynced: now,
        syncError: null,
        syncToast: { message: `Google Drive connected as ${email}`, type: 'success' }
      });

      // Run initial background sync
      await get().triggerSync();
    } catch (e: any) {
      console.error('Google Drive auth failed:', e);
      if (get().syncStatus === 'syncing') {
        const errorMsg = e.toString();
        // Native window alert for absolute frontend visibility
        window.alert(`Google Drive Authentication Failed!\n\nDetails:\n${errorMsg}\n\nPlease check your local log file at AppData/Local/com.keel.app/keel_sync_debug.log for the full diagnostic trace.`);
        set({
          syncStatus: 'disconnected',
          syncError: errorMsg,
          syncToast: { message: `Connection failed: ${errorMsg}`, type: 'error' }
        });
      }
    }
  },

  cancelSyncConnection: () => {
    set({ syncStatus: 'disconnected' });
  },

  disconnectSync: async () => {
    try {
      await invoke('disconnect_google_drive');
    } catch (e) {
      console.error('Failed to disconnect from keyring:', e);
    }
    localStorage.removeItem('isSyncConnected');
    localStorage.removeItem('syncEmail');
    localStorage.removeItem('lastSynced');

    set({
      isSyncConnected: false,
      syncEmail: null,
      syncStatus: 'disconnected',
      syncError: null,
      lastSynced: null,
      syncToast: { message: 'Google Drive account disconnected', type: 'info' }
    });
  },

  triggerSync: async (isManual?: boolean) => {
    if (!get().isSyncConnected) return;
    
    // 1. Guard against concurrent sync requests on the frontend
    if (get().syncStatus === 'syncing') {
      console.log('Google Drive Sync is already active locally. Skipping redundant trigger.');
      return;
    }
    
    set({ syncStatus: 'syncing' });

    try {
      const result: any = await invoke('trigger_gdrive_sync', { lastSyncTime: null });

      if (result.type === 'Success') {
        const now = new Date().toLocaleTimeString();
        localStorage.setItem('lastSynced', now);

        set({
          syncStatus: 'synced',
          lastSynced: now,
          ...(isManual ? {
            syncToast: { message: `Cloud sync completed: ${result.data.synced_count} note(s) updated`, type: 'success' }
          } : {})
        });

        // 1. Only refresh notes list if actual notes were synced to prevent database churn
        const syncedCount = result.data.synced_count || 0;
        if (syncedCount > 0) {
          await get().loadNotebooks();
          if (get().activeNotebookId) {
            await get().loadNotes(get().activeNotebookId);
          }
          // 2. Only re-select active note to refresh preview if the user is currently in preview mode.
          // Never re-select active note in edit mode as it will overwrite the active textarea value.
          if (get().activeNoteId && get().isPreviewMode) {
            await get().selectNote(get().activeNoteId);
          }
        }
      } else if (result.type === 'Conflict') {
        set({
          syncStatus: 'conflict',
          isConflictModalOpen: true,
          conflictData: {
            noteTitle: result.data.note_title,
            localContent: result.data.local_content,
            remoteContent: result.data.remote_content
          },
          syncToast: { message: 'Sync Conflict Detected! Resolve side-by-side.', type: 'warning' }
        });
        
        (get() as any).conflictingNoteId = result.data.note_id;
      } else if (result.type === 'Error') {
        // 2. Intercept "already active in another thread" lock warning silently
        if (result.data && result.data.includes("already active in another thread")) {
          console.warn('Sync is already active in another thread (Backend lock). Reverting silently.');
          set({ syncStatus: 'synced' });
          return;
        }
        throw new Error(result.data);
      }
    } catch (e: any) {
      const errorStr = e.toString();
      // 3. Gracefully handle same error if caught inside promise rejection
      if (errorStr.includes("already active in another thread")) {
        console.warn('Sync is already active in another thread (Backend lock caught). Reverting silently.');
        set({ syncStatus: 'synced' });
        return;
      }
      console.error('Google Drive Sync failed:', e);
      set({
        syncStatus: 'synced', // Revert back from spinner to standard cloud check
        syncToast: { message: `Sync failed: ${errorStr}`, type: 'error' }
      });
    }
  },

  resolveConflict: async (resolution: 'local' | 'remote' | 'merge') => {
    const activeId = (get() as any).conflictingNoteId || get().activeNoteId;
    if (!activeId) return;

    set({ syncStatus: 'syncing' });
    try {
      await invoke('resolve_gdrive_conflict', { noteId: activeId, strategy: resolution });

      const now = new Date().toLocaleTimeString();
      localStorage.setItem('lastSynced', now);

      set({
        isConflictModalOpen: false,
        conflictData: null,
        syncStatus: 'synced',
        lastSynced: now,
        syncToast: { message: `Conflict resolved via '${resolution}'`, type: 'success' }
      });

      // Reload databases & components
      await get().loadNotebooks();
      if (get().activeNotebookId) {
        await get().loadNotes(get().activeNotebookId);
      }
      if (get().activeNoteId) {
        await get().selectNote(get().activeNoteId);
      }
    } catch (e: any) {
      console.error('Failed to resolve sync conflict:', e);
      set({
        syncStatus: 'conflict',
        syncToast: { message: `Conflict resolution failed: ${e.toString()}`, type: 'error' }
      });
    }
  },

  closeConflictModal: () => {
    set({ isConflictModalOpen: false });
  },

  setSyncToast: (toast) => {
    set({ syncToast: toast });
  },

  checkSyncStatus: async () => {
    try {
      const status: any = await invoke('get_sync_status');
      if (status.is_connected) {
        localStorage.setItem('isSyncConnected', 'true');
        localStorage.setItem('syncEmail', status.email);
        set({
          isSyncConnected: true,
          syncEmail: status.email,
          syncStatus: 'synced'
        });
      } else {
        localStorage.removeItem('isSyncConnected');
        localStorage.removeItem('syncEmail');
        // Prevent disrupting an active connection/login flow in progress
        if (get().syncStatus !== 'syncing') {
          set({
            isSyncConnected: false,
            syncEmail: null,
            syncStatus: 'disconnected'
          });
        } else {
          set({
            isSyncConnected: false,
            syncEmail: null
          });
        }
      }
    } catch (e) {
      console.error('Failed to query keyring sync status:', e);
    }
  }
});
