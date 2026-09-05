import React from 'react';

interface RibbonProps {
  onOpenVault: () => void;
  onOpenSpotlight: () => void;
  onFitGraph: () => void;
  onExportVault: () => void;
  activeTopicTitle?: string;
  hasActiveTopic: boolean;
}

export const Ribbon: React.FC<RibbonProps> = ({
  onOpenVault,
  onOpenSpotlight,
  onFitGraph,
  onExportVault,
  activeTopicTitle,
  hasActiveTopic,
}) => {
  return (
    <aside
      style={{
        width: '48px',
        backgroundColor: 'var(--bg-ribbon)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        zIndex: 40,
        flexShrink: 0,
        height: '100vh',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', alignItems: 'center' }}>
        {/* Spotlight / New Topic */}
        <button
          className="obsidian-btn-subtle"
          title="New Topic Spotlight (Ctrl/Cmd+K)"
          onClick={onOpenSpotlight}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Vault / Topics Manager */}
        <button
          className="obsidian-btn-subtle"
          title="Open Vaults / Saved Graphs"
          onClick={onOpenVault}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </button>

        {/* Reset / Center Graph */}
        {hasActiveTopic && (
          <button
            className="obsidian-btn-subtle"
            title="Reset Graph Zoom & Position"
            onClick={onFitGraph}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M3 12h3m12 0h3M12 3v3m0 12v3" />
            </svg>
          </button>
        )}

        {/* Obsidian Vault Export */}
        {hasActiveTopic && (
          <button
            className="obsidian-btn-subtle"
            title="Export as Native Obsidian Vault (.zip)"
            onClick={onExportVault}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />
    </aside>
  );
};
