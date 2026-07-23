/**
 * Computes `accent` — a theme's computed signature/accent color — at build
 * time. See issue #133.
 *
 * Heuristic (must exactly match remarque-tokens' `accentHue()` bridge,
 * `scripts/theme.mjs` in williamzujkowski/remarque, which currently
 * re-implements this same guess at derivation time):
 *
 *   1. `cursor` if its OKLCH chroma is >= 0.05 (it reads as a deliberate,
 *      chromatic color rather than a neutral block cursor).
 *   2. Otherwise, the most-chromatic of the six classic ANSI colors, in
 *      this exact order: `blue`, `purple`, `red`, `green`, `cyan`, `yellow`.
 *      Ties are broken by that order via a stable sort (Array#sort is
 *      spec-stable since ES2019) — replicated here verbatim so this and
 *      remarque's bridge always agree.
 *
 * The accent VALUE is a REFERENCE to the chosen slot's own color — the same
 * `hex`/`oklch`/`oklchCss`, never a newly derived color. `findAccentErrors`
 * (used by `scripts/validate.ts`) asserts that equality holds exactly.
 */

import type { Accent, AccentSlim, AccentSlotKey, Colors, Oklch } from './types.js';
import { ACCENT_SLOT_KEYS } from './types.js';

// Order matters — this IS the tie-break order, replicated verbatim from
// remarque-tokens' `accentHue()` (`scripts/theme.mjs`). Do not reorder.
export const ACCENT_ANSI_ORDER: readonly AccentSlotKey[] = [
  'blue',
  'purple',
  'red',
  'green',
  'cyan',
  'yellow',
];

const CHROMATIC_CURSOR_THRESHOLD = 0.05;

const VALID_ACCENT_SOURCES: ReadonlySet<string> = new Set(ACCENT_SLOT_KEYS);

/**
 * Curated per-theme accent overrides (like `CURATED_COUNTERPART_OVERRIDES` in
 * `src/counterpart.ts`) for themes whose semantic accent isn't what the
 * cursor-if-chromatic-else-most-chromatic-ANSI heuristic picks — e.g. a theme
 * whose cursor is a neutral block but whose identity is a specific ANSI hue.
 *
 * Maps theme slug -> slot name. The slot must exist on every theme and must
 * be `cursor` or one of the 16 ANSI keys (`AccentSlotKey`); `assignAccents`
 * (scripts/build.ts) uses this in place of the heuristic when present, and
 * `findAccentErrors` re-validates the result the same way it validates a
 * heuristic-derived accent.
 *
 * Seeded empty — no theme has been reviewed as a heuristic miss yet. See
 * issue #133.
 */
export const CURATED_ACCENT_OVERRIDES: Readonly<Record<string, AccentSlotKey>> = {};

/**
 * Picks the accent source slot for a theme: the curated override when one
 * exists for `slug`, else the cursor-if-chromatic-else-most-chromatic-ANSI
 * heuristic. `overrides` defaults to `CURATED_ACCENT_OVERRIDES` — the
 * `scripts/build.ts` call site relies on that default; tests pass an
 * explicit map to exercise the override mechanism in isolation.
 */
export function computeAccentSource(
  slug: string,
  colors: Colors,
  overrides: Readonly<Record<string, AccentSlotKey>> = CURATED_ACCENT_OVERRIDES,
): AccentSlotKey {
  const override = overrides[slug];
  if (override !== undefined) return override;

  const cursor = colors.cursor.oklch;
  if (cursor.c >= CHROMATIC_CURSOR_THRESHOLD) return 'cursor';

  // Mirrors remarque's accentHue(): build candidates in tie-break order, then
  // a stable descending sort by chroma — the first element after sorting is
  // the most-chromatic candidate, ties resolved by original (tie-break) order.
  const candidates = ACCENT_ANSI_ORDER.map((name) => ({ name, c: colors[name].oklch.c }));
  candidates.sort((a, b) => b.c - a.c);
  return (candidates[0] as { name: AccentSlotKey; c: number }).name;
}

/** Computes the full `Accent` record for a theme — source plus a reference to that slot's own color. */
export function computeAccent(
  slug: string,
  colors: Colors,
  overrides: Readonly<Record<string, AccentSlotKey>> = CURATED_ACCENT_OVERRIDES,
): Accent {
  const source = computeAccentSource(slug, colors, overrides);
  const slot = colors[source];
  return { source, hex: slot.hex, oklch: slot.oklch, oklchCss: slot.oklchCss };
}

/**
 * Slim projection of an `Accent` — `source` + `oklchCss` only, no `hex`/full
 * `oklch` object. Used by `scripts/build.ts` for both `themes-slim.json` and
 * `index.json`, which follow the same lean-index convention as `counterpart`.
 */
export function toAccentSlim(accent: Accent): AccentSlim {
  return { source: accent.source, oklchCss: accent.oklchCss };
}

export interface AccentValidationInput {
  slug: string;
  colors: Colors;
  accent?: Accent;
}

function sameOklch(a: Oklch, b: Oklch): boolean {
  return a.l === b.l && a.c === b.c && a.h === b.h;
}

/**
 * Cross-checks each theme's `accent` (if present) against its own `colors`:
 * `source` must be a valid accent slot key (every valid key exists on every
 * theme by construction — `Colors` is total over `COLOR_KEYS`), and the
 * carried `hex`/`oklch`/`oklchCss` must equal `colors[source]` exactly (the
 * accent is a reference, never a new color). Returns one human-readable
 * error string per violation (empty array = valid). Used by
 * `scripts/validate.ts`.
 */
export function findAccentErrors(themes: readonly AccentValidationInput[]): string[] {
  const errors: string[] = [];
  for (const theme of themes) {
    if (theme.accent === undefined) continue;
    const { source, hex, oklch, oklchCss } = theme.accent;
    if (!VALID_ACCENT_SOURCES.has(source)) {
      errors.push(`${theme.slug}.accent.source: "${source}" is not "cursor" or a known ANSI key`);
      continue;
    }
    const slot = theme.colors[source];
    if (slot.hex !== hex || slot.oklchCss !== oklchCss || !sameOklch(slot.oklch, oklch)) {
      errors.push(
        `${theme.slug}.accent: does not exactly equal colors.${source} (accent must reference the slot's own color)`,
      );
    }
  }
  return errors;
}
