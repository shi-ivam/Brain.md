import React, { useState, useEffect } from 'react';
import { GraphNode, GraphEdge, Quiz, Inquiry, DifficultyLevel, KnowledgeGraphData, NodeType } from '../../types';
import { NoteTab } from './NoteTab';
import { QuestionTab } from './QuestionTab';
import { QuizTab } from './QuizTab';
import { ConnectionsTab } from './ConnectionsTab';
import { TextSelectionContextMenu } from './TextSelectionContextMenu';
import { MathText } from '../MathText';
import { createNode, createEdge, fetchTopicGraph, saveNodeNote } from '../../services/api';

interface RightInspectorProps {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  quizzes: Quiz[];
  inquiries: Inquiry[];
  difficulty: DifficultyLevel;
  initialTab?: 'notes' | 'questions' | 'quiz' | 'connections';
  targetSection?: string;
  onClose: () => void;
  onNodeUpdated: (nodeId: string, newContent: string) => void;
  onInquiryAdded: (inquiry: Inquiry, fullGraph?: KnowledgeGraphData) => void;
  onQuizzesGenerated: (newQuizzes: Quiz[], fullGraph?: KnowledgeGraphData) => void;
  onQuizAnswered: (quizId: string, selectedOption: number, isCorrect: boolean) => void;
  onSelectNode: (node: GraphNode) => void;
  onDecomposeQuestion: (nodeId: string) => Promise<void>;
  onDeleteNode?: (nodeId: string) => Promise<void>;
  onDetachQuiz?: (quizId: string) => Promise<void>;
  onGraphUpdated?: (fullGraph: KnowledgeGraphData) => void;
  onTabChange?: (tab: 'notes' | 'questions' | 'quiz' | 'connections') => void;
  onToggleDone?: (node: GraphNode) => void;
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  node,
  nodes,
  edges,
  quizzes,
  inquiries,
  difficulty,
  initialTab = 'notes',
  targetSection,
  onClose,
  onNodeUpdated,
  onInquiryAdded,
  onQuizzesGenerated,
  onQuizAnswered,
  onSelectNode,
  onDecomposeQuestion,
  onDeleteNode,
  onDetachQuiz,
  onGraphUpdated,
  onTabChange,
  onToggleDone,
}) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'questions' | 'quiz' | 'connections'>(initialTab);
  const [selectionMenu, setSelectionMenu] = useState<{
    selectedText: string;
    position: { x: number; y: number };
    canConvertToWikilink: boolean;
    textareaElement?: HTMLTextAreaElement | null;
  } | null>(null);
  const [createToast, setCreateToast] = useState<string | null>(null);

  const handleTabClick = (tab: 'notes' | 'questions' | 'quiz' | 'connections') => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  const handleInspectorContextMenu = (e: React.MouseEvent) => {
    let text = '';
    let textareaEl: HTMLTextAreaElement | null = null;
    const target = e.target as HTMLElement | null;

    if (target && target.tagName === 'TEXTAREA') {
      const ta = target as HTMLTextAreaElement;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      if (start !== end) {
        text = ta.value.substring(start, end).trim();
        textareaEl = ta;
      }
    } else {
      const sel = window.getSelection();
      text = sel ? sel.toString().trim() : '';
    }

    if (text && text.length > 0) {
      e.preventDefault();
      setSelectionMenu({
        selectedText: text,
        position: { x: e.clientX, y: e.clientY },
        canConvertToWikilink: activeTab === 'notes',
        textareaElement: textareaEl,
      });
    }
  };

  const handleCreateNodeFromSelection = async ({
    nodeType,
    title,
    convertToWikilink,
  }: {
    nodeType: NodeType;
    title: string;
    convertToWikilink: boolean;
  }) => {
    if (!selectionMenu) return;
    const { selectedText, textareaElement } = selectionMenu;

    try {
      const posX = (node.pos_x || 400) + (nodeType === 'prerequisite' ? -260 : 260);
      const posY = (node.pos_y || 300) + (Math.random() * 80 - 40);

      const newNode = await createNode({
        topic_id: node.topic_id,
        title,
        node_type: nodeType,
        summary: selectedText,
        content: `# ${title}\n\nExtracted from [[${node.title}]]:\n> ${selectedText}\n`,
        parent_node_id: node.id,
        difficulty: node.difficulty || 'intermediate',
        pos_x: posX,
        pos_y: posY,
      });

      let relType = 'subtopic_of';
      let edgeType = 'subtopic_of';
      let label = 'subtopic';

      if (nodeType === 'question') {
        relType = 'question_for';
        edgeType = 'question_for';
        label = 'inquiry';
      } else if (nodeType === 'note') {
        relType = 'note_on';
        edgeType = 'note_on';
        label = 'note';
      } else if (nodeType === 'prerequisite') {
        relType = 'prerequisite_for';
        edgeType = 'prerequisite_for';
        label = 'prerequisite';
      }

      await createEdge({
        topic_id: node.topic_id,
        source_id: nodeType === 'prerequisite' ? newNode.id : node.id,
        target_id: nodeType === 'prerequisite' ? node.id : newNode.id,
        relation_type: relType,
        edge_type: edgeType,
        label,
      });

      if (convertToWikilink) {
        if (textareaElement) {
          const start = textareaElement.selectionStart;
          const end = textareaElement.selectionEnd;
          const val = textareaElement.value;
          const updatedVal = val.slice(0, start) + `[[${title}]]` + val.slice(end);
          textareaElement.value = updatedVal;
          textareaElement.dispatchEvent(new Event('input', { bubbles: true }));
          onNodeUpdated(node.id, updatedVal);
          await saveNodeNote(node.id, updatedVal);
        } else if (node.content && node.content.includes(selectedText)) {
          const updatedContent = node.content.replace(selectedText, `[[${title}]]`);
          onNodeUpdated(node.id, updatedContent);
          await saveNodeNote(node.id, updatedContent);
        }
      }

      const fullGraph = await fetchTopicGraph(node.topic_id);
      if (onGraphUpdated) {
        onGraphUpdated(fullGraph);
      }

      setCreateToast(`Created ${nodeType} node "${title}"`);
      setTimeout(() => setCreateToast(null), 3500);
    } catch (err) {
      console.error('Failed to create node from selection:', err);
    }
  };

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
            {onToggleDone && (
              <button
                onClick={() => onToggleDone(node)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: node.is_done ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                  backgroundColor: node.is_done ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  color: node.is_done ? '#10b981' : 'var(--text-secondary)',
                  fontSize: '11px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
                title={node.is_done ? 'Mark as In Progress' : 'Mark as Completed'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {node.is_done ? 'Completed' : 'Mark Done'}
              </button>
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
          onClick={() => handleTabClick('notes')}
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
          onClick={() => handleTabClick('questions')}
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
          onClick={() => handleTabClick('quiz')}
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
          onClick={() => handleTabClick('connections')}
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
      <div
        onContextMenu={handleInspectorContextMenu}
        style={{ flex: 1, padding: '18px 22px', overflowY: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}
      >
        {activeTab === 'notes' && (
          <NoteTab
            node={node}
            nodes={nodes}
            difficulty={difficulty}
            targetSection={targetSection}
            onNodeUpdated={onNodeUpdated}
            onDecomposeQuestion={onDecomposeQuestion}
            onSelectNode={onSelectNode}
            onGraphUpdated={onGraphUpdated}
          />
        )}

        {activeTab === 'questions' && (
          <QuestionTab
            node={node}
            inquiries={quizzes.length ? inquiries : inquiries}
            difficulty={difficulty}
            onInquiryAdded={onInquiryAdded}
            onDecomposeQuestion={onDecomposeQuestion}
            onGraphUpdated={onGraphUpdated}
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
            onGraphUpdated={onGraphUpdated}
          />
        )}

        {activeTab === 'connections' && (
          <ConnectionsTab
            node={node}
            nodes={nodes}
            edges={edges}
            onSelectNode={onSelectNode}
            onGraphUpdated={onGraphUpdated}
          />
        )}
      </div>

      {/* Context Menu on Text Selection */}
      {selectionMenu && (
        <TextSelectionContextMenu
          selectedText={selectionMenu.selectedText}
          position={selectionMenu.position}
          currentNode={node}
          canConvertToWikilink={selectionMenu.canConvertToWikilink}
          onClose={() => setSelectionMenu(null)}
          onCreateNode={handleCreateNodeFromSelection}
        />
      )}

      {/* Creation Success Toast */}
      {createToast && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            right: '24px',
            backgroundColor: '#064e3b',
            border: '1px solid #10b981',
            color: '#a7f3d0',
            padding: '7px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'var(--font-sans)',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.5)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>✓</span>
          <span>{createToast}</span>
        </div>
      )}
    </aside>
  );
};
