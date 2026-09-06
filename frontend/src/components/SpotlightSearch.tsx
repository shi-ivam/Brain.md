import React, { useState, useEffect } from 'react';
import { DifficultyLevel, DeepSearchHit, InspectorTab } from '../types';
import { deepSearchTopic } from '../services/api';

interface SpotlightSearchProps {
  onSearch: (topic: string, difficulty: DifficultyLevel) => Promise<void>;
  isLoading: boolean;
  onClose?: () => void;
  isOverlay?: boolean;
  activeTopicId?: string | null;
  activeTopicTitle?: string;
  onSelectNode?: (nodeId: string, targetTab?: InspectorTab) => void;
  onOpenWeave?: (query: string) => void;
}

const EXAMPLE_TOPICS = [
  'Quantum Computing & Quantum Algorithms',
  'Distributed Consensus & Raft Protocol',
  'Epigenetics & Chromatin Remodeling',
  'Algorithmic Game Theory & Mechanism Design',
  'Category Theory & Monads',
  'Neurobiology of Synaptic Plasticity',
];

const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, { label: string; detail: string }> = {
  beginner: {
    label: 'Beginner',
    detail: 'Intuitive analogies, core principles & foundations',
  },
  intermediate: {
    label: 'Intermediate',
    detail: 'Undergraduate rigor, formal definitions & mechanics',
  },
  advanced: {
    label: 'Advanced',
    detail: 'Graduate-level proofs, counterexamples & formulations',
  },
  expert: {
    label: 'Expert',
    detail: 'Research edge cases, open problems & multi-step theorems',
  },
};

const DIFFICULTY_STEPS: DifficultyLevel[] = ['beginner', 'intermediate', 'advanced', 'expert'];

