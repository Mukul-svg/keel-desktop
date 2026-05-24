import React, { useEffect, useState } from 'react';
import { X, ListTree } from 'lucide-react';

interface HeadingItem {
  level: number;
  text: string;
  index: number; // Index among all headings
  lineIndex: number; // Line number in raw markdown
  charIndex: number; // Character index in raw markdown
}

interface TOCProps {
  content: string;
  isOpen: boolean;
  onClose: () => void;
  previewRef?: React.RefObject<HTMLDivElement | null>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  isPreviewMode: boolean;
}

export const TableOfContents: React.FC<TOCProps> = ({
  content,
  isOpen,
  onClose,
  previewRef,
  textareaRef,
  isPreviewMode,
}) => {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);

  // Parse headings from markdown content
  useEffect(() => {
    const lines = content.split('\n');
    const parsedHeadings: HeadingItem[] = [];
    let charAccumulator = 0;
    let headingCount = 0;

    lines.forEach((line, lineIndex) => {
      // Matches standard GFM headers: # Header
      // Skip headers inside code fences (blocks of ```)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      // Basic check to see if we are in a code fence could be complex, but for TOC we can simply skip lines starting with codes or indentations
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].replace(/\[(.*?)\]\(.*?\)/g, '$1') // Strip links
                                  .replace(/[*_`~]/g, '') // Strip styles
                                  .trim();
        
        parsedHeadings.push({
          level,
          text,
          index: headingCount++,
          lineIndex,
          charIndex: charAccumulator,
        });
      }
      charAccumulator += line.length + 1; // +1 for the newline character
    });

    setHeadings(parsedHeadings);
  }, [content]);

  const handleHeadingClick = (heading: HeadingItem) => {
    if (isPreviewMode && previewRef?.current) {
      // Find the N-th header element in the preview DOM
      const headerElements = previewRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (headerElements && headerElements[heading.index]) {
        headerElements[heading.index].scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    } else if (!isPreviewMode && textareaRef?.current) {
      const textarea = textareaRef.current;
      textarea.focus();
      
      // Set cursor selection to the beginning of the header line
      textarea.setSelectionRange(heading.charIndex, heading.charIndex + heading.text.length + heading.level + 1);

      // Scroll textarea to the header line
      const lineHeight = 20; // Approx line height in pixels
      const targetScrollTop = Math.max(0, (heading.lineIndex - 3) * lineHeight);
      textarea.scrollTop = targetScrollTop;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="toc-panel glass-panel">
      <div className="toc-header">
        <div className="toc-title-wrapper">
          <ListTree size={14} className="toc-icon" />
          <span>Outline</span>
        </div>
        <button className="toc-close-btn" onClick={onClose} title="Close Outline">
          <X size={14} />
        </button>
      </div>

      <div className="toc-body">
        {headings.length === 0 ? (
          <div className="toc-empty">No headings found. Add headings like # Introduction to see them here.</div>
        ) : (
          <nav className="toc-list">
            {headings.map((heading, i) => (
              <button
                key={i}
                className={`toc-item toc-level-${heading.level}`}
                onClick={() => handleHeadingClick(heading)}
                style={{
                  paddingLeft: `${(heading.level - 1) * 12 + 8}px`,
                }}
              >
                <span className="toc-item-bullet">•</span>
                <span className="toc-item-text">{heading.text}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
};
