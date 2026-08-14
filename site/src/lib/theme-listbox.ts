// The theme picker's listbox: filtering, sorting, and keyboard navigation.
//
// Extracted from `showcase-controller.ts` (issue #286). This cluster is one
// unit and is deliberately not split into separate "filtering" and
// "navigation" modules: `applyFilters` re-seats the virtual cursor, `open`
// runs the filters, and `commitActiveOption` closes the list. Separating them
// would mean passing `activeIndex`, `listboxOpen` and `filterState` back and
// forth across a module boundary for no gain.
//
// What it does NOT own: which theme is selected. That is the store's and the
// controller's; this reports a chosen slug through `selectSlug`.
//
// The mutable state lives in an explicit `ListboxState` record. Keeping it in
// closure variables would make the factory one 240-line function — readable
// only top-to-bottom, and impossible to reason about a piece at a time. This
// is the shape that made the decomposition possible at all.

import {
  matches,
  parseFilterFromUrl,
  writeFilterToUrl,
  parseSortFromUrl,
  writeSortToUrl,
  type FilterState,
  type SortMode,
} from './theme-filter';

export interface ListboxDeps {
  /** Aborting removes every listener this factory registers. */
  signal: AbortSignal;
  /** The slug currently selected, used to seat the cursor and mark options. */
  currentSlug: () => string;
  /** Called when the user commits an option. */
  selectSlug: (slug: string) => void;
}

export interface Listbox {
  open(): void;
  close(): void;
  /** Whether the list is currently expanded. */
  isOpen(): boolean;
  /** Visible option slugs, in rendered (i.e. sorted) order. */
  visibleSlugs(): string[];
  /** Re-reads `?q=`/`?tags=`/`?sort=` — used on load and on `popstate`. */
  syncFromUrl(): void;
}

interface ListboxState {
  doc: Document;
  win: Window;
  deps: ListboxDeps;
  root: HTMLElement | null;
  search: HTMLInputElement | null;
  sortSelect: HTMLSelectElement | null;
  countEl: HTMLOutputElement | null;
  emptyEl: HTMLElement | null;
  resetBtn: HTMLButtonElement | null;
  tagChips: HTMLButtonElement[];
  items: HTMLElement[];
  /** Build-time order, captured so `sort=default` can always restore it. */
  originalOrder: HTMLElement[];
  open: boolean;
  activeIndex: number;
  filter: FilterState;
  sort: SortMode;
}

/**
 * Visible options **in the order they are rendered**.
 *
 * Queries the DOM rather than filtering `items` (issue #214). `items` is
 * captured once at load and stays in build order forever; `applySort`
 * reorders the <li> nodes, not that array. Reading the array therefore
 * stepped through themes in popular-then-name order even with `?sort=apca`
 * active — for both keyboard navigation and prev/next/random.
 *
 * Every other use of `items` (filtering, counting, clearing the active class)
 * is order-independent, so those keep using the cheaper captured array.
 */
function visibleItems(s: ListboxState): HTMLElement[] {
  return Array.from(s.doc.querySelectorAll<HTMLElement>('.listbox-list .listbox-item')).filter(
    (li) => !li.hidden,
  );
}

// Reorders the actual <li> DOM nodes (not a virtual list), so prev/next/random
// and keyboard navigation step through themes in the chosen sort order too —
// both go through `visibleItems()`, which queries the DOM.
function applySort(s: ListboxState, mode: SortMode): void {
  const list = s.doc.querySelector<HTMLElement>('.listbox-list');
  if (!list) return;
  const ordered =
    mode === 'apca'
      ? [...s.items].sort((a, b) => {
          const av = Number.parseFloat(a.dataset.apca ?? '0');
          const bv = Number.parseFloat(b.dataset.apca ?? '0');
          return bv - av || (a.dataset.slug ?? '').localeCompare(b.dataset.slug ?? '');
        })
      : s.originalOrder;
  for (const li of ordered) list.appendChild(li);
}

function setActiveOption(s: ListboxState, index: number): void {
  const items = visibleItems(s);
  for (const li of s.items) li.classList.remove('is-active');

  if (items.length === 0 || index < 0) {
    s.activeIndex = -1;
    s.search?.removeAttribute('aria-activedescendant');
    return;
  }

  s.activeIndex = Math.max(0, Math.min(index, items.length - 1));
  const li = items[s.activeIndex];
  if (!li) return;
  li.classList.add('is-active');
  if (li.id) s.search?.setAttribute('aria-activedescendant', li.id);
  li.scrollIntoView({ block: 'nearest' });
}

function moveActive(s: ListboxState, delta: number): void {
  const items = visibleItems(s);
  if (items.length === 0) return;
  // Clamp rather than wrap: wrapping from the end back to the top of a
  // 644-item list is disorienting when you cannot see the whole list.
  //
  // The `Math.max` matters: `setActiveOption` treats a negative index as "no
  // active option" and drops `aria-activedescendant` entirely, so without it
  // ArrowUp on the first row silently deselected instead of clamping — the
  // opposite of what this comment promised.
  const from = s.activeIndex === -1 ? (delta > 0 ? -1 : items.length) : s.activeIndex;
  setActiveOption(s, Math.max(0, from + delta));
}

