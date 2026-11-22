// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import dracula from '@williamzujkowski/oklch-terminal-themes/themes/dracula.json';
import nord from '@williamzujkowski/oklch-terminal-themes/themes/nord.json';
import slimCatalog from '@williamzujkowski/oklch-terminal-themes/themes-slim.json';
import { createThemeStore } from '../src/lib/theme-store';
import { parsePreviewThemes } from '../src/lib/preview-schema';

const respond = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status });
function setup(active = true) {
  window.history.replaceState(null, '', '/oklch-terminal-themes/?theme=nord');
  document.body.innerHTML = `<button class="listbox-item" data-slug="dracula"></button><button class="listbox-item" data-slug="nord"></button><button class="listbox-item" data-slug="../attack"></button><script id="themes-data" type="application/json" data-src="/oklch-terminal-themes/themes-data.json" ${active ? 'data-details-base="/oklch-terminal-themes/theme-data/"' : ''}>[{"name":"Dracula","slug":"dracula","isDark":true,"colors":{"background":"oklch(0.2 0 0)","foreground":"oklch(0.9 0 0)"}}]</script>`;
  const fetcher = vi.fn<typeof window.fetch>();
  window.fetch = fetcher;
  return { fetcher, store: createThemeStore(document, window) };
}
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('active full-record backend through the existing factory', () => {
  it('never requests bulk Slim data, and exposes metadata only with the validated preview', async () => {
    const { fetcher, store } = setup();
    fetcher.mockResolvedValue(respond(nord));
    expect(store.peek('dracula')).toBeUndefined();
    expect(store.peek('nord')).toBeUndefined();
    expect(store.details?.('nord')).toBeUndefined();
    await store.loadAll();
    expect(fetcher).not.toHaveBeenCalled();
    const slim = await store.resolve('nord');
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      'http://localhost:3000/oklch-terminal-themes/theme-data/nord.json',
    );
    expect(slim?.name).toBe(nord.name);
    expect(slim?.colors.foreground).toBe(nord.colors.foreground.oklchCss);
    expect(slim?.contrast).toEqual({
      fgOnBg: nord.contrast.fgOnBg,
      minAnsi: nord.contrast.minAnsi,
      minAnsiSlot: nord.contrast.minAnsiSlot,
    });
    expect(slim?.dataviz?.categorical).toEqual(
      nord.dataviz!.categorical.map((color) => color.oklchCss),
    );
    expect(store.details?.('nord')?.sourceUrl).toBe(nord.sourceUrl);
    expect(store.details?.('nord')?.dataviz?.sequential).toEqual(nord.dataviz!.sequential);
    expect(store.peek('nord')).toBe(slim);
    expect(store.currentSlug()).toBe('nord');
  });
  it('deduplicates parallel consumers and caches both panes independently', async () => {
    const { fetcher, store } = setup();
    let deliver!: (value: Response) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    const a = store.resolve('nord'),
      b = store.resolve('nord');
    expect(fetcher).toHaveBeenCalledTimes(1);
    deliver(respond(nord));
    expect(await a).toBe(await b);
    fetcher.mockResolvedValueOnce(respond(dracula));
    await store.resolve('dracula');
    expect(store.peek('nord')?.name).toBe('Nord');
    expect(store.peek('dracula')?.name).toBe('Dracula');
    await store.resolve('nord');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['wrong slug', dracula],
    ['missing canonical fields', { ...nord, colors: {} }],
    [
      'nonfinite coordinate',
      {
        ...nord,
        colors: {
          ...nord.colors,
          foreground: { ...nord.colors.foreground, oklch: { l: NaN, c: 0, h: 0 } },
        },
      },
    ],
  ])('does not cache %s and really retries the full endpoint', async (_name, invalid) => {
    const { fetcher, store } = setup();
    fetcher.mockResolvedValueOnce(respond(invalid));
    expect(await store.resolve('nord')).toBeUndefined();
    expect(store.peek('nord')).toBeUndefined();
    expect(store.details?.('nord')).toBeUndefined();
    fetcher.mockResolvedValueOnce(respond(nord));
    expect((await store.resolve('nord'))?.slug).toBe('nord');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('preserves validated cache through HTTP/network failure and retry', async () => {
    const { fetcher, store } = setup();
    fetcher.mockResolvedValueOnce(respond(dracula));
    const cached = await store.resolve('dracula');
    fetcher.mockResolvedValueOnce(respond(null, 503));
    expect(await store.resolve('nord')).toBeUndefined();
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect(await store.resolve('nord')).toBeUndefined();
    fetcher.mockResolvedValueOnce(respond(nord));
    expect((await store.resolve('nord'))?.slug).toBe('nord');
    expect(store.peek('dracula')).toBe(cached);
  });
  it('rejects unknown, prototype-like and arbitrary paths without any request', async () => {
    const { fetcher, store } = setup();
    for (const slug of ['missing', '../attack', '__proto__', 'constructor', 'nord?extra=1']) {
      expect(store.knows(slug)).toBe(false);
      expect(await store.resolve(slug)).toBeUndefined();
      expect(store.peek(slug)).toBeUndefined();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('runs withTheme only after full validation and synchronously for cached data', async () => {
    const { fetcher, store } = setup();
    fetcher.mockResolvedValue(respond(nord));
    const receive = vi.fn();
    store.withTheme('nord', receive);
    await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
    expect(store.details?.('nord')).toBeDefined();
    const cached = vi.fn();
    store.withTheme('nord', cached);
    expect(cached).toHaveBeenCalledOnce();
  });
});

// These legacy records intentionally have only background/foreground and a
// foreground contrast, matching the shipped controller's offline fixtures.
describe('legacy preview boundary', () => {
  it('accepts the complete current slim catalog without dropping declared fields', () => {
    expect(parsePreviewThemes(slimCatalog)).toEqual(slimCatalog);
  });
  it('preserves provided tags and supplemental scalar without inventing missing metrics', () => {
    const input = {
      name: 'Minimal',
      slug: 'minimal',
      isDark: true,
      colors: {
        background: 'oklch(0.2 0 0)',
        foreground: 'oklch(0.9 0 0)',
      },
      tags: ['dark'],
      apca: 40,
      contrast: { fgOnBg: 4.4999 },
    };
    expect(parsePreviewThemes([input])).toEqual([input]);
    expect(parsePreviewThemes([input])[0]!.contrast).not.toHaveProperty('minAnsi');
  });
  it.each([
    'oklch(broken)',
    'oklch(1.1 0 0)',
    'oklch(0.2 0.6 0)',
    'oklch(0.2 0 361)',
    'oklch(0.2 0 NaN)',
    'oklch(0.2 0 0);background:url(https://bad.test)',
    'rgb(0 0 0)',
  ])('rejects malformed or unsupported provided color %s', (value) => {
    expect(() =>
      parsePreviewThemes([
        {
          name: 'Bad',
          slug: 'bad',
          isDark: true,
          colors: { background: value, foreground: 'oklch(0.9 0 0)' },
        },
      ]),
    ).toThrow();
  });
  it('rejects unknown color slots and non-string values', () => {
    const base = {
      name: 'Bad',
      slug: 'bad',
      isDark: true,
      colors: {
        background: 'oklch(0.2 0 0)',
        foreground: 'oklch(0.9 0 0)',
      },
    };
    expect(() =>
      parsePreviewThemes([{ ...base, colors: { ...base.colors, invented: 'oklch(0.5 0 0)' } }]),
    ).toThrow();
    expect(() => parsePreviewThemes([{ ...base, colors: { ...base.colors, red: 0 } }])).toThrow();
    expect(() => parsePreviewThemes([{ ...base, colors: {} }])).toThrow();
  });
  it.each([
    { name: '</script>' },
    { slug: '../attack' },
    { isDark: 'false' },
    { tags: ['<script>'] },
    { contrast: { fgOnBg: Infinity } },
  ])('rejects malformed identity or metric fields %j', (fields) => {
    expect(() =>
      parsePreviewThemes([
        {
          name: 'Bad',
          slug: 'bad',
          isDark: true,
          colors: { background: 'oklch(0.2 0 0)', foreground: 'oklch(0.9 0 0)' },
          ...fields,
        },
      ]),
    ).toThrow();
  });
});

describe('legacy cache and retry integrity', () => {
  const validNord = () => ({
    name: nord.name,
    slug: nord.slug,
    isDark: nord.isDark,
    colors: Object.fromEntries(
      Object.entries(nord.colors).map(([key, color]) => [key, color.oklchCss]),
    ),
    contrast: { fgOnBg: nord.contrast.fgOnBg },
    tags: ['dark'],
  });
  it('rejects an entire malformed bulk payload, keeps the default, and really retries', async () => {
    const { fetcher, store } = setup(false);
    const fallback = store.peek('dracula');
    fetcher.mockResolvedValueOnce(
      respond([
        validNord(),
        { ...validNord(), slug: 'dracula', colors: { background: 'oklch(broken)' } },
      ]),
    );
    expect(await store.resolve('nord')).toBeUndefined();
    expect(store.peek('dracula')).toBe(fallback);
    expect(store.peek('nord')).toBeUndefined();
    fetcher.mockResolvedValueOnce(respond([validNord()]));
    expect((await store.resolve('nord'))?.tags).toEqual(['dark']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not cache valid but unadvertised slugs from a bulk response', async () => {
    const { fetcher, store } = setup(false);
    fetcher.mockResolvedValueOnce(respond([validNord(), { ...validNord(), slug: 'unlisted' }]));
    await store.resolve('nord');
    expect(store.peek('unlisted')).toBeUndefined();
    expect(store.knows('unlisted')).toBe(false);
    expect(await store.resolve('../attack')).toBeUndefined();
    expect(store.knows('../attack')).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not grant catalog membership to an untrusted inline default', () => {
    const { fetcher } = setup(false);
    document.querySelector('#themes-data')!.textContent = JSON.stringify([
      { ...validNord(), slug: 'unlisted' },
    ]);
    const store = createThemeStore(document, window);
    expect(store.knows('unlisted')).toBe(false);
    expect(store.peek('unlisted')).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('handles corrupt inline JSON without breaking catalog access', async () => {
    const { fetcher } = setup(false);
    document.querySelector('#themes-data')!.textContent = '{invalid';
    fetcher.mockResolvedValueOnce(respond([validNord()]));
    const store = createThemeStore(document, window);
    expect(store.knows('nord')).toBe(true);
    expect((await store.resolve('nord'))?.slug).toBe('nord');
  });
  it('rejects prototype-property payloads and never treats object prototypes as cached themes', async () => {
    const { fetcher, store } = setup(false);
    fetcher.mockResolvedValueOnce(
      new Response(
        '[{"name":"Bad","slug":"__proto__","isDark":true,"colors":{"background":"oklch(0.2 0 0)","foreground":"oklch(0.9 0 0)"},"polluted":true}]',
      ),
    );
    expect(await store.resolve('nord')).toBeUndefined();
    expect(store.peek('__proto__')).toBeUndefined();
    expect(store.peek('constructor')).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
    fetcher.mockResolvedValueOnce(respond([validNord()]));
    expect((await store.resolve('nord'))?.slug).toBe('nord');
  });
});
