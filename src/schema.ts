import { z } from 'zod';
import { COLOR_KEYS } from './types.js';

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

const colorsShape = Object.fromEntries(COLOR_KEYS.map((k) => [k, ColorValueSchema])) as Record<
  (typeof COLOR_KEYS)[number],
  typeof ColorValueSchema
>;

export const ColorsSchema = z.object(colorsShape);

export const TerminalColorThemeSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be kebab-case'),
  isDark: z.boolean(),
  tags: z.array(z.string()),
  source: z.literal('iterm2-color-schemes'),
  sourceUrl: z.string().url(),
  upstreamSha: z.string().regex(/^[a-f0-9]{7,40}$/),
  updatedAt: z.string().datetime(),
  colors: ColorsSchema,
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
  .passthrough();

export type UpstreamScheme = z.infer<typeof UpstreamSchemeSchema>;
