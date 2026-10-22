import { test, expect } from '@playwright/test';

test.describe('Explorer', () => {
  test('affiche la collection et filtre par pays avec URL partageable', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('article.card').first()).toBeVisible();
    await expect(page.locator('.status')).toContainText('64');

    const origin = page.locator('.ms', { has: page.locator('.head .label', { hasText: 'Origine' }) });
    await origin.locator('.head').click();
    await origin.locator('input[type=search]').fill('ukr');
    await origin.getByRole('checkbox', { name: 'Ukraine', exact: true }).check();
    await page.keyboard.press('Escape');

    await expect(page.locator('.chips .chip .v')).toHaveText(['Ukraine']);
    await expect(page).toHaveURL(/origin=UA/);
    const count = await page.locator('article.card').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(64);

    await page.reload();
    await expect(page.locator('.chips .chip .v')).toHaveText(['Ukraine']);
  });

  test('recherche texte avec délai et effacement', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('article.card').first()).toBeVisible();
    await page.locator('input[type=search]').fill('icon');
    await expect(page).toHaveURL(/q=icon/);
    await expect(page.locator('.status strong')).not.toHaveText('64');
    await page.locator('.field .clear').click();
    await expect(page.locator('.status strong')).toHaveText('64');
  });

  test('cocher un attribut sur une carte filtre la liste', async ({ page }) => {
    await page.goto('./');
    const first = page.locator('article.card').first();
    await expect(first).toBeVisible();
    const box = first.getByRole('checkbox', { name: /Filtrer sur Type d’objet/ });
    const label = (await box.getAttribute('aria-label'))!.split(' : ')[1];
    await box.check();
    await expect(page.locator('.chips .chip .v')).toHaveText([label]);
    await expect(page.locator('article.card input[type=checkbox]:checked').first()).toBeVisible();
  });

  test('volet de détail, sélection et page de comparaison', async ({ page }) => {
    await page.goto('./');
    await page.locator('article.card .title').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h3').first()).toHaveText(/identification/i);
    await dialog.locator('footer button').click();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.locator('article.card .cmp').nth(1).click();
    await expect(page.locator('.tray .count')).toHaveText('2 / 4');
    await page.locator('.tray a.primary').click();
    await expect(page).toHaveURL(/\/compare\/$/);
    await expect(page.locator('.vc .pane')).toHaveCount(2);
    await expect(page.locator('tbody tr:not(.group)').first()).toBeVisible();
    await page.locator('.switch input').first().check();
    await expect(page.locator('tbody tr.diff').first()).toBeVisible();
  });

  test('bascule de langue persistante', async ({ page }) => {
    await page.goto('./');
    const explore = page.locator('nav .links a[aria-current="page"]');
    await page.locator('nav .lang select').selectOption('en');
    await expect(explore).toHaveText('Explore');
    await expect(page).toHaveTitle(/Cultural objects/);
    await page.reload();
    await expect(explore).toHaveText('Explore');
    await page.locator('nav .lang select').selectOption('fr');
    await expect(explore).toHaveText('Explorer');
  });
});

test.describe('Contrôle', () => {
  test('la page de contrôle démarre à l’étape photo et navigue', async ({ page }) => {
    await page.goto('./controle/');
    await expect(page.locator('.phone')).toHaveCount(3);
    await expect(page.locator('.phone.active .pill')).toHaveText(/PHOTO/);
    await expect(page.locator('button.primary')).toBeDisabled();
    await expect(page.locator('.dropzone')).toBeVisible();
    await expect(page.locator('.phone').nth(1).locator('.placeholder')).toBeVisible();
    await page.locator('nav .links a', { hasText: 'Explorer' }).click();
    await expect(page.locator('article.card').first()).toBeVisible();
  });
});
