// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { wireShortlist } from '../src/lib/shortlist-ui';
import { SHORTLIST_KEY } from '../src/lib/shortlist-store';
let abort: AbortController;
beforeEach(() => {
  abort = new AbortController();
  localStorage.clear();
  document.body.innerHTML =
    '<section data-shortlist><button data-save-theme>Save theme</button><p data-shortlist-count></p><ul data-shortlist-list></ul><p data-shortlist-empty></p><p data-shortlist-feedback role="status"></p></section>';
});
afterEach(() => {
  abort.abort();
});
function setup(storage: () => Storage = () => localStorage) {
  let candidate = 'dracula';
  const selectCandidate = vi.fn();
  const selectReference = vi.fn();
  const ui = wireShortlist(document, {
    catalog: [
      { slug: 'dracula', name: 'Dracula' },
      { slug: 'nord', name: '<img src=x onerror=alert(1)>' },
    ],
    storage,
    getCandidate: () => candidate,
    selectCandidate,
    selectReference,
    signal: abort.signal,
  });
  return {
    ...ui,
    selectCandidate,
    selectReference,
    change: (slug: string) => {
      candidate = slug;
      ui.refresh();
    },
  };
}
const save = () => document.querySelector<HTMLButtonElement>('[data-save-theme]')!;
it('saves, reloads, toggles and renders names as text', () => {
  const ui = setup();
  save().click();
  ui.change('nord');
  save().click();
  expect(document.querySelectorAll('[data-shortlist-list] li')).toHaveLength(2);
  expect(document.querySelector('[data-shortlist-list] img')).toBeNull();
  expect(document.querySelector('[data-shortlist-list]')!.textContent).toContain('<img src=x');
  expect(save().getAttribute('aria-pressed')).toBe('true');
  ui.dispose();
  setup();
  expect(document.querySelectorAll('[data-shortlist-list] li')).toHaveLength(2);
  save().click();
  expect(JSON.parse(localStorage.getItem(SHORTLIST_KEY)!).slugs).toEqual(['nord']);
});
it('exposes distinct candidate and reference actions without mutating selection implicitly', () => {
  const ui = setup();
  save().click();
  expect(ui.selectCandidate).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('[data-shortlist-action="candidate"]')!.click();
  document.querySelector<HTMLButtonElement>('[data-shortlist-action="reference"]')!.click();
  expect(ui.selectCandidate).toHaveBeenCalledWith('dracula');
  expect(ui.selectReference).toHaveBeenCalledWith('dracula');
});
it('retains focused row actions across candidate refresh and restores focus on removal', () => {
  const ui = setup();
  save().click();
  const remove = document.querySelector<HTMLButtonElement>('[data-shortlist-action="remove"]')!;
  remove.focus();
  ui.change('nord');
  expect(document.activeElement).toBe(remove);
  remove.click();
  expect(document.activeElement).toBe(save());
  expect(document.querySelector<HTMLElement>('[data-shortlist-empty]')!.hidden).toBe(false);
});
it('keeps operations functional in memory when storage is denied and explains persistence', () => {
  setup(() => {
    throw new Error('SecurityError');
  });
  save().click();
  expect(document.querySelectorAll('[data-shortlist-list] li')).toHaveLength(1);
  expect(document.querySelector('[data-shortlist-feedback]')!.textContent).toContain('visit only');
});
it('disposes listeners, ignores refresh after abort, and tolerates absent markup', () => {
  const ui = setup();
  abort.abort();
  save().click();
  ui.refresh();
  expect(document.querySelectorAll('[data-shortlist-list] li')).toHaveLength(0);
  document.body.innerHTML = '';
  expect(() => setup()).not.toThrow();
});
