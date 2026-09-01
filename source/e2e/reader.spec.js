import { test, expect } from '@playwright/test';
import { encodeStripPng } from './helpers/synthetic-strip.js';

async function finishReaderOnboarding(page) {
  await page.goto('/reader/');
  await page.getByRole('button', { name: 'START READING STRIPS' }).click();
  await expect(page.getByRole('button', { name: 'SCAN A STRIP' })).toBeVisible();
}

test('strip reader home has no coaching or treatment surfaces', async ({ page }) => {
  await finishReaderOnboarding(page);
  await expect(page.getByRole('heading', { name: 'Strip Reader' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AquaChek Silver 7-in-1' })).toBeVisible();
  await expect(page.getByText('Upcoming care')).toHaveCount(0);
  await expect(page.getByText('WHAT SHOULD I DO?')).toHaveCount(0);
  await expect(page.getByText('Chemical inventory')).toHaveCount(0);
});

test('synthetic strip photo auto-detects pads with the shared scanner', async ({ page }) => {
  await finishReaderOnboarding(page);
  await page.getByRole('button', { name: 'SCAN A STRIP' }).click();
  await page.locator('#stripGalleryInput').setInputFiles({
    name: 'synthetic-strip.png',
    mimeType: 'image/png',
    buffer: encodeStripPng()
  });
  await expect(page.getByRole('button', { name: 'USE AUTO-DETECTED PADS' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'USE AUTO-DETECTED PADS' }).click();
  await expect(page.locator('#resultRows')).toContainText('Total Hardness');
  await expect(page.locator('#resultRows')).toContainText('250 ppm');
  await expect(page.locator('#resultRows')).toContainText('Free Chlorine');
  await expect(page.locator('#resultRows')).toContainText('5 ppm');
  await expect(page.locator('#resultRows')).toContainText('pH');
  await expect(page.locator('#resultRows')).toContainText('7.2');
  await expect(page.locator('#resultRows img[alt$="pad color"]')).toHaveCount(6);
  await expect(page.getByRole('button', { name: 'SAVE THIS READING' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'WHAT SHOULD I DO?' })).toHaveCount(0);
  await page.getByRole('button', { name: 'SAVE THIS READING' }).click();
  await expect(page.getByRole('button', { name: 'SCAN A STRIP' })).toBeVisible();
  await expect(page.locator('#recentHistory')).toContainText('Strip reading');
  await expect(page.locator('#recentHistory')).toContainText('5 ppm');
});
