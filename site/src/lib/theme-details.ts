import type { TerminalColorThemeSchema } from '@williamzujkowski/oklch-terminal-themes';

/** Full canonical schema output, including optional source/chart metadata. */
export type ThemeDetailsRecord = ReturnType<typeof TerminalColorThemeSchema.parse>;

export interface ThemeDetailsOptions {
  fetcher: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  baseUrl: string | URL;
  knownSlugs: Iterable<string>;
}

export interface ThemeDetails {
  resolve(slug: string): Promise<ThemeDetailsRecord | undefined>;
  peek(slug: string): ThemeDetailsRecord | undefined;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function detailsBase(value: string | URL): URL {
  const base = new URL(value);
  if (base.protocol !== 'https:' && base.protocol !== 'http:') {
    throw new RangeError('Theme detail base must use HTTP or HTTPS');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  base.search = '';
  base.hash = '';
  return base;
}

async function fetchRecord(
  fetcher: ThemeDetailsOptions['fetcher'],
  url: URL,
  slug: string,
): Promise<ThemeDetailsRecord | undefined> {
  const response = await fetcher(url.href);
  if (!response.ok) return undefined;
  const raw: unknown = await response.json();
  // Validation is needed only when richer active-pane data is requested.
  // Keep the public schema/Zod out of the initial explorer controller chunk.
  const { TerminalColorThemeSchema } = await import('@williamzujkowski/oklch-terminal-themes');
  const parsed = TerminalColorThemeSchema.safeParse(raw);
  return parsed.success && parsed.data.slug === slug ? parsed.data : undefined;
}

/** Fetch/cache only explicitly requested catalog slugs, never the entire dataset. */
export function createThemeDetails(options: ThemeDetailsOptions): ThemeDetails {
  const base = detailsBase(options.baseUrl);
  const known = new Set(Array.from(options.knownSlugs).filter((slug) => SLUG.test(slug)));
  const cache = new Map<string, ThemeDetailsRecord>();
  const pending = new Map<string, Promise<ThemeDetailsRecord | undefined>>();
  return {
    peek: (slug) => cache.get(slug),
    resolve: (slug) => {
      if (!known.has(slug)) return Promise.resolve(undefined);
      const cached = cache.get(slug);
      if (cached) return Promise.resolve(cached);
      const existing = pending.get(slug);
      if (existing) return existing;
      const request = fetchRecord(options.fetcher, new URL(`${slug}.json`, base), slug)
        .then((record) => {
          if (record) cache.set(slug, record);
          return record;
        })
        .catch(() => undefined)
        .finally(() => pending.delete(slug));
      pending.set(slug, request);
      return request;
    },
  };
}
