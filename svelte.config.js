import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Build statique : le front n'a pas besoin de serveur (le mock tourne dans le navigateur).
 * BASE_PATH est fourni par le workflow GitHub Pages ("/svelte-collection-explorer"),
 * vide en local.
 */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ pages: 'build', assets: 'build', fallback: undefined, strict: true }),
    paths: { base: process.env.BASE_PATH ?? '' }
  }
};

export default config;
