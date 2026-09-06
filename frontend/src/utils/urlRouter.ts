import { DeepLinkState } from '../types';

/**
 * Parses the current URL hash into a structured DeepLinkState object.
 * Format: #/v/<topicId>/n/<nodeId>?tab=<tab>&section=<sec>&h=<term>
 */
export function parseUrlHash(): DeepLinkState {
  if (typeof window === 'undefined') return {};

  const rawHash = window.location.hash || '';
  // Remove leading # and optional leading slash
  const hashStr = rawHash.replace(/^#\/?/, '');
  if (!hashStr) return {};

  const [pathPart, queryPart] = hashStr.split('?');
  const state: DeepLinkState = {};

  // Match /v/<topicId>/n/<nodeId> or v/<topicId>/n/<nodeId>
  const nodeMatch = pathPart.match(/^v\/([^/]+)\/n\/([^/]+)/);
  if (nodeMatch) {
    state.topicId = decodeURIComponent(nodeMatch[1]);
    state.nodeId = decodeURIComponent(nodeMatch[2]);
  } else {
    const topicMatch = pathPart.match(/^v\/([^/]+)/);
    if (topicMatch) {
      state.topicId = decodeURIComponent(topicMatch[1]);
    }
  }

  // Parse query string parameters
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const tab = params.get('tab');
    if (tab === 'notes' || tab === 'visualizations' || tab === 'questions' || tab === 'quiz' || tab === 'connections' || tab === 'resources') {
      state.tab = tab;
    }
    const section = params.get('section');
    if (section) {
      state.section = decodeURIComponent(section);
    }
    const highlight = params.get('h') || params.get('highlight');
    if (highlight) {
      state.highlight = decodeURIComponent(highlight);
    }
  }

  return state;
}

/**
 * Serializes a DeepLinkState into a canonical URL hash string.
 * Example: #/v/<topicId>/n/<nodeId>?tab=notes&section=Postulates&h=wave
 */
export function serializeUrlHash(state: DeepLinkState): string {
  if (!state.topicId && !state.nodeId) {
    return '';
  }

  let path = '#/v';
  if (state.topicId) {
    path += `/${encodeURIComponent(state.topicId)}`;
  }
  if (state.nodeId) {
    path += `/n/${encodeURIComponent(state.nodeId)}`;
  }

  const params = new URLSearchParams();
  if (state.tab) {
    params.set('tab', state.tab);
  }
  if (state.section) {
    params.set('section', state.section);
  }
  if (state.highlight) {
    params.set('h', state.highlight);
  }

  const queryStr = params.toString();
  return queryStr ? `${path}?${queryStr}` : path;
}

/**
 * Updates window.location.hash smoothly without triggering full reloads.
 * Uses History API and dispatches a hashchange event.
 */
export function updateUrlHash(state: DeepLinkState, replace: boolean = false): void {
  if (typeof window === 'undefined') return;

  const newHash = serializeUrlHash(state);
  const currentHash = window.location.hash;
  if (newHash === currentHash) return;

  const targetUrl = newHash
    ? `${window.location.pathname}${window.location.search}${newHash}`
    : `${window.location.pathname}${window.location.search}`;

  if (replace) {
    window.history.replaceState(null, '', targetUrl);
  } else {
    window.history.pushState(null, '', targetUrl);
  }

  window.dispatchEvent(new Event('hashchange'));
}

/**
 * Generates the canonical deep link URL and copies it to navigator.clipboard.
 */
export async function copyDeepLinkToClipboard(state: DeepLinkState): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const hash = serializeUrlHash(state);
    const canonicalUrl = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
    await navigator.clipboard.writeText(canonicalUrl);
    return true;
  } catch (err) {
    console.error('Failed to copy deep link to clipboard:', err);
    return false;
  }
}
