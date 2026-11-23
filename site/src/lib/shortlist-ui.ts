import { createShortlistStore, type ShortlistSnapshot } from './shortlist-store';

export interface ShortlistOptions {
  catalog: readonly { slug: string; name: string }[];
  storage: () => Pick<Storage, 'getItem' | 'setItem'>;
  getCandidate: () => string;
  selectCandidate: (slug: string) => void;
  selectReference: (slug: string) => void;
  signal: AbortSignal;
}
function action(doc: Document, slug: string, kind: string, label: string): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset.shortlistAction = kind;
  button.dataset.slug = slug;
  button.textContent = label;
  return button;
}
function renderRows(list: HTMLElement, slugs: string[], names: ReadonlyMap<string, string>): void {
  const doc = list.ownerDocument;
  const rows = slugs.map((slug) => {
    const row = doc.createElement('li');
    const name = doc.createElement('span');
    name.textContent = names.get(slug) ?? slug;
    const controls = doc.createElement('div');
    controls.append(
      action(doc, slug, 'candidate', 'Use as candidate'),
      action(doc, slug, 'reference', 'Use as reference'),
      action(doc, slug, 'remove', 'Remove'),
    );
    row.append(name, controls);
    return row;
  });
  list.replaceChildren(...rows);
}
function renderFeedback(root: Document | HTMLElement, snapshot: ShortlistSnapshot): void {
  const empty = root.querySelector<HTMLElement>('[data-shortlist-empty]');
  if (empty) empty.hidden = snapshot.slugs.length > 0;
  const count = root.querySelector<HTMLElement>('[data-shortlist-count]');
  if (count) count.textContent = `${snapshot.slugs.length} of 12 saved`;
  const feedback = root.querySelector<HTMLElement>('[data-shortlist-feedback]');
  if (feedback)
    feedback.textContent =
      snapshot.message || 'Saved in this browser. No account or network requests.';
}
/** One local shortlist, shared by both panes; it never owns URL history. */
export function wireShortlist(
  root: Document | HTMLElement,
  options: ShortlistOptions,
): { refresh(): void; dispose(): void } {
  const life = new AbortController();
  const store = createShortlistStore(
    options.catalog.map(({ slug }) => slug),
    options.storage,
  );
  const names = new Map(options.catalog.map(({ slug, name }) => [slug, name]));
  const save = root.querySelector<HTMLButtonElement>('[data-save-theme]');
  const list = root.querySelector<HTMLElement>('[data-shortlist-list]');
  let rendered = '';
  const refresh = (): void => {
    if (life.signal.aborted) return;
    const snapshot = store.snapshot();
    const candidate = options.getCandidate();
    if (save) {
      const saved = snapshot.slugs.includes(candidate);
      save.textContent = saved ? 'Remove candidate from shortlist' : 'Save candidate to shortlist';
      save.setAttribute('aria-pressed', String(saved));
      save.disabled = !names.has(candidate);
    }
    const signature = JSON.stringify(snapshot.slugs);
    if (list && signature !== rendered) {
      const hadFocus = list.contains(list.ownerDocument.activeElement);
      renderRows(list, snapshot.slugs, names);
      rendered = signature;
      if (hadFocus) save?.focus();
    }
    renderFeedback(root, snapshot);
  };
  const dispose = (): void => {
    life.abort();
    options.signal.removeEventListener('abort', dispose);
  };
  wireActions(root, options, store, refresh, life.signal);
  options.signal.addEventListener('abort', dispose, { once: true });
  if (options.signal.aborted) dispose();
  refresh();
  return { refresh, dispose };
}
function wireActions(
  root: Document | HTMLElement,
  options: ShortlistOptions,
  store: ReturnType<typeof createShortlistStore>,
  refresh: () => void,
  signal: AbortSignal,
): void {
  root.querySelector('[data-save-theme]')?.addEventListener(
    'click',
    () => {
      store.toggle(options.getCandidate());
      refresh();
    },
    { signal },
  );
  root.querySelector('[data-shortlist-list]')?.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('[data-shortlist-action]');
      const slug = button?.dataset.slug;
      if (!slug || !options.catalog.some((theme) => theme.slug === slug)) return;
      if (button.dataset.shortlistAction === 'candidate') options.selectCandidate(slug);
      if (button.dataset.shortlistAction === 'reference') options.selectReference(slug);
      if (button.dataset.shortlistAction === 'remove') store.remove(slug);
      refresh();
    },
    { signal },
  );
}
