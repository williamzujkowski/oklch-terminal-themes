import { describe, it, expect } from 'vitest';
import { escapeCssComment, formatCssVars, formatJson, formatPermalink, formatRatio, formatTailwindTheme, type SlimThemeLike, wcagLabel } from '../src/lib/formatters';

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

describe('wcagLabel', () => {
  it('returns AAA at or above 7:1', () => {
    expect(wcagLabel(7)).toBe('AAA');
    expect(wcagLabel(13.36)).toBe('AAA');
  });

  it('returns AA at or above 4.5:1 but below 7:1', () => {
    expect(wcagLabel(4.5)).toBe('AA');
    expect(wcagLabel(6.99)).toBe('AA');
  });

  it('returns AA Large at or above 3:1 but below 4.5:1', () => {
    expect(wcagLabel(3)).toBe('AA Large');
    expect(wcagLabel(4.49)).toBe('AA Large');
  });

  it('returns Fail below 3:1', () => {
    expect(wcagLabel(2.99)).toBe('Fail');
    expect(wcagLabel(1)).toBe('Fail');
  });
});

describe('formatRatio', () => {
  it('formats to one decimal plus ":1"', () => {
    expect(formatRatio(8.234)).toBe('8.2:1');
    expect(formatRatio(21)).toBe('21.0:1');
    expect(formatRatio(3)).toBe('3.0:1');
  });
});

describe('escapeCssComment (#235 finding)', () => {
  // @devmaster1987 spotted that the site's own export formatters interpolate
  // `theme.name` into a CSS comment — the sinks a user reaches by clicking
  // "copy CSS" / "copy Tailwind". #247 escaped the build-time generator in
  // `src/css-export.ts` and missed these two.
  const HOSTILE = 'Evil*/}body{display:none}/*';

  it('neutralises a comment terminator', () => {
    expect(escapeCssComment(HOSTILE)).not.toContain('*/');
  });

  it('leaves ordinary names untouched', () => {
    for (const name of ['Solarized Dark', 'Tokyo Night', "Bob's Theme", 'a/b']) {
      expect(escapeCssComment(name)).toBe(name);
    }
  });

  it('keeps the CSS export comment closed', () => {
    const css = formatCssVars({
      name: HOSTILE,
      slug: 'evil',
      isDark: true,
      colors: { background: 'oklch(0.2 0 0)' },
    });
    // Exactly one comment terminator: the one that closes the header.
    expect(css.split('*/').length - 1).toBe(1);
    expect(css.startsWith('/*')).toBe(true);
  });

  it('keeps the Tailwind export comment closed', () => {
    const out = formatTailwindTheme({
      name: HOSTILE,
      slug: 'evil',
      isDark: true,
      colors: { background: 'oklch(0.2 0 0)' },
    });
    expect(out.split('*/').length - 1).toBe(1);
  });

  it('still shows the human-readable name, not the slug', () => {
    // The alternative fix in #235 substituted `theme.slug`, which closes the
    // hole but drops the name from every generated file. Escaping keeps it.
    const css = formatCssVars({
      name: 'Tokyo Night',
      slug: 'tokyo-night',
      isDark: true,
      colors: { background: 'oklch(0.2 0 0)' },
    });
    expect(css).toContain('/* Tokyo Night —');
  });
});

describe('formatRatio rounds down (#201)', () => {
  it('never displays a value as clearing a threshold it fails', () => {
    // Real published values that rendered as crossing a bar they miss.
    expect(formatRatio(6.9952)).toBe('6.9:1'); // mirage fgOnBg, AA not AAA
    expect(formatRatio(6.9978)).toBe('6.9:1'); // sleepy-hollow
    expect(formatRatio(6.9516)).toBe('6.9:1'); // rouge-2
    expect(formatRatio(2.9634)).toBe('2.9:1'); // claude cursorOnBg, misses 3
    expect(formatRatio(4.4718)).toBe('4.4:1'); // ocean selectionContrast
  });

  it('leaves values that genuinely clear a threshold alone', () => {
    expect(formatRatio(7)).toBe('7.0:1');
    expect(formatRatio(7.04)).toBe('7.0:1');
    expect(formatRatio(4.5)).toBe('4.5:1');
    expect(formatRatio(3)).toBe('3.0:1');
    expect(formatRatio(12.63)).toBe('12.6:1');
  });

  it('agrees with wcagLabel at every boundary', () => {
    // The contradiction this fixes: a displayed ratio implying a tier the
    // badge does not award. Anything displaying as ">= 7.0" must be AAA.
    for (const r of [6.9952, 6.9978, 6.9516, 2.9634, 4.4718, 7, 4.5, 3, 12.63]) {
      const shown = Number(formatRatio(r).replace(':1', ''));
      if (shown >= 7) expect(wcagLabel(r)).toBe('AAA');
      if (shown >= 4.5 && shown < 7) expect(['AA', 'AAA']).toContain(wcagLabel(r));
      if (shown < 3) expect(wcagLabel(r)).toBe('Fail');
    }
  });
});
