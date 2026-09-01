import { test, expect } from '@playwright/test';
import { encodeStripPng } from './helpers/synthetic-strip.js';

async function finishOnboarding(page) {
  await page.goto('/');
  await page.getByRole('button', { name: "LET'S GET STARTED" }).click();
  await expect(page.getByRole('button', { name: 'TEST MY WATER' })).toBeVisible();
}

test('synthetic strip photo auto-detects pads and reads chart colors', async ({ page }) => {
  await finishOnboarding(page);
  await page.getByRole('button', { name: 'TEST MY WATER' }).click();
  await page.locator('#stripGalleryInput').setInputFiles({
    name: 'synthetic-strip.png',
    mimeType: 'image/png',
    buffer: encodeStripPng()
  });
  await expect(page.getByRole('button', { name: 'USE AUTO-DETECTED PADS' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'USE AUTO-DETECTED PADS' }).click();
  await expect(page.locator('#resultRows')).toContainText('Total Hardness');
  await expect(page.locator('#resultRows')).toContainText('250 ppm');
  await expect(page.locator('#resultRows')).toContainText('Total Chlorine');
  await expect(page.locator('#resultRows')).toContainText('Free Chlorine');
  await expect(page.locator('#resultRows')).toContainText('5 ppm');
  await expect(page.locator('#resultRows')).toContainText('pH');
  await expect(page.locator('#resultRows')).toContainText('7.2');
  await expect(page.locator('#resultRows img[alt$="pad color"]')).toHaveCount(6);
  await page.getByRole('button', { name: 'Review / correct readings' }).click();
  await expect(page.locator('#readingForm img[alt$="pad color"]')).toHaveCount(6);
});
