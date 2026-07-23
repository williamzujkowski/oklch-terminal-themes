/**
 * Base16/base24 scheme YAML export (issue #146, gated on the tinted-theming
 * dedup/overlap analysis — see the issue's binding comment, 2026-07-23).
 *
 * **Verdict recap**: ship the export locally for all 633 themes (unlocks the
 * tinty/base16-template ecosystem — Alacritty, Kitty, WezTerm, Ghostty,
 * Windows Terminal, foot, hundreds of app templates — without us building or
 * maintaining per-emulator exporters). Do NOT bulk-submit these upstream to
 * tinted-theming/schemes: 227/633 (35.9%) already exist there as hand-curated
 * schemes (209 exact-name + 18 family matches — all 7 gruvbox slugs collide),
 * and 93.4% of this corpus is itself bulk-imported (iterm2-color-schemes), so
 * we lack curation standing for most of it. The 17 native themes are the only
 * non-overlapping set and upstream submission for those is a separate future
 * decision. See `README.md`'s "base16/base24 scheme export" section for the
 * consumer-facing version of this notice.
 *
 * ## Slot mapping (base16, base00-0F)
 *
 * | Slot   | Source                              | Confidence | Kind          |
 * | ------ | ------------------------------------ | ---------- | ------------- |
 * | base00 | `background`                         | high       | reference     |
 * | base01 | `background` <-> `selection` midpoint | medium     | interpolated  |
 * | base02 | `selection`                           | high       | reference     |
 * | base03 | `brightBlack`                         | high       | reference     |
 * | base04 | `brightBlack` <-> `foreground` midpoint | medium   | interpolated  |
 * | base05 | `foreground`                          | high       | reference     |
 * | base06 | `foreground` <-> `brightWhite` midpoint | medium   | interpolated  |
 * | base07 | `brightWhite`                         | high       | reference     |
 * | base08 | `red`                                 | high       | reference     |
 * | base09 | synthesized (hue-derived, no source)  | low        | synthesized   |
 * | base0A | `yellow`                              | high       | reference     |
 * | base0B | `green`                               | high       | reference     |
 * | base0C | `cyan`                                | high       | reference     |
 * | base0D | `blue`                                | high       | reference     |
 * | base0E | `purple`                              | high       | reference     |
 * | base0F | synthesized (hue-derived, no source)  | low        | synthesized   |
 *
 * `base01`/`base04`/`base06` are OKLCH midpoints between their documented
 * neighbor anchors (per styling guidance: base00-07 is meant to be a single
 * neutral bg->fg progression, and these three slots have no dedicated field
 * in `Colors`) — `l` and `c` are linearly interpolated at t=0.5, `h` is taken
 * from whichever anchor is more chromatic (deterministic: ties keep the
 * earlier anchor), and the result is gamut-fit before storage (same
 * "clamp chroma to what's displayable at this l/h before rounding" contract
 * `dataviz.ts`'s `fitChroma` established).
 *
 * `base09` (orange) and `base0F` (brown) have **zero source data** — no slot
 * in `Colors` represents either. Per the dedup analysis, these are
 * synthesized via hue-derivation, not extracted, and every emitted YAML
 * discloses this with a `# base09/base0F synthesized` comment:
 *
 * - `base09` (orange) — the circular-hue midpoint between `base08` (red) and
 *   `base0A` (yellow), `l`/`c` linearly interpolated at t=0.5. Orange sits
 *   perceptually between red and yellow, and this matches real curated
 *   base16 schemes closely (e.g. gruvbox's hand-authored orange `#fe8019`
 *   lands within a few degrees of the red/yellow hue midpoint).
 * - `base0F` (brown) — `base09` pulled 35% toward `background`'s lightness
 *   and desaturated to 55% of its chroma, same hue. Brown reads as a dark,
 *   muted orange; deriving it FROM the synthesized orange (rather than
 *   independently from red/yellow) keeps the two synthesized slots visually
 *   related, the way real base16 palettes' orange/brown pairs usually are.
 *
 * ## Slot mapping (base24 additions, base10-17)
 *
 * Base24 (see tinted-theming's base24 styling guide) adds 8 slots beyond
 * base16's 16:
 *
 * | Slot   | Source                                   | Confidence | Kind         |
 * | ------ | ----------------------------------------- | ---------- | ------------ |
 * | base10 | `background` extrapolated darker          | medium     | extrapolated |
 * | base11 | `background` extrapolated darkest         | medium     | extrapolated |
 * | base12 | `brightRed`                               | high       | reference    |
 * | base13 | `brightYellow`                            | high       | reference    |
 * | base14 | `brightGreen`                             | high       | reference    |
 * | base15 | `brightCyan`                              | high       | reference    |
 * | base16 | `brightBlue`                              | high       | reference    |
 * | base17 | `brightPurple`                            | high       | reference    |
 *
 * base24's base10/base11 ("darker black" / "darkest black" per the spec) have
 * no dedicated `Colors` field either, so they're extrapolated from
 * `background`: `l` steps further away from `foreground` by 6% / 12% of the
 * background<->foreground lightness span (clamped to `[0, 1]`), `c`/`h` held
 * at `background`'s own values and gamut-fit. base12-17 are direct
 * REFERENCES to the theme's own `bright*` ANSI slots — base24's bright-color
 * range takes those slots directly instead of base16's conflation, which is
 * exactly why the dedup analysis prefers base24 where possible.
 *
 * Base24 is preferred over base16 for this export per the analysis; base16 is
 * also emitted as a subset projection (it's cheap — same 16 slots, computed
 * once) for ecosystem tooling that only understands base16.
 */

