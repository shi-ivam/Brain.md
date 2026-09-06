import React, { useState, useEffect, useRef } from 'react';
import { GraphNode, DifficultyLevel, KnowledgeGraphData, NodeResource } from '../../types';
import { saveNodeNote, synthesizeStudyNote, syncWikilinks } from '../../services/api';
import { renderMarkdownWithMath, slugifyHeader } from '../../utils/mathRenderer';
import { SlideViewerModal } from '../Slides/SlideViewerModal';
import mermaid from 'mermaid';

interface NoteTabProps {
  node: GraphNode;
  nodes?: GraphNode[];
  difficulty: DifficultyLevel;
  targetSection?: string;
  resources?: NodeResource[];
  onOpenResourcesTab?: () => void;
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
  resources = [],
  onOpenResourcesTab,
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

  // Study Slides Viewer state
  const [isSlidesOpen, setIsSlidesOpen] = useState(false);

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

  // Dynamically render any embedded ```mermaid and ```html simulation code blocks in the note
  useEffect(() => {
    if (!isEditing && markdownContainerRef.current) {
      const mermaidBlocks = markdownContainerRef.current.querySelectorAll('pre > code.language-mermaid');
      mermaidBlocks.forEach(async (codeEl, idx) => {
        const rawCode = codeEl.textContent || '';
        if (!rawCode.trim()) return;
        const parentPre = codeEl.parentElement;
        if (!parentPre || parentPre.getAttribute('data-mermaid-rendered') === 'true') return;
        parentPre.setAttribute('data-mermaid-rendered', 'true');
        try {
          const id = `mermaid-note-${Math.random().toString(36).substring(2, 9)}-${idx}`;
          const { svg } = await mermaid.render(id, rawCode.trim());
          const wrapper = document.createElement('div');
          wrapper.className = 'note-mermaid-diagram';
          wrapper.style.margin = '16px 0';
          wrapper.style.padding = '12px';
          wrapper.style.backgroundColor = 'var(--bg-card, #222226)';
          wrapper.style.border = '1px solid var(--border-subtle, #2b2b32)';
          wrapper.style.borderRadius = '8px';
          wrapper.style.display = 'flex';
          wrapper.style.justifyContent = 'center';
          wrapper.style.overflowX = 'auto';
          wrapper.innerHTML = svg;
          parentPre.replaceWith(wrapper);
        } catch (err) {
          console.warn('Could not render note mermaid diagram:', err);
        }
      });

      const htmlBlocks = markdownContainerRef.current.querySelectorAll('pre > code.language-html');
      htmlBlocks.forEach((codeEl) => {
        const rawCode = codeEl.textContent || '';
        if (!rawCode.trim()) return;
        const isSimulation =
          rawCode.includes('<!DOCTYPE html>') ||
          rawCode.includes('<canvas') ||
          (rawCode.includes('<html') && rawCode.includes('<script>'));
        if (!isSimulation) return;
        const parentPre = codeEl.parentElement;
        if (!parentPre || parentPre.getAttribute('data-sim-rendered') === 'true') return;
        parentPre.setAttribute('data-sim-rendered', 'true');

        const wrapper = document.createElement('div');
        wrapper.className = 'note-html-simulation-embed';
        wrapper.style.margin = '16px 0';
        wrapper.style.backgroundColor = 'var(--bg-card, #222226)';
        wrapper.style.border = '1px solid var(--border-subtle, #2b2b32)';
        wrapper.style.borderRadius = '8px';
        wrapper.style.overflow = 'hidden';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.padding = '8px 12px';
        header.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
        header.style.borderBottom = '1px solid var(--border-subtle, #2b2b32)';
        header.style.fontSize = '12px';

        const label = document.createElement('div');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '6px';
        label.style.color = 'var(--text-secondary, #9c9ca3)';
        label.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span style="font-family: var(--font-mono, monospace); font-weight: 500;">Interactive Simulation</span>
        `;

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '6px';

        const restartBtn = document.createElement('button');
        restartBtn.className = 'obsidian-btn-subtle';
        restartBtn.style.fontSize = '11px';
        restartBtn.style.padding = '3px 8px';
        restartBtn.textContent = 'Restart';

        const toggleCodeBtn = document.createElement('button');
        toggleCodeBtn.className = 'obsidian-btn-subtle';
        toggleCodeBtn.style.fontSize = '11px';
        toggleCodeBtn.style.padding = '3px 8px';
        toggleCodeBtn.textContent = 'View Code';

        actions.appendChild(restartBtn);
        actions.appendChild(toggleCodeBtn);
        header.appendChild(label);
        header.appendChild(actions);

        const iframeContainer = document.createElement('div');
        iframeContainer.style.position = 'relative';
        iframeContainer.style.width = '100%';
        iframeContainer.style.height = '380px';
        iframeContainer.style.backgroundColor = '#161618';

        const iframe = document.createElement('iframe');
        iframe.sandbox.add('allow-scripts');
        iframe.srcdoc = rawCode;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.display = 'block';

        iframeContainer.appendChild(iframe);

        const codePre = document.createElement('pre');
        codePre.style.display = 'none';
        codePre.style.margin = '0';
        codePre.style.padding = '12px';
        codePre.style.maxHeight = '280px';
        codePre.style.overflowY = 'auto';
        codePre.style.fontSize = '12px';
        codePre.style.backgroundColor = 'var(--bg-primary, #161618)';
        codePre.style.borderTop = '1px solid var(--border-subtle, #2b2b32)';
        const codeInner = document.createElement('code');
        codeInner.className = 'language-html';
        codeInner.textContent = rawCode;
        codePre.appendChild(codeInner);

        restartBtn.onclick = () => {
          iframe.srcdoc = rawCode;
        };

        let showCode = false;
        toggleCodeBtn.onclick = () => {
          showCode = !showCode;
          codePre.style.display = showCode ? 'block' : 'none';
          toggleCodeBtn.textContent = showCode ? 'Hide Code' : 'View Code';
        };

        wrapper.appendChild(header);
        wrapper.appendChild(iframeContainer);
        wrapper.appendChild(codePre);

        parentPre.replaceWith(wrapper);
      });
    }
  }, [content, isEditing]);

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
                fontSize: '13.5px',
                padding: '5px 12px',
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
            style={{ fontSize: '13.5px', padding: '5px 12px' }}
          >
            {isEditing ? 'Preview Note' : 'Edit Markdown'}
          </button>
          {isEditing && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="obsidian-btn obsidian-btn-primary"
              style={{ fontSize: '13.5px', padding: '5px 12px' }}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setIsSlidesOpen(true)}
            className="obsidian-btn"
            style={{
              fontSize: '13.5px',
              padding: '5px 12px',
              borderColor: 'rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="View and download academic study slides"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Study Slides</span>
          </button>

          <button
            onClick={handleSynthesize}
            disabled={isSynthesizing}
            className="obsidian-btn"
            style={{
              fontSize: '13.5px',
              padding: '5px 12px',
              borderColor: 'var(--accent-purple)',
              color: 'var(--tag-concept-text)',
            }}
            title="Synthesizes publication-grade Obsidian study note with LaTeX and callouts"
          >
            {isSynthesizing ? 'Synthesizing Note...' : 'Synthesize Deep Note'}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div style={{ fontSize: '12.5px', color: '#4ade80', fontFamily: 'var(--font-mono)' }}>
          ✓ Saved to SQLite database
        </div>
      )}

      {/* Attached Resources Bar */}
      {resources && resources.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            borderRadius: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span>Attached Materials ({resources.length}):</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', flex: 1 }}>
            {resources.map((res) => (
              <button
                key={res.id}
                onClick={onOpenResourcesTab}
                className="obsidian-btn"
                style={{
                  fontSize: '12px',
                  padding: '3px 9px',
                  borderRadius: '12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  maxWidth: '240px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={`${res.title} - Click to view in Resources tab`}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {res.resource_type === 'youtube' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  ) : res.resource_type === 'pdf' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  )}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.title}</span>
              </button>
            ))}
            {onOpenResourcesTab && (
              <button
                onClick={onOpenResourcesTab}
                className="obsidian-btn-subtle"
                style={{ fontSize: '12px', padding: '3px 7px', color: 'var(--accent-purple-light)' }}
                title="Open Resources tab to attach more"
              >
                + Add / Manage
              </button>
            )}
          </div>
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
                fontSize: '14.5px',
                lineHeight: '1.65',
                padding: '14px',
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
                  maxHeight: '200px',
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
                    padding: '5px 10px',
                    fontSize: '12px',
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
                      padding: '7px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: idx === autocompleteIndex ? 'rgba(139, 123, 245, 0.2)' : 'transparent',
                      color: idx === autocompleteIndex ? '#c4b5fd' : 'var(--text-primary)',
                      fontSize: '13.5px',
                    }}
                    onMouseEnter={() => setAutocompleteIndex(idx)}
                  >
                    <span style={{ fontWeight: 500 }}>[[{s.title}]]</span>
                    <span className={`obsidian-badge badge-${s.node_type}`} style={{ fontSize: '11px', padding: '2px 6px' }}>
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
            fontSize: '13.5px',
            padding: '6px 14px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            borderColor: 'var(--accent-purple)',
            color: 'var(--text-primary)',
          }}
          title="Parses [[Wikilinks]] across notes in this topic and generates knowledge graph edges"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          {isSyncing ? 'Syncing Wikilinks...' : 'Sync Wikilinks to Graph'}
        </button>

        {syncToast && (
          <div
            style={{
              fontSize: '13px',
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

      {/* Interactive Study Slides Viewer Modal */}
      <SlideViewerModal
        node={node}
        difficulty={difficulty}
        isOpen={isSlidesOpen}
        onClose={() => setIsSlidesOpen(false)}
      />
    </div>
  );
};
