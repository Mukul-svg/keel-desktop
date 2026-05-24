import { StateCreator } from 'zustand';
import { KeelStore, ConfirmDialogState, PromptDialogState, Notebook } from '../types';

export interface UiSlice {
  isCommandPaletteOpen: boolean;
  isGeminiPanelOpen: boolean;
  isSettingsOpen: boolean;
  isPreviewMode: boolean;
  isSaving: boolean;
  isFocusMode: boolean;
  isMobileSidebarOpen: boolean;
  isMobileNotesListOpen: boolean;
  confirmDialog: ConfirmDialogState | null;
  promptDialog: PromptDialogState | null;
  isCreateNotebookModalOpen: boolean;
  isEditNotebookModalOpen: boolean;
  editingNotebook: Notebook | null;

  setCommandPaletteOpen: (open: boolean) => void;
  setGeminiPanelOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPreviewMode: (preview: boolean) => void;
  setFocusMode: (focus: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setMobileNotesListOpen: (open: boolean) => void;
  showConfirm: (dialog: Omit<ConfirmDialogState, 'isOpen'>) => void;
  hideConfirm: () => void;
  showPrompt: (dialog: Omit<PromptDialogState, 'isOpen'>) => void;
  hidePrompt: () => void;
  setCreateNotebookModalOpen: (open: boolean) => void;
  setEditNotebookModalOpen: (open: boolean, notebook?: Notebook | null) => void;
}

export const createUiSlice: StateCreator<
  KeelStore,
  [],
  [],
  UiSlice
> = (set) => ({
  isCommandPaletteOpen: false,
  isGeminiPanelOpen: false,
  isSettingsOpen: false,
  isPreviewMode: false,
  isSaving: false,
  isFocusMode: false,
  isMobileSidebarOpen: false,
  isMobileNotesListOpen: false,
  confirmDialog: null,
  promptDialog: null,
  isCreateNotebookModalOpen: false,
  isEditNotebookModalOpen: false,
  editingNotebook: null,

  setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
  setGeminiPanelOpen: (open) => set({ isGeminiPanelOpen: open }),
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setPreviewMode: (preview) => set({ isPreviewMode: preview }),
  setFocusMode: (focus) => set({ isFocusMode: focus }),
  setMobileSidebarOpen: (open) => set({ isMobileSidebarOpen: open }),
  setMobileNotesListOpen: (open) => set({ isMobileNotesListOpen: open }),

  showConfirm: (dialog) => {
    set({
      confirmDialog: {
        ...dialog,
        isOpen: true,
      },
    });
  },

  hideConfirm: () => {
    set({ confirmDialog: null });
  },

  showPrompt: (dialog) => {
    set({
      promptDialog: {
        ...dialog,
        isOpen: true,
      },
    });
  },

  hidePrompt: () => {
    set({ promptDialog: null });
  },

  setCreateNotebookModalOpen: (open) => {
    set({ isCreateNotebookModalOpen: open });
  },

  setEditNotebookModalOpen: (open, notebook = null) => {
    set({ isEditNotebookModalOpen: open, editingNotebook: notebook });
  },
});
