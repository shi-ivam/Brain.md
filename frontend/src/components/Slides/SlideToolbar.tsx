import React from 'react';
import { getNodeSlidesDownloadUrl } from '../../services/api';

interface SlideToolbarProps {
  deckTitle: string;
  nodeId: string;
  slidesCount: number;
  showDrawer: boolean;
  onToggleDrawer: () => void;
  showNotes: boolean;
  onToggleNotes: () => void;
  isRegenerating: boolean;
  isLoading: boolean;
  onRegenerate: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

export const SlideToolbar: React.FC<SlideToolbarProps> = ({
  deckTitle,
  nodeId,
  slidesCount,
  showDrawer,
  onToggleDrawer,
  showNotes,
  onToggleNotes,
  isRegenerating,
  isLoading,
  onRegenerate,
  isFullscreen,
  onToggleFullscreen,
  onClose,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 18px',
        backgroundColor: 'var(--bg-panel-secondary, #1a1a24)',
        borderBottom: '1px solid var(--border-subtle, #2d2d3f)',
        gap: '12px',
      }}
    >
      {/* Deck Title and Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#38bdf8' }}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary, #f1f5f9)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {deckTitle}
          </div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted, #94a3b8)' }}>
            Academic Study Slides
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Drawer toggle for slide jumper */}
        {slidesCount > 0 && (
          <button
            onClick={onToggleDrawer}
            className="obsidian-btn-subtle"
            style={{
              fontSize: '13.5px',
              padding: '5px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backgroundColor: showDrawer ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: showDrawer ? 'var(--accent-purple, #8b5cf6)' : 'inherit',
            }}
            title="Slide thumbnails / drawer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Slides ({slidesCount})</span>
          </button>
        )}

        {/* Toggle speaker notes */}
        <button
          onClick={onToggleNotes}
          className="obsidian-btn-subtle"
          style={{
            fontSize: '13.5px',
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: showNotes ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
            color: showNotes ? 'var(--accent-purple-light, #a78bfa)' : 'var(--text-muted, #94a3b8)',
          }}
          title="Toggle in-depth study notes"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>Study Notes</span>
        </button>

        {/* Download PPTX button */}
        <a
          href={getNodeSlidesDownloadUrl(nodeId, 'pptx')}
          download
          className="obsidian-btn"
          style={{
            fontSize: '13.5px',
            padding: '5px 12px',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            borderColor: 'var(--border-subtle, #2d2d3f)',
            color: 'var(--text-primary, #f1f5f9)',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
          }}
          title="Download Microsoft PowerPoint deck (.pptx)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download PPTX</span>
        </a>

        {/* Download Standalone HTML presentation */}
        <a
          href={getNodeSlidesDownloadUrl(nodeId, 'html')}
          download
          className="obsidian-btn"
          style={{
            fontSize: '13.5px',
            padding: '5px 12px',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            color: '#38bdf8',
            borderColor: 'rgba(56, 189, 248, 0.4)',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
          }}
          title="Download standalone offline presentation (.html)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>HTML</span>
        </a>

        {/* Regenerate button */}
        <button
          onClick={onRegenerate}
          disabled={isRegenerating || isLoading}
          className="obsidian-btn-subtle"
          style={{ fontSize: '13.5px', padding: '5px 10px' }}
          title="Regenerate study slides"
        >
          {isRegenerating ? 'Regenerating...' : 'Regenerate'}
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={onToggleFullscreen}
          className="obsidian-btn-subtle"
          style={{ padding: '4px 8px' }}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isFullscreen ? (
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            ) : (
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            )}
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="obsidian-btn-subtle"
          style={{ padding: '4px 8px' }}
          title="Close (Esc)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
};
