import React, { useEffect, useRef } from 'react';
import { SlideItem } from '../../types';
import { SLIDE_TYPE_META } from './slideMeta';
import { renderInlineMarkdownWithMath, cleanFormulaString } from '../../utils/mathRenderer';

interface SlideThumbnailsDrawerProps {
  slides: SlideItem[];
  currentIndex: number;
  onSelectSlide: (index: number) => void;
}

export const SlideThumbnailsDrawer: React.FC<SlideThumbnailsDrawerProps> = ({
  slides,
  currentIndex,
  onSelectSlide,
}) => {
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll active slide thumbnail into view
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [currentIndex]);

  return (
    <div
      style={{
        width: '260px',
        flexShrink: 0,
        backgroundColor: 'var(--bg-panel-secondary, #1a1a24)',
        borderRight: '1px solid var(--border-subtle, #2d2d3f)',
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 20,
      }}
    >
      <div
        style={{
          fontSize: '12.5px',
          fontWeight: 700,
          color: 'var(--text-muted, #94a3b8)',
          letterSpacing: '0.6px',
          marginBottom: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>SLIDES OVERVIEW</span>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>
          {currentIndex + 1}/{slides.length}
        </span>
      </div>

      {slides.map((s, idx) => {
        const isCur = idx === currentIndex;
        const sm = SLIDE_TYPE_META[s.slide_type] || SLIDE_TYPE_META.concept;
        const hasFormula = Boolean(cleanFormulaString(s.formula));
        const hasCheck = Boolean(s.quick_check);

        return (
          <button
            key={idx}
            ref={isCur ? activeItemRef : null}
            onClick={() => onSelectSlide(idx)}
            style={{
              textAlign: 'left',
              padding: '9px 12px',
              borderRadius: '8px',
              border: isCur
                ? `1px solid ${sm.color}`
                : '1px solid var(--border-subtle, #2d2d3f)',
              borderLeft: isCur
                ? `3px solid ${sm.color}`
                : '1px solid var(--border-subtle, #2d2d3f)',
              backgroundColor: isCur
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(255, 255, 255, 0.02)',
              color: isCur
                ? 'var(--text-primary, #f1f5f9)'
                : 'var(--text-secondary, #cbd5e1)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
              transition: 'all 0.15s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: sm.color,
                  letterSpacing: '0.4px',
                }}
              >
                {idx + 1}. {sm.label.toUpperCase()}
              </span>

              {/* Badges for special content */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {hasFormula && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontWeight: 700,
                    }}
                    title="Contains key formula"
                  >
                    fx
                  </span>
                )}
                {hasCheck && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(139, 92, 246, 0.15)',
                      color: '#a78bfa',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontWeight: 700,
                    }}
                    title="Contains active recall check"
                  >
                    ?
                  </span>
                )}
              </div>
            </div>

            <div
              style={{
                fontSize: '13.5px',
                fontWeight: isCur ? 600 : 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
              }}
              dangerouslySetInnerHTML={{
                __html: renderInlineMarkdownWithMath(s.title),
              }}
            />
          </button>
        );
      })}
    </div>
  );
};

