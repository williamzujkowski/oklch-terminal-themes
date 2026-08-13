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
export { classifyTheme, wcagContrast, WCAG_THRESHOLDS } from './classify.js';
export { toSlug } from './slug.js';
export { escapeCssComment } from './css-export.js';
// Note: `src/accent.ts`, `src/dataviz.ts`, and `src/counterpart.ts` are
// build/validate/test tooling, not part of the public package API — imported
// directly by `scripts/build.ts`, `scripts/validate.ts`, and tests, not
// re-exported here.
//
// `src/cvd.ts` and `src/apca.ts` are NOT in that category despite not being
// re-exported: `classifyTheme` (exported above) imports both via
// `src/classify.ts`, so `culori` and `apca-w3` are genuine runtime
// dependencies of the published entrypoint and cannot move to
// devDependencies. See #169.
export {
  HexSchema,
  ThemeNameSchema,
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

/**
 * camelCase colour key -> kebab-case CSS custom-property fragment
 * (`brightRed` -> `bright-red`).
 *
 * Exported because the same transform is needed anywhere a `ColorKey` becomes
 * a CSS variable name, and it was previously copy-pasted in four places
 * (here, `site/src/lib/formatters.ts`, and two Astro components) as the
 * identical regex — four copies that had to stay in sync by hand (#229).
 */
export function toKebabCase(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function themeToCssVars(theme: {
  slug: string;
  colors: Record<string, { oklchCss: string } | string>;
}): string {
  return Object.entries(theme.colors)
    .map(([k, v]) => {
      const css = typeof v === 'string' ? v : v.oklchCss;
      return `--terminal-${toKebabCase(k)}: ${css};`;
    })
    .join('\n');
}
