// --- Shared Domain Types ---

export interface Notebook {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  folder_path: string;
  created_at: string;
  updated_at: string;
  note_count?: number;
  sort_order?: number;
  is_pinned: boolean;
}

export interface Note {
  id: string;
  notebook_id?: string;
  title: string;
  file_path: string;
  is_pinned: boolean;
  word_count: number;
  char_count: number;
  reading_time: number;
  created_at: string;
  updated_at: string;
  content?: string;
  content_html?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
}

export interface Tag {
  name: string;
  color_hex: string;
}

export interface Backlink {
  id: string;
  title: string;
}

export interface Snapshot {
  id: string;
  note_id: string;
  label: string | null;
  created_at: string;
}

export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  isDestructive?: boolean;
}

export interface PromptDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel: string;
  cancelLabel: string;
  onSubmit: (value: string) => void | Promise<void>;
}

export interface KeelStore {
  // Notebooks State
  notebooks: Notebook[];
  activeNotebookId: string;
  
  // Notes State
  notes: Note[];
  activeNoteId: string;
  activeNote: Note | null;
  activeNoteBacklinks: Backlink[];

  // Search State
  searchQuery: string;
  searchResults: SearchResult[];

  // Tags State
  tags: Tag[];

  // System UI State
  isCommandPaletteOpen: boolean;
  isGeminiPanelOpen: boolean;
  isSettingsOpen: boolean;
  isPreviewMode: boolean;
  isKeyringConfigured: boolean;
  isSaving: boolean;
  isFocusMode: boolean;
  theme: 'dark' | 'light' | 'paper';
  isMobileSidebarOpen: boolean;
  isMobileNotesListOpen: boolean;

  // Background & Appearance Settings
  bgImageUrl: string;
  bgOpacity: number;
  bgBlur: number;
  bgOverlayOpacity: number;
  panelOpacity: number;
  isGlassEnabled: boolean;
  isSnowEnabled: boolean;
  
  // Custom Confirmation Dialog
  confirmDialog: ConfirmDialogState | null;
  
  // Custom Prompt Dialog
  promptDialog: PromptDialogState | null;
  showPrompt: (dialog: Omit<PromptDialogState, 'isOpen'>) => void;
  hidePrompt: () => void;

  // Custom Create Notebook Modal
  isCreateNotebookModalOpen: boolean;
  setCreateNotebookModalOpen: (open: boolean) => void;

  // Custom Edit Notebook Modal
  isEditNotebookModalOpen: boolean;
  editingNotebook: Notebook | null;
  setEditNotebookModalOpen: (open: boolean, notebook?: Notebook | null) => void;
  updateNotebook: (id: string, name: string, emoji: string, description?: string, isPinned?: boolean) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;

  // Actions
  loadNotebooks: () => Promise<void>;
  createNotebook: (name: string, emoji: string, description?: string) => Promise<Notebook>;
  selectNotebook: (id: string) => Promise<void>;
  updateNotebookOrder: (orderedIds: string[]) => Promise<void>;
  updateNoteOrder: (orderedIds: string[]) => Promise<void>;
  
  loadNotes: (notebookId: string) => Promise<void>;
  selectNote: (id: string) => Promise<void>;
  createNote: () => Promise<void>;
  saveNoteContent: (title: string, content: string) => Promise<void>;
  deleteActiveNote: () => Promise<void>;
  togglePinActiveNote: () => Promise<void>;
  moveNote: (noteId: string, newNotebookId: string) => Promise<void>;

  setSearchQuery: (query: string) => void;
  triggerSearch: () => Promise<void>;
  loadAllTags: () => Promise<void>;
  
  setCommandPaletteOpen: (open: boolean) => void;
  setGeminiPanelOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPreviewMode: (preview: boolean) => void;
  setFocusMode: (focus: boolean) => void;
  setTheme: (theme: 'dark' | 'light' | 'paper') => void;
  checkKeyringStatus: () => Promise<void>;
  setMobileSidebarOpen: (open: boolean) => void;
  setMobileNotesListOpen: (open: boolean) => void;

  // Background & Appearance Actions
  setBgImageUrl: (url: string) => void;
  setBgOpacity: (opacity: number) => void;
  setBgBlur: (blur: number) => void;
  setBgOverlayOpacity: (opacity: number) => void;
  setPanelOpacity: (opacity: number) => void;
  setGlassEnabled: (enabled: boolean) => void;
  setSnowEnabled: (enabled: boolean) => void;
  syncInterval: 'manual' | '1m' | '5m' | '15m' | '30m' | '1h';
  setSyncInterval: (interval: 'manual' | '1m' | '5m' | '15m' | '30m' | '1h') => void;
  
  showConfirm: (dialog: Omit<ConfirmDialogState, 'isOpen'>) => void;
  hideConfirm: () => void;

  // --- Google Drive Sync State (Real Sync) ---
  isSyncConnected: boolean;
  syncEmail: string | null;
  syncStatus: 'disconnected' | 'syncing' | 'synced' | 'conflict';
  lastSynced: string | null;
  isConflictModalOpen: boolean;
  conflictData: { localContent: string; remoteContent: string; noteTitle: string } | null;
  syncToast: { message: string; type: 'success' | 'info' | 'error' | 'warning' } | null;
  syncError: string | null;

  // Sync Actions
  connectSync: (email?: string) => Promise<void>;
  cancelSyncConnection: () => void;
  disconnectSync: () => Promise<void>;
  triggerSync: (isManual?: boolean) => Promise<void>;
  resolveConflict: (resolution: 'local' | 'remote' | 'merge') => Promise<void>;
  closeConflictModal: () => void;
  setSyncToast: (toast: { message: string; type: 'success' | 'info' | 'error' | 'warning' } | null) => void;
  checkSyncStatus: () => Promise<void>;
}
