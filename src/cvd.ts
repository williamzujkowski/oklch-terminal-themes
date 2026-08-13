/**
 * Computes `cvd` — colorblind-safety simulation scores — at build time. See
 * issue #149.
 *
 * BLOCKING condition on the issue: use an existing, maintained library for
 * the color-vision-deficiency simulation matrices — never hand-roll
 * Brettel/Viénot. culori (already this repo's one runtime dependency, and
 * already used for OKLCH conversion + CIEDE2000 round-trip checks elsewhere
 * — see `src/convert.ts`, `src/dataviz.ts`) ships
 * `filterDeficiencyDeuter`/`filterDeficiencyProt`/`filterDeficiencyTrit`
 * (Machado, Oliveira & Fernandes 2009, a refinement of Brettel/Viénot & Mollon
 * 1997) as of its 4.0.x line — confirmed present in the installed 4.0.2 via
 * `node_modules/culori/src/deficiency.js`. No dependency upgrade or new
 * package needed; `@types/culori` (pinned 4.0.1, one patch behind) already
 * types all three filters at `@types/culori/src/deficiency.d.ts`.
 *
 * Approach: take the theme's 6 classic (non-bright) chromatic ANSI hues —
 * the same base set `accent.ts#ACCENT_ANSI_ORDER` and
 * `dataviz.ts#CATEGORICAL_ANSI_KEYS`'s first 6 entries draw from, kept as an
 * independent literal here (`CVD_ANSI_KEYS`) so this module has no
 * import-time coupling to either — simulate each deficiency at culori's
 * default (full/severity-1) severity, and score the MINIMUM pairwise
 * CIEDE2000 ΔE among the 6 simulated colors. CIEDE2000 is the same ΔE metric
 * family this repo already uses for round-trip validation
 * (`oklchRoundTripDeltaE`, `findDatavizErrors`) — one consistent "how far
 * apart do these look" number across the codebase, rather than introducing a
 * second distance metric just for this feature. A low minimum means at
 * least one pair of the theme's 6 signal colors becomes hard to tell apart
 * under that deficiency — the real failure mode ("is this a git-diff
 * addition or deletion?").
 *
 * `tritanopia` is included even though it doesn't gate either tag — culori
 * exposes the filter for free, so there's no reason to withhold the number
 * (issue #149: "tritanopia if cheap"). Blue-yellow deficiency is also far
 * rarer than red-green in the general population, which is why it stays
 * data-only here.
 *
 * ## Threshold
 *
 * `CVD_SAFE_THRESHOLD = 10`: a theme is tagged `cvd-safe` when BOTH
 * `deuteranopia` and `protanopia` scores are >= 10, `cvd-caution` otherwise.
 * Chosen and validated empirically (`test/cvd.test.ts`):
 *
 *  - The Okabe-Ito-derived `wong-dark`/`wong-light` native themes (issue
 *    #149's own worked example of a "known-safe" palette) score well above
 *    10 on both axes — they MUST clear this bar or the threshold is wrong.
 *    Currently `wong-dark` d=15.70/p=12.25 and `wong-light` d=12.43/p=12.13.
 *
 *    Holding that invariant has now caught two separate real bugs in the
 *    theme literally named "Colorblind-Safe":
 *
 *    1. Originally (issue #149), `wong-light`'s `cyan` had been darkened for
 *       WCAG contrast by an ad hoc hex tweak that drifted its lightness into
 *       `blue`'s, collapsing the pair. It was re-derived at `#2e8ec0`.
 *    2. That re-derivation kept `cyan` at ~236° — inside `blue`'s (~244°)
 *       hue family. Under the gamma-space simulation bug (see
 *       `simulateLinear` below) that looked fine. Once the simulation was
 *       corrected to linear-light RGB (issue #197), `blue`/`cyan` was the
 *       limiting pair on ALL THREE axes and the theme fell to d=10.16/p=9.70
 *       — below its own bar. Separating by lightness alone is not enough
 *       when two signal colors sit in the same confusion region; they have
 *       to differ in a direction the deficiency preserves.
 *
 *    Fixed by moving `cyan` to `#0693a7` — a true cyan/teal at OKLCH hue
 *    ~211.7 (`l` ≈ 0.609, `c` ≈ 0.105), holding WCAG contrast against
 *    `#fafafa` at ~3.5:1. `blue`/`cyan` is no longer the limiting pair on any
 *    axis (deuteranopia is now bounded by `purple`/`cyan`, protanopia by
 *    `blue`/`purple`), which is the structural sign the palette is no longer
 *    balanced on a knife edge.
 *  - A real, in-corpus known-clashing pair: `mirage`'s `red` (#ff9999,
 *    OKLCH l=0.788 h=20.2) and `green` (#85cc95, l=0.784 h=150.5) are
 *    near-isoluminant (ΔL ≈ 0.005) and differ almost entirely in hue along
 *    the red-green confusion axis — plainly distinct to typical vision
 *    (ΔE2000 ≈ 53, no contrast problem at all), but they collapse to
 *    ΔE2000 ≈ 1.70 under deuteranopia simulation. This is the textbook CVD
 *    failure mode round-trip/WCAG checks can't see: two colors that are
 *    obviously different normally, verified identical to a deuteranope. Not
 *    picked because its name suggests a red/green clash — chosen precisely
 *    BECAUSE it doesn't (an ordinary-looking dark theme), which is what
 *    makes it a realistic "you'd never notice this without simulating it"
 *    example.
 *  - Across the full 633-theme corpus, `min(deuteranopia, protanopia)` has NO
 *    natural gap — it's a smooth, long-tailed distribution (median ~3.2,
 *    p90 ~7.4, p95 ~9.2, p98 ~11.9, max ~15.8; measured under the corrected
 *    linear-light model). 10 is therefore a deliberately conservative,
 *    prior-art-anchored line (not a corpus-derived cutpoint): most of this
 *    corpus is decorative community terminal themes that were never designed
 *    with CVD safety in mind, so a low pass rate (24 themes, ~3.8% of the
 *    corpus, at the time of writing) is the expected, honest result of
 *    holding every theme to an Okabe-Ito/Paul-Tol-grade bar — not a sign the
 *    bar is miscalibrated.
 *
 *    The threshold was deliberately NOT lowered when the linear-light fix
 *    (issue #197) cut the pass rate from 39 themes to 24. The bar is anchored
 *    to prior art, not to a target pass rate; moving it to preserve the old
 *    count would be fitting the ruler to the result. What the fix changed is
 *    the measurement, and the honest response is a smaller, more accurate
 *    set of themes that clear it.
 *    10 in CIEDE2000 units is an order of magnitude above the ΔE2000 < 1.0
 *    "just noticeable difference" floor this repo's own round-trip gate uses
 *    elsewhere, deliberately so: CVD confusion is a much coarser,
 *    whole-hue-family failure mode than round-trip gamut error, so it
 *    warrants a much larger comfortable margin, not the theoretical JND.
 */

