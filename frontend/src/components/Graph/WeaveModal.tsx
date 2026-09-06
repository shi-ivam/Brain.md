import React, { useState, useEffect, useRef } from 'react';
import { DifficultyLevel, GraphWeaveResponse } from '../../types';
import { weaveConceptIntoGraph } from '../../services/api';

interface WeaveModalProps {
  isOpen: boolean;
  topicId: string;
  topicTitle?: string;
  initialPrompt?: string;
  onClose: () => void;
  onWeaveSuccess: (response: GraphWeaveResponse) => void;
}

export const WeaveModal: React.FC<WeaveModalProps> = ({
  isOpen,
  topicId,
  topicTitle,
  initialPrompt = '',
  onClose,
  onWeaveSuccess,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [targetType, setTargetType] = useState<'auto' | 'question' | 'concept' | 'prerequisite' | 'subtopic'>('auto');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('intermediate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPrompt(initialPrompt || '');
      setError(null);
      setLoading(false);
      setStatusMessage('');
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen, initialPrompt]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setError(null);
    setStatusMessage('Analyzing graph ontology & finding optimal anchor points...');

    try {
      const timer1 = setTimeout(() => {
        setStatusMessage('Evaluating cognitive distance & synthesizing chain...');
      }, 2000);

      const resp = await weaveConceptIntoGraph(topicId, {
        prompt: prompt.trim(),
        target_type: targetType,
        difficulty,
      });

      clearTimeout(timer1);
      setStatusMessage('Docking into graph and resolving edges...');
      onWeaveSuccess(resp);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to weave concept into graph');
      setLoading(false);
      setStatusMessage('');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        className="obsidian-panel"
        style={{
          width: '100%',
          maxWidth: '580px',
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-active)',
          borderRadius: '8px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
            </svg>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 600, margin: 0, color: 'var(--text-normal)' }}>
                Weave into Knowledge Graph
              </h2>
              {topicTitle && (
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  Active Topic: <span style={{ color: 'var(--accent-primary)' }}>{topicTitle}</span>
                </div>
              )}
            </div>
          </div>
          <button
            className="obsidian-button button-ghost"
            style={{ padding: '4px 8px', fontSize: '16px', color: 'var(--text-muted)' }}
            onClick={onClose}
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-normal)' }}>
              Inquiry, Concept, or Theorem to Ingest:
            </label>
            <textarea
              ref={textareaRef}
              rows={3}
              className="obsidian-input"
              placeholder="e.g. 'Why does Ito's Lemma require a second-order term?', or 'Girsanov Theorem for measure changes'..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              style={{
                width: '100%',
                fontSize: '14.5px',
                padding: '10px 12px',
                lineHeight: '1.4',
                resize: 'none',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmit();
                }
              }}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Press <kbd style={{ padding: '1px 4px', background: 'var(--bg-card)', borderRadius: '3px' }}>Ctrl+Enter</kbd> to weave.
            </div>
          </div>

          {/* Node Type Preference */}
          <div>
            <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-normal)' }}>
              Classification:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                { id: 'auto', label: 'Auto-Detect' },
                { id: 'concept', label: 'Concept' },
                { id: 'question', label: 'Question / Inquiry' },
                { id: 'prerequisite', label: 'Prerequisite' },
                { id: 'subtopic', label: 'Subtopic' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="obsidian-button"
                  style={{
                    fontSize: '12.5px',
                    padding: '5px 12px',
                    borderColor: targetType === item.id ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    backgroundColor: targetType === item.id ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    color: targetType === item.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                  }}
                  onClick={() => setTargetType(item.id as any)}
                  disabled={loading}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-normal)' }}>
              Target Academic Depth:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {(['beginner', 'intermediate', 'advanced', 'expert'] as DifficultyLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  className="obsidian-button"
                  style={{
                    fontSize: '12.5px',
                    padding: '6px 0',
                    textAlign: 'center',
                    justifyContent: 'center',
                    textTransform: 'capitalize',
                    borderColor: difficulty === level ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    backgroundColor: difficulty === level ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    color: difficulty === level ? 'var(--accent-primary)' : 'var(--text-normal)',
                  }}
                  onClick={() => setDifficulty(level)}
                  disabled={loading}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Status / Error */}
          {error && (
            <div
              style={{
                padding: '10px 14px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--error-red, #ef4444)',
                borderRadius: '6px',
                fontSize: '13.5px',
                color: '#ef4444',
              }}
            >
              {error}
            </div>
          )}

          {loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '6px',
              }}
            >
              <div className="obsidian-spinner" style={{ width: '16px', height: '16px' }} />
              <span style={{ fontSize: '13.5px', color: 'var(--accent-primary)', fontWeight: 500 }}>
                {statusMessage}
              </span>
            </div>
          )}

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '4px',
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '16px',
            }}
          >
            <button
              type="button"
              className="obsidian-button button-ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="obsidian-button button-primary"
              disabled={!prompt.trim() || loading}
              style={{ padding: '9px 20px', fontSize: '14.5px' }}
            >
              {loading ? 'Synthesizing & Docking...' : 'Weave into Graph'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