export const SpotlightSearch: React.FC<SpotlightSearchProps> = ({
  onSearch,
  isLoading,
  onClose,
  isOverlay = false,
  activeTopicId,
  activeTopicTitle,
  onSelectNode,
  onOpenWeave,
}) => {
  const [topic, setTopic] = useState('');
  const [difficultyIndex, setDifficultyIndex] = useState<number>(1); // default 'intermediate'
  const [loadingStep, setLoadingStep] = useState('Synthesizing knowledge graph...');

  // Deep Search state
  const [deepHits, setDeepHits] = useState<DeepSearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedHitIndex, setSelectedHitIndex] = useState<number>(-1);

  const currentDifficulty = DIFFICULTY_STEPS[difficultyIndex];

  // Perform deep search within active topic when typing
  useEffect(() => {
    const q = topic.trim();
    if (!activeTopicId || !q) {
      setDeepHits([]);
      setIsSearching(false);
      setSelectedHitIndex(-1);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await deepSearchTopic(activeTopicId, q);
        setDeepHits(res.hits);
        setSelectedHitIndex(-1);
      } catch (err) {
        console.error('Deep search failed:', err);
        setDeepHits([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [topic, activeTopicId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // If an item in search results is highlighted, select it
    if (selectedHitIndex >= 0 && selectedHitIndex < deepHits.length && onSelectNode) {
      const hit = deepHits[selectedHitIndex];
      onSelectNode(hit.node_id, hit.target_tab);
      if (onClose) onClose();
      return;
    }

    const cleanTopic = topic.trim();
    if (!cleanTopic || isLoading) return;

    // Cycle through descriptive steps while loading
    const interval = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev.includes('Synthesizing') || prev.includes('Querying')) return 'Formulating academic ontology & prerequisites...';
        if (prev.includes('prerequisites')) return 'Synthesizing core pillars & LaTeX study notes...';
        return 'Linking knowledge graph in SQLite database...';
      });
    }, 2800);

    try {
      await onSearch(cleanTopic, currentDifficulty);
    } finally {
      clearInterval(interval);
      setLoadingStep('Synthesizing knowledge graph...');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (deepHits.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedHitIndex((prev) => (prev < deepHits.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedHitIndex((prev) => (prev > 0 ? prev - 1 : deepHits.length - 1));
    } else if (e.key === 'Enter' && selectedHitIndex >= 0 && onSelectNode) {
      e.preventDefault();
      const hit = deepHits[selectedHitIndex];
      onSelectNode(hit.node_id, hit.target_tab);
      if (onClose) onClose();
    }
  };

  const handleChipClick = (chip: string) => {
    setTopic(chip);
  };

  const handleHitClick = (hit: DeepSearchHit) => {
    if (onSelectNode) {
      onSelectNode(hit.node_id, hit.target_tab);
      if (onClose) onClose();
    }
  };

  // Group deep search results by category
  const conceptHits = deepHits.filter((h) => h.hit_type === 'title' || h.hit_type === 'tag');
  const contentHits = deepHits.filter((h) => h.hit_type === 'content');
  const inquiryHits = deepHits.filter((h) => h.hit_type === 'inquiry');
  const quizHits = deepHits.filter((h) => h.hit_type === 'quiz');

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '680px',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        position: 'relative',
        maxHeight: isOverlay ? '85vh' : undefined,
        overflowY: isOverlay ? 'auto' : undefined,
      }}
    >
      {isOverlay && onClose && (
        <button
          onClick={onClose}
          className="obsidian-btn-subtle"
          style={{ position: 'absolute', top: '16px', right: '16px' }}
          title="Close (Esc)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {/* Header */}
      <div>
        <h2 style={{ fontSize: '22px', margin: '0 0 4px 0', fontWeight: 500 }}>
          {activeTopicTitle ? `Search in ${activeTopicTitle}` : 'What would you like to master?'}
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14.5px' }}>
          {activeTopicTitle
            ? 'Type to deep search concepts, notes, inquiries & quizzes, or generate a new topic graph.'
            : 'Type any concept, academic discipline, or research inquiry to synthesize an interconnected knowledge network.'}
        </p>
      </div>

      {/* Search Input Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '4px 12px',
            transition: 'border-color 150ms ease',
          }}
        >
          {isSearching ? (
            <div
              style={{
                width: '18px',
                height: '18px',
                border: '2px solid var(--accent-purple)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginRight: '10px',
              }}
            />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginRight: '10px' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          )}

          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeTopicTitle ? `Search ${activeTopicTitle} or enter new topic...` : "e.g. Quantum Electrodynamics, Raft Consensus..."}
            disabled={isLoading}
            autoFocus
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '17px',
              fontFamily: 'var(--font-sans)',
              padding: '12px 0',
              outline: 'none',
            }}
          />

          {topic && !isLoading && (
            <button
              type="button"
              onClick={() => setTopic('')}
              className="obsidian-btn-subtle"
              style={{ padding: '4px' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}

          <button
            type="submit"
            disabled={!topic.trim() || isLoading}
            className="obsidian-btn obsidian-btn-primary"
            style={{ marginLeft: '10px', padding: '8px 16px', fontSize: '14px', opacity: topic.trim() && !isLoading ? 1 : 0.5 }}
          >
            {isLoading ? 'Generating...' : 'Learn Topic'}
          </button>

          {activeTopicId && onOpenWeave && topic.trim() && (
            <button
              type="button"
              onClick={() => {
                onOpenWeave(topic.trim());
                if (onClose) onClose();
              }}
              className="obsidian-btn"
              style={{
                marginLeft: '6px',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                color: 'var(--accent-primary)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                fontSize: '12.5px',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              }}
              title="Weave this inquiry or concept into the active knowledge graph"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
              </svg>
              <span>Weave</span>
            </button>
          )}
        </div>

        {/* Categorized Deep Search Hits */}
        {deepHits.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '12px',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Deep Search Hits ({deepHits.length})
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Press Enter or click to navigate
              </span>
            </div>

            {/* 1. Concepts & Tags */}
            {conceptHits.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tag-concept-text)', margin: '4px 0 6px 0', textTransform: 'uppercase' }}>
                  Concepts & Tags ({conceptHits.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {conceptHits.map((h) => {
                    const globalIdx = deepHits.indexOf(h);
                    const isSelected = globalIdx === selectedHitIndex;
                    return (
                      <div
                        key={`${h.node_id}-${h.snippet}`}
                        onClick={() => handleHitClick(h)}
                        style={{
                          padding: '7px 11px',
                          borderRadius: '4px',
                          backgroundColor: isSelected ? 'rgba(139, 123, 245, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span style={{ color: 'var(--accent-purple)', fontSize: '13px' }}>◈</span>
                          <span style={{ fontSize: '14.5px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {h.node_title}
                          </span>
                          {h.snippet && h.snippet !== h.node_title && (
                            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              — {h.snippet}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          → Note
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Note Content */}
            {contentHits.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#93c5fd', margin: '4px 0 6px 0', textTransform: 'uppercase' }}>
                  Note Content ({contentHits.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {contentHits.map((h) => {
                    const globalIdx = deepHits.indexOf(h);
                    const isSelected = globalIdx === selectedHitIndex;
                    return (
                      <div
                        key={`${h.node_id}-${h.snippet}`}
                        onClick={() => handleHitClick(h)}
                        style={{
                          padding: '7px 11px',
                          borderRadius: '4px',
                          backgroundColor: isSelected ? 'rgba(139, 123, 245, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {h.node_title}
                          </span>
                          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h.snippet}
                          </span>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          → Study Note
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Socratic Inquiries */}
            {inquiryHits.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tag-question-text)', margin: '4px 0 6px 0', textTransform: 'uppercase' }}>
                  Socratic Inquiries ({inquiryHits.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {inquiryHits.map((h) => {
                    const globalIdx = deepHits.indexOf(h);
                    const isSelected = globalIdx === selectedHitIndex;
                    return (
                      <div
                        key={`${h.node_id}-${h.snippet}`}
                        onClick={() => handleHitClick(h)}
                        style={{
                          padding: '7px 11px',
                          borderRadius: '4px',
                          backgroundColor: isSelected ? 'rgba(139, 123, 245, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {h.node_title}
                          </span>
                          <span style={{ fontSize: '12.5px', color: 'var(--tag-question-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h.snippet}
                          </span>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          → Inquiries
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Quizzes */}
            {quizHits.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tag-quiz-text)', margin: '4px 0 6px 0', textTransform: 'uppercase' }}>
                  Quizzes ({quizHits.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {quizHits.map((h) => {
                    const globalIdx = deepHits.indexOf(h);
                    const isSelected = globalIdx === selectedHitIndex;
                    return (
                      <div
                        key={`${h.node_id}-${h.snippet}`}
                        onClick={() => handleHitClick(h)}
                        style={{
                          padding: '7px 11px',
                          borderRadius: '4px',
                          backgroundColor: isSelected ? 'rgba(139, 123, 245, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {h.node_title}
                          </span>
                          <span style={{ fontSize: '12.5px', color: 'var(--tag-quiz-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h.snippet}
                          </span>
                        </div>
                        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          → Quiz
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Difficulty Slider */}
        <div
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Generation Rigor & Difficulty
            </span>
            <span style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>
              {DIFFICULTY_DESCRIPTIONS[currentDifficulty].label.toUpperCase()}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={difficultyIndex}
            onChange={(e) => setDifficultyIndex(parseInt(e.target.value, 10))}
            disabled={isLoading}
            style={{
              width: '100%',
              accentColor: 'var(--accent-purple)',
              cursor: 'pointer',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span>Beginner</span>
            <span>Intermediate</span>
            <span>Advanced</span>
            <span>Expert (Proofs)</span>
          </div>

          <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: 'var(--text-secondary)' }}>
            {DIFFICULTY_DESCRIPTIONS[currentDifficulty].detail}
          </p>
        </div>
      </form>

      {/* Live Loading Indicator */}
      {isLoading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            backgroundColor: 'rgba(139, 123, 245, 0.08)',
            border: '1px solid var(--border-active)',
            borderRadius: '6px',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid var(--accent-purple)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: '14px', color: '#c4b5fd', fontFamily: 'var(--font-mono)' }}>
            {loadingStep}
          </span>
        </div>
      ) : (
        /* Academic Topic Chips */
        <div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Academic Suggestions
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            {EXAMPLE_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => handleChipClick(t)}
                className="obsidian-btn"
                style={{
                  fontSize: '13.5px',
                  padding: '5px 12px',
                  backgroundColor: 'var(--bg-card)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
