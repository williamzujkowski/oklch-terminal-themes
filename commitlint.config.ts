import type { UserConfig } from '@commitlint/types';

/**
 * Conventional commit enforcement for oklch-terminal-themes.
 *
 * Format: type(scope): description
 *
 * Types:  feat, fix, refactor, docs, test, chore, perf
 * Scopes: optional, freeform (e.g., convert, classify, schema, scripts, ci, deps)
 *
 * @see CONTRIBUTING.md
 * @see https://www.conventionalcommits.org/en/v1.0.0/
 */
const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf']],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
    'header-max-length': [1, 'always', 100],
    'body-max-line-length': [0] as const,
    'footer-max-line-length': [0] as const,
  },
};

export default config;
