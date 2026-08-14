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

/**
 * Hue-distance threshold below which two candidates are treated as "the same
 * color" for dedupe purposes, and above which a farthest-point pick is
 * "eligible" during greedy selection — see `dedupeByHue` / `computeCategorical`.
 *
 * **Chosen by inspection**, then checked against the corpus. 20° is roughly
 * where two terminal palette entries stop reading as "a red and another red"
 * — there is no perceptual standard behind it, and OKLCH hue degrees are not
 * uniformly discriminable across the wheel, so it is a rule of thumb.
 *
 * It is the knob that decides how many themes earn categorical slots past the
 * 6-colour floor. Recomputed over the whole corpus (2026-08):
 *
 * | threshold | 6 colours | 7 | 8 |
 * |---|---|---|---|
 * | 10° | 403 | 109 | 132 |
 * | 15° | 464 | 104 | 76 |
 * | **20°** | **525** | **83** | **36** |
 * | 25° | 572 | 57 | 15 |
 * | 30° | 609 | 32 | 3 |
 * | 40° | 644 | 0 | 0 |
 *
 * So the value is load-bearing rather than incidental: at 40° every theme
 * collapses to the floor and the extra-slot mechanism stops existing, while
 * at 10° a fifth of the corpus claims all 8 and the hues start crowding.
 * 20° keeps the extra slots rare enough to mean something (18.5% of the
 * corpus). No setting in this range produces duplicate categorical colours.
 */
const HUE_DEDUPE_THRESHOLD = 20;

/**
 * Chroma floor for categorical candidates (issue #202).
 *
 * Selection ranks candidates by `circularHueDistance`, which ignores chroma
 * and lightness entirely. At c ~ 0 a color's hue is numerically meaningless —
 * `#a0a0a0` parses to `oklch(0.706 0 0)`, a "hue" of 0 that is an artifact,
 * not a property — yet such a slot competed as a full candidate and could
 * win a farthest-point pick purely on that artifact.
 *
 * Before this floor, 73 near-achromatic colors were selected into categorical
 * palettes across 51 themes: `atlas-ragnarok.categorical[3]` was `#a0a0a0`,
 * and `batman` contributed four separate greys to a palette the site
 * advertises as "6-8 hues ... for adjacent-distinguishability".
 *
 * 0.02 sits well below any color a theme author would consider "coloured"
 * (the corpus's chromatic slots cluster above 0.05) while still admitting
 * genuinely muted palettes.
 */
const CATEGORICAL_MIN_CHROMA = 0.02;

export const CATEGORICAL_MIN = 6;
export const CATEGORICAL_MAX = 8;
export const SEQUENTIAL_STEPS = 7;
export const DIVERGING_STEPS = 7;
/**
 * Chroma of the neutral midpoint in a diverging ramp.
 *
 * **Chosen by eye, and deliberately not zero.** A true 0 midpoint is pure
 * grey, which reads as "no data" rather than "the middle of the scale" once
 * it sits next to two saturated arms. 0.0075 is low enough to look neutral —
 * roughly a tenth of the corpus's median mean chroma (0.0916) — while keeping
 * a trace of tint so the midpoint still belongs to the ramp.
 *
 * Unlike `HUE_DEDUPE_THRESHOLD`, this one has no corpus split to report: it
 * changes how every diverging ramp looks, not how many themes fall on either
 * side of anything. Judge it visually, not statistically.
 */
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
  return CATEGORICAL_ANSI_KEYS.map((key) => ({ key, color: colors[key] })).filter(
    // Issue #202: a near-achromatic slot has no meaningful hue, so it must
    // not compete in a hue-distance ranking. See CATEGORICAL_MIN_CHROMA.
    (c) => c.color.oklch.c >= CATEGORICAL_MIN_CHROMA,
  );
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

  // A chroma replacement above can INTRODUCE a duplicate: the incoming
  // candidate is only compared against the entry it displaces, not against
  // everything else already kept. `tearout` is the corpus's case — its
  // `brightPurple` displaces `cyan` on chroma, but carries the same hex as
  // the `purple` already sitting two slots away, so `kept` ends up holding
  // #c9a554 twice. That survived into the published palette (issue #198).
  //
  // Collapsing by hex here, after the hue pass, is order-independent: first
  // occurrence wins, and `kept` is already in the fixed CATEGORICAL_ANSI_KEYS
  // iteration order.
  const seenHex = new Set<string>();
  return kept.filter((c) => {
    if (seenHex.has(c.color.hex)) return false;
    seenHex.add(c.color.hex);
    return true;
  });
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
 * Result of categorical selection: the palette plus how many TRAILING entries
 * were synthesized from the accent rather than taken from an ANSI slot.
 *
 * `synthesized` is threaded out of the selection rather than re-derived by
 * comparing hexes against the theme's slots — a derived color can coincide
 * with a slot's hex (`hercules-graphics`, whose accent is achromatic, derives
 * greys that collide with its own greys), and inferring provenance from value
 * would under-report it. Provenance is a fact about how the entry was
 * produced, so it is carried, not guessed.
 */
