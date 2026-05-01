import { z } from 'zod';

export const SourceConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be kebab-case'),
  name: z.string().min(1),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'repo must be "owner/name"'),
  url: z.url(),
  themesPath: z.string().min(1),
  license: z.string().min(1),
  excludeFiles: z.array(z.string().min(1)).optional(),
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
