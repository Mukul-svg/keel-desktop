import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X, Type, RefreshCw, CheckCheck } from 'lucide-react';

interface FindReplaceProps {
  isOpen: boolean;
  mode: 'find' | 'replace';
  content: string;
  onReplace: (newContent: string) => void;
  onClose: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface Match {
  start: number;
  end: number;
  text: string;
}

export const FindReplace: React.FC<FindReplaceProps> = ({
  isOpen,
  mode,
  content,
  onReplace,
  onClose,
  textareaRef,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when panel opens or mode changes
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [isOpen, mode]);

  // Find all matches whenever query, content, or case sensitivity changes
  useEffect(() => {
    if (!searchQuery) {
      setMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    try {
      // Escape special regex characters to avoid crash on partial typing
      const escapedQuery = searchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const flags = isCaseSensitive ? 'g' : 'gi';
      const regex = new RegExp(escapedQuery, flags);
      
      const newMatches: Match[] = [];
      let match;
      
      // Prevent infinite loop with empty matches
      while ((match = regex.exec(content)) !== null) {
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
        newMatches.push({
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        });
      }

      setMatches(newMatches);

      // Keep current index if valid, otherwise reset to 0 (if matches exist) or -1
      if (newMatches.length > 0) {
        if (currentMatchIndex < 0 || currentMatchIndex >= newMatches.length) {
          setCurrentMatchIndex(0);
        }
      } else {
        setCurrentMatchIndex(-1);
      }
    } catch (err) {
      console.error('Regex match error:', err);
      setMatches([]);
      setCurrentMatchIndex(-1);
    }
  }, [searchQuery, content, isCaseSensitive]);

  // Select current match in the textarea
  const selectMatch = (index: number, matchArray: Match[] = matches) => {
    const textarea = textareaRef.current;
    if (!textarea || index < 0 || index >= matchArray.length) return;

    const match = matchArray[index];
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);

    // Scroll textarea to make match visible if possible
    // Standard textarea doesn't support scrollIntoView for selections easily,
    // but setting selectionRange + focus scrolls it in WebView2.
    // To make sure it's visible, we can compute height approximation or just let focus handle it.
    const lineHeight = 20; // approximate
    const textBefore = content.substring(0, match.start);
    const numLinesBefore = textBefore.split('\n').length;
    const scrollPos = (numLinesBefore - 5) * lineHeight;
    if (scrollPos > 0) {
      textarea.scrollTop = scrollPos;
    } else {
      textarea.scrollTop = 0;
    }
  };

  // Trigger selection when current index changes
  useEffect(() => {
    if (currentMatchIndex >= 0 && matches.length > 0) {
      selectMatch(currentMatchIndex);
    }
  }, [currentMatchIndex]);

  const handleNext = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  };

  const handlePrev = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  const handleReplace = () => {
    if (matches.length === 0 || currentMatchIndex < 0 || currentMatchIndex >= matches.length) return;

    const match = matches[currentMatchIndex];
    const before = content.substring(0, match.start);
    const after = content.substring(match.end);
    const newContent = before + replaceQuery + after;

    onReplace(newContent);

    // After replacement, selection is updated. We must select the NEXT match.
    // The matches will automatically recalculate due to content change.
    // Since matches shifted, let's keep the currentMatchIndex the same so it points to the new match at this index.
    // If it was the last match, let it wrap around or stay valid.
    setTimeout(() => {
      if (matches.length > 1) {
        // Recalculate index if out of bounds
        const nextIndex = currentMatchIndex >= matches.length - 1 ? 0 : currentMatchIndex;
        setCurrentMatchIndex(nextIndex);
      }
    }, 50);
  };

  const handleReplaceAll = () => {
    if (!searchQuery || matches.length === 0) return;

    const escapedQuery = searchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const flags = isCaseSensitive ? 'g' : 'gi';
    const regex = new RegExp(escapedQuery, flags);
    const newContent = content.replace(regex, replaceQuery);

    onReplace(newContent);
    setMatches([]);
    setCurrentMatchIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrev();
      } else {
        handleNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="find-replace-bar glass-panel" onKeyDown={handleKeyDown}>
      <div className="find-row">
        <div className="input-group">
          <Search size={14} className="input-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="find-input"
            placeholder="Find..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            className={`case-toggle ${isCaseSensitive ? 'active' : ''}`}
            onClick={() => setIsCaseSensitive(!isCaseSensitive)}
            title="Case Sensitive"
          >
            <Type size={14} />
          </button>
        </div>

        <div className="match-counter">
          {matches.length > 0
            ? `${currentMatchIndex + 1} of ${matches.length}`
            : searchQuery
            ? 'No matches'
            : '0 matches'}
        </div>

        <div className="action-buttons">
          <button className="nav-btn" onClick={handlePrev} disabled={matches.length === 0} title="Previous (Shift+Enter)">
            <ChevronUp size={14} />
          </button>
          <button className="nav-btn" onClick={handleNext} disabled={matches.length === 0} title="Next (Enter)">
            <ChevronDown size={14} />
          </button>
          <button className="close-btn" onClick={onClose} title="Close (Esc)">
            <X size={14} />
          </button>
        </div>
      </div>

      {mode === 'replace' && (
        <div className="replace-row">
          <div className="input-group">
            <RefreshCw size={14} className="input-icon" />
            <input
              type="text"
              className="replace-input"
              placeholder="Replace with..."
              value={replaceQuery}
              onChange={(e) => setReplaceQuery(e.target.value)}
            />
          </div>

          <div className="action-buttons replace-actions">
            <button
              className="action-btn text-btn"
              onClick={handleReplace}
              disabled={matches.length === 0}
            >
              <RefreshCw size={12} /> Replace
            </button>
            <button
              className="action-btn text-btn"
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
            >
              <CheckCheck size={12} /> Replace All
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
