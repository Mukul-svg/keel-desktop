import React from 'react';
import { 
  Pin, Edit3, Eye, Minimize2, Maximize2, Sparkles, 
  Trash2, ListTree 
} from 'lucide-react';

interface EditorHeaderProps {
  notebookName: string;
  editorTitle: string;
  isPinned: boolean;
  isPreviewMode: boolean;
  isFocusMode: boolean;
  isTOCOpen: boolean;
  isGeminiPanelOpen: boolean;
  onTogglePin: () => void;
  onTogglePreview: () => void;
  onToggleFocus: () => void;
  onToggleTOC: () => void;
  onToggleGemini: () => void;
  onDelete: () => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  notebookName,
  editorTitle,
  isPinned,
  isPreviewMode,
  isFocusMode,
  isTOCOpen,
  isGeminiPanelOpen,
  onTogglePin,
  onTogglePreview,
  onToggleFocus,
  onToggleTOC,
  onToggleGemini,
  onDelete,
}) => {
  return (
    <div className="editor-header-toolbar">
      <div className="editor-breadcrumbs">
        <span>{notebookName}</span>
        <span>/</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
          {editorTitle || 'Untitled Note'}
        </span>
      </div>

      <div className="editor-actions">
        <button
          className={`toolbar-btn ${isPinned ? 'active' : ''}`}
          title="Pin Note"
          onClick={onTogglePin}
        >
          <Pin size={14} />
          <span className="btn-text">Pin</span>
        </button>

        <button
          className={`toolbar-btn ${isPreviewMode ? 'active' : ''}`}
          title="Toggle Preview (Ctrl+P)"
          onClick={onTogglePreview}
        >
          {isPreviewMode ? <Edit3 size={14} /> : <Eye size={14} />}
          <span className="btn-text">{isPreviewMode ? 'Editing' : 'Preview'}</span>
        </button>

        <button
          className={`toolbar-btn ${isFocusMode ? 'active' : ''}`}
          title="Toggle Focus Mode (Ctrl+\)"
          onClick={onToggleFocus}
        >
          {isFocusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          <span className="btn-text">Focus</span>
        </button>

        <button
          className={`toolbar-btn ${isTOCOpen ? 'active' : ''}`}
          title="Toggle Outline (Ctrl+Shift+O)"
          onClick={onToggleTOC}
        >
          <ListTree size={14} />
          <span className="btn-text">Outline</span>
        </button>

        <button
          className={`toolbar-btn ai-btn ${isGeminiPanelOpen ? 'active' : ''}`}
          title="Beautify with Gemini 3 (Ctrl+J)"
          onClick={onToggleGemini}
        >
          <Sparkles size={14} />
          <span className="btn-text">AI Assist</span>
        </button>

        <button
          className="toolbar-btn"
          style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
          title="Delete Note"
          onClick={onDelete}
        >
          <Trash2 size={14} />
          <span className="btn-text">Delete</span>
        </button>
      </div>
    </div>
  );
};
