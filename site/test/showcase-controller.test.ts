// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initShowcaseController } from '../src/lib/showcase-controller';

import { fixture } from './fixtures/showcase-dom';

let dispose: (() => void) | undefined;

/**
 * Loads the fixture at `url` and starts a fresh controller over it.
 *
 * The previous controller is disposed first. `document.body.innerHTML = ...`
 * replaces the markup but NOT the listeners a controller registered on
 * `document`/`window`, so without this every `boot` leaves another live
 * controller behind and a single `popstate` fans out to all of them.
 */
function boot(url = '/'): void {
  dispose?.();
  window.history.replaceState(null, '', url);
  document.body.innerHTML = fixture();
  dispose = initShowcaseController(document, window);
}

const q = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`fixture is missing ${sel}`);
  return el;
};

const visibleSlugs = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.listbox-list .listbox-item'))
    .filter((li) => !li.hidden)
    .map((li) => li.dataset.slug ?? '');

const themeParam = (): string | null => new URLSearchParams(window.location.search).get('theme');

const key = (target: Element | Document, k: string, init: KeyboardEventInit = {}): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
};

let clipboard: string[];

beforeEach(() => {
  // jsdom implements neither of these; both are fire-and-forget in the
  // controller, so no-op stubs are faithful.
  Element.prototype.scrollIntoView = (): void => {};
  clipboard = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string): Promise<void> => {
        clipboard.push(text);
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
});

describe('URL -> theme on load', () => {
  it('applies the theme named in ?theme=', () => {
    boot('/?theme=nord-light');
    expect(q('[data-theme-name]').textContent).toBe('Nord Light');
    expect(q('[data-theme-meta]').textContent).toBe('light · nord-light');
  });

  it('falls back to the default when ?theme= names an unknown slug', () => {
    // A stale or hand-edited permalink must not leave the page blank.
    boot('/?theme=does-not-exist');
    expect(q('[data-theme-name]').textContent).toBe('Dracula');
  });

  it('falls back to the default when ?theme= is absent', () => {
    boot('/');
    expect(q('[data-theme-name]').textContent).toBe('Dracula');
  });

  it('sets the colour custom properties on .showcase', () => {
    boot('/?theme=nord-light');
    const showcase = q<HTMLElement>('.showcase');
    expect(showcase.style.getPropertyValue('--tt-background')).toBe('oklch(0.98 0.01 250)');
    expect(showcase.style.getPropertyValue('--tt-foreground')).toBe('oklch(0.3 0.02 250)');
  });

  it('fills the palette chip values and the WCAG badge', () => {
    boot('/?theme=solarized-dark');
    const chip = q<HTMLElement>('.palette-chip[data-key="background"] [data-value]');
    expect(chip.textContent).toBe('oklch(0.25 0.02 200)');
    const badge = q<HTMLElement>('[data-wcag-badge]');
    expect(badge.hidden).toBe(false);
    expect(badge.dataset.wcagLevel).toBe('AA');
  });

  it('renders only as many dataviz swatches as the theme has colours', () => {
    // Dracula has 2 categorical colours and the fixture pre-renders 2 bars.
    boot('/?theme=dracula');
    const bars = Array.from(document.querySelectorAll<HTMLElement>('[data-viz-bar]'));
    expect(bars.map((b) => b.hidden)).toEqual([false, false]);

    // Solarized Dark has 1 — the second must hide, not keep a stale colour.
    boot('/?theme=solarized-dark');
    const after = Array.from(document.querySelectorAll<HTMLElement>('[data-viz-bar]'));
    expect(after.map((b) => b.hidden)).toEqual([false, true]);
  });
});

