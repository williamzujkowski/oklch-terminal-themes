import { defineConfig } from 'astro/config';

// Deployed at https://williamzujkowski.github.io/oklch-terminal-themes/.
export default defineConfig({
  site: 'https://williamzujkowski.github.io',
  base: '/oklch-terminal-themes',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  vite: {
    ssr: {
      // Astro SSR build must bundle the workspace dep; don't externalize.
      noExternal: ['@williamzujkowski/oklch-terminal-themes'],
    },
  },
});
