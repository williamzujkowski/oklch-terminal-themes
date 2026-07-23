import { describe, expect, it } from 'vitest';
import {
  CURATED_COUNTERPART_OVERRIDES,
  computeCounterparts,
  findCounterpartErrors,
  stemOf,
} from '../src/counterpart.js';
import { TerminalColorThemeSchema } from '../src/schema.js';

describe('stemOf', () => {
  it('strips a single known suffix', () => {
    expect(stemOf('ayu-light')).toBe('ayu');
    expect(stemOf('3024-day')).toBe('3024');
    expect(stemOf('3024-night')).toBe('3024');
  });

  it('leaves a bare slug (no matching suffix) untouched', () => {
    expect(stemOf('ayu')).toBe('ayu');
    expect(stemOf('dracula')).toBe('dracula');
  });

  it('strips multiple suffixes iteratively (everforest case)', () => {
    // everforest-light-med / everforest-dark-hard are invisible to a
    // single-suffix strip (both retain a trailing suffix after the first
    // pass) but resolve to the same stem under iterative stripping.
    expect(stemOf('everforest-light-med')).toBe('everforest');
    expect(stemOf('everforest-dark-hard')).toBe('everforest');
  });

  it('does not strip a suffix-shaped substring that is not a real suffix', () => {
    // "-mirage" is not a recognized suffix, so ayu-mirage keeps its own stem
    // rather than colliding with the ayu/ayu-light pair.
    expect(stemOf('ayu-mirage')).toBe('ayu-mirage');
  });

  it('does not confuse -dark with -darker or -dim with -dimmed', () => {
    expect(stemOf('material-darker')).toBe('material');
    expect(stemOf('github-dark-dimmed')).toBe('github');
  });
});

describe('computeCounterparts — unambiguous families (symmetric)', () => {
  it('pairs a single light + single dark stem family both ways', () => {
    const themes = [
      { slug: 'ayu', isDark: true },
      { slug: 'ayu-light', isDark: false },
      { slug: 'ayu-mirage', isDark: true },
    ];
    const result = computeCounterparts(themes);
    expect(result.get('ayu')).toBe('ayu-light');
    expect(result.get('ayu-light')).toBe('ayu');
    // Unrelated singleton stem in the same family prefix stays unpaired.
    expect(result.has('ayu-mirage')).toBe(false);
  });

  it('pairs the everforest multi-suffix case', () => {
    const themes = [
      { slug: 'everforest-light-med', isDark: false },
      { slug: 'everforest-dark-hard', isDark: true },
    ];
    const result = computeCounterparts(themes);
    expect(result.get('everforest-light-med')).toBe('everforest-dark-hard');
    expect(result.get('everforest-dark-hard')).toBe('everforest-light-med');
  });

  it('pairs remarque-light and remarque-dark symmetrically', () => {
    const themes = [
      { slug: 'remarque-light', isDark: false },
      { slug: 'remarque-dark', isDark: true },
    ];
    const result = computeCounterparts(themes);
    expect(result.get('remarque-light')).toBe('remarque-dark');
    expect(result.get('remarque-dark')).toBe('remarque-light');
  });

  it('leaves an unpaired stem (no opposite polarity present) without a counterpart', () => {
    const themes = [
      { slug: 'solarized-osaka-night', isDark: true },
      { slug: 'dracula', isDark: true },
    ];
    const result = computeCounterparts(themes);
    // The curated overrides are a static global map (see the next describe
    // block) and are always applied, so check the specific slugs under test
    // rather than the map's total size.
    expect(result.has('solarized-osaka-night')).toBe(false);
    expect(result.has('dracula')).toBe(false);
  });
});

