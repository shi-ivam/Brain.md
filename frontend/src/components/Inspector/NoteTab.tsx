import React, { useState, useEffect, useRef } from 'react';
import { GraphNode, DifficultyLevel, KnowledgeGraphData } from '../../types';
import { saveNodeNote, synthesizeStudyNote, syncWikilinks } from '../../services/api';
import { renderMarkdownWithMath, slugifyHeader } from '../../utils/mathRenderer';

interface NoteTabProps {
  node: GraphNode;
  nodes?: GraphNode[];
  difficulty: DifficultyLevel;
  targetSection?: string;
  onNodeUpdated: (nodeId: string, newContent: string) => void;
  onDecomposeQuestion?: (nodeId: string) => Promise<void>;
  onSelectNode?: (node: GraphNode) => void;
  onGraphUpdated?: (fullGraph: KnowledgeGraphData) => void;
}

export const NoteTab: React.FC<NoteTabProps> = ({
  node,
  nodes = [],
  difficulty,
  targetSection,
  onNodeUpdated,
  onDecomposeQuestion,
  onSelectNode,
  onGraphUpdated,
}) => {
  const [content, setContent] = useState(node.content || node.summary || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Wikilink Autocomplete state
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);

  // Wikilink Syncing state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const markdownContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContent(node.content || node.summary || '');
    setIsEditing(false);
    setAutocompleteOpen(false);
  }, [node.id, node.content, node.summary]);

  // Handle section scrolling
  const scrollToSection = (sec: string) => {
    if (!markdownContainerRef.current) return;
    const container = markdownContainerRef.current;
    const slug = slugifyHeader(sec);

    let targetEl = container.querySelector<HTMLElement>(`[id="${slug}"]`);
    if (!targetEl) {
      targetEl = container.querySelector<HTMLElement>(`[data-heading="${sec}"]`);
    }
    if (!targetEl) {
      const headings = container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
      for (const h of Array.from(headings)) {
        if (h.textContent?.trim().toLowerCase() === sec.trim().toLowerCase()) {
          targetEl = h;
          break;
        }
      }
    }

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      targetEl.style.transition = 'background-color 0.3s ease, padding-left 0.3s ease';
      targetEl.style.backgroundColor = 'rgba(139, 123, 245, 0.25)';
      targetEl.style.borderRadius = '4px';
      targetEl.style.paddingLeft = '6px';
      setTimeout(() => {
        if (targetEl) {
          targetEl.style.backgroundColor = 'transparent';
          targetEl.style.paddingLeft = '0px';
        }
      }, 2200);
    }
  };

  const scrollToBlock = (blockId: string) => {
    if (!markdownContainerRef.current) return;
    const container = markdownContainerRef.current;
    const elements = container.querySelectorAll<HTMLElement>('p, li, div, code');
    let targetEl: HTMLElement | null = null;
    for (const el of Array.from(elements)) {
      if (el.textContent?.includes(`^${blockId}`)) {
        targetEl = el;
        break;
      }
    }
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.style.transition = 'background-color 0.3s ease';
      targetEl.style.backgroundColor = 'rgba(139, 123, 245, 0.25)';
      setTimeout(() => {
        if (targetEl) targetEl.style.backgroundColor = 'transparent';
      }, 2200);
    }
  };

  // Scroll to targeted section when note loads
  useEffect(() => {
    if (targetSection && !isEditing) {
      const timer = setTimeout(() => {
        scrollToSection(targetSection);
      }, 180);
      return () => clearTimeout(timer);
    }
  }, [targetSection, isEditing, node.id]);

  // Autocomplete suggestions filtered by query
  const suggestions = nodes
    .filter((n) => n.id !== node.id && n.title.toLowerCase().includes(autocompleteQuery.toLowerCase()))
    .slice(0, 8);

  const checkAutocomplete = (text: string, cursorPos: number) => {
    const textBeforeCursor = text.slice(0, cursorPos);
    const match = textBeforeCursor.match(/\[\[([^\]\n]*)$/);
    if (match) {
      setAutocompleteQuery(match[1]);
      setAutocompleteOpen(true);
      setAutocompleteIndex(0);
    } else {
      setAutocompleteOpen(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    checkAutocomplete(val, e.target.selectionStart || 0);
  };

  const insertWikilink = (targetTitle: string) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart || 0;
    const textBeforeCursor = content.slice(0, start);
    const textAfterCursor = content.slice(start);

    const match = textBeforeCursor.match(/\[\[([^\]\n]*)$/);
    if (!match || match.index === undefined) return;

    const prefix = textBeforeCursor.slice(0, match.index);
    const newContent = `${prefix}[[${targetTitle}]] ${textAfterCursor}`;
    setContent(newContent);
    setAutocompleteOpen(false);

    const newCursor = prefix.length + targetTitle.length + 5; // [[ + title + ]] + ' '
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursor, newCursor);
    }, 10);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!autocompleteOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutocompleteIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutocompleteIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertWikilink(suggestions[autocompleteIndex].title);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAutocompleteOpen(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveNodeNote(node.id, content);
      onNodeUpdated(node.id, content);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDecompose = async () => {
    if (!onDecomposeQuestion) return;
    setIsDecomposing(true);
    try {
      await onDecomposeQuestion(node.id);
    } catch (err) {
      console.error('Failed to decompose question:', err);
    } finally {
      setIsDecomposing(false);
    }
  };

  const handleSynthesize = async () => {
    setIsSynthesizing(true);
    try {
      const res = await synthesizeStudyNote(node.id, difficulty);
      setContent(res.content);
      onNodeUpdated(node.id, res.content);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to synthesize study note:', err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleSyncWikilinks = async () => {
    if (!node.topic_id) return;
    setIsSyncing(true);
    try {
      const res = await syncWikilinks(node.topic_id);
      setSyncToast(`Synced! ${res.added_edges} new wikilink edge(s) added.`);
      if (onGraphUpdated) {
        onGraphUpdated(res.full_graph);
      }
      setTimeout(() => setSyncToast(null), 3500);
    } catch (err) {
      console.error('Failed to sync wikilinks:', err);
      setSyncToast('Failed to sync wikilinks');
      setTimeout(() => setSyncToast(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMarkdownClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a.wikilink') as HTMLAnchorElement | null;
    if (!anchor) return;
    e.preventDefault();

    const title = anchor.getAttribute('data-wikilink');
    const section = anchor.getAttribute('data-section');
    const blockId = anchor.getAttribute('data-block');

    if (!title) return;

    const isCurrentNode = title.trim().toLowerCase() === node.title.trim().toLowerCase();

    if (!isCurrentNode && onSelectNode && nodes.length > 0) {
      const target = nodes.find((n) => n.title.trim().toLowerCase() === title.trim().toLowerCase());
      if (target) {
        onSelectNode(target);
        return;
      }
    }

    if (section) {
      scrollToSection(section);
    } else if (blockId) {
      scrollToBlock(blockId);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {node.node_type === 'question' && onDecomposeQuestion && (
            <button
              onClick={handleDecompose}
              disabled={isDecomposing}
              className="obsidian-btn"
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderColor: 'var(--tag-question-border)',
                color: 'var(--tag-question-text)',
                backgroundColor: 'var(--tag-question-bg)',
              }}
              title="Branches foundational topics influencing this inquiry into the graph"
            >
              {isDecomposing ? 'Branching Topics...' : 'Branch Influencing Topics'}
            </button>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="obsidian-btn"
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            {isEditing ? 'Preview Note' : 'Edit Markdown'}
          </button>
          {isEditing && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="obsidian-btn obsidian-btn-primary"
              style={{ fontSize: '12px', padding: '4px 10px' }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        <button
          onClick={handleSynthesize}
          disabled={isSynthesizing}
          className="obsidian-btn"
          style={{
            fontSize: '12px',
            padding: '4px 10px',
            borderColor: 'var(--accent-purple)',
            color: 'var(--tag-concept-text)',
          }}
          title="Synthesizes publication-grade Obsidian study note with LaTeX and callouts"
        >
          {isSynthesizing ? 'Synthesizing Note...' : 'Synthesize Deep Note'}
        </button>
      </div>

      {saveSuccess && (
        <div style={{ fontSize: '11px', color: '#4ade80', fontFamily: 'var(--font-mono)' }}>
          ✓ Saved to SQLite database
        </div>
      )}

      {/* Note Content Area */}
      <div style={{ flex: 1, position: 'relative', overflowY: 'auto', paddingRight: '4px' }}>
        {isEditing ? (
          <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleTextareaChange}
              onKeyDown={handleTextareaKeyDown}
              onClick={(e) => checkAutocomplete(content, (e.target as HTMLTextAreaElement).selectionStart || 0)}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '400px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px',
                lineHeight: '1.6',
                padding: '12px',
                outline: 'none',
                resize: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="Write markdown note with [[Wikilinks]] and LaTeX ($E=mc^2$)..."
            />

            {/* Floating Wikilink Autocomplete Dropdown */}
            {autocompleteOpen && suggestions.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '16px',
                  left: '12px',
                  right: '12px',
                  maxHeight: '190px',
                  overflowY: 'auto',
                  backgroundColor: 'var(--bg-panel)',
                  border: '1px solid var(--border-active)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '4px',
                }}
              >
                <div
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Link to Concept (↑/↓ to navigate, Enter to insert)</span>
                  <span>{suggestions.length} match(es)</span>
                </div>
                {suggestions.map((s, idx) => (
                  <div
                    key={s.id}
                    onClick={() => insertWikilink(s.title)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: idx === autocompleteIndex ? 'rgba(139, 123, 245, 0.2)' : 'transparent',
                      color: idx === autocompleteIndex ? '#c4b5fd' : 'var(--text-primary)',
                      fontSize: '12.5px',
                    }}
                    onMouseEnter={() => setAutocompleteIndex(idx)}
                  >
                    <span style={{ fontWeight: 500 }}>[[{s.title}]]</span>
                    <span className={`obsidian-badge badge-${s.node_type}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                      {s.node_type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            ref={markdownContainerRef}
            className="markdown-body"
            onClick={handleMarkdownClick}
            dangerouslySetInnerHTML={{ __html: renderMarkdownWithMath(content) }}
          />
        )}
      </div>

      {/* Bottom Action Footer: Sync Wikilinks to Graph */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '8px',
          borderTop: '1px solid var(--border-subtle)',
          marginTop: 'auto',
        }}
      >
        <button
          onClick={handleSyncWikilinks}
          disabled={isSyncing}
          className="obsidian-btn"
          style={{
            fontSize: '12px',
            padding: '5px 12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            borderColor: 'var(--accent-purple)',
            color: 'var(--text-primary)',
          }}
          title="Parses [[Wikilinks]] across notes in this topic and generates knowledge graph edges"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          {isSyncing ? 'Syncing Wikilinks...' : 'Sync Wikilinks to Graph'}
        </button>

        {syncToast && (
          <div
            style={{
              fontSize: '12px',
              color: '#4ade80',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>✓</span>
            <span>{syncToast}</span>
          </div>
        )}
      </div>
    </div>
  );
};