export interface CategoricalResult {
  colors: ColorValue[];
  synthesized: number;
}

/**
 * Selects the categorical palette (6-8 `ColorValue`s, each a reference to its
 * own ANSI slot's own color, unless the theme has too few distinct chromatic
 * slots — see `synthesizeCategorical`). See the module doc for the algorithm.
 */
/**
 * Second-pass fallback (see module doc): a theme whose ANSI palette dedupes to
 * fewer than 6 hue clusters still needs 6 categorical colors. Fills the
 * remainder from the full candidate set — still farthest-point, still
 * deterministic. Mutates `selected` in place.
 *
 * Issue #198: this pool used to exclude already-selected entries by `key`
 * alone, so a slot whose hex was byte-identical to one already chosen got
 * re-added. 28 themes shipped duplicate colors in a palette whose entire
 * purpose is distinguishability — `retro` published the same green six times.
 * Excluded by hex as well as by key now.
 */
function backfillFromRemainingSlots(selected: Candidate[], colors: Colors): void {
  if (selected.length >= CATEGORICAL_MIN) return;
  let pool = candidatesOf(colors).filter(
    (c) =>
      !selected.some((s) => s.key === c.key) && !selected.some((s) => s.color.hex === c.color.hex),
  );
  while (selected.length < CATEGORICAL_MIN && pool.length > 0) {
    const next = bestByDistance(pool.map((c) => ({ c, dist: minDistanceTo(c, selected) }))).c;
    selected.push(next);
    pool = pool.filter((c) => c.key !== next.key && c.color.hex !== next.color.hex);
  }
}

export function computeCategorical(colors: Colors, accent: Accent): CategoricalResult {
  const deduped = dedupeByHue(candidatesOf(colors));

  // A theme can have NO chromatic slots at all once the chroma floor is
  // applied (issue #202) — `hercules-graphics`, a monochrome amber terminal,
  // is the corpus's one such case. There is no slot to seed from, so the
  // whole palette is derived from the accent and fully disclosed via
  // `Dataviz.categoricalSynthesized`.
  if (deduped.length === 0) {
    const derived = synthesizeCategorical([], accent, CATEGORICAL_MIN);
    return { colors: derived, synthesized: derived.length };
  }

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

  backfillFromRemainingSlots(selected, colors);

  // Still short: the theme genuinely does not contain enough distinct
  // chromatic colors (33 themes in this corpus; `hercules-graphics` has none
  // at all). Synthesize the remainder from the accent — see
  // `synthesizeCategorical`. The count is reported via
  // `Dataviz.categoricalSynthesized` so consumers can tell derived entries
  // from real ANSI slots.
  const fromSlots = selected.map((c) => c.color);
  if (fromSlots.length < CATEGORICAL_MIN) {
    const derived = synthesizeCategorical(fromSlots, accent, CATEGORICAL_MIN);
    return { colors: [...fromSlots, ...derived], synthesized: derived.length };
  }
  return { colors: fromSlots, synthesized: 0 };
}