describe('theme -> URL', () => {
  it('writes ?theme= when an option is clicked, without a navigation', () => {
    boot('/');
    q<HTMLElement>('#theme-opt-nord-light').click();
    expect(themeParam()).toBe('nord-light');
    expect(q('[data-theme-name]').textContent).toBe('Nord Light');
  });

  it('preserves unrelated query params when switching themes', () => {
    // A user who has filtered and then steps through themes must keep the
    // filter; `setSlug` rebuilds the URL and could easily drop it.
    boot('/?q=sol&theme=dracula');
    q<HTMLElement>('#theme-opt-nord-light').click();
    expect(new URLSearchParams(window.location.search).get('q')).toBe('sol');
  });

  it('ignores a slug that is not in the corpus', () => {
    boot('/?theme=dracula');
    const li = q<HTMLElement>('#theme-opt-nord-light');
    li.dataset.slug = 'ghost';
    li.click();
    expect(themeParam()).toBe('dracula');
  });
});

describe('search filtering', () => {
  it('matches a multi-word query (#212)', () => {
    // This is the exact regression: the old code derived the name as
    // `data-search.split(' ')[0]`, so any query with a space matched nothing.
    boot('/');
    q<HTMLElement>('.combo-trigger').click();
    const input = q<HTMLInputElement>('#theme-search');
    input.value = 'solarized dark';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visibleSlugs()).toEqual(['solarized-dark']);
  });

  it('shows the empty state and a count when nothing matches', () => {
    boot('/');
    q<HTMLElement>('.combo-trigger').click();
    const input = q<HTMLInputElement>('#theme-search');
    input.value = 'zzzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visibleSlugs()).toEqual([]);
    expect(q<HTMLElement>('.listbox-empty').hidden).toBe(false);
    expect(q('#listbox-count').textContent).toBe('0 of 3 themes');
  });

  it('restores the query from ?q= on load', () => {
    boot('/?q=nord');
    expect(visibleSlugs()).toEqual(['nord-light']);
  });
});

