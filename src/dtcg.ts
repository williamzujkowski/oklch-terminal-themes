/**
 * Per-theme W3C Design Tokens (DTCG) export — issue #148.
 *
 * Targets the **stable 2025.10 surface only**: the structured `color` type,
 * groups, `$type` inheritance, `$description` and `$extensions`. The
 * multi-mode / resolver drafts are unratified, so light/dark pairing is
 * deliberately NOT encoded here even though this dataset carries
 * `counterpart` and could express it — a file that guesses at a draft shape
 * is worse than one a consumer has to pair themselves, because it looks
 * authoritative. Each file is single-mode: one theme, one set of values.
 *
 * Why this dataset is a good DTCG source: every colour is already OKLCH-
 * native, and the spec's structured colour object takes `oklch` as a first-
 * class `colorSpace`. Most token sets reaching Figma / Style Dictionary /
 * Tokens Studio are hex-only and have already thrown the gamut information
 * away; these have not.
 *
 * Build/tooling module, like `src/schemes.ts` and `src/css-export.ts` — not
 * part of the public package API surface (not re-exported from
 * `src/index.ts`), imported directly by `scripts/build.ts` and tests.
 */

import type { ColorKey, ColorValue, TerminalColorTheme } from './types.js';

/**
 * A DTCG colour component. `"none"` is the spec's representation of a
 * *powerless* component — see `colorToToken` for why hue uses it.
 */
type Component = number | 'none';

interface DtcgColorValue {
  colorSpace: 'oklch';
  components: [Component, Component, Component];
  alpha: number;
  hex: string;
}

interface DtcgToken {
  $value: DtcgColorValue;
  $description?: string;
}

/** A DTCG group: `$`-prefixed metadata plus arbitrary named children. */
type DtcgGroup = Record<string, unknown>;

/** The eight ANSI slots, in the canonical order, without the `bright` prefix. */
const ANSI_BASE = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white'] as const;

/** Slots that are not part of the 16-colour ANSI block. */
const UI_KEYS = ['background', 'foreground', 'cursor', 'selection'] as const;

function brightKeyFor(base: (typeof ANSI_BASE)[number]): ColorKey {
  return `bright${base.charAt(0).toUpperCase()}${base.slice(1)}` as ColorKey;
}

/**
 * One `ColorValue` as a DTCG structured colour.
 *
 * `hex` is always emitted alongside the OKLCH components. The spec makes it
 * optional and it is strictly redundant here, but it is what lets a hex-only
 * consumer — which is still most of them — read these files at all, and every
 * colour in this corpus originates as sRGB hex so it is exact rather than a
 * lossy round-trip.
 *
 * Hue is `"none"` when chroma is exactly 0. In OKLCH a greyscale colour has
 * no hue: the dataset stores 0 because a number is required there, but
 * emitting a literal 0 asserts "red-ish" for 1,949 of this corpus's greys
 * (~15% of all slots), which interpolates wrongly the moment a consumer
 * builds a ramp through one. `"none"` is exactly the case the spec's
 * powerless-component provision exists for. Consumers that cannot read it
 * still have `hex`.
 */
export function colorToToken(color: ColorValue): DtcgToken {
  const { l, c, h } = color.oklch;
  return {
    $value: {
      colorSpace: 'oklch',
      components: [l, c, c === 0 ? 'none' : h],
      alpha: 1,
      hex: color.hex,
    },
  };
}

function ansiGroup(colors: Record<ColorKey, ColorValue>): DtcgGroup {
  const normal: DtcgGroup = {};
  const bright: DtcgGroup = {};
  for (const base of ANSI_BASE) {
    normal[base] = colorToToken(colors[base]);
    bright[base] = colorToToken(colors[brightKeyFor(base)]);
  }
  return {
    $description: 'The 16 ANSI slots, split into the normal and bright halves.',
    normal,
    bright,
  };
}

/**
 * The full DTCG document for one theme.
 *
 * Shape:
 *
 * ```
 * color.background | foreground | cursor | selection
 * color.ansi.normal.{black … white}
 * color.ansi.bright.{black … white}
 * ```
 *
 * `$type: 'color'` is set once on the `color` group and inherited by every
 * descendant, which is the group-inheritance rule from the stable spec — and
 * it keeps the 20 leaves from repeating it 20 times.
 *
 * Theme metadata goes in `$extensions` under a reverse-DNS-style key rather
 * than as loose top-level fields: unrecognised `$`-properties are reserved by
 * the spec, and unrecognised *non*-`$` properties would be read as tokens.
 * `$extensions` is the sanctioned place for anything the spec does not model.
 */
export function themeToDtcg(theme: TerminalColorTheme): DtcgGroup {
  return {
    $description: `${theme.name} — terminal colour theme (${theme.isDark ? 'dark' : 'light'}).`,
    $extensions: {
      'dev.oklch-terminal-themes': {
        slug: theme.slug,
        name: theme.name,
        isDark: theme.isDark,
        tags: theme.tags,
        source: theme.source,
        sourceUrl: theme.sourceUrl,
        // Single-mode by design — see the module comment. `counterpart` is
        // surfaced so a consumer can pair the files themselves without
        // guessing at the unratified multi-mode shape.
        ...(theme.counterpart === undefined ? {} : { counterpart: theme.counterpart }),
      },
    },
    color: {
      $type: 'color',
      ...Object.fromEntries(UI_KEYS.map((k) => [k, colorToToken(theme.colors[k])])),
      ansi: ansiGroup(theme.colors),
    },
  };
}

/** The DTCG document for one theme, serialized as the file's text. */
export function buildDtcgJson(theme: TerminalColorTheme): string {
  return `${JSON.stringify(themeToDtcg(theme), null, 2)}\n`;
}

/**
 * Every `ColorKey` reaches exactly one token, checked here rather than
 * trusted. `UI_KEYS` + `ANSI_BASE` × 2 is a hand-maintained partition of
 * `COLOR_KEYS`, and a slot added to the dataset would otherwise be silently
 * dropped from the export.
 */
export function dtcgCoveredKeys(): ColorKey[] {
  return [...UI_KEYS, ...ANSI_BASE, ...ANSI_BASE.map(brightKeyFor)] as ColorKey[];
}
