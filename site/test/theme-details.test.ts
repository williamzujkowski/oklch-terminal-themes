import { describe, expect, it, vi } from 'vitest';
import dracula from '@williamzujkowski/oklch-terminal-themes/themes/dracula.json';
import nord from '@williamzujkowski/oklch-terminal-themes/themes/nord.json';
import { createThemeDetails, type ThemeDetailsOptions } from '../src/lib/theme-details';

const baseUrl = 'https://example.test/oklch-terminal-themes/theme-data/';
const knownSlugs = ['dracula', 'nord'];
const response = (value: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 503,
  json: async () => value,
});

function setup() {
  const fetcher = vi.fn<ThemeDetailsOptions['fetcher']>();
  return { fetcher, details: createThemeDetails({ fetcher, baseUrl, knownSlugs }) };
}

describe('active theme detail loading', () => {
  it('fetches only the requested full record under the Pages base path', async () => {
    const { fetcher, details } = setup();
    fetcher.mockResolvedValue(response(dracula));
    expect(details.peek('dracula')).toBeUndefined();
    const resolved = await details.resolve('dracula');
    expect(resolved).toEqual(dracula);
    expect(resolved?.sourceUrl).toBe(dracula.sourceUrl);
    expect(resolved?.dataviz?.sequential).toEqual(dracula.dataviz?.sequential);
    expect(details.peek('dracula')).toBe(resolved);
    expect(details.peek('nord')).toBeUndefined();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${baseUrl}dracula.json`);
  });

  it('deduplicates in-flight requests and reuses validated cache entries', async () => {
    const { fetcher, details } = setup();
    let deliver!: (value: Awaited<ReturnType<ThemeDetailsOptions['fetcher']>>) => void;
    fetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    const first = details.resolve('dracula');
    const second = details.resolve('dracula');
    expect(first).toBe(second);
    deliver(response(dracula));
    const resolved = await first;
    expect(await second).toBe(resolved);
    expect(await details.resolve('dracula')).toBe(resolved);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown and unsafe slug paths without fetching', async () => {
    const fetcher = vi.fn<ThemeDetailsOptions['fetcher']>();
    const invalid = ['unknown', '../nord', 'nord?x=1', '%2e%2e', 'nord/../../x', '__proto__'];
    const details = createThemeDetails({
      fetcher,
      baseUrl,
      knownSlugs: [...knownSlugs, ...invalid.slice(1)],
    });
    for (const slug of invalid) expect(await details.resolve(slug)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resolves A and B independently without fetching the remaining catalog', async () => {
    const { fetcher, details } = setup();
    fetcher.mockImplementation(async (url) =>
      response(url.endsWith('/nord.json') ? nord : dracula),
    );
    const [a, b] = await Promise.all([details.resolve('dracula'), details.resolve('nord')]);
    expect(a?.slug).toBe('dracula');
    expect(b?.slug).toBe('nord');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries HTTP and network failure while preserving other cached themes', async () => {
    const { fetcher, details } = setup();
    fetcher.mockResolvedValueOnce(response(nord));
    const cached = await details.resolve('nord');
    fetcher.mockResolvedValueOnce(response(null, false));
    expect(await details.resolve('dracula')).toBeUndefined();
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await details.resolve('dracula')).toBeUndefined();
    fetcher.mockResolvedValueOnce(response(dracula));
    expect((await details.resolve('dracula'))?.slug).toBe('dracula');
    expect(details.peek('nord')).toBe(cached);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['wrong slug', nord],
    ['missing canonical colors', { ...dracula, colors: {} }],
    [
      'nonfinite numeric coordinate',
      {
        ...dracula,
        colors: {
          ...dracula.colors,
          foreground: { ...dracula.colors.foreground, oklch: { l: NaN, c: 0, h: 0 } },
        },
      },
    ],
    ['malformed top level', ['dracula']],
  ])('rejects %s, then really fetches again on retry', async (_description, malformed) => {
    const { fetcher, details } = setup();
    fetcher.mockResolvedValueOnce(response(malformed));
    expect(await details.resolve('dracula')).toBeUndefined();
    expect(details.peek('dracula')).toBeUndefined();
    fetcher.mockResolvedValueOnce(response(dracula));
    expect((await details.resolve('dracula'))?.colors.foreground.hex).toBe(
      dracula.colors.foreground.hex,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retries an invalid JSON body instead of retaining its rejected promise', async () => {
    const { fetcher, details } = setup();
    fetcher.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('invalid JSON');
      },
    });
    expect(await details.resolve('dracula')).toBeUndefined();
    fetcher.mockResolvedValueOnce(response(dracula));
    expect((await details.resolve('dracula'))?.slug).toBe('dracula');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('normalizes a base without a slash and excludes its query/fragment', async () => {
    const fetcher = vi.fn<ThemeDetailsOptions['fetcher']>().mockResolvedValue(response(nord));
    const details = createThemeDetails({
      fetcher,
      knownSlugs,
      baseUrl: baseUrl.slice(0, -1) + '?unowned=1#fragment',
    });
    await details.resolve('nord');
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${baseUrl}nord.json`);
    expect(() =>
      createThemeDetails({ fetcher, knownSlugs, baseUrl: 'javascript:alert(1)' }),
    ).toThrow(RangeError);
  });
});
