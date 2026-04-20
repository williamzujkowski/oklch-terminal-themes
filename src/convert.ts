import { parse, converter, formatHex, differenceCiede2000 } from 'culori';
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

export function convertHexToColor(hex: string): ColorValue {
  const normalizedHex = hex.toLowerCase();
  const parsed = parse(normalizedHex);
  if (parsed === undefined) {
    throw new Error(`Unparseable color: ${hex}`);
  }
  const ok = toOklch(parsed);

  const oklch: Oklch = {
    l: round(clamp(ok.l, 0, 1), 4),
    c: round(clamp(ok.c, 0, 0.5), 4),
    // culori returns h: undefined for achromatic colors; JSON must be finite.
    h: ok.h !== undefined && Number.isFinite(ok.h) ? round(ok.h, 1) : 0,
  };

  const cssL = round(oklch.l, 3);
  const cssC = round(oklch.c, 3);
  const cssH = round(oklch.h, 1);
  const oklchCss = `oklch(${cssL} ${cssC} ${cssH})`;

  return { hex: normalizedHex, oklch, oklchCss };
}

export function roundTripDeltaE(hex: string): number {
  const original = parse(hex.toLowerCase());
  if (original === undefined) throw new Error(`Unparseable: ${hex}`);
  const ok = toOklch(original);
  const back = toRgb(ok);
  return differenceCiede2000()(original, back);
}

export function hexFromOklch(oklch: Oklch): string {
  const rgb = toRgb({ mode: 'oklch', l: oklch.l, c: oklch.c, h: oklch.h });
  return formatHex(rgb);
}
