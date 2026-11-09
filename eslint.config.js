import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

/** Lint : règles recommandées de JavaScript, TypeScript et Svelte ; pas de formateur, le style reste celui du code. */
export default ts.config(
  { ignores: ['build/', '.svelte-kit/', 'node_modules/', 'static/', 'eval/', 'service/.venv/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  { files: ['**/*.svelte', '**/*.svelte.ts'], languageOptions: { parserOptions: { parser: ts.parser } } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Les liens sont construits avec `base` ($app/paths) pour GitHub Pages ; resolve() n'apporte rien à un site prérendu.
      'svelte/no-navigation-without-resolve': 'off'
    }
  }
);
