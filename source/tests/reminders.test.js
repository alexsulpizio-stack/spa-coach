import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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

function reminderHarness(saved = {}) {
  const data = new Map([['spaCoachState', JSON.stringify(saved)]]);
  const calls = [];
  const context = vm.createContext({
    localStorage: { getItem:key=>data.get(key) ?? null, setItem:(key,value)=>data.set(key,value) },
    window: {}, console,
    SpaNativeBridge: { createNativeBridge:()=>({ get:()=>({
      scheduleReminder:(...args)=>calls.push(args), cancelReminder:key=>calls.push(['cancel',key])
    }) }) }
  });
  const source = readFileSync(new URL('../lib/reminders.js', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  return { context, data, calls, reload:()=>vm.runInContext(source, context) };
}

test('repeated overdue syncs preserve the original water and floater due times', () => {
  const at = '2026-08-01T12:00:00.000Z';
  const h = reminderHarness({ history:[{type:'water-test',at},{type:'floater-check',at}] });
  for (let i=0; i<4; i++) {
    h.context.SpaReminders.syncWaterTestReminder(now+i*30000);
    h.context.SpaReminders.syncFloaterReminder(now+i*30000);
  }
  for (const [key,due] of h.calls) {
    assert.equal(due, Date.parse(at)+(key==='water-test'?7:3)*86400000);
  }
});

test('initial reminder clocks survive repeated syncs and app restart', () => {
  const h = reminderHarness();
  h.context.SpaReminders.syncWaterTestReminder(now);
  h.context.SpaReminders.syncFloaterReminder(now);
  h.reload();
  h.context.SpaReminders.syncWaterTestReminder(now+86400000);
  h.context.SpaReminders.syncFloaterReminder(now+86400000);
  assert.deepEqual(h.calls[0],h.calls[2]);
  assert.deepEqual(h.calls[1],h.calls[3]);
  assert.equal(h.calls[0][1],now+7*86400000);
  assert.equal(h.calls[1][1],now+3*86400000);
});

test('logged actions reset clocks and reminder settings preserve custom cadence and disable', () => {
  const h = reminderHarness({waterTestReminder:{enabled:true,days:10},floaterReminder:{enabled:false,days:2}});
  h.context.SpaReminders.syncWaterTestReminder(now);
  h.context.SpaReminders.syncFloaterReminder(now);
  assert.equal(h.calls[0][1],now+10*86400000);
  assert.deepEqual(h.calls[1],['cancel','chlorine-floater']);
  h.data.set('spaCoachState',JSON.stringify({history:[{type:'water-test',at:new Date(now+86400000).toISOString()}]}));
  h.context.SpaReminders.syncWaterTestReminder(now+86400000);
  assert.equal(h.calls[2][1],now+8*86400000);
  assert.equal(h.context.SpaReminders.logFloaterCheck(),true);
  const saved = JSON.parse(h.data.get('spaCoachState'));
  assert.equal(h.calls[3][1],Date.parse(saved.lastFloaterCheck)+3*86400000);
});
