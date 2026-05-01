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
  themesPath: z.string().min(1),
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
