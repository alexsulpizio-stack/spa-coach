import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/followup.js';

const { formatMinutes, makeFollowUp } = globalThis.SpaFollowUp;

const at = '2026-08-31T12:00:00.000Z';

test('timed treatment follow-up calculates a deterministic due time', () => {
  const followUp = makeFollowUp(
    'test-1',
    at,
    { action: 'dose', title: 'Raise chlorine', focus: 'free chlorine', followUpTitle: 'Retest chlorine' },
    [],
    { delayMinutes: 120 }
  );
  assert.equal(followUp.kind, 'retest');
  assert.equal(followUp.dueAt, '2026-08-31T14:00:00.000Z');
});

test('skipped dose remains an untimed action item', () => {
  const followUp = makeFollowUp(
    'test-2',
    at,
    { action: 'dose', title: 'Raise chlorine', focus: 'free chlorine' },
    [{ key: 'fc-low' }],
    { treatmentSkipped: true, delayMinutes: 5 }
  );
  assert.equal(followUp.kind, 'action');
  assert.equal(followUp.dueAt, null);
});

test('no-treatment plan does not create a follow-up', () => {
  assert.equal(makeFollowUp('test-3', at, { action: 'none' }, []), null);
});

test('retest durations are formatted for display', () => {
  assert.equal(formatMinutes(5), '5 min');
  assert.equal(formatMinutes(120), '2 hours');
  assert.equal(formatMinutes(1440), '1 day');
});
