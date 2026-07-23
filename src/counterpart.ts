/**
 * Computes `counterpart` — the slug of a theme's canonical opposite-polarity
 * pair — at build time. See issue #128 for the seeding analysis this
 * implements.
 *
 * Approach:
 *  1. Strip a known set of light/dark-ish suffixes from each slug,
 *     iteratively (a slug may carry more than one, e.g.
 *     `everforest-light-med` -> `everforest-light` -> `everforest`), to
 *     derive a family "stem".
 *  2. Group theme slugs by stem. A stem with exactly one light and one dark
 *     member is an unambiguous pair — they point at each other symmetrically.
 *  3. Stems with more than one light and/or more than one dark member are
 *     ambiguous (which one is "the" counterpart?) and are left unpaired by
 *     the heuristic. A small curated map of manually-reviewed picks
 *     (`CURATED_COUNTERPART_OVERRIDES`) resolves the known ambiguous
 *     families and always takes precedence over the heuristic result.
 */

// Order doesn't matter for correctness (checked longest-first defensively so
// a shorter suffix can never shadow a longer one that also matches), but the
// grouping below documents the two heuristic generations from the issue:
// the original single-strip set, plus the extra suffixes that made the
// iterative multi-suffix variant find `everforest` (issue #128 comment).
const STEM_SUFFIXES = [
  '-dark',
  '-light',
  '-day',
  '-night',
  '-dawn',
  '-moon',
  '-latte',
  '-mocha',
  '-storm',
  '-med',
  '-hard',
  '-soft',
  '-frappe',
  '-macchiato',
  '-dim',
  '-darker',
  '-dimmed',
].sort((a, b) => b.length - a.length);

/**
 * Strips known light/dark-family suffixes from a slug, repeatedly, until no
 * further suffix matches. E.g. `everforest-light-med` -> `everforest`.
 */
export function stemOf(slug: string): string {
  let stem = slug;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of STEM_SUFFIXES) {
      if (stem.length > suffix.length && stem.endsWith(suffix)) {
        stem = stem.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return stem;
}

/**
 * Curated canonical-pair overrides for families where the stem heuristic
 * finds more than one light and/or more than one dark member, so it can't
 * pick a counterpart automatically. Picks reviewed and documented in the
 * seeding analysis on issue #128:
 * https://github.com/williamzujkowski/oklch-terminal-themes/issues/128
 *
 * Directional and NOT necessarily involutive by design — e.g. several
 * `tokyonight-*` darks point at `tokyonight-day`, but `tokyonight-day`
 * points back at only the canonical `tokyonight`.
 */
export const CURATED_COUNTERPART_OVERRIDES: Readonly<Record<string, string>> = {
  // catppuccin: latte (light) <-> mocha (upstream's flagship dark); the two
  // other darks also point at latte.
  'catppuccin-latte': 'catppuccin-mocha',
  'catppuccin-mocha': 'catppuccin-latte',
  'catppuccin-frappe': 'catppuccin-latte',
  'catppuccin-macchiato': 'catppuccin-latte',

  // github: bare (light) <-> github-dark; github-dark-dimmed also points at
  // the bare light.
  github: 'github-dark',
  'github-dark': 'github',
  'github-dark-dimmed': 'github',

  // gruvbox: contrast levels are matched pairwise (light <-> dark,
  // light-hard <-> dark-hard), not funneled to one canonical member.
  'gruvbox-light': 'gruvbox-dark',
  'gruvbox-dark': 'gruvbox-light',
  'gruvbox-light-hard': 'gruvbox-dark-hard',
  'gruvbox-dark-hard': 'gruvbox-light-hard',

  // gruvbox-material: explicit light/dark beat the bare (ambiguous-polarity
  // by name) variant, which is folded into the light side.
  'gruvbox-material-light': 'gruvbox-material-dark',
  'gruvbox-material-dark': 'gruvbox-material-light',
  'gruvbox-material': 'gruvbox-material-light',

  // material: bare (light) <-> material-dark; material-darker also points
  // at the bare light.
  material: 'material-dark',
  'material-dark': 'material',
  'material-darker': 'material',

  // rose-pine: dawn (light) <-> bare (dark); moon also points at dawn.
  'rose-pine-dawn': 'rose-pine',
  'rose-pine': 'rose-pine-dawn',
  'rose-pine-moon': 'rose-pine-dawn',

  // tokyonight: day (light) <-> bare (dark); moon/night/storm also point at
  // day.
  'tokyonight-day': 'tokyonight',
  tokyonight: 'tokyonight-day',
  'tokyonight-moon': 'tokyonight-day',
  'tokyonight-night': 'tokyonight-day',
  'tokyonight-storm': 'tokyonight-day',

  // zenbones: explicit light <-> dark; the polarity-ambiguous bare slug is
  // upstream's dark variant.
  'zenbones-light': 'zenbones-dark',
  'zenbones-dark': 'zenbones-light',
  zenbones: 'zenbones-dark',

  // claude: same shape as zenbones — explicit light <-> dark is the
  // canonical pair, and the polarity-ambiguous bare slug points at the dark.
  'claude-light': 'claude-dark',
  'claude-dark': 'claude-light',
  claude: 'claude-dark',
};

export interface CounterpartInput {
  slug: string;
  isDark: boolean;
  counterpart?: string;
}

/**
 * Computes the counterpart slug for every theme that has one: unambiguous
 * stem families pair automatically and symmetrically, then the curated
 * overrides are applied on top (and always win).
 */
export function computeCounterparts(themes: readonly CounterpartInput[]): Map<string, string> {
  const groups = new Map<string, { lights: string[]; darks: string[] }>();
  for (const theme of themes) {
    const stem = stemOf(theme.slug);
    let group = groups.get(stem);
    if (group === undefined) {
      group = { lights: [], darks: [] };
      groups.set(stem, group);
    }
    (theme.isDark ? group.darks : group.lights).push(theme.slug);
  }

  const result = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.lights.length === 1 && group.darks.length === 1) {
      const [light] = group.lights;
      const [dark] = group.darks;
      result.set(light as string, dark as string);
      result.set(dark as string, light as string);
    }
  }

  for (const [slug, counterpart] of Object.entries(CURATED_COUNTERPART_OVERRIDES)) {
    result.set(slug, counterpart);
  }

  return result;
}

/**
 * Cross-dataset validation for an already-built theme list: every
 * `counterpart` reference must point at a slug that exists in the same
 * dataset AND has the opposite `isDark` polarity. Returns one human-readable
 * error string per violation (empty array = valid). Used by
 * `scripts/validate.ts` to fail the build on a bad counterpart.
 */
export function findCounterpartErrors(themes: readonly CounterpartInput[]): string[] {
  const bySlug = new Map(themes.map((t) => [t.slug, t]));
  const errors: string[] = [];
  for (const theme of themes) {
    if (theme.counterpart === undefined) continue;
    const target = bySlug.get(theme.counterpart);
    if (target === undefined) {
      errors.push(`${theme.slug}.counterpart: "${theme.counterpart}" does not exist`);
    } else if (target.isDark === theme.isDark) {
      errors.push(
        `${theme.slug}.counterpart: "${theme.counterpart}" has the same isDark (${theme.isDark}) — must be opposite polarity`,
      );
    }
  }
  return errors;
}
