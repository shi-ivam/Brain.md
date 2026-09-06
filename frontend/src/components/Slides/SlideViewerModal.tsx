import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GraphNode, DifficultyLevel, SlideDeck, SlideItem } from '../../types';
import { fetchNodeSlides, generateNodeSlides } from '../../services/api';
import { SlideToolbar } from './SlideToolbar';
import { SlideThumbnailsDrawer } from './SlideThumbnailsDrawer';
import { SlideCardView } from './SlideCardView';

interface SlideViewerModalProps {
  node: GraphNode;
  difficulty: DifficultyLevel;
  isOpen: boolean;
  onClose: () => void;
}

export const SlideViewerModal: React.FC<SlideViewerModalProps> = ({
  node,
  difficulty,
  isOpen,
  onClose,
}) => {
  const [deck, setDeck] = useState<SlideDeck | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showQuickCheckAnswer, setShowQuickCheckAnswer] = useState<boolean>(false);
  const [showDrawer, setShowDrawer] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load or generate slides on open
  useEffect(() => {
    if (!isOpen) {
      setCurrentIndex(0);
      setShowQuickCheckAnswer(false);
      setShowDrawer(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchNodeSlides(node.id)
      .then(async (existing) => {
        if (!isMounted) return;
        if (existing && existing.slides && existing.slides.length > 0) {
          setDeck(existing);
          setIsLoading(false);
        } else {
          try {
            const generated = await generateNodeSlides(node.id, false, difficulty);
            if (isMounted) {
              setDeck(generated);
              setIsLoading(false);
            }
          } catch (err: any) {
            if (isMounted) {
              setError(err.message || 'Failed to generate study slides');
              setIsLoading(false);
            }
          }
        }
      })
      .catch(async () => {
        if (!isMounted) return;
        try {
          const generated = await generateNodeSlides(node.id, false, difficulty);
          if (isMounted) {
            setDeck(generated);
            setIsLoading(false);
          }
        } catch (err: any) {
          if (isMounted) {
            setError(err.message || 'Failed to generate study slides');
            setIsLoading(false);
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, node.id, difficulty]);

  // Handle slide regeneration
  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setError(null);
    try {
      const regenerated = await generateNodeSlides(node.id, true, difficulty);
      setDeck(regenerated);
      setCurrentIndex(0);
      setShowQuickCheckAnswer(false);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate slides');
    } finally {
      setIsRegenerating(false);
    }
  };

  const slides = deck?.slides || [];
  const currentSlide: SlideItem | undefined = slides[currentIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setShowQuickCheckAnswer(false);
    }
  }, [currentIndex, slides.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setShowQuickCheckAnswer(false);
    }
  }, [currentIndex]);

  const handleSelectSlide = (idx: number) => {
    setCurrentIndex(idx);
    setShowQuickCheckAnswer(false);
  };

  // Keyboard navigation & Fullscreen sync
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        handleToggleFullscreen();
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isOpen, isFullscreen, handleNext, handlePrev, onClose]);

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  // Clamp current index if slides change
  useEffect(() => {
    if (slides.length > 0 && currentIndex >= slides.length) {
      setCurrentIndex(slides.length - 1);
    }
  }, [slides.length, currentIndex]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isFullscreen ? '0' : '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: isFullscreen ? '100vw' : '94vw',
          maxWidth: isFullscreen ? '100vw' : '1280px',
          height: isFullscreen ? '100vh' : '90vh',
          maxHeight: isFullscreen ? '100vh' : '820px',
          backgroundColor: 'var(--bg-canvas, #121218)',
          border: isFullscreen ? 'none' : '1px solid var(--border-subtle, #2d2d3f)',
          borderRadius: isFullscreen ? '0' : '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Top Header Bar */}
        <SlideToolbar
          deckTitle={deck?.deck_title || `${node.title} — Study Slides`}
          nodeId={node.id}
          slidesCount={slides.length}
          showDrawer={showDrawer}
          onToggleDrawer={() => setShowDrawer((prev) => !prev)}
          showNotes={showNotes}
          onToggleNotes={() => setShowNotes((prev) => !prev)}
          isRegenerating={isRegenerating}
          isLoading={isLoading}
          onRegenerate={handleRegenerate}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onClose={onClose}
        />

        {/* Slide Progress Indicator Bar */}
        {slides.length > 0 && (
          <div style={{ height: '3px', backgroundColor: 'var(--border-subtle, #2d2d3f)', width: '100%' }}>
            <div
              style={{
                height: '100%',
                backgroundColor: 'var(--accent-purple, #8b5cf6)',
                width: `${((currentIndex + 1) / slides.length) * 100}%`,
                transition: 'width 0.25s ease-out',
              }}
            />
          </div>
        )}

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
          {/* Slide Drawer (Thumbnails / Quick Jump) */}
          {showDrawer && slides.length > 0 && (
            <SlideThumbnailsDrawer
              slides={slides}
              currentIndex={currentIndex}
              onSelectSlide={handleSelectSlide}
            />
          )}

          {/* Main Slide Stage */}
          {isLoading ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  border: '3px solid rgba(139, 92, 246, 0.2)',
                  borderTopColor: 'var(--accent-purple, #8b5cf6)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: '17px', fontWeight: 500, color: 'var(--text-primary, #f1f5f9)' }}>
                Generating study slides...
              </div>
              <div style={{ fontSize: '13.5px', color: 'var(--text-muted, #94a3b8)' }}>
                Synthesizing intuition, mathematical formalism, dynamics, and self-checks.
              </div>
            </div>
          ) : error ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div style={{ fontSize: '16.5px', color: '#f87171', fontWeight: 500 }}>{error}</div>
              <button onClick={handleRegenerate} className="obsidian-btn obsidian-btn-primary" style={{ fontSize: '14px', padding: '7px 16px' }}>
                Retry
              </button>
            </div>
          ) : currentSlide ? (
            <SlideCardView
              slide={currentSlide}
              totalSlides={slides.length}
              currentIndex={currentIndex}
              allSlides={slides}
              showNotes={showNotes}
              showQuickCheckAnswer={showQuickCheckAnswer}
              onToggleQuickCheckAnswer={() => setShowQuickCheckAnswer((prev) => !prev)}
              onSelectSlide={handleSelectSlide}
              onPrev={handlePrev}
              onNext={handleNext}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple, #8b5cf6)" strokeWidth="1.75">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <div style={{ fontSize: '17px', color: 'var(--text-primary, #f1f5f9)', fontWeight: 500 }}>
                No study slides generated yet for this concept.
              </div>
              <button onClick={handleRegenerate} className="obsidian-btn obsidian-btn-primary" style={{ fontSize: '14px', padding: '7px 18px' }}>
                Generate Study Slides
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
