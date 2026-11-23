import { createThemeDetails } from './theme-details';
import type { ThemeDetailsOptions, ThemeDetailsRecord } from './theme-details';
import type { SlimTheme, ThemeStore } from './theme-store';
import { COLOR_KEYS } from '../../../src/types.js';

export const SAFE_THEME_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
interface ActiveOptions extends ThemeDetailsOptions {
  search(): string;
}

/** Preserve the existing preview/export projection; richer metadata stays separate. */
function projectActive(record: ThemeDetailsRecord): SlimTheme {
  return {
    name: record.name,
    slug: record.slug,
    isDark: record.isDark,
    tags: record.tags,
    colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, record.colors[key].oklchCss])),
    contrast: {
      fgOnBg: record.contrast.fgOnBg,
      minAnsi: record.contrast.minAnsi,
      minAnsiSlot: record.contrast.minAnsiSlot,
    },
    ...(record.counterpart === undefined ? {} : { counterpart: record.counterpart }),
    ...(record.dataviz === undefined
      ? {}
      : { dataviz: { categorical: record.dataviz.categorical.map((color) => color.oklchCss) } }),
  };
}

/** One validated active-record cache shared by both preview consumers. */
export function createActiveThemeStore(options: ActiveOptions): ThemeStore {
  const known = new Set(
    Array.from(options.knownSlugs).filter((slug) => SAFE_THEME_SLUG.test(slug)),
  );
  const defaultSlug = known.has('dracula') ? 'dracula' : (known.values().next().value ?? '');
  const details = createThemeDetails({ ...options, knownSlugs: known });
  const cache = new Map<string, SlimTheme>();
  const pending = new Map<string, Promise<SlimTheme | undefined>>();
  const resolve = (slug: string): Promise<SlimTheme | undefined> => {
    if (!known.has(slug)) return Promise.resolve(undefined);
    const cached = cache.get(slug);
    if (cached) return Promise.resolve(cached);
    const existing = pending.get(slug);
    if (existing) return existing;
    const request = details
      .resolve(slug)
      .then((record) => {
        if (!record) return undefined;
        const preview = projectActive(record);
        cache.set(slug, preview);
        return preview;
      })
      .finally(() => pending.delete(slug));
    pending.set(slug, request);
    return request;
  };
  return {
    peek: (slug = defaultSlug) => cache.get(slug),
    details: (slug) => details.peek(slug),
    knows: (slug) => known.has(slug),
    currentSlug: () => {
      const slug = new URLSearchParams(options.search()).get('theme');
      return slug !== null && known.has(slug) ? slug : defaultSlug;
    },
    loadAll: () => Promise.resolve(),
    resolve,
    withTheme: (slug, fn) => {
      const cached = cache.get(slug);
      if (cached) fn(cached);
      else
        void resolve(slug).then((preview) => {
          if (preview) fn(preview);
        });
    },
  };
}
