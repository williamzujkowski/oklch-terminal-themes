import { SOURCE_ROLES, rawRoleColors, sourceRoleStyle, type SpecimenRole } from './specimen-roles';
import { escapeCssComment, toKebabCase } from './formatters';

export type Recipe = 'raw' | 'ui-v1';
export interface RoleMapping {
  foreground: string;
  background: string;
  slots: readonly string[];
  origin: 'original' | 'derived';
  transformation: string;
}
export type RoleMappings = Record<SpecimenRole, RoleMapping>;

const mix = (slot: string, percent: number): string =>
  `color-mix(in srgb, var(--tt-${slot}) ${percent}%, var(--tt-background))`;
const UI_CHANGES: Partial<Record<SpecimenRole, Omit<RoleMapping, 'origin'>>> = {
  comment: {
    foreground: mix('foreground', 65),
    background: 'var(--tt-background)',
    slots: ['foreground', 'background'],
    transformation: 'Foreground 65% + background 35%, in sRGB',
  },
  muted: {
    foreground: mix('foreground', 65),
    background: 'var(--tt-background)',
    slots: ['foreground', 'background'],
    transformation: 'Foreground 65% + background 35%, in sRGB',
  },
  gutter: {
    foreground: mix('foreground', 65),
    background: 'var(--tt-background)',
    slots: ['foreground', 'background'],
    transformation: 'Foreground 65% + background 35%, in sRGB',
  },
  'code-surface': {
    foreground: 'var(--tt-foreground)',
    background: mix('foreground', 6),
    slots: ['foreground', 'background'],
    transformation: 'Foreground 6% + background 94% backing, in sRGB',
  },
  'current-line': {
    foreground: 'var(--tt-foreground)',
    background: mix('foreground', 8),
    slots: ['foreground', 'background'],
    transformation: 'Foreground 8% + background 92% backing, in sRGB',
  },
  border: {
    foreground: mix('foreground', 30),
    background: 'var(--tt-background)',
    slots: ['foreground', 'background'],
    transformation: 'Foreground 30% + background 70%, in sRGB',
  },
  selection: {
    foreground: 'var(--tt-foreground)',
    background: mix('blue', 25),
    slots: ['foreground', 'blue', 'background'],
    transformation: 'Blue 25% + background 75% backing; regular foreground, in sRGB',
  },
};

export function createRoleMappings(recipe: Recipe): RoleMappings {
  return Object.fromEntries(
    (Object.keys(SOURCE_ROLES) as SpecimenRole[]).map((role) => [
      role,
      {
        ...rawRoleColors(role),
        slots: SOURCE_ROLES[role],
        origin: role === 'dim' ? 'derived' : 'original',
        transformation:
          role === 'dim'
            ? 'Foreground at 55% alpha on the declared backing'
            : 'Source slots unchanged',
        ...(recipe === 'ui-v1' && UI_CHANGES[role]
          ? { ...UI_CHANGES[role], origin: 'derived' }
          : {}),
      },
    ]),
    // Keys originate exclusively from the trusted complete SOURCE_ROLES registry.
  ) as unknown as RoleMappings;
}

export function applyRoleMappings(root: HTMLElement, recipe: Recipe): void {
  for (const [role, mapping] of Object.entries(createRoleMappings(recipe))) {
    root.style.setProperty(`--role-${role}-fg`, mapping.foreground);
    root.style.setProperty(`--role-${role}-bg`, mapping.background);
  }
  root.dataset.recipe = recipe;
}

interface RecipeSource {
  name: string;
  slug: string;
  source: string;
  sourceUrl: string;
  upstreamSha: string;
  colors: Record<string, { oklchCss: string }>;
}

export function formatRecipeCss(theme: RecipeSource, recipe: Recipe): string {
  const header = escapeCssComment(
    `${theme.name} (${theme.slug}) · ${recipe}\nSource: ${theme.source}@${theme.upstreamSha}\n${theme.sourceUrl}`,
  );
  const tokens = Object.entries(theme.colors).map(
    ([key, color]) => `  --tt-${toKebabCase(key)}: ${color.oklchCss};`,
  );
  const recipeMappings = createRoleMappings(recipe);
  const mappings = (Object.keys(SOURCE_ROLES) as SpecimenRole[]).map(
    (role) => [role, recipeMappings[role]] as const,
  );
  const variables = mappings.flatMap(([role, map]) => [
    `  --role-${role}-fg: ${map.foreground};`,
    `  --role-${role}-bg: ${map.background};`,
  ]);
  const rules = mappings.map(
    ([role, map]) =>
      `/* ${role}: ${map.slots.join(' / ')}; ${map.transformation} */\n[data-role="${role}"] { ${sourceRoleStyle(role)} }`,
  );
  rules.push(
    '[data-preview-surface] ::selection { color: var(--role-selection-fg); background-color: var(--role-selection-bg); }',
    '[data-role="border"] { border: 1px solid var(--role-border-fg); }',
    '[data-role="primary"] { border: 1px solid var(--role-primary-fg); }',
    '[data-preview-surface] :focus-visible { outline: 2px solid var(--role-focus-fg); outline-offset: 3px; }',
  );
  return `/* ${header}\nOriginal ANSI and generated chart colors are retained.\nCSS expressions below are identical to the preview recipe. */\n:root {\n${[...tokens, ...variables].join('\n')}\n}\n${rules.join('\n')}\n`;
}
