// Static JSON endpoint for the full theme dataset (issue #211).
//
// Astro emits this to `dist/themes-data.json` at build time — no server
// involved. It exists so the document does not have to carry 682 KB of JSON
// that the browser must HTML-parse and then `JSON.parse` on the main thread
// before anything is interactive, when one theme (~1.4 KB) is all that first
// paint needs.
import type { APIRoute } from 'astro';
import slim from '@williamzujkowski/oklch-terminal-themes/themes-slim.json';
import { projectTheme } from '@/lib/theme-data';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify(slim.map(projectTheme)), {
    headers: {
      'Content-Type': 'application/json',
      // Immutable in practice: the file is rebuilt and redeployed whenever the
      // dataset changes, and Astro's asset pipeline does not fingerprint
      // endpoint output, so keep this modest rather than immutable.
      'Cache-Control': 'public, max-age=3600',
    },
  });