describe('tag filters', () => {
  it('toggles a tag, updates aria-pressed and syncs ?tags=', () => {
    boot('/');
    const chip = q<HTMLElement>('.tag-chip[data-tag="light"]');
    chip.click();
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(visibleSlugs()).toEqual(['nord-light']);
    expect(new URLSearchParams(window.location.search).get('tags')).toBe('light');
  });

  it('untoggles on a second click', () => {
    boot('/');
    const chip = q<HTMLElement>('.tag-chip[data-tag="light"]');
    chip.click();
    chip.click();
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(visibleSlugs()).toHaveLength(3);
  });

  it('reset clears the query and every chip', () => {
    boot('/?q=nord&tags=light');
    q<HTMLElement>('.combo-trigger').click();
    q<HTMLElement>('[data-action="reset-filters"]').click();
    expect(visibleSlugs()).toHaveLength(3);
    expect(q<HTMLInputElement>('#theme-search').value).toBe('');
    for (const chip of document.querySelectorAll('.tag-chip[data-tag]')) {
      expect(chip.getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('marks chips pressed from ?tags= on load', () => {
    boot('/?tags=popular');
    expect(q('.tag-chip[data-tag="popular"]').getAttribute('aria-pressed')).toBe('true');
    expect(q('.tag-chip[data-tag="light"]').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('sort', () => {
  it('leaves build order alone by default', () => {
    boot('/');
    expect(visibleSlugs()).toEqual(['dracula', 'solarized-dark', 'nord-light']);
  });

  it('reorders the DOM by descending APCA for ?sort=apca', () => {
    boot('/?sort=apca');
    expect(visibleSlugs()).toEqual(['dracula', 'nord-light', 'solarized-dark']);
    expect(q<HTMLSelectElement>('#theme-sort').value).toBe('apca');
  });

  it('makes next/prev follow the ACTIVE sort order (#214)', () => {
    // The regression: navigation read a build-order array that `applySort`
    // never touched, so with ?sort=apca the buttons stepped through a
    // different order than the list showed.
    // In build order nord-light is last, so next wraps to dracula. In APCA
    // order it is the middle row and next is solarized-dark. Asserting the
    // step that DIFFERS is the whole point.
    boot('/?sort=apca&theme=nord-light');
    q<HTMLElement>('[data-nav="next"]').click();
    expect(themeParam()).toBe('solarized-dark');
    q<HTMLElement>('[data-nav="next"]').click();
    expect(themeParam()).toBe('dracula');
  });

  it('restores build order when switching back to default', () => {
    boot('/?sort=apca');
    const select = q<HTMLSelectElement>('#theme-sort');
    select.value = 'default';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(visibleSlugs()).toEqual(['dracula', 'solarized-dark', 'nord-light']);
    expect(new URLSearchParams(window.location.search).get('sort')).toBeNull();
  });
});

describe('prev / next / random', () => {
  it('steps forward and wraps at the end', () => {
    boot('/?theme=nord-light');
    q<HTMLElement>('[data-nav="next"]').click();
    expect(themeParam()).toBe('dracula');
  });

  it('steps backward and wraps at the start', () => {
    boot('/?theme=dracula');
    q<HTMLElement>('[data-nav="prev"]').click();
    expect(themeParam()).toBe('nord-light');
  });

  it('only steps through themes that pass the active filter', () => {
    boot('/?tags=dark&theme=dracula');
    q<HTMLElement>('[data-nav="next"]').click();
    expect(themeParam()).toBe('solarized-dark');
    q<HTMLElement>('[data-nav="next"]').click();
    expect(themeParam()).toBe('dracula');
  });

  it('random picks from the visible set only', () => {
    boot('/?tags=light');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    q<HTMLElement>('[data-action="random"]').click();
    expect(themeParam()).toBe('nord-light');
    vi.restoreAllMocks();
  });
});

describe('listbox keyboard navigation (#206)', () => {
  function open(): HTMLInputElement {
    boot('/');
    q<HTMLElement>('.combo-trigger').click();
    return q<HTMLInputElement>('#theme-search');
  }

  it('seats the virtual cursor on the current theme when opened', () => {
    boot('/?theme=solarized-dark');
    q<HTMLElement>('.combo-trigger').click();
    expect(q('#theme-search').getAttribute('aria-activedescendant')).toBe(
      'theme-opt-solarized-dark',
    );
  });

  it('moves the cursor with ArrowDown/ArrowUp without moving focus', () => {
    const input = open();
    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('theme-opt-solarized-dark');
    key(input, 'ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe('theme-opt-dracula');
    // Options are never focused — that is the ARIA APG editable-combobox
    // pattern, and it is what keeps typing filtering the list.
    expect(document.activeElement).toBe(input);
  });

  it('clamps at both ends rather than wrapping', () => {
    // Wrapping a 633-item list you cannot see all of is disorienting.
    const input = open();
    key(input, 'Home');
    key(input, 'ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe('theme-opt-dracula');
    key(input, 'End');
    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('theme-opt-nord-light');
  });

  it('commits the active option on Enter and closes', () => {
    const input = open();
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(themeParam()).toBe('solarized-dark');
    expect(q<HTMLElement>('#theme-listbox').hidden).toBe(true);
  });

  it('re-seats the cursor on the first match as the query narrows', () => {
    const input = open();
    input.value = 'nord';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.getAttribute('aria-activedescendant')).toBe('theme-opt-nord-light');
  });

  it('drops the cursor entirely when nothing matches', () => {
    const input = open();
    input.value = 'zzzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    key(input, 'Enter');
    expect(themeParam()).toBeNull();
  });

  it('marks the active option for sighted keyboard users too', () => {
    const input = open();
    key(input, 'ArrowDown');
    expect(q('#theme-opt-solarized-dark').classList.contains('is-active')).toBe(true);
    expect(q('#theme-opt-dracula').classList.contains('is-active')).toBe(false);
  });
});

describe('opening and closing the listbox (#211)', () => {
  it('returns focus to the trigger on Escape', () => {
    // Without this, focus falls back to <body> and the user's tab position is
    // lost after every selection and every Escape.
    boot('/');
    const combo = q<HTMLElement>('.combo-trigger');
    combo.click();
    key(q('#theme-search'), 'Escape');
    expect(q<HTMLElement>('#theme-listbox').hidden).toBe(true);
    expect(document.activeElement).toBe(combo);
  });

  it('returns focus to the trigger after committing a selection', () => {
    boot('/');
    const combo = q<HTMLElement>('.combo-trigger');
    combo.click();
    q<HTMLElement>('#theme-opt-nord-light').click();
    expect(document.activeElement).toBe(combo);
  });

  it('closes on an outside click but not on a click inside', () => {
    boot('/');
    q<HTMLElement>('.combo-trigger').click();
    q<HTMLElement>('#theme-search').click();
    expect(q<HTMLElement>('#theme-listbox').hidden).toBe(false);
    document.body.click();
    expect(q<HTMLElement>('#theme-listbox').hidden).toBe(true);
  });

  it('toggles closed when the trigger is clicked again', () => {
    boot('/');
    const combo = q<HTMLElement>('.combo-trigger');
    combo.click();
    combo.click();
    expect(q<HTMLElement>('#theme-listbox').hidden).toBe(true);
    expect(combo.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('single-key shortcuts (WCAG 2.1.4, #219)', () => {
  it('fires `r` only when focus is on the page body', () => {
    boot('/');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    key(document, 'r');
    expect(themeParam()).toBe('dracula');

    // With focus on any button — a palette chip, a tag filter — a printable
    // key must not be hijacked. The exemption WCAG 2.1.4 grants is
    // "active only on focus", so body-focus is the gate.
    window.history.replaceState(null, '', '/');
    q<HTMLElement>('[data-nav="next"]').focus();
    key(document, 'r');
    expect(themeParam()).toBeNull();
    vi.restoreAllMocks();
  });

  it('opens the listbox on `/` only when focus is on the body', () => {
    boot('/');
    q<HTMLElement>('[data-nav="next"]').focus();
    key(document, '/');
    expect(q<HTMLElement>('#theme-listbox').hidden).toBe(true);

    q<HTMLElement>('[data-nav="next"]').blur();
    key(document, '/');
    expect(q<HTMLElement>('#theme-listbox').hidden).toBe(false);
  });

  it('ignores shortcuts while typing in the search field', () => {
    boot('/');
    q<HTMLElement>('.combo-trigger').click();
    const input = q<HTMLInputElement>('#theme-search');
    key(input, 'r');
    key(input, 'ArrowRight');
    expect(themeParam()).toBeNull();
  });

  it('ignores shortcuts held with a modifier', () => {
    // Ctrl+R is reload; hijacking it would be hostile.
    boot('/');
    key(document, 'r', { ctrlKey: true });
    key(document, 'ArrowRight', { metaKey: true });
    expect(themeParam()).toBeNull();
  });

  it('steps with ArrowLeft/ArrowRight from the body', () => {
    boot('/?theme=dracula');
    key(document, 'ArrowRight');
    expect(themeParam()).toBe('solarized-dark');
    key(document, 'ArrowLeft');
    expect(themeParam()).toBe('dracula');
  });
});

describe('export menu', () => {
  it('copies a permalink with no filter state attached (#219)', async () => {
    // `location.href` carries whatever ?q=/?tags=/?sort= the sender happened
    // to have, so a shared link silently opened a filtered view the
    // recipient never chose.
    boot('/?theme=nord-light&q=nord&tags=light&sort=apca');
    q<HTMLElement>('[data-export="permalink"]').click();
    await vi.waitFor(() => expect(clipboard).toHaveLength(1));
    expect(clipboard[0]).toContain('?theme=nord-light');
    expect(clipboard[0]).not.toContain('q=');
    expect(clipboard[0]).not.toContain('tags=');
    expect(clipboard[0]).not.toContain('sort=');
  });

  it('copies CSS variables for the active theme', async () => {
    boot('/?theme=nord-light');
    q<HTMLElement>('[data-export="css"]').click();
    await vi.waitFor(() => expect(clipboard).toHaveLength(1));
    // The export uses the package's public `--terminal-*` names, not the
    // `--tt-*` ones the live preview sets on `.showcase`.
    expect(clipboard[0]).toContain('--terminal-background: oklch(0.98 0.01 250)');
  });

  it('reports failure rather than claiming a copy that did not happen', async () => {
    boot('/?theme=dracula');
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: undefined });
    q<HTMLElement>('[data-export="css"]').click();
    const summary = q<HTMLElement>('.export-menu summary');
    await vi.waitFor(() => expect(summary.dataset.feedback).toBe('clipboard blocked'));
    expect(summary.dataset.feedbackOk).toBe('false');
  });
});

describe('palette and dataviz swatch copy', () => {
  it('copies a palette chip value and shows the toast', async () => {
    boot('/?theme=nord-light');
    q<HTMLElement>('.palette-chip[data-key="foreground"]').click();
    const toast = q<HTMLElement>('[data-toast]');
    await vi.waitFor(() => expect(toast.textContent).toBe('copied oklch(0.3 0.02 250)'));
    expect(clipboard).toEqual(['oklch(0.3 0.02 250)']);
    expect(toast.dataset.visible).toBe('true');
  });

  it('copies a dataviz swatch by index', async () => {
    boot('/?theme=nord-light');
    q<HTMLElement>('.viz-chip[data-viz-swatch="1"]').click();
    await vi.waitFor(() => expect(clipboard).toEqual(['oklch(0.5 0.12 90)']));
  });

  it('does nothing for a swatch the theme does not have', async () => {
    // Solarized Dark has one categorical colour; the second chip is hidden
    // but still in the DOM, so a stray click must be inert.
    boot('/?theme=solarized-dark');
    q<HTMLElement>('.viz-chip[data-viz-swatch="1"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(clipboard).toEqual([]);
  });
});

describe('screen-reader announcements (#210)', () => {
  it('stays silent on first paint', () => {
    // Announcing the theme the page merely loaded with would talk over a
    // user who has not asked for anything yet.
    boot('/?theme=nord-light');
    expect(q('[data-theme-announcer]').textContent).toBe('');
  });

  it('announces name, polarity and contrast once the user navigates', () => {
    boot('/?theme=dracula');
    q<HTMLElement>('[data-nav="next"]').click();
    expect(q('[data-theme-announcer]').textContent).toBe('Solarized Dark, dark, contrast 4.6:1 AA');
  });

  it('uses the same rounded string the badge shows, so the two never disagree', () => {
    boot('/?theme=dracula');
    q<HTMLElement>('#theme-opt-nord-light').click();
    const announced = q('[data-theme-announcer]').textContent ?? '';
    expect(announced).toContain(q('[data-wcag-ratio]').textContent ?? 'MISSING');
  });
});

describe('popstate (back/forward)', () => {
  it('re-syncs theme, query, chips and sort from the new URL', () => {
    boot('/?theme=dracula');
    window.history.replaceState(null, '', '/?theme=nord-light&q=nord&tags=light&sort=apca');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(q('[data-theme-name]').textContent).toBe('Nord Light');
    expect(q<HTMLInputElement>('#theme-search').value).toBe('nord');
    expect(q('.tag-chip[data-tag="light"]').getAttribute('aria-pressed')).toBe('true');
    expect(q<HTMLSelectElement>('#theme-sort').value).toBe('apca');
    expect(visibleSlugs()).toEqual(['nord-light']);
  });

  it('clears filter state when navigating back to a bare URL', () => {
    boot('/?q=nord&tags=light');
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(q<HTMLInputElement>('#theme-search').value).toBe('');
    expect(q('.tag-chip[data-tag="light"]').getAttribute('aria-pressed')).toBe('false');
    expect(visibleSlugs()).toHaveLength(3);
  });
});

describe('degraded DOM', () => {
  it('does not throw when the showcase markup is absent', () => {
    // The controller is loaded on every page that includes the component; a
    // missing optional region must not take the whole script down.
    dispose?.();
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '<div></div>';
    expect(() => {
      dispose = initShowcaseController(document, window);
    }).not.toThrow();
  });

  it('does not throw when the themes payload is missing', () => {
    dispose?.();
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '<div class="showcase"></div>';
    expect(() => {
      dispose = initShowcaseController(document, window);
    }).not.toThrow();
  });
});
