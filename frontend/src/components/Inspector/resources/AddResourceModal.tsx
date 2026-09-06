import React, { useState, useRef, useEffect } from 'react';
import { GraphNode, DifficultyLevel, NodeResource, ResourceType } from '../../../types';
import { createResource, uploadResourceFile, suggestResources } from '../../../services/api';
import { formatFileSize } from './resourceUtils';

interface AddResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: GraphNode;
  difficulty: DifficultyLevel;
  initialTab?: 'youtube' | 'pdf' | 'url' | 'ai';
  onResourceAdded: (resource: NodeResource) => void;
  showToast: (msg: string) => void;
}

export const AddResourceModal: React.FC<AddResourceModalProps> = ({
  isOpen,
  onClose,
  node,
  difficulty,
  initialTab = 'youtube',
  onResourceAdded,
  showToast,
}) => {
  const [activeModalTab, setActiveModalTab] = useState<'youtube' | 'pdf' | 'url' | 'ai'>(initialTab);
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // AI Suggestions state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [addedSuggestionTitles, setAddedSuggestionTitles] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveModalTab(initialTab);
      setUrlInput('');
      setTitleInput('');
      setNotesInput('');
      setSelectedFile(null);
      setErrorMessage(null);
      if (initialTab === 'ai' && aiSuggestions.length === 0) {
        handleFetchAiSuggestions();
      }
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleFetchAiSuggestions = async () => {
    setAiLoading(true);
    setErrorMessage(null);
    try {
      const res = await suggestResources(node.id, difficulty);
      setAiSuggestions(res.resources || []);
    } catch (err: any) {
      console.error('Failed to get AI suggestions:', err);
      setErrorMessage(err.message || 'Failed to generate recommendations');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddAiSuggestion = async (item: any) => {
    setIsSubmitting(true);
    try {
      const newRes = await createResource(node.id, {
        title: item.title,
        url: item.url,
        resource_type: item.resource_type,
        notes: item.notes + (item.author ? ` (${item.author})` : ''),
      });
      onResourceAdded(newRes);
      setAddedSuggestionTitles((prev) => new Set(prev).add(item.title));
      showToast(`Added: ${item.title}`);
    } catch (err: any) {
      console.error('Failed to add suggestion:', err);
      setErrorMessage(err.message || 'Failed to add resource');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (activeModalTab === 'pdf' && selectedFile) {
        const created = await uploadResourceFile(
          node.id,
          selectedFile,
          titleInput.trim() || undefined,
          notesInput.trim() || undefined
        );
        onResourceAdded(created);
        showToast('PDF uploaded successfully');
        onClose();
      } else {
        const rawUrl = urlInput.trim();
        if (!rawUrl) {
          throw new Error('Please enter a valid URL');
        }
        let type: ResourceType = activeModalTab === 'youtube' ? 'youtube' : 'url';
        if (activeModalTab === 'pdf') type = 'pdf';

        const created = await createResource(node.id, {
          title: titleInput.trim(),
          url: rawUrl,
          resource_type: type,
          notes: notesInput.trim(),
        });
        onResourceAdded(created);
        showToast('Resource attached');
        onClose();
      }
    } catch (err: any) {
      console.error('Resource creation failed:', err);
      setErrorMessage(err.message || 'Failed to attach resource');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-active)',
          borderRadius: '8px',
          width: '540px',
          maxWidth: '95vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Attach Learning Resource
            </h3>
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Concept: <strong style={{ color: 'var(--text-secondary)' }}>{node.title}</strong>
            </span>
          </div>
          <button onClick={onClose} className="obsidian-btn-subtle" style={{ padding: '4px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Tab Switcher */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-panel-secondary)',
          }}
        >
          <button
            onClick={() => setActiveModalTab('youtube')}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderBottom: activeModalTab === 'youtube' ? '2px solid #ef4444' : '2px solid transparent',
              backgroundColor: activeModalTab === 'youtube' ? 'var(--bg-panel)' : 'transparent',
              color: activeModalTab === 'youtube' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '13.5px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            YouTube Video
          </button>
          <button
            onClick={() => setActiveModalTab('pdf')}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderBottom: activeModalTab === 'pdf' ? '2px solid #f87171' : '2px solid transparent',
              backgroundColor: activeModalTab === 'pdf' ? 'var(--bg-panel)' : 'transparent',
              color: activeModalTab === 'pdf' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '13.5px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Lecture PDF
          </button>
          <button
            onClick={() => setActiveModalTab('url')}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderBottom: activeModalTab === 'url' ? '2px solid var(--accent-purple)' : '2px solid transparent',
              backgroundColor: activeModalTab === 'url' ? 'var(--bg-panel)' : 'transparent',
              color: activeModalTab === 'url' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '13.5px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Web Link
          </button>
          <button
            onClick={() => {
              setActiveModalTab('ai');
              if (aiSuggestions.length === 0) handleFetchAiSuggestions();
            }}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderBottom: activeModalTab === 'ai' ? '2px solid var(--accent-purple-light)' : '2px solid transparent',
              backgroundColor: activeModalTab === 'ai' ? 'var(--bg-panel)' : 'transparent',
              color: activeModalTab === 'ai' ? 'var(--accent-purple-light)' : 'var(--text-muted)',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            AI Curator
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {errorMessage && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '4px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                fontSize: '13.5px',
                marginBottom: '14px',
              }}
            >
              {errorMessage}
            </div>
          )}

          {activeModalTab === 'ai' ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                }}
              >
                <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>
                  Curated recommendations from MIT, 3Blue1Brown, Stanford, and seminal research:
                </span>
                <button
                  onClick={handleFetchAiSuggestions}
                  disabled={aiLoading}
                  className="obsidian-btn-subtle"
                  style={{ fontSize: '12.5px', color: 'var(--accent-purple-light)' }}
                >
                  {aiLoading ? 'Searching...' : 'Refresh'}
                </button>
              </div>

              {aiLoading ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px', color: 'var(--accent-purple-light)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" />
                    </svg>
                  </div>
                  <p style={{ fontSize: '14.5px', margin: 0 }}>Finding high-yield lectures and PDFs for {node.title}...</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {aiSuggestions.map((item, idx) => {
                    const isAdded = addedSuggestionTitles.has(item.title);
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--bg-panel-secondary)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '12px',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {item.resource_type === 'youtube' ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                              ) : item.resource_type === 'pdf' ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                              )}
                            </span>
                            <strong style={{ fontSize: '14.5px', color: 'var(--text-primary)' }}>{item.title}</strong>
                          </div>
                          {item.author && (
                            <div style={{ fontSize: '12px', color: 'var(--accent-purple-light)', marginBottom: '4px' }}>
                              {item.author}
                            </div>
                          )}
                          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '0 0 6px 0', lineHeight: 1.4 }}>
                            {item.notes}
                          </p>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '12px', color: 'var(--text-muted)', wordBreak: 'break-all' }}
                          >
                            {item.url}
                          </a>
                        </div>

                        <button
                          onClick={() => handleAddAiSuggestion(item)}
                          disabled={isAdded || isSubmitting}
                          className={isAdded ? 'obsidian-btn' : 'obsidian-btn-primary'}
                          style={{
                            fontSize: '12.5px',
                            padding: '5px 12px',
                            flexShrink: 0,
                            opacity: isAdded ? 0.6 : 1,
                          }}
                        >
                          {isAdded ? 'Attached' : '+ Attach'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmitResource} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {activeModalTab === 'pdf' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 500, marginBottom: '6px' }}>
                    Lecture PDF Source
                  </label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed var(--border-active)',
                      borderRadius: '6px',
                      padding: '20px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      backgroundColor: selectedFile ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const f = e.target.files[0];
                          setSelectedFile(f);
                          if (!titleInput) {
                            setTitleInput(f.name.replace(/\.pdf$/i, ''));
                          }
                        }
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px', color: 'var(--text-muted)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    {selectedFile ? (
                      <div>
                        <strong style={{ color: '#10b981', fontSize: '14.5px' }}>{selectedFile.name}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {formatFileSize(selectedFile.size)} • Click to change
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontSize: '14.5px', color: 'var(--text-primary)', fontWeight: 500 }}>
                          Choose a PDF file from your device
                        </span>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Or paste a direct PDF URL below
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Or enter PDF URL:</span>
                    <input
                      type="url"
                      placeholder="https://example.edu/lectures/lecture_notes.pdf"
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setSelectedFile(null);
                      }}
                      className="obsidian-input"
                      style={{ width: '100%', marginTop: '4px', fontSize: '13.5px' }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 500, marginBottom: '6px' }}>
                    {activeModalTab === 'youtube' ? 'YouTube URL' : 'Resource URL'}
                  </label>
                  <input
                    type="url"
                    required
                    placeholder={
                      activeModalTab === 'youtube'
                        ? 'https://www.youtube.com/watch?v=... or https://youtu.be/...'
                        : 'https://...'
                    }
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="obsidian-input"
                    style={{ width: '100%', fontSize: '13.5px' }}
                  />
                </div>
              )}

              {/* Title */}
              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 500, marginBottom: '6px' }}>
                  Resource Title
                </label>
                <input
                  type="text"
                  placeholder={`e.g. 3Blue1Brown - Understanding ${node.title}`}
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="obsidian-input"
                  style={{ width: '100%', fontSize: '13.5px' }}
                />
              </div>

              {/* Notes / Takeaways */}
              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: 500, marginBottom: '6px' }}>
                  Key Notes / Timestamps / Insights (Optional)
                </label>
                <textarea
                  placeholder="e.g. Watch minute 4:20 to 12:00 for visual intuition on random walks and diffusion equation..."
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="obsidian-input"
                  style={{ width: '100%', height: '76px', resize: 'vertical', fontSize: '13.5px', lineHeight: 1.4 }}
                />
              </div>

              {/* Action Row */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="obsidian-btn"
                  style={{ fontSize: '13.5px', padding: '7px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (!selectedFile && !urlInput.trim())}
                  className="obsidian-btn-primary"
                  style={{ fontSize: '13.5px', padding: '7px 16px' }}
                >
                  {isSubmitting ? 'Attaching...' : 'Attach to Concept'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
