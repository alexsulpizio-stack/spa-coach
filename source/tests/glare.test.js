import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/scanner.js';
import '../lib/scan-session.js';

const { PAD_ORDER, REFERENCES } = globalThis.SpaScanner;
const { assessPadGlare, samplePadsAtSourcePoints, analyzePadSamples } = globalThis.SpaScanSession;

function makeStripPixels({ glareIndex = null } = {}) {
  const width = 240, height = 600;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 225; data[i + 1] = 225; data[i + 2] = 225; data[i + 3] = 255;
  }
  const points = PAD_ORDER.map((pad, index) => ({ x:120, y:70 + index * 95 }));
  points.forEach((point, index) => {
    const rgb = REFERENCES[PAD_ORDER[index].key][2].rgb;
    for (let y = point.y - 13; y <= point.y + 13; y++) {
      for (let x = point.x - 13; x <= point.x + 13; x++) {
        const i = (y * width + x) * 4;
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
      }
    }
    if (index === glareIndex) {
      for (let y = point.y - 3; y <= point.y + 2; y++) {
        for (let x = point.x - 3; x <= point.x + 2; x++) {
          const i = (y * width + x) * 4;
          data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
        }
      }
    }
  });
  return { sourcePixels:{ data, width, height }, points };
}

test('normal colored pads do not trigger the glare gate', () => {
  const { sourcePixels, points } = makeStripPixels();
  const glare = assessPadGlare(sourcePixels, points);
  assert.equal(glare.detected, false);
  assert.deepEqual(glare.affected, []);
});

test('a localized clipped highlight on a colored pad is detected as glare', () => {
  const { sourcePixels, points } = makeStripPixels({ glareIndex:2 });
  const glare = assessPadGlare(sourcePixels, points);
  assert.equal(glare.detected, true);
  assert.equal(glare.affected.length, 1);
  assert.equal(glare.affected[0].index, 2);
  assert.ok(glare.affected[0].ratio >= .04);
});

test('glare causes the affected chemical reading to be rejected rather than interpreted', () => {
  const { sourcePixels, points } = makeStripPixels({ glareIndex:1 });
  const sampled = samplePadsAtSourcePoints(sourcePixels, points);
  const result = analyzePadSamples(sampled, sourcePixels, points, []);
  const affectedKey = PAD_ORDER[1].key;
  assert.equal(result.glare.detected, true);
  assert.equal(result.readings[affectedKey], null);
  assert.equal(result.details[affectedKey].reason, 'glare');
  assert.equal(result.details[affectedKey].confidence, 'rejected');
});

test('a uniformly bright background without colored pad support is not mislabeled as glare', () => {
  const width = 120, height = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
  }
  const glare = assessPadGlare({ data, width, height }, [{ x:60, y:60 }]);
  assert.equal(glare.detected, false);
});
