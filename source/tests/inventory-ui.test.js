import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('chemical inventory explains each user-facing field', () => {
  for (const label of [
    'Product name',
    'Purpose',
    'Quantity remaining',
    'Unit',
    'Low-stock alert at',
    'Label dose per 500 gallons',
    'Adjust quantity'
  ]) {
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(html, /manufacturer’s dose in ounces for 500 gallons/i);
  assert.match(html, /scales it to your spa size/i);
});
