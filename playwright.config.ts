import { defineConfig } from '@playwright/test';

/**
 * Parcours de bout en bout sur le build statique, servi sous le même chemin de base
 * que GitHub Pages. `npm run build` doit avoir été lancé avec BASE_PATH avant.
 */
const BASE = '/svelte-collection-explorer';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:4173${BASE}/`, locale: 'fr-FR' },
  webServer: {
    command: `BASE_PATH=${BASE} npm run preview -- --port 4173`,
    url: `http://localhost:4173${BASE}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    // Les parcours d'interface tournent aussi dans WebKit (Safari) : empilement, position fixe et filtres s'y comportent
    // différemment. La recherche par image reste sur Chromium seul pour ne charger le modèle qu'une fois.
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1600, height: 1000 } }, testMatch: /explore\.spec\.ts/ }
  ]
});
