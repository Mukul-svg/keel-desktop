import React, { useEffect, useState, useRef } from 'react';
import { useStore, Snapshot } from '../../stores/useStore';
import { invoke } from '@tauri-apps/api/core';
import { useSmartKeys } from './useSmartKeys';
import { useImagePaste } from './useImagePaste';
import { FindReplace } from './FindReplace';
import { FormattingToolbar } from './FormattingToolbar';
import { TableOfContents } from './TableOfContents';
import { Link, FileText, Type, Clock, Loader2, Check } from 'lucide-react';
import { EditorHeader } from './EditorHeader';
import { SnapshotsDropdown } from './SnapshotsDropdown';
import { SyncStatusBadge } from './SyncStatusBadge';
import { EmptyState } from './EmptyState';

export const Editor: React.FC = () => {
  const {
    activeNote,
    activeNoteId,
    activeNotebookId,
    notebooks,
    activeNoteBacklinks,
    selectNote,
    saveNoteContent,
    deleteActiveNote,
    togglePinActiveNote,
    isPreviewMode,
    setPreviewMode,
    isFocusMode,
    setFocusMode,
    isGeminiPanelOpen,
    setGeminiPanelOpen,
    isSaving,
    showConfirm,
    showPrompt,
    createNote,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    notes,
    
    // Cloud Sync hook properties
    isSyncConnected,
    syncStatus,
    triggerSync,
  } = useStore();

  // Local state for editor inputs
  const [editorTitle, setEditorTitle] = useState('');
  const [editorBody, setEditorBody] = useState('');

  // Local state for Snapshot Management
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [showSnapshotsDropdown, setShowSnapshotsDropdown] = useState(false);

  // Local state for Find & Replace and TOC
  const [isFindOpen, setFindOpen] = useState(false);
  const [findMode, setFindMode] = useState<'find' | 'replace'>('find');
  const [isTOCOpen, setTOCOpen] = useState(false);

  // Refs for autosave debounce timer
  const saveTimeoutRef = useRef<any>(null);

  // Refs for line numbers and preview in standard editor
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const lastLoadedNoteIdRef = useRef<string | null>(null);
  const isDirtyRef = useRef<boolean>(false);

  // Attach smart markdown editing key handlers
  const smartKeyHandlers = useSmartKeys(textareaRef, editorBody, setEditorBody);

  // Attach clipboard image paste and drag-drop handlers
  const imagePasteHandlers = useImagePaste(textareaRef, editorBody, setEditorBody, activeNotebookId);

  // Sync scrolling of standard textarea and line numbers gutter
  const handleTextareaScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Sync scroll position when document content changes
  useEffect(() => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, [editorBody, activeNoteId]);

  // Sync local inputs when activeNote changes
  useEffect(() => {
    if (activeNote) {
      const isDifferentNote = activeNote.id !== lastLoadedNoteIdRef.current;
      
      const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n');
      const normalizedBody = normalizeLineEndings(editorBody);
      const normalizedActiveContent = normalizeLineEndings(activeNote.content || '');
      const hasUnsavedChanges = editorTitle !== activeNote.title || normalizedBody !== normalizedActiveContent;

      if (isDifferentNote || isPreviewMode || !hasUnsavedChanges) {
        setEditorTitle(activeNote.title);
        setEditorBody(activeNote.content || '');
        lastLoadedNoteIdRef.current = activeNote.id;
        isDirtyRef.current = false;
      }
      // Fetch snapshots for this note
      fetchSnapshots(activeNote.id);
    } else {
      setEditorTitle('');
      setEditorBody('');
      setSnapshots([]);
      lastLoadedNoteIdRef.current = null;
      isDirtyRef.current = false;
    }
    setShowSnapshotsDropdown(false);
  }, [activeNote, isPreviewMode]);

  // Fetch snapshots for active note
  const fetchSnapshots = async (noteId: string) => {
    try {
      const snapList: Snapshot[] = await invoke('get_snapshots', { noteId });
      setSnapshots(snapList);
    } catch (e) {
      console.error('Failed to get snapshots:', e);
    }
  };

  // Create snap manually
  const handleCreateSnapshot = () => {
    if (!activeNoteId) return;
    showPrompt({
      title: 'Create Snapshot',
      message: 'Enter a label for this snapshot (optional):',
      placeholder: 'e.g., Before major edit, draft 1...',
      defaultValue: '',
      confirmLabel: 'Save Snapshot',
      cancelLabel: 'Cancel',
      onSubmit: async (label) => {
        try {
          await invoke('create_snapshot', { noteId: activeNoteId, label: label.trim() || null });
          await fetchSnapshots(activeNoteId);
        } catch (e) {
          console.error(e);
        }
      }
    });
  };

  // Restore snap
  const handleRestoreSnapshot = async (snapId: string) => {
    try {
      const decompressed: string = await invoke('restore_snapshot', { snapshotId: snapId });
      isDirtyRef.current = false;
      setEditorBody(decompressed);
      await saveNoteContent(editorTitle, decompressed);
      await fetchSnapshots(activeNoteId);
      setShowSnapshotsDropdown(false);
    } catch (e) {
      console.error(e);
    }
  };

  // Keyboard Event Handlers (Keyboard-First Navigation)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Ctrl + K -> Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
      // Ctrl + N -> New Note
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNote();
      }
      // Ctrl + P -> Preview Toggle
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPreviewMode(!isPreviewMode);
      }
      // Ctrl + J -> AI Panel Toggle
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setGeminiPanelOpen(!isGeminiPanelOpen);
      }
      // Ctrl + \ -> Toggle Focus Mode
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        setFocusMode(!isFocusMode);
      }
      // Ctrl + F -> Find panel
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindMode('find');
        setFindOpen(true);
      }
      // Ctrl + H -> Replace panel
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setFindMode('replace');
        setFindOpen(true);
      }
      // Ctrl + Shift + O -> Outline / TOC Toggle
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setTOCOpen(!isTOCOpen);
      }
      // Ctrl + S -> Manual Save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeNoteId) {
          // Clear active save timeout to avoid duplicate saves
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveNoteContent(editorTitle, editorBody);
          // Auto-save delta snapshot
          invoke('create_snapshot', { noteId: activeNoteId, label: 'Manual Save Snapshot' }).then(() => {
            fetchSnapshots(activeNoteId);
          });
        }
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [
    isCommandPaletteOpen,
    isPreviewMode,
    isGeminiPanelOpen,
    activeNoteId,
    editorTitle,
    editorBody,
    setCommandPaletteOpen,
    setPreviewMode,
    setGeminiPanelOpen,
    createNote,
    saveNoteContent,
    isFocusMode,
    setFocusMode,
    isFindOpen,
    findMode,
    isTOCOpen,
  ]);

  // Debounced auto-save effect
  useEffect(() => {
    if (!activeNoteId) return;

    const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n');
    const normalizedBody = normalizeLineEndings(editorBody);
    const normalizedActiveContent = normalizeLineEndings(activeNote?.content || '');

    if (isDirtyRef.current && activeNote && (editorTitle !== activeNote.title || normalizedBody !== normalizedActiveContent)) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      
      saveTimeoutRef.current = setTimeout(() => {
        saveNoteContent(editorTitle, editorBody);
        isDirtyRef.current = false;
      }, 1000);
    }

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [editorTitle, editorBody, activeNoteId, saveNoteContent, activeNote]);

  // Expose copyCodeToClipboard globally for the syntect code blocks
  useEffect(() => {
    (window as any).copyCodeToClipboard = (btn: HTMLButtonElement) => {
      const wrapper = btn.closest('.code-block-wrapper');
      const codeEl = wrapper?.querySelector('.syntect-code code');
      if (codeEl) {
        const text = codeEl.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
          btn.innerText = 'Copied!';
          setTimeout(() => {
            btn.innerText = 'Copy';
          }, 1500);
        }).catch((err) => {
          console.error('Failed to copy text:', err);
        });
      }
    };
  }, []);

  const activeNotebook = notebooks.find(b => b.id === (activeNote?.notebook_id || activeNotebookId));

  // Compute live word metrics
  const liveWords = editorBody.trim() ? editorBody.trim().split(/\s+/).length : 0;
  const liveChars = editorBody.length;
  const liveReadingTime = Math.max(1, Math.ceil(liveWords / 3)); // 3 words per second

  return (
    <main className="editor-panel">
      {activeNote ? (
        <>
          <EditorHeader
            notebookName={activeNotebook?.name || 'Inbox'}
            editorTitle={editorTitle}
            isPinned={activeNote.is_pinned}
            isPreviewMode={isPreviewMode}
            isFocusMode={isFocusMode}
            isTOCOpen={isTOCOpen}
            isGeminiPanelOpen={isGeminiPanelOpen}
            onTogglePin={togglePinActiveNote}
            onTogglePreview={() => setPreviewMode(!isPreviewMode)}
            onToggleFocus={() => setFocusMode(!isFocusMode)}
            onToggleTOC={() => setTOCOpen(!isTOCOpen)}
            onToggleGemini={() => setGeminiPanelOpen(!isGeminiPanelOpen)}
            onDelete={() => {
              showConfirm({
                title: 'Delete Note',
                message: 'Are you sure you want to delete this note? This action cannot be undone.',
                confirmLabel: 'Delete Note',
                cancelLabel: 'Cancel',
                isDestructive: true,
                onConfirm: async () => {
                  await deleteActiveNote();
                }
              });
            }}
          />

          <div className="editor-canvas">
            {isPreviewMode ? (
              <div className="editor-preview-wrapper" spellCheck="false">
                <article
                  ref={previewRef}
                  className="markdown-body"
                  spellCheck="false"
                  dangerouslySetInnerHTML={{ __html: activeNote.content_html || '' }}
                  onClick={async (e) => {
                    const target = e.target as HTMLElement;
                    const link = target.closest('a');
                    if (link && link.classList.contains('internal-link')) {
                      e.preventDefault();
                      const targetTitle = link.getAttribute('data-target');
                      if (targetTitle) {
                        try {
                          const noteId: string | null = await invoke('get_note_id_by_title', { title: targetTitle });
                          if (noteId) {
                            await selectNote(noteId);
                            // Set mobile notes list closed on click in case mobile
                            useStore.setState({ isMobileNotesListOpen: false });
                          } else {
                            console.warn(`Note with title "${targetTitle}" not found.`);
                          }
                        } catch (err) {
                          console.error('Failed to navigate internal link:', err);
                        }
                      }
                      return;
                    }

                    // Checkbox interactive toggling
                    const checkbox = target.closest('input[type="checkbox"]');
                    if (checkbox) {
                      e.preventDefault();
                      const checkboxes = Array.from(e.currentTarget.querySelectorAll('input[type="checkbox"]'));
                      const index = checkboxes.indexOf(checkbox);
                      if (index !== -1) {
                        let checkboxCount = 0;
                        const updatedBody = editorBody.replace(
                          /([-*+]\s+\[)([ x])(\])/g,
                          (match, p1, p2, p3) => {
                            if (checkboxCount === index) {
                              checkboxCount++;
                              const nextState = p2 === ' ' ? 'x' : ' ';
                              return `${p1}${nextState}${p3}`;
                            }
                            checkboxCount++;
                            return match;
                          }
                        );
                        if (updatedBody !== editorBody) {
                          isDirtyRef.current = false;
                          setEditorBody(updatedBody);
                          saveNoteContent(editorTitle, updatedBody);
                        }
                      }
                    }
                  }}
                />
                
                {/* Render Incoming Backlinks */}
                {activeNoteBacklinks.length > 0 && (
                  <div className="backlinks-section">
                    <div className="backlinks-title">Backlinks</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {activeNoteBacklinks.map((link) => (
                        <span
                          key={link.id}
                          className="backlink-item"
                          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                          onClick={async () => {
                            await selectNote(link.id);
                            useStore.setState({ isMobileNotesListOpen: false });
                          }}
                        >
                          <Link size={12} /> {link.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="editor-textarea-wrapper">
                <FindReplace
                  isOpen={isFindOpen}
                  mode={findMode}
                  content={editorBody}
                  onReplace={(newContent) => {
                    isDirtyRef.current = false;
                    setEditorBody(newContent);
                    saveNoteContent(editorTitle, newContent);
                  }}
                  onClose={() => setFindOpen(false)}
                  textareaRef={textareaRef}
                />
                <input
                  type="text"
                  className="editor-title-input"
                  value={editorTitle}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setEditorTitle(e.target.value);
                  }}
                  placeholder="Give this note a title..."
                />
                <FormattingToolbar
                  textareaRef={textareaRef}
                  value={editorBody}
                  onChange={(newValue) => {
                    isDirtyRef.current = false;
                    setEditorBody(newValue);
                    saveNoteContent(editorTitle, newValue);
                  }}
                />
                <div className="editor-body-container">
                  <div className="line-numbers-gutter" ref={gutterRef}>
                    {Array.from({ length: editorBody.split('\n').length || 1 }).map((_, i) => (
                      <div key={i} className="line-number">{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    ref={textareaRef}
                    className="editor-body-textarea"
                    value={editorBody}
                    onChange={(e) => {
                      isDirtyRef.current = true;
                      setEditorBody(e.target.value);
                    }}
                    onScroll={handleTextareaScroll}
                    placeholder="Start writing in GFM Markdown here (Wiki links [[Wiki Links]] and tags #tag work!)...."
                    {...smartKeyHandlers}
                    {...imagePasteHandlers}
                  />
                </div>
              </div>
            )}

            <TableOfContents
              content={editorBody}
              isOpen={isTOCOpen}
              onClose={() => setTOCOpen(false)}
              previewRef={previewRef}
              textareaRef={textareaRef}
              isPreviewMode={isPreviewMode}
            />
          </div>

          {/* Editor Footer Status Bar */}
          <div className="editor-statusbar">
            <div className="statusbar-metrics" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FileText size={12} /> {liveWords} words
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Type size={12} /> {liveChars} chars
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> {liveReadingTime}s read
              </span>
              
              <SnapshotsDropdown
                snapshots={snapshots}
                isOpen={showSnapshotsDropdown}
                setOpen={setShowSnapshotsDropdown}
                onCreateSnapshot={handleCreateSnapshot}
                onRestoreSnapshot={handleRestoreSnapshot}
              />
            </div>

            {/* Persistence status & Cloud Sync Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <SyncStatusBadge
                isSyncConnected={isSyncConnected}
                syncStatus={syncStatus}
                onBadgeClick={() => {
                  if (!isSyncConnected) {
                    useStore.setState({ isSettingsOpen: true });
                  } else if (syncStatus === 'conflict') {
                    useStore.setState({ isConflictModalOpen: true });
                  } else {
                    triggerSync(true);
                  }
                }}
              />

              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isSaving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" style={{ display: 'inline-block' }} />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={12} style={{ color: 'var(--green)', display: 'inline-block' }} />
                    <span>Saved</span>
                  </>
                )}
              </span>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          hasNotes={notes.length > 0}
          onCreateNote={() => {
            createNote();
            useStore.setState({ isMobileNotesListOpen: false });
          }}
        />
      )}
    </main>
  );
};
