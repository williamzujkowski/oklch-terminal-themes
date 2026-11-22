// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dracula from '@williamzujkowski/oklch-terminal-themes/themes/dracula.json';
import nord from '@williamzujkowski/oklch-terminal-themes/themes/nord.json';
import solarized from '@williamzujkowski/oklch-terminal-themes/themes/iterm2-solarized-dark.json';
import { initComparison } from '../src/lib/comparison-controller';
import { fixture } from './fixtures/showcase-dom';

const records = [dracula, nord, solarized];
let dispose: (() => void) | undefined;
let clipboard: string[];
let requests: string[];
let held: Set<string>;
let pending: Map<string, (response: Response) => void>;
let failures: Set<string>;
const q = <T extends Element = HTMLElement>(selector: string): T => {
  const result = document.querySelector<T>(selector);
  if (!result) throw new Error(`Comparison fixture missing ${selector}`);
  return result;
};
const pane = (id: 'a' | 'b'): HTMLElement => q(`[data-pane="${id}"]`);
const slug = (id: 'a' | 'b'): string | undefined => pane(id).dataset.themeSlug;
function change(selector: string, value: string): void {
  const control = q<HTMLSelectElement>(selector);
  control.value = value;
  control.dispatchEvent(new Event('change', { bubbles: true }));
}
function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function release(slug: string): void {
  const send = pending.get(slug);
  if (!send) throw new Error(`No held request for ${slug}`);
  send(response(records.find((record) => record.slug === slug)));
  pending.delete(slug);
}
function addPanes(): void {
  const original = q('.showcase');
  for (const id of ['a', 'b']) {
    const root = original.cloneNode(true) as HTMLElement;
    root.dataset.pane = id;
    root.innerHTML += `<p data-pane-status></p><button data-pane-retry hidden>Retry loading theme</button><span data-summary-fg></span><span data-summary-comment></span><section data-specimen="terminal"><span data-role="comment">comment</span></section><section data-specimen="editor" hidden>Editor</section><section data-specimen="dashboard" hidden><div data-scenario="default">Dashboard</div><div data-scenario="forms" hidden>Forms</div></section><details class="export-menu"><summary>Export ${id}</summary><button data-export="css">CSS</button><button data-export="json">JSON</button></details>`;
    original.before(root);
  }
  original.remove();
}
function addControls(): void {
  const options = records
    .map((theme) => `<option value="${theme.slug}">${theme.name}</option>`)
    .join('');
  document.body.insertAdjacentHTML(
    'beforeend',
    `<select data-reference><option value="">Single preview</option>${options}</select><button data-pin>Pin candidate as A</button><button data-swap>Swap A and B</button><button data-unpin>Remove A</button><select data-view><option>terminal</option><option>editor</option><option>dashboard</option><option>all</option></select><select data-sample><option>default</option><option>forms</option></select><select data-size><option>14</option><option>16</option><option>18</option></select><select data-recipe><option>raw</option><option>ui-v1</option></select><button data-copy-theme>Copy theme link</button><button data-copy-comparison>Copy comparison link</button><button data-mobile-pane="a">A</button><button data-mobile-pane="b">B</button><p data-explorer-notice></p><div data-role-inspector hidden><div data-inspector-results></div></div>`,
  );
}
function boot(url = '/oklch-terminal-themes/'): void {
  window.history.replaceState(null, '', url);
  document.body.innerHTML = fixture();
  const script = q<HTMLScriptElement>('#themes-data');
  script.dataset.detailsBase = '/oklch-terminal-themes/theme-data/';
  script.textContent = '[]';
  q('.listbox-list').innerHTML = records
    .map(
      (theme) =>
        `<li id="theme-opt-${theme.slug}" class="listbox-item" role="option" aria-selected="false" data-slug="${theme.slug}" data-name="${theme.name}" data-dark="${theme.isDark}" data-tags="${theme.tags.join(' ')}" data-apca="90">${theme.name}</li>`,
    )
    .join('');
  document.querySelector('.export-menu')?.remove();
  addPanes();
  addControls();
  dispose = initComparison(document, window);
}
beforeEach(() => {
  clipboard = [];
  requests = [];
  held = new Set();
  pending = new Map();
  failures = new Set();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  });
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        clipboard.push(text);
      },
    },
  });
  window.fetch = vi.fn<typeof window.fetch>(async (input) => {
    const url = new URL(String(input), window.location.href);
    const themeSlug =
      url.pathname
        .split('/')
        .at(-1)
        ?.replace(/\.json$/, '') ?? '';
    requests.push(themeSlug);
    if (held.has(themeSlug)) return new Promise((resolve) => pending.set(themeSlug, resolve));
    if (failures.has(themeSlug)) return response({}, 503);
    return response(records.find((record) => record.slug === themeSlug));
  });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
