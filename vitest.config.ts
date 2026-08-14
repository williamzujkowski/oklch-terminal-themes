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
      // Ratcheted to the achieved level, the last step of #172 now that every
      // child issue has landed. `src/**` measured 97.10 / 88.44 / 98.81 /
      // 98.91 when these were set; the numbers below are that, floored.
      //
      // Two floors, because one is not enough:
      //
      //   - The `src/**` glob is the floor that matters. The library is the
      //     thing that must not rot, and 97% is what it actually achieves.
      //   - The global numbers are the whole-repo figure (64.7%), which is
      //     dragged down by `scripts/**` sitting at 0/414 statements. On its
      //     own a 64% global would be close to useless: it would let the
      //     library fall from 97% to 65% without CI noticing, and a threshold
      //     that permits a 32-point regression is worse than none because it
      //     reads as a guarantee. It earns its place only as a backstop
      //     against a large new uncovered file landing in `scripts/`.
      //
      // Both checks are aggregates, not per-file, so a new uncovered file in
      // `src/` fails the glob even though every existing file still passes.
      //
      // Verified against vitest 4.1.10 rather than assumed: the global figure
      // is computed over ALL included files and does NOT exclude the ones the
      // glob already matched (`Coverage for statements (64.7%) does not meet
      // global threshold`, not the 0% that a scripts-only global would give).
      // The two floors therefore overlap on `src/**`, which is harmless — the
      // glob is strictly tighter — but it does mean the global number cannot
      // be read as "coverage of everything else".
      //
      // `scripts/**` is deliberately left unpinned at 0%. It is six CLI entry
      // points — argv parsing, mkdir/writeFile, process.exit — and all six run
      // in CI on every PR, where their real assertions live: `pnpm validate`
      // (the whole corpus), `pnpm verify:package` (subpath + tree-shake assertions
      // against a packed tarball), `sync-theme-count:check`, and the
      // byte-stability diff on `build:data`. `write-exports.ts` has no script
      // of its own and is reached through `build.ts`. Unit-testing that layer
      // would mostly assert that `node:fs` works. It stays visible at 0% —
      // `all: true` is what makes the number honest — rather than excluded,
      // so the boundary is a stated choice and not a hidden one.
      thresholds: {
        statements: 64,
        branches: 67,
        functions: 69,
        lines: 65,
        'src/**/*.ts': {
          statements: 97,
          branches: 88,
          functions: 98,
          lines: 98,
        },
      },
    },
  },
});
