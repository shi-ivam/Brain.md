import React, { useState } from 'react';
import { GraphNode, Quiz, DifficultyLevel, KnowledgeGraphData } from '../../types';
import { generateQuizzes, submitQuizAnswer, createNode, createEdge, fetchTopicGraph } from '../../services/api';
import confetti from 'canvas-confetti';
import { MathText } from '../MathText';
import { renderMarkdownWithMath } from '../../utils/mathRenderer';

interface QuizTabProps {
  node: GraphNode;
  quizzes: Quiz[];
  difficulty: DifficultyLevel;
  onQuizzesGenerated: (newQuizzes: Quiz[], fullGraph?: KnowledgeGraphData) => void;
  onQuizAnswered: (quizId: string, selectedOption: number, isCorrect: boolean) => void;
  onDetachQuiz?: (quizId: string) => Promise<void>;
  onGraphUpdated?: (fullGraph: KnowledgeGraphData) => void;
}

const DIFFICULTY_STEPS: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];

export const QuizTab: React.FC<QuizTabProps> = ({
  node,
  quizzes,
  difficulty: initialDifficulty,
  onQuizzesGenerated,
  onQuizAnswered,
  onDetachQuiz,
  onGraphUpdated,
}) => {
  const [quizDifficultyIndex, setQuizDifficultyIndex] = useState<number>(
    Math.max(0, DIFFICULTY_STEPS.indexOf(initialDifficulty))
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [detachingQuizId, setDetachingQuizId] = useState<string | null>(null);
  const [answeringQuizId, setAnsweringQuizId] = useState<string | null>(null);
  const [forkingTrapQuizId, setForkingTrapQuizId] = useState<string | null>(null);
  const [forkedTrapQuizIds, setForkedTrapQuizIds] = useState<Set<string>>(new Set());

  const selectedDifficulty = DIFFICULTY_STEPS[quizDifficultyIndex];
  const nodeQuizzes = quizzes;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await generateQuizzes(node.id, selectedDifficulty, 3);
      onQuizzesGenerated(res.quizzes, res.full_graph);
    } catch (err) {
      console.error('Failed to generate quizzes:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDetach = async (quizId: string) => {
    if (!onDetachQuiz || detachingQuizId) return;
    setDetachingQuizId(quizId);
    try {
      await onDetachQuiz(quizId);
    } catch (err) {
      console.error('Failed to detach quiz to node:', err);
    } finally {
      setDetachingQuizId(null);
    }
  };

  const handleSelectOption = async (quiz: Quiz, optionIndex: number) => {
    if (quiz.user_answer !== null && quiz.user_answer !== undefined) return; // already answered
    setAnsweringQuizId(quiz.id);

    try {
      const res = await submitQuizAnswer(quiz.id, optionIndex);
      onQuizAnswered(quiz.id, optionIndex, res.is_correct);

      if (res.is_correct) {
        confetti({
          particleCount: 60,
          spread: 55,
          origin: { y: 0.7 },
          colors: ['#fde047', '#8b7bf5', '#6ee7b7'],
        });
      }
    } catch (err) {
      console.error('Failed to submit answer:', err);
    } finally {
      setAnsweringQuizId(null);
    }
  };

  const handleForkMisconception = async (quiz: Quiz) => {
    if (!quiz.conceptual_trap || forkingTrapQuizId) return;
    setForkingTrapQuizId(quiz.id);
    try {
      const trapTitle = quiz.conceptual_trap.length > 50 
        ? `Misconception: ${quiz.conceptual_trap.slice(0, 47)}...` 
        : `Misconception: ${quiz.conceptual_trap}`;

      const createdNode = await createNode({
        topic_id: node.topic_id,
        title: trapTitle,
        content: `### Identified Misconception / Conceptual Trap\n\n> "${quiz.conceptual_trap}"\n\n#### Context Question\n${quiz.question}\n\n#### Why this trap occurs\n${quiz.explanation}`,
        node_type: 'concept',
        pos_x: (node.pos_x || (node as any).x || 400) + (Math.random() * 120 - 60),
        pos_y: (node.pos_y || (node as any).y || 300) + (Math.random() * 120 + 80),
      });

      await createEdge({
        topic_id: node.topic_id,
        source_id: createdNode.id,
        target_id: node.id,
        relation_type: 'challenges',
        label: 'challenges',
      });

      setForkedTrapQuizIds(prev => new Set(prev).add(quiz.id));

      if (onGraphUpdated) {
        const freshGraph = await fetchTopicGraph(node.topic_id);
        onGraphUpdated(freshGraph);
      }
    } catch (err) {
      console.error('Failed to fork misconception node:', err);
    } finally {
      setForkingTrapQuizId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: '14px' }}>
      {/* Quiz Generator Controls (for concept nodes or when adding more) */}
      {node.node_type !== 'quiz' ? (
        <div
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
            <span style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Quiz Difficulty Level
            </span>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--tag-quiz-text)' }}>
              {selectedDifficulty.toUpperCase()}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={quizDifficultyIndex}
            onChange={(e) => setQuizDifficultyIndex(parseInt(e.target.value, 10))}
            disabled={isGenerating}
            style={{ width: '100%', accentColor: 'var(--tag-quiz-text)' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-muted)' }}>
            <span>Beginner</span>
            <span>Intermediate</span>
            <span>Advanced</span>
            <span>Expert</span>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="obsidian-btn obsidian-btn-primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: '13.5px', padding: '8px 14px', marginTop: '4px' }}
          >
            {isGenerating ? 'Synthesizing Challenges...' : `Generate 3 ${selectedDifficulty.toUpperCase()} Quizzes`}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            {nodeQuizzes.length} Challenge{nodeQuizzes.length === 1 ? '' : 's'} in this Quiz
          </span>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="obsidian-btn"
            style={{ fontSize: '12.5px', padding: '5px 10px' }}
            title="Generate additional challenge questions for this quiz"
          >
            {isGenerating ? 'Generating...' : '+ Add Questions'}
          </button>
        </div>
      )}

      {/* Quizzes List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }}>
        {nodeQuizzes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '14.5px' }}>
            No quizzes generated yet for {node.title}. Choose a difficulty above and click generate.
          </div>
        ) : (
          nodeQuizzes.map((quiz, qIdx) => {
            const hasAnswered = quiz.user_answer !== null && quiz.user_answer !== undefined;
            return (
              <div
                key={quiz.id}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    QUESTION #{qIdx + 1} &bull; {quiz.difficulty?.toUpperCase() || 'CHALLENGE'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {onDetachQuiz && (
                      <button
                        onClick={() => handleDetach(quiz.id)}
                        disabled={detachingQuizId === quiz.id}
                        className="obsidian-btn-subtle"
                        style={{
                          fontSize: '12px',
                          padding: '4px 9px',
                          color: 'var(--tag-question-text)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          border: '1px solid var(--tag-question-border)',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(125, 211, 252, 0.08)',
                        }}
                        title="Move this question out of this quiz into its own independent Question node in the graph"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        </svg>
                        {detachingQuizId === quiz.id ? 'Moving...' : 'Move to Node'}
                      </button>
                    )}
                    {hasAnswered && (
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: quiz.is_correct ? '#4ade80' : '#f87171',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {quiz.is_correct ? '✓ CORRECT' : '✗ INCORRECT'}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: '15.5px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.55 }}>
                  <MathText text={quiz.question} />
                </div>

                {/* Options List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {quiz.options.map((opt, optIdx) => {
                    const isSelected = quiz.user_answer === optIdx;
                    const isCorrectOption = optIdx === quiz.correct_index;

                    let bg = 'var(--bg-panel)';
                    let border = 'var(--border-subtle)';
                    let textCol = 'var(--text-primary)';

                    if (hasAnswered) {
                      if (isCorrectOption) {
                        bg = 'rgba(74, 222, 128, 0.15)';
                        border = '#4ade80';
                        textCol = '#4ade80';
                      } else if (isSelected && !quiz.is_correct) {
                        bg = 'rgba(248, 113, 113, 0.15)';
                        border = '#f87171';
                        textCol = '#f87171';
                      }
                    }

                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleSelectOption(quiz, optIdx)}
                        disabled={hasAnswered || answeringQuizId === quiz.id}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          backgroundColor: bg,
                          border: `1px solid ${border}`,
                          borderRadius: '4px',
                          color: textCol,
                          fontSize: '14.5px',
                          fontFamily: 'var(--font-sans)',
                          cursor: hasAnswered ? 'default' : 'pointer',
                          transition: 'all 120ms ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                            width: '20px',
                            flexShrink: 0,
                          }}
                        >
                          {String.fromCharCode(65 + optIdx)}.
                        </span>
                        <span style={{ flex: 1 }}>
                          <MathText text={opt} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Explanation Breakdown after answering */}
                {hasAnswered && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(28, 28, 31, 0.7)',
                      borderLeft: `3px solid ${quiz.is_correct ? '#4ade80' : '#f87171'}`,
                      borderRadius: '0 4px 4px 0',
                    }}
                  >
                    <div
                      className="markdown-body"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownWithMath('**Explanation:** ' + quiz.explanation),
                      }}
                    />
                    {quiz.conceptual_trap && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '13px', color: '#fde047' }}>
                          <em>Misconception tested: <MathText text={quiz.conceptual_trap} /></em>
                        </div>
                        <div>
                          <button
                            onClick={() => handleForkMisconception(quiz)}
                            disabled={forkingTrapQuizId === quiz.id || forkedTrapQuizIds.has(quiz.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '5px 10px',
                              backgroundColor: forkedTrapQuizIds.has(quiz.id) ? 'rgba(74, 222, 128, 0.15)' : 'rgba(253, 224, 71, 0.15)',
                              border: `1px solid ${forkedTrapQuizIds.has(quiz.id) ? '#4ade80' : 'rgba(253, 224, 71, 0.4)'}`,
                              borderRadius: '4px',
                              color: forkedTrapQuizIds.has(quiz.id) ? '#4ade80' : '#fde047',
                              fontSize: '12px',
                              cursor: forkedTrapQuizIds.has(quiz.id) || forkingTrapQuizId === quiz.id ? 'default' : 'pointer',
                              fontFamily: 'var(--font-sans)',
                              transition: 'all 120ms ease',
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            {forkedTrapQuizIds.has(quiz.id)
                              ? 'Misconception Forked ✓'
                              : forkingTrapQuizId === quiz.id
                              ? 'Forking...'
                              : '+ Fork Misconception Node'}
                          </button>
                        </div>
                      </div>
                    )}
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
