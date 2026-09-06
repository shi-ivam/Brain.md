import React from 'react';
import { SlideItem } from '../../types';
import { SLIDE_TYPE_META } from './slideMeta';
import {
  cleanFormulaString,
  renderSlideFormula,
  renderInlineMarkdownWithMath,
  renderMarkdownWithMath,
} from '../../utils/mathRenderer';

interface SlideCardViewProps {
  slide: SlideItem;
  totalSlides: number;
  currentIndex: number;
  allSlides?: SlideItem[];
  showNotes: boolean;
  showQuickCheckAnswer: boolean;
  onToggleQuickCheckAnswer: () => void;
  onSelectSlide: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

export const SlideCardView: React.FC<SlideCardViewProps> = ({
  slide,
  totalSlides,
  currentIndex,
  allSlides,
  showNotes,
  showQuickCheckAnswer,
  onToggleQuickCheckAnswer,
  onSelectSlide,
  onPrev,
  onNext,
}) => {
  const currentType = slide.slide_type || 'concept';
  const typeMeta = SLIDE_TYPE_META[currentType] || SLIDE_TYPE_META.concept;

  // Filter out empty or "None" values that LLMs might return
  const cleanedFormula = cleanFormulaString(slide.formula);
  const hasFormula = Boolean(cleanedFormula);

  const hasCallout = Boolean(
    slide.callout &&
      !['none', 'n/a', 'null', '', 'undefined'].includes(slide.callout.trim().toLowerCase())
  );

  const hasQuickCheck = Boolean(
    slide.quick_check &&
      !['none', 'n/a', 'null', '', 'undefined'].includes(slide.quick_check.trim().toLowerCase())
  );

  const hasRightPanel = hasFormula || hasCallout || hasQuickCheck;
  const hasSpeakerNotes = Boolean(
    slide.speaker_notes &&
      !['none', 'n/a', 'null', '', 'undefined'].includes(slide.speaker_notes.trim().toLowerCase())
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: 'var(--bg-canvas, #121218)',
      }}
    >
      {/* 1. Slide Card Header (Pinned Top) */}
      <div
        style={{
          padding: '20px 32px 14px 32px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              padding: '3px 10px',
              borderRadius: '4px',
              color: typeMeta.color,
              backgroundColor: typeMeta.bg,
              border: `1px solid ${typeMeta.border}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: typeMeta.color,
              }}
            />
            {typeMeta.label}
          </span>

          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted, #94a3b8)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            Slide {currentIndex + 1} of {totalSlides}
          </span>
        </div>

        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--text-primary, #f1f5f9)',
            lineHeight: 1.3,
            margin: '0 0 4px 0',
          }}
          dangerouslySetInnerHTML={{
            __html: renderInlineMarkdownWithMath(slide.title),
          }}
        />

        {slide.subtitle && (
          <div
            style={{
              fontSize: '14px',
              color: 'var(--text-muted, #94a3b8)',
              marginTop: '2px',
            }}
            dangerouslySetInnerHTML={{
              __html: renderInlineMarkdownWithMath(slide.subtitle),
            }}
          />
        )}
      </div>

      {/* 2. Slide Body (Scrollable Middle Stage) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Main Content Grid: Left Bullets, Right Key Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: hasRightPanel
              ? 'minmax(0, 1.35fr) minmax(300px, 1fr)'
              : 'minmax(0, 1fr)',
            gap: '28px',
            alignItems: 'start',
          }}
        >
          {/* Left Column: Bullet Points */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxWidth: hasRightPanel ? 'none' : '900px',
            }}
          >
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {slide.bullets.map((bullet, bIdx) => (
                <li key={bIdx} className="slide-bullet-item">
                  <span
                    className="slide-bullet-dot"
                    style={{ color: typeMeta.color }}
                  >
                    ●
                  </span>
                  <div
                    className="slide-bullet-content"
                    dangerouslySetInnerHTML={{
                      __html: renderInlineMarkdownWithMath(bullet),
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>

          {/* Right Column: Key Formula, Callout, and Active Recall Check */}
          {hasRightPanel && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                minWidth: 0,
              }}
            >
              {/* Formula Card */}
              {hasFormula && (
                <div
                  style={{
                    backgroundColor: 'rgba(18, 18, 24, 0.8)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    background:
                      'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(18, 18, 24, 0.85) 100%)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#38bdf8',
                      letterSpacing: '0.5px',
                      marginBottom: '10px',
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                      <line x1="8" y1="6" x2="16" y2="6" />
                      <line x1="8" y1="10" x2="16" y2="10" />
                    </svg>
                    KEY GOVERNING FORMULA
                  </div>
                  <div
                    style={{
                      fontSize: '15px',
                      textAlign: 'center',
                      overflowX: 'auto',
                      padding: '4px 0',
                    }}
                    dangerouslySetInnerHTML={{
                      __html: renderSlideFormula(slide.formula),
                    }}
                  />
                </div>
              )}

              {/* Callout Card */}
              {hasCallout && slide.callout && (
                <div
                  style={{
                    backgroundColor: 'rgba(18, 18, 24, 0.8)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    background:
                      'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(18, 18, 24, 0.85) 100%)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#f59e0b',
                      letterSpacing: '0.5px',
                      marginBottom: '8px',
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    KEY INSIGHT
                  </div>
                  <div
                    className="slide-callout-content markdown-body"
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary, #cbd5e1)',
                      lineHeight: 1.5,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownWithMath(slide.callout),
                    }}
                  />
                </div>
              )}

              {/* Active Recall Check Card */}
              {hasQuickCheck && slide.quick_check && (
                <div
                  style={{
                    backgroundColor: 'rgba(18, 18, 24, 0.8)',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    borderRadius: '10px',
                    padding: '14px 18px',
                    background:
                      'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(18, 18, 24, 0.85) 100%)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--accent-purple-light, #a78bfa)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      ACTIVE RECALL CHECK
                    </div>
                    {hasSpeakerNotes && (
                      <button
                        onClick={onToggleQuickCheckAnswer}
                        className="obsidian-btn-subtle"
                        style={{
                          fontSize: '11px',
                          color: '#38bdf8',
                          padding: '2px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title="Toggle solution/narration hint"
                      >
                        <span>{showQuickCheckAnswer ? 'Hide' : 'Hint'}</span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline
                            points={showQuickCheckAnswer ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}
                          />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-primary, #f1f5f9)',
                      lineHeight: 1.5,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: renderInlineMarkdownWithMath(slide.quick_check),
                    }}
                  />

                  {showQuickCheckAnswer && hasSpeakerNotes && (
                    <div
                      style={{
                        marginTop: '10px',
                        paddingTop: '8px',
                        borderTop: '1px dashed rgba(139, 92, 246, 0.3)',
                        maxHeight: '160px',
                        overflowY: 'auto',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 600,
                          color: 'var(--text-muted, #94a3b8)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '4px',
                        }}
                      >
                        Explanation & Insight:
                      </div>
                      <div
                        className="slide-notes-content markdown-body"
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary, #cbd5e1)',
                          lineHeight: 1.5,
                        }}
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdownWithMath(slide.speaker_notes),
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3. In-Depth Study Notes / Narration Section (when toggled via toolbar) */}
        {showNotes && hasSpeakerNotes && (
          <div
            style={{
              marginTop: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              border: '1px dashed var(--border-subtle, #2d2d3f)',
              borderRadius: '10px',
              padding: '14px 18px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent-purple-light, #a78bfa)',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '8px',
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              In-Depth Study Notes & Lecture Narration:
            </div>
            <div
              className="slide-notes-content markdown-body"
              dangerouslySetInnerHTML={{
                __html: renderMarkdownWithMath(slide.speaker_notes),
              }}
            />
          </div>
        )}
      </div>

      {/* 4. Bottom Navigation & Controls (Pinned Bottom) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-subtle, #2d2d3f)',
          padding: '10px 24px',
          backgroundColor: 'var(--bg-canvas, #121218)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className="obsidian-btn"
          style={{
            fontSize: '13px',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: currentIndex === 0 ? 0.35 : 1,
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
          }}
          title="Previous slide (Left Arrow)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Previous</span>
        </button>

        {/* Center Indicator Dots & Shortcut Hint */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {Array.from({ length: totalSlides }).map((_, idx) => {
              const slideTitle = allSlides?.[idx]?.title || `Slide ${idx + 1}`;
              const isCur = idx === currentIndex;
              return (
                <button
                  key={idx}
                  onClick={() => onSelectSlide(idx)}
                  style={{
                    width: isCur ? '22px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: isCur
                      ? typeMeta.color
                      : 'var(--border-subtle, #2d2d3f)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    padding: 0,
                  }}
                  title={`Go to slide ${idx + 1}: ${slideTitle}`}
                />
              );
            })}
          </div>

          <div
            style={{
              fontSize: '10px',
              color: 'var(--text-muted, #64646c)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            Navigate with <kbd style={{ fontSize: '9px', padding: '1px 4px' }}>←</kbd> and{' '}
            <kbd style={{ fontSize: '9px', padding: '1px 4px' }}>→</kbd> or{' '}
            <kbd style={{ fontSize: '9px', padding: '1px 4px' }}>Space</kbd>
          </div>
        </div>

        <button
          onClick={onNext}
          disabled={currentIndex === totalSlides - 1}
          className="obsidian-btn obsidian-btn-primary"
          style={{
            fontSize: '13px',
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: currentIndex === totalSlides - 1 ? 0.35 : 1,
            cursor: currentIndex === totalSlides - 1 ? 'not-allowed' : 'pointer',
          }}
          title="Next slide (Right Arrow or Space)"
        >
          <span>Next</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
};
