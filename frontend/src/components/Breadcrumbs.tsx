import React from 'react';
import { GraphNode } from '../types';

export interface BreadcrumbItem {
  id: string;
  title: string;
  node_type?: string;
  mastery_score?: number;
}

interface BreadcrumbsProps {
  topicTitle: string;
  history: BreadcrumbItem[];
  currentIndex: number;
  onNavigateHistory: (index: number) => void;
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  currentNode?: GraphNode | null;
  onSelectTopic?: () => void;
  onCopyLink?: () => void;
  linkCopied?: boolean;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  topicTitle,
  history,
  currentIndex,
  onNavigateHistory,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  currentNode,
  onSelectTopic,
  onCopyLink,
  linkCopied = false,
}) => {
  // Only display history items up to current index
  const visibleTrail = history.slice(0, currentIndex + 1);

  // Determine mastery badge styling
  const masteryScore = currentNode?.mastery_score ?? 0;
  const getMasteryColor = (score: number) => {
    if (score >= 80) {
      return {
        bg: 'rgba(74, 222, 128, 0.12)',
        text: '#4ade80',
        border: 'rgba(74, 222, 128, 0.25)',
      };
    }
    if (score >= 50) {
      return {
        bg: 'rgba(250, 204, 21, 0.12)',
        text: '#facc15',
        border: 'rgba(250, 204, 21, 0.25)',
      };
    }
    return {
      bg: 'rgba(167, 139, 250, 0.12)',
      text: '#c4b5fd',
      border: 'rgba(167, 139, 250, 0.25)',
    };
  };

  const masteryStyle = getMasteryColor(masteryScore);

  return (
    <nav
      aria-label="Navigation trail"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: 'rgba(20, 20, 24, 0.88)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '7px',
        padding: '5px 10px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        maxWidth: 'calc(100vw - 480px)',
        zIndex: 30,
        pointerEvents: 'auto',
      }}
    >
      {/* Back / Forward History Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginRight: '4px' }}>
        <button
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Go back"
          title="Back (Alt+Left)"
          className="obsidian-btn-subtle"
          style={{
            padding: '3px 6px',
            opacity: canGoBack ? 1 : 0.35,
            cursor: canGoBack ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          onClick={onForward}
          disabled={!canGoForward}
          aria-label="Go forward"
          title="Forward (Alt+Right)"
          className="obsidian-btn-subtle"
          style={{
            padding: '3px 6px',
            opacity: canGoForward ? 1 : 0.35,
            cursor: canGoForward ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

      {/* Trail: Topic Title */}
      <button
        onClick={onSelectTopic}
        title={`Topic: ${topicTitle}`}
        className="obsidian-btn-subtle"
        style={{
          border: 'none',
          backgroundColor: 'transparent',
          color: visibleTrail.length === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: visibleTrail.length === 0 ? 600 : 500,
          padding: '2px 6px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          maxWidth: '180px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{topicTitle}</span>
      </button>

      {/* Traversal Path */}
      {visibleTrail.map((item, idx) => {
        const isLast = idx === visibleTrail.length - 1;
        return (
          <React.Fragment key={`${item.id}-${idx}`}>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px', userSelect: 'none' }}>
              ›
            </span>
            <button
              onClick={() => onNavigateHistory(idx)}
              title={item.title}
              className="obsidian-btn-subtle"
              style={{
                border: 'none',
                backgroundColor: isLast ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: isLast ? 600 : 400,
                padding: '2px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                maxWidth: '150px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.title}
            </button>
          </React.Fragment>
        );
      })}

      {/* Active Node Mastery Badge */}
      {currentNode && (
        <>
          <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-subtle)', margin: '0 4px' }} />
          <div
            title={`Spaced Repetition Mastery: ${masteryScore}% (Ease: ${currentNode.ease_factor?.toFixed(2) ?? '2.50'}, Interval: ${currentNode.review_interval ?? 1}d)`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: masteryStyle.bg,
              border: `1px solid ${masteryStyle.border}`,
              color: masteryStyle.text,
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>★</span>
            <span>Mastery {masteryScore}%</span>
          </div>
        </>
      )}

      {/* Copy Deep Link Button */}
      {onCopyLink && (
        <button
          onClick={onCopyLink}
          title="Copy canonical deep link URL"
          className="obsidian-btn-subtle"
          style={{
            padding: '3px 6px',
            marginLeft: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            color: linkCopied ? '#4ade80' : 'var(--text-muted)',
            borderRadius: '4px',
          }}
        >
          {linkCopied ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </button>
      )}
    </nav>
  );
};
