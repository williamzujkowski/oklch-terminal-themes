import { z } from 'zod';
import type { AccentSlotKey, ColorKey } from './types.js';
import { ACCENT_SLOT_KEYS, COLOR_KEYS } from './types.js';

export const HexSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Must be 6-digit hex string prefixed with #');

export const OklchSchema = z.object({
  l: z.number().min(0).max(1),
  c: z.number().min(0).max(0.5),
  h: z.number().min(0).max(360),
});

export const ColorValueSchema = z.object({
  hex: HexSchema,
  oklch: OklchSchema,
  oklchCss: z.string().regex(/^oklch\(/, 'Must start with "oklch("'),
});

// Shared bounds for OKLCH — used by `OklchSchema` (the `{l, c, h}` object
// form) and `OKLCH_CSS_PATTERN` (the CSS-string form) so the two authoring
// forms enforce identical bounds from one place. See issue #132.
const OKLCH_L_MAX = 1;
const OKLCH_C_MAX = 0.5;
const OKLCH_H_MAX = 360;

// Captures the three numeric components of an `oklch(L C H)` CSS string.
// Intentionally strict (no percentages, no `none`, no alpha) — native sources
// author plain numbers; `src/convert.ts#parseOklchCss` reuses this pattern.
export const OKLCH_CSS_PATTERN = /^oklch\(\s*(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s*\)$/i;

// Native theme sources (data-sources/native/*.json) may author a color slot
// as an `oklch(L C H)` CSS string instead of hex — see issue #132. Unlike
// `ColorValueSchema.oklchCss` (which only checks the `oklch(` prefix, since
// it's trusted output we generated), this validates the full shape AND
// range-checks the captured numbers against the same bounds as the
// `{l, c, h}` object form, so e.g. `oklch(1.5 0.005 80)` is rejected here
// rather than silently clamped later.
export const NativeOklchCssSchema = z.string().refine((value) => {
  const match = OKLCH_CSS_PATTERN.exec(value.trim());
  if (match === null) return false;
  const [, lRaw, cRaw, hRaw] = match;
  const l = Number(lRaw);
  const c = Number(cRaw);
  const h = Number(hRaw);
  return (
    Number.isFinite(l) &&
    l >= 0 &&
    l <= OKLCH_L_MAX &&
    Number.isFinite(c) &&
    c >= 0 &&
    c <= OKLCH_C_MAX &&
    Number.isFinite(h) &&
    h >= 0 &&
    h <= OKLCH_H_MAX
  );
}, `Must be an "oklch(L C H)" CSS string with L in [0,${OKLCH_L_MAX}], C in [0,${OKLCH_C_MAX}], H in [0,${OKLCH_H_MAX}]`);

// A native color slot may be hex (unchanged today-format), an oklch() CSS
// string, or an {l, c, h} object — accept all three at the ingest boundary
// and let `scripts/build.ts` (via `resolveNativeColor`) decide which slots
// are hex-authored vs OKLCH-authored. See issue #132.
export const NativeColorInputSchema = z.union([HexSchema, NativeOklchCssSchema, OklchSchema]);
export type NativeColorInput = z.infer<typeof NativeColorInputSchema>;

const colorsShape = Object.fromEntries(COLOR_KEYS.map((k) => [k, ColorValueSchema])) as Record<
  (typeof COLOR_KEYS)[number],
  typeof ColorValueSchema
>;

export const ColorsSchema = z.object(colorsShape);

export const ContrastSchema = z.object({
  fgOnBg: z.number().positive(),
  minAnsi: z.number().positive(),
  minAnsiSlot: z.enum(COLOR_KEYS as unknown as readonly [ColorKey, ...ColorKey[]]),
});

// Slug of a theme's canonical opposite-polarity counterpart. Points at the
// CANONICAL opposite-polarity member of the family; directional, not
// necessarily involutive — several darks may point at one light while the
// light points back at only the canonical dark. See issue #128 and
// `src/counterpart.ts`. Cross-referential existence + opposite-`isDark`
// checks happen at the dataset level (scripts/validate.ts), not per-record,
// since a single theme's schema can't see its siblings.
const CounterpartSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be kebab-case')
  .optional();

// `accent.source` (issue #133): `cursor` or one of the 16 ANSI keys — see
// `ACCENT_SLOT_KEYS` in `src/types.ts`. Cross-referential exactness (the
// carried color must equal `colors[source]`) happens at the dataset level
// (scripts/validate.ts, `findAccentErrors`), not per-record, since a single
// theme's schema can't see its own `colors` field from inside a nested schema.
export const AccentSlotKeySchema = z.enum(
  ACCENT_SLOT_KEYS as unknown as readonly [AccentSlotKey, ...AccentSlotKey[]],
);

export const AccentSchema = z.object({
  source: AccentSlotKeySchema,
  hex: HexSchema,
  oklch: OklchSchema,
  oklchCss: z.string().regex(/^oklch\(/, 'Must start with "oklch("'),
});

export const TerminalColorThemeSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be kebab-case'),
  isDark: z.boolean(),
  tags: z.array(z.string()),
  source: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'source id must be kebab-case'),
  sourceUrl: z.url(),
  // 40-hex git SHA, or the literal `"local"` for hand-curated native themes
  // that live in this repo (no separate upstream commit to pin).
  upstreamSha: z.string().regex(/^([a-f0-9]{7,40}|local)$/),
  updatedAt: z.iso.datetime(),
  colors: ColorsSchema,
  contrast: ContrastSchema,
  counterpart: CounterpartSlugSchema,
  // Optional, additive-only (issue #132): color keys authored directly in
  // OKLCH by a native source, where `hex` is the derived field. Absent for
  // every theme built before this field existed and every hex-only theme —
  // backward compatible for consumers that don't know about it.
  oklchAuthored: z
    .array(z.enum(COLOR_KEYS as unknown as readonly [ColorKey, ...ColorKey[]]))
    .optional(),
  // Optional, additive-only (issue #133): computed/curatable signature accent
  // color. Absent only for data built before this field existed.
  accent: AccentSchema.optional(),
});

