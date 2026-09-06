import { Marked } from 'marked';
import katex from 'katex';

interface MathToken {
  eq: string;
  display: boolean;
}

/**
 * Slugifies header text for HTML id attributes and section anchoring.
 */
export function slugifyHeader(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parses and renders an Obsidian wikilink token into an anchor tag.
 */
export function renderWikilink(inner: string): string {
  const raw = inner.trim();
  if (!raw) return '';
  let target = raw;
  let alias: string | undefined = undefined;

  if (raw.includes('|')) {
    const parts = raw.split('|');
    target = parts[0].trim();
    alias = parts.slice(1).join('|').trim();
  }

  if (target.includes('^')) {
    const [title, blockId] = target.split('^');
    const cleanTitle = title.trim();
    const cleanBlock = blockId.trim();
    const display = alias || `${cleanTitle} (block)`;
    return `<a class="wikilink" data-wikilink="${cleanTitle}" data-block="${cleanBlock}" href="#/wikilink/${cleanTitle}^${cleanBlock}">${display}</a>`;
  }

  if (target.includes('#')) {
    const [title, section] = target.split('#');
    const cleanTitle = title.trim();
    const cleanSection = section.trim();
    const display = alias || `${cleanTitle} > ${cleanSection}`;
    return `<a class="wikilink" data-wikilink="${cleanTitle}" data-section="${cleanSection}" href="#/wikilink/${cleanTitle}#${cleanSection}">${display}</a>`;
  }

  const cleanTitle = target.trim();
  const display = alias || cleanTitle;
  return `<a class="wikilink" data-wikilink="${cleanTitle}" href="#/wikilink/${cleanTitle}">${display}</a>`;
}

const markedInstance = new Marked();

markedInstance.use({
  renderer: {
    heading({ text, depth }) {
      const slug = slugifyHeader(text);
      return `<h${depth} id="${slug}" data-heading="${text.replace(/"/g, '&quot;')}">${text}</h${depth}>\n`;
    },
    link({ href, title, text }) {
      const ytMatch = href?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([\w-]{11})/);
      if (ytMatch) {
        return `<a class="resource-link-yt" href="${href}" target="_blank" rel="noreferrer"><span class="yt-badge">YouTube</span> ${text}</a>`;
      }
      if (href?.toLowerCase().includes('.pdf') || href?.startsWith('/api/resources/files/')) {
        return `<a class="resource-link-pdf" href="${href}" target="_blank" rel="noreferrer"><span class="pdf-badge">PDF</span> ${text}</a>`;
      }
      return `<a href="${href}" target="_blank" rel="noreferrer"${title ? ` title="${title}"` : ''}>${text}</a>`;
    },
  },
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start(src) {
        return src.indexOf('[[');
      },
      tokenizer(src) {
        const match = /^\[\[(.*?)\]\]/.exec(src);
        if (match) {
          return {
            type: 'wikilink',
            raw: match[0],
            text: match[1].trim(),
          };
        }
      },
      renderer(token) {
        return renderWikilink((token as any).text);
      },
    },
  ],
});

/**
 * Tokenizes all mathematical notation into safe placeholders:
 * - Display math: \[ ... \], $$ ... $$
 * - Inline math: \( ... \), $ ... $
 * - Subscripts and superscripts: a_\theta, a_{\theta}, v^2, x^{2}
 * - Derivative fractions: (dr/dt), (d\theta/dt), d^2\theta/dt^2
 * - LaTeX macros: \frac, \sqrt, \vec, \mathbf, \perp, \omega
 * - Greek words: rho, theta, omega, etc.
 */
