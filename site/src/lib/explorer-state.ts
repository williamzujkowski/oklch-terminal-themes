import { ALL_TAGS } from './theme-filter';

export const VIEWS = ['terminal', 'editor', 'reading', 'dashboard', 'dataviz', 'all'] as const;
export type View = (typeof VIEWS)[number];
export const TEXT_SIZES = [14, 16, 18] as const;
export const EXPLORER_TAGS = [
  ...ALL_TAGS,
  'high-contrast',
  'low-contrast',
  'wcag-aa-large',
  'wcag-fail',
] as const;

export interface ExplorerState {
  theme: string;
  reference: string | null;
  view: View;
  sample: 'default' | 'forms';
  size: 14 | 16 | 18;
  recipe: 'raw' | 'ui-v1';
  role: string | null;
  query: string;
  tags: string[];
  sort: 'default' | 'apca';
}

export interface ExplorerParseResult {
  state: ExplorerState | null;
  notices: string[];
}

const PRESENTATION_KEYS = ['view', 'sample', 'size', 'recipe', 'role'];
const LEGACY_KEYS = ['q', 'tags', 'sort'];

interface IdentityContext {
  known: ReadonlySet<string>;
  fallback: string;
  notices: string[];
}

function defaultTheme(slug: string, context: IdentityContext): string {
  if (context.known.has(slug)) return slug;
  context.notices.push(`Default ${slug} is unavailable; showing ${context.fallback}.`);
  return context.fallback;
}

function referenceTheme(raw: string | null, context: IdentityContext): string | null {
  if (!raw) return null;
  if (context.known.has(raw)) return raw;
  context.notices.push('The requested reference theme is unavailable.');
  return null;
}

function identities(
  params: URLSearchParams,
  context: IdentityContext,
): Pick<ExplorerState, 'theme' | 'reference'> {
  const reference = referenceTheme(params.get('ref'), context);
  if (params.has('theme')) {
    const raw = params.get('theme') ?? '';
    if (context.known.has(raw)) return { theme: raw, reference };
    context.notices.push('The requested candidate theme is unavailable.');
    return { theme: defaultTheme('dracula', context), reference };
  }
  if (params.has('ref')) {
    return { theme: defaultTheme(reference ? 'nord' : 'dracula', context), reference };
  }
  const presentation = PRESENTATION_KEYS.some((key) => params.has(key));
  const legacy = LEGACY_KEYS.some((key) => params.has(key));
  if (legacy && !presentation) return { theme: defaultTheme('dracula', context), reference: null };
  return { theme: defaultTheme('nord', context), reference: defaultTheme('dracula', context) };
}

function choice<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
  notices: string[],
): T {
  const raw = params.get(key);
  const value = allowed.find((candidate) => candidate === raw);
  if (value !== undefined) return value;
  if (raw !== null) notices.push(`Unsupported ${key}; using ${fallback}.`);
  return fallback;
}

function readTags(params: URLSearchParams, notices: string[]): string[] {
  const raw = (params.get('tags') ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const allowed: ReadonlySet<string> = new Set(EXPLORER_TAGS);
  const tags = [...new Set(raw.filter((tag) => allowed.has(tag)))];
  if (raw.some((tag) => !allowed.has(tag))) notices.push('Unknown browse tags were ignored.');
  return tags;
}

function readRole(
  params: URLSearchParams,
  roles: readonly string[],
  notices: string[],
): string | null {
  const role = params.get('role');
  if (!role) return null;
  if (roles.includes(role)) return role;
  notices.push('The requested inspector role is unavailable.');
  return null;
}

function presentation(
  params: URLSearchParams,
  roles: readonly string[],
  notices: string[],
): Pick<ExplorerState, 'view' | 'sample' | 'size' | 'recipe' | 'role'> {
  const view = choice(params, 'view', VIEWS, 'terminal', notices);
  let sample = choice(params, 'sample', ['default', 'forms'] as const, 'default', notices);
  if (sample === 'forms' && view !== 'dashboard') {
    sample = 'default';
    notices.push('Forms is available only in the Dashboard specimen.');
  }
  const rawSize = choice(params, 'size', ['14', '16', '18'] as const, '14', notices);
  return {
    view,
    sample,
    size: rawSize === '18' ? 18 : rawSize === '16' ? 16 : 14,
    recipe: choice(params, 'recipe', ['raw', 'ui-v1'] as const, 'raw', notices),
    role: readRole(params, roles, notices),
  };
}

/** URL effects stay with the controller; this is the single normalization path. */
export function parseExplorerState(
  search: string,
  catalog: readonly string[],
  roles: readonly string[] = [],
): ExplorerParseResult {
  const fallback = catalog.find((slug) => slug.length > 0);
  if (fallback === undefined) return { state: null, notices: ['Theme catalog is unavailable.'] };
  const params = new URLSearchParams(search);
  const notices: string[] = [];
  const rawQuery = (params.get('q') ?? '').trim();
  if (rawQuery.length > 200) notices.push('The browse query was limited to 200 characters.');
  return {
    state: {
      ...identities(params, { known: new Set(catalog), fallback, notices }),
      ...presentation(params, roles, notices),
      query: rawQuery.slice(0, 200),
      tags: readTags(params, notices),
      sort: choice(params, 'sort', ['default', 'apca'] as const, 'default', notices),
    },
    notices,
  };
}
