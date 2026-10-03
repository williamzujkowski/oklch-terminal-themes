import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_BLOCK_RE,
  renderAttributionBlock,
  type AttributionSource,
} from '../scripts/attribution-table.js';

const src = (id: string, name: string, license = 'MIT'): AttributionSource => ({
  id,
  name,
  url: `https://example.test/${id}`,
  license,
});

describe('renderAttributionBlock', () => {
  it('orders rows by theme count, then by name', () => {
    const out = renderAttributionBlock(
      [src('b', 'Bravo'), src('a', 'Alpha'), src('c', 'Charlie')],
      new Map([
        ['a', 1],
        ['b', 1],
        ['c', 5],
      ]),
    );
    const ids = [...out.matchAll(/`([abc])`/g)].map((m) => m[1]);
    expect(ids).toEqual(['c', 'a', 'b']);
  });

  it('renders share to one decimal place and an em dash for empty sources', () => {
    const out = renderAttributionBlock(
      [src('a', 'Alpha'), src('b', 'Bravo', 'Apache-2.0'), src('z', 'Zulu')],
      new Map([
        ['a', 2],
        ['b', 1],
      ]),
    );
    expect(out).toMatch(/\| `a` +\| 2 +\| 66\.7% \| MIT +\|/);
    expect(out).toMatch(/\| `b` +\| 1 +\| 33\.3% \| Apache-2\.0 \|/);
    expect(out).toMatch(/\| `z` +\| 0 +\| — +\| MIT +\|/);
  });

  it('pads every column to a common width, as prettier formats tables', () => {
    const out = renderAttributionBlock(
      [src('a', 'Alpha'), src('long-id', 'A much longer name')],
      new Map([
        ['a', 10],
        ['long-id', 1],
      ]),
    );
    const rows = out.split('\n').filter((l) => l.startsWith('|'));
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    expect(rows[1]).toMatch(/^\| -+ \| -+ \| -+ \| -+ \| -+ \|$/);
  });

  it('names the empty sources in prose, with singular and plural forms', () => {
    const one = renderAttributionBlock([src('a', 'A'), src('z', 'Z')], new Map([['a', 1]]));
    expect(one).toContain(
      '`z` is configured but currently contributes 0 themes; it is kept so its attribution',
    );
    const two = renderAttributionBlock(
      [src('a', 'A'), src('y', 'Y'), src('z', 'Z')],
      new Map([['a', 1]]),
    );
    expect(two).toContain(
      '`y` and `z` are configured but currently contribute 0 themes; they are kept so their attribution',
    );
    const three = renderAttributionBlock(
      [src('a', 'A'), src('x', 'X'), src('y', 'Y'), src('z', 'Z')],
      new Map([['a', 1]]),
    );
    expect(three).toContain('`x`, `y` and `z` are configured');
  });

  it('omits the empty-source sentence when every source contributes', () => {
    const out = renderAttributionBlock([src('a', 'A')], new Map([['a', 1]]));
    expect(out).not.toContain('configured but currently');
  });

  it('is wrapped in markers that ATTRIBUTION_BLOCK_RE matches exactly once', () => {
    const out = renderAttributionBlock([src('a', 'A')], new Map([['a', 1]]));
    const doc = `before\n\n${out}\n\nafter`;
    expect(doc.match(ATTRIBUTION_BLOCK_RE)).toEqual([out]);
  });

  it('reproduces the committed README block from the committed data', () => {
    const root = new URL('..', import.meta.url);
    const sources = JSON.parse(
      readFileSync(new URL('sources.json', root), 'utf-8'),
    ) as AttributionSource[];
    const themes = JSON.parse(readFileSync(new URL('data/themes.json', root), 'utf-8')) as {
      source: string;
    }[];
    const counts = new Map<string, number>();
    for (const t of themes) counts.set(t.source, (counts.get(t.source) ?? 0) + 1);
    const readme = readFileSync(new URL('README.md', root), 'utf-8');
    expect(readme.match(ATTRIBUTION_BLOCK_RE)?.[0]).toBe(renderAttributionBlock(sources, counts));
  });
});
