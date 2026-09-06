import React, { useEffect, useRef, useState } from 'react';
import { NodeType, GraphNode } from '../../types';

interface TextSelectionContextMenuProps {
  selectedText: string;
  position: { x: number; y: number };
  currentNode: GraphNode;
  canConvertToWikilink: boolean;
  onClose: () => void;
  onCreateNode: (params: {
    nodeType: NodeType;
    title: string;
    convertToWikilink: boolean;
  }) => Promise<void>;
}

export const TextSelectionContextMenu: React.FC<TextSelectionContextMenuProps> = ({
  selectedText,
  position,
  currentNode,
  canConvertToWikilink,
  onClose,
  onCreateNode,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanedText = selectedText.trim().replace(/\s+/g, ' ');
  const defaultTitle = cleanedText.length > 70 ? cleanedText.slice(0, 67) + '...' : cleanedText;

  const [title, setTitle] = useState(defaultTitle);
  const [convertToWikilink, setConvertToWikilink] = useState(canConvertToWikilink);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedType, setSelectedType] = useState<NodeType>('concept');

  // Focus the input upon mounting
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleCreate = async (type: NodeType) => {
    const finalTitle = title.trim() || defaultTitle;
    setIsSubmitting(true);
    try {
      await onCreateNode({
        nodeType: type,
        title: finalTitle,
        convertToWikilink: canConvertToWikilink && convertToWikilink,
      });
      onClose();
    } catch (err) {
      console.error('Failed to create node from selection:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clamped positioning
  const menuWidth = 280;
  const menuHeight = 320;
  const left = Math.max(12, Math.min(position.x, window.innerWidth - menuWidth - 16));
  const top = Math.max(12, Math.min(position.y, window.innerHeight - menuHeight - 16));

  const NODE_TYPES: { type: NodeType; label: string; color: string; desc: string }[] = [
    { type: 'concept', label: 'Concept', color: 'var(--tag-concept-text)', desc: 'Core subject concept' },
    { type: 'subtopic', label: 'Subtopic', color: 'var(--text-secondary)', desc: 'Sub-branching knowledge topic' },
    { type: 'question', label: 'Question', color: 'var(--tag-question-text)', desc: 'Inquiry or open paradox' },
    { type: 'prerequisite', label: 'Prerequisite', color: 'var(--tag-prereq-text)', desc: 'Required foundation' },
    { type: 'note', label: 'Study Note', color: 'var(--tag-note-text)', desc: 'Detailed annotation node' },
  ];

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${menuWidth}px`,
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-active)',
        borderRadius: '8px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.75)',
        zIndex: 1000,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        userSelect: 'none',
        backdropFilter: 'blur(12px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#bfa4f8" strokeWidth="2.5">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            CREATE NODE FROM SELECTION
          </span>
        </div>
        <button
          onClick={onClose}
          className="obsidian-btn-subtle"
          style={{ padding: '2px', color: 'var(--text-muted)' }}
          title="Close"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Editable Node Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCreate(selectedType);
            }
          }}
          placeholder="Node title..."
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            outline: 'none',
          }}
        />
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Connected to: <strong>{currentNode.title.slice(0, 18)}...</strong></span>
          <span>{title.length} chars</span>
        </div>
      </div>

      {/* Convert to Wikilink Toggle (if in notes) */}
      {canConvertToWikilink && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '2px 0',
          }}
        >
          <input
            type="checkbox"
            checked={convertToWikilink}
            onChange={(e) => setConvertToWikilink(e.target.checked)}
            style={{ accentColor: 'var(--accent-purple)', cursor: 'pointer' }}
          />
          <span>Replace in note with <code style={{ color: '#c4b5fd', fontSize: '10px' }}>[[{title.slice(0, 14)}...]]</code></span>
        </label>
      )}

      <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

      {/* Node Type Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {NODE_TYPES.map((nt) => (
          <button
            key={nt.type}
            disabled={isSubmitting}
            onClick={() => handleCreate(nt.type)}
            className="obsidian-btn-subtle"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 8px',
              fontSize: '12px',
              borderRadius: '4px',
              width: '100%',
              textAlign: 'left',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={() => setSelectedType(nt.type)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: nt.color,
                  display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>New {nt.label}</span>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{nt.desc}</span>
          </button>
        ))}
      </div>

      {isSubmitting && (
        <div style={{ fontSize: '11px', color: '#38bdf8', textAlign: 'center', paddingTop: '4px' }}>
          Creating node and updating graph...
        </div>
      )}
    </div>
  );
};
