import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({
        pages: 'build',
        assets: 'build',
        fallback: undefined,
        strict: true
      }),
      paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
    })
  ],
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Couverture : seuil plancher sur toute la logique de src/lib (fichiers jamais importés compris), relevé à mesure que les tests s'ajoutent.
    coverage: { include: ['src/lib/**/*.ts'], exclude: ['src/lib/**/*.test.ts', 'src/lib/ml/embed.worker.ts'], thresholds: { lines: 30 } }
  }
});
