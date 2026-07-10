// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // database.types.ts is generated (must byte-match `supabase gen types`);
    // scripts/* are Node tooling, not RN app code.
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'scripts/*', 'src/types/database.types.ts'],
  },
]);