function optionFor(li: HTMLElement): {
  slug: string;
  name: string;
  isDark: boolean;
  tags: string[];
} {
  // #212: this used to derive `name` as `data-search.split(' ')[0]` — the
  // FIRST WORD ONLY — and then AND that truncated match against a separate
  // full-blob check. The two disagreed, so any query containing a space
  // matched the blob but failed `matches()` and returned nothing: "solarized
  // dark" and "higher contrast" were both unreachable. Now there is one path,
  // fed the real name.
  return {
    slug: li.dataset.slug ?? '',
    name: li.dataset.name ?? '',
    isDark: li.dataset.dark === 'true',
    tags: (li.dataset.tags ?? '').split(' ').filter(Boolean),
  };
}

function applyFilters(s: ListboxState): void {
  let visible = 0;
  for (const li of s.items) {
    const ok = matches(optionFor(li), s.filter);
    li.hidden = !ok;
    if (ok) visible++;
  }
  countLabel(s, visible);
  if (s.emptyEl) s.emptyEl.hidden = visible > 0;
  // The active option may have just been filtered out; re-seat the virtual
  // cursor on the first still-visible row so ArrowDown/Enter stay coherent as
  // the user types (#206).
  if (s.open) setActiveOption(s, visible > 0 ? 0 : -1);
  const url = writeFilterToUrl(s.filter, new URL(s.win.location.href));
  s.win.history.replaceState(null, '', url.toString());
}

function countLabel(s: ListboxState, visible: number): void {
  if (!s.countEl) return;
  s.countEl.textContent = `${visible.toLocaleString()} of ${s.items.length.toLocaleString()} themes`;
}

function openListbox(s: ListboxState): void {
  if (!s.root) return;
  s.open = true;
  s.root.hidden = false;
  s.doc.querySelector<HTMLElement>('.combo-trigger')?.setAttribute('aria-expanded', 'true');
  const slug = s.deps.currentSlug();
  for (const li of s.items) {
    li.setAttribute('aria-selected', li.dataset.slug === slug ? 'true' : 'false');
  }
  if (s.search) {
    s.search.value = s.filter.query;
    s.search.focus();
    s.search.select();
  }
  applyFilters(s);
  // Start the virtual cursor on the current theme so Enter is immediately
  // meaningful and screen readers announce a position on open (#206).
  setActiveOption(
    s,
    visibleItems(s).findIndex((li) => li.dataset.slug === slug),
  );
}

function closeListbox(s: ListboxState): void {
  if (!s.root) return;
  s.root.hidden = true;
  s.open = false;
  const combo = s.doc.querySelector<HTMLElement>('.combo-trigger');
  combo?.setAttribute('aria-expanded', 'false');
  // Focus was on the search field, which is now inside a hidden subtree —
  // without this it falls back to <body> and the user's tab position is lost
  // after every selection and every Escape (#211).
  combo?.focus();
}

function commitActiveOption(s: ListboxState): void {
  const li = visibleItems(s)[s.activeIndex];
  if (!li) return;
  s.deps.selectSlug(li.dataset.slug ?? '');
  closeListbox(s);
}

// ===== Keyboard navigation (#206) =====
//
// Options carry no tabindex and are never focused: focus stays in the search
// field so typing keeps filtering, and `aria-activedescendant` carries the
// virtual cursor. That is the ARIA APG editable-combobox pattern, and it is
// what makes the picker operable without a mouse — the list previously bound
// `click` only, so a keyboard user could filter but had no way to commit.
function onSearchKeydown(s: ListboxState, ev: KeyboardEvent): void {
  switch (ev.key) {
    case 'ArrowDown':
      ev.preventDefault();
      moveActive(s, 1);
      break;
    case 'ArrowUp':
      ev.preventDefault();
      moveActive(s, -1);
      break;
    case 'Home':
      ev.preventDefault();
      setActiveOption(s, 0);
      break;
    case 'End':
      ev.preventDefault();
      setActiveOption(s, visibleItems(s).length - 1);
      break;
    case 'Enter':
      ev.preventDefault();
      commitActiveOption(s);
      break;
  }
}

function wireFilterControls(s: ListboxState): void {
  const { signal } = s.deps;
  s.search?.addEventListener(
    'input',
    () => {
      s.filter = { query: s.search?.value.trim() ?? '', tags: new Set(s.filter.tags) };
      applyFilters(s);
    },
    { signal },
  );
  for (const chip of s.tagChips) {
    chip.addEventListener(
      'click',
      () => {
        const tag = chip.dataset.tag ?? '';
        const next = new Set(s.filter.tags);
        if (next.has(tag)) next.delete(tag);
        else next.add(tag);
        chip.setAttribute('aria-pressed', next.has(tag) ? 'true' : 'false');
        s.filter = { query: s.filter.query, tags: next };
        applyFilters(s);
      },
      { signal },
    );
  }
  s.resetBtn?.addEventListener(
    'click',
    () => {
      s.filter = { query: '', tags: new Set() };
      if (s.search) s.search.value = '';
      for (const chip of s.tagChips) chip.setAttribute('aria-pressed', 'false');
      applyFilters(s);
    },
    { signal },
  );
}

