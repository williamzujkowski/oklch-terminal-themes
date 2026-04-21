import { describe, it, expect } from 'vitest';
import {
  formatCssVars,
  formatTailwindTheme,
  formatJson,
  formatPermalink,
  type SlimThemeLike,
} from '../src/lib/formatters';

const theme: SlimThemeLike = {
  name: 'Dracula',
  slug: 'dracula',
  isDark: true,
  colors: {
    background: 'oklch(0.288 0.022 277.5)',
    foreground: 'oklch(0.978 0.008 106.5)',
    brightRed: 'oklch(0.705 0.209 25.3)',
  },
};

describe('formatCssVars', () => {
  it('emits a :root block with kebab-case variables', () => {
    const out = formatCssVars(theme);
    expect(out).toMatch(/^\/\* Dracula — oklch-terminal-themes \*\//);
    expect(out).toContain(':root {');
    expect(out).toContain('--terminal-background: oklch(0.288 0.022 277.5);');
    expect(out).toContain('--terminal-foreground: oklch(0.978 0.008 106.5);');
    expect(out).toMatch(/}\n$/);
  });

  it('converts camelCase color keys to kebab-case', () => {
    const out = formatCssVars(theme);
    expect(out).toContain('--terminal-bright-red: oklch(0.705 0.209 25.3);');
    expect(out).not.toContain('brightRed');
  });
});

describe('formatTailwindTheme', () => {
  it('emits an @theme block with --color-terminal-<key> properties', () => {
    const out = formatTailwindTheme(theme);
    expect(out).toMatch(/^\/\* Dracula — Tailwind v4 \*\//);
    expect(out).toContain('@theme {');
    expect(out).toContain('--color-terminal-background: oklch(0.288 0.022 277.5);');
    expect(out).toContain('--color-terminal-bright-red: oklch(0.705 0.209 25.3);');
  });
});

describe('formatJson', () => {
  it('is a parseable JSON dump of the theme', () => {
    const out = formatJson(theme);
    expect(out.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(out) as unknown;
    expect(parsed).toEqual(theme);
  });

  it('pretty-prints with two-space indent', () => {
    const out = formatJson(theme);
    expect(out).toContain('\n  "name": "Dracula",');
  });
});

describe('formatPermalink', () => {
  it('returns an absolute URL with ?theme=<slug>', () => {
    const base = new URL('https://williamzujkowski.github.io/oklch-terminal-themes/');
    const url = formatPermalink('dracula', base);
    expect(url).toBe('https://williamzujkowski.github.io/oklch-terminal-themes/?theme=dracula');
  });

  it('preserves other params on the base URL', () => {
    const base = new URL('https://example.com/picker?q=dark');
    const url = formatPermalink('dracula', base);
    expect(url).toContain('q=dark');
    expect(url).toContain('theme=dracula');
  });

  it('replaces an existing theme param rather than appending', () => {
    const base = new URL('https://example.com/?theme=old');
    const url = formatPermalink('new', base);
    expect(new URL(url).searchParams.getAll('theme')).toEqual(['new']);
  });
});
