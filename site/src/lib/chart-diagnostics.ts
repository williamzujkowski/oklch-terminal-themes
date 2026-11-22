import { differenceCiede2000, parse } from 'culori';
import type { Color } from 'culori';
import { simulateCvd } from '../../../src/cvd-palette.js';
import { wcagContrast } from '../../../src/classify.js';
import { COLOR_KEYS } from '../../../src/types.js';
import type { ColorKey, Colors, ColorValue, Dataviz } from '../../../src/types.js';
import type { CvdDeficiency } from '../../../src/cvd-palette.js';

export interface ChartDiagnosticTheme {
  colors: Colors;
  dataviz?: Dataviz;
}
export interface ChartOrigin {
  kind: 'copied' | 'synthesized' | 'derived-ramp' | 'unavailable';
  matchingSlots: ColorKey[];
  chosenMatch: ColorKey | null;
  ambiguous: boolean;
  reason?: string;
}
export interface ChartEntry {
  index: number;
  hex: string;
  oklchCss: string;
  origin: ChartOrigin;
}
export interface ChartPair {
  indices: [number, number];
  hexes: [string, string];
  sources: [ChartOrigin, ChartOrigin];
  deltaE: number;
}
export interface PairAudit {
  status: 'available' | 'unavailable';
  pairs: ChartPair[];
  minimum: ChartPair | null;
  reason?: string;
}
const AXES: readonly CvdDeficiency[] = ['deuteranopia', 'protanopia', 'tritanopia'];
const SCOPE = 'Canonical chart palette · sRGB';

function parseHex(hex: string): Color {
  const parsed = parse(hex);
  if (parsed === undefined) throw new Error(`Unparseable canonical hex: ${hex}`);
  return parsed;
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
function categoricalOrigin(
  color: ColorValue,
  theme: ChartDiagnosticTheme,
  synthesized: boolean,
): ChartOrigin {
  if (synthesized)
    return { kind: 'synthesized', matchingSlots: [], chosenMatch: null, ambiguous: false };
  const matchingSlots = COLOR_KEYS.filter((key) => sameColor(color, theme.colors[key]));
  return matchingSlots.length === 0
    ? {
        kind: 'unavailable',
        matchingSlots,
        chosenMatch: null,
        ambiguous: false,
        reason: 'No complete source-slot value matches this recorded copy',
      }
    : {
        kind: 'copied',
        matchingSlots,
        chosenMatch: matchingSlots[0] ?? null,
        ambiguous: matchingSlots.length > 1,
      };
}
function pairAudit(entries: readonly ChartEntry[], deficiency?: CvdDeficiency): PairAudit {
  const diff = differenceCiede2000();
  const colors = entries.map((entry) => {
    const color = parseHex(entry.hex);
    return deficiency === undefined ? color : simulateCvd(color, deficiency);
  });
  const pairs: ChartPair[] = [];
  let minimum: ChartPair | null = null;
  entries.forEach((entry, i) => {
    entries.slice(i + 1).forEach((other, offset) => {
      const j = i + offset + 1;
      const pair: ChartPair = {
        indices: [i, j],
        hexes: [entry.hex, other.hex],
        sources: [entry.origin, other.origin],
        deltaE: diff(colors[i]!, colors[j]!),
      };
      pairs.push(pair);
      if (minimum === null || pair.deltaE < minimum.deltaE) minimum = pair;
    });
  });
  return minimum === null
    ? {
        status: 'unavailable',
        pairs,
        minimum,
        reason: 'At least two colors are required for pair separation',
      }
    : { status: 'available', pairs, minimum };
}
function backgroundAudit(entries: readonly ChartEntry[], background: string) {
  const pairs = entries.map((entry) => ({
    index: entry.index,
    hex: entry.hex,
    background,
    ratio: wcagContrast(entry.hex, background),
  }));
  const minimum = pairs.reduce<(typeof pairs)[number] | null>(
    (min, pair) => (min === null || pair.ratio < min.ratio ? pair : min),
    null,
  );
  return { pairs, minimum };
}
function paletteAudit(entries: ChartEntry[], background: string) {
  return {
    entries,
    ordinary: pairAudit(entries),
    deficiencies: Object.fromEntries(
      AXES.map((axis) => [axis, pairAudit(entries, axis)]),
    ) as Record<CvdDeficiency, PairAudit>,
    background: backgroundAudit(entries, background),
  };
}
function invalidHex(theme: ChartDiagnosticTheme): boolean {
  const dataviz = theme.dataviz;
  if (dataviz === undefined) return false;
  const colors = [
    theme.colors.background,
    ...dataviz.categorical,
    ...dataviz.sequential,
    ...dataviz.diverging,
  ];
  return colors.some((color) => !/^#[0-9a-f]{6}$/i.test(color.hex));
}

/** Site-owned diagnostics of exact canonical hex swatches, never a rendered-CSS fallback. */
export function computeChartDiagnostics(theme: ChartDiagnosticTheme) {
  const dataviz = theme.dataviz;
  if (dataviz === undefined || dataviz.categorical.length === 0) {
    return {
      status: 'unavailable' as const,
      scope: SCOPE,
      reason: 'No generated categorical chart palette is available',
    };
  }
  if (invalidHex(theme)) {
    return {
      status: 'unavailable' as const,
      scope: SCOPE,
      reason: 'Chart diagnostics require complete six-digit canonical sRGB hex colors',
    };
  }
  const copiedCount = dataviz.categorical.length - (dataviz.categoricalSynthesized ?? 0);
  const entries = dataviz.categorical.map((color, index) => ({
    index,
    hex: color.hex,
    oklchCss: color.oklchCss,
    origin: categoricalOrigin(color, theme, index >= copiedCount),
  }));
  return {
    status: 'available' as const,
    scope: SCOPE,
    method: 'CIEDE2000 ΔE',
    simulation: 'Machado et al. (2009), culori matrices applied in linear-light RGB',
    severity: 1 as const,
    projectHeuristicDeltaE: 10,
    categorical: paletteAudit(entries, theme.colors.background.hex),
    rendered: {
      status: 'not-measured' as const,
      reason:
        'Canonical hex swatches do not measure rendered OKLCH, mixed, alpha or mapped CSS colors; resolve preview swatches separately.',
    },
  };
}
