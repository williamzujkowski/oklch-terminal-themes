import { z } from 'zod';
import { COLOR_KEYS, ACCENT_SLOT_KEYS } from '../../../src/types.js';
import type { ColorKey } from '../../../src/types.js';

const CSS = /^oklch\(\s*(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s*\)$/i;
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const ratio = z.number().min(1).max(21);
const css = z.string().refine((value) => {
  const match = CSS.exec(value.trim());
  if (!match) return false;
  const [, l, c, h] = match;
  return (
    Number.isFinite(Number(l)) &&
    Number(l) >= 0 &&
    Number(l) <= 1 &&
    Number.isFinite(Number(c)) &&
    Number(c) >= 0 &&
    Number(c) <= 0.5 &&
    Number.isFinite(Number(h)) &&
    Number(h) >= 0 &&
    Number(h) <= 360
  );
}, 'Expected complete finite oklch(L C H) with canonical component bounds');
function colorRecord(input: Partial<Record<ColorKey, string | undefined>>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    const color = input[key];
    if (color !== undefined) result[key] = color;
  }
  return result;
}
const colors = z
  .partialRecord(z.enum(COLOR_KEYS), css)
  .transform(colorRecord)
  .refine(
    (value) => value.background !== undefined && value.foreground !== undefined,
    'Preview colors require background and foreground',
  );

/** Site-only legacy projection, including minimal offline fixture records. */
const preview = z
  .object({
    name: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[\p{L}\p{N}\p{M} ._+()'#&/:!,-]+$/u),
    slug,
    isDark: z.boolean(),
    colors,
    tags: z
      .array(
        z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      )
      .max(64)
      .optional(),
    counterpart: slug.optional(),
    contrast: z
      .object({
        fgOnBg: ratio,
        minAnsi: ratio.optional(),
        minAnsiSlot: z.enum(COLOR_KEYS).optional(),
        cursorOnBg: ratio.optional(),
        selectionContrast: ratio.optional(),
        brightnessOrdered: z.boolean().optional(),
        brightnessViolations: z.array(z.enum(COLOR_KEYS)).max(8).optional(),
      })
      .strict()
      .optional(),
    dataviz: z
      .object({ categorical: z.array(css).max(8) })
      .strict()
      .optional(),
    // Older preview fixtures carry a sortable scalar; current data may carry
    // supplemental APCA. Preserve either declared shape without inventing it.
    apca: z
      .union([
        z.number(),
        z
          .object({
            fgOnBg: z.number(),
            minAnsi: z.number().optional(),
            minAnsiSlot: z.enum(COLOR_KEYS).optional(),
          })
          .strict(),
      ])
      .optional(),
    accent: z
      .object({ source: z.enum(ACCENT_SLOT_KEYS), oklchCss: css })
      .strict()
      .optional(),
  })
  .strict();

export function parsePreviewThemes(input: unknown) {
  return z.array(preview).parse(input);
}
