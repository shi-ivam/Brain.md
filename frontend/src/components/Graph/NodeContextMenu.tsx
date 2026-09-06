import React, { useEffect, useRef } from 'react';
import { GraphNode } from '../../types';

interface NodeContextMenuProps {
  node: GraphNode;
  position: { x: number; y: number };
  onInspect: (node: GraphNode) => void;
  onSynthesizeNote?: (node: GraphNode) => void;
  onDecomposeQuestion?: (nodeId: string) => void;
  onOpenQuiz?: (node: GraphNode) => void;
  onOpenResources?: (node: GraphNode) => void;
  onOpenVisualizations?: (node: GraphNode) => void;
  onOpenSlides?: (node: GraphNode) => void;
  onToggleDone?: (node: GraphNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
  node,
  position,
  onInspect,
  onSynthesizeNote,
  onDecomposeQuestion,
  onOpenQuiz,
  onOpenResources,
  onOpenVisualizations,
  onOpenSlides,
  onToggleDone,
  onDeleteNode,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust positioning if near screen edges
  const menuWidth = 220;
  const menuHeight = 210;
  const left = Math.min(position.x, window.innerWidth - menuWidth - 10);
  const top = Math.min(position.y, window.innerHeight - menuHeight - 10);

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
        borderRadius: '6px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.65)',
        zIndex: 100,
        padding: '5px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        userSelect: 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Node Mini Header */}
      <div
        style={{
          padding: '6px 8px 6px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '3px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <span className={`obsidian-badge badge-${node.node_type}`} style={{ fontSize: '11px', padding: '2px 6px' }}>
            {node.node_type.toUpperCase()}
          </span>
          {node.difficulty && (
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {node.difficulty.toUpperCase()}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: '13.5px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={node.title}
        >
          {node.title}
        </div>
      </div>

      {/* Action: Open Inspector */}
      <button
        onClick={() => {
          onInspect(node);
          onClose();
        }}
        className="obsidian-btn-subtle"
        style={{
          justifyContent: 'flex-start',
          fontSize: '13.5px',
          padding: '7px 9px',
          borderRadius: '4px',
          gap: '8px',
          width: '100%',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        Inspect Study Note
      </button>

      {/* Action: Toggle Done */}
      {onToggleDone && (
        <button
          onClick={() => {
            onToggleDone(node);
            onClose();
          }}
          className="obsidian-btn-subtle"
          style={{
            justifyContent: 'flex-start',
            fontSize: '13.5px',
            padding: '7px 9px',
            borderRadius: '4px',
            gap: '8px',
            width: '100%',
            color: node.is_done ? '#10b981' : 'var(--text-secondary)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {node.is_done ? 'Mark as In Progress' : 'Mark as Completed'}
        </button>
      )}

      {/* Action: Question Decomposition (if question) */}
      {node.node_type === 'question' && onDecomposeQuestion && (
        <button
          onClick={() => {
            onDecomposeQuestion(node.id);
            onClose();
          }}
          className="obsidian-btn-subtle"
          style={{
            justifyContent: 'flex-start',
            fontSize: '13.5px',
            padding: '7px 9px',
            borderRadius: '4px',
            gap: '8px',
            width: '100%',
            color: 'var(--tag-question-text)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          Branch Influencing Topics
        </button>
      )}

      {/* Action: Generate Quiz (if concept/prerequisite/subtopic) */}
      {node.node_type !== 'question' && node.node_type !== 'quiz' && onOpenQuiz && (
        <button
          onClick={() => {
            onOpenQuiz(node);
            onClose();
          }}
          className="obsidian-btn-subtle"
          style={{
            justifyContent: 'flex-start',
            fontSize: '13.5px',
            padding: '7px 9px',
            borderRadius: '4px',
            gap: '8px',
            width: '100%',
            color: 'var(--tag-quiz-text)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          Open Quiz Challenges
        </button>
      )}

      {/* Action: Synthesize Deep Note */}
      {onSynthesizeNote && node.node_type !== 'quiz' && (
        <button
          onClick={() => {
            onSynthesizeNote(node);
            onClose();
          }}
          className="obsidian-btn-subtle"
          style={{
            justifyContent: 'flex-start',
            fontSize: '13.5px',
            padding: '7px 9px',
            borderRadius: '4px',
            gap: '8px',
            width: '100%',
            color: 'var(--tag-concept-text)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Synthesize Deep Note
        </button>
      )}

      {/* Action: Open Resources */}
      {onOpenResources && (
        <button
          onClick={() => {
            onOpenResources(node);
            onClose();
          }}
          className="obsidian-btn-subtle"
          style={{
            justifyContent: 'flex-start',
            fontSize: '13.5px',
            padding: '7px 9px',
            borderRadius: '4px',
            gap: '8px',
            width: '100%',
            color: '#f87171',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          Attached Resources
        </button>
      )}

      {/* Action: Visualizations */}
      {onOpenVisualizations && (
        <button
          onClick={() => {
            onOpenVisualizations(node);
            onClose();
          }}
          className="obsidian-btn-subtle"
          style={{
            justifyContent: 'flex-start',
            fontSize: '13.5px',
            padding: '7px 9px',
            borderRadius: '4px',
            gap: '8px',
            width: '100%',
            color: '#818cf8',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          Visualizations & Diagrams
        </button>
      )}

      {/* Action: Study Slides */}
      {onOpenSlides && (
        <button
          onClick={() => {
            onOpenSlides(node);
            onClose();
          }}
          className="obsidian-btn-subtle"
          style={{
            justifyContent: 'flex-start',
            fontSize: '13.5px',
            padding: '7px 9px',
            borderRadius: '4px',
            gap: '8px',
            width: '100%',
            color: '#38bdf8',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Study Slides (View / PPTX)
        </button>
      )}

      <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '3px 0' }} />

      {/* Action: Delete Node */}
      <button
        onClick={() => {
          if (window.confirm(`Are you sure you want to delete "${node.title}"?`)) {
            onDeleteNode(node.id);
          }
          onClose();
        }}
        className="obsidian-btn-subtle"
        style={{
          justifyContent: 'flex-start',
          fontSize: '13.5px',
          padding: '7px 9px',
          borderRadius: '4px',
          gap: '8px',
          width: '100%',
          color: '#f87171',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        Delete Node
      </button>
    </div>
  );
};
