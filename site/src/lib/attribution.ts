/**
 * Footer attribution, derived from `sources.json` at build time so it cannot
 * drift from the data the way the hand-written footer did (it credited a
 * single MIT upstream while the corpus draws on several under MIT,
 * Apache-2.0 and BSD-3-Clause). The README's generated attribution table is
 * the full record; the footer links to it.
 */
export interface AttributionSourceLike {
  id: string;
  license: string;
  /** `true` for the in-repo native themes, which are not an upstream. */
  local?: boolean;
}

export interface AttributionSummary {
  upstreamCount: number;
  /** Distinct upstream licenses, most common first, ties alphabetical. */
  licenses: string[];
}

export function summarizeAttribution(
  sources: readonly AttributionSourceLike[],
): AttributionSummary {
  const upstreams = sources.filter((s) => s.local !== true);
  const tally = new Map<string, number>();
  for (const s of upstreams) tally.set(s.license, (tally.get(s.license) ?? 0) + 1);
  const licenses = [...tally.entries()]
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .map(([license]) => license);
  return { upstreamCount: upstreams.length, licenses };
}
