import { test, expect } from '@playwright/test';

/** Prise de vue guidée sur la page de contrôle, avec la caméra factice de Chromium (mire animée). */
test('prise de vue guidée : caméra, mesures en direct, déclenchement', async ({ page }) => {
  await page.goto('./controle/');
  await expect(page.locator('.dropzone')).toBeVisible();
  await page.locator('.dropzone .guided').click();

  const capture = page.locator('.capture');
  await expect(capture).toBeVisible();
  await expect(capture.locator('video')).toBeVisible();
  // Plein écran, quel que soit l'endroit du bouton dans la page : monté sous <body>.
  const box = (await capture.boundingBox())!;
  const vp = page.viewportSize()!;
  expect([Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)]).toEqual([0, 0, vp.width, vp.height]);
  expect(await capture.evaluate((el) => el.parentElement === document.body)).toBe(true);
  await expect(capture.locator('.status.measured')).toBeVisible({ timeout: 15_000 });

  await capture.locator('.shutter').click();
  await expect(capture).toBeHidden();
  await expect(page.locator('.dropzone.has-file')).toBeVisible();
  await expect(page.locator('.dropzone .name')).toHaveText(/^prise-\d{4}-/);
  await expect(page.locator('.pq')).toBeVisible();
});
