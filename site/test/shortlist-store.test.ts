import { expect, it, vi } from 'vitest';
import { createShortlistStore, SHORTLIST_KEY } from '../src/lib/shortlist-store';
const catalog = Array.from({ length: 14 }, (_, index) => `theme-${index}`);
function memory(initial: string | null = null) {
  let raw = initial;
  return {
    getItem: vi.fn(() => raw),
    setItem: vi.fn((_key: string, value: string) => {
      raw = value;
    }),
  };
}
it('persists versioned insertion order and reloads a deduplicated known catalog', () => {
  const storage = memory();
  const store = createShortlistStore(catalog, () => storage);
  store.toggle('theme-2');
  store.toggle('theme-0');
  expect(JSON.parse(storage.getItem())).toEqual({ version: 1, slugs: ['theme-2', 'theme-0'] });
  expect(createShortlistStore(catalog, () => storage).snapshot().slugs).toEqual([
    'theme-2',
    'theme-0',
  ]);
  expect(storage.setItem.mock.calls[0]?.[0]).toBe(SHORTLIST_KEY);
});
it('cleans stale slugs and duplicates without interpreting strings as markup', () => {
  const storage = memory(
    JSON.stringify({
      version: 1,
      slugs: ['theme-1', 'absent', 'theme-1', '<img onerror=alert(1)>', 'theme-0'],
    }),
  );
  const store = createShortlistStore(catalog, () => storage);
  expect(store.snapshot().slugs).toEqual(['theme-1', 'theme-0']);
  expect(store.snapshot().message).toMatch(/unavailable|duplicate/);
});
it('rejects corrupt and unsupported storage without throwing', () => {
  for (const raw of ['{', 'null', '{"version":2,"slugs":[]}', '{"version":1,"slugs":[42]}']) {
    const store = createShortlistStore(catalog, () => memory(raw));
    expect(store.snapshot().slugs).toEqual([]);
    expect(store.snapshot().message).toMatch(/could not be read/);
  }
});
it('bounds saves to twelve without silent eviction and supports removal', () => {
  const store = createShortlistStore(catalog, () => memory());
  for (const slug of catalog) store.toggle(slug);
  expect(store.snapshot().slugs).toEqual(catalog.slice(0, 12));
  expect(store.snapshot().message).toMatch(/12/);
  store.remove('theme-0');
  store.toggle('theme-13');
  expect(store.snapshot().slugs).toEqual([...catalog.slice(1, 12), 'theme-13']);
  store.toggle('theme-13');
  expect(store.snapshot().slugs).toEqual(catalog.slice(1, 12));
});
it('rejects unknown saves and returns independent snapshots', () => {
  const store = createShortlistStore(catalog, () => memory());
  store.toggle('absent');
  expect(store.snapshot().slugs).toEqual([]);
  store.toggle('theme-0');
  store.snapshot().slugs.push('theme-1');
  expect(store.snapshot().slugs).toEqual(['theme-0']);
});
it('falls back to memory when getter, read, or write is blocked, without retrying storage', () => {
  const fail = () => {
    throw new Error('SecurityError');
  };
  for (const storage of [
    vi.fn(fail),
    vi.fn(() => ({ getItem: fail, setItem: fail })),
    vi.fn(() => ({ getItem: () => null, setItem: fail })),
  ]) {
    const store = createShortlistStore(catalog, storage);
    store.toggle('theme-0');
    store.toggle('theme-1');
    store.remove('theme-0');
    expect(store.snapshot().slugs).toEqual(['theme-1']);
    expect(store.snapshot().persistent).toBe(false);
    expect(store.snapshot().message).toMatch(/visit only/);
    expect(storage).toHaveBeenCalledTimes(1);
  }
});
it('bounds oversized persisted lists to twelve known unique entries', () => {
  const store = createShortlistStore(catalog, () =>
    memory(JSON.stringify({ version: 1, slugs: catalog })),
  );
  expect(store.snapshot().slugs).toEqual(catalog.slice(0, 12));
});