/**
 * Derives additional categorical colors from the theme's accent, for themes
 * with too few distinct chromatic slots to fill the palette (issue #198).
 *
 * Walks candidate hues around the full circle and greedily takes the one
 * farthest (in circular hue) from everything chosen so far — the same
 * farthest-point rule the slot-based selection uses, so derived entries are
 * spread through the gaps the theme's own colors leave rather than clustered.
 *
 * Chroma and lightness come from the accent, so the result still reads as
 * belonging to this theme, with lightness nudged alternately up and down to
 * keep entries separable even when two land at similar hues. Chroma is
 * gamut-clamped per step (`clampChroma`), the same treatment the sequential
 * and diverging ramps get, so stored oklch/hex/oklchCss stay consistent.
 *
 * Deterministic: fixed hue step, fixed tie-breaking, no randomness. A hex
 * already present is skipped, so the output can never reintroduce the
 * duplicates this exists to eliminate.
 *
 * Precedent for synthesizing-and-disclosing rather than omitting: `base09`
 * and `base0F` in the emitted base16/base24 scheme YAML have no source data
 * either, and are hue-derived with an inline disclosure comment.
 */
function synthesizeCategorical(
  existing: readonly ColorValue[],
  accent: Accent,
  target: number,
): ColorValue[] {
  const HUE_STEP = 5;
  // Lightness offsets from the accent, tried in this order. Searching
  // lightness AND hue jointly (rather than pinning one lightness per entry)
  // means a fully achromatic accent — where every hue collapses to the same
  // grey — still yields distinct entries, separated by lightness instead.
  // `hercules-graphics` is the corpus's worst case: zero chromatic slots.
  const L_OFFSETS = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32, 0.32];

  const derived: ColorValue[] = [];
  const taken = new Set(existing.map((c) => c.hex));

  while (existing.length + derived.length < target) {
    const chosen = [...existing, ...derived];

    let best: { color: ColorValue; dist: number } | undefined;
    for (const dl of L_OFFSETS) {
      const l = Math.min(0.92, Math.max(0.28, accent.oklch.l + dl));
      for (let h = 0; h < 360; h += HUE_STEP) {
        const color = convertOklchToColor({ l, c: fitChroma(l, accent.oklch.c, h), h });
        if (taken.has(color.hex)) continue;
        const dist =
          chosen.length === 0
            ? 180
            : Math.min(...chosen.map((c) => circularHueDistance(c.oklch.h, color.oklch.h)));
        if (best === undefined || dist > best.dist) best = { color, dist };
      }
      // Prefer the smallest lightness deviation that yields anything usable,
      // so derived entries stay close to the theme's accent lightness.
      if (best !== undefined) break;
    }

    // Unreachable for any real palette: it would take every hue at every one
    // of the 9 lightness offsets quantizing to an already-taken hex. Guard
    // anyway so a pathological input can't spin forever — the caller's
    // length is then validated by findDatavizErrors and the Zod schema.
    if (best === undefined) break;

    derived.push(best.color);
    taken.add(best.color.hex);
  }

  return derived;
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
  const { colors: categorical, synthesized } = computeCategorical(colors, accent);
  const sequential = computeSequential(colors, accent);
  const diverging = computeDiverging(categorical, accent);

  // Omitted entirely when nothing was synthesized, keeping the common case
  // clean — see `Dataviz.categoricalSynthesized`.
  return synthesized > 0
    ? { categorical, sequential, diverging, categoricalSynthesized: synthesized }
    : { categorical, sequential, diverging };
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
    // Issue #198: length alone was the only categorical check, so 28 themes
    // passed validation while shipping duplicate colors in a palette whose
    // whole purpose is distinguishability.
    const distinct = new Set(categorical.map((c) => c.hex));
    if (distinct.size !== categorical.length) {
      errors.push(
        `${theme.slug}.dataviz.categorical: ${categorical.length - distinct.size} duplicate color(s) — ${categorical.map((c) => c.hex).join(' ')}`,
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
