import { resolveRoleContrast, type ResolvedContrast } from './resolved-colors';
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
  canonical: {
    label: string;
    foreground: string;
    background: string;
    foregroundOklch: string;
    backgroundOklch: string;
    ratio: number;
  } | null;
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
    foregroundOklch: fg.oklchCss,
    backgroundOklch: bg.oklchCss,
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
      foregroundOklch: color.oklchCss,
      backgroundOklch: theme.colors.background.oklchCss,
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
  const focused = role === 'focus' ? focusedRole(root, view) : null;
  if (focused) return focused;
  const alias =
    role === 'cursor-surface' ? 'cursor' : role === 'primary-surface' ? 'primary' : role;
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('[data-role], [data-preview-surface]'),
  );
  if (role === 'chart-series') {
    const selected = root.querySelector<HTMLElement>('[data-select-series][aria-pressed="true"]')
      ?.dataset.selectSeries;
    candidates.sort(
      (a, b) =>
        Number(b.dataset.seriesIndex === selected) - Number(a.dataset.seriesIndex === selected),
    );
  }
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

export interface RoleMeasurement {
  element: HTMLElement | null;
  description: RoleDescription;
  resolved: ResolvedContrast;
  effective: { foreground: EffectiveColor; background: EffectiveColor } | null;
}
interface EffectiveColor {
  hex: string;
  oklch: string | null;
}

function unavailable(reason: string): ResolvedContrast {
  return { status: 'unavailable', scope: 'Preview · resolved CSS in sRGB', reason };
}

function propertyColor(element: HTMLElement, role: string): string | null {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  if (role === 'border') {
    return Number.parseFloat(style.borderTopWidth) > 0 &&
      !['none', 'hidden'].includes(style.borderTopStyle)
      ? style.borderTopColor
      : null;
  }
  if (role === 'focus') {
    return Number.parseFloat(style.outlineWidth) > 0 &&
      !['none', 'hidden', 'auto'].includes(style.outlineStyle)
      ? style.outlineColor
      : null;
  }
  return role === 'chart-series' ? style.color : style.backgroundColor;
}

function propertyRejection(element: HTMLElement): string | null {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  if (Number(style.opacity || '1') !== 1) return 'Group opacity is unsupported';
  for (const key of ['filter', 'backdrop-filter', 'mix-blend-mode', 'background-blend-mode']) {
    const value = style.getPropertyValue(key);
    if (value && value !== 'none' && value !== 'normal') return `${key} is unsupported`;
  }
  if (style.backgroundImage && style.backgroundImage !== 'none')
    return 'Background images and gradients are unsupported';
  return null;
}

function resolveProperty(element: HTMLElement, role: string): ResolvedContrast {
  const parent = ['border', 'chart-series'].includes(role) ? element : element.parentElement;
  const rejection = propertyRejection(element);
  if (rejection) return unavailable(rejection);
  const color = propertyColor(element, role);
  if (!parent || !color)
    return unavailable('No declared visible border/focus property in this state.');
  const probe = element.ownerDocument.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;inline-size:1px;block-size:1px';
  probe.style.setProperty('color', color, 'important');
  probe.style.setProperty('background-color', 'transparent', 'important');
  parent.appendChild(probe);
  try {
    return resolveRoleContrast(probe, 3);
  } finally {
    probe.remove();
  }
}

function resolveElement(element: HTMLElement, role: string): ResolvedContrast {
  if (['cursor-surface', 'primary-surface', 'border', 'focus', 'chart-series'].includes(role)) {
    return resolveProperty(element, role);
  }
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  const weight = style.fontWeight === 'bold' ? 700 : Number(style.fontWeight) || 400;
  return resolveRoleContrast(
    element,
    roleThreshold(role, Number.parseFloat(style.fontSize), weight),
  );
}

function sampleHex(sample: readonly number[]): string {
  return `#${sample.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

async function effectiveColors(resolved: ResolvedContrast): Promise<RoleMeasurement['effective']> {
  if (resolved.status !== 'available') return null;
  const hexes = [sampleHex(resolved.foreground), sampleHex(resolved.background)];
  let strings: (string | null)[];
  try {
    const { converter } = await import('culori');
    const convert = converter('oklch');
    strings = hexes.map((hex) => {
      const color = convert(hex);
      if (!color) return null;
      const hue = color.c < 1e-7 || color.h === undefined ? 'none' : color.h.toFixed(1);
      return `oklch(${color.l.toFixed(4)} ${color.c.toFixed(4)} ${hue})`;
    });
  } catch {
    strings = [null, null];
  }
  return {
    foreground: { hex: hexes[0]!, oklch: strings[0] ?? null },
    background: { hex: hexes[1]!, oklch: strings[1] ?? null },
  };
}

/** Only actual computed role properties are resolved; canonical data stays separately labeled. */
export async function measureRole(
  root: HTMLElement,
  theme: ThemeDetailsRecord,
  role: string,
  recipe: Recipe,
  view: string,
): Promise<RoleMeasurement> {
  const element = findRoleElement(root, role, view);
  const rawIndex = element?.dataset.seriesIndex;
  const index = rawIndex !== undefined && /^\d+$/.test(rawIndex) ? Number(rawIndex) : undefined;
  const description = describeRole(theme, role, recipe, index);
  const resolved = element
    ? resolveElement(element, role)
    : unavailable(`No active HTML color sample for this role in the ${view} specimen.`);
  return { element, description, resolved, effective: await effectiveColors(resolved) };
}

function focusedRole(root: HTMLElement, view: string): HTMLElement | null {
  const active = root.ownerDocument.activeElement;
  return active instanceof HTMLElement &&
    root.contains(active) &&
    activeSpecimen(active, root, view) &&
    active.matches(':focus-visible')
    ? active
    : null;
}