async function ready(a = 'dracula', b = 'nord'): Promise<void> {
  await vi.waitFor(() => {
    expect(slug('a')).toBe(a);
    expect(slug('b')).toBe(b);
  });
}

describe('real two-pane comparison controller', () => {
  it('loads clean defaults from full static records and scopes initial metrics', async () => {
    boot();
    await ready();
    expect(new Set(requests)).toEqual(new Set(['dracula', 'nord']));
    expect(pane('a').querySelector('[data-summary-comment]')?.textContent).toBe('3.0:1');
    expect(pane('b').querySelector('[data-summary-comment]')?.textContent).toBe('2.0:1');
    expect(q('[data-combo-label]').textContent).toBe('Nord');
  });
  it('keeps reference fixed and discards a late superseded candidate response', async () => {
    held.add('iterm2-solarized-dark');
    boot();
    await ready();
    q('#theme-opt-iterm2-solarized-dark').click();
    await vi.waitFor(() => expect(pending.has('iterm2-solarized-dark')).toBe(true));
    expect(pane('b').getAttribute('aria-busy')).toBe('true');
    q('#theme-opt-dracula').click();
    await ready('dracula', 'dracula');
    release('iterm2-solarized-dark');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(slug('b')).toBe('dracula');
    expect(slug('a')).toBe('dracula');
    expect(pane('a').style.getPropertyValue('--tt-background')).toBe(
      dracula.colors.background.oklchCss,
    );
  });
  it('pins, changes candidate, swaps and unpins with one history entry per action', async () => {
    boot();
    await ready();
    const push = vi.spyOn(window.history, 'pushState');
    q('[data-pin]').click();
    await ready('nord', 'nord');
    q('#theme-opt-iterm2-solarized-dark').click();
    await ready('nord', 'iterm2-solarized-dark');
    q('[data-swap]').click();
    await ready('iterm2-solarized-dark', 'nord');
    q('[data-unpin]').click();
    expect(pane('a').hidden).toBe(true);
    expect(q<HTMLButtonElement>('[data-swap]').disabled).toBe(true);
    expect(new URLSearchParams(location.search).has('ref')).toBe(false);
    expect(push).toHaveBeenCalledTimes(4);
    expect(slug('b')).toBe('nord');
  });
  it('restores identities and shared presentation on popstate without pushing history', async () => {
    boot();
    await ready();
    const push = vi.spyOn(window.history, 'pushState');
    history.replaceState(null, '', '?theme=dracula&ref=nord&view=editor&size=18&recipe=ui-v1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await ready('nord', 'dracula');
    for (const id of ['a', 'b'] as const) {
      expect(pane(id).style.getPropertyValue('--specimen-size')).toBe('18px');
      expect(pane(id).querySelector<HTMLElement>('[data-specimen="editor"]')?.hidden).toBe(false);
      expect(pane(id).querySelector<HTMLElement>('[data-specimen="terminal"]')?.hidden).toBe(true);
    }
    expect(q<HTMLSelectElement>('[data-recipe]').value).toBe('ui-v1');
    expect(push).not.toHaveBeenCalled();
  });
  it('retains painted colors on a failed request, gates export and retries the actual fetch', async () => {
    boot();
    await ready();
    failures.add('iterm2-solarized-dark');
    q('#theme-opt-iterm2-solarized-dark').click();
    await vi.waitFor(() =>
      expect(pane('b').querySelector<HTMLElement>('[data-pane-retry]')?.hidden).toBe(false),
    );
    expect(slug('b')).toBe('nord');
    expect(pane('b').querySelector<HTMLButtonElement>('[data-export="css"]')?.disabled).toBe(true);
    expect(q<HTMLButtonElement>('[data-copy-comparison]').disabled).toBe(true);
    expect(slug('a')).toBe('dracula');
    failures.delete('iterm2-solarized-dark');
    pane('b').querySelector<HTMLButtonElement>('[data-pane-retry]')!.click();
    await ready('dracula', 'iterm2-solarized-dark');
    expect(requests.filter((value) => value === 'iterm2-solarized-dark')).toHaveLength(2);
    expect(pane('b').querySelector<HTMLButtonElement>('[data-export="css"]')?.disabled).toBe(false);
    expect(q<HTMLButtonElement>('[data-copy-comparison]').disabled).toBe(false);
  });
  it('exports each pane once using its own canonical palette', async () => {
    boot();
    await ready();
    pane('a').querySelector<HTMLButtonElement>('[data-export="css"]')!.click();
    await vi.waitFor(() => expect(clipboard).toHaveLength(1));
    expect(clipboard[0]).toContain(dracula.colors.background.oklchCss);
    pane('b').querySelector<HTMLButtonElement>('[data-export="css"]')!.click();
    await vi.waitFor(() => expect(clipboard).toHaveLength(2));
    expect(clipboard[1]).toContain(nord.colors.background.oklchCss);
  });
  it('shares specimen, scenario and typography while keeping pane palettes independent', async () => {
    boot();
    await ready();
    change('[data-view]', 'dashboard');
    change('[data-sample]', 'forms');
    change('[data-size]', '16');
    for (const id of ['a', 'b'] as const) {
      expect(pane(id).querySelector<HTMLElement>('[data-scenario="forms"]')?.hidden).toBe(false);
      expect(pane(id).querySelector<HTMLElement>('[data-scenario="default"]')?.hidden).toBe(true);
      expect(pane(id).style.getPropertyValue('--specimen-size')).toBe('16px');
    }
    expect(slug('a')).toBe('dracula');
    expect(slug('b')).toBe('nord');
    change('[data-view]', 'editor');
    expect(q<HTMLSelectElement>('[data-sample]').disabled).toBe(true);
    expect(q<HTMLSelectElement>('[data-sample]').value).toBe('default');
  });
  it('opens a legacy single-theme link without inventing a reference', async () => {
    boot('/oklch-terminal-themes/?theme=iterm2-solarized-dark');
    await vi.waitFor(() => expect(slug('b')).toBe('iterm2-solarized-dark'));
    expect(pane('a').hidden).toBe(true);
    expect(requests).toEqual(['iterm2-solarized-dark']);
    expect(new URLSearchParams(location.search).has('ref')).toBe(false);
  });
  it('separates theme-only sharing from comparison presentation and excludes browse/private context', async () => {
    boot(
      '/oklch-terminal-themes/?theme=nord&ref=dracula&q=drac&tags=dark&sort=apca&private=secret#private',
    );
    await ready();
    change('[data-view]', 'editor');
    change('[data-size]', '18');
    q('[data-copy-theme]').click();
    await vi.waitFor(() => expect(clipboard).toHaveLength(1));
    expect(new URL(clipboard[0]!).search).toBe('?theme=nord');
    q('[data-copy-comparison]').click();
    await vi.waitFor(() => expect(clipboard).toHaveLength(2));
    const comparison = new URL(clipboard[1]!);
    expect(comparison.searchParams.get('theme')).toBe('nord');
    expect(comparison.searchParams.get('ref')).toBe('dracula');
    expect(comparison.searchParams.get('view')).toBe('editor');
    expect(comparison.searchParams.get('size')).toBe('18');
    for (const key of ['q', 'tags', 'sort', 'private'])
      expect(comparison.searchParams.has(key)).toBe(false);
    expect(comparison.hash).toBe('');
  });
  it('cannot pin an unready requested candidate during loading or failure, then enables pin after retry', async () => {
    held.add('iterm2-solarized-dark');
    boot();
    await ready();
    q('#theme-opt-iterm2-solarized-dark').click();
    await vi.waitFor(() => expect(pending.has('iterm2-solarized-dark')).toBe(true));
    const pin = q<HTMLButtonElement>('[data-pin]');
    expect(pin.disabled).toBe(true);
    pin.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(new URLSearchParams(location.search).get('ref')).toBe('dracula');
    pending.get('iterm2-solarized-dark')!(response({}, 503));
    pending.delete('iterm2-solarized-dark');
    await vi.waitFor(() =>
      expect(pane('b').querySelector<HTMLElement>('[data-pane-retry]')?.hidden).toBe(false),
    );
    expect(pin.disabled).toBe(true);
    pin.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(new URLSearchParams(location.search).get('ref')).toBe('dracula');
    expect(slug('a')).toBe('dracula');
    held.delete('iterm2-solarized-dark');
    pane('b').querySelector<HTMLButtonElement>('[data-pane-retry]')!.click();
    await ready('dracula', 'iterm2-solarized-dark');
    expect(pin.disabled).toBe(false);
    pin.click();
    await ready('iterm2-solarized-dark', 'iterm2-solarized-dark');
  });
  it('keeps candidate sharing available while the reference is still loading', async () => {
    held.add('iterm2-solarized-dark');
    boot('/oklch-terminal-themes/?theme=nord&ref=iterm2-solarized-dark');
    await vi.waitFor(() => expect(slug('b')).toBe('nord'));
    expect(q<HTMLButtonElement>('[data-copy-theme]').disabled).toBe(false);
    expect(q<HTMLButtonElement>('[data-copy-comparison]').disabled).toBe(true);
    release('iterm2-solarized-dark');
    await ready('iterm2-solarized-dark', 'nord');
    expect(q<HTMLButtonElement>('[data-copy-comparison]').disabled).toBe(false);
  });
  it('closes the picker with Escape from its focused search and restores focus', async () => {
    boot();
    await ready();
    q('.combo-trigger').click();
    const search = q<HTMLInputElement>('#theme-search');
    expect(document.activeElement).toBe(search);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.combo-trigger').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(q('.combo-trigger'));
  });
});
