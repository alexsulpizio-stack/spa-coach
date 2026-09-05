import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import '../lib/scanner.js';
import '../lib/scan-session.js';
import { encodeStripRgba } from '../e2e/helpers/synthetic-strip.js';

const { PAD_ORDER, REFERENCES, buildPadReadings } = globalThis.SpaScanner;
const {
  detectPadsFromPixels,
  pickBestDetection,
  scalePoints,
  sourcePointFromCanvas,
  analyzePadSamples
} = globalThis.SpaScanSession;

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

function rotateRgba90({ data, width, height }) {
  const rotated = new Uint8ClampedArray(width * height * 4);
  const outWidth = height;
  const outHeight = width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const outX = height - 1 - y;
      const outY = x;
      const target = (outY * outWidth + outX) * 4;
      rotated[target] = data[source];
      rotated[target + 1] = data[source + 1];
      rotated[target + 2] = data[source + 2];
      rotated[target + 3] = data[source + 3];
    }
  }
  return { data: rotated, width: outWidth, height: outHeight };
}

function reverseRows({ data, width, height }) {
  const reversed = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    const sourceStart = y * width * 4;
    const targetStart = (height - 1 - y) * width * 4;
    reversed.set(data.subarray(sourceStart, sourceStart + width * 4), targetStart);
  }
  return { data: reversed, width, height };
}

function detectSynthetic(image) {
  const scaled = downscaleRgba(image.data, image.width, image.height, 180);
  return detectPadsFromPixels(scaled.data, scaled.width, scaled.height);
}

test('detectPadsFromPixels finds six pads on a synthetic Silver 7-in-1 image', () => {
  const result = detectSynthetic(encodeStripRgba());
  assert.equal(result?.points.length, 6);
  assert.equal(result?.orientation, 'vertical');
  assert.ok(['high', 'medium'].includes(result?.confidence));
  assert.notEqual(result?.confidence, 'low');
});

test('detectPadsFromPixels recognizes the same strip rotated horizontally', () => {
  const result = detectSynthetic(rotateRgba90(encodeStripRgba()));
  assert.equal(result?.points.length, 6);
  assert.equal(result?.orientation, 'horizontal');
  assert.notEqual(result?.confidence, 'low');
});

test('detectPadsFromPixels still finds six pads when strip direction is reversed', () => {
  const result = detectSynthetic(reverseRows(encodeStripRgba()));
  assert.equal(result?.points.length, 6);
  assert.equal(result?.orientation, 'vertical');
  assert.notEqual(result?.confidence, 'low');
});

test('detectPadsFromPixels rejects blank and malformed image buffers safely', () => {
  const blank = new Uint8ClampedArray(120 * 120 * 4);
  for (let i = 3; i < blank.length; i += 4) blank[i] = 255;
  assert.equal(detectPadsFromPixels(blank, 120, 120), null);
  assert.equal(detectPadsFromPixels(new Uint8ClampedArray(12), 120, 120), null);
  assert.equal(detectPadsFromPixels(null, 120, 120), null);
  assert.equal(detectPadsFromPixels(blank, 0, 120), null);
});

test('pickBestDetection consistently chooses the stronger geometry result', () => {
  const vertical = { orientation:'vertical', score:18 };
  const horizontal = { orientation:'horizontal', score:24 };
  assert.equal(pickBestDetection(vertical, horizontal), horizontal);
  assert.equal(pickBestDetection(vertical, null), vertical);
  assert.equal(pickBestDetection(null, horizontal), horizontal);
  assert.equal(pickBestDetection(null, null), null);
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

test('coordinate transforms round-trip between source and canvas', () => {
  const source = { x: 320, y: 900 };
  const canvas = scalePoints([source], 1600, 1200, 800, 600)[0];
  assert.deepEqual(canvas, { x:160, y:450 });
  assert.deepEqual(sourcePointFromCanvas(canvas, 1600, 1200, 800, 600), source);
});

test('scalePoints fails closed for invalid dimensions', () => {
  assert.deepEqual(scalePoints([{ x:10, y:20 }], 0, 100, 400, 400), []);
  assert.deepEqual(scalePoints(null, 100, 100, 400, 400), []);
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
