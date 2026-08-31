import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/reminders.js';

const { futureRelative, maintenanceDue, maintenanceDueAt } = globalThis.SpaReminders;

const now = Date.parse('2026-08-31T12:00:00.000Z');

test('maintenance reminder is based on the last completion time', () => {
  assert.equal(
    maintenanceDueAt('2026-08-30T12:00:00.000Z', 7, now),
    Date.parse('2026-09-06T12:00:00.000Z')
  );
  assert.deepEqual(
    maintenanceDue('2026-08-20T12:00:00.000Z', 7, now),
    { label: 'Overdue by 4 days', level: 'bad' }
  );
});

test('new maintenance schedules begin from the supplied clock', () => {
  assert.equal(maintenanceDueAt(null, 7, now), now + 7 * 86400000);
  assert.deepEqual(maintenanceDue(null, 7, now), { label: 'Not started', level: 'neutral' });
});

test('relative retest status handles future and overdue reminders', () => {
  assert.equal(futureRelative('2026-08-31T12:45:00.000Z', now), 'Retest in 45 min');
  assert.equal(futureRelative('2026-08-31T12:00:00.000Z', now), 'Due now');
  assert.equal(futureRelative('2026-08-31T10:30:00.000Z', now), 'Overdue by 1 hr 30 min');
});