export const UpstreamSchemeSchema = z
  .object({
    name: z.string(),
    background: HexSchema,
    foreground: HexSchema,
    cursorColor: HexSchema,
    selectionBackground: HexSchema,
    black: HexSchema,
    red: HexSchema,
    green: HexSchema,
    yellow: HexSchema,
    blue: HexSchema,
    purple: HexSchema,
    cyan: HexSchema,
    white: HexSchema,
    brightBlack: HexSchema,
    brightRed: HexSchema,
    brightGreen: HexSchema,
    brightYellow: HexSchema,
    brightBlue: HexSchema,
    brightPurple: HexSchema,
    brightCyan: HexSchema,
    brightWhite: HexSchema,
  })
  .loose();

export type UpstreamScheme = z.infer<typeof UpstreamSchemeSchema>;

// Native theme source files (data-sources/native/*.json) — same shape as
// `UpstreamSchemeSchema` but every color slot accepts the hex-or-OKLCH union
// instead of hex-only. See issue #132; parsed by `src/parsers/native.ts`.
export const NativeSchemeSchema = z
  .object({
    name: z.string(),
    background: NativeColorInputSchema,
    foreground: NativeColorInputSchema,
    cursorColor: NativeColorInputSchema,
    selectionBackground: NativeColorInputSchema,
    black: NativeColorInputSchema,
    red: NativeColorInputSchema,
    green: NativeColorInputSchema,
    yellow: NativeColorInputSchema,
    blue: NativeColorInputSchema,
    purple: NativeColorInputSchema,
    cyan: NativeColorInputSchema,
    white: NativeColorInputSchema,
    brightBlack: NativeColorInputSchema,
    brightRed: NativeColorInputSchema,
    brightGreen: NativeColorInputSchema,
    brightYellow: NativeColorInputSchema,
    brightBlue: NativeColorInputSchema,
    brightPurple: NativeColorInputSchema,
    brightCyan: NativeColorInputSchema,
    brightWhite: NativeColorInputSchema,
  })
  .loose();

export type NativeScheme = z.infer<typeof NativeSchemeSchema>;