import {
  converter,
  differenceCiede2000,
  filterDeficiencyDeuter,
  filterDeficiencyProt,
  filterDeficiencyTrit,
  parse,
} from 'culori';
import type { Color } from 'culori';
import type { ColorKey, Colors, Cvd } from './types.js';

// The 6 classic (non-bright) chromatic ANSI hues. Independent literal — see
// module doc comment for why this isn't imported from accent.ts/dataviz.ts.
export const CVD_ANSI_KEYS: readonly ColorKey[] = [
  'red',
  'green',
  'yellow',
  'blue',
  'purple',
  'cyan',
];

// Empirically validated against the wong-* native themes + a known-clashing
// red/green fixture — see module doc comment and test/cvd.test.ts.
export const CVD_SAFE_THRESHOLD = 10;

// Deficiency simulation at culori's default (full, severity=1) — the
// worst-case, most conservative simulation. A theme that stays separable at
// severity 1 is separable at any lesser degree of the same deficiency.
const deuterFilter = filterDeficiencyDeuter();
const protFilter = filterDeficiencyProt();
const tritFilter = filterDeficiencyTrit();

const toLrgb = converter('lrgb');
const toRgb = converter('rgb');

function parseHexStrict(hex: string): Color {
  const parsed = parse(hex);
  if (parsed === undefined) {
    throw new Error(`Unparseable color: ${hex}`);
  }
  return parsed;
}

