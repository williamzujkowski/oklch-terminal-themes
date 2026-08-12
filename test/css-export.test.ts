import { describe, expect, it } from 'vitest';
import { themeToCssFile } from '../src/css-export.js';
import { themeToCssVars } from '../src/index.js';
import { COLOR_KEYS } from '../src/types.js';
import type { ColorKey, ColorValue, Colors } from '../src/types.js';

function cv(css: string): ColorValue {
  return {
    hex: '#000000',
    oklch: {
      l: 0,
      c: 0,
      h: 0,
    },
    oklchCss: css,
  };
}

function makeColors(): Colors {
  const colors = {} as Colors;

  for (const key of COLOR_KEYS) {
    colors[key] = cv(
      `oklch(0.5 0.1 ${key.length})`
    );
  }

  return colors;
}

describe('themeToCssFile', () => {
  const theme = {
    slug: 'my-theme',
    name: 'My Theme',
    colors: makeColors(),
  };

  it('emits a header comment, a bare :root block, and a scoped block', () => {
    const css = themeToCssFile(theme);

    expect(css).toMatch(
      /^\/\* my-theme — oklch-terminal-themes/
    );

    expect(css).toContain(
      ':root {\n'
    );

    expect(css).toContain(
      '[data-terminal-theme="my-theme"] {\n'
    );
  });

  it('both blocks carry the exact same --terminal-* declarations as themeToCssVars', () => {
    const css = themeToCssFile(theme);

    const vars = themeToCssVars(
      theme
    );

    const varLines = vars
      .split('\n')
      .filter(
        line => line.length > 0
      );

    for (const line of varLines) {
      const occurrences =
        css.split(
          `  ${line}`
        ).length - 1;

      expect(
        occurrences
      ).toBe(2);
    }
  });

  it('every ColorKey has a --terminal-<kebab-key> declaration', () => {
    const css =
      themeToCssFile(theme);

    for (
      const key of
      COLOR_KEYS as readonly ColorKey[]
    ) {
      const kebab = key
        .replace(
          /([a-z])([A-Z])/g,
          '$1-$2'
        )
        .toLowerCase();

      expect(css).toContain(
        `--terminal-${kebab}:`
      );
    }
  });

  it('is deterministic — identical input yields byte-identical output', () => {
    expect(
      themeToCssFile(theme)
    ).toBe(
      themeToCssFile({
        ...theme,
      })
    );
  });

  it('the scoped selector uses the raw slug — safe because toSlug output is already [a-z0-9-]+', () => {
    const weirdSlug = {
      slug: 'abc-123',
      name: 'X',
      colors: makeColors(),
    };

    const css =
      themeToCssFile(
        weirdSlug
      );

    expect(css).toContain(
      '[data-terminal-theme="abc-123"]'
    );
  });

  it('does not interpolate the theme name into the CSS header comment', () => {
    const maliciousTheme = {
      slug: 'safe-theme',
      name:
        '*/ body { background: red; } /*',
      colors: makeColors(),
    };

    const css =
      themeToCssFile(
        maliciousTheme
      );

    expect(css).toMatch(
      /^\/\* safe-theme — oklch-terminal-themes/
    );

    expect(css).not.toContain(
      '*/ body { background: red; } /*'
    );

    expect(css).not.toContain(
      'body { background: red; }'
    );
  });

  it('keeps the CSS header comment intact for a malicious theme name', () => {
    const maliciousTheme = {
      slug: 'terminal-safe',
      name:
        'Danger */ .hacked { color: red; } /*',
      colors: makeColors(),
    };

    const css =
      themeToCssFile(
        maliciousTheme
      );

    expect(css).toContain(
      '/* terminal-safe — oklch-terminal-themes'
    );

    expect(css).not.toContain(
      '.hacked { color: red; }'
    );
  });
});