describe('computeCounterparts — curated overrides applied exactly', () => {
  it('applies every entry of CURATED_COUNTERPART_OVERRIDES verbatim', () => {
    const slugs = Object.keys(CURATED_COUNTERPART_OVERRIDES);
    // Construct a minimal isDark-consistent input for every curated slug so
    // the override map is exercised end to end (not just as a static object).
    const isDarkOf: Record<string, boolean> = {
      'catppuccin-latte': false,
      'catppuccin-mocha': true,
      'catppuccin-frappe': true,
      'catppuccin-macchiato': true,
      github: false,
      'github-dark': true,
      'github-dark-dimmed': true,
      'gruvbox-light': false,
      'gruvbox-dark': true,
      'gruvbox-light-hard': false,
      'gruvbox-dark-hard': true,
      'gruvbox-material-light': false,
      'gruvbox-material-dark': true,
      'gruvbox-material': true,
      material: false,
      'material-dark': true,
      'material-darker': true,
      'rose-pine-dawn': false,
      'rose-pine': true,
      'rose-pine-moon': true,
      'tokyonight-day': false,
      tokyonight: true,
      'tokyonight-moon': true,
      'tokyonight-night': true,
      'tokyonight-storm': true,
      'zenbones-light': false,
      'zenbones-dark': true,
      zenbones: false,
      'claude-light': false,
      'claude-dark': true,
      claude: false,
    };
    const themes = slugs.map((slug) => ({ slug, isDark: isDarkOf[slug] as boolean }));
    const result = computeCounterparts(themes);
    for (const [slug, expected] of Object.entries(CURATED_COUNTERPART_OVERRIDES)) {
      expect(result.get(slug)).toBe(expected);
    }
  });

  it('overrides the heuristic result for ambiguous families', () => {
    // github family: 1 light + 2 darks under the stem heuristic — ambiguous,
    // so the curated map (not a heuristic guess) must decide it.
    const themes = [
      { slug: 'github', isDark: false },
      { slug: 'github-dark', isDark: true },
      { slug: 'github-dark-dimmed', isDark: true },
    ];
    const result = computeCounterparts(themes);
    expect(result.get('github')).toBe('github-dark');
    expect(result.get('github-dark')).toBe('github');
    expect(result.get('github-dark-dimmed')).toBe('github');
  });

  it('is directional for tokyonight: -storm points at -day, but -day points back at bare tokyonight', () => {
    expect(CURATED_COUNTERPART_OVERRIDES['tokyonight-storm']).toBe('tokyonight-day');
    expect(CURATED_COUNTERPART_OVERRIDES['tokyonight-day']).toBe('tokyonight');
    expect(CURATED_COUNTERPART_OVERRIDES['tokyonight']).toBe('tokyonight-day');
    // Not involutive: tokyonight-day's counterpart is NOT tokyonight-storm.
    expect(CURATED_COUNTERPART_OVERRIDES['tokyonight-day']).not.toBe('tokyonight-storm');
  });

  it('is directional for claude: explicit light <-> dark is canonical, bare claude points at dark', () => {
    expect(CURATED_COUNTERPART_OVERRIDES['claude-light']).toBe('claude-dark');
    expect(CURATED_COUNTERPART_OVERRIDES['claude-dark']).toBe('claude-light');
    expect(CURATED_COUNTERPART_OVERRIDES['claude']).toBe('claude-dark');
    // Not involutive: bare claude's counterpart (claude-dark) does not point
    // back at bare claude — it points at claude-light.
    expect(CURATED_COUNTERPART_OVERRIDES['claude-dark']).not.toBe('claude');
  });

  it('leaves a newly-ambiguous family (not in the curated set) unpaired', () => {
    // A hypothetical family with 2 lights + 1 dark that ISN'T one of the
    // curated families from issue #128 — the heuristic must not guess.
    const themes = [
      { slug: 'made-up-family', isDark: false },
      { slug: 'made-up-family-light', isDark: false },
      { slug: 'made-up-family-dark', isDark: true },
    ];
    const result = computeCounterparts(themes);
    expect(result.has('made-up-family')).toBe(false);
    expect(result.has('made-up-family-light')).toBe(false);
    expect(result.has('made-up-family-dark')).toBe(false);
  });
});

describe('TerminalColorThemeSchema — counterpart field shape', () => {
  const baseTheme = {
    name: 'Test',
    slug: 'test-light',
    isDark: false,
    tags: [],
    source: 'iterm2-color-schemes',
    sourceUrl: 'https://example.com',
    upstreamSha: 'local',
    updatedAt: '2026-01-01T00:00:00.000Z',
    colors: undefined,
    contrast: { fgOnBg: 10, minAnsi: 5, minAnsiSlot: 'black' },
  };

  it('does not introduce a schema error when a well-formed counterpart is present', () => {
    const parsed = TerminalColorThemeSchema.safeParse({ ...baseTheme, counterpart: 'test-dark' });
    // colors is intentionally omitted above — we only care that adding
    // `counterpart` doesn't itself introduce a schema error.
    expect(
      parsed.success ? [] : parsed.error.issues.filter((i) => i.path[0] === 'counterpart'),
    ).toEqual([]);
  });

  it('rejects a non-kebab-case counterpart slug', () => {
    const parsed = TerminalColorThemeSchema.safeParse({
      ...baseTheme,
      counterpart: 'Not Kebab Case',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path[0] === 'counterpart')).toBe(true);
    }
  });
});

describe('findCounterpartErrors — dataset-level validation', () => {
  it('passes for a valid, opposite-polarity pair', () => {
    const themes = [
      { slug: 'a-light', isDark: false, counterpart: 'a-dark' },
      { slug: 'a-dark', isDark: true, counterpart: 'a-light' },
    ];
    expect(findCounterpartErrors(themes)).toEqual([]);
  });

  it('rejects a counterpart slug that does not exist in the dataset', () => {
    const themes = [{ slug: 'a-light', isDark: false, counterpart: 'nonexistent-slug' }];
    const errors = findCounterpartErrors(themes);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('nonexistent-slug');
    expect(errors[0]).toContain('does not exist');
  });

  it('rejects a counterpart that has the same isDark polarity', () => {
    const themes = [
      { slug: 'a-light', isDark: false, counterpart: 'b-light' },
      { slug: 'b-light', isDark: false },
    ];
    const errors = findCounterpartErrors(themes);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('same isDark');
  });

  it('ignores themes with no counterpart', () => {
    const themes = [{ slug: 'solo', isDark: true }];
    expect(findCounterpartErrors(themes)).toEqual([]);
  });
});
