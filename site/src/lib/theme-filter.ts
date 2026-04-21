// Pure filtering helpers for the picker UI. No DOM access here — keeps the
// logic unit-testable and lets any Island re-use it.

export interface FilterableTheme {
  slug: string;
  name: string;
  isDark: boolean;
  tags: readonly string[];
}

export interface FilterState {
  query: string;
  tags: Set<string>;
}

export const ALL_TAGS = [
  'dark',
  'light',
  'vibrant',
  'muted',
  'wcag-aaa',
  'wcag-aa',
  'ansi-legible',
  'popular',
] as const;

export type FilterTag = (typeof ALL_TAGS)[number];

export function matches(theme: FilterableTheme, state: FilterState): boolean {
  if (state.tags.size > 0) {
    for (const tag of state.tags) {
      if (!theme.tags.includes(tag)) return false;
    }
  }
  if (state.query.length === 0) return true;
  const q = state.query.toLowerCase();
  return theme.name.toLowerCase().includes(q) || theme.slug.includes(q);
}

export function parseFilterFromUrl(search: string): FilterState {
  const params = new URLSearchParams(search);
  const tagsParam = params.get('tags');
  const tags = new Set<string>(
    tagsParam !== null && tagsParam.length > 0 ? tagsParam.split(',') : [],
  );
  return { query: params.get('q') ?? '', tags };
}

export function writeFilterToUrl(state: FilterState, url: URL): URL {
  const next = new URL(url.href);
  if (state.query.length > 0) next.searchParams.set('q', state.query);
  else next.searchParams.delete('q');
  if (state.tags.size > 0) next.searchParams.set('tags', [...state.tags].join(','));
  else next.searchParams.delete('tags');
  return next;
}
