// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import dracula from '@williamzujkowski/oklch-terminal-themes/themes/dracula.json';
import nord from '@williamzujkowski/oklch-terminal-themes/themes/nord.json';
import { createThemeStore } from '../src/lib/theme-store';

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
