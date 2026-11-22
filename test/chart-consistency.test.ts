import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findDatavizErrors } from '../src/dataviz.js';
import { findCategoricalFindings } from '../src/chart-consistency.js';
import { TerminalColorThemeSchema } from '../src/schema.js';
import type { TerminalColorTheme } from '../src/types.js';

function fixture(
  slug: string,
): Pick<TerminalColorTheme, 'slug' | 'colors' | 'dataviz' | 'oklchAuthored'> {
  const theme = TerminalColorThemeSchema.parse(
    JSON.parse(readFileSync(new URL(`../data/by-name/${slug}.json`, import.meta.url), 'utf8')),
  );
  return {
    slug: theme.slug,
    colors: theme.colors,
    ...(theme.dataviz === undefined
      ? {}
      : {
          dataviz: {
            categorical: theme.dataviz.categorical,
            sequential: theme.dataviz.sequential,
            diverging: theme.dataviz.diverging,
            ...(theme.dataviz.categoricalSynthesized === undefined
              ? {}
              : { categoricalSynthesized: theme.dataviz.categoricalSynthesized }),
          },
        }),
    ...(theme.oklchAuthored === undefined ? {} : { oklchAuthored: theme.oklchAuthored }),
  };
}

describe('actual stored chart representation validation', () => {
  it('applies the requested loss budget to copied categorical source values', () => {
    const errors = findCategoricalFindings(fixture('dracula'), 0.000001);
    expect(errors.some((error) => error.path === 'dracula.dataviz.categorical[0].oklch')).toBe(
      true,
    );
    expect(errors.some((error) => error.path === 'dracula.dataviz.categorical[0].oklchCss')).toBe(
      true,
    );
  });
  it.each(['dracula', 'remarque-dark', 'hercules-graphics'])(
    'accepts %s and preserves its source palette',
    (slug) => {
      const theme = fixture(slug);
      const before = structuredClone(theme);
      expect(findDatavizErrors([theme], 1)).toEqual([]);
      expect(theme).toEqual(before);
    },
  );
  it.each(['hex', 'oklchCss'] as const)('rejects copied categorical %s corruption', (field) => {
    const theme = fixture('dracula');
    theme.dataviz!.categorical[0]![field] = field === 'hex' ? '#000000' : 'oklch(0 0 0)';
    expect(findDatavizErrors([theme], 1).join('\n')).toContain('dracula.dataviz.categorical[0]');
  });
  it('rejects changing a copied categorical color into a different internally valid color', () => {
    const theme = fixture('dracula');
    theme.dataviz!.categorical[0] = fixture('nord').colors.background;
    expect(findDatavizErrors([theme], 1).join('\n')).toContain(
      'not a complete canonical source-slot value',
    );
  });
  it.each(['hex', 'oklchCss'] as const)(
    'rejects synthesized categorical %s corruption',
    (field) => {
      const theme = fixture('hercules-graphics');
      expect(theme.dataviz!.categoricalSynthesized).toBeGreaterThan(0);
      const index = theme.dataviz!.categorical.length - 1;
      theme.dataviz!.categorical[index]![field] = field === 'hex' ? '#000000' : 'oklch(broken)';
      expect(findDatavizErrors([theme], 1).join('\n')).toContain(
        `hercules-graphics.dataviz.categorical[${index}].${field}`,
      );
    },
  );
  it.each(['sequential', 'diverging'] as const)(
    'rejects a stored %s fallback altered independently',
    (group) => {
      const theme = fixture('dracula');
      theme.dataviz![group][0]!.hex = '#000000';
      expect(findDatavizErrors([theme], 1).join('\n')).toContain(`dracula.dataviz.${group}[0].hex`);
    },
  );
  it('rejects synthesized origin metadata that claims more entries than the palette contains', () => {
    const theme = fixture('hercules-graphics');
    theme.dataviz!.categoricalSynthesized = theme.dataviz!.categorical.length + 1;
    expect(findDatavizErrors([theme], 1).join('\n')).toContain('categoricalSynthesized');
  });
});
