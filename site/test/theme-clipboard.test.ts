// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { wireClipboard } from '../src/lib/theme-clipboard';
import { TerminalColorThemeSchema } from '@williamzujkowski/oklch-terminal-themes';
import fullTheme from '../../data/by-name/dracula.json';
import type { Recipe } from '../src/lib/application-roles';
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

it('handles resolver rejection and clears scoped feedback on disposal', async () => {
  wireClipboard(pane(), window, {
    signal: abort.signal,
    currentSlug: () => THEMES[0]!.slug,
    resolve: async () => {
      throw new Error('offline');
    },
  });
  button().click();
  await vi.waitFor(() =>
    expect(pane().querySelector('summary')!.dataset.feedback).toBe('export unavailable'),
  );
  abort.abort();
  expect(pane().querySelector('summary')!.dataset.feedback).toBeUndefined();
});

it('copies a full canonical record and the selected central recipe with provenance', async () => {
  const full = TerminalColorThemeSchema.parse(fullTheme);
  const recipe: Recipe = 'ui-v1';
  button().dataset.export = 'full-json';
  pane()
    .querySelector('details')!
    .insertAdjacentHTML('beforeend', '<button data-export="recipe-css">Recipe CSS</button>');
  wireClipboard(pane(), window, {
    signal: abort.signal,
    currentSlug: () => 'dracula',
    resolve: async () => THEMES[0],
    resolveFull: async () => full,
    recipe: () => recipe,
    label: 'Pane A',
  });
  button().click();
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(JSON.parse(write.mock.calls[0]?.[0])).toEqual(full);
  pane().querySelector<HTMLButtonElement>('[data-export="recipe-css"]')!.click();
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  const css = write.mock.calls[1]?.[0];
  expect(css).toContain('ui-v1');
  expect(css).toContain(full.sourceUrl);
  expect(css).toContain('--role-body-fg:');
  expect(css).toContain('--tt-red:');
  expect(css).toContain('color-mix(in srgb');
});
it('does not copy full data when selection or recipe changes during its load', async () => {
  const full = TerminalColorThemeSchema.parse(fullTheme);
  let finish: (value: typeof full | undefined) => void = () => {};
  let recipe: Recipe = 'raw';
  const resolveFull = vi.fn(
    () =>
      new Promise<typeof full | undefined>((resolve) => {
        finish = resolve;
      }),
  );
  button().dataset.export = 'recipe-css';
  wireClipboard(pane(), window, {
    signal: abort.signal,
    currentSlug: () => 'dracula',
    resolve: async () => THEMES[0],
    resolveFull,
    recipe: () => recipe,
  });
  button().click();
  await vi.waitFor(() => expect(resolveFull).toHaveBeenCalledWith('dracula'));
  await Promise.resolve();
  recipe = 'ui-v1';
  finish(full);
  await Promise.resolve();
  expect(write).not.toHaveBeenCalled();
});
it('reports unavailable full data without writing an empty clipboard value', async () => {
  button().dataset.export = 'full-json';
  wireClipboard(pane(), window, {
    signal: abort.signal,
    currentSlug: () => 'dracula',
    resolve: async () => THEMES[0],
    resolveFull: async () => undefined,
  });
  button().click();
  await vi.waitFor(() =>
    expect(pane().querySelector('summary')!.dataset.feedback).toBe('export unavailable'),
  );
  expect(write).not.toHaveBeenCalled();
});
