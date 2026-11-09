import { test, expect, type Page } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { MODEL_ID, MODEL_REVISION } from '../src/lib/ml/model';

/**
 * Recherche par image de bout en bout : le modèle CLIP est chargé dans le navigateur (worker), la photo d'exemple
 * est vectorisée, la collection classée, la lecture agrégée affichée. Les poids viennent du cache local de
 * transformers.js s'il existe (même révision épinglée), sinon du Hub Hugging Face.
 */
const CACHE = resolve(`node_modules/@huggingface/transformers/.cache/${MODEL_ID}/${MODEL_REVISION}`);
const HUB = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/`;

/**
 * Les poids font 90 Mo : les servir directement par route.fulfill() ferme la page dans Chromium. On les sert donc
 * par un petit serveur local et la requête vers le Hub est redirigée vers lui ; un fichier absent du cache passe au réseau.
 */
let server: Server | undefined;
let origin = '';

test.beforeAll(async () => {
  if (!existsSync(CACHE)) return;
  server = createServer((req, res) => {
    const file = resolve(CACHE, decodeURIComponent((req.url ?? '/').slice(1)).split('?')[0]);
    if (!file.startsWith(CACHE) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'access-control-allow-origin': '*', 'content-length': statSync(file).size, 'content-type': 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((ok) => server!.listen(0, ok));
  origin = `http://localhost:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => server?.close());

async function serveModelFromCache(page: Page) {
  await page.route(`${HUB}**`, async (route) => {
    const rel = route.request().url().slice(HUB.length).split('?')[0];
    if (server && existsSync(resolve(CACHE, rel))) await route.fulfill({ status: 307, headers: { location: `${origin}/${rel}` } });
    else await route.continue();
  });
}

/** Exemples dont la vue alternative retrouve l'objet au premier rang dans l'évaluation (eval/results.json), avec une marge nette. */
const SAMPLES = [
  { index: 0, title: 'Icon Fragment' },
  { index: 4, title: 'Jaharis Byzantine Lectionary' }
];

test.describe('Recherche par image', () => {
  test.setTimeout(300_000);

  for (const s of SAMPLES) {
    test(`une vue alternative retrouve « ${s.title} » en premier`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await serveModelFromCache(page);
      await page.goto('./');
      await expect(page.locator('article.card').first()).toBeVisible();

      await page.locator('.samples button').nth(s.index).click();
      await expect(page.locator('article.card .score').first()).toBeVisible({ timeout: 240_000 });

      await expect(page.locator('.status')).toContainText(/similarit/);
      await expect(page.locator('article.card .title').first()).toHaveText(s.title);
      await expect(page.locator('section.insights')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
