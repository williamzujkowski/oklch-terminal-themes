import { describe, expect, it } from 'vitest';
import {
  contentEqualIgnoring,
  preserveIndexGeneratedAt,
  preserveThemeUpdatedAt,
} from '../src/preserve.js';

// Minimal fabricated "theme-shaped" record — just enough structure
// (nested `colors`, an array field) to exercise deep comparison without
// depending on the full `TerminalColorTheme` shape or real OKLCH values.
function fabricateTheme(overrides: { updatedAt: string; red?: string; tags?: string[] }): {
  slug: string;
  updatedAt: string;
  tags: string[];
  colors: { red: { hex: string } };
} {
  return {
    slug: 'fabricated',
    updatedAt: overrides.updatedAt,
    tags: overrides.tags ?? ['dark'],
    colors: { red: { hex: overrides.red ?? '#ff0000' } },
  };
}

describe('contentEqualIgnoring', () => {
  it('treats records equal when only the ignored key differs', () => {
    const a = fabricateTheme({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const b = fabricateTheme({ updatedAt: '2026-07-20T12:00:00.000Z' });
    expect(contentEqualIgnoring(a, b, ['updatedAt'])).toBe(true);
  });

  it('is order-independent for object keys', () => {
    const a = { x: 1, y: 2, updatedAt: 't1' };
    const b = { updatedAt: 't2', y: 2, x: 1 };
    expect(contentEqualIgnoring(a, b, ['updatedAt'])).toBe(true);
  });

  it('detects a real content difference (nested color change)', () => {
    const a = fabricateTheme({ updatedAt: '2026-01-01T00:00:00.000Z', red: '#ff0000' });
    const b = fabricateTheme({ updatedAt: '2026-01-01T00:00:00.000Z', red: '#ff0001' });
    expect(contentEqualIgnoring(a, b, ['updatedAt'])).toBe(false);
  });

  it('detects a real content difference (array field change)', () => {
    const a = fabricateTheme({ updatedAt: '2026-01-01T00:00:00.000Z', tags: ['dark'] });
    const b = fabricateTheme({
      updatedAt: '2026-01-01T00:00:00.000Z',
      tags: ['dark', 'high-contrast'],
    });
    expect(contentEqualIgnoring(a, b, ['updatedAt'])).toBe(false);
  });

  it('ignores the key regardless of nesting depth', () => {
    const a = { outer: { updatedAt: 't1', v: 1 } };
    const b = { outer: { updatedAt: 't2', v: 1 } };
    expect(contentEqualIgnoring(a, b, ['updatedAt'])).toBe(true);
  });
});

describe('preserveThemeUpdatedAt', () => {
  it('keeps the fresh updatedAt when there is no previous record (first build)', () => {
    const next = fabricateTheme({ updatedAt: '2026-07-20T12:00:00.000Z' });
    expect(preserveThemeUpdatedAt(next, undefined)).toBe('2026-07-20T12:00:00.000Z');
  });

  it('carries the previous updatedAt forward when content is unchanged (no-op rebuild)', () => {
    const previous = fabricateTheme({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const next = fabricateTheme({ updatedAt: '2026-07-20T12:00:00.000Z' });
    expect(preserveThemeUpdatedAt(next, previous)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('bumps to the fresh updatedAt when a color actually changed', () => {
    const previous = fabricateTheme({ updatedAt: '2026-01-01T00:00:00.000Z', red: '#ff0000' });
    const next = fabricateTheme({ updatedAt: '2026-07-20T12:00:00.000Z', red: '#fe0000' });
    expect(preserveThemeUpdatedAt(next, previous)).toBe('2026-07-20T12:00:00.000Z');
  });
});

describe('preserveIndexGeneratedAt', () => {
  function fabricateIndex(
    generatedAt: string,
    count: number,
  ): {
    generatedAt: string;
    count: number;
    upstreamShas: Record<string, string>;
  } {
    return { generatedAt, count, upstreamShas: { main: 'abc123' } };
  }

  it('keeps the fresh generatedAt when there is no previous index (first build)', () => {
    const next = fabricateIndex('2026-07-20T12:00:00.000Z', 633);
    expect(preserveIndexGeneratedAt(next, undefined)).toBe('2026-07-20T12:00:00.000Z');
  });

  it('carries the previous generatedAt forward when the index content is unchanged', () => {
    const previous = fabricateIndex('2026-01-01T00:00:00.000Z', 633);
    const next = fabricateIndex('2026-07-20T12:00:00.000Z', 633);
    expect(preserveIndexGeneratedAt(next, previous)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('bumps to the fresh generatedAt when the theme count changed', () => {
    const previous = fabricateIndex('2026-01-01T00:00:00.000Z', 632);
    const next = fabricateIndex('2026-07-20T12:00:00.000Z', 633);
    expect(preserveIndexGeneratedAt(next, previous)).toBe('2026-07-20T12:00:00.000Z');
  });

  it('bumps to the fresh generatedAt when an upstream SHA changed', () => {
    const previous = fabricateIndex('2026-01-01T00:00:00.000Z', 633);
    previous.upstreamShas = { main: 'abc123' };
    const next = fabricateIndex('2026-07-20T12:00:00.000Z', 633);
    next.upstreamShas = { main: 'def456' };
    expect(preserveIndexGeneratedAt(next, previous)).toBe('2026-07-20T12:00:00.000Z');
  });
});
