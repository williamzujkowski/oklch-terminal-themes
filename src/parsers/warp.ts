import { UpstreamSchemeSchema, type UpstreamScheme } from '../schema.js';

// Warp uses `magenta` where mbadolato uses `purple`.
const NORMAL_KEYS: Array<[string, keyof UpstreamScheme]> = [
  ['black', 'black'],
  ['red', 'red'],
  ['green', 'green'],
  ['yellow', 'yellow'],
  ['blue', 'blue'],
  ['magenta', 'purple'],
  ['cyan', 'cyan'],
  ['white', 'white'],
];

const BRIGHT_KEYS: Array<[string, keyof UpstreamScheme]> = [
  ['black', 'brightBlack'],
  ['red', 'brightRed'],
  ['green', 'brightGreen'],
  ['yellow', 'brightYellow'],
  ['blue', 'brightBlue'],
  ['magenta', 'brightPurple'],
  ['cyan', 'brightCyan'],
  ['white', 'brightWhite'],
];

const HEX = /^#?[0-9a-fA-F]{6}$/;

interface RawWarpYaml {
  background?: string;
  foreground?: string;
  accent?: string;
  terminal_colors?: { normal?: Record<string, string>; bright?: Record<string, string> };
}

type Out = Partial<Record<keyof UpstreamScheme, string>>;

/**
 * Parses a warpdotdev/themes YAML file into the canonical mbadolato shape.
 *
 * Format:
 *   accent: "#bd93f9"
 *   background: "#282a36"
 *   foreground: "#f8f8f2"
 *   details: darker
 *   terminal_colors:
 *     normal:  { black: "...", red: "...", ... magenta: "...", ... }
 *     bright:  { black: "...", ... }
 *
 * Theme name comes from the filename — Warp's own picker derives it the same
 * way. `accent` becomes `cursorColor`; `selection-background` isn't part of
 * the warp schema, so we fall back to the background.
 */
export function parseWarpYaml(content: string, nameFromFilename: string): UpstreamScheme {
  const yaml = parseSimpleYaml(content);
  const out: Out = { name: nameFromFilename };
  applyTopLevel(out, yaml);
  applyAnsi(out, yaml.terminal_colors?.normal ?? {}, NORMAL_KEYS);
  applyAnsi(out, yaml.terminal_colors?.bright ?? {}, BRIGHT_KEYS);
  return UpstreamSchemeSchema.parse(out);
}

function applyTopLevel(out: Out, yaml: RawWarpYaml): void {
  if (typeof yaml.background === 'string' && HEX.test(yaml.background)) {
    out.background = normaliseHex(yaml.background);
  }
  if (typeof yaml.foreground === 'string' && HEX.test(yaml.foreground)) {
    out.foreground = normaliseHex(yaml.foreground);
  }
  if (typeof yaml.accent === 'string' && HEX.test(yaml.accent)) {
    out.cursorColor = normaliseHex(yaml.accent);
  } else if (out.foreground !== undefined) {
    out.cursorColor = out.foreground;
  }
  if (out.background !== undefined) {
    out.selectionBackground = out.background;
  }
}

function applyAnsi(
  out: Out,
  src: Record<string, string>,
  mapping: Array<[string, keyof UpstreamScheme]>,
): void {
  for (const [warpKey, mbKey] of mapping) {
    const v = src[warpKey];
    if (typeof v === 'string' && HEX.test(v)) out[mbKey] = normaliseHex(v);
  }
}

type Section = 'top' | 'terminal_colors' | 'normal' | 'bright';

interface YamlState {
  result: RawWarpYaml;
  section: Section;
}

/**
 * Hand-rolled YAML reader scoped to the warp theme dialect: top-level
 * `key: "value"` (or unquoted), and a two-level nested section
 * (`terminal_colors.normal.*` / `terminal_colors.bright.*`). Indentation is
 * two spaces per level. Comments start with `#`.
 *
 * Adding a YAML lib for this would pull a transitive dep that we'd then need
 * to track for security advisories — the format is small enough to parse
 * in-tree.
 */
function parseSimpleYaml(src: string): RawWarpYaml {
  const state: YamlState = { result: {}, section: 'top' };
  for (const rawLine of src.split('\n')) {
    const line = stripComments(rawLine);
    if (line.trim().length === 0) continue;
    const indent = line.length - line.trimStart().length;
    const stripped = line.trim();
    if (indent === 0) handleIndent0(state, stripped);
    else if (indent === 2) handleIndent2(state, stripped);
    else if (indent === 4) handleIndent4(state, stripped);
  }
  return state.result;
}

function stripComments(line: string): string {
  return line.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
}

const TOP_KEY = /^([a-z_]+)\s*:\s*(.*)$/;
const PAIR = /^([a-z]+)\s*:\s*(.+)$/;

function handleIndent0(state: YamlState, stripped: string): void {
  if (stripped === 'terminal_colors:') {
    state.result.terminal_colors = {};
    state.section = 'terminal_colors';
    return;
  }
  state.section = 'top';
  const m = TOP_KEY.exec(stripped);
  if (m === null) return;
  const [, key, rawVal] = m;
  const val = unquote(rawVal ?? '');
  if (key === 'background' || key === 'foreground' || key === 'accent') {
    state.result[key] = val;
  }
}

function handleIndent2(state: YamlState, stripped: string): void {
  // normal: / bright: can appear in either order; allow transitions between
  // them. We don't care if a transition is from terminal_colors directly or
  // from the prior sibling block.
  const inSubsection =
    state.section === 'terminal_colors' || state.section === 'normal' || state.section === 'bright';
  if (!inSubsection) return;
  const tc = state.result.terminal_colors;
  if (tc === undefined) return;
  if (stripped === 'normal:') {
    tc.normal = {};
    state.section = 'normal';
  } else if (stripped === 'bright:') {
    tc.bright = {};
    state.section = 'bright';
  }
}

function handleIndent4(state: YamlState, stripped: string): void {
  if (state.section !== 'normal' && state.section !== 'bright') return;
  const tc = state.result.terminal_colors;
  const target = state.section === 'normal' ? tc?.normal : tc?.bright;
  if (target === undefined) return;
  const m = PAIR.exec(stripped);
  if (m === null) return;
  const [, key, rawVal] = m;
  if (key === undefined) return;
  target[key] = unquote(rawVal ?? '');
}

function normaliseHex(hex: string): string {
  return hex.startsWith('#') ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
}

function unquote(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
