import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findDuplicateSlugErrors, toSlug } from '../src/slug.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

describe('toSlug', () => {
  it('produces kebab-case ASCII', () => {
    expect(toSlug('Gruvbox Dark (Hard)')).toBe('gruvbox-dark-hard');
    expect(toSlug('Café Noir')).toBe('cafe-noir');
    expect(toSlug('Argonaut+')).toBe('argonaut-plus');
    expect(toSlug('  spaced  out  ')).toBe('spaced-out');
  });

  it('only ever emits [a-z0-9-]', () => {
    for (const name of ['东京夜', 'Ωmega', 'a/b\\c', 'x*/y', '<script>', 'N0tch2k']) {
      expect(toSlug(name)).toMatch(/^[a-z0-9-]*$/);
    }
  });
});

describe('findDuplicateSlugErrors (#174)', () => {
  it('is silent when every slug is unique', () => {
    expect(
      findDuplicateSlugErrors([
        { slug: 'dracula', name: 'Dracula' },
        { slug: 'nord', name: 'Nord' },
      ]),
    ).toEqual([]);
  });

  it('fires on a collision and names every claimant', () => {
    // The guard is only worth having if a test proves it fires — the CI step
    // was named for it long before it existed.
    const errors = findDuplicateSlugErrors([
      { slug: 'dracula', name: 'Dracula', source: 'iterm2-color-schemes' },
      { slug: 'dracula', name: 'DRACULA', source: 'native' },
      { slug: 'nord', name: 'Nord' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('dracula');
    expect(errors[0]).toContain('iterm2-color-schemes');
    expect(errors[0]).toContain('native');
  });

  it('reports each colliding slug once, not once per claimant', () => {
    const errors = findDuplicateSlugErrors([
      { slug: 'a', name: 'A1' },
      { slug: 'a', name: 'A2' },
      { slug: 'a', name: 'A3' },
      { slug: 'b', name: 'B1' },
      { slug: 'b', name: 'B2' },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('3 themes');
    expect(errors[1]).toContain('2 themes');
  });

  it('the real corpus has no duplicate slugs', () => {
    const themes = JSON.parse(readFileSync(join(ROOT, 'data', 'themes.json'), 'utf8')) as {
      slug: string;
      name: string;
      source: string;
    }[];
    expect(findDuplicateSlugErrors(themes)).toEqual([]);
    // And the primary-key property the guard exists to protect.
    expect(new Set(themes.map((t) => t.slug)).size).toBe(themes.length);
  });
});
