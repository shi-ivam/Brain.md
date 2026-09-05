import React from 'react';
import { GraphNode, DifficultyLevel } from '../../types';

interface NodePlusPopoverProps {
  node: GraphNode;
  position: { x: number; y: number };
  difficulty: DifficultyLevel;
  onSelectAction: (
    action: 'add_question' | 'add_note' | 'generate_quiz' | 'expand_subtopics' | 'decompose_question' | 'subquestions' | 'tested_concepts',
    node: GraphNode
  ) => void;
  onClose: () => void;
}

export const NodePlusPopover: React.FC<NodePlusPopoverProps> = ({
  node,
  position,
  difficulty,
  onSelectAction,
  onClose,
}) => {
  const isQuestion = node.node_type === 'question';
  const isQuiz = node.node_type === 'quiz';
  const isNote = node.node_type === 'note';

  return (
    <div
      style={{
        position: 'absolute',
        left: `${position.x + 16}px`,
        top: `${position.y - 30}px`,
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-active)',
        borderRadius: '6px',
        padding: '8px',
        width: '260px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
          EXPAND: {node.title.slice(0, 24)}...
        </span>
        <button onClick={onClose} className="obsidian-btn-subtle" style={{ padding: '2px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {isQuestion ? (
        <>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('decompose_question', node)}
            title="Uses High Thinking to branch out foundational topics affecting this question"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tag-concept-text)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4m0-4h.01" />
            </svg>
            Decompose Influencing Topics
          </button>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('subquestions', node)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tag-question-text)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Branch Sub-Questions
          </button>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('add_note', node)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tag-note-text)" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Add Study Note
          </button>
        </>
      ) : isQuiz ? (
        <>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('tested_concepts', node)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tag-concept-text)" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
            </svg>
            Branch Tested Concepts
          </button>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('add_question', node)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tag-question-text)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
            Add Question on Quiz
          </button>
        </>
      ) : (
        <>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('add_question', node)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tag-question-text)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Add Question / Inquiry
          </button>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('add_note', node)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tag-note-text)" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Add / Edit Study Note
          </button>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('generate_quiz', node)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--tag-quiz-text)" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Generate Quiz ({difficulty.toUpperCase()})
          </button>
          <button
            className="obsidian-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '12px' }}
            onClick={() => onSelectAction('expand_subtopics', node)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            Expand Deeper Subtopics
          </button>
        </>
      )}
    </div>
  );
};