import { clampChroma } from 'culori';
import { convertOklchToColor } from './convert.js';
import type { ColorKey, ColorValue, Colors, Oklch } from './types.js';

export const BASE16_KEYS = [
  'base00',
  'base01',
  'base02',
  'base03',
  'base04',
  'base05',
  'base06',
  'base07',
  'base08',
  'base09',
  'base0A',
  'base0B',
  'base0C',
  'base0D',
  'base0E',
  'base0F',
] as const;
export type Base16Key = (typeof BASE16_KEYS)[number];

export const BASE24_EXTRA_KEYS = [
  'base10',
  'base11',
  'base12',
  'base13',
  'base14',
  'base15',
  'base16',
  'base17',
] as const;
export type Base24ExtraKey = (typeof BASE24_EXTRA_KEYS)[number];

export const BASE24_KEYS = [...BASE16_KEYS, ...BASE24_EXTRA_KEYS] as const;
export type Base24Key = (typeof BASE24_KEYS)[number];

export type SlotDerivation = 'reference' | 'interpolated' | 'synthesized' | 'extrapolated';

export interface SchemeSlot {
  key: Base24Key;
  color: ColorValue;
  derivation: SlotDerivation;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Mirrors `src/dataviz.ts`'s (unexported) `fitChroma`: clamps chroma to the
// sRGB-displayable maximum at the given l/h before storage, so every emitted
// derived slot's oklch/hex/oklchCss stay mutually consistent (round-trip
// ΔE ~ 0) rather than carrying an unclampable "intent" the way human-authored
// native colors do.
function fitChroma(l: number, c: number, h: number): number {
  return clampChroma({ mode: 'oklch', l, c, h }, 'oklch').c;
}

/** Shortest-path circular hue interpolation (handles the 0/360 wraparound). */
function circularLerpHue(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + diff * t) % 360) + 360) % 360;
}

/**
 * OKLCH midpoint (t=0.5) between two anchor colors: `l`/`c` linearly
 * interpolated, `h` taken from whichever anchor is more chromatic (ties keep
 * `a`), gamut-fit before storage. Used for base16's base01/base04/base06.
 */
function midpoint(a: Oklch, b: Oklch): ColorValue {
  const l = lerp(a.l, b.l, 0.5);
  const cRaw = lerp(a.c, b.c, 0.5);
  const h = a.c >= b.c ? a.h : b.h;
  return convertOklchToColor({ l, c: fitChroma(l, cRaw, h), h });
}

