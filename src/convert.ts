import { parse, converter, formatHex, differenceCiede2000, clampChroma } from 'culori';
import { OKLCH_CSS_PATTERN } from './schema.js';
import type { NativeColorInput } from './schema.js';
import type { ColorValue, Oklch } from './types.js';

const toOklch = converter('oklch');
const toRgb = converter('rgb');

export function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// Rounding precision is part of the published contract (CODING_STANDARDS.md
// §5.4): l/c to 4 decimals for the stored `oklch` object, l/c/h to 3/3/1 for
// the `oklchCss` string. Shared by both the hex->oklch and oklch-authored
// paths so the two forms round identically.
function roundOklch(l: number, c: number, h: number): Oklch {
  return {
    l: round(clamp(l, 0, 1), 4),
    c: round(clamp(c, 0, 0.5), 4),
    // culori returns h: undefined for achromatic colors; JSON must be finite.
    h: Number.isFinite(h) ? round(h, 1) : 0,
  };
}

function formatOklchCss(oklch: Oklch): string {
  const cssL = round(oklch.l, 3);
  const cssC = round(oklch.c, 3);
  const cssH = round(oklch.h, 1);
  return `oklch(${cssL} ${cssC} ${cssH})`;
}

// Reduces chroma (keeping l/h) until the color is displayable in sRGB —
// culori's gamut-mapping helper, applied before every oklch->hex conversion
// so out-of-gamut authored values (issue #132) don't silently wrap.
function gamutClampOklch(oklch: Oklch): { mode: 'oklch'; l: number; c: number; h: number } {
  return clampChroma({ mode: 'oklch', l: oklch.l, c: oklch.c, h: oklch.h }, 'oklch');
}

export function convertHexToColor(hex: string): ColorValue {
  const normalizedHex = hex.toLowerCase();
  const parsed = parse(normalizedHex);
  if (parsed === undefined) {
    throw new Error(`Unparseable color: ${hex}`);
  }
  const ok = toOklch(parsed);
  const oklch = roundOklch(ok.l, ok.c, ok.h ?? NaN);

  return { hex: normalizedHex, oklch, oklchCss: formatOklchCss(oklch) };
}

/**
 * Derives a `ColorValue` from an OKLCH-authored slot (issue #132): `hex` is
 * the DERIVED field (gamut-clamped via culori's `clampChroma` before
 * conversion), while `oklch`/`oklchCss` carry the authored numbers verbatim
 * — rounded per the same convention as `convertHexToColor`, but never
 * re-derived from the resulting hex.
 */
export function convertOklchToColor(authored: Oklch): ColorValue {
  const oklch = roundOklch(authored.l, authored.c, authored.h);
  const hex = formatHex(toRgb(gamutClampOklch(oklch))).toLowerCase();

  return { hex, oklch, oklchCss: formatOklchCss(oklch) };
}

/**
 * Parses an `oklch(L C H)` CSS string (the form native sources may author —
 * issue #132) into an `Oklch` record. Bounds are validated at the Zod
 * boundary (`NativeOklchCssSchema`) before this ever runs; this function
 * assumes a well-formed match and throws only if called on a string that
 * skipped that validation.
 */
export function parseOklchCss(css: string): Oklch {
  const match = OKLCH_CSS_PATTERN.exec(css.trim());
  if (match === null) {
    throw new Error(`Unparseable oklch() string: ${css}`);
  }
  const [, lRaw, cRaw, hRaw] = match;
  return { l: Number(lRaw), c: Number(cRaw), h: Number(hRaw) };
}

/**
 * Resolves a native source's per-slot union value (issue #132) into a
 * `ColorValue` plus whether the slot was OKLCH-authored. Hex strings are
 * unchanged behavior; `oklch(...)` CSS strings and `{l, c, h}` objects are
 * both OKLCH-authored and go through `convertOklchToColor`.
 */
export function resolveNativeColor(value: NativeColorInput): {
  color: ColorValue;
  authored: boolean;
} {
  if (typeof value === 'object') {
    return { color: convertOklchToColor(value), authored: true };
  }
  if (value.trim().toLowerCase().startsWith('oklch(')) {
    return { color: convertOklchToColor(parseOklchCss(value)), authored: true };
  }
  return { color: convertHexToColor(value), authored: false };
}

export function roundTripDeltaE(hex: string): number {
  const original = parse(hex.toLowerCase());
  if (original === undefined) throw new Error(`Unparseable: ${hex}`);
  const ok = toOklch(original);
  const back = toRgb(ok);
  return differenceCiede2000()(original, back);
}

/**
 * Round-trip check for OKLCH-authored slots (issue #132) — direction is
 * inverted from `roundTripDeltaE`: authored oklch -> derived (gamut-clamped)
 * hex -> oklch, compared in OKLCH-derived Lab space via CIEDE2000 against the
 * authored color. Same ΔE < 1.0 threshold, unchanged.
 */
export function oklchRoundTripDeltaE(oklch: Oklch): number {
  const original = { mode: 'oklch' as const, l: oklch.l, c: oklch.c, h: oklch.h };
  const back = toOklch(toRgb(gamutClampOklch(oklch)));
  return differenceCiede2000()(original, back);
}

export function hexFromOklch(oklch: Oklch): string {
  const rgb = toRgb({ mode: 'oklch', l: oklch.l, c: oklch.c, h: oklch.h });
  return formatHex(rgb);
}
