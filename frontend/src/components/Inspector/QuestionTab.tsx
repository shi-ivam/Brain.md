import React, { useState } from 'react';
import { GraphNode, Inquiry, DifficultyLevel, KnowledgeGraphData } from '../../types';
import { askInquiry } from '../../services/api';
import { renderMarkdownWithMath } from '../../utils/mathRenderer';

interface QuestionTabProps {
  node: GraphNode;
  inquiries: Inquiry[];
  difficulty: DifficultyLevel;
  onInquiryAdded: (inquiry: Inquiry, fullGraph?: KnowledgeGraphData) => void;
  onDecomposeQuestion: (nodeId: string) => Promise<void>;
}

export const QuestionTab: React.FC<QuestionTabProps> = ({
  node,
  inquiries,
  difficulty,
  onInquiryAdded,
  onDecomposeQuestion,
}) => {
  const [questionText, setQuestionText] = useState('');
  const [pinToGraph, setPinToGraph] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [activeInquiryId, setActiveInquiryId] = useState<string | null>(null);

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
                  <div style={{ marginTop: '6px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(inq.answer) }}
                    />
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
