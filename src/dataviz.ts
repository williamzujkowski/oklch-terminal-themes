/**
 * Computes `dataviz` — a theme's derived data-visualization palette — at
 * build time. See issue #150.
 *
 * Pure functions over existing infrastructure: OKLCH interpolation and
 * gamut-fitting already exist in `convert.ts` (`convertOklchToColor`,
 * `oklchRoundTripDeltaE`); `accent.ts`'s `ACCENT_ANSI_ORDER` establishes the
 * deterministic-tie-break-order convention this module follows for its own
 * candidate list (`CATEGORICAL_ANSI_KEYS`).
 *
 * ## Categorical (6-8 colors)
 *
 * Candidates are the theme's 12 chromatic ANSI slots — the 6 classic + 6
 * bright colors (`black`/`white`/`brightBlack`/`brightWhite` excluded as
 * non-chromatic). Selection has three stages:
 *
 *  1. **Dedupe near-identical hues** (`dedupeByHue`) — many themes author a
 *     `bright*` slot as little more than a lightened copy of its normal
 *     counterpart (same hue). Candidates within ~20deg of each other collapse
 *     to whichever is more chromatic, so the categorical set doesn't spend
 *     two slots on what reads as one color.
 *  2. **Seed from the accent hue** (`closestToHue`) — per issue #150,
 *     selection "starts from the accent hue (already computed per theme in
 *     `accent`)": the deduped candidate whose hue is closest to the theme's
 *     `accent.oklch.h` is picked first. This doubles as the natural anchor
 *     for stage 3's neighbor-distance comparisons, and gives every theme's
 *     `categorical[0]` visual continuity with its signature accent color.
 *  3. **Greedy farthest-point selection** — each subsequent slot is the
 *     remaining candidate that maximizes its minimum hue-distance to every
 *     slot already selected (a standard farthest-point / max-min-distance
 *     strategy for spreading points around a circle). This is the mechanism
 *     Carbon Design System's and Observable Plot's categorical-palette
 *     guidance both converge on for "adjacent-distinguishability": insertion
 *     order visits far-apart regions of the hue circle before backfilling
 *     nearby gaps, which is why array-order adjacency in the final list
 *     rarely lands on near-complementary (~180deg apart) pairs — the failure
 *     mode Helfman (*Color for Categorical Data*) warns produces visual
 *     vibration/afterimage artifacts when complementary hues sit directly
 *     next to each other. Selection stops at 8 slots; past the 6-slot floor
 *     it only keeps going while a candidate at least `HUE_DEDUPE_THRESHOLD`
 *     degrees from everything selected so far remains, so a low-hue-diversity
 *     theme correctly settles at 6 instead of padding out to 8 with
 *     near-duplicate hues. If a pathologically monochrome theme can't even
 *     reach 6 distinct hue clusters, a second pass (still deterministic,
 *     still farthest-point) fills the remainder from the full 12-candidate
 *     set so every theme still meets the 6-color floor `validate.ts` enforces.
 *
 * ## Sequential (7 steps)
 *
 * An OKLCH interpolation anchored on `background` for `l` and on `accent` for
 * `h`: `l` ramps linearly from the background's own value to the accent's;
 * `c` ramps linearly from 0 (not the background's own chroma — a stored
 * chroma value is only valid paired with the hue it was authored at, and
 * reusing it at the accent's hue can fall outside the sRGB gamut precisely
 * where the ramp is darkest/lightest and gamut headroom is thinnest) up to
 * the accent's own chroma; `h` is held fixed at the accent's hue throughout
 * (single-hue sequential ramps are the Carbon/Observable convention — varying
 * only l/c reads as one color at increasing intensity, not a rainbow).
 * Ordering convention: index 0 is
 * always background-anchored (lowest emphasis), the last index is always the
 * accent (highest emphasis) — for a dark theme (low background `l`) that
 * plays out as dark-to-light; for a light theme (high background `l`) as
 * light-to-dark. Same "low to high emphasis" semantic in both polarities,
 * just expressed in whichever `l` direction that theme's own background
 * implies. Monotonic in `l` by construction (linear interpolation between two
 * fixed endpoints).
 *
 * ## Diverging (7 steps, odd, midpoint-centered)
 *
 * Two arms meeting at a near-achromatic midpoint: one arm's endpoint is the
 * accent's own lightness/chroma/hue, the other's is the categorical color
 * farthest (by circular hue distance) from the accent among the theme's own
 * `categorical` set. `l` is a single linear ramp across all 7 steps from one
 * arm's endpoint to the other's — monotonic across the whole array by
 * construction, since the midpoint's `l` is just that ramp evaluated at its
 * center ("L matched to the arms' L ramp" per issue #150). The divergence
 * itself reads through `c`/`h`: chroma ramps from each arm's endpoint down to
 * a small near-background chroma (`DIVERGING_MIDPOINT_CHROMA`, ~0.0075) at
 * the midpoint, and hue is fixed per arm (the midpoint's own hue is
 * perceptually irrelevant at that chroma; it's assigned arm A's hue for
 * determinism).
 */

