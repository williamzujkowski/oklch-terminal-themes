export type {
  Oklch,
  ColorValue,
  ColorKey,
  Colors,
  Contrast,
  Accent,
  AccentSlim,
  AccentSlotKey,
  Dataviz,
  DatavizSlim,
  Cvd,
  Apca,
  TerminalColorTheme,
  SlimTheme,
  ThemeIndexEntry,
  ThemeIndex,
} from './types.js';
export { COLOR_KEYS, ACCENT_SLOT_KEYS } from './types.js';
export { convertHexToColor, roundTripDeltaE, hexFromOklch, round } from './convert.js';
export { classifyTheme, wcagContrast } from './classify.js';
export { toSlug } from './slug.js';
// Note: `src/accent.ts`, `src/dataviz.ts`, `src/cvd.ts`, and `src/apca.ts`
// (like `src/counterpart.ts`) are build/validate/test tooling, not part of
// the public package API — imported directly by `scripts/build.ts`,
// `scripts/validate.ts`, and tests, not re-exported here.
export {
  HexSchema,
  OklchSchema,
  ColorValueSchema,
  ColorsSchema,
  ContrastSchema,
  AccentSchema,
  DatavizSchema,
  CvdSchema,
  ApcaSchema,
  TerminalColorThemeSchema,
  UpstreamSchemeSchema,
} from './schema.js';
export { SourceConfigSchema, SourcesConfigSchema } from './sources.js';
export type { SourceConfig, SourcesConfig } from './sources.js';

export function themeToCssVars(theme: {
  slug: string;
  colors: Record<string, { oklchCss: string } | string>;
}): string {
  const kebab = (k: string): string => k.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return Object.entries(theme.colors)
    .map(([k, v]) => {
      const css = typeof v === 'string' ? v : v.oklchCss;
      return `--terminal-${kebab(k)}: ${css};`;
    })
    .join('\n');
}
