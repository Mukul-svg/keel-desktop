import React, { useState } from 'react';
import { useStore } from '../../stores/useStore';
import { invoke, Channel } from '@tauri-apps/api/core';
import { Sparkles, Minimize2, List, Maximize2, AlignLeft, Sliders, Settings } from 'lucide-react';

interface AIMode {
  id: string;
  name: string;
  desc: string;
  icon: React.ReactNode;
}

interface GeminiStreamPayload {
  token: string | null;
  error: string | null;
  done: boolean;
}

export const AIPanel: React.FC = () => {
  const {
    isGeminiPanelOpen,
    setGeminiPanelOpen,
    activeNote,
    saveNoteContent,
    isKeyringConfigured,
  } = useStore();

  const [activeMode, setActiveMode] = useState<string>('polish');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [aiOutput, setAiOutput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isGeminiPanelOpen) return null;

  const modes: AIMode[] = [
    { id: 'polish', name: 'Polish & Clarify', desc: 'Fix spelling, grammar, flow, and professional voice.', icon: <Sparkles size={16} /> },
    { id: 'simplify', name: 'Simplify Text', desc: 'Shorten structures and use clear, accessible language.', icon: <Minimize2 size={16} /> },
    { id: 'structure', name: 'Add Structure', desc: 'Organize text with clear headers, bullets, and tasks.', icon: <List size={16} /> },
    { id: 'expand', name: 'Expand Details', desc: 'Elaborate notes/bullet points into fully rounded prose.', icon: <Maximize2 size={16} /> },
    { id: 'condense', name: 'Condense Content', desc: 'Extract key arguments and essential summaries.', icon: <AlignLeft size={16} /> },
    { id: 'custom', name: 'Custom Instruction', desc: 'Provide custom commands to the streaming model.', icon: <Sliders size={16} /> },
  ];

  const handleBeautify = async () => {
    if (!activeNote || !activeNote.content) {
      setErrorMessage('Please select a note with content first.');
      return;
    }

    setAiOutput('');
    setErrorMessage('');
    setIsStreaming(true);

    try {
      // Setup Tauri IPC Channel for progressive token streaming
      const channel = new Channel<GeminiStreamPayload>();
      
      channel.onmessage = (message) => {
        if (message.error) {
          setErrorMessage(message.error);
          setIsStreaming(false);
        } else if (message.token) {
          setAiOutput((prev) => prev + message.token);
        }

        if (message.done) {
          setIsStreaming(false);
        }
      };

      await invoke('stream_gemini_beautify', {
        content: activeNote.content,
        mode: activeMode,
        customInstruction: activeMode === 'custom' ? customInstruction : null,
        channel,
      });

    } catch (err: any) {
      setErrorMessage(typeof err === 'string' ? err : err.message || 'Streaming request failed');
      setIsStreaming(false);
    }
  };

  const handleAccept = async () => {
    if (!activeNote || !aiOutput.trim()) return;
    // Save generated content to current note
    await saveNoteContent(activeNote.title, aiOutput);
    setAiOutput('');
  };

  const handleDismiss = () => {
    setAiOutput('');
    setErrorMessage('');
  };

  return (
    <div className="ai-panel glass-panel">
      <div className="ai-panel-header">
        <h3 className="ai-panel-title">
          <span>▲</span> AI Assist
        </h3>
        <button
          className="toolbar-btn"
          onClick={() => setGeminiPanelOpen(false)}
          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
        >
          Close
        </button>
      </div>

      <div className="ai-panel-scroll">
        {!isKeyringConfigured && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--border-radius-sm)',
            padding: '12px',
            fontSize: '0.8rem',
            color: '#f87171',
            marginBottom: '8px',
            lineHeight: 1.4
          }}>
            <strong>API Key Missing:</strong> Please open settings <Settings size={12} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> to securely add your Google Gemini API Key.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {modes.map((mode) => (
            <div
              key={mode.id}
              className={`ai-mode-card ${activeMode === mode.id ? 'active' : ''}`}
              onClick={() => {
                if (!isStreaming) {
                  setActiveMode(mode.id);
                  handleDismiss();
                }
              }}
            >
              <h4 className="ai-mode-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {mode.icon} {mode.name}
              </h4>
              <p className="ai-mode-desc">{mode.desc}</p>
            </div>
          ))}
        </div>

        {activeMode === 'custom' && (
          <div className="settings-input-group" style={{ marginTop: '8px' }}>
            <label className="settings-label" style={{ fontSize: '0.75rem' }}>Instructions</label>
            <textarea
              className="settings-input"
              style={{
                fontFamily: 'DM Sans',
                fontSize: '0.8rem',
                minHeight: '60px',
                resize: 'vertical',
                background: 'rgba(0, 0, 0, 0.2)'
              }}
              placeholder="e.g. translate to French, or format as a JSON schema..."
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              disabled={isStreaming}
            />
          </div>
        )}

        <button
          className="btn-primary"
          style={{ width: '100%', marginTop: '8px' }}
          onClick={handleBeautify}
          disabled={isStreaming || !activeNote || !isKeyringConfigured}
        >
          {isStreaming ? 'Streaming Beautification...' : 'Run AI Transformation'}
        </button>

        {(aiOutput || errorMessage) && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="settings-label" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {isStreaming ? 'Streaming Output' : 'Suggested Result'}
              </span>
              {!isStreaming && aiOutput && (
                <button
                  className="toolbar-btn"
                  onClick={handleDismiss}
                  style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                >
                  Clear
                </button>
              )}
            </div>

            {errorMessage ? (
              <div style={{
                background: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '12px',
                fontSize: '0.8rem',
                color: '#f87171',
                whiteSpace: 'pre-wrap'
              }}>
                {errorMessage}
              </div>
            ) : (
              <div className="ai-response-box">
                {aiOutput ? (
                  aiOutput
                ) : (
                  <span className="ai-response-placeholder">Awaiting first tokens...</span>
                )}
              </div>
            )}

            {!isStreaming && aiOutput && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  className="btn-primary"
                  onClick={handleAccept}
                >
                  Accept & Overwrite
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleDismiss}
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
