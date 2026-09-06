import React, { useState, useEffect, useRef } from 'react';
import { GraphEdge, GraphNode, DifficultyLevel } from '../../types';

interface LinkContextMenuProps {
  edge: GraphEdge;
  sourceNode?: GraphNode;
  targetNode?: GraphNode;
  position: { x: number; y: number };
  onBridgeEdge: (edgeId: string, bridgeCount: number, difficulty: DifficultyLevel, focusNote?: string) => Promise<void>;
  onInsertNode: (
    edgeId: string,
    title: string,
    nodeType: string,
    summary?: string,
    relSourceToNew?: string,
    relNewToTarget?: string,
    lblSourceToNew?: string,
    lblNewToTarget?: string
  ) => Promise<void>;
  onUpdateEdge?: (edgeId: string, relationType: string, label: string) => Promise<void>;
  onDeleteEdge: (edgeId: string) => Promise<void>;
  onClose: () => void;
}

export const LinkContextMenu: React.FC<LinkContextMenuProps> = ({
  edge,
  sourceNode,
  targetNode,
  position,
  onBridgeEdge,
  onInsertNode,
  onUpdateEdge,
  onDeleteEdge,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const inputTitleRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'menu' | 'bridge' | 'insert' | 'edit'>('menu');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bridge state
  const [bridgeCount, setBridgeCount] = useState<number>(2);
  const [bridgeDifficulty, setBridgeDifficulty] = useState<DifficultyLevel>(
    (sourceNode?.difficulty as DifficultyLevel) || 'intermediate'
  );
  const [focusNote, setFocusNote] = useState<string>('');

  // Manual insert state
  const [insertTitle, setInsertTitle] = useState<string>('');
  const [insertType, setInsertType] = useState<string>('concept');
  const [insertSummary, setInsertSummary] = useState<string>('');
  const [lblSourceToNew, setLblSourceToNew] = useState<string>('leads to');
  const [lblNewToTarget, setLblNewToTarget] = useState<string>('develops into');

  // Edit edge state
  const [editRelType, setEditRelType] = useState<string>(edge.relation_type || edge.edge_type || 'related_to');
  const [editLabel, setEditLabel] = useState<string>(edge.label || '');

  // Close on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Focus input when entering insert view
  useEffect(() => {
    if (view === 'insert' && inputTitleRef.current) {
      inputTitleRef.current.focus();
    }
  }, [view]);

  // Menu dimensions and bounds calculation
  const menuWidth = view === 'menu' ? 270 : 310;
  const menuHeight = view === 'menu' ? 240 : 360;
  const left = Math.max(12, Math.min(position.x, window.innerWidth - menuWidth - 12));
  const top = Math.max(12, Math.min(position.y, window.innerHeight - menuHeight - 12));

  const handleBridgeSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await onBridgeEdge(edge.id, bridgeCount, bridgeDifficulty, focusNote);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to bridge transition');
      setLoading(false);
    }
  };

  const handleInsertSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!insertTitle.trim()) {
      setError('Concept title is required');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await onInsertNode(
        edge.id,
        insertTitle.trim(),
        insertType,
        insertSummary.trim(),
        'subtopic_of',
        'prerequisite_for',
        lblSourceToNew.trim(),
        lblNewToTarget.trim()
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to insert node');
      setLoading(false);
    }
  };

  const handleEditSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!onUpdateEdge) return;
    try {
      setLoading(true);
      setError(null);
      await onUpdateEdge(edge.id, editRelType, editLabel.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update edge');
      setLoading(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (window.confirm('Are you sure you want to delete this connection link?')) {
      try {
        setLoading(true);
        setError(null);
        await onDeleteEdge(edge.id);
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to delete edge');
        setLoading(false);
      }
    }
  };

  return (
    <div
      ref={menuRef}
      className={`obsidian-context-menu edge-context-menu ${view !== 'menu' ? 'expanded' : ''}`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${menuWidth}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header showing connection path & link relation */}
      <div className="edge-menu-header">
        <div className="edge-menu-topbar">
          <span className="edge-menu-tag">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Edge Link
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="edge-menu-badge">
              {edge.relation_type || edge.edge_type || 'connects'}
            </span>
            <button
              onClick={onClose}
              className="obsidian-btn-subtle"
              style={{ padding: '2px', color: 'var(--text-muted)' }}
              title="Close"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="edge-menu-path">
          <span
            className="edge-node-pill edge-node-source"
            title={sourceNode?.title || 'Source Node'}
          >
            {sourceNode?.title || 'Source'}
          </span>
          <span className="edge-node-arrow">➔</span>
          <span
            className="edge-node-pill edge-node-target"
            title={targetNode?.title || 'Target Node'}
          >
            {targetNode?.title || 'Target'}
          </span>
        </div>

        {edge.label && (
          <div className="edge-menu-label-text" title={edge.label}>
            "{edge.label}"
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="edge-menu-error">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Main Menu View */}
      {view === 'menu' && (
        <>
          {/* Bridge Gap with AI */}
          <button
            className="edge-menu-btn-bridge"
            onClick={() => setView('bridge')}
          >
            <div className="edge-menu-icon-box">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v8" />
                <path d="m4.93 10.93 1.41 1.41" />
                <path d="M2 18h2" />
                <path d="M20 18h2" />
                <path d="m19.07 10.93-1.41 1.41" />
                <path d="M22 22H2" />
                <path d="m16 6-4 4-4-4" />
                <path d="M16 18a4 4 0 0 0-8 0" />
              </svg>
            </div>
            <div className="edge-menu-text-col">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="edge-menu-item-title" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  Bridge Gap with AI
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: '3px',
                    backgroundColor: 'var(--accent-purple)',
                    color: '#ffffff',
                    letterSpacing: '0.04em',
                  }}
                >
                  AI
                </span>
              </div>
              <span className="edge-menu-item-sub">Insert 1–3 stepping stone nodes</span>
            </div>
          </button>

          {/* Insert Intermediate Node (Manual) */}
          <button
            className="edge-menu-action-btn"
            onClick={() => setView('insert')}
            disabled={loading}
          >
            <div className="edge-menu-action-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className="edge-menu-text-col">
              <span className="edge-menu-item-title">Insert Intermediate Node</span>
              <span className="edge-menu-item-sub">Splits edge and inserts new concept</span>
            </div>
          </button>

          {/* Edit Edge / Relation Type */}
          <button
            className="edge-menu-action-btn"
            onClick={() => setView('edit')}
            disabled={loading}
          >
            <div className="edge-menu-action-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div className="edge-menu-text-col">
              <span className="edge-menu-item-title">Edit Connection Type</span>
              <span className="edge-menu-item-sub">Change relation or label text</span>
            </div>
          </button>

          <div className="context-menu-divider" />

          {/* Delete Edge */}
          <button
            className="edge-menu-action-btn danger"
            onClick={handleDeleteSubmit}
            disabled={loading}
          >
            <div className="edge-menu-action-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <div className="edge-menu-text-col">
              <span className="edge-menu-item-title" style={{ color: 'var(--error-red)' }}>Delete Connection</span>
              <span className="edge-menu-item-sub">Remove link from knowledge graph</span>
            </div>
          </button>
        </>
      )}

      {/* AI Bridge View */}
      {view === 'bridge' && (
        <form onSubmit={handleBridgeSubmit} className="edge-view-container">
          <div className="edge-view-header">
            <span className="edge-view-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m12 8 4 4-4 4M8 12h8" />
              </svg>
              AI Stepping-Stone Bridge
            </span>
            <button
              type="button"
              className="obsidian-btn-subtle"
              style={{ padding: '3px 7px', fontSize: '12.5px', color: 'var(--text-muted)' }}
              onClick={() => { setView('menu'); setError(null); }}
              disabled={loading}
            >
              ← Back
            </button>
          </div>

          <div className="obsidian-field">
            <label className="obsidian-label">Stepping Stones to Insert:</label>
            <div className="edge-pill-group">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`edge-pill-btn ${bridgeCount === num ? 'active' : ''}`}
                  onClick={() => setBridgeCount(num)}
                  disabled={loading}
                >
                  {num} {num === 1 ? 'Node' : 'Nodes'}
                </button>
              ))}
            </div>
          </div>

          <div className="obsidian-field">
            <label className="obsidian-label">Cognitive Difficulty:</label>
            <select
              className="obsidian-input"
              value={bridgeDifficulty}
              onChange={(e) => setBridgeDifficulty(e.target.value as DifficultyLevel)}
              disabled={loading}
            >
              <option value="beginner">Beginner (Intuitive)</option>
              <option value="intermediate">Intermediate (Rigorous)</option>
              <option value="advanced">Advanced (Mathematical)</option>
              <option value="expert">Expert (Frontier / Proofs)</option>
            </select>
          </div>

          <div className="obsidian-field">
            <label className="obsidian-label">Conceptual Gap Prompt (Optional):</label>
            <input
              className="obsidian-input"
              placeholder="e.g. clarify the Ito integration leap..."
              value={focusNote}
              onChange={(e) => setFocusNote(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="obsidian-btn obsidian-btn-primary"
            style={{ width: '100%', padding: '8px', fontSize: '13px', marginTop: '4px' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Synthesizing Bridge...
              </>
            ) : (
              'Generate Stepping Stones'
            )}
          </button>
        </form>
      )}

      {/* Manual Insert View */}
      {view === 'insert' && (
        <form onSubmit={handleInsertSubmit} className="edge-view-container">
          <div className="edge-view-header">
            <span className="edge-view-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Insert Intermediate Node
            </span>
            <button
              type="button"
              className="obsidian-btn-subtle"
              style={{ padding: '3px 7px', fontSize: '12.5px', color: 'var(--text-muted)' }}
              onClick={() => { setView('menu'); setError(null); }}
              disabled={loading}
            >
              ← Back
            </button>
          </div>

          <div className="obsidian-field">
            <label className="obsidian-label">Concept Title *</label>
            <input
              ref={inputTitleRef}
              className="obsidian-input"
              placeholder="e.g. Ito's Lemma"
              value={insertTitle}
              onChange={(e) => setInsertTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div className="obsidian-field">
              <label className="obsidian-label">Node Type</label>
              <select
                className="obsidian-input"
                value={insertType}
                onChange={(e) => setInsertType(e.target.value)}
                disabled={loading}
              >
                <option value="concept">Concept</option>
                <option value="subtopic">Subtopic</option>
                <option value="prerequisite">Prerequisite</option>
                <option value="note">Study Note</option>
              </select>
            </div>

            <div className="obsidian-field">
              <label className="obsidian-label">Inbound Label</label>
              <input
                className="obsidian-input"
                value={lblSourceToNew}
                onChange={(e) => setLblSourceToNew(e.target.value)}
                disabled={loading}
                placeholder="leads to"
              />
            </div>
          </div>

          <div className="obsidian-field">
            <label className="obsidian-label">Outbound Label</label>
            <input
              className="obsidian-input"
              value={lblNewToTarget}
              onChange={(e) => setLblNewToTarget(e.target.value)}
              disabled={loading}
              placeholder="develops into"
            />
          </div>

          <div className="obsidian-field">
            <label className="obsidian-label">Summary (Optional)</label>
            <textarea
              className="obsidian-input"
              rows={2}
              placeholder="Brief conceptual summary..."
              value={insertSummary}
              onChange={(e) => setInsertSummary(e.target.value)}
              disabled={loading}
              style={{ resize: 'none' }}
            />
          </div>

          <button
            type="submit"
            className="obsidian-btn obsidian-btn-primary"
            style={{ width: '100%', padding: '8px', fontSize: '13px', marginTop: '2px' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Inserting Node...
              </>
            ) : (
              'Insert Node'
            )}
          </button>
        </form>
      )}

      {/* Edit Edge View */}
      {view === 'edit' && (
        <form onSubmit={handleEditSubmit} className="edge-view-container">
          <div className="edge-view-header">
            <span className="edge-view-title">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Edit Connection Link
            </span>
            <button
              type="button"
              className="obsidian-btn-subtle"
              style={{ padding: '3px 7px', fontSize: '12.5px', color: 'var(--text-muted)' }}
              onClick={() => { setView('menu'); setError(null); }}
              disabled={loading}
            >
              ← Back
            </button>
          </div>

          <div className="obsidian-field">
            <label className="obsidian-label">Relation Type</label>
            <select
              className="obsidian-input"
              value={editRelType}
              onChange={(e) => setEditRelType(e.target.value)}
              disabled={loading}
            >
              <option value="prerequisite_for">Prerequisite For</option>
              <option value="subtopic_of">Subtopic Of</option>
              <option value="affects">Affects</option>
              <option value="governs">Governs</option>
              <option value="related_to">Related To</option>
              <option value="leads_to">Leads To</option>
            </select>
          </div>

          <div className="obsidian-field">
            <label className="obsidian-label">Link Label</label>
            <input
              className="obsidian-input"
              placeholder="e.g. Core mechanism of"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="obsidian-btn obsidian-btn-primary"
            style={{ width: '100%', padding: '8px', fontSize: '13px', marginTop: '2px' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Saving Changes...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </form>
      )}
    </div>
  );
};
