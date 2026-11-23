// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { wireMobile, type Controls } from '../src/lib/comparison-controls';
import type { Preview } from '../src/lib/comparison-preview';
import type { ExplorerState } from '../src/lib/explorer-state';

const originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
let abort: AbortController;
let matches: boolean;
let media: MediaQueryList;
const state: ExplorerState = {
  theme: 'nord',
  reference: 'dracula',
  view: 'dashboard',
  sample: 'forms',
  size: 14,
  recipe: 'raw',
  role: null,
  query: '',
  tags: [],
  sort: 'default',
};
beforeEach(() => {
  abort = new AbortController();
  matches = false;
  // An EventTarget supplies real listener/disposal behavior; this test needs only matches.
  media = new EventTarget() as unknown as MediaQueryList;
  Object.defineProperty(media, 'matches', { get: () => matches });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => media) });
  document.body.innerHTML =
    '<button id="outside">Outside</button><button data-mobile-pane="a">A</button><button data-mobile-pane="b">B</button><section id="a"><input id="a-field"></section><section id="b"><input id="b-field"></section>';
});
afterEach(() => {
  abort.abort();
  vi.restoreAllMocks();
  if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
  document.body.replaceChildren();
});
function setup() {
  const controls: Controls = {
    doc: document,
    win: window,
    signal: abort.signal,
    catalog: ['dracula', 'nord'],
    getState: () => state,
    commit: vi.fn(),
  };
  const panes: Preview[] = (['a', 'b'] as const).map((id) => ({
    id,
    root: document.getElementById(id)!,
    slug: id,
    phase: 'ready',
    selection: { select: vi.fn(), retry: vi.fn(), resolveForExport: async () => undefined },
  }));
  const refresh = wireMobile(controls, panes);
  refresh();
  return panes;
}
it('keeps the focused preview visible when the layout becomes narrow', () => {
  const panes = setup();
  const input = document.getElementById('a-field')!;
  input.focus();
  matches = true;
  media.dispatchEvent(new Event('change'));
  expect(panes[0]!.root.inert).toBe(false);
  expect(panes[1]!.root.inert).toBe(true);
  expect(document.querySelector('[data-mobile-pane="a"]')?.getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(document.activeElement).toBe(input);
});
it('keeps the current pane choice when focus is outside the previews', () => {
  const panes = setup();
  const outside = document.getElementById('outside')!;
  outside.focus();
  matches = true;
  media.dispatchEvent(new Event('change'));
  expect(panes[0]!.root.inert).toBe(true);
  expect(panes[1]!.root.inert).toBe(false);
  expect(document.activeElement).toBe(outside);
});
