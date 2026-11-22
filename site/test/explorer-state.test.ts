import { describe, expect, it } from 'vitest';
import {
  parseExplorerState,
  serializeExplorerState,
  serializeThemeLink,
  serializeComparisonLink,
  type ExplorerState,
} from '../src/lib/explorer-state';

const catalog = ['dracula', 'nord', 'nord-light'];
const roles = ['body', 'comment', 'error', 'selection'];

function parse(search: string) {
  return parseExplorerState(search, catalog, roles);
}

describe('explorer entry precedence', () => {
  it.each(['', '?view=reading', '?size=16', '?role=comment', '?tracking=local'])(
    'opens a comparison for clean or presentation-only input %s',
    (search) => {
      expect(parse(search).state).toMatchObject({ theme: 'nord', reference: 'dracula' });
    },
  );

  it.each(['?theme=nord', '?theme=nord&ref=', '?theme=nord&view=reading'])(
    'preserves an explicit single theme for %s',
    (search) => {
      expect(parse(search).state).toMatchObject({ theme: 'nord', reference: null });
    },
  );

  it.each(['?q=nord', '?tags=dark', '?sort=apca', '?q='])(
    'preserves the legacy single Dracula fallback for %s',
    (search) => {
      expect(parse(search).state).toMatchObject({ theme: 'dracula', reference: null });
    },
  );

  it('gives new explorer parameters precedence over legacy filters', () => {
    expect(parse('?q=nord&view=editor').state).toMatchObject({
      theme: 'nord',
      reference: 'dracula',
      view: 'editor',
      query: 'nord',
    });
  });

  it('uses a valid reference-only link with Nord as candidate', () => {
    expect(parse('?ref=nord-light').state).toMatchObject({
      theme: 'nord',
      reference: 'nord-light',
    });
  });

  it.each(['?ref=', '?ref=missing', '?theme=', '?theme=missing'])(
    'does not confuse explicit empty/invalid identities with a clean URL: %s',
    (search) => {
      expect(parse(search).state).toMatchObject({ theme: 'dracula', reference: null });
    },
  );

  it('keeps a valid reference with an invalid candidate fallback', () => {
    const result = parse('?theme=unknown&ref=nord-light');
    expect(result.state).toMatchObject({ theme: 'dracula', reference: 'nord-light' });
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it('removes an unavailable reference without replacing the candidate', () => {
    const result = parse('?theme=nord&ref=unknown');
    expect(result.state).toMatchObject({ theme: 'nord', reference: null });
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it('uses the first available catalog slug if historical defaults disappear', () => {
    const result = parseExplorerState('', ['replacement', 'another']);
    expect(result.state).toMatchObject({ theme: 'replacement', reference: 'replacement' });
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it('returns a load error rather than inventing a theme for an empty catalog', () => {
    const result = parseExplorerState('?theme=dracula', []);
    expect(result.state).toBeNull();
    expect(result.notices.join(' ')).toMatch(/catalog.*unavailable/i);
  });
});

describe('explorer presentation and restrictions', () => {
  it('restores the complete supported presentation state', () => {
    expect(
      parse(
        '?theme=nord-light&ref=dracula&view=dashboard&sample=forms&size=18&recipe=ui-v1&role=error',
      ).state,
    ).toMatchObject({
      theme: 'nord-light',
      reference: 'dracula',
      view: 'dashboard',
      sample: 'forms',
      size: 18,
      recipe: 'ui-v1',
      role: 'error',
    });
  });

  it('keeps a registered role even when the specimen does not expose it', () => {
    expect(parse('?view=reading&role=selection').state?.role).toBe('selection');
  });

  it('normalizes unsupported presentation values to explicit defaults', () => {
    const result = parse('?view=bogus&sample=forms&size=15&recipe=repair&role=unknown&sort=wrong');
    expect(result.state).toMatchObject({
      view: 'terminal',
      sample: 'default',
      size: 14,
      recipe: 'raw',
      role: null,
      sort: 'default',
    });
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it('allows Forms only as a Dashboard scenario', () => {
    expect(parse('?view=reading&sample=forms').state?.sample).toBe('default');
    expect(parse('?view=dashboard&sample=forms').state?.sample).toBe('forms');
  });

  it('deduplicates known legacy tags while retaining honest contradictions', () => {
    const result = parse('?tags=dark,light,dark,high-contrast,wcag-fail,unknown');
    expect(result.state?.tags).toEqual(['dark', 'light', 'high-contrast', 'wcag-fail']);
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it('normalizes query whitespace and bounds the stored query length', () => {
    expect(parse('?q=%20%20nord%20%20').state?.query).toBe('nord');
    const result = parse(`?q=${'x'.repeat(500)}`);
    expect(result.state?.query.length).toBeLessThanOrEqual(200);
    expect(result.notices.length).toBeGreaterThan(0);
  });

  it.each(['../../private', '__proto__', '<script>alert(1)</script>', 'constructor'])(
    'accepts no unregistered identity or role: %s',
    (value) => {
      const params = new URLSearchParams({ theme: value, ref: value, role: value });
      expect(parse(`?${params}`).state).toMatchObject({
        theme: 'dracula',
        reference: null,
        role: null,
      });
    },
  );
});

function state(search: string): ExplorerState {
  const result = parse(search).state;
  if (!result) throw new Error('Test catalog unexpectedly unavailable');
  return result;
}

const base = new URL('https://example.com/oklch-terminal-themes/');

describe('canonical explorer serialization', () => {
  it('always emits an explicit single Dracula identity', () => {
    const url = serializeExplorerState(state('?theme=dracula'), base);
    expect(url.search).toBe('?theme=dracula');
    expect(parse(url.search).state?.reference).toBeNull();
  });

  it('omits defaults and replaces prior owned fields without duplicate identities', () => {
    const dirty = new URL(
      `${base}?theme=old&theme=older&ref=old&view=reading&sample=forms&size=18&recipe=ui-v1&role=error&q=old&tags=dark&sort=apca`,
    );
    const url = serializeExplorerState(state('?theme=dracula'), dirty);
    expect(url.search).toBe('?theme=dracula');
    expect(url.searchParams.getAll('theme')).toEqual(['dracula']);
  });

  it('preserves unrelated navigation parameters and the existing page path', () => {
    const url = serializeExplorerState(
      state('?theme=nord'),
      new URL(`${base}?tracking=one&tracking=two#readme`),
    );
    expect(url.pathname).toBe('/oklch-terminal-themes/');
    expect(url.searchParams.getAll('tracking')).toEqual(['one', 'two']);
    expect(url.hash).toBe('#readme');
  });

  it.each(['/oklch-terminal-themes', '/oklch-terminal-themes/'])(
    'preserves the accepted base path %s',
    (path) => {
      const url = serializeExplorerState(state(''), new URL(`https://example.com${path}`));
      expect(url.pathname).toBe(path);
    },
  );

  it('round-trips every supported specimen, size, recipe and comparison mode', () => {
    for (const view of ['terminal', 'editor', 'reading', 'dashboard', 'dataviz', 'all']) {
      for (const size of [14, 16, 18]) {
        for (const recipe of ['raw', 'ui-v1']) {
          for (const reference of ['', '&ref=dracula']) {
            const original = state(
              `?theme=nord${reference}&view=${view}&size=${size}&recipe=${recipe}&q=nord&tags=light,muted&sort=apca&role=comment`,
            );
            const url = serializeExplorerState(original, base);
            expect(parse(url.search).state).toEqual(original);
            expect(serializeExplorerState(state(url.search), url).href).toBe(url.href);
          }
        }
      }
    }
  });

  it('restores a Forms scenario and canonical role after serialization', () => {
    const original = state(
      '?theme=nord&ref=dracula&view=dashboard&sample=forms&size=16&recipe=ui-v1&role=error',
    );
    expect(parse(serializeExplorerState(original, base).search).state).toEqual(original);
  });
});

describe('deliberate theme and comparison sharing', () => {
  const filtered =
    '?theme=nord-light&ref=dracula&view=dashboard&sample=forms&size=18&recipe=ui-v1&role=error&q=private&tags=light&sort=apca';
  const navigation = new URL(`${base}?unowned=private#private`);

  it('shares only the candidate in the theme link', () => {
    const url = serializeThemeLink(state(filtered), navigation);
    expect(url.pathname).toBe(base.pathname);
    expect(url.search).toBe('?theme=nord-light');
    expect(url.hash).toBe('');
  });

  it('shares comparison presentation without browse filters or unrelated data', () => {
    const url = serializeComparisonLink(state(filtered), navigation);
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['theme', 'ref', 'view', 'sample', 'size', 'recipe', 'role'].sort(),
    );
    expect(parse(url.search).state).toMatchObject({
      theme: 'nord-light',
      reference: 'dracula',
      view: 'dashboard',
      sample: 'forms',
      size: 18,
      recipe: 'ui-v1',
      role: 'error',
      query: '',
      tags: [],
      sort: 'default',
    });
    expect(url.hash).toBe('');
  });

  it('keeps single-theme mode when sharing an unpinned review', () => {
    const url = serializeComparisonLink(state('?theme=dracula&view=reading'), navigation);
    expect(parse(url.search).state).toMatchObject({
      theme: 'dracula',
      reference: null,
      view: 'reading',
    });
  });
});
