import { create } from 'zustand';
import { KeelStore } from './types';
import { createNotebookSlice } from './slices/notebookSlice';
import { createNoteSlice } from './slices/noteSlice';
import { createUiSlice } from './slices/uiSlice';
import { createSettingsSlice } from './slices/settingsSlice';
import { createSyncSlice } from './slices/syncSlice';

// Re-export all types so component imports do not break
export * from './types';

export const useStore = create<KeelStore>()((...a) => ({
  ...createNotebookSlice(...a),
  ...createNoteSlice(...a),
  ...createUiSlice(...a),
  ...createSettingsSlice(...a),
  ...createSyncSlice(...a),
}));
