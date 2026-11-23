import { describe, expect, it } from 'vitest';
import { parseExplorerState } from '../src/lib/explorer-state';

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
