import React, { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { GraphNode, KnowledgeGraphData } from '../types';
import { fetchReviewQueue, recordNodeReview } from '../services/api';
import { MathText } from './MathText';
import { renderMarkdownWithMath } from '../utils/mathRenderer';

interface ReviewDrawerProps {
  isOpen: boolean;
  topicId?: string;
  topicTitle?: string;
  onClose: () => void;
  onReviewCompleted?: (fullGraph: KnowledgeGraphData) => void;
  onUpdateNodeMastery?: (nodeId: string, masteryScore: number) => void;
}

export const ReviewDrawer: React.FC<ReviewDrawerProps> = ({
  isOpen,
  topicId,
  topicTitle,
  onClose,
  onReviewCompleted,
  onUpdateNodeMastery,
}) => {
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<GraphNode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [lastFullGraph, setLastFullGraph] = useState<KnowledgeGraphData | null>(null);

  const loadQueue = useCallback(async () => {
    if (!topicId) return;
    setLoading(true);
    setIsCompleted(false);
    setCurrentIndex(0);
    setShowAnswer(false);
    try {
      const res = await fetchReviewQueue(topicId);
      setQueue(res.due_nodes || []);
    } catch (err) {
      console.error('Failed to load review queue:', err);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    if (isOpen && topicId) {
      loadQueue();
    }
  }, [isOpen, topicId, loadQueue]);

  const currentNode: GraphNode | undefined = queue[currentIndex];

  const handleRate = async (rating: number) => {
    if (!currentNode || submitting) return;
    setSubmitting(true);
    try {
      const res = await recordNodeReview(currentNode.id, rating);
      if (res.node && res.node.mastery_score !== undefined && onUpdateNodeMastery) {
        onUpdateNodeMastery(currentNode.id, res.node.mastery_score);
      }
      if (res.full_graph) {
        setLastFullGraph(res.full_graph);
      }

      if (currentIndex + 1 < queue.length) {
        setCurrentIndex((prev) => prev + 1);
        setShowAnswer(false);
      } else {
        setIsCompleted(true);
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10b981', '#38bdf8', '#f59e0b', '#8b7bf5'],
        });
        if (onReviewCompleted && res.full_graph) {
          onReviewCompleted(res.full_graph);
        }
      }
    } catch (err) {
      console.error('Failed to record review:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcut listener (Space = show answer, 1/2/3/4 = rate)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setShowAnswer((prev) => !prev);
      } else if (showAnswer && !submitting && !isCompleted && currentNode) {
        if (e.key === '1') handleRate(1);
        else if (e.key === '2') handleRate(2);
        else if (e.key === '3') handleRate(3);
        else if (e.key === '4') handleRate(4);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showAnswer, submitting, isCompleted, currentNode]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(6px)',
        zIndex: 65,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--bg-panel-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-purple)' }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M12 6v6" />
              <path d="M15 9l-3 3-3-3" />
            </svg>
            <div>
              <h2 style={{ fontSize: '17px', margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
                Spaced Repetition Review Deck (SM-2)
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {topicTitle || 'Active Topic'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!loading && queue.length > 0 && !isCompleted && (
              <span
                style={{
                  fontSize: '12.5px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'var(--bg-card)',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                Card {currentIndex + 1} of {queue.length}
              </span>
            )}
            <button onClick={onClose} className="obsidian-btn-subtle" title="Close Review Deck" style={{ padding: '4px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: '14.5px' }}>
              Fetching due review concepts...
            </div>
          ) : isCompleted ? (
            /* Completed view */
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 style={{ fontSize: '20px', margin: 0, fontWeight: 600, color: '#10b981' }}>
                Review Session Completed!
              </h3>
              <p style={{ fontSize: '14.5px', color: 'var(--text-secondary)', maxWidth: '440px', margin: 0 }}>
                Great work! You have reviewed all {queue.length} due concept card{queue.length === 1 ? '' : 's'}. Next intervals have been calibrated with the SM-2 algorithm.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  onClick={() => {
                    if (lastFullGraph && onReviewCompleted) {
                      onReviewCompleted(lastFullGraph);
                    }
                    onClose();
                  }}
                  className="obsidian-btn obsidian-btn-primary"
                  style={{ padding: '9px 22px', fontSize: '14px' }}
                >
                  Return to Canvas
                </button>
              </div>
            </div>
          ) : queue.length === 0 ? (
            /* Empty Queue */
            <div
              style={{
                textAlign: 'center',
                padding: '50px 20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 style={{ fontSize: '19px', margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
                All Caught Up!
              </h3>
              <p style={{ fontSize: '14.5px', color: 'var(--text-muted)', maxWidth: '400px', margin: 0 }}>
                No cards are currently due for spaced repetition review in this topic. Concepts will reappear here when their review interval matures.
              </p>
              <button
                onClick={onClose}
                className="obsidian-btn"
                style={{ marginTop: '12px', padding: '8px 18px', fontSize: '13.5px' }}
              >
                Close Deck
              </button>
            </div>
          ) : currentNode ? (
            /* Active Card Review */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              {/* Card Meta Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-card)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`obsidian-badge badge-${currentNode.node_type}`} style={{ fontSize: '12px' }}>
                    {currentNode.node_type}
                  </span>
                  <span style={{ fontSize: '13.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Interval: {currentNode.review_interval || 1}d &bull; Ease: {(currentNode.ease_factor || 2.5).toFixed(1)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Mastery:</span>
                  <span
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      color:
                        (currentNode.mastery_score || 0) >= 80
                          ? '#10b981'
                          : (currentNode.mastery_score || 0) >= 50
                          ? '#38bdf8'
                          : (currentNode.mastery_score || 0) > 0
                          ? '#f59e0b'
                          : '#9ca3af',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>{currentNode.mastery_score || 0}%</span>
                  </span>
                </div>
              </div>

              {/* Concept Question / Title (Front of Card) */}
              <div
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                  }}
                >
                  CONCEPT RECALL CHALLENGE
                </span>
                <h3 style={{ fontSize: '21px', margin: 0, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  <MathText text={currentNode.title} />
                </h3>
                {currentNode.summary && (
                  <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    <MathText text={currentNode.summary} />
                  </p>
                )}
              </div>

              {/* Toggle Answer Button */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowAnswer((prev) => !prev)}
                  className="obsidian-btn"
                  style={{
                    fontSize: '14.5px',
                    padding: '9px 22px',
                    borderRadius: '6px',
                    border: `1px solid ${showAnswer ? 'var(--accent-purple)' : 'var(--border-subtle)'}`,
                    backgroundColor: showAnswer ? 'rgba(139, 123, 245, 0.15)' : 'var(--bg-card)',
                    color: showAnswer ? 'var(--accent-purple)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {showAnswer ? 'Hide Answer & Derivation' : 'Show Answer & Derivation (Space)'}
                </button>
              </div>

              {/* Answer & Explanation View (Back of Card) */}
              {showAnswer && (
                <div
                  style={{
                    backgroundColor: 'rgba(28, 28, 31, 0.85)',
                    border: '1px solid var(--border-subtle)',
                    borderLeft: '3px solid var(--accent-purple)',
                    borderRadius: '6px',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    animation: 'fadeIn 180ms ease-out',
                  }}
                >
                  <span
                    style={{
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-purple)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    FULL STUDY NOTES & DERIVATION
                  </span>
                  <div
                    className="markdown-body"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownWithMath(
                        currentNode.content || currentNode.summary || 'No study notes recorded for this node.'
                      ),
                    }}
                  />
                </div>
              )}

              {/* SM-2 Recall Rating Buttons */}
              {showAnswer && (
                <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: '12.5px',
                      color: 'var(--text-muted)',
                      marginBottom: '8px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    Rate your recall quality (Keys: 1, 2, 3, 4)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                    {/* Again (1) */}
                    <button
                      onClick={() => handleRate(1)}
                      disabled={submitting}
                      style={{
                        padding: '11px 10px',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid #ef4444',
                        borderRadius: '6px',
                        color: '#f87171',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 120ms ease',
                      }}
                      title="Total blackout, forgot concept completely"
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600 }}>Again (1)</span>
                      <span style={{ fontSize: '11.5px', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>&lt; 1d</span>
                    </button>

                    {/* Hard (2) */}
                    <button
                      onClick={() => handleRate(2)}
                      disabled={submitting}
                      style={{
                        padding: '11px 10px',
                        backgroundColor: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid #f59e0b',
                        borderRadius: '6px',
                        color: '#fbbf24',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 120ms ease',
                      }}
                      title="Recalled with serious difficulty and hesitation"
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600 }}>Hard (2)</span>
                      <span style={{ fontSize: '11.5px', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>1d</span>
                    </button>

                    {/* Good (3) */}
                    <button
                      onClick={() => handleRate(3)}
                      disabled={submitting}
                      style={{
                        padding: '11px 10px',
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid #38bdf8',
                        borderRadius: '6px',
                        color: '#38bdf8',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 120ms ease',
                      }}
                      title="Good recall after brief hesitation"
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600 }}>Good (3)</span>
                      <span style={{ fontSize: '11.5px', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>3d</span>
                    </button>

                    {/* Easy (4) */}
                    <button
                      onClick={() => handleRate(4)}
                      disabled={submitting}
                      style={{
                        padding: '11px 10px',
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        color: '#34d399',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        transition: 'all 120ms ease',
                      }}
                      title="Perfect instant recall with complete mastery"
                    >
                      <span style={{ fontSize: '14.5px', fontWeight: 600 }}>Easy (4)</span>
                      <span style={{ fontSize: '11.5px', opacity: 0.8, fontFamily: 'var(--font-mono)' }}>6d</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
