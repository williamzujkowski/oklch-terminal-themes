import { createRoleMappings, type Recipe, type RoleMapping } from './application-roles';
import { ANSI_PAIRS, SOURCE_ROLES, type SpecimenRole } from './specimen-roles';
import { canonicalContrast } from './theme-summary';
import { toKebabCase } from './formatters';
import type { ThemeDetailsRecord } from './theme-details';

const ANSI_SLOTS = ANSI_PAIRS.flatMap((pair) => [...pair]);
export const INSPECTOR_ROLES: readonly string[] = [
  ...Object.keys(SOURCE_ROLES),
  'cursor-surface',
  ...ANSI_SLOTS.map((slot) => `ansi-${slot}`),
  'chart-series',
];

export const ROLE_LABELS: Record<string, string> = {
  body: 'Body text',
  comment: 'Comment text',
  muted: 'Muted text',
  primary: 'Primary button text',
  'primary-surface': 'Primary button surface',
  cursor: 'Cursor text',
  'cursor-surface': 'Cursor surface',
  focus: 'Focus indicator',
  border: 'Border',
  'chart-series': 'Chart series',
  selection: 'Selected text',
};

export interface RoleDescription {
  mapping: RoleMapping | null;
  canonical: { label: string; foreground: string; background: string; ratio: number } | null;
  reason?: string;
}

function sourceRole(role: string): role is SpecimenRole {
  return Object.hasOwn(SOURCE_ROLES, role);
}

function canonicalPair(theme: ThemeDetailsRecord, foreground: string, background: string) {
  const colors = Object.entries(theme.colors);
  const fg = colors.find(([slot]) => slot === foreground)?.[1];
  const bg = colors.find(([slot]) => slot === background)?.[1];
  if (!fg || !bg) return null;
  return {
    label: `Canonical palette · sRGB · ${foreground} / ${background}`,
    foreground: fg.hex,
    background: bg.hex,
    ratio: canonicalContrast(fg.hex, bg.hex),
  };
}

function chartDescription(theme: ThemeDetailsRecord, index: number | undefined): RoleDescription {
  const chart = theme.dataviz;
  const color = index === undefined ? undefined : chart?.categorical[index];
  if (!color || index === undefined || !Number.isInteger(index) || index < 0) {
    return {
      mapping: null,
      canonical: null,
      reason: 'Chart series origin unavailable: no valid displayed categorical index.',
    };
  }
  const synthesized = index >= chart!.categorical.length - (chart!.categoricalSynthesized ?? 0);
  return {
    mapping: {
      foreground: color.oklchCss,
      background: 'var(--tt-background)',
      slots: [`categorical[${index}]`, 'background'],
      origin: synthesized ? 'derived' : 'original',
      transformation: synthesized
        ? 'Generated trailing categorical entry (categoricalSynthesized metadata)'
        : 'Complete source-slot copy in the generated categorical palette',
    },
    canonical: {
      label: `Canonical chart · sRGB · categorical[${index}] / background`,
      foreground: color.hex,
      background: theme.colors.background.hex,
      ratio: canonicalContrast(color.hex, theme.colors.background.hex),
    },
  };
}

export function describeRole(
  theme: ThemeDetailsRecord,
  role: string,
  recipe: Recipe,
  seriesIndex?: number,
): RoleDescription {
  if (role === 'chart-series') return chartDescription(theme, seriesIndex);
  if (role === 'cursor-surface')
    return {
      mapping: {
        foreground: 'var(--tt-cursor)',
        background: 'var(--tt-background)',
        slots: ['cursor', 'background'],
        origin: 'original',
        transformation: 'Cursor backing versus its actual parent surface',
      },
      canonical: canonicalPair(theme, 'cursor', 'background'),
    };
  if (sourceRole(role)) {
    const [fg, bg] = SOURCE_ROLES[role];
    return { mapping: createRoleMappings(recipe)[role], canonical: canonicalPair(theme, fg, bg) };
  }
  const slot = ANSI_SLOTS.find((key) => `ansi-${key}` === role);
  return slot === undefined
    ? { mapping: null, canonical: null, reason: 'Unknown role.' }
    : {
        mapping: {
          foreground: `var(--tt-${toKebabCase(slot)})`,
          background: 'var(--tt-background)',
          slots: [slot, 'background'],
          origin: 'original',
          transformation: 'Original ANSI slot; unchanged by application recipes',
        },
        canonical: canonicalPair(theme, slot, 'background'),
      };
}

function activeSpecimen(element: HTMLElement, root: HTMLElement, view: string): boolean {
  const specimen = element.closest<HTMLElement>('[data-specimen]');
  if (!specimen || (view !== 'all' && specimen.dataset.specimen !== view)) return false;
  let node: HTMLElement | null = element;
  while (node && node !== root) {
    if (node.hidden) return false;
    node = node.parentElement;
  }
  return true;
}

/** Hidden mobile panes still have auditable colors; hidden specimens/scenarios do not. */
export function findRoleElement(root: HTMLElement, role: string, view: string): HTMLElement | null {
  const alias =
    role === 'cursor-surface' ? 'cursor' : role === 'primary-surface' ? 'primary' : role;
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('[data-role], [data-preview-surface]'),
  );
  return (
    candidates.find((node) => {
      const matches =
        node.dataset.role === role ||
        node.dataset.role === alias ||
        (role === 'body' && node.hasAttribute('data-preview-surface'));
      return (
        matches &&
        node.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
        activeSpecimen(node, root, view)
      );
    }) ?? null
  );
}

/** WCAG large text is 24px normal, or 14pt (18.666…px) at bold weight. */
export function roleThreshold(role: string, fontSize: number, fontWeight: number): number {
  if (['cursor-surface', 'primary-surface', 'focus', 'border', 'chart-series'].includes(role))
    return 3;
  return fontSize >= 24 || (fontSize >= (14 * 96) / 72 && fontWeight >= 700) ? 3 : 4.5;
}
