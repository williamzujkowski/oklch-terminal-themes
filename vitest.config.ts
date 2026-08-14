import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      // Without `all`, v8 only instruments files a test happens to import, so
      // anything no test touches is invisible rather than counted as zero.
      // That made the reported figure 95.96% statements while the real number
      // over src/ + scripts/ is 63.00% — scripts/ is 0% across all five files
      // and simply did not appear in the report at all (issue #173).
      all: true,
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      // The default text reporter hides fully-covered files, so the table you
      // read is a partial list rather than the roster. Show everything.
      reporter: ['text', 'html'],
      // NO thresholds yet, deliberately. Setting one at today's number would
      // codify the hole; the sibling issues under #172 close the gaps first,
      // and thresholds get ratcheted to the achieved level as the last step.
    },
  },
});
