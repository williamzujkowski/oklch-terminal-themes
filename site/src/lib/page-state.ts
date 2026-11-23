import { INSPECTOR_ROLES } from './role-metrics';
import {
  parseExplorerState,
  serializeComparisonLink,
  serializeThemeLink,
  type ExplorerState,
  type ExplorerParseResult,
} from './explorer-state';

function isBrowse(doc: Document): boolean {
  return doc.querySelector<HTMLElement>('[data-experience]')?.dataset.experience === 'browse';
}

export function normalizePageState(doc: Document, state: ExplorerState): ExplorerState {
  return isBrowse(doc)
    ? { ...state, reference: null, view: 'all', sample: 'default', recipe: 'raw', role: null }
    : state;
}

export function parsePageState(
  doc: Document,
  search: string,
  catalog: string[],
): ExplorerParseResult {
  const params = new URLSearchParams(search);
  if (isBrowse(doc) && !params.has('theme')) params.set('theme', 'dracula');
  const parsed = parseExplorerState(params.toString(), catalog, INSPECTOR_ROLES);
  return { ...parsed, state: parsed.state ? normalizePageState(doc, parsed.state) : null };
}

export function themeShareUrl(doc: Document, state: ExplorerState, fallback: URL): URL {
  const link = doc.querySelector<HTMLAnchorElement>('[data-page-browse]');
  return serializeThemeLink(state, link ? new URL(link.href) : fallback);
}

export function syncPageLinks(doc: Document, state: ExplorerState): void {
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('[data-page-browse]'))
    link.href = serializeThemeLink(state, new URL(link.href)).href;
  for (const link of doc.querySelectorAll<HTMLAnchorElement>('[data-page-compare]')) {
    const comparison: ExplorerState = isBrowse(doc)
      ? { ...state, view: 'terminal', reference: state.theme === 'dracula' ? 'nord' : 'dracula' }
      : state;
    link.href = serializeComparisonLink(comparison, new URL(link.href)).href;
  }
}
