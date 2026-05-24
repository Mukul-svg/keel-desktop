import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { KeelStore, Notebook } from '../types';

export interface NotebookSlice {
  notebooks: Notebook[];
  activeNotebookId: string;
  loadNotebooks: () => Promise<void>;
  createNotebook: (name: string, emoji: string, description?: string) => Promise<Notebook>;
  selectNotebook: (id: string) => Promise<void>;
  updateNotebookOrder: (orderedIds: string[]) => Promise<void>;
  updateNotebook: (id: string, name: string, emoji: string, description?: string, isPinned?: boolean) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;
}

export const createNotebookSlice: StateCreator<
  KeelStore,
  [],
  [],
  NotebookSlice
> = (set, get) => ({
  notebooks: [],
  activeNotebookId: 'inbox',

  loadNotebooks: async () => {
    try {
      const list: Notebook[] = await invoke('get_notebooks');
      set({ notebooks: list });
    } catch (e) {
      console.error('Failed to load notebooks:', e);
    }
  },

  createNotebook: async (name, emoji, description) => {
    const notebook: Notebook = await invoke('create_notebook', { name, emoji, description });
    await get().loadNotebooks();
    return notebook;
  },

  selectNotebook: async (id) => {
    set({ activeNoteId: '', activeNote: null, activeNoteBacklinks: [] });
    set({ activeNotebookId: id });
    await get().loadNotes(id);
  },

  updateNotebookOrder: async (orderedIds) => {
    try {
      await invoke('update_notebook_order', { orderedIds });
      await get().loadNotebooks();
    } catch (e) {
      console.error('Failed to update notebook order:', e);
    }
  },

  updateNotebook: async (id, name, emoji, description, isPinned = false) => {
    await invoke('update_notebook', { id, name, emoji, description, isPinned });
    await get().loadNotebooks();
  },

  deleteNotebook: async (id) => {
    await invoke('delete_notebook', { id });
    await get().loadNotebooks();
    // Default select inbox after deletion
    await get().selectNotebook('inbox');
  },
});
