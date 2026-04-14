export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export interface ColorValue {
  hex: string;
  oklch: Oklch;
  oklchCss: string;
}

export const COLOR_KEYS = [
  'background',
  'foreground',
  'cursor',
  'selection',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'purple',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightPurple',
  'brightCyan',
  'brightWhite',
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

export type Colors = Record<ColorKey, ColorValue>;

export interface TerminalColorTheme {
  name: string;
  slug: string;
  isDark: boolean;
  tags: string[];
  source: 'iterm2-color-schemes';
  sourceUrl: string;
  upstreamSha: string;
  updatedAt: string;
  colors: Colors;
}

export interface SlimTheme {
  name: string;
  slug: string;
  isDark: boolean;
  colors: Record<ColorKey, string>;
}

export interface ThemeIndexEntry {
  name: string;
  slug: string;
  isDark: boolean;
  tags: string[];
}

export interface ThemeIndex {
  generatedAt: string;
  upstreamSha: string;
  count: number;
  themes: ThemeIndexEntry[];
}