function tokenizeMath(rawText: string): { text: string; placeholders: MathToken[] } {
  if (!rawText) return { text: '', placeholders: [] };

  const placeholders: MathToken[] = [];
  const addMath = (eq: string, display: boolean) => {
    const idx = placeholders.length;
    placeholders.push({ eq: eq.trim(), display });
    return display ? `@@MATH_DISPLAY_${idx}@@` : `@@MATH_INLINE_${idx}@@`;
  };

  let text = rawText;

  // Protect Obsidian wikilinks [[ ... ]] from accidental math tokenization (e.g. greek words in titles/anchors)
  const wikilinkPlaceholders: string[] = [];
  text = text.replace(/\[\[[\s\S]*?\]\]/g, (match) => {
    const idx = wikilinkPlaceholders.length;
    wikilinkPlaceholders.push(match);
    return `@@WIKILINK_PROTECTED_${idx}@@`;
  });

  // 1. Existing display math \[ ... \]
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, eq) => addMath(eq, true));

  // 2. Existing display math $$ ... $$
  text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, eq) => addMath(eq, true));

  // 3. Existing inline math \( ... \)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, eq) => addMath(eq, false));

  // 4. Existing inline math $ ... $
  text = text.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)\$/g, (_, eq) => addMath(eq, false));

  // 5. Complete variable subscript expressions like a_\theta, a_{\theta}, a_n, v_0, t_0
  text = text.replace(/\b([a-zA-Z])_(\{?\\?[a-zA-Z0-9]+\}?)/g, (_, base, sub) => {
    const cleanSub = sub.startsWith('{') ? sub : `{${sub}}`;
    return addMath(`${base}_${cleanSub}`, false);
  });

  // 6. Complete variable superscript expressions like v^2, v^3, x^{2}
  text = text.replace(/\b([a-zA-Z])\^(\{?[0-9a-zA-Z]+\}?|[0-9]+)/g, (_, base, sup) => {
    const cleanSup = sup.startsWith('{') ? sup : `{${sup}}`;
    return addMath(`${base}^${cleanSup}`, false);
  });

  // 7. Derivative fractions like (dr/dt), (d\theta/dt), d^2\theta/dt^2, dv/dt
  text = text.replace(/\(?\b(d\^?[0-9]*\\?[a-zA-Z]+)\/(d\\?[a-zA-Z]+\^?[0-9]*)\b\)?/g, (_, num, den) => {
    return addMath(`\\frac{${num}}{${den}}`, false);
  });

  // 8. Function evaluations with sub/var: v(t_0), a(t_0), \psi(x)
  text = text.replace(/\b([a-zA-Z])\(([a-zA-Z0-9_{}\\]+)\)/g, (_, f, arg) => {
    return addMath(`${f}(${arg})`, false);
  });

  // 9. Unwrapped LaTeX macros: \frac{...}{...}, \sqrt{...}, \vec{v}, \mathbf{a}, \perp, \omega
  text = text.replace(/(\\(?:[a-zA-Z]+)(?:\{[^}]*\})*)/g, (m) => {
    return addMath(m, false);
  });

  // 10. Standalone Greek words: rho, theta, omega, etc.
  const greekWords = 'alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|hbar';
  const greekRegex = new RegExp(`\\b(${greekWords})\\b`, 'gi');
  text = text.replace(greekRegex, (m) => {
    return addMath(`\\${m.toLowerCase()}`, false);
  });

  // Restore protected wikilinks
  text = text.replace(/@@WIKILINK_PROTECTED_(\d+)@@/g, (_, idx) => {
    return wikilinkPlaceholders[parseInt(idx, 10)];
  });

  return { text, placeholders };
}

