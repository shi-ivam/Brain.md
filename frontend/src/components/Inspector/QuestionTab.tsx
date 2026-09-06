import React, { useState } from 'react';
import { GraphNode, Inquiry, DifficultyLevel, KnowledgeGraphData } from '../../types';
import { askInquiry, createNode, createEdge, fetchTopicGraph } from '../../services/api';
import { renderMarkdownWithMath } from '../../utils/mathRenderer';

interface QuestionTabProps {
  node: GraphNode;
  inquiries: Inquiry[];
  difficulty: DifficultyLevel;
  onInquiryAdded: (inquiry: Inquiry, fullGraph?: KnowledgeGraphData) => void;
  onDecomposeQuestion: (nodeId: string) => Promise<void>;
  onGraphUpdated?: (fullGraph: KnowledgeGraphData) => void;
}

export const QuestionTab: React.FC<QuestionTabProps> = ({
  node,
  inquiries,
  difficulty,
  onInquiryAdded,
  onDecomposeQuestion,
  onGraphUpdated,
}) => {
  const [questionText, setQuestionText] = useState('');
  const [pinToGraph, setPinToGraph] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [activeInquiryId, setActiveInquiryId] = useState<string | null>(null);
  const [creatingNodeInqId, setCreatingNodeInqId] = useState<string | null>(null);
  const [createdNodeInqIds, setCreatedNodeInqIds] = useState<Set<string>>(new Set());

  // Filter inquiries related to this node
  const nodeInquiries = inquiries.filter((q) => q.node_id === node.id);

  const handleAsk = async (e?: React.FormEvent, customQ?: string) => {
    if (e) e.preventDefault();
    const query = customQ || questionText.trim();
    if (!query || isAsking) return;

    setIsAsking(true);
    try {
      const res = await askInquiry(node.id, query, difficulty, pinToGraph);
      onInquiryAdded(res.inquiry, res.full_graph);
      setActiveInquiryId(res.inquiry.id);
      setQuestionText('');
    } catch (err) {
      console.error('Failed to answer inquiry:', err);
    } finally {
      setIsAsking(false);
    }
  };

  const handleDecompose = async () => {
    setIsDecomposing(true);
    try {
      await onDecomposeQuestion(node.id);
    } catch (err) {
      console.error('Failed to decompose question:', err);
    } finally {
      setIsDecomposing(false);
    }
  };

  const handleCreateLinkedQuestionNode = async (inq: Inquiry) => {
    if (creatingNodeInqId) return;
    setCreatingNodeInqId(inq.id);
    try {
      const title = inq.question.length > 55 ? inq.question.slice(0, 52) + '...' : inq.question;
      const content = `### Question\n${inq.question}\n\n### Insight & Derivation\n${inq.answer}`;

      const newNode = await createNode({
        topic_id: node.topic_id,
        title,
        node_type: 'question',
        summary: inq.question,
        content,
        parent_node_id: node.id,
        difficulty: node.difficulty || 'intermediate',
        pos_x: (node.pos_x || 400) + 180,
        pos_y: (node.pos_y || 300) + 60,
      });

      await createEdge({
        topic_id: node.topic_id,
        source_id: node.id,
        target_id: newNode.id,
        relation_type: 'inquiry_branch',
        edge_type: 'question_branch',
        label: 'inquiry',
      });

      const updatedGraph = await fetchTopicGraph(node.topic_id);
      if (onGraphUpdated) {
        onGraphUpdated(updatedGraph);
      }
      setCreatedNodeInqIds((prev) => new Set(prev).add(inq.id));
    } catch (err) {
      console.error('Failed to create linked question node:', err);
    } finally {
      setCreatingNodeInqId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '14px' }}>
      {/* If this node has question content or summary, display formulation card */}
      {(node.content || node.summary) && (
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--tag-question-text)', letterSpacing: '0.04em' }}>
              QUESTION FORMULATION & CHALLENGE
            </span>
            {node.node_type === 'question' && (
              <button
                onClick={handleDecompose}
                disabled={isDecomposing}
                className="obsidian-btn"
                style={{
                  fontSize: '11.5px',
                  padding: '3px 8px',
                  borderColor: 'var(--tag-question-border)',
                  color: 'var(--tag-question-text)',
                  backgroundColor: 'var(--tag-question-bg)',
                }}
              >
                {isDecomposing ? 'Decomposing...' : 'Branch Influencing Topics'}
              </button>
            )}
          </div>
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(node.content || node.summary || '') }}
          />
        </div>
      )}

      {/* Ask Question Box */}
      <form
        onSubmit={handleAsk}
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Investigate & Inquire
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={pinToGraph}
              onChange={(e) => setPinToGraph(e.target.checked)}
              style={{ accentColor: 'var(--accent-purple)' }}
            />
            Pin as Node in Graph
          </label>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            placeholder={`Ask a deep Socratic question about ${node.title}...`}
            disabled={isAsking}
            style={{
              flex: 1,
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: '13.5px',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!questionText.trim() || isAsking}
            className="obsidian-btn obsidian-btn-primary"
            style={{ fontSize: '12.5px', padding: '0 14px' }}
          >
            {isAsking ? 'Thinking...' : 'Ask AI'}
          </button>
        </div>
      </form>

      {/* Inquiries History */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
        {nodeInquiries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '13.5px' }}>
            No inquiry records yet for this concept. Ask a question above or click any suggested prompt.
          </div>
        ) : (
          nodeInquiries.map((inq) => {
            const isExpanded = activeInquiryId === inq.id || nodeInquiries.length === 1;
            return (
              <div
                key={inq.id}
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  onClick={() => setActiveInquiryId(isExpanded ? null : inq.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '13.5px', fontWeight: 500, color: '#bae6fd' }}>
                    Q: {inq.question}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(inq.answer) }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleCreateLinkedQuestionNode(inq)}
                        disabled={creatingNodeInqId === inq.id || createdNodeInqIds.has(inq.id)}
                        className="obsidian-btn"
                        style={{
                          fontSize: '11px',
                          padding: '4px 10px',
                          borderColor: createdNodeInqIds.has(inq.id) ? '#10b981' : 'var(--tag-question-border)',
                          color: createdNodeInqIds.has(inq.id) ? '#34d399' : 'var(--tag-question-text)',
                          backgroundColor: createdNodeInqIds.has(inq.id) ? 'rgba(16, 185, 129, 0.12)' : 'rgba(125, 211, 252, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                        title="Fork this question and explanation as an independent linked Question node in the canvas"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        {creatingNodeInqId === inq.id
                          ? 'Creating Node...'
                          : createdNodeInqIds.has(inq.id)
                          ? '✓ Linked to Graph'
                          : '+ Create Linked Question Node'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
