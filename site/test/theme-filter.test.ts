import { describe, it, expect } from 'vitest';
import {
  matches,
  parseFilterFromUrl,
  writeFilterToUrl,
  ALL_TAGS,
  type FilterableTheme,
  type FilterState,
} from '../src/lib/theme-filter';

const dracula: FilterableTheme = {
  slug: 'dracula',
  name: 'Dracula',
  isDark: true,
  tags: ['dark', 'vibrant', 'popular'],
};

const gruvboxLight: FilterableTheme = {
  slug: 'gruvbox-light',
  name: 'Gruvbox Light',
  isDark: false,
  tags: ['light', 'muted'],
};

function state(q = '', tags: readonly string[] = []): FilterState {
  return { query: q, tags: new Set(tags) };
}

describe('theme-filter: matches', () => {
  it('matches everything with empty state', () => {
    const s = state();
    expect(matches(dracula, s)).toBe(true);
    expect(matches(gruvboxLight, s)).toBe(true);
  });

  it('query matches name substring case-insensitively', () => {
    expect(matches(dracula, state('DRAC'))).toBe(true);
    expect(matches(dracula, state('gruv'))).toBe(false);
  });

  it('query matches slug as well as name', () => {
    expect(matches(gruvboxLight, state('gruvbox-light'))).toBe(true);
  });

  it('single tag filter — passes only when theme has that tag', () => {
    expect(matches(dracula, state('', ['popular']))).toBe(true);
    expect(matches(gruvboxLight, state('', ['popular']))).toBe(false);
  });

  it('multiple tag filters are AND-combined', () => {
    expect(matches(dracula, state('', ['dark', 'vibrant']))).toBe(true);
    expect(matches(dracula, state('', ['dark', 'muted']))).toBe(false);
  });

  it('query and tags both apply (AND)', () => {
    expect(matches(dracula, state('dracula', ['popular']))).toBe(true);
    expect(matches(dracula, state('dracula', ['muted']))).toBe(false);
    expect(matches(gruvboxLight, state('dracula', ['muted']))).toBe(false);
  });

  it('all documented tags are valid', () => {
    expect(ALL_TAGS).toContain('dark');
    expect(ALL_TAGS).toContain('light');
    expect(ALL_TAGS).toContain('popular');
    expect(ALL_TAGS).toHaveLength(7);
  });
});

describe('theme-filter: parseFilterFromUrl', () => {
  it('returns empty state for bare URL', () => {
    const s = parseFilterFromUrl('');
    expect(s.query).toBe('');
    expect(s.tags.size).toBe(0);
  });

  it('reads ?q=', () => {
    const s = parseFilterFromUrl('?q=dracula');
    expect(s.query).toBe('dracula');
    expect(s.tags.size).toBe(0);
  });

  it('reads ?tags= as comma-separated list', () => {
    const s = parseFilterFromUrl('?tags=dark,popular');
    expect(s.query).toBe('');
    expect(s.tags.has('dark')).toBe(true);
    expect(s.tags.has('popular')).toBe(true);
    expect(s.tags.size).toBe(2);
  });

  it('reads q + tags together', () => {
    const s = parseFilterFromUrl('?q=nord&tags=light,muted');
    expect(s.query).toBe('nord');
    expect(s.tags.size).toBe(2);
  });

  it('empty tags= yields empty Set (not a singleton empty-string tag)', () => {
    const s = parseFilterFromUrl('?tags=');
    expect(s.tags.size).toBe(0);
  });
});

describe('theme-filter: writeFilterToUrl', () => {
  const base = new URL('https://example.com/picker');

  it('empty state removes both params', () => {
    const result = writeFilterToUrl(state(), base);
    expect(result.searchParams.has('q')).toBe(false);
    expect(result.searchParams.has('tags')).toBe(false);
  });

  it('query sets ?q=', () => {
    const result = writeFilterToUrl(state('nord'), base);
    expect(result.searchParams.get('q')).toBe('nord');
  });

  it('tags joined by comma', () => {
    const result = writeFilterToUrl(state('', ['dark', 'popular']), base);
    expect(result.searchParams.get('tags')).toBe('dark,popular');
  });

  it('preserves other query params', () => {
    const withExtra = new URL('https://example.com/picker?theme=dracula');
    const result = writeFilterToUrl(state('nord', ['dark']), withExtra);
    expect(result.searchParams.get('theme')).toBe('dracula');
    expect(result.searchParams.get('q')).toBe('nord');
    expect(result.searchParams.get('tags')).toBe('dark');
  });

  it('is a round-trip with parseFilterFromUrl', () => {
    const original = state('catppuccin', ['dark', 'popular']);
    const url = writeFilterToUrl(original, base);
    const parsed = parseFilterFromUrl(url.search);
    expect(parsed.query).toBe(original.query);
    expect([...parsed.tags].sort()).toEqual([...original.tags].sort());
  });
});
