export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * Dataset-level slug-uniqueness guard.
 *
 * `slug` is the primary key of every published per-theme artifact:
 * `data/by-name/<slug>.json`, `data/css/<slug>.css`,
 * `data/schemes/base16|base24/<slug>.yaml`, and the `./themes/*` subpath
 * export. A collision does not error at export time — the second write simply
 * overwrites the first — so a duplicate silently drops a theme from every one
 * of those surfaces while `themes.json` still lists both.
 *
 * The only dedup logic lived in `scripts/build.ts`, which no test covers, and
 * `scripts/validate.ts` had no slug check at all — even though the CI step is
 * literally named "Validate (Zod + ΔE round-trip + duplicate-slug guard)"
 * (issue #174). A hand-edited or partially-rebuilt `themes.json` passed clean.
 *
 * Reports the colliding slug with every name that claims it, since the names
 * are what tell you which upstream sources are fighting.
 */
export function findDuplicateSlugErrors(
  themes: readonly { slug: string; name: string; source?: string }[],
): string[] {
  const bySlug = new Map<string, { name: string; source?: string }[]>();
  for (const theme of themes) {
    const claimants = bySlug.get(theme.slug);
    if (claimants === undefined) bySlug.set(theme.slug, [theme]);
    else claimants.push(theme);
  }

  const errors: string[] = [];
  for (const [slug, claimants] of bySlug) {
    if (claimants.length < 2) continue;
    const who = claimants
      .map((c) => (c.source === undefined ? `"${c.name}"` : `"${c.name}" (${c.source})`))
      .join(', ');
    errors.push(
      `duplicate slug "${slug}": claimed by ${claimants.length} themes — ${who}. ` +
        `Per-theme exports (by-name/css/schemes) would overwrite each other.`,
    );
  }
  return errors;
}
