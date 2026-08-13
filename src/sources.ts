import { z } from 'zod';

// Format adapters live in `src/parsers/`. Each format names a parser that
// converts a source file into the canonical mbadolato/Windows-Terminal-JSON
// shape so the rest of the pipeline doesn't care where the colors came from.
export const SOURCE_FORMATS = [
  'windowsterminal-json', // mbadolato schema, plain JSON
  'windowsterminal-jsonc', // same schema but JSON-with-comments + trailing commas
  'ghostty', // ghostty config: `palette = N=#hex` + `background = #hex` + ...
  'warp-yaml', // warpdotdev yaml: `terminal_colors.normal.{red,green,...}` + bright + bg/fg/accent
] as const;
export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export const SourceConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be kebab-case'),
  name: z.string().min(1),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be "owner/name"'),
  url: z.url(),
  /**
   * Path to the theme files, relative to the source's repo root.
   *
   * Constrained to plain relative segments (issue #196). This value is passed
   * to `git sparse-checkout set` and joined into a filesystem read path in
   * `scripts/build.ts`; for a `local: true` source that join is rooted at
   * THIS repo, so `../../../etc` would read outside it entirely.
   *
   * Exploiting that needs a merged PR to `sources.json`, at which point the
   * attacker has commit access and better options — so this is a guard
   * against accident and against a rubber-stamp review of exactly the kind
   * of small config file that gets waved through, not against a determined
   * attacker.
   */
  themesPath: z
    .string()
    .min(1)
    .regex(
      /^[\w.-]+(?:\/[\w.-]+)*$/,
      'themesPath must be a relative path of [A-Za-z0-9_.-] segments',
    )
    .refine((p) => !p.split('/').includes('..'), 'themesPath must not contain a ".." segment'),
  license: z.string().min(1),
  /**
   * Format of the source's theme files. Defaults to `windowsterminal-json`
   * for back-compat with the original single-format pipeline. Drives parser
   * dispatch in `scripts/build.ts`.
   */
  format: z.enum(SOURCE_FORMATS).optional(),
  excludeFiles: z.array(z.string().min(1)).optional(),
  /**
   * Optional file-extension filter for the format. Defaults are sensible per
   * format (`.json` for windowsterminal-json, `` for ghostty, `.yaml` for
   * warp-yaml, `.jsonc` for windowsterminal-jsonc) but a few sources publish
   * to non-default extensions, so let them override.
   */
  fileExtension: z.string().optional(),
  /**
   * `true` for sources whose theme files live in this repo (under
   * `themesPath` relative to repo root). They skip the upstream fetch step,
   * use `"local"` as their pinned SHA, and emit `sourceUrl` permalinks
   * against this repo's `main` branch. Used for hand-curated themes that
   * don't have a separate upstream — vintage CRT, accessibility,
   * design-system-aligned palettes, etc.
   */
  local: z.boolean().optional(),
  /**
   * `true` for sources whose theme files may author each color slot in
   * OKLCH (a CSS string or `{l, c, h}` object) instead of hex-only —
   * currently only the `native` source. `scripts/build.ts` routes these
   * through `src/parsers/native.ts` + `resolveNativeColor` instead of the
   * generic hex-only `UpstreamSchemeSchema` path, and marks resolved slots in
   * the theme's `oklchAuthored` field. Upstream-fetched sources always stay
   * hex-only. See issue #132.
   */
  nativeAuthoring: z.boolean().optional(),
});

// Order in the array is the slug-collision priority order: when two sources
// emit the same slug, the source listed first wins and the dropped duplicate
// is logged at build time. mbadolato is intentionally first so existing slugs
// stay byte-stable as new sources are added.
export const SourcesConfigSchema = z
  .array(SourceConfigSchema)
  .min(1)
  .superRefine((arr, ctx) => {
    const ids = new Set<string>();
    for (const s of arr) {
      if (ids.has(s.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate source id "${s.id}"` });
      }
      ids.add(s.id);
    }
  });

export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export type SourcesConfig = z.infer<typeof SourcesConfigSchema>;

/**
 * Shape of `.upstream-shas.json` — the pinned upstream commit per source id.
 *
 * `scripts/fetch-upstream.ts` previously loaded this with a bare
 * `as Record<string, string>` cast, unlike `sources.json` which has always
 * gone through `SourcesConfigSchema`. Every value flows into a `git` argument
 * slot, and git subcommands accept options after positional arguments, so an
 * entry such as `--upload-pack=<command>` would execute that command —
 * inside `release.yml`'s `id-token: write` job and `pages.yml`'s build job
 * (issue #193). `execFileSync` prevents shell injection, not argument
 * injection.
 *
 * The permitted shape matches what `TerminalColorThemeSchema.upstreamSha`
 * already enforces: a 7-40 character hex SHA, or the literal `local` for
 * hand-curated sources with no upstream commit to pin.
 */
export const PinnedShasSchema = z.record(
  z.string(),
  z.string().regex(/^([a-f0-9]{7,40}|local)$/, 'must be a 7-40 char hex SHA or "local"'),
);
export type PinnedShas = z.infer<typeof PinnedShasSchema>;
