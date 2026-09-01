import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/chemistry.js';

const {
  evaluateSafety,
  isChemistryConflict,
  treatmentPlan,
  unresolvedIssuesFor
} = globalThis.SpaChemistry;

const inventory = [
  { id: 'sanitizer', name: 'Test Sanitizer', dosePer500: 0.5 },
  { id: 'raise', name: 'Test pH Up', dosePer500: 1 },
  { id: 'lower', name: 'Test pH Down', dosePer500: 0.5 },
  { id: 'neutralizer', name: 'Test Neutralizer', dosePer500: 0.05 }
];

test('safety gate accepts only reliable chlorine and pH in range', () => {
  assert.equal(evaluateSafety({ freeChlorine: 5, ph: 7.4 }).level, 'good');
  assert.equal(evaluateSafety({ freeChlorine: 2.5, ph: 7.4 }).level, 'bad');
  assert.equal(evaluateSafety({ freeChlorine: 5, ph: 8 }).level, 'bad');
  assert.equal(
    evaluateSafety(
      { freeChlorine: 5, ph: 7.4 },
      { freeChlorine: { confidence: 'low' } }
    ).level,
    'caution'
  );
  assert.equal(evaluateSafety({ freeChlorine: 5, ph: null }).level, 'caution');
});

test('chemistry conflict rejects total chlorine below free chlorine', () => {
  assert.equal(isChemistryConflict(1, 3), true);
  assert.equal(isChemistryConflict(5, 3), false);
  assert.equal(isChemistryConflict(null, 3), false);
});

test('treatment plan scales sanitizer dose by spa volume', () => {
  const plan = treatmentPlan({ freeChlorine: 2, ph: 8.2, alkalinity: 50 }, 290, inventory);
  assert.equal(plan.focus, 'free chlorine');
  assert.equal(plan.product, 'Test Sanitizer');
  assert.match(plan.dose, /0\.29 oz/);
  assert.equal(plan.retestMinutes, 5);
  assert.equal(plan.products.length, 2);
  assert.match(plan.products[1].dose, /1 tablet/);
});

test('in-range water offers an optional chlorine tab hold below 8 ppm', () => {
  const plan = treatmentPlan({ freeChlorine: 5, ph: 7.4 }, 290, inventory);
  assert.equal(plan.action, 'none');
  assert.match(plan.products[0].name, /Chlorine tablets/);
  assert.match(plan.products[0].dose, /1 tablet/);
});

test('chlorine tab count is at least one and scales by volume', () => {
  const { chlorineTabCount } = globalThis.SpaChemistry;
  assert.equal(chlorineTabCount(290, inventory), 1);
  assert.equal(chlorineTabCount(1000, inventory), 2);
});

test('high chlorine uses a conservative half neutralizer dose', () => {
  const plan = treatmentPlan({ freeChlorine: 12, ph: 7.4 }, 500, inventory);
  assert.equal(plan.focus, 'free chlorine');
  assert.equal(plan.product, 'Test Neutralizer');
  assert.match(plan.dose, /0\.18 oz/);
});

test('pH correction retains conservative incremental dosing', () => {
  const plan = treatmentPlan({ freeChlorine: 5, ph: 8.2 }, 290, inventory);
  assert.equal(plan.focus, 'pH');
  assert.equal(plan.product, 'SpaChoice pH Decreaser');
  assert.match(plan.dose, /0\.5 oz/);
});

test('generic treatment names chemical classes, not brands', () => {
  const { genericTreatmentPlan } = globalThis.SpaChemistry;
  const brand = /Leisure Time|Spa 56|SpaChoice|AquaDoc|Spa Up|Intex/;
  const lowChlorine = genericTreatmentPlan({ freeChlorine: 2, ph: 7.4 }, 290);
  assert.equal(lowChlorine.product, 'Chlorine sanitizer (granules)');
  assert.equal(lowChlorine.products[1].name, 'Chlorine tablets');
  assert.doesNotMatch(JSON.stringify(lowChlorine), brand);
  const highPh = genericTreatmentPlan({ freeChlorine: 5, ph: 8.2 }, 290);
  assert.equal(highPh.product, 'pH decreaser');
  assert.doesNotMatch(JSON.stringify(highPh), brand);
  const highChlorine = genericTreatmentPlan({ freeChlorine: 12, ph: 7.4 }, 500);
  assert.equal(highChlorine.product, 'Chlorine neutralizer');
  assert.doesNotMatch(JSON.stringify(highChlorine), brand);
});

test('unresolved issues retain sanitizer-first priority', () => {
  assert.deepEqual(
    unresolvedIssuesFor({ freeChlorine: 2, ph: 8.2, alkalinity: 40 }).map(issue => issue.key),
    ['fc-low', 'ph-high', 'ta-low']
  );
});