import { clampChroma } from 'culori';
import { convertOklchToColor, oklchRoundTripDeltaE } from './convert.js';
import type { Accent, ColorKey, ColorValue, Colors, Dataviz, DatavizSlim, Oklch } from './types.js';

// The theme's 12 chromatic ANSI slots — categorical candidates. Excludes
// black/white/brightBlack/brightWhite (non-chromatic by convention) and the
// bg/fg/cursor/selection slots (not part of the ANSI palette). Order is the
// deterministic tie-break order used throughout this module.
export const CATEGORICAL_ANSI_KEYS: readonly ColorKey[] = [
  'red',
  'green',
  'yellow',
  'blue',
  'purple',
  'cyan',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightPurple',
  'brightCyan',
];

// Hue-distance threshold below which two candidates are treated as "the same
// color" for dedupe purposes, and above which a farthest-point pick is
// "eligible" during greedy selection — see `dedupeByHue` / `computeCategorical`.
const HUE_DEDUPE_THRESHOLD = 20;

export const CATEGORICAL_MIN = 6;
export const CATEGORICAL_MAX = 8;
export const SEQUENTIAL_STEPS = 7;
export const DIVERGING_STEPS = 7;
const DIVERGING_MIDPOINT_CHROMA = 0.0075;

/** Shortest angular distance between two hues, in [0, 180]. */
export function circularHueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// The sRGB gamut boundary in OKLCH is a cusp shape: max displayable chroma
// narrows sharply as `l` approaches 0 or 1, and that boundary itself shifts
// with `h`. A linear c/l interpolation can walk through combinations that
// are individually fine at the endpoints but out of gamut mid-ramp — "gamut-
// fit each step" (issue #150) means pre-clamping chroma to what's actually
// displayable at each step's own l/h *before* rounding and storing, so the
// stored oklch/hex/oklchCss stay mutually consistent (round-trip ΔE ~ 0)
// instead of preserving an unclampable "intent" the way authored native
// colors do (issue #132) — nobody authored these values, a formula did.
function fitChroma(l: number, c: number, h: number): number {
  return clampChroma({ mode: 'oklch', l, c, h }, 'oklch').c;
}

interface Candidate {
  key: ColorKey;
  color: ColorValue;
}

function candidatesOf(colors: Colors): Candidate[] {
  return CATEGORICAL_ANSI_KEYS.map((key) => ({ key, color: colors[key] }));
}

/**
 * Collapses candidates within `HUE_DEDUPE_THRESHOLD` degrees of hue down to
 * whichever is more chromatic, in `CATEGORICAL_ANSI_KEYS` order for
 * determinism — each candidate is only ever compared against ones already
 * kept, never a later one, so the result doesn't depend on anything beyond
 * that fixed iteration order.
 */
export function dedupeByHue(candidates: readonly Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    const dupIndex = kept.findIndex(
      (k) => circularHueDistance(k.color.oklch.h, candidate.color.oklch.h) < HUE_DEDUPE_THRESHOLD,
    );
    if (dupIndex === -1) {
      kept.push(candidate);
      continue;
    }
    const existing = kept[dupIndex] as Candidate;
    if (candidate.color.oklch.c > existing.color.oklch.c) {
      kept[dupIndex] = candidate;
    }
  }
  return kept;
}

