import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import '../lib/scanner.js';
import '../lib/scan-session.js';
import { encodeStripRgba } from '../e2e/helpers/synthetic-strip.js';

const { PAD_ORDER, REFERENCES, buildPadReadings } = globalThis.SpaScanner;
const { detectPadsFromPixels, scalePoints, analyzePadSamples } = globalThis.SpaScanSession;

function downscaleRgba(data, width, height, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const scaled = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(height - 1, Math.round(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.round(x / scale));
      const si = (sy * width + sx) * 4;
      const di = (y * w + x) * 4;
      scaled[di] = data[si];
      scaled[di + 1] = data[si + 1];
      scaled[di + 2] = data[si + 2];
      scaled[di + 3] = 255;
    }
  }
  return { data: scaled, width: w, height: h };
}

test('detectPadsFromPixels finds six pads on a synthetic Silver 7-in-1 image', () => {
  const full = encodeStripRgba();
  const { data, width, height } = downscaleRgba(full.data, full.width, full.height, 180);
  const result = detectPadsFromPixels(data, width, height);
  assert.equal(result?.points.length, 6);
  assert.equal(result?.orientation, 'vertical');
  assert.ok(['high', 'medium'].includes(result?.confidence));
  assert.notEqual(result?.confidence, 'low');
});

test('analyzePadSamples uses the same engine as buildPadReadings', () => {
  const sampled = PAD_ORDER.map(pad => ({
    rgb: REFERENCES[pad.key][2].rgb,
    innerSpread: 4, outerSpread: 8, outerMedianSpread: 4,
    innerHueSpread: 2, innerSatSpread: .02, outerHueSpread: 2
  }));
  const points = sampled.map((_, index) => ({ x: 40, y: 20 + index * 30 }));
  const session = analyzePadSamples(sampled, null, points, []);
  const direct = buildPadReadings(sampled, [], {});
  assert.deepEqual(session.readings, direct.readings);
  assert.equal(session.whitePoint, null);
});

test('scalePoints maps detection coordinates onto the source image', () => {
  const scaled = scalePoints([{ x: 10, y: 20 }], 100, 200, 400, 800);
  assert.deepEqual(scaled, [{ x: 40, y: 80 }]);
});

test('spa-coach and strip reader both import the shared scanner files', async () => {
  const spa = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const reader = await readFile(new URL('../reader/index.html', import.meta.url), 'utf8');
  assert.match(spa, /lib\/scanner\.js/);
  assert.match(spa, /lib\/scan-session\.js/);
  assert.match(reader, /\.\.\/lib\/scanner\.js/);
  assert.match(reader, /\.\.\/lib\/scan-session\.js/);
  assert.doesNotMatch(reader, /logFilterBtn|inventoryEditor/);
});