function wireSort(s: ListboxState): void {
  s.sortSelect?.addEventListener(
    'change',
    () => {
      s.sort = s.sortSelect?.value === 'apca' ? 'apca' : 'default';
      applySort(s, s.sort);
      const url = writeSortToUrl(s.sort, new URL(s.win.location.href));
      s.win.history.replaceState(null, '', url.toString());
    },
    { signal: s.deps.signal },
  );
}

function wireOpenClose(s: ListboxState): void {
  const { signal } = s.deps;
  s.doc.querySelector<HTMLElement>('.combo-trigger')?.addEventListener(
    'click',
    () => {
      if (s.open) closeListbox(s);
      else openListbox(s);
    },
    { signal },
  );
  // Close when clicking outside.
  s.doc.addEventListener(
    'click',
    (ev) => {
      if (!s.root || s.root.hidden) return;
      const target = ev.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#theme-listbox') || target.closest('.combo-trigger')) return;
      closeListbox(s);
    },
    { signal },
  );
  for (const li of s.items) {
    li.addEventListener(
      'click',
      () => {
        s.deps.selectSlug(li.dataset.slug ?? '');
        closeListbox(s);
      },
      { signal },
    );
  }
  s.search?.addEventListener(
    'keydown',
    (ev) => {
      onSearchKeydown(s, ev);
    },
    { signal },
  );
}

function syncFromUrl(s: ListboxState): void {
  s.filter = parseFilterFromUrl(s.win.location.search);
  if (s.search) s.search.value = s.filter.query;
  for (const chip of s.tagChips) {
    chip.setAttribute('aria-pressed', s.filter.tags.has(chip.dataset.tag ?? '') ? 'true' : 'false');
  }
  applyFilters(s);
  s.sort = parseSortFromUrl(s.win.location.search);
  if (s.sortSelect) s.sortSelect.value = s.sort;
  applySort(s, s.sort);
}

function readState(doc: Document, win: Window, deps: ListboxDeps): ListboxState {
  const items = Array.from(doc.querySelectorAll<HTMLElement>('.listbox-item'));
  return {
    doc,
    win,
    deps,
    root: doc.querySelector<HTMLElement>('#theme-listbox'),
    search: doc.querySelector<HTMLInputElement>('#theme-search'),
    sortSelect: doc.querySelector<HTMLSelectElement>('#theme-sort'),
    countEl: doc.querySelector<HTMLOutputElement>('#listbox-count'),
    emptyEl: doc.querySelector<HTMLElement>('.listbox-empty'),
    resetBtn: doc.querySelector<HTMLButtonElement>('.listbox-tags [data-action="reset-filters"]'),
    tagChips: Array.from(
      doc.querySelectorAll<HTMLButtonElement>('.listbox-tags .tag-chip[data-tag]'),
    ),
    items,
    // Build-time order (popular-first, then name — see ThemeSelector.astro's
    // `.sort()`), so switching back to 'default' always restores it even
    // after an 'apca' reorder has moved <li> nodes around.
    originalOrder: [...items],
    open: false,
    activeIndex: -1,
    filter: parseFilterFromUrl(win.location.search),
    sort: parseSortFromUrl(win.location.search),
  };
}

export function createListbox(doc: Document, win: Window, deps: ListboxDeps): Listbox {
  const s = readState(doc, win, deps);

  wireFilterControls(s);
  wireSort(s);
  wireOpenClose(s);

  if (s.sortSelect) s.sortSelect.value = s.sort;
  applySort(s, s.sort);
  // Sync tag chip pressed state with URL state on load.
  for (const chip of s.tagChips) {
    if (s.filter.tags.has(chip.dataset.tag ?? '')) chip.setAttribute('aria-pressed', 'true');
  }
  // `applyFilters` has to run at init, not just when the picker opens: `?q=`
  // and `?tags=` arrive from shared permalinks, and everything downstream
  // reads visibility off the DOM. Without this, a link with `?tags=light`
  // left every row visible until the user opened the listbox, so
  // prev/next/random stepped through the whole corpus and the count claimed
  // all 644 matched.
  if (s.search) s.search.value = s.filter.query;
  applyFilters(s);

  return {
    open: () => {
      openListbox(s);
    },
    close: () => {
      closeListbox(s);
    },
    isOpen: () => s.open,
    visibleSlugs: () => visibleItems(s).map((li) => li.dataset.slug ?? ''),
    syncFromUrl: () => {
      syncFromUrl(s);
    },
  };
}
