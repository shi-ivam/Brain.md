import React from 'react';
import { NodeResource } from '../../../types';
import { getYouTubeId, formatFileSize } from './resourceUtils';

interface ResourceCardProps {
  resource: NodeResource;
  isPlaying: boolean;
  onTogglePlay: (id: string | null) => void;
  onOpenPdf: (pdf: { title: string; url: string }) => void;
  onInsertSnippet?: (resource: NodeResource) => void;
  onDelete: (id: string, title: string) => void;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  resource: res,
  isPlaying,
  onTogglePlay,
  onOpenPdf,
  onInsertSnippet,
  onDelete,
}) => {
  const isYt = res.resource_type === 'youtube';
  const isPdf = res.resource_type === 'pdf';
  const ytId = isYt ? res.metadata?.videoId || getYouTubeId(res.url) : null;
  const embedUrl = ytId
    ? `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1` +
      (res.metadata?.start_seconds ? `&start=${res.metadata.start_seconds}` : '')
    : null;

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-panel-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Inline YouTube Player */}
      {isYt && isPlaying && embedUrl ? (
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, backgroundColor: '#000' }}>
          <iframe
            src={embedUrl}
            title={res.title}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : null}

      {/* Card Header & Content */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/* Thumbnail or Type Icon */}
          {isYt && ytId && !isPlaying ? (
            <div
              onClick={() => onTogglePlay(res.id)}
              style={{
                position: 'relative',
                width: '100px',
                height: '56px',
                borderRadius: '4px',
                overflow: 'hidden',
                cursor: 'pointer',
                flexShrink: 0,
                backgroundColor: '#000',
              }}
              title="Click to play video"
            >
              <img
                src={res.thumbnail_url || `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                alt={res.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 0, 0, 0.9)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="#fff">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '6px',
                backgroundColor: isPdf
                  ? 'rgba(239, 68, 68, 0.15)'
                  : isYt
                  ? 'rgba(220, 38, 38, 0.15)'
                  : 'rgba(99, 102, 241, 0.15)',
                color: isPdf ? '#f87171' : isYt ? '#ef4444' : 'var(--accent-purple-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '18px',
              }}
            >
              {isPdf ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              ) : isYt ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              )}
            </div>
          )}

          {/* Meta & Title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  fontWeight: 600,
                  backgroundColor: isPdf
                    ? 'rgba(239, 68, 68, 0.2)'
                    : isYt
                    ? 'rgba(220, 38, 38, 0.2)'
                    : 'rgba(99, 102, 241, 0.2)',
                  color: isPdf ? '#f87171' : isYt ? '#ef4444' : 'var(--accent-purple-light)',
                }}
              >
                {res.resource_type}
              </span>

              {isPdf && res.file_size ? (
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {formatFileSize(res.file_size)}
                </span>
              ) : null}

              {res.metadata?.start_seconds ? (
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Starts @ {Math.floor(res.metadata.start_seconds / 60)}m{res.metadata.start_seconds % 60}s
                </span>
              ) : null}
            </div>

            <h4
              style={{
                margin: '0 0 4px 0',
                fontSize: '15.5px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: 1.35,
                wordBreak: 'break-word',
              }}
            >
              {res.title}
            </h4>

            {res.notes && (
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '13.5px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                }}
              >
                {res.notes}
              </p>
            )}
          </div>
        </div>

        {/* Actions Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '12px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {/* Video Watch Toggle */}
            {isYt && ytId && (
              <button
                onClick={() => onTogglePlay(isPlaying ? null : res.id)}
                className={`obsidian-btn ${isPlaying ? 'obsidian-btn-primary' : ''}`}
                style={{ fontSize: '12.5px', padding: '4px 9px' }}
              >
                {isPlaying ? 'Close Player' : 'Watch in Panel'}
              </button>
            )}

            {/* PDF Viewer */}
            {isPdf && (
              <button
                onClick={() => onOpenPdf({ title: res.title, url: res.url })}
                className="obsidian-btn"
                style={{ fontSize: '12.5px', padding: '4px 9px' }}
              >
                Read PDF
              </button>
            )}

            {/* Insert into Note */}
            {onInsertSnippet && (
              <button
                onClick={() => onInsertSnippet(res)}
                className="obsidian-btn"
                style={{ fontSize: '12.5px', padding: '4px 9px' }}
                title="Insert link and callout into current Study Note"
              >
                Insert into Note
              </button>
            )}

            {/* Open external */}
            <a
              href={res.url}
              target="_blank"
              rel="noreferrer"
              className="obsidian-btn-subtle"
              style={{
                fontSize: '12.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 9px',
                textDecoration: 'none',
                color: 'var(--text-secondary)',
              }}
            >
              <span>Open ↗</span>
            </a>
          </div>

          {/* Delete */}
          <button
            onClick={() => onDelete(res.id, res.title)}
            className="obsidian-btn-subtle"
            style={{ padding: '4px', color: '#f87171' }}
            title="Remove resource"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