export interface FrontmatterMeta {
  title?: string;
  difficulty?: string;
  tags?: string[];
  [key: string]: any;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Extracts YAML frontmatter (---\n...\n---) from markdown text.
 */
export function parseFrontmatter(markdown: string): {
  frontmatter: FrontmatterMeta | null;
  body: string;
} {
  if (!markdown) return { frontmatter: null, body: '' };

  const frontmatterRegex = /^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = markdown.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: null, body: markdown };
  }

  const rawYaml = match[1];
  const body = markdown.slice(match[0].length);

  const frontmatter: FrontmatterMeta = {};
  const lines = rawYaml.split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('- ') && currentKey === 'tags') {
      const item = trimmed.slice(2).trim().replace(/^["']|["']$/g, '');
      if (item) {
        if (!frontmatter.tags) frontmatter.tags = [];
        frontmatter.tags.push(item);
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    let val = trimmed.slice(colonIdx + 1).trim();
    currentKey = key;

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (key === 'tags') {
      if (val.startsWith('[') && val.endsWith(']')) {
        frontmatter.tags = val
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else if (val) {
        frontmatter.tags = [val];
      }
    } else {
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

/**
 * Formats frontmatter metadata into an authentic Obsidian Properties card.
 */
function renderFrontmatterPropertiesHtml(meta: FrontmatterMeta): string {
  const parts: string[] = [];

  // Tags
  if (meta.tags && meta.tags.length > 0) {
    const tagChips = meta.tags
      .map(
        (tag) =>
          `<span class="obsidian-tag-pill" style="display:inline-flex;align-items:center;padding:2px 8px;font-size:11px;font-family:var(--font-mono, monospace);border-radius:12px;background-color:rgba(191,164,248,0.12);color:var(--tag-concept-text, #bfa4f8);border:1px solid rgba(191,164,248,0.25);margin-right:4px;margin-bottom:4px;">#${escapeHtml(
            tag.replace(/^#/, '')
          )}</span>`
      )
      .join('');
    parts.push(`
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px;">
        <span style="font-size:11px;font-family:var(--font-mono, monospace);color:var(--text-muted, #8a8a93);min-width:60px;padding-top:2px;">tags</span>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">${tagChips}</div>
      </div>
    `);
  }

  // Difficulty
  if (meta.difficulty) {
    parts.push(`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:11px;font-family:var(--font-mono, monospace);color:var(--text-muted, #8a8a93);min-width:60px;">difficulty</span>
        <span style="font-size:10px;font-family:var(--font-mono, monospace);text-transform:uppercase;font-weight:600;padding:1px 6px;border-radius:4px;background-color:rgba(255,255,255,0.06);color:var(--text-secondary, #b4b4bc);">${escapeHtml(
          meta.difficulty
        )}</span>
      </div>
    `);
  }

  if (parts.length === 0) return '';

  return `
    <div class="obsidian-properties-card" style="margin-bottom:20px;padding:10px 14px;background-color:rgba(255,255,255,0.02);border:1px solid var(--border-subtle, #27272a);border-radius:6px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.05);color:var(--text-muted, #8a8a93);font-size:11px;font-family:var(--font-sans, sans-serif);font-weight:500;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        Properties
      </div>
      ${parts.join('')}
    </div>
  `;
}

/**
 * Renders full markdown text with robust KaTeX math rendering.
 * Tokenizes math into placeholders first so marked.parse() NEVER corrupts KaTeX markup.
 * Parses YAML frontmatter cleanly into an Obsidian Properties banner without producing fake H2 headings.
 */
export function renderMarkdownWithMath(markdown: string): string {
  if (!markdown) return '';

  // 1. Parse and extract YAML frontmatter if present
  const { frontmatter, body: rawBody } = parseFrontmatter(markdown);
  let frontmatterHtml = '';
  let bodyToRender = rawBody;

  if (frontmatter) {
    frontmatterHtml = renderFrontmatterPropertiesHtml(frontmatter);
    // If the body does not start with an H1 (# Title), prepend the frontmatter title as H1
    if (frontmatter.title && !bodyToRender.trim().startsWith('# ')) {
      bodyToRender = `# ${frontmatter.title}\n\n` + bodyToRender.trimStart();
    }
  }

  const { text: tokenized, placeholders } = tokenizeMath(bodyToRender);

  // Obsidian callouts > [!NOTE], > [!THEOREM], etc.
  let cleanText = tokenized.replace(/>\s*\[!(NOTE|TIP|WARNING|THEOREM|CAUTION|IMPORTANT|DEFINITION|INFO)\]\s*([^\n]*)/gi, (_, type, title) => {
    const t = type.toUpperCase();
    const cleanTitle = (title || '').replace(/^[>\s:-]+/, '').trim();
    return cleanTitle ? `> **[${t}] ${cleanTitle}**\n>` : `> **[${t}]**\n>`;
  });

  // Parse clean Markdown with wikilink and header id support
  let html = markedInstance.parse(cleanText, { async: false }) as string;

  // Inject KaTeX back in place of placeholders (avoids invalid <p><div> nesting and duplicate margins)
  html = html.replace(/<p>\s*@@MATH_DISPLAY_(\d+)@@\s*<\/p>/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return katex.renderToString(item.eq, { displayMode: true, throwOnError: false });
  });

  html = html.replace(/@@MATH_DISPLAY_(\d+)@@/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return katex.renderToString(item.eq, { displayMode: true, throwOnError: false });
  });

  html = html.replace(/@@MATH_INLINE_(\d+)@@/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return katex.renderToString(item.eq, { displayMode: false, throwOnError: false });
  });

  return frontmatterHtml + html;
}

/**
 * Sanitizes a LaTeX formula string by removing accidental wrapper delimiters:
 * - $$ ... $$
 * - $ ... $
 * - \[ ... \]
 * - \( ... \)
 * Also filters out null, undefined, "none", "n/a", etc.
 */
export function cleanFormulaString(rawFormula?: string | null): string {
  if (!rawFormula) return '';
  let f = rawFormula.trim();
  const lower = f.toLowerCase();
  if (lower === 'none' || lower === 'null' || lower === 'n/a' || lower === 'undefined') {
    return '';
  }

  // Strip wrapping \[ ... \]
  if (f.startsWith('\\[') && f.endsWith('\\]')) {
    f = f.slice(2, -2).trim();
  }
  // Strip wrapping $$ ... $$
  else if (f.startsWith('$$') && f.endsWith('$$')) {
    f = f.slice(2, -2).trim();
  }
  // Strip wrapping \( ... \)
  else if (f.startsWith('\\(') && f.endsWith('\\)')) {
    f = f.slice(2, -2).trim();
  }
  // Strip wrapping $ ... $
  else if (f.startsWith('$') && f.endsWith('$')) {
    f = f.slice(1, -1).trim();
  }

  // Strip any lingering double or single dollars at ends
  f = f.replace(/^(\$\$|\$)+/, '').replace(/(\$\$|\$)+$/, '').trim();
  return f;
}

/**
 * Safely renders a slide's primary mathematical formula in display mode using KaTeX.
 */
export function renderSlideFormula(rawFormula?: string | null): string {
  const cleaned = cleanFormulaString(rawFormula);
  if (!cleaned) return '';

  try {
    return katex.renderToString(cleaned, { displayMode: true, throwOnError: false });
  } catch {
    return `<div style="font-family: var(--font-mono, monospace); color: #38bdf8; font-size: 14px; text-align: center;">${escapeHtml(
      cleaned
    )}</div>`;
  }
}

/**
 * Renders inline text with Markdown formatting (bold, italics, code, links)
 * AND KaTeX math rendering, WITHOUT wrapping the output in block-level <p> or <ul> tags.
 * Perfect for slide bullet points, card callouts, and interactive questions.
 */
export function renderInlineMarkdownWithMath(markdown: string): string {
  if (!markdown) return '';

  // Clean leading bullet markers like "- ", "* ", "• ", "1. "
  const clean = markdown
    .trim()
    .replace(/^[-*•]\s+/, '')
    .replace(/^\d+[\.\)]\s+/, '')
    .trim();

  if (!clean) return '';

  const { text: tokenized, placeholders } = tokenizeMath(clean);

  // Parse inline Markdown (no <p> wrappers)
  let html = markedInstance.parseInline(tokenized, { async: false }) as string;

  // Restore KaTeX display math
  html = html.replace(/@@MATH_DISPLAY_(\d+)@@/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return katex.renderToString(item.eq, { displayMode: true, throwOnError: false });
  });

  // Restore KaTeX inline math
  html = html.replace(/@@MATH_INLINE_(\d+)@@/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return katex.renderToString(item.eq, { displayMode: false, throwOnError: false });
  });

  return html;
}

/**
 * Renders inline text with KaTeX math (for quiz option buttons, titles, single lines).
 */
export function renderInlineMathHtml(rawText: string): string {
  if (!rawText) return '';

  const { text: tokenized, placeholders } = tokenizeMath(rawText);

  let result = tokenized.replace(/@@MATH_INLINE_(\d+)@@/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return katex.renderToString(item.eq, { displayMode: false, throwOnError: false });
  });

  result = result.replace(/@@MATH_DISPLAY_(\d+)@@/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return katex.renderToString(item.eq, { displayMode: true, throwOnError: false });
  });

  return result;
}
