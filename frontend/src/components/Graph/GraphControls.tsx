import React from 'react';
import { LayoutMode, NodeType } from '../../types';

interface GraphControlsProps {
  layoutMode: LayoutMode;
  onToggleLayout: (mode: LayoutMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  searchFilter: string;
  onSearchFilterChange: (val: string) => void;
  activeFilters: Set<NodeType>;
  onToggleFilter: (type: NodeType) => void;
}

const ALL_TYPES: { type: NodeType; label: string; color: string }[] = [
  { type: 'concept', label: 'Concepts', color: 'var(--tag-concept-text)' },
  { type: 'prerequisite', label: 'Prereqs', color: 'var(--tag-prereq-text)' },
  { type: 'subtopic', label: 'Subtopics', color: 'var(--text-secondary)' },
  { type: 'question', label: 'Questions', color: 'var(--tag-question-text)' },
  { type: 'quiz', label: 'Quizzes', color: 'var(--tag-quiz-text)' },
  { type: 'note', label: 'Notes', color: 'var(--tag-note-text)' },
];

export const GraphControls: React.FC<GraphControlsProps> = ({
  layoutMode,
  onToggleLayout,
  onZoomIn,
  onZoomOut,
  onResetView,
  searchFilter,
  onSearchFilterChange,
  activeFilters,
  onToggleFilter,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        backgroundColor: 'rgba(28, 28, 31, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '6px',
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 30,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
      }}
    >
      {/* Top bar: Layout toggle and Zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Layout Segmented Control */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            padding: '2px',
          }}
        >
          <button
            onClick={() => onToggleLayout('dag')}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              fontFamily: 'var(--font-sans)',
              backgroundColor: layoutMode === 'dag' ? 'var(--bg-hover)' : 'transparent',
              color: layoutMode === 'dag' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontWeight: layoutMode === 'dag' ? 500 : 400,
            }}
            title="Academic Left-to-Right progression (Foundations on left, pillars in middle, subtopics on right)"
          >
            Academic Flow
          </button>
          <button
            onClick={() => onToggleLayout('force')}
            style={{
              padding: '3px 8px',
              fontSize: '11px',
              fontFamily: 'var(--font-sans)',
              backgroundColor: layoutMode === 'force' ? 'var(--bg-hover)' : 'transparent',
              color: layoutMode === 'force' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontWeight: layoutMode === 'force' ? 500 : 400,
            }}
            title="Obsidian Force-Directed Physics Simulation"
          >
            Force Graph
          </button>
        </div>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <button onClick={onZoomIn} className="obsidian-btn-subtle" title="Zoom In" style={{ padding: '4px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button onClick={onZoomOut} className="obsidian-btn-subtle" title="Zoom Out" style={{ padding: '4px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button onClick={onResetView} className="obsidian-btn-subtle" title="Fit to Screen" style={{ padding: '4px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Node Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '4px',
          padding: '2px 8px',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ marginRight: '6px' }}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Filter graph nodes..."
          value={searchFilter}
          onChange={(e) => onSearchFilterChange(e.target.value)}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
            width: '130px',
          }}
        />
        {searchFilter && (
          <button
            onClick={() => onSearchFilterChange('')}
            className="obsidian-btn-subtle"
            style={{ padding: '1px' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Type Filter Pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '240px' }}>
        {ALL_TYPES.map((t) => {
          const isActive = activeFilters.has(t.type);
          return (
            <button
              key={t.type}
              onClick={() => onToggleFilter(t.type)}
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '3px',
                border: '1px solid',
                borderColor: isActive ? t.color : 'var(--border-subtle)',
                backgroundColor: isActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                color: isActive ? t.color : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
