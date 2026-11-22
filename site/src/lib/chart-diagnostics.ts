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
        ...(matchingSlots.length > 1
          ? {
              reason:
                'Identical complete source values; chosenMatch is a deterministic match, not unique authorship',
            }
          : {}),
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

function rampDirection(values: readonly number[]) {
  if (values.length === 0) return 'unavailable';
  const deltas = values.slice(1).map((value, i) => value - values[i]!);
  if (deltas.every((delta) => delta === 0)) return 'constant';
  if (deltas.every((delta) => delta >= 0)) return 'increasing';
  if (deltas.every((delta) => delta <= 0)) return 'decreasing';
  return 'not-monotonic';
}
function rampProgress(colors: readonly ColorValue[], offset = 0) {
  const lightness = colors.map((color) => color.oklch.l);
  const chroma = colors.map((color) => color.oklch.c);
  return {
    indices: colors.map((_, index) => index + offset),
    lightness,
    chroma,
    hue: colors.map((color) => (color.oklch.c === 0 ? null : color.oklch.h)),
    direction: rampDirection(lightness),
    directionMetric: 'OKLCH L',
    chromaDirection: rampDirection(chroma),
    duplicateHexPairs: colors.flatMap((color, i) =>
      colors
        .slice(i + 1)
        .flatMap((other, j) => (color.hex === other.hex ? [[i + offset, i + j + 1 + offset]] : [])),
    ),
    duplicatesScope: 'canonical sRGB hex swatches; rendered CSS may differ',
  };
}
function rampAudit(colors: readonly ColorValue[], background: string) {
  const entries = colors.map((color, index): ChartEntry => ({
    index,
    hex: color.hex,
    oklchCss: color.oklchCss,
    origin: { kind: 'derived-ramp', matchingSlots: [], chosenMatch: null, ambiguous: false },
  }));
  return { ...paletteAudit(entries, background), progression: rampProgress(colors) };
}
function divergingAudit(colors: readonly ColorValue[], background: string) {
  const palette = rampAudit(colors, background);
  const index = Math.floor(colors.length / 2);
  const center = colors[index];
  if (colors.length % 2 === 0 || center === undefined) {
    return {
      ...palette,
      midpoint: {
        status: 'unavailable' as const,
        reason: 'An even-length or empty ramp has no single center step',
      },
      leftArm: null,
      rightArm: null,
    };
  }
  return {
    ...palette,
    midpoint: { status: 'available' as const, index, hex: center.hex, label: 'Center step' },
    leftArm: rampProgress(colors.slice(0, index + 1)),
    rightArm: rampProgress(colors.slice(index), index),
  };
}
function unavailableReason(theme: ChartDiagnosticTheme): string | null {
  const dataviz = theme.dataviz;
  if (dataviz === undefined || dataviz.categorical.length === 0)
    return 'No generated categorical chart palette is available';
  if (invalidHex(theme))
    return 'Chart diagnostics require complete six-digit canonical sRGB hex colors';
  const count = dataviz.categoricalSynthesized ?? 0;
  if (!Number.isInteger(count) || count < 0 || count > dataviz.categorical.length)
    return 'Invalid recorded trailing synthesized entry count';
  return null;
}

/** Site-owned diagnostics of exact canonical hex swatches, never a rendered-CSS fallback. */
export function computeChartDiagnostics(theme: ChartDiagnosticTheme) {
  const dataviz = theme.dataviz;
  const reason = unavailableReason(theme);
  if (dataviz === undefined || reason !== null) {
    return {
      status: 'unavailable' as const,
      scope: SCOPE,
      reason: reason ?? 'No generated chart palette is available',
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
    sequential: rampAudit(dataviz.sequential, theme.colors.background.hex),
    diverging: divergingAudit(dataviz.diverging, theme.colors.background.hex),
    rendered: {
      status: 'not-measured' as const,
      reason:
        'Canonical hex swatches do not measure rendered OKLCH, mixed, alpha or mapped CSS colors; resolve preview swatches separately.',
    },
  };
}
