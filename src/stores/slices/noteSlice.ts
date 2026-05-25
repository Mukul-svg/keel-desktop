import { StateCreator } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { KeelStore, Note, SearchResult, Tag, Backlink } from '../types';

export interface NoteSlice {
  notes: Note[];
  activeNoteId: string;
  activeNote: Note | null;
  activeNoteBacklinks: Backlink[];
  searchQuery: string;
  searchResults: SearchResult[];
  tags: Tag[];
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
  updateNoteOrder: (orderedIds: string[]) => Promise<void>;
}

export const createNoteSlice: StateCreator<
  KeelStore,
  [],
  [],
  NoteSlice
> = (set, get) => ({
  notes: [],
  activeNoteId: '',
  activeNote: null,
  activeNoteBacklinks: [],
  searchQuery: '',
  searchResults: [],
  tags: [],

  loadNotes: async (notebookId) => {
    try {
      const list: Note[] = await invoke('get_notes', { notebookId });
      set({ notes: list });
    } catch (e) {
      console.error('Failed to load notes:', e);
    }
  },

  selectNote: async (id) => {
    if (!id) return;
    try {
      const note: Note = await invoke('get_note_content', { id });
      const backlinks: Backlink[] = await invoke('get_note_backlinks', { id });
      
      // Preserve current preview/edit mode selection when re-loading the active note
      const currentPreviewMode = get().isPreviewMode;
      const keepPreviewMode = (id === get().activeNoteId) ? currentPreviewMode : true;

      // Prevent redundant store updates and image flashing if note content & backlinks are identical
      const currentActiveNote = get().activeNote;
      const isNoteIdentical = currentActiveNote &&
                             currentActiveNote.id === note.id &&
                             currentActiveNote.title === note.title &&
                             currentActiveNote.content === note.content &&
                             currentActiveNote.is_pinned === note.is_pinned &&
                             currentActiveNote.notebook_id === note.notebook_id &&
                             currentActiveNote.content_html === note.content_html;

      const currentBacklinks = get().activeNoteBacklinks;
      const isBacklinksIdentical = currentBacklinks.length === backlinks.length &&
                                   currentBacklinks.every((bl, idx) => bl.id === backlinks[idx].id && bl.title === backlinks[idx].title);

      if (id === get().activeNoteId && isNoteIdentical && isBacklinksIdentical) {
        return;
      }

      set({ 
        activeNoteId: id, 
        activeNote: note, 
        activeNoteBacklinks: backlinks,
        isPreviewMode: keepPreviewMode
      });
      // Refresh tag browser in background
      await get().loadAllTags();
    } catch (e) {
      console.error('Failed to load note content:', e);
    }
  },

  createNote: async () => {
    const notebookId = get().activeNotebookId;
    if (!notebookId) return;

    try {
      const defaultTitle = 'Untitled Note';
      const defaultContent = '# Untitled Note\n\nStart writing here...';
      
      const newNote: Note = await invoke('save_note', {
        id: null,
        title: defaultTitle,
        content: defaultContent,
        notebookId,
      });

      // Reload notes list & select new note
      await get().loadNotes(notebookId);
      await get().selectNote(newNote.id);

      // Perform background sync on note creation if enabled
      if (get().isSyncConnected && get().syncInterval !== 'manual') {
        get().triggerSync();
      }
    } catch (e) {
      console.error('Failed to create note:', e);
    }
  },

  saveNoteContent: async (title, content) => {
    const activeNoteId = get().activeNoteId;
    const notebookId = get().activeNote?.notebook_id || get().activeNotebookId;
    if (!activeNoteId || !notebookId) return;

    set({ isSaving: true });
    try {
      const updatedNote: Note = await invoke('save_note', {
        id: activeNoteId,
        title,
        content,
        notebookId,
      });

      // Update in-place to avoid complete layout resets
      set({ 
        activeNote: updatedNote,
        isSaving: false 
      });

      // Reload list metadata in background
      await get().loadNotes(notebookId);

      // Auto debounced sync on save if enabled
      if (get().isSyncConnected && get().syncInterval !== 'manual') {
        get().triggerSync();
      }
    } catch (e) {
      set({ isSaving: false });
      console.error('Failed to save note:', e);
    }
  },

  deleteActiveNote: async () => {
    const activeNoteId = get().activeNoteId;
    const notebookId = get().activeNote?.notebook_id || get().activeNotebookId;
    if (!activeNoteId || !notebookId) return;

    try {
      await invoke('delete_note', { id: activeNoteId });
      set({ activeNoteId: '', activeNote: null, activeNoteBacklinks: [] });
      await get().loadNotes(notebookId);

      // Perform background sync on delete if enabled
      if (get().isSyncConnected && get().syncInterval !== 'manual') {
        get().triggerSync();
      }
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  },

  togglePinActiveNote: async () => {
    const activeNoteId = get().activeNoteId;
    const notebookId = get().activeNotebookId;
    if (!activeNoteId || !notebookId) return;

    try {
      const nextPinnedState: boolean = await invoke('toggle_pin_note', { id: activeNoteId });
      if (get().activeNote) {
        set({ 
          activeNote: { 
            ...get().activeNote!, 
            is_pinned: nextPinnedState 
          } 
        });
      }
      await get().loadNotes(notebookId);
      
      if (get().isSyncConnected && get().syncInterval !== 'manual') {
        get().triggerSync();
      }
    } catch (e) {
      console.error('Failed to toggle note pin:', e);
    }
  },

  moveNote: async (noteId, newNotebookId) => {
    try {
      await invoke('move_note', { id: noteId, newNotebookId });
      // Reload notebooks to update counts
      await get().loadNotebooks();
      // Reload notes for current active notebook
      await get().loadNotes(get().activeNotebookId);
      // If we moved the active note, and we are not currently viewing the new notebook, deselect it
      if (get().activeNoteId === noteId && get().activeNotebookId !== newNotebookId) {
        set({ activeNoteId: '', activeNote: null, activeNoteBacklinks: [] });
      }

      if (get().isSyncConnected && get().syncInterval !== 'manual') {
        get().triggerSync();
      }
    } catch (e) {
      console.error('Failed to move note:', e);
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  triggerSearch: async () => {
    const query = get().searchQuery;
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }

    try {
      const list: SearchResult[] = await invoke('search_notes', { queryStr: query });
      set({ searchResults: list });
    } catch (e) {
      console.error('Failed to perform FTS5 search:', e);
    }
  },

  loadAllTags: async () => {
    try {
      const list: Tag[] = await invoke('get_all_tags');
      set({ tags: list });
    } catch (e) {
      console.error('Failed to load tags:', e);
    }
  },

  updateNoteOrder: async (orderedIds) => {
    try {
      await invoke('update_note_order', { orderedIds });
      await get().loadNotes(get().activeNotebookId);
    } catch (e) {
      console.error('Failed to update note order:', e);
    }
  },
});
