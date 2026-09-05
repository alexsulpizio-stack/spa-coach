import { test, expect } from '@playwright/test';
import { encodeStripPng } from './helpers/synthetic-strip.js';

async function finishReaderOnboarding(page) {
  await page.goto('/reader/');
  await page.getByRole('button', { name: 'START READING STRIPS' }).click();
  await expect(page.getByRole('button', { name: 'SCAN A STRIP' })).toBeVisible();
}

test('strip reader home has no branded inventory or maintenance coaching', async ({ page }) => {
  await finishReaderOnboarding(page);
  await expect(page.getByRole('heading', { name: 'Strip Reader' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AquaChek Silver 7-in-1' })).toBeVisible();
  await expect(page.getByText('Upcoming care')).toHaveCount(0);
  await expect(page.getByText('Chemical inventory')).toHaveCount(0);
  await expect(page.getByText('Leisure Time')).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: 'WHAT SHOULD I DO?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'SAVE THIS READING' })).toBeVisible();
  await page.getByRole('button', { name: 'SAVE THIS READING' }).click();
  await expect(page.getByRole('button', { name: 'SCAN A STRIP' })).toBeVisible();
  await expect(page.locator('#recentHistory')).toContainText('Strip reading');
  await expect(page.locator('#recentHistory')).toContainText('5 ppm');
});

test('low chlorine recommends generic sanitizer, not a brand', async ({ page }) => {
  await finishReaderOnboarding(page);
  await page.getByRole('button', { name: 'SCAN A STRIP' }).click();
  await page.getByRole('button', { name: 'ENTER READINGS MANUALLY' }).click();
  await page.locator('#edit_freeChlorine').selectOption('1');
  await page.locator('#edit_ph').selectOption('7.2');
  await page.getByRole('button', { name: 'USE THESE READINGS' }).click();
  await page.getByRole('button', { name: 'WHAT SHOULD I DO?' }).click();
  await expect(page.getByRole('heading', { name: 'Raise free chlorine first' })).toBeVisible();
  await expect(page.locator('.treatment-product').first()).toContainText('Chlorine sanitizer (granules)');
  await expect(page.locator('.treatment-product').nth(1)).toContainText('Chlorine tablets');
  await expect(page.getByText('Leisure Time')).toHaveCount(0);
  await expect(page.getByText('Spa 56')).toHaveCount(0);
  await expect(page.getByText('SpaChoice')).toHaveCount(0);
  await page.getByRole('button', { name: 'SAVE THIS READING' }).click();
  await expect(page.locator('#recentHistory')).toContainText('Raise free chlorine first');
});