/** The candidate whose hue is closest to `hue`; ties broken by list order. */
function closestToHue(candidates: readonly Candidate[], hue: number): Candidate {
  let best = candidates[0] as Candidate;
  let bestDist = circularHueDistance(best.color.oklch.h, hue);
  for (const candidate of candidates.slice(1)) {
    const dist = circularHueDistance(candidate.color.oklch.h, hue);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

/** The color whose hue is farthest from `hue`; ties broken by list order. */
function farthestFromHue(colors: readonly ColorValue[], hue: number): ColorValue {
  let best = colors[0] as ColorValue;
  let bestDist = circularHueDistance(best.oklch.h, hue);
  for (const color of colors.slice(1)) {
    const dist = circularHueDistance(color.oklch.h, hue);
    if (dist > bestDist) {
      best = color;
      bestDist = dist;
    }
  }
  return best;
}

function minDistanceTo(candidate: Candidate, selected: readonly Candidate[]): number {
  return Math.min(
    ...selected.map((s) => circularHueDistance(s.color.oklch.h, candidate.color.oklch.h)),
  );
}

/** Farthest-point pick from `pool` by min-distance-to-`selected`; ties -> higher chroma, then list order. */
function bestByDistance(pool: readonly { c: Candidate; dist: number }[]): {
  c: Candidate;
  dist: number;
} {
  let best = pool[0] as { c: Candidate; dist: number };
  for (const x of pool.slice(1)) {
    if (x.dist > best.dist || (x.dist === best.dist && x.c.color.oklch.c > best.c.color.oklch.c)) {
      best = x;
    }
  }
  return best;
}

/**
 * Selects the categorical palette (6-8 `ColorValue`s, each a reference to its
 * own ANSI slot's own color). See the module doc comment for the algorithm.
 */
export function computeCategorical(colors: Colors, accent: Accent): ColorValue[] {
  const deduped = dedupeByHue(candidatesOf(colors));
  const seed = closestToHue(deduped, accent.oklch.h);
  const selected: Candidate[] = [seed];
  let remaining = deduped.filter((c) => c.key !== seed.key);

  while (selected.length < CATEGORICAL_MAX && remaining.length > 0) {
    const scored = remaining.map((c) => ({ c, dist: minDistanceTo(c, selected) }));
    const eligible = scored.filter((x) => x.dist >= HUE_DEDUPE_THRESHOLD);
    if (eligible.length === 0 && selected.length >= CATEGORICAL_MIN) break;
    const next = bestByDistance(eligible.length > 0 ? eligible : scored).c;
    selected.push(next);
    remaining = remaining.filter((c) => c.key !== next.key);
  }

  // Pathological fallback (see module doc): a theme whose ANSI palette
  // dedupes to fewer than 6 hue clusters still needs 6 categorical colors.
  // Fill the remainder from the full 12-candidate set, still farthest-point,
  // still deterministic.
  if (selected.length < CATEGORICAL_MIN) {
    let pool = candidatesOf(colors).filter((c) => !selected.some((s) => s.key === c.key));
    while (selected.length < CATEGORICAL_MIN && pool.length > 0) {
      const next = bestByDistance(pool.map((c) => ({ c, dist: minDistanceTo(c, selected) }))).c;
      selected.push(next);
      pool = pool.filter((c) => c.key !== next.key);
    }
  }

  return selected.map((c) => c.color);
}

/**
 * Builds the 7-step sequential ramp (`background` -> `accent`). See the
 * module doc comment for the interpolation/ordering convention.
 */
export function computeSequential(colors: Colors, accent: Accent): ColorValue[] {
  const bg = colors.background.oklch;
  const steps: ColorValue[] = [];
  for (let i = 0; i < SEQUENTIAL_STEPS; i++) {
    const t = i / (SEQUENTIAL_STEPS - 1);
    const l = lerp(bg.l, accent.oklch.l, t);
    const h = accent.oklch.h;
    const c = fitChroma(l, lerp(0, accent.oklch.c, t), h);
    steps.push(convertOklchToColor({ l, c, h }));
  }
  return steps;
}

function divergingChromaAndHue(t: number, armA: Oklch, armB: Oklch): { c: number; h: number } {
  if (t <= 0.5) {
    return { c: lerp(armA.c, DIVERGING_MIDPOINT_CHROMA, t * 2), h: armA.h };
  }
  return { c: lerp(DIVERGING_MIDPOINT_CHROMA, armB.c, (t - 0.5) * 2), h: armB.h };
}

/**
 * Builds the 7-step diverging ramp (accent hue <-> farthest categorical hue,
 * through a near-achromatic midpoint). See the module doc comment.
 */
export function computeDiverging(categorical: readonly ColorValue[], accent: Accent): ColorValue[] {
  const armA = accent.oklch;
  const armB = farthestFromHue(categorical, accent.oklch.h).oklch;

  const steps: ColorValue[] = [];
  for (let i = 0; i < DIVERGING_STEPS; i++) {
    const t = i / (DIVERGING_STEPS - 1);
    const l = lerp(armA.l, armB.l, t);
    const { c: rawC, h } = divergingChromaAndHue(t, armA, armB);
    steps.push(convertOklchToColor({ l, c: fitChroma(l, rawC, h), h }));
  }
  return steps;
}

/** Computes the full `Dataviz` record for a theme. */
export function computeDataviz(colors: Colors, accent: Accent): Dataviz {
  const categorical = computeCategorical(colors, accent);
  const sequential = computeSequential(colors, accent);
  const diverging = computeDiverging(categorical, accent);
  return { categorical, sequential, diverging };
}

/**
 * Slim projection of a `Dataviz` — categorical `oklchCss` strings only. See
 * `DatavizSlim`.
 */
export function toDatavizSlim(dataviz: Dataviz): DatavizSlim {
  return { categorical: dataviz.categorical.map((c) => c.oklchCss) };
}

export interface DatavizValidationInput {
  slug: string;
  dataviz?: Dataviz;
}

function isMonotonic(values: readonly number[]): boolean {
  const nonDecreasing = values.every((v, i) => i === 0 || v >= (values[i - 1] as number));
  const nonIncreasing = values.every((v, i) => i === 0 || v <= (values[i - 1] as number));
  return nonDecreasing || nonIncreasing;
}

function checkRoundTrip(
  slug: string,
  group: string,
  colors: readonly ColorValue[],
  deltaEThreshold: number,
): string[] {
  const errors: string[] = [];
  colors.forEach((color, i) => {
    const d = oklchRoundTripDeltaE(color.oklch);
    if (d > deltaEThreshold) {
      errors.push(
        `${slug}.dataviz.${group}[${i}]: ΔE2000=${d.toFixed(3)} exceeds ${deltaEThreshold}`,
      );
    }
  });
  return errors;
}

/**
 * Dataset-level dataviz invariants that a per-record Zod schema can't express:
 * categorical length in [6, 8] (schema also bounds this; kept here too for a
 * single human-readable error site), diverging length odd, sequential `l`
 * monotonic, and every NEWLY DERIVED dataviz color's OKLCH survives a
 * gamut-clamped round-trip within `deltaEThreshold` (same ΔE2000 convention
 * as `oklchRoundTripDeltaE`'s other caller, `scripts/validate.ts`'s
 * `oklchAuthored` check). `categorical` is deliberately excluded from the
 * round-trip check: its entries are references to `colors[key]` (see
 * `computeCategorical`), already covered by `scripts/validate.ts`'s main
 * per-`COLOR_KEYS` loop — re-checking them via `oklchRoundTripDeltaE` would
 * apply the wrong round-trip direction to hex-authored colors and false-flag
 * valid, already-validated data. Returns one error string per violation. Used
 * by `scripts/validate.ts`.
 */
export function findDatavizErrors(
  themes: readonly DatavizValidationInput[],
  deltaEThreshold: number,
): string[] {
  const errors: string[] = [];
  for (const theme of themes) {
    if (theme.dataviz === undefined) continue;
    const { categorical, sequential, diverging } = theme.dataviz;

    if (categorical.length < CATEGORICAL_MIN || categorical.length > CATEGORICAL_MAX) {
      errors.push(
        `${theme.slug}.dataviz.categorical: length ${categorical.length} outside [${CATEGORICAL_MIN}, ${CATEGORICAL_MAX}]`,
      );
    }
    if (diverging.length % 2 === 0) {
      errors.push(`${theme.slug}.dataviz.diverging: length ${diverging.length} must be odd`);
    }
    if (!isMonotonic(sequential.map((c) => c.oklch.l))) {
      errors.push(`${theme.slug}.dataviz.sequential: l is not monotonic`);
    }

    errors.push(...checkRoundTrip(theme.slug, 'sequential', sequential, deltaEThreshold));
    errors.push(...checkRoundTrip(theme.slug, 'diverging', diverging, deltaEThreshold));
  }
  return errors;
}
