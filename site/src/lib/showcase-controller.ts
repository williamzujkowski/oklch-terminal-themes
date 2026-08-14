// The picker's client-side controller.
//
// Extracted from `ShowcaseController.astro` (issue #178), which held ~630
// lines of behaviour inside a single `<script>` tag — the largest untested
// unit in the repo. Nothing about it needed to live in the component: it is
// DOM orchestration, and taking `doc`/`win` as parameters makes all of it
// reachable from jsdom.
//
// `doc`/`win` are injected rather than read off the globals so a test can
// drive a fixture document and a controlled URL. Production still passes the
// real `document`/`window` from the component's inline script.
//
// All state is URL-driven: `?theme=<slug>`, `?q=`, `?tags=`, `?sort=`.
//
// This file is wiring only (issue #286). The behaviour lives in four
// collaborators, split along where the state actually clusters:
//
//   theme-store.ts      which theme is selected, and its data
//   theme-paint.ts      painting a theme onto the showcase
//   theme-listbox.ts    filtering, sorting, keyboard navigation
//   theme-clipboard.ts  copy-to-clipboard for exports, chips and swatches
//
// What stays here is what genuinely spans them: selecting a slug (store +
// paint + URL), stepping through the visible list (listbox + selection), and
// the document-level keyboard shortcuts.

import { createThemeStore, type ThemeStore } from './theme-store';
import { createThemePainter } from './theme-paint';
import { createListbox, type Listbox } from './theme-listbox';
import { wireClipboard } from './theme-clipboard';

interface Controller {
  doc: Document;
  win: Window;
  signal: AbortSignal;
  store: ThemeStore;
  listbox: Listbox;
  applyTheme: () => void;
  setSlug: (slug: string) => void;
  step: (delta: number) => void;
}

function wireNav(c: Controller): void {
  for (const btn of c.doc.querySelectorAll<HTMLElement>('[data-nav]')) {
    btn.addEventListener(
      'click',
      () => {
        c.step(btn.dataset.nav === 'next' ? 1 : -1);
      },
      { signal: c.signal },
    );
  }
  c.doc.querySelector<HTMLElement>('[data-action="random"]')?.addEventListener(
    'click',
    () => {
      const slugs = c.listbox.visibleSlugs();
      if (slugs.length === 0) return;
      const pick = slugs[Math.floor(Math.random() * slugs.length)];
      if (pick) c.setSlug(pick);
    },
    { signal: c.signal },
  );
}

function typingIntoEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT' ||
    t.isContentEditable
  );
}

// A printable-character shortcut may only fire when nothing focusable owns
// the keystroke. `typingIntoEditable` catches inputs; this also catches
// buttons, links and anything else with focus.
function focusIsOnBody(doc: Document): boolean {
  const active = doc.activeElement;
  return active === null || active === doc.body || active === doc.documentElement;
}

/**
 * Shortcuts that require focus to be on the page body.
 *
 * WCAG 2.1.4 Character Key Shortcuts: a single-key shortcut must be
 * remappable, turn-off-able, or active only on focus. `typingIntoEditable`
 * covers inputs, but with focus on any BUTTON — a palette chip, a tag filter
 * — pressing `r` still fired. Restricting these to focus-on-body satisfies
 * the "active only on focus" exception without adding a settings UI (#219).
 *
 * `/` is handled the same way for consistency, though as a punctuation key it
 * is arguably exempt.
 */
function onBodyShortcut(c: Controller, key: string): boolean {
  if (!focusIsOnBody(c.doc)) return false;
  if (key === '/') {
    c.listbox.open();
    return true;
  }
  // Random.
  c.doc.querySelector<HTMLElement>('[data-action="random"]')?.click();
  return true;
}

/** Arrow keys are exempt from WCAG 2.1.4 — they are not character keys. */
function onArrowShortcut(c: Controller, key: string): boolean {
  if (key === 'ArrowLeft') {
    c.step(-1);
    return true;
  }
  if (key === 'ArrowRight') {
    c.step(1);
    return true;
  }
  return false;
}

function onShortcut(c: Controller, ev: KeyboardEvent): void {
  const { key } = ev;
  if (key === 'Escape') {
    if (!c.listbox.isOpen()) return;
    ev.preventDefault();
    c.listbox.close();
    return;
  }
  if (onArrowShortcut(c, key)) {
    ev.preventDefault();
    return;
  }
  if ((key === '/' || key === 'r' || key === 'R') && onBodyShortcut(c, key)) {
    ev.preventDefault();
  }
}

function stepBy(c: Controller, delta: number): void {
  const slugs = c.listbox.visibleSlugs();
  if (slugs.length === 0) return;
  const idx = slugs.indexOf(c.store.currentSlug());
  const next = slugs[(idx + delta + slugs.length) % slugs.length];
  if (next !== undefined) c.setSlug(next);
}

function wirePopstate(c: Controller): void {
  c.win.addEventListener(
    'popstate',
    () => {
      c.listbox.syncFromUrl();
      c.applyTheme();
    },
    { signal: c.signal },
  );
}

function wireKeyboard(c: Controller): void {
  c.doc.addEventListener(
    'keydown',
    (ev) => {
      // Escape still has to work from inside the search field; every other
      // shortcut must not fire while the user is typing.
      if (typingIntoEditable(ev.target)) {
        if (ev.key === 'Escape' && c.listbox.isOpen()) {
          ev.preventDefault();
          c.listbox.close();
        }
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      onShortcut(c, ev);
    },
    { signal: c.signal },
  );
}

/**
 * Wires every control in the showcase to the injected document.
 *
 * Call once per document. All listener registration and the initial
 * `applyTheme()` happen here.
 *
 * Returns a disposer that removes every listener this call registered. The
 * page never needs it — there is one controller per page load — but the
 * `doc`/`win` listeners outlive `document.body.innerHTML = ...`, so without
 * a way to detach them a second `init` leaves the first one live and both
 * respond to `popstate`. That is a re-entrancy bug whether or not a test is
 * the thing that trips it.
 */
export function initShowcaseController(doc: Document, win: Window): () => void {
  const listeners = new AbortController();
  const { signal } = listeners;

  const store = createThemeStore(doc, win);
  const paint = createThemePainter(doc);

  const applyTheme = (): void => {
    store.withTheme(store.currentSlug(), paint);
  };

  const setSlug = (slug: string): void => {
    if (!store.knows(slug)) return;
    const next = new URL(win.location.href);
    next.searchParams.set('theme', slug);
    win.history.replaceState(null, '', next.toString());
    applyTheme();
  };

  const listbox = createListbox(doc, win, {
    signal,
    currentSlug: store.currentSlug,
    selectSlug: setSlug,
  });

  const c: Controller = {
    doc,
    win,
    signal,
    store,
    listbox,
    applyTheme,
    setSlug,
    step: (delta) => {
      stepBy(c, delta);
    },
  };

  wireClipboard(doc, win, { signal, currentSlug: store.currentSlug, resolve: store.resolve });
  wireNav(c);
  wireKeyboard(c);
  wirePopstate(c);

  // Started immediately, not awaited: first paint already has the default
  // theme inlined, and everything the listbox needs is in the server-rendered
  // options. This just gets the remaining themes in flight as early as
  // possible, so a `?theme=` permalink resolves without a visible wait (#211).
  void store.loadAll();
  applyTheme();

  return () => {
    listeners.abort();
  };
}
