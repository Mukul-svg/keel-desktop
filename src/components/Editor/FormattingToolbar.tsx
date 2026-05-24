import React from 'react';
import { Bold, Italic, Heading, Code, Link, List, CheckSquare, Quote } from 'lucide-react';

interface FormattingToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
}

export const FormattingToolbar: React.FC<FormattingToolbarProps> = ({
  textareaRef,
  value,
  onChange,
}) => {
  const insertFormatting = (type: 'bold' | 'italic' | 'code' | 'link') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let insertion = '';
    let newStart = start;
    let newEnd = end;

    switch (type) {
      case 'bold':
        insertion = `**${selectedText || 'bold text'}**`;
        newStart = selectedText ? start : start + 2;
        newEnd = selectedText ? end + 4 : start + 11;
        break;
      case 'italic':
        insertion = `_${selectedText || 'italic text'}_`;
        newStart = selectedText ? start : start + 1;
        newEnd = selectedText ? end + 2 : start + 12;
        break;
      case 'code':
        if (selectedText.includes('\n')) {
          insertion = `\`\`\`\n${selectedText}\n\`\`\``;
          newStart = start + 4;
          newEnd = end + 4;
        } else {
          insertion = `\`${selectedText || 'code'}\``;
          newStart = selectedText ? start : start + 1;
          newEnd = selectedText ? end + 2 : start + 5;
        }
        break;
      case 'link':
        insertion = `[${selectedText || 'text'}](url)`;
        if (selectedText) {
          // Select "url" part for easy typing
          newStart = start + selectedText.length + 3;
          newEnd = start + selectedText.length + 6;
        } else {
          // Select "text" part
          newStart = start + 1;
          newEnd = start + 5;
        }
        break;
    }

    const before = value.substring(0, start);
    const after = value.substring(end);
    onChange(before + insertion + after);

    // Refocus and restore selection in next macro-tick
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newStart, newEnd);
    }, 0);
  };

  const toggleLinePrefix = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Find the start of the line containing the selection start
    const beforeSelection = value.substring(0, start);
    const lineStart = beforeSelection.lastIndexOf('\n') + 1;

    // Find the end of the line containing the selection end
    const afterSelection = value.substring(end);
    let lineEnd = end + afterSelection.indexOf('\n');
    if (afterSelection.indexOf('\n') === -1) {
      lineEnd = value.length;
    }

    const lineText = value.substring(lineStart, lineEnd);
    const lines = lineText.split('\n');

    let deltaLength = 0;
    const updatedLines = lines.map((line) => {
      // Check if line already starts with the prefix (allowing space variants)
      const trimPrefix = prefix.trim();
      const hasPrefix = line.trimStart().startsWith(trimPrefix);

      if (hasPrefix) {
        // Remove prefix
        // Handle regex-safe prefix matches
        const escapedPrefix = trimPrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`^(\\s*)${escapedPrefix}\\s*`);
        const updated = line.replace(regex, '$1');
        deltaLength += (updated.length - line.length);
        return updated;
      } else {
        // Add prefix at the beginning of the line content (after leading spaces)
        const leadingSpaces = line.match(/^(\s*)/)?.[1] || '';
        const lineContent = line.substring(leadingSpaces.length);
        const updated = `${leadingSpaces}${prefix}${lineContent}`;
        deltaLength += (updated.length - line.length);
        return updated;
      }
    });

    const before = value.substring(0, lineStart);
    const after = value.substring(lineEnd);
    onChange(before + updatedLines.join('\n') + after);

    setTimeout(() => {
      textarea.focus();
      // Adjust cursor positions according to the delta change
      textarea.setSelectionRange(
        Math.max(lineStart, start + (deltaLength > 0 ? prefix.length : -prefix.length)),
        Math.max(lineStart, end + deltaLength)
      );
    }, 0);
  };

  return (
    <div className="formatting-toolbar glass-panel">
      <div className="toolbar-group">
        <button
          className="toolbar-item-btn"
          onClick={() => insertFormatting('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold size={14} />
        </button>
        <button
          className="toolbar-item-btn"
          onClick={() => insertFormatting('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic size={14} />
        </button>
        <button
          className="toolbar-item-btn"
          onClick={() => toggleLinePrefix('## ')}
          title="Heading"
        >
          <Heading size={14} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-item-btn"
          onClick={() => insertFormatting('code')}
          title="Code"
        >
          <Code size={14} />
        </button>
        <button
          className="toolbar-item-btn"
          onClick={() => insertFormatting('link')}
          title="Link"
        >
          <Link size={14} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-item-btn"
          onClick={() => toggleLinePrefix('- ')}
          title="Bullet List"
        >
          <List size={14} />
        </button>
        <button
          className="toolbar-item-btn"
          onClick={() => toggleLinePrefix('- [ ] ')}
          title="Task List"
        >
          <CheckSquare size={14} />
        </button>
        <button
          className="toolbar-item-btn"
          onClick={() => toggleLinePrefix('> ')}
          title="Blockquote"
        >
          <Quote size={14} />
        </button>
      </div>
    </div>
  );
};
