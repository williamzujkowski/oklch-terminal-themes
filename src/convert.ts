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
 * ΔE2000 between a published `hex` and the `oklch` / `oklchCss` values stored
 * alongside it (issue #200).
 *
 * `roundTripDeltaE` above converts hex -> oklch -> rgb entirely in floats and
 * never reads what was actually written to disk, so it measures IEEE-754
 * error: sampled across real hexes it returns 6e-14, 1.4e-14, 0.0. It cannot
 * fail, which makes the README's "round-trip ΔE2000 < 1.0 gate" an unearned
 * claim.
 *
 * The values genuinely at risk are the ROUNDED ones — `roundOklch` stores 4
 * decimal places and `oklchCss` renders 3 — because rounding is the only step
 * in the pipeline that discards information a consumer then relies on. For
 * `#1a1b26` the stored `oklch` costs ΔE 0.0087 and `oklchCss` costs 0.1136:
 * both comfortably inside the threshold, but real numbers rather than
 * floating-point noise.
 *
 * Returns both so a failure names which representation drifted.
 */
export function publishedConsistencyDeltaE(color: {
  hex: string;
  oklch: Oklch;
  oklchCss: string;
}): { oklch: number; oklchCss: number } {
  const source = parse(color.hex.toLowerCase());
  if (source === undefined) throw new Error(`Unparseable: ${color.hex}`);
  const diff = differenceCiede2000();
  const stored = { mode: 'oklch' as const, l: color.oklch.l, c: color.oklch.c, h: color.oklch.h };
  const fromCss = parseOklchCss(color.oklchCss);
  return {
    oklch: diff(source, stored),
    oklchCss: diff(source, { mode: 'oklch' as const, l: fromCss.l, c: fromCss.c, h: fromCss.h }),
  };
}

/**
 * Round-trip check for OKLCH-authored slots (issue #132) — direction is
 * inverted from `roundTripDeltaE`: authored oklch -> derived (gamut-clamped)
 * hex -> oklch, compared in OKLCH-derived Lab space via CIEDE2000 against the
 * authored color. Same ΔE < 1.0 threshold, unchanged.
 *
 * Goes through `parse(formatHex(...))` rather than staying in float RGB
 * (issue #204). The published field is an 8-bit `hex`, so a check that skips
 * quantization measures a value nobody ever receives: it reported a corpus
 * max of 0.0167 while the real distance between the stored `oklch` and the
 * stored `hex` peaked at 0.9253 — roughly 55x less headroom than advertised
 * against the 1.0 threshold. Nothing breaches it today, but the gate was
 * reporting the wrong order of magnitude.
 */
export function oklchRoundTripDeltaE(oklch: Oklch): number {
  const original = { mode: 'oklch' as const, l: oklch.l, c: oklch.c, h: oklch.h };
  const quantized = parse(formatHex(toRgb(gamutClampOklch(oklch))));
  if (quantized === undefined) throw new Error('Unparseable round-trip hex');
  return differenceCiede2000()(original, toOklch(quantized));
}

export function hexFromOklch(oklch: Oklch): string {
  const rgb = toRgb({ mode: 'oklch', l: oklch.l, c: oklch.c, h: oklch.h });
  return formatHex(rgb);
}
