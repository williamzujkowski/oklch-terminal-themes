/**
 * Preserves `updatedAt` / `generatedAt` timestamps across a rebuild when the
 * surrounding record's content hasn't actually changed — see issue #140.
 *
 * `scripts/build.ts` stamps every theme (and the aggregate `index.json`) with
 * the build's wall-clock time unconditionally, so a no-op rebuild (nothing
 * upstream changed) still touches every one of the 633 `data/by-name/*.json`
 * files plus the aggregates, turning weekly sync PRs into pure timestamp
 * noise. The fix: before writing a record, deep-compare it against the
 * previous on-disk version ignoring the timestamp field. If everything else
 * is equal, carry the previous timestamp forward instead of bumping it —
 * a no-change rebuild then produces a byte-identical `data/` tree.
 */

/** Recursively strips the given key names from an object/array, at any depth. */
function stripKeys(value: unknown, keys: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => stripKeys(v, keys));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keys.includes(k)) continue;
      out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return value;
}

function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => deepEqual(v, b[i]));
}

function objectsEqual(a: object, b: object): boolean {
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  if (aKeys.length !== Object.keys(bRec).length) return false;
  return aKeys.every((k) => Object.hasOwn(bRec, k) && deepEqual(aRec[k], bRec[k]));
}

/** Structural deep-equality — order-independent for object keys, order-dependent for arrays. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  const bObj = b as object;
  if (Array.isArray(a) !== Array.isArray(bObj)) return false;
  return Array.isArray(a) ? arraysEqual(a, bObj as unknown[]) : objectsEqual(a, bObj);
}

/**
 * True when `next` and `previous` are structurally equal once `ignoreKeys`
 * (checked at every depth, e.g. `updatedAt`/`generatedAt`) are stripped out.
 */
export function contentEqualIgnoring(
  next: unknown,
  previous: unknown,
  ignoreKeys: readonly string[],
): boolean {
  return deepEqual(stripKeys(next, ignoreKeys), stripKeys(previous, ignoreKeys));
}

/**
 * Resolves the `updatedAt` a freshly-built theme record should be written
 * with: the previous on-disk record's `updatedAt` when the rest of the
 * record (everything except `updatedAt`) is unchanged, else `next`'s own
 * (fresh build-time) `updatedAt`.
 */
export function preserveThemeUpdatedAt<T extends { updatedAt: string }>(
  next: T,
  previous: T | undefined,
): string {
  if (previous !== undefined && contentEqualIgnoring(next, previous, ['updatedAt'])) {
    return previous.updatedAt;
  }
  return next.updatedAt;
}

/**
 * Same idea as `preserveThemeUpdatedAt`, for the aggregate `index.json`'s
 * top-level `generatedAt` — preserved when the rest of the index (per-theme
 * entries, upstream SHAs, count) is unchanged.
 */
export function preserveIndexGeneratedAt<T extends { generatedAt: string }>(
  next: T,
  previous: T | undefined,
): string {
  if (previous !== undefined && contentEqualIgnoring(next, previous, ['generatedAt'])) {
    return previous.generatedAt;
  }
  return next.generatedAt;
}