// Orange has no source slot: circular-hue midpoint between red and yellow,
// l/c linearly interpolated. See module doc comment.
function synthesizeOrange(red: Oklch, yellow: Oklch): ColorValue {
  const l = lerp(red.l, yellow.l, 0.5);
  const h = circularLerpHue(red.h, yellow.h, 0.5);
  const cRaw = lerp(red.c, yellow.c, 0.5);
  return convertOklchToColor({ l, c: fitChroma(l, cRaw, h), h });
}

// Brown has no source slot either: synthesized orange pulled toward
// background's lightness and desaturated. See module doc comment.
const BROWN_LIGHTNESS_PULL = 0.35;
const BROWN_CHROMA_FACTOR = 0.55;
function synthesizeBrown(orange: Oklch, background: Oklch): ColorValue {
  const l = lerp(orange.l, background.l, BROWN_LIGHTNESS_PULL);
  const h = orange.h;
  const cRaw = orange.c * BROWN_CHROMA_FACTOR;
  return convertOklchToColor({ l, c: fitChroma(l, cRaw, h), h });
}

// base24's base10/base11 ("darker black"/"darkest black"): background
// extrapolated further from foreground by 6%/12% of the bg<->fg lightness
// span. See module doc comment.
const DARKER_BG_STEP = 0.06;
const DARKEST_BG_STEP = 0.12;
function extrapolateDarkerBg(background: Oklch, foreground: Oklch, step: number): ColorValue {
  const span = Math.abs(foreground.l - background.l);
  const direction = background.l <= foreground.l ? -1 : 1;
  const l = Math.min(1, Math.max(0, background.l + direction * step * span));
  const h = background.h;
  return convertOklchToColor({ l, c: fitChroma(l, background.c, h), h });
}

function ref(colors: Colors, key: ColorKey): ColorValue {
  return colors[key];
}

/**
 * Computes the 16 base16 slots for a theme, in `BASE16_KEYS` order. Pure
 * function of `colors` — deterministic, no timestamps, no randomness.
 */
export function computeBase16Slots(colors: Colors): SchemeSlot[] {
  const base00 = ref(colors, 'background');
  const base02 = ref(colors, 'selection');
  const base03 = ref(colors, 'brightBlack');
  const base05 = ref(colors, 'foreground');
  const base07 = ref(colors, 'brightWhite');
  const base08 = ref(colors, 'red');
  const base0A = ref(colors, 'yellow');
  const base0B = ref(colors, 'green');
  const base0C = ref(colors, 'cyan');
  const base0D = ref(colors, 'blue');
  const base0E = ref(colors, 'purple');

  const base01 = midpoint(base00.oklch, base02.oklch);
  const base04 = midpoint(base03.oklch, base05.oklch);
  const base06 = midpoint(base05.oklch, base07.oklch);
  const base09 = synthesizeOrange(base08.oklch, base0A.oklch);
  const base0F = synthesizeBrown(base09.oklch, base00.oklch);

  return [
    { key: 'base00', color: base00, derivation: 'reference' },
    { key: 'base01', color: base01, derivation: 'interpolated' },
    { key: 'base02', color: base02, derivation: 'reference' },
    { key: 'base03', color: base03, derivation: 'reference' },
    { key: 'base04', color: base04, derivation: 'interpolated' },
    { key: 'base05', color: base05, derivation: 'reference' },
    { key: 'base06', color: base06, derivation: 'interpolated' },
    { key: 'base07', color: base07, derivation: 'reference' },
    { key: 'base08', color: base08, derivation: 'reference' },
    { key: 'base09', color: base09, derivation: 'synthesized' },
    { key: 'base0A', color: base0A, derivation: 'reference' },
    { key: 'base0B', color: base0B, derivation: 'reference' },
    { key: 'base0C', color: base0C, derivation: 'reference' },
    { key: 'base0D', color: base0D, derivation: 'reference' },
    { key: 'base0E', color: base0E, derivation: 'reference' },
    { key: 'base0F', color: base0F, derivation: 'synthesized' },
  ];
}

/**
 * Computes the full 24 base24 slots (the 16 base16 slots plus base10-17), in
 * `BASE24_KEYS` order. Pure function of `colors`.
 */
