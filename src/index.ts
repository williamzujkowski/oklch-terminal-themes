export type {
  Oklch,
  ColorValue,
  ColorKey,
  Colors,
  Contrast,
  TerminalColorTheme,
  SlimTheme,
  ThemeIndexEntry,
  ThemeIndex,
} from './types.js';
export { COLOR_KEYS } from './types.js';
export { convertHexToColor, roundTripDeltaE, hexFromOklch, round } from './convert.js';
export { classifyTheme, wcagContrast } from './classify.js';
export { toSlug } from './slug.js';
export {
  HexSchema,
  OklchSchema,
  ColorValueSchema,
  ColorsSchema,
  ContrastSchema,
  TerminalColorThemeSchema,
  UpstreamSchemeSchema,
} from './schema.js';

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
