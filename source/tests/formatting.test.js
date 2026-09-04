import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/formatting.js';

const { formatDate, formatDateTime, relativeTime } = globalThis.SpaFormatting;
const now = new Date('2026-09-04T12:00:00.000Z').getTime();

test('relative times cover recent, minute, and hour ranges', () => {
  assert.equal(relativeTime(null, now), 'recently');
  assert.equal(relativeTime('2026-09-04T11:59:45.000Z', now), 'just now');
  assert.equal(relativeTime('2026-09-04T11:45:00.000Z', now), '15 min ago');
  assert.equal(relativeTime('2026-09-04T10:00:00.000Z', now), '2 hr ago');
});

test('date formatters accept an explicit locale for deterministic output', () => {
  assert.equal(formatDate('2026-09-04T12:00:00.000Z', 'en-US', 'UTC'), 'Sep 4, 2026');
  assert.equal(formatDateTime('2026-09-04T12:00:00.000Z', 'en-US', 'UTC'), 'Sep 4, 12:00 PM');
});
