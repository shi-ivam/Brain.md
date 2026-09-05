import React, { useState, useEffect } from 'react';
import { GraphNode, GraphEdge, Quiz, Inquiry, DifficultyLevel, KnowledgeGraphData } from '../../types';
import { NoteTab } from './NoteTab';
import { QuestionTab } from './QuestionTab';
import { QuizTab } from './QuizTab';
import { ConnectionsTab } from './ConnectionsTab';
import { MathText } from '../MathText';

interface RightInspectorProps {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  quizzes: Quiz[];
  inquiries: Inquiry[];
  difficulty: DifficultyLevel;
  initialTab?: 'notes' | 'questions' | 'quiz' | 'connections';
  onClose: () => void;
  onNodeUpdated: (nodeId: string, newContent: string) => void;
  onInquiryAdded: (inquiry: Inquiry, fullGraph?: KnowledgeGraphData) => void;
  onQuizzesGenerated: (newQuizzes: Quiz[], fullGraph?: KnowledgeGraphData) => void;
  onQuizAnswered: (quizId: string, selectedOption: number, isCorrect: boolean) => void;
  onSelectNode: (node: GraphNode) => void;
  onDecomposeQuestion: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
  onDetachQuiz?: (quizId: string) => Promise<void>;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  node,
  nodes,
  edges,
  quizzes,
  inquiries,
  difficulty,
  initialTab = 'notes',
  onClose,
  onNodeUpdated,
  onInquiryAdded,
  onQuizzesGenerated,
  onQuizAnswered,
  onSelectNode,
  onDecomposeQuestion,
  onDeleteNode,
  onDetachQuiz,
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'questions' | 'quiz' | 'connections'>(initialTab);

  useEffect(() => {
    if (node.node_type === 'quiz') {
      setActiveTab('quiz');
    } else if (node.node_type === 'question') {
      setActiveTab('notes');
    } else if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [node.id, initialTab, node.node_type]);

  const nodeQuizzes = quizzes.filter((q) => {
    if (q.node_id === node.id) return true;
    if (node.node_type === 'quiz') {
      if (node.parent_node_id && q.node_id === node.parent_node_id) return true;
      const isParent = edges.some(
        (e) => (e.source_id === q.node_id && e.target_id === node.id) ||
               (e.target_id === q.node_id && e.source_id === node.id)
      );
      if (isParent) return true;
    }
    if (node.node_type !== 'quiz') {
      const childQuizNodes = nodes.filter((n) => n.node_type === 'quiz' && n.parent_node_id === node.id);
      if (childQuizNodes.some((cq) => cq.id === q.node_id)) return true;
      const connectedQuizNodes = edges
        .filter((e) => e.source_id === node.id && (e.relation_type === 'quiz_for' || e.relation_type === 'tests_concept'))
        .map((e) => e.target_id);
      if (connectedQuizNodes.includes(q.node_id)) return true;
    }
    return false;
  });
  const nodeInquiries = inquiries.filter((q) => q.node_id === node.id);

  return (
    <aside
      style={{
        width: '640px',
        maxWidth: '92vw',
        backgroundColor: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        zIndex: 35,
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.4)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, marginRight: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`obsidian-badge badge-${node.node_type}`}>
              {node.node_type}
            </span>
            {node.difficulty && (
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {node.difficulty.toUpperCase()}
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '17px', margin: 0, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.35 }}>
            <MathText text={node.title} />
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onDeleteNode && (
            <button
              onClick={() => {
                if (window.confirm(`Delete node "${node.title}" from the graph?`)) {
                  onDeleteNode(node.id);
                }
              }}
              className="obsidian-btn-subtle"
              title="Delete Node from Graph"
              style={{ padding: '4px', color: '#f87171' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="obsidian-btn-subtle" title="Close Panel" style={{ padding: '4px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Obsidian Tab Navigation Strip */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-panel-secondary)',
        }}
      >
        <button
          onClick={() => setActiveTab('notes')}
          style={{
            flex: 1,
            padding: '11px 0',
            border: 'none',
            borderBottom: activeTab === 'notes' ? '2px solid var(--accent-purple)' : '2px solid transparent',
            backgroundColor: activeTab === 'notes' ? 'var(--bg-panel)' : 'transparent',
            color: activeTab === 'notes' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            fontWeight: activeTab === 'notes' ? 500 : 400,
            cursor: 'pointer',
          }}
        >
          Study Note
        </button>

        <button
          onClick={() => setActiveTab('questions')}
          style={{
            flex: 1,
            padding: '11px 0',
            border: 'none',
            borderBottom: activeTab === 'questions' ? '2px solid var(--tag-question-text)' : '2px solid transparent',
            backgroundColor: activeTab === 'questions' ? 'var(--bg-panel)' : 'transparent',
            color: activeTab === 'questions' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            fontWeight: activeTab === 'questions' ? 500 : 400,
            cursor: 'pointer',
          }}
        >
          Inquiries {nodeInquiries.length > 0 && `(${nodeInquiries.length})`}
        </button>

        <button
          onClick={() => setActiveTab('quiz')}
          style={{
            flex: 1,
            padding: '11px 0',
            border: 'none',
            borderBottom: activeTab === 'quiz' ? '2px solid var(--tag-quiz-text)' : '2px solid transparent',
            backgroundColor: activeTab === 'quiz' ? 'var(--bg-panel)' : 'transparent',
            color: activeTab === 'quiz' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            fontWeight: activeTab === 'quiz' ? 500 : 400,
            cursor: 'pointer',
          }}
        >
          Quizzes {nodeQuizzes.length > 0 && `(${nodeQuizzes.length})`}
        </button>

        <button
          onClick={() => setActiveTab('connections')}
          style={{
            flex: 1,
            padding: '11px 0',
            border: 'none',
            borderBottom: activeTab === 'connections' ? '2px solid var(--text-secondary)' : '2px solid transparent',
            backgroundColor: activeTab === 'connections' ? 'var(--bg-panel)' : 'transparent',
            color: activeTab === 'connections' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            fontWeight: activeTab === 'connections' ? 500 : 400,
            cursor: 'pointer',
          }}
        >
          Links
        </button>
      </div>

      {/* Tab Content Body */}
      <div style={{ flex: 1, padding: '18px 22px', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'notes' && (
          <NoteTab
            node={node}
            difficulty={difficulty}
            onNodeUpdated={onNodeUpdated}
            onDecomposeQuestion={onDecomposeQuestion}
          />
        )}

        {activeTab === 'questions' && (
          <QuestionTab
            node={node}
            inquiries={quizzes.length ? inquiries : inquiries}
            difficulty={difficulty}
            onInquiryAdded={onInquiryAdded}
            onDecomposeQuestion={onDecomposeQuestion}
          />
        )}

        {activeTab === 'quiz' && (
          <QuizTab
            node={node}
            quizzes={nodeQuizzes}
            difficulty={difficulty}
            onQuizzesGenerated={onQuizzesGenerated}
            onQuizAnswered={onQuizAnswered}
            onDetachQuiz={onDetachQuiz}
          />
        )}

        {activeTab === 'connections' && (
          <ConnectionsTab
            node={node}
            nodes={nodes}
            edges={edges}
            onSelectNode={onSelectNode}
          />
        )}
      </div>
    </aside>
  );
};
