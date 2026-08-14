// Flat-config ESLint 9.x.
// Enforces CODING_STANDARDS.md §3 (structure limits) and §4 (TypeScript rules).

import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/data/**',
    '**/upstream/**',
    // Local scratch space (see .gitignore). Nothing here has a matching
    // `files` block below, so it produced no findings either way — this makes
    // the exclusion intentional rather than incidental.
    'scratch/**',
    // Astro's generated type scaffolding (content-assets.mjs etc.). Already
    // in .gitignore and .prettierignore; without this ESLint lints files
    // nobody wrote while skipping hand-written site source (#227).
    '**/.astro/**',
  ]),

  // Library source — full type-aware strict ruleset (CODING_STANDARDS.md §3, §4).
  {
    name: 'oklch-terminal-themes/src',
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Code structure limits (CODING_STANDARDS.md §3.1)
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'max-params': ['error', 5],
      'max-depth': ['error', 4],

      // TypeScript strict rules (CODING_STANDARDS.md §4.2)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      // Numbers are common in CSS template literals (e.g. oklch(...)).
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      // Best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Scripts (build pipeline, upstream fetch, validator).
  // Syntactic-only rules — these files aren't in tsconfig.json and don't need type-aware lint.
  {
    name: 'oklch-terminal-themes/scripts',
    files: ['scripts/**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 12],
      'max-params': ['error', 5],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  // Site source (site/src/**). These are shipping site logic with real test
  // suites, yet no config block matched them until #227 — `npx eslint
  // site/src/lib/formatters.ts` reported "File ignored because no matching
  // configuration was supplied." Both files linted here had real defects the
  // review found by hand (the multi-word search bug in theme-filter.ts, the
  // contrast half-up rounding in formatters.ts).
  //
  // Syntactic-only (`recommended`, like scripts/) rather than type-aware:
  // site/ is a separate workspace with its own tsconfig, and wiring the
  // project service across workspace boundaries buys little here — these are
  // small, dependency-light helpers.
  {
    name: 'oklch-terminal-themes/site-src',
    files: ['site/src/**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'max-params': ['error', 5],
      'max-depth': ['error', 4],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'no-throw-literal': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Tests — syntactic-only, relaxed limits.

  {
    name: 'oklch-terminal-themes/tests',
    files: ['test/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);
