import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      // Same honesty fix as the root config (issue #173): without `all`, only
      // files a test imports are instrumented, so untested modules vanish
      // from the report instead of counting as zero.
      //
      // `.astro` components are excluded because v8 cannot instrument them —
      // that gap is real and tracked in #178 (the ~494-line ShowcaseController
      // client script), but pretending it is measurable here would be worse
      // than stating it plainly.
      all: true,
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
