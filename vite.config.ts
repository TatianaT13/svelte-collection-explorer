import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Couverture : seuil plancher sur la logique (src/lib hors composants), relevé à mesure que les tests s'ajoutent.
    coverage: { include: ['src/lib/**/*.ts'], exclude: ['src/lib/**/*.test.ts', 'src/lib/ml/embed.worker.ts'], thresholds: { lines: 55 } }
  }
});
