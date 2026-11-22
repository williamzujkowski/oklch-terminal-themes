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
} as const;
export type SpecimenRole = keyof typeof SOURCE_ROLES;

export function sourceRoleStyle(role: SpecimenRole): string {
  const [fg, bg] = SOURCE_ROLES[role];
  const foreground =
    role === 'dim'
      ? 'color-mix(in srgb, var(--tt-foreground) 55%, transparent)'
      : `var(--tt-${toKebabCase(fg)})`;
  return `color: var(--role-${role}-fg, ${foreground}); background-color: var(--role-${role}-bg, var(--tt-${toKebabCase(bg)}));`;
}
