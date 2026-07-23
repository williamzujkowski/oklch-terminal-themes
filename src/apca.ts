/**
 * Computes `apca` — APCA (Accessible Perceptual Contrast Algorithm) Lc
 * scores — at build time. See issue #151.
 *
 * DATA ONLY: nothing in this repo tags or gates on these values. The WCAG
 * 2.x `contrast` block (`src/classify.ts`) remains the sole source of the
 * `wcag-*`/`ansi-legible`/`cursor-visible`/`selection-legible` tags. APCA is
 * still evolving outside the W3C standards process — exactly why issue #151
 * keeps it "data, not policy" (remarque, a downstream consumer, separately
 * records APCA-considered-not-adopted for its own gates).
 *
 * BLOCKING condition on the issue: use the `apca-w3` npm package — the
 * reference implementation published by APCA's author (Andrew Somers /
 * Myndex) — never hand-roll the algorithm. `calcAPCA(textColor, bgColor)`
 * parses hex strings directly (via its `colorparsley` dependency) and
 * returns a signed Lc: POSITIVE when the text color is darker than the
 * background ("BoW", black-on-white polarity), NEGATIVE when the text color
 * is lighter than the background ("WoB", white-on-black polarity) — "do not
 * swap, polarity is important" per the library's own source comments.
 * Verified against apca-w3's own published test vectors in
 * `test/apca.test.ts` (e.g. `calcAPCA('#888', '#fff')` = 63.056469930209424).
 *
 * Mirrors `Contrast.fgOnBg`/`minAnsi`/`minAnsiSlot`'s shape:
 *
 * - `fgOnBg` — Lc of `foreground` (text) on `background`, i.e.
 *   `calcAPCA(foreground, background)`. This is already the correct
 *   text-on-background polarity for every theme — `foreground` is always the
 *   "text" color, `background` the "background" color, regardless of the
 *   theme's `isDark` — so no extra polarity branching is needed here; APCA's
 *   sign does the polarity-awareness for us (positive for light themes,
 *   negative for dark themes, by construction).
 * - `minAnsi` / `minAnsiSlot` — the ANSI slot (from the exact same
 *   `ANSI_KEYS` candidate list and `DARK_BG_BLENDS`/`LIGHT_BG_BLENDS`
 *   exclusion `classify.ts#minAnsiContrast` uses for the WCAG pair) whose Lc
 *   against `background` has the smallest ABSOLUTE value — the worst-case
 *   ANSI legibility signal — reported as its signed Lc.
 *
 * Lc ranges roughly ±108; see README for the "|Lc| >= ~60 is APCA's rough
 * analogue of WCAG's 4.5:1 body-text guidance" framing.
 */

import { calcAPCA } from 'apca-w3';
import { ANSI_KEYS, DARK_BG_BLENDS, LIGHT_BG_BLENDS } from './ansi-slots.js';
import type { Apca, ColorKey, Colors } from './types.js';

/**
 * `calcAPCA` is typed `number | string` because a `places` argument >= 0
 * makes it return a formatted string — we never pass `places`, so it always
 * returns the signed float form. Fails loudly instead of silently coercing
 * if that ever stops being true.
 */
function lc(textHex: string, bgHex: string): number {
  const result = calcAPCA(textHex, bgHex);
  if (typeof result !== 'number') {
    throw new Error(
      `apca-w3 calcAPCA(${textHex}, ${bgHex}) returned a string ("${result}") — expected a number`,
    );
  }
  return result;
}

/**
 * Worst-case (smallest |Lc|) ANSI-slot-as-text-on-background APCA score,
 * excluding the conventional background-blend slots — see the module doc
 * comment.
 */
function minAnsiApca(colors: Colors, isDark: boolean): { lc: number; slot: ColorKey } {
  const blends = isDark ? DARK_BG_BLENDS : LIGHT_BG_BLENDS;
  const bgHex = colors.background.hex;
  let minAbs = Infinity;
  let minLc = 0;
  let minSlot: ColorKey = 'foreground';
  for (const k of ANSI_KEYS) {
    if (blends.has(k)) continue;
    const value = lc(colors[k].hex, bgHex);
    if (Math.abs(value) < minAbs) {
      minAbs = Math.abs(value);
      minLc = value;
      minSlot = k;
    }
  }
  return { lc: minLc, slot: minSlot };
}

/** Computes the full `Apca` record for a theme. See the module doc comment. */
export function computeApca(colors: Colors, isDark: boolean): Apca {
  const fgOnBg = lc(colors.foreground.hex, colors.background.hex);
  const { lc: minAnsi, slot: minAnsiSlot } = minAnsiApca(colors, isDark);
  return { fgOnBg, minAnsi, minAnsiSlot };
}
