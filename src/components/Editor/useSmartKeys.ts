import React from 'react';

const PAIRS: Record<string, string> = {
  '[': ']',
  '(': ')',
  '{': '}',
  '`': '`',
  '"': '"',
  '*': '*',
  '_': '_',
};

const OPENING_CHARS = new Set(Object.keys(PAIRS));

export function useSmartKeys(
  _textareaRef: React.RefObject<HTMLTextAreaElement | null>, // Kept in signature for compatibility
  _value: string, // Kept in signature for compatibility
  onChange: (newValue: string) => void
) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // -------------------------------------------------------------
    // 0. CONTROL KEY COMBINATIONS SAFEGUARD (Ctrl+Z, Ctrl+V, etc.)
    // -------------------------------------------------------------
    if (e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    const textarea = e.currentTarget;
    const { selectionStart, selectionEnd } = textarea;
    const text = textarea.value;

    const insertText = (textToInsert: string) => {
      try {
        document.execCommand('insertText', false, textToInsert);
      } catch (err) {
        console.error('execCommand failed:', err);
        // Programmatic fallback
        const before = text.substring(0, selectionStart);
        const after = text.substring(selectionEnd);
        onChange(before + textToInsert + after);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(selectionStart + textToInsert.length, selectionStart + textToInsert.length);
        }, 0);
      }
    };

    // -------------------------------------------------------------
    // 1. TAB INDENTATION & OUTDENTATION (TAB / SHIFT+TAB)
    // -------------------------------------------------------------
    if (e.key === 'Tab') {
      e.preventDefault();
      
      const isShift = e.shiftKey;
      const start = selectionStart;
      const end = selectionEnd;

      const lines = text.split('\n');
      let currentPos = 0;
      const lineRanges: { index: number; start: number; end: number; text: string }[] = [];

      for (let i = 0; i < lines.length; i++) {
        const lineStart = currentPos;
        const lineEnd = currentPos + lines[i].length;
        
        if (
          (lineStart <= start && start <= lineEnd) ||
          (lineStart <= end && end <= lineEnd) ||
          (start <= lineStart && lineEnd <= end)
        ) {
          lineRanges.push({
            index: i,
            start: lineStart,
            end: lineEnd,
            text: lines[i]
          });
        }
        currentPos = lineEnd + 1;
      }

      let newText = '';
      let deltaStart = 0;
      let deltaEnd = 0;

      const updatedLines = [...lines];

      for (const range of lineRanges) {
        const originalLine = range.text;
        let newLine = originalLine;

        if (isShift) {
          if (originalLine.startsWith('  ')) {
            newLine = originalLine.slice(2);
            if (range.index === lineRanges[0].index) deltaStart -= 2;
            deltaEnd -= 2;
          } else if (originalLine.startsWith(' ')) {
            newLine = originalLine.slice(1);
            if (range.index === lineRanges[0].index) deltaStart -= 1;
            deltaEnd -= 1;
          }
        } else {
          newLine = '  ' + originalLine;
          if (range.index === lineRanges[0].index) deltaStart += 2;
          deltaEnd += 2;
        }

        updatedLines[range.index] = newLine;
      }

      newText = updatedLines.join('\n');
      onChange(newText);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          Math.max(0, start + deltaStart),
          Math.max(0, end + deltaEnd)
        );
      }, 0);
      return;
    }

    // -------------------------------------------------------------
    // 2. BACKSPACE ON EMPTY PAIR (DELETES BOTH MATCHING CHARS)
    // -------------------------------------------------------------
    if (e.key === 'Backspace' && selectionStart === selectionEnd && selectionStart > 0) {
      const charBefore = text[selectionStart - 1];
      const charAfter = text[selectionStart];

      if (PAIRS[charBefore] === charAfter) {
        e.preventDefault();
        textarea.setSelectionRange(selectionStart - 1, selectionStart + 1);
        document.execCommand('delete');
        return;
      }
    }

    // -------------------------------------------------------------
    // 3. AUTO-PAIRS (BRACKETS & MD WRAPPERS)
    // -------------------------------------------------------------
    if (OPENING_CHARS.has(e.key)) {
      e.preventDefault();
      const opening = e.key;
      const closing = PAIRS[opening];
      const start = selectionStart;
      const end = selectionEnd;

      if (opening === '[' && start === end && start > 0 && text[start - 1] === '[') {
        textarea.setSelectionRange(start - 1, start);
        insertText('[[]]');
        textarea.setSelectionRange(start + 1, start + 1);
        return;
      }

      if (start !== end) {
        const selectedText = text.substring(start, end);
        insertText(opening + selectedText + closing);
        textarea.setSelectionRange(start + 1, end + 1);
      } else {
        insertText(opening + closing);
        textarea.setSelectionRange(start + 1, start + 1);
      }
      return;
    }

    // -------------------------------------------------------------
    // 4. SMART ENTER (LIST CONTINUATIONS)
    // -------------------------------------------------------------
    if (e.key === 'Enter' && selectionStart === selectionEnd) {
      const lineStartPos = text.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLineText = text.slice(lineStartPos, selectionStart);

      const match = currentLineText.match(/^(\s*)([-*+]|\d+\.)\s(\[[ x]\]\s)?(.*)$/);

      if (match) {
        e.preventDefault();
        const indent = match[1];
        const marker = match[2];
        const checkbox = match[3];
        const content = match[4];

        if (content.trim() === '') {
          textarea.setSelectionRange(lineStartPos, selectionStart);
          insertText(indent + '\n');
          return;
        }

        let nextMarker = marker;
        if (/^\d+\.$/.test(marker)) {
          const num = parseInt(marker, 10);
          nextMarker = `${num + 1}.`;
        }

        let nextCheckbox = '';
        if (checkbox) {
          nextCheckbox = '- [ ] ';
        }

        const continuationStr = checkbox 
          ? `\n${indent}${nextCheckbox}`
          : `\n${indent}${nextMarker} `;

        insertText(continuationStr);
      }
    }
  };

  return { onKeyDown };
}
