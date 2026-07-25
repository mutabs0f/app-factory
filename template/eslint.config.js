// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // database.types.ts is generated and must byte-match `supabase gen types`.
    // dist/.expo are build output. scripts/ is NOT ignored — see below.
    ignores: ['dist/*', 'node_modules/*', '.expo/*', '.runtime-web/*', 'src/types/database.types.ts'],
  },
  {
    // The control scripts decide whether every app may ship, and they were excluded from
    // lint entirely. Three real bugs shipped past `node --check` in one day, all of them the
    // same shape: a Node builtin used without being imported. `node --check` only parses, so
    // it cannot see that; `no-undef` catches it instantly and statically.
    // Linted as Node ESM (not React Native), with the app's rules off — this is tooling.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly', console: 'readonly', fetch: 'readonly', URL: 'readonly',
        Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly', AbortController: 'readonly',
        __dirname: 'readonly', document: 'readonly', window: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error', // ← the one that catches a missing import
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      // Expo/RN rules do not apply to Node tooling.
      'import/no-unresolved': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
