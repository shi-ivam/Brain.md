import React, { useState, useEffect } from 'react';
import { GraphNode, DifficultyLevel } from '../../types';
import { saveNodeNote, synthesizeStudyNote } from '../../services/api';
import { renderMarkdownWithMath } from '../../utils/mathRenderer';

interface NoteTabProps {
  node: GraphNode;
  difficulty: DifficultyLevel;
  onNodeUpdated: (nodeId: string, newContent: string) => void;
  onDecomposeQuestion?: (nodeId: string) => Promise<void>;
}

export const NoteTab: React.FC<NoteTabProps> = ({ node, difficulty, onNodeUpdated, onDecomposeQuestion }) => {
  const [content, setContent] = useState(node.content || node.summary || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setContent(node.content || node.summary || '');
    setIsEditing(false);
  }, [node.id, node.content, node.summary]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveNodeNote(node.id, content);
      onNodeUpdated(node.id, content);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDecompose = async () => {
    if (!onDecomposeQuestion) return;
    setIsDecomposing(true);
    try {
      await onDecomposeQuestion(node.id);
    } catch (err) {
      console.error('Failed to decompose question:', err);
    } finally {
      setIsDecomposing(false);
    }
  };

  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    try {
      const res = await synthesizeStudyNote(node.id, difficulty);
      setContent(res.content);
      onNodeUpdated(node.id, res.content);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to synthesize study note:', err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {node.node_type === 'question' && onDecomposeQuestion && (
            <button
              onClick={handleDecompose}
              disabled={isDecomposing}
              className="obsidian-btn"
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderColor: 'var(--tag-question-border)',
                color: 'var(--tag-question-text)',
                backgroundColor: 'var(--tag-question-bg)',
              }}
              title="Branches foundational topics influencing this inquiry into the graph"
            >
              {isDecomposing ? 'Branching Topics...' : 'Branch Influencing Topics'}
            </button>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="obsidian-btn"
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            {isEditing ? 'Preview Note' : 'Edit Markdown'}
          </button>
          {isEditing && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="obsidian-btn obsidian-btn-primary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        <button
          onClick={handleSynthesize}
          disabled={isSynthesizing}
          className="obsidian-btn"
          style={{
            fontSize: '12px',
            padding: '4px 10px',
            borderColor: 'var(--accent-purple)',
            color: 'var(--tag-concept-text)',
          }}
          title="Synthesizes publication-grade Obsidian study note with LaTeX and callouts"
        >
          {isSynthesizing ? 'Synthesizing Note...' : 'Synthesize Deep Note'}
        </button>
      </div>

      {saveSuccess && (
        <div style={{ fontSize: '11px', color: '#4ade80', fontFamily: 'var(--font-mono)' }}>
          ✓ Saved to SQLite database
        </div>
      )}

      {/* Note Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '400px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12.5px',
              lineHeight: '1.6',
              padding: '12px',
              outline: 'none',
              resize: 'none',
              boxSizing: 'border-box',
            }}
            placeholder="Write markdown note with [[Wikilinks]] and LaTeX ($E=mc^2$)..."
          />
        ) : (
          <div
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(content) }}
          />
        )}
      </div>
    </div>
  );
};
