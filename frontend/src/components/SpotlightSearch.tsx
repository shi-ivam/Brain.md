import React, { useState } from 'react';
import { DifficultyLevel } from '../types';

interface SpotlightSearchProps {
  onSearch: (topic: string, difficulty: DifficultyLevel) => Promise<void>;
  isLoading: boolean;
  onClose?: () => void;
  isOverlay?: boolean;
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
}) => {
  const [topic, setTopic] = useState('');
  const [difficultyIndex, setDifficultyIndex] = useState<number>(1); // default 'intermediate'
  const [loadingStep, setLoadingStep] = useState('Querying Vertex AI gemini-3.8-flash in global region...');

  const currentDifficulty = DIFFICULTY_STEPS[difficultyIndex];

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTopic = topic.trim();
    if (!cleanTopic || isLoading) return;

    // Cycle through descriptive steps while loading
    const interval = setInterval(() => {
      setLoadingStep((prev) => {
        if (prev.includes('Querying')) return 'Formulating academic ontology & prerequisites...';
        if (prev.includes('prerequisites')) return 'Synthesizing core pillars & LaTeX study notes...';
        return 'Linking knowledge graph in SQLite database...';
      });
    }, 2800);

    try {
      await onSearch(cleanTopic, currentDifficulty);
    } finally {
      clearInterval(interval);
      setLoadingStep('Querying Vertex AI gemini-3.8-flash in global region...');
    }
  };

  const handleChipClick = (chip: string) => {
    setTopic(chip);
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '680px',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '28px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative',
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
        <h2 style={{ fontSize: '20px', margin: '0 0 4px 0', fontWeight: 500 }}>
          What would you like to master?
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
          Type any concept, academic discipline, or research inquiry to synthesize an interconnected knowledge network.
        </p>
      </div>

      {/* Search Input Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginRight: '10px' }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Quantum Electrodynamics, Raft Consensus, Epigenetics..."
            disabled={isLoading}
            autoFocus
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '15px',
              fontFamily: 'var(--font-sans)',
              padding: '10px 0',
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={!topic.trim() || isLoading}
            className="obsidian-btn obsidian-btn-primary"
            style={{ marginLeft: '10px', opacity: topic.trim() && !isLoading ? 1 : 0.5 }}
          >
            {isLoading ? 'Generating...' : 'Learn Topic'}
          </button>
        </div>

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
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Difficulty
            </span>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>
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

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>Beginner</span>
            <span>Intermediate</span>
            <span>Advanced</span>
            <span>Expert (Proofs)</span>
          </div>

          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
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
              width: '14px',
              height: '14px',
              border: '2px solid var(--accent-purple)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: '13px', color: '#c4bbf9', fontFamily: 'var(--font-mono)' }}>
            {loadingStep}
          </span>
        </div>
      ) : (
        /* Academic Topic Chips */
        <div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Academic Suggestions
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
            {EXAMPLE_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => handleChipClick(t)}
                className="obsidian-btn"
                style={{
                  fontSize: '12px',
                  padding: '4px 10px',
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
