import { toKebabCase } from './formatters';

export const ANSI_PAIRS = [
  ['black', 'brightBlack'],
  ['red', 'brightRed'],
  ['green', 'brightGreen'],
  ['yellow', 'brightYellow'],
  ['blue', 'brightBlue'],
  ['purple', 'brightPurple'],
  ['cyan', 'brightCyan'],
  ['white', 'brightWhite'],
] as const;

/** Direct palette mappings; the same registry identifies inspector inputs. */
export const SOURCE_ROLES = {
  body: ['foreground', 'background'],
  comment: ['brightBlack', 'background'],
  error: ['red', 'background'],
  success: ['green', 'background'],
  warning: ['yellow', 'background'],
  link: ['blue', 'background'],
  gutter: ['brightBlack', 'background'],
  selection: ['foreground', 'selection'],
  cursor: ['background', 'cursor'],
  inverse: ['background', 'foreground'],
  dim: ['foreground', 'background'],
  focus: ['blue', 'background'],
  keyword: ['purple', 'background'],
  string: ['green', 'background'],
  type: ['cyan', 'background'],
  number: ['brightPurple', 'background'],
  punctuation: ['foreground', 'background'],
  search: ['background', 'yellow'],
  'current-line': ['foreground', 'background'],
  muted: ['brightBlack', 'background'],
  border: ['brightBlack', 'background'],
  primary: ['background', 'blue'],
  'primary-surface': ['blue', 'background'],
  'visited-link': ['purple', 'background'],
  'code-surface': ['foreground', 'background'],
} as const;
export type SpecimenRole = keyof typeof SOURCE_ROLES;

export function rawRoleColors(role: SpecimenRole): { foreground: string; background: string } {
  const [fg, bg] = SOURCE_ROLES[role];
  const foreground =
    role === 'dim'
      ? 'color-mix(in srgb, var(--tt-foreground) 55%, transparent)'
      : `var(--tt-${toKebabCase(fg)})`;
  return { foreground, background: `var(--tt-${toKebabCase(bg)})` };
}

export function sourceRoleStyle(role: SpecimenRole): string {
  const colors = rawRoleColors(role);
  return `color: var(--role-${role}-fg, ${colors.foreground}); background-color: var(--role-${role}-bg, ${colors.background});`;
}
