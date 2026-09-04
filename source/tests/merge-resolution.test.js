import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/chemistry.js';

const { treatmentPlan, genericTreatmentPlan } = globalThis.SpaChemistry;

test('merge resolution preserves gram equivalents in Spa Coach dosing', () => {
  const plan = treatmentPlan({ freeChlorine: 1, ph: 7.2, alkalinity: 100 }, 290, [
    { id: 'sanitizer', name: 'Leisure Time Spa 56', dosePer500: 0.5 },
    { id: 'chlorineTabs', name: 'Chlorine tablets (1-inch)', dosePer500: 1 }
  ]);
  assert.match(plan.dose, /0\.29 oz \(8\.2 g\)/);
});

test('merge resolution preserves generic Strip Reader treatment mode', () => {
  const plan = genericTreatmentPlan({ freeChlorine: 1, ph: 7.2, alkalinity: 100 }, 500);
  assert.equal(plan.product, 'Chlorine sanitizer (granules)');
  assert.doesNotMatch(JSON.stringify(plan), /Leisure Time|SpaChoice|AquaDoc/);
});
