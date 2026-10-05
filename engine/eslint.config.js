// Lint for the new engine only. Deliberately small: real problems, no style rules.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },

  // TypeScript sources and tests: type-aware checks.
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    rules: {
      // Unused code (tsc already rejects unused locals; this also covers imports and catch bindings).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Badly handled promises.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // Dangerous patterns.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-fallthrough': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      // The engine indexes typed arrays everywhere with `!` (noUncheckedIndexedAccess); that is intentional.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Node scripts (plain JavaScript, no type information). They also contain
  // functions that Playwright runs inside the page, hence the browser globals.
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
);
