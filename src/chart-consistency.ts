import { findColorFindings } from './color-consistency.js';
import { COLOR_KEYS } from './types.js';
import type { ColorFinding } from './color-consistency.js';
import type { ColorKey, Colors, ColorValue, Dataviz } from './types.js';

interface ChartContext {
  slug: string;
  colors?: Colors;
  oklchAuthored?: ColorKey[];
  dataviz?: Dataviz;
}

function sameColor(a: ColorValue, b: ColorValue): boolean {
  return (
    a.hex === b.hex &&
    a.oklchCss === b.oklchCss &&
    a.oklch.l === b.oklch.l &&
    a.oklch.c === b.oklch.c &&
    a.oklch.h === b.oklch.h
  );
}

function checkCopied(color: ColorValue, theme: ChartContext, path: string): ColorFinding[] {
  const colors = theme.colors;
  // Legacy structural-only callers provide no source palette. The dataset
  // validator supplies full themes; never infer copied origin from hex alone.
  if (colors === undefined) return [];
  const key = COLOR_KEYS.find((k) => sameColor(color, colors[k]));
  if (key === undefined) {
    return [{ path, message: 'Categorical copy is not a complete canonical source-slot value' }];
  }
  // Identical complete values may occur in several slots. COLOR_KEYS supplies
  // a stable tie-break; no unique authorship is claimed by this check.
  const origin = theme.oklchAuthored?.includes(key) === true ? 'authored' : 'hex';
  return findColorFindings(color, origin, path);
}

export function findCategoricalFindings(theme: ChartContext, threshold: number): ColorFinding[] {
  const dataviz = theme.dataviz;
  if (dataviz === undefined) return [];
  const { categorical } = dataviz;
  const synthesized = dataviz.categoricalSynthesized ?? 0;
  if (!Number.isInteger(synthesized) || synthesized < 0 || synthesized > categorical.length) {
    return [
      {
        path: `${theme.slug}.dataviz.categoricalSynthesized`,
        message: 'Invalid trailing synthesized entry count',
      },
    ];
  }
  const copiedCount = categorical.length - synthesized;
  return categorical.flatMap((color, i) => {
    const path = `${theme.slug}.dataviz.categorical[${i}]`;
    return i < copiedCount
      ? checkCopied(color, theme, path)
      : findColorFindings(color, 'derived', path, threshold);
  });
}
