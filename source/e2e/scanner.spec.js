import { test, expect } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';

const PAD_COLORS = [
  [103,64,128],
  [126,160,129],
  [212,158,214],
  [216,120,84],
  [122,103,44],
  [225,132,65]
];

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodeStripPng() {
  const width = 240, height = 720;
  const cream = [232, 228, 214];
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const centers = [70, 180, 290, 400, 510, 620];
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      let rgb = cream;
      centers.forEach((center, index) => {
        if (Math.abs(y - center) <= 40 && x >= 50 && x <= 190) rgb = PAD_COLORS[index];
      });
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

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
});
