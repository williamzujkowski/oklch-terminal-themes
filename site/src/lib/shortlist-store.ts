import { z } from 'zod';

export const SHORTLIST_KEY = 'oklch-terminal-themes.shortlist.v1';
const LIMIT = 12;
const RecordSchema = z.object({
  version: z.literal(1),
  slugs: z.array(z.string().max(200)).max(4096),
});
type ShortlistStorage = Pick<Storage, 'getItem' | 'setItem'>;
export interface ShortlistSnapshot {
  slugs: string[];
  persistent: boolean;
  message: string;
}
export interface ShortlistStore {
  snapshot(): ShortlistSnapshot;
  toggle(slug: string): void;
  remove(slug: string): void;
}
interface State {
  known: ReadonlySet<string>;
  slugs: string[];
  storage: ShortlistStorage | null;
  message: string;
}
function memoryOnly(state: State): void {
  state.storage = null;
  state.message = 'Storage is unavailable. Your shortlist is kept for this visit only.';
}
function read(state: State, getStorage: () => ShortlistStorage): void {
  try {
    state.storage = getStorage();
    const raw = state.storage.getItem(SHORTLIST_KEY);
    if (raw === null) return;
    if (raw.length > 65536) throw new Error('Oversized shortlist');
    const record = RecordSchema.safeParse(JSON.parse(raw) as unknown);
    if (!record.success) {
      state.message = 'Saved shortlist could not be read. Start a new shortlist below.';
      return;
    }
    state.slugs = [...new Set(record.data.slugs)]
      .filter((slug) => state.known.has(slug))
      .slice(0, LIMIT);
    if (state.slugs.length !== record.data.slugs.length)
      state.message =
        'Unavailable or duplicate saved themes were removed; up to 12 themes are kept.';
  } catch (error) {
    if (error instanceof SyntaxError)
      state.message = 'Saved shortlist could not be read. Start a new shortlist below.';
    else memoryOnly(state);
  }
}
function persist(state: State, message: string): void {
  if (!state.storage) {
    memoryOnly(state);
    return;
  }
  try {
    state.storage.setItem(SHORTLIST_KEY, JSON.stringify({ version: 1, slugs: state.slugs }));
    state.message = message;
  } catch {
    memoryOnly(state);
  }
}
function remove(state: State, slug: string): void {
  if (!state.slugs.includes(slug)) return;
  state.slugs = state.slugs.filter((saved) => saved !== slug);
  persist(state, 'Theme removed from your shortlist.');
}
function toggle(state: State, slug: string): void {
  if (!state.known.has(slug)) {
    state.message = 'This theme is unavailable and cannot be saved.';
    return;
  }
  if (state.slugs.includes(slug)) return remove(state, slug);
  if (state.slugs.length >= LIMIT) {
    state.message = 'Your shortlist has 12 themes. Remove one before saving another.';
    return;
  }
  state.slugs.push(slug);
  persist(state, 'Theme saved to your shortlist.');
}
/** A bounded local record; storage failures retain operations in memory. */
export function createShortlistStore(
  catalog: readonly string[],
  storage: () => ShortlistStorage,
): ShortlistStore {
  const state: State = { known: new Set(catalog), slugs: [], storage: null, message: '' };
  read(state, storage);
  return {
    snapshot: () => ({
      slugs: [...state.slugs],
      persistent: state.storage !== null,
      message: state.message,
    }),
    toggle: (slug) => toggle(state, slug),
    remove: (slug) => remove(state, slug),
  };
}
