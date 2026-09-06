import React, { useState } from 'react';
import { LayoutMode, NodeType, GraphNode, CommunityGroupInfo } from '../../types';

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
  // Features 14, 21, 16, 22
  lensMode?: 'all' | '1-hop' | '2-hop';
  onLensModeChange?: (mode: 'all' | '1-hop' | '2-hop') => void;
  colorMode?: 'default' | 'heatmap';
  onColorModeToggle?: () => void;
  nodes?: GraphNode[];
  onFindShortestPath?: (sourceId: string, targetId: string) => void;
  onClearShortestPath?: () => void;
  shortestPathActive?: boolean;
  showMiniMap?: boolean;
  onToggleMiniMap?: () => void;
  communities?: CommunityGroupInfo[];
  selectedCommunityId?: number | null;
  onSelectCommunity?: (communityId: number | null) => void;
  onAutoOrganize?: () => void;
  isAutoOrganizing?: boolean;
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
  lensMode = 'all',
  onLensModeChange,
  colorMode = 'default',
  onColorModeToggle,
  nodes = [],
  onFindShortestPath,
  onClearShortestPath,
  shortestPathActive = false,
  showMiniMap = true,
  onToggleMiniMap,
  communities = [],
  selectedCommunityId = null,
  onSelectCommunity,
  onAutoOrganize,
  isAutoOrganizing = false,
}) => {
  const [isPathFinderOpen, setIsPathFinderOpen] = useState(false);
  const [sourceNodeId, setSourceNodeId] = useState('');
  const [targetNodeId, setTargetNodeId] = useState('');

  const sortedNodes = [...nodes].sort((a, b) => a.title.localeCompare(b.title));

  const handleRunShortestPath = () => {
    if (sourceNodeId && targetNodeId && onFindShortestPath) {
      onFindShortestPath(sourceNodeId, targetNodeId);
      setIsPathFinderOpen(false);
    }
  };

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
      {/* Top bar: Layout toggle, Zoom, and Mini-map toggle */}
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

          {/* Mini-map toggle */}
          {onToggleMiniMap && (
            <button
              onClick={onToggleMiniMap}
              className="obsidian-btn-subtle"
              title={showMiniMap ? 'Hide Mini-Map' : 'Show Mini-Map'}
              style={{
                padding: '4px',
                color: showMiniMap ? '#38bdf8' : 'var(--text-muted)',
                backgroundColor: showMiniMap ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <rect x="13" y="11" width="6" height="8" rx="1" />
              </svg>
            </button>
          )}

          {/* Auto Organize button */}
          {onAutoOrganize && (
            <button
              onClick={onAutoOrganize}
              disabled={isAutoOrganizing}
              className="obsidian-btn-subtle"
              title="Auto Organize (Tidy up graph layout into a clean, collision-free hierarchy)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 8px',
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                color: 'var(--text-primary)',
                backgroundColor: 'rgba(191, 164, 248, 0.12)',
                border: '1px solid rgba(191, 164, 248, 0.3)',
                borderRadius: '4px',
                cursor: isAutoOrganizing ? 'not-allowed' : 'pointer',
                opacity: isAutoOrganizing ? 0.6 : 1,
                fontWeight: 500,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {isAutoOrganizing ? 'Organizing...' : 'Auto Organize'}
            </button>
          )}
        </div>
      </div>

      {/* Second bar: Subgraph Lens, Color Mode toggle, Shortest Path */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {/* Lens dropdown */}
        {onLensModeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Lens:</span>
            <select
              value={lensMode}
              onChange={(e) => onLensModeChange(e.target.value as 'all' | '1-hop' | '2-hop')}
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '2px 4px',
                outline: 'none',
                cursor: 'pointer',
              }}
              title="Subgraph Lens Filter"
            >
              <option value="all">Full Graph</option>
              <option value="1-hop">1-Hop Neighbors</option>
              <option value="2-hop">2-Hop Neighborhood</option>
            </select>
          </div>
        )}

        {/* Thematic Modules / Communities dropdown */}
        {communities && communities.length > 0 && onSelectCommunity && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Module:</span>
            <select
              value={selectedCommunityId !== null && selectedCommunityId !== undefined ? String(selectedCommunityId) : 'all'}
              onChange={(e) => onSelectCommunity(e.target.value === 'all' ? null : Number(e.target.value))}
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-sans)',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '2px 4px',
                outline: 'none',
                cursor: 'pointer',
                maxWidth: '125px',
              }}
              title="Filter by topological learning module / community"
            >
              <option value="all">All Modules ({nodes.length})</option>
              {communities.map((c) => (
                <option key={c.community_id} value={c.community_id}>
                  {c.label} ({c.node_count})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Color Mode toggle */}
        {onColorModeToggle && (
          <button
            onClick={onColorModeToggle}
            className="obsidian-btn-subtle"
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: colorMode === 'heatmap' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-card)',
              color: colorMode === 'heatmap' ? '#f87171' : 'var(--text-secondary)',
            }}
            title="Toggle between default node type colors and mastery gap heatmap"
          >
            {colorMode === 'heatmap' ? '🔥 Heatmap' : '🎨 Nodes'}
          </button>
        )}

        {/* Shortest Path Tool Button */}
        {onFindShortestPath && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsPathFinderOpen((prev) => !prev)}
              className="obsidian-btn-subtle"
              style={{
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                border: `1px solid ${shortestPathActive ? '#f59e0b' : 'var(--border-subtle)'}`,
                backgroundColor: shortestPathActive ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-card)',
                color: shortestPathActive ? '#f59e0b' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Find Shortest Connection Path between two concepts"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="19" r="3" />
                <path d="M9 19h8.5a4.5 4.5 0 0 0 0-9H5" />
                <circle cx="18" cy="5" r="3" />
              </svg>
              <span>Path</span>
            </button>

            {/* Shortest Path Popover Modal */}
            {isPathFinderOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '28px',
                  right: 0,
                  width: '240px',
                  backgroundColor: 'var(--bg-panel)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '10px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  zIndex: 40,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b' }}>Shortest Path Trail</span>
                  <button
                    onClick={() => setIsPathFinderOpen(false)}
                    className="obsidian-btn-subtle"
                    style={{ padding: '2px' }}
                  >
                    ✕
                  </button>
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                    Start Concept:
                  </label>
                  <select
                    value={sourceNodeId}
                    onChange={(e) => setSourceNodeId(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: '11px',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      padding: '4px',
                    }}
                  >
                    <option value="">Select origin node...</option>
                    {sortedNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                    Destination Concept:
                  </label>
                  <select
                    value={targetNodeId}
                    onChange={(e) => setTargetNodeId(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: '11px',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      padding: '4px',
                    }}
                  >
                    <option value="">Select target node...</option>
                    {sortedNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  <button
                    onClick={handleRunShortestPath}
                    disabled={!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId}
                    className="obsidian-btn obsidian-btn-primary"
                    style={{ flex: 1, fontSize: '11px', padding: '4px 0', justifyContent: 'center' }}
                  >
                    Trace Path
                  </button>
                  {shortestPathActive && onClearShortestPath && (
                    <button
                      onClick={() => {
                        onClearShortestPath();
                        setIsPathFinderOpen(false);
                      }}
                      className="obsidian-btn"
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
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
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          style={{ marginRight: '6px' }}
        >
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

