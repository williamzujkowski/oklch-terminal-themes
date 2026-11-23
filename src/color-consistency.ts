import { differenceCiede2000 } from 'culori';
import { convertOklchToColor, parseOklchCss } from './convert.js';
import { ColorValueSchema, NativeOklchCssSchema } from './schema.js';
import type { ColorValue, Oklch } from './types.js';

/** Internal validation boundary; no new public schema or package export. */
export interface ColorFinding {
  path: string;
  message: string;
  deltaE?: number;
}
export type ColorOrigin = 'hex' | 'authored' | 'derived';
export interface ColorInspection {
  findings: ColorFinding[];
  maxDeltaE: number;
}

export function withinColorLoss(distance: number, threshold = 1): boolean {
  return Number.isFinite(distance) && distance < threshold;
}

function numericColor(color: Oklch): { mode: 'oklch'; l: number; c: number; h: number } {
  return { mode: 'oklch', ...color };
}

function distances(color: ColorValue, origin: ColorOrigin): [string, number][] {
  const hex = color.hex;
  const numeric = numericColor(color.oklch);
  const css = numericColor(parseOklchCss(color.oklchCss));
  const diff = differenceCiede2000();
  return origin === 'hex'
    ? [
        ['oklch', diff(hex, numeric)],
        ['oklchCss', diff(hex, css)],
      ]
    : [
        ['hex', diff(numeric, hex)],
        ['oklchCss', diff(numeric, css)],
      ];
}

function representationErrors(
  color: ColorValue,
  origin: ColorOrigin,
  path: string,
): ColorFinding[] {
  const expected = convertOklchToColor(color.oklch);
  const findings: ColorFinding[] = [];
  for (const key of ['l', 'c', 'h'] as const) {
    if (color.oklch[key] !== expected.oklch[key]) {
      findings.push({
        path: `${path}.oklch.${key}`,
        message: 'Exceeds published numeric OKLCH precision (4/4/1)',
      });
    }
  }
  if (origin !== 'hex' && color.hex !== expected.hex) {
    findings.push({
      path: `${path}.hex`,
      message: 'Does not match quantized gamut-mapped OKLCH fallback',
    });
  }
  if (color.oklchCss !== expected.oklchCss) {
    findings.push({
      path: `${path}.oklchCss`,
      message: 'Does not match numeric OKLCH at published CSS precision (3/3/1)',
    });
  }
  return findings;
}

export function inspectColorConsistency(
  color: ColorValue,
  origin: ColorOrigin,
  path: string,
  threshold = 1,
): ColorInspection {
  const parsed = ColorValueSchema.safeParse(color);
  if (!parsed.success) {
    return {
      findings: parsed.error.issues.map((i) => ({
        path: `${path}.${i.path.join('.')}`,
        message: i.message,
      })),
      maxDeltaE: 0,
    };
  }
  const css = NativeOklchCssSchema.safeParse(color.oklchCss);
  if (!css.success) {
    return {
      findings: [
        {
          path: `${path}.oklchCss`,
          message: 'Invalid complete oklch(L C H) syntax or component bounds',
        },
      ],
      maxDeltaE: 0,
    };
  }
  const measured = distances(color, origin);
  const findings = representationErrors(color, origin, path);
  for (const [field, deltaE] of measured) {
    if (!withinColorLoss(deltaE, threshold)) {
      findings.push({
        path: `${path}.${field}`,
        message: `ΔE2000=${deltaE.toFixed(4)} must be < ${threshold}`,
        deltaE,
      });
    }
  }
  return { findings, maxDeltaE: Math.max(...measured.map(([, d]) => d)) };
}

export function findColorFindings(
  color: ColorValue,
  origin: ColorOrigin,
  path: string,
  threshold = 1,
): ColorFinding[] {
  return inspectColorConsistency(color, origin, path, threshold).findings;
}
