// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createListbox, type ListboxDeps } from '../src/lib/theme-listbox';
import { fixture } from './fixtures/showcase-dom';

let abort: AbortController;
beforeEach(() => {
  abort = new AbortController();
  window.history.replaceState(null, '', '/?theme=dracula');
  document.body.innerHTML = fixture();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  abort.abort();
  vi.restoreAllMocks();
});
function boot(onBrowseChange?: ListboxDeps['onBrowseChange']) {
  return createListbox(document, window, {
    signal: abort.signal,
    currentSlug: () => 'dracula',
    selectSlug: vi.fn(),
    ...(onBrowseChange ? { onBrowseChange } : {}),
  });
}
function input(value: string) {
  const search = document.querySelector<HTMLInputElement>('#theme-search')!;
  search.value = value;
  search.dispatchEvent(new Event('input', { bubbles: true }));
}
it('does not publish or write history on initialization, opening, or URL synchronization', () => {
  const publish = vi.fn();
  const replace = vi.spyOn(window.history, 'replaceState');
  const push = vi.spyOn(window.history, 'pushState');
  const box = boot(publish);
  box.open();
  box.syncFromUrl();
  expect(publish).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});
it('publishes independent snapshots with replace for typing and push for committed controls', () => {
  const publish = vi.fn();
  const replace = vi.spyOn(window.history, 'replaceState');
  boot(publish);
  input(' dracula ');
  const first = publish.mock.calls[0]?.[0];
  expect(first.filter.query).toBe('dracula');
  expect(publish.mock.calls[0]?.[1]).toBe('replace');
  document.querySelector<HTMLButtonElement>('[data-tag="dark"]')!.click();
  expect(publish.mock.lastCall?.[1]).toBe('push');
  expect(first.filter.tags.size).toBe(0);
  const sort = document.querySelector<HTMLSelectElement>('#theme-sort')!;
  sort.value = 'apca';
  sort.dispatchEvent(new Event('change'));
  expect(publish.mock.lastCall?.[0].sort).toBe('apca');
  expect(publish.mock.lastCall?.[1]).toBe('push');
  expect(replace).not.toHaveBeenCalled();
});
it('retains legacy URL replacement for interactions without a callback', () => {
  boot();
  input('dracula');
  expect(new URLSearchParams(location.search).get('q')).toBe('dracula');
});
it('silently applies history navigation to search and results', () => {
  const publish = vi.fn();
  const box = boot(publish);
  window.history.replaceState(null, '', '/?q=absent&tags=dark,light');
  box.syncFromUrl();
  expect(box.visibleSlugs()).toEqual([]);
  expect(document.querySelector<HTMLInputElement>('#theme-search')!.value).toBe('absent');
  expect(publish).not.toHaveBeenCalled();
});

it('keeps contradictory legacy filters visible until a grouped choice replaces them', () => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p data-browse-status></p><button data-action="reset-filters">Clear filters</button><label>Appearance<select data-filter-group="appearance"><option value="">Any</option><option value="dark">Dark</option><option value="light">Light</option><option value="legacy" data-legacy-filter disabled hidden>Legacy tag combination</option></select></label>`,
  );
  window.history.replaceState(null, '', '/?tags=dark,light');
  const publish = vi.fn();
  const box = boot(publish);
  expect(box.visibleSlugs()).toEqual([]);
  const group = document.querySelector<HTMLSelectElement>('[data-filter-group]')!;
  expect(group.value).toBe('legacy');
  expect(document.querySelector('[data-browse-status]')!.textContent).toContain('dark; light');
  group.value = 'dark';
  group.dispatchEvent(new Event('change'));
  expect([...publish.mock.lastCall?.[0].filter.tags]).toEqual(['dark']);
  expect(publish.mock.lastCall?.[1]).toBe('push');
  expect(box.visibleSlugs().length).toBeGreaterThan(0);
  document.querySelector<HTMLButtonElement>('[data-action="reset-filters"]')!.click();
  expect(publish.mock.lastCall?.[0].filter.tags.size).toBe(0);
  expect(group.value).toBe('');
});
it('does not create contradictory polarity filters through advanced tag toggles', () => {
  const publish = vi.fn();
  boot(publish);
  document.querySelector<HTMLButtonElement>('[data-tag="dark"]')!.click();
  document.querySelector<HTMLButtonElement>('[data-tag="light"]')!.click();
  expect([...publish.mock.lastCall?.[0].filter.tags]).toEqual(['light']);
});