/**
 * Applies a culori deficiency filter in LINEAR-LIGHT RGB.
 *
 * culori's `filterDeficiency*` converts its input to `rgb` — gamma-encoded
 * sRGB — and multiplies the Machado 3x3 into those non-linear values
 * (`culori/src/deficiency.js`, `mode: 'rgb'`). But Machado, Oliveira &
 * Fernandes 2009 define those matrices on **linear** RGB. Applying them to
 * gamma-encoded values is a real and well-known error: R's `colorspace`
 * shipped exactly this bug until 2.1-0 (2023), where it was fixed by adding a
 * `linear = TRUE` argument.
 *
 * culori's filter multiplies its matrix into whatever `r`/`g`/`b` it is
 * handed, so handing it linear components in an `rgb`-labelled object reuses
 * culori's own precomputed matrices — satisfying issue #149's blocking
 * condition that we never hand-roll Brettel/Viénot — while performing the
 * multiply in the space the model is actually defined on. The result comes
 * back in the same labelled space, so it is reinterpreted as `lrgb` and
 * gamma-encoded back to sRGB for the ΔE comparison.
 *
 * Impact when this was corrected (issue #197): `cvd-safe` went from 39 themes
 * to 23, with 20 themes flipping. The `mirage` red/green worked example in
 * this module's doc comment moved from ΔE 0.060 to 1.700 — still far below
 * the threshold, still the same conclusion, but a 28x different number.
 */
function simulateLinear(filter: <C extends Color>(color: C) => C, color: Color): Color {
  const lin = toLrgb(color);
  const out = filter({ mode: 'rgb', r: lin.r, g: lin.g, b: lin.b });
  return toRgb({ mode: 'lrgb', r: out.r, g: out.g, b: out.b });
}

/**
 * Minimum pairwise CIEDE2000 ΔE among a list of colors (checks every pair,
 * not just neighbors — with only 6 candidates this is 15 comparisons, cheap).
 * Exported for tests.
 */
export function minPairwiseDeltaE(colors: readonly Color[]): number {
  const diff = differenceCiede2000();
  let min = Infinity;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const d = diff(colors[i] as Color, colors[j] as Color);
      if (d < min) min = d;
    }
  }
  return min;
}

function simulatedMin(colors: Colors, filter: <C extends Color>(color: C) => C): number {
  const simulated = CVD_ANSI_KEYS.map((key) =>
    simulateLinear(filter, parseHexStrict(colors[key].hex)),
  );
  return minPairwiseDeltaE(simulated);
}

/**
 * Computes the full `Cvd` record for a theme's 6 classic ANSI colors: the
 * minimum pairwise CIEDE2000 ΔE among them, post-simulation, for each of
 * deuteranopia, protanopia, and tritanopia.
 */
export function computeCvd(colors: Colors): Cvd {
  return {
    deuteranopia: simulatedMin(colors, deuterFilter),
    protanopia: simulatedMin(colors, protFilter),
    tritanopia: simulatedMin(colors, tritFilter),
  };
}

/**
 * Colorblind-safety tags from a computed `Cvd` record: `cvd-safe` when both
 * `deuteranopia` and `protanopia` clear `CVD_SAFE_THRESHOLD`, `cvd-caution`
 * otherwise. `tritanopia` does not gate either tag (data-only — see module
 * doc comment).
 */
export function cvdTags(cvd: Cvd): string[] {
  const safe = cvd.deuteranopia >= CVD_SAFE_THRESHOLD && cvd.protanopia >= CVD_SAFE_THRESHOLD;
  return [safe ? 'cvd-safe' : 'cvd-caution'];
}
