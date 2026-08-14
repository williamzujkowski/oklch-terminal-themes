// The projection of `themes-slim.json` the client actually consumes, shared by
// the inline bootstrap in `index.astro` and the static `themes-data.json`
// endpoint so the two can never disagree about the shape.
//
// Two fields are dropped (issue #211):
//
//   accent   — never read by the client at all. The controller uses name,
//              slug, isDark, colors, contrast.fgOnBg and dataviz.
//   contrast — carries 7 fields upstream; `SlimThemeLike`, the shape the
//              export formatters declare, has 3, and the UI reads only fgOnBg.
//
// Contrast floats are deliberately NOT rounded: it would save ~16 KB while
// making the copied JSON disagree numerically with the published
// themes-slim.json, a bad trade for a "copy raw JSON" feature.

/** The slug rendered server-side, and the only theme inlined into the page. */
export const DEFAULT_SLUG = 'dracula';

/**
 * What `projectTheme` needs to read, structurally.
 *
 * Deliberately NOT an index-signature type. #260 gives the JSON subpaths real
 * declarations, so `themes-slim.json` imports as the package's `SlimTheme` —
 * and a concrete interface is not assignable to one carrying
 * `[k: string]: unknown`, which is a TS rule that surprises people. Naming
 * only the fields this function reads keeps it assignable from `SlimTheme`
 * and from any looser shape.
 */
interface SlimInput {
  slug: string;
  contrast?: { fgOnBg: number; minAnsi: number; minAnsiSlot: string };
}

export function projectTheme(theme: SlimInput): Record<string, unknown> {
  // `accent` is dropped, not renamed: destructuring it into `_accent` reads
  // as "kept but unused", and site/src is linted now (#227) so that is an
  // error rather than a smell. Delete from a copy instead — the intent is
  // "this field does not ship", and it says so.
  const rest: Record<string, unknown> = { ...(theme as unknown as Record<string, unknown>) };
  delete rest['accent'];
  const contrast = theme.contrast;
  return {
    ...rest,
    ...(contrast === undefined
      ? {}
      : {
          contrast: {
            fgOnBg: contrast.fgOnBg,
            minAnsi: contrast.minAnsi,
            minAnsiSlot: contrast.minAnsiSlot,
          },
        }),
  };
}

/** The subset inlined into the document — enough to paint before any fetch. */
export function bootstrapThemes(all: SlimInput[]): Record<string, unknown>[] {
  const first = all.find((t) => t.slug === DEFAULT_SLUG) ?? all[0];
  return first === undefined ? [] : [projectTheme(first)];
}
