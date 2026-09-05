import { marked } from 'marked';
import katex from 'katex';

interface MathToken {
  eq: string;
  display: boolean;
}

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

  return { text, placeholders };
}

/**
 * Renders full markdown text with robust KaTeX math rendering.
 * Tokenizes math into placeholders first so marked.parse() NEVER corrupts KaTeX markup.
 */
export function renderMarkdownWithMath(markdown: string): string {
  if (!markdown) return '';

  const { text: tokenized, placeholders } = tokenizeMath(markdown);

  // Obsidian callouts > [!NOTE], > [!THEOREM], etc.
  let cleanText = tokenized.replace(/>\s*\[!(NOTE|TIP|WARNING|THEOREM|CAUTION|IMPORTANT|DEFINITION|INFO)\]\s*([^\n]*)/gi, (_, type, title) => {
    const t = type.toUpperCase();
    const cleanTitle = (title || '').replace(/^[>\s:-]+/, '').trim();
    return cleanTitle ? `> **[${t}] ${cleanTitle}**\n>` : `> **[${t}]**\n>`;
  });

  // Parse clean Markdown
  let html = marked.parse(cleanText, { async: false }) as string;

  // Inject KaTeX back in place of placeholders (avoids invalid <p><div> nesting)
  html = html.replace(/<p>\s*@@MATH_DISPLAY_(\d+)@@\s*<\/p>/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return `<div class="katex-display">${katex.renderToString(item.eq, { displayMode: true, throwOnError: false })}</div>`;
  });

  html = html.replace(/@@MATH_DISPLAY_(\d+)@@/g, (_, idx) => {
    const item = placeholders[parseInt(idx, 10)];
    return `<div class="katex-display">${katex.renderToString(item.eq, { displayMode: true, throwOnError: false })}</div>`;
  });

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