export function computeBase24Slots(colors: Colors): SchemeSlot[] {
  const base16 = computeBase16Slots(colors);
  const background = ref(colors, 'background');
  const foreground = ref(colors, 'foreground');

  const base10 = extrapolateDarkerBg(background.oklch, foreground.oklch, DARKER_BG_STEP);
  const base11 = extrapolateDarkerBg(background.oklch, foreground.oklch, DARKEST_BG_STEP);

  return [
    ...base16,
    { key: 'base10', color: base10, derivation: 'extrapolated' },
    { key: 'base11', color: base11, derivation: 'extrapolated' },
    { key: 'base12', color: ref(colors, 'brightRed'), derivation: 'reference' },
    { key: 'base13', color: ref(colors, 'brightYellow'), derivation: 'reference' },
    { key: 'base14', color: ref(colors, 'brightGreen'), derivation: 'reference' },
    { key: 'base15', color: ref(colors, 'brightCyan'), derivation: 'reference' },
    { key: 'base16', color: ref(colors, 'brightBlue'), derivation: 'reference' },
    { key: 'base17', color: ref(colors, 'brightPurple'), derivation: 'reference' },
  ];
}

export interface SchemeMeta {
  system: 'base16' | 'base24';
  name: string;
  author: string;
  variant: 'dark' | 'light';
}

// Double-quoted plain YAML scalar — escapes backslash and double-quote only
// (the two characters meaningful inside a YAML double-quoted scalar). No
// anchors, no tags, no flow collections: every value emitted by this module
// is either this scalar form or a `key:` block-mapping line, so the output
// can never carry a YAML alias/anchor/tag regardless of input content.
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Serializes a base16/base24 scheme to YAML text, matching the
 * tinted-theming/schemes field order (`system`, `name`, `author`, `variant`,
 * `palette`). Safe emission only: every scalar is double-quoted plain text
 * (`yamlString`), so no anchors/tags/aliases can appear regardless of theme
 * name content. `slotComments` (keyed by slot name) attaches an inline `#`
 * comment to that palette line — used to disclose the synthesized slots.
 */
export function serializeScheme(
  meta: SchemeMeta,
  slots: readonly SchemeSlot[],
  slotComments: Partial<Record<string, string>> = {},
): string {
  const lines = [
    `system: ${yamlString(meta.system)}`,
    `name: ${yamlString(meta.name)}`,
    `author: ${yamlString(meta.author)}`,
    `variant: ${yamlString(meta.variant)}`,
    `palette:`,
  ];
  for (const slot of slots) {
    const comment = slotComments[slot.key];
    lines.push(
      `  ${slot.key}: ${yamlString(slot.color.hex)}${comment !== undefined ? ` # ${comment}` : ''}`,
    );
  }
  return lines.join('\n') + '\n';
}

// Disclosure comments required by the dedup analysis's blocking-condition
// resolution — every emitted scheme YAML must disclose that base09/base0F
// have no source data and are hue-derived, not extracted.
export const SYNTHESIZED_SLOT_COMMENTS: Partial<Record<string, string>> = {
  base09: 'base09/base0F synthesized (hue-derived, no source data — see README)',
  base0F: 'base09/base0F synthesized (hue-derived, no source data — see README)',
};

/**
 * Builds the complete base16 scheme YAML text for a theme.
 */
export function buildBase16Yaml(input: {
  name: string;
  isDark: boolean;
  author: string;
  colors: Colors;
}): string {
  const slots = computeBase16Slots(input.colors);
  const meta: SchemeMeta = {
    system: 'base16',
    name: input.name,
    author: input.author,
    variant: input.isDark ? 'dark' : 'light',
  };
  return serializeScheme(meta, slots, SYNTHESIZED_SLOT_COMMENTS);
}

/**
 * Builds the complete base24 scheme YAML text for a theme.
 */
export function buildBase24Yaml(input: {
  name: string;
  isDark: boolean;
  author: string;
  colors: Colors;
}): string {
  const slots = computeBase24Slots(input.colors);
  const meta: SchemeMeta = {
    system: 'base24',
    name: input.name,
    author: input.author,
    variant: input.isDark ? 'dark' : 'light',
  };
  return serializeScheme(meta, slots, SYNTHESIZED_SLOT_COMMENTS);
}
