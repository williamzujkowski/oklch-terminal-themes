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
