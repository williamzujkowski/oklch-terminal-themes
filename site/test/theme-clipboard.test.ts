// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { wireClipboard } from '../src/lib/theme-clipboard';
import { THEMES } from './fixtures/showcase-dom';
let abort: AbortController;
let write: ReturnType<typeof vi.fn>;
beforeEach(() => {
  abort = new AbortController();
  write = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: write },
  });
  document.body.innerHTML = `<p data-theme-announcer></p>${['a', 'b'].map((pane) => `<section data-pane="${pane}"><details class="export-menu" open><summary>Export</summary><button data-export="css">CSS</button></details><button class="palette-chip" data-key="background">Background</button><p data-toast></p></section>`).join('')}`;
});
afterEach(() => {
  abort.abort();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const pane = (key = 'a') => document.querySelector<HTMLElement>(`[data-pane="${key}"]`)!;
const button = (key = 'a') => pane(key).querySelector<HTMLButtonElement>('[data-export]')!;
it('scopes exports to each pane and announces the pane and theme name', async () => {
  for (const [index, key] of ['a', 'b'].entries())
    wireClipboard(pane(key), window, {
      signal: abort.signal,
      currentSlug: () => THEMES[index]!.slug,
      resolve: async () => THEMES[index],
      label: `Pane ${key.toUpperCase()}`,
    });
  button('a').click();
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(write.mock.calls[0]?.[0]).toContain(THEMES[0]!.name);
  expect(pane('b').querySelector('summary')!.dataset.feedback).toBeUndefined();
  expect(document.querySelector('[data-theme-announcer]')!.textContent).toContain(
    `Pane A · ${THEMES[0]!.name}`,
  );
  button('b').click();
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  expect(write.mock.calls[1]?.[0]).toContain(THEMES[1]!.name);
});
it('ignores stale or disposed resolution and catches rejection without copying', async () => {
  let finish: (value: (typeof THEMES)[number] | undefined) => void = () => {};
  let slug = THEMES[0]!.slug;
  wireClipboard(pane(), window, {
    signal: abort.signal,
    currentSlug: () => slug,
    resolve: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  button().click();
  slug = THEMES[1]!.slug;
  finish(THEMES[0]);
  await Promise.resolve();
  expect(write).not.toHaveBeenCalled();
  button().click();
  abort.abort();
  finish(THEMES[1]);
  await Promise.resolve();
  expect(write).not.toHaveBeenCalled();
});
it('allows only the latest copy request to complete', async () => {
  const pending: ((value: (typeof THEMES)[number] | undefined) => void)[] = [];
  wireClipboard(pane(), window, {
    signal: abort.signal,
    currentSlug: () => THEMES[0]!.slug,
    resolve: () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
  });
  button().click();
  pane().querySelector<HTMLButtonElement>('.palette-chip')!.click();
  pending[1]!(THEMES[0]);
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  pending[0]!(THEMES[0]);
  await Promise.resolve();
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0]?.[0]).toBe(THEMES[0]!.colors.background);
});
