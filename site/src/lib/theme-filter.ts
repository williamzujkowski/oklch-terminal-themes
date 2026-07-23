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
  // Accessibility/dataviz metadata (issue #158): cvd-safe is the headline
  // use-case ("find me a colorblind-safe theme") so it leads this group;
  // cvd-caution is its complement (also filterable, even though the site
  // doesn't badge it — see ThemeSelector's badge-row comment). The rest are
  // per-slot legibility signals from issue #145/#149.
  'cvd-safe',
  'cvd-caution',
  'cursor-visible',
  'selection-legible',
  'brightness-ordered',
  'popular',
] as const;

export type FilterTag = (typeof ALL_TAGS)[number];

// Sort modes for the picker list (issue #158). 'default' restores the
// original build-time order (popular-first, then name — see
// ThemeSelector.astro); 'apca' orders by descending |Lc| foreground-vs-
// background contrast (APCA, issue #151) — highest-contrast themes first.
export const SORT_MODES = ['default', 'apca'] as const;

export type SortMode = (typeof SORT_MODES)[number];

function isSortMode(value: string): value is SortMode {
  return (SORT_MODES as readonly string[]).includes(value);
}

/** Reads `?sort=` from the URL, falling back to 'default' for anything unrecognized. */
export function parseSortFromUrl(search: string): SortMode {
  const raw = new URLSearchParams(search).get('sort') ?? '';
  return isSortMode(raw) ? raw : 'default';
}

/** Writes `?sort=` to the URL, omitting it entirely for the 'default' mode. */
export function writeSortToUrl(sort: SortMode, url: URL): URL {
  const next = new URL(url.href);
  if (sort !== 'default') next.searchParams.set('sort', sort);
  else next.searchParams.delete('sort');
  return next;
}

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
