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
 * (Machado, Oliveira & Fluck 2009, a refinement of Brettel/Viénot & Mollon
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
 *    Getting there surfaced a real, independent bug: `wong-light`'s `cyan`
 *    slot (`data-sources/native/wong-light.json`) had been darkened for WCAG
 *    contrast against its near-white background by an ad hoc hex tweak that
 *    (unlike every other slot in that theme) drifted its OKLCH lightness
 *    close enough to `blue`'s to collapse the two under both deuteranopia
 *    (was 3.53, now 11.62) and protanopia (was 4.95, now 10.88) — this
 *    feature caught an accessibility bug in a theme literally named
 *    "Colorblind-Safe". Fixed by re-deriving `cyan` at the same OKLCH hue
 *    (~236°, matching `wong-dark`'s canonical Okabe-Ito sky-blue) and a
 *    lightness (`l` ≈ 0.614) chosen to keep WCAG contrast against `#fafafa`
 *    at ~3.5:1 while restoring enough of a lightness gap from `blue` (`l`
 *    ≈ 0.532) to stay separable post-simulation. See the PR description for
 *    before/after numbers.
 *  - A real, in-corpus known-clashing pair: `mirage`'s `red` (#ff9999,
 *    OKLCH l=0.788 h=20.2) and `green` (#85cc95, l=0.784 h=150.5) are
 *    near-isoluminant (ΔL ≈ 0.005) and differ almost entirely in hue along
 *    the red-green confusion axis — plainly distinct to typical vision
 *    (ΔE2000 ≈ 53, no contrast problem at all), but they collapse to
 *    ΔE2000 ≈ 0.06 under deuteranopia simulation. This is the textbook CVD
 *    failure mode round-trip/WCAG checks can't see: two colors that are
 *    obviously different normally, verified identical to a deuteranope. Not
 *    picked because its name suggests a red/green clash — chosen precisely
 *    BECAUSE it doesn't (an ordinary-looking dark theme), which is what
 *    makes it a realistic "you'd never notice this without simulating it"
 *    example.
 *  - Across the full 633-theme corpus, `min(deuteranopia, protanopia)` has NO
 *    natural gap — it's a smooth, long-tailed distribution (median ~3.2,
 *    p90 ~8.2, p94 ~10.1, p98 ~12.9; see the PR description's corpus stats).
 *    10 is therefore a deliberately conservative, prior-art-anchored line
 *    (not a corpus-derived cutpoint): most of this corpus is decorative
 *    community terminal themes that were never designed with CVD safety in
 *    mind, so a low pass rate (roughly the top ~6% of the corpus, at the
 *    time of writing) is the expected, honest result of holding every theme
 *    to an Okabe-Ito/Paul-Tol-grade bar — not a sign the bar is miscalibrated.
 *    10 in CIEDE2000 units is an order of magnitude above the ΔE2000 < 1.0
 *    "just noticeable difference" floor this repo's own round-trip gate uses
 *    elsewhere, deliberately so: CVD confusion is a much coarser,
 *    whole-hue-family failure mode than round-trip gamut error, so it
 *    warrants a much larger comfortable margin, not the theoretical JND.
 */

import {
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

function parseHexStrict(hex: string): Color {
  const parsed = parse(hex);
  if (parsed === undefined) {
    throw new Error(`Unparseable color: ${hex}`);
  }
  return parsed;
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
  const simulated = CVD_ANSI_KEYS.map((key) => filter(parseHexStrict(colors[key].hex)));
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
