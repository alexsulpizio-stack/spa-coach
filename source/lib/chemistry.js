(() => {
function num(value) {
  if (value === null || value === undefined || value === '') return Number.NaN;
  return typeof value === 'number' ? value : Number(value);
}

function classify(key, value) {
  const parsed = num(value);
  if (!Number.isFinite(parsed) && key !== 'cya') return 'caution';
  switch (key) {
    case 'freeChlorine': return parsed < 3 || parsed > 10 ? 'bad' : 'good';
    case 'ph': return parsed < 7.0 || parsed > 7.8 ? 'bad' : (parsed < 7.2 ? 'caution' : 'good');
    case 'alkalinity': return parsed < 80 || parsed > 140 ? 'caution' : 'good';
    case 'hardness': return parsed < 100 || parsed > 500 ? 'caution' : 'good';
    case 'cya': return value === 0 || value === '30–50' ? 'good' : 'caution';
    default: return 'good';
  }
}

function isChemistryConflict(totalChlorine, freeChlorine) {
  const total = num(totalChlorine);
  const free = num(freeChlorine);
  return Number.isFinite(total) && Number.isFinite(free) && total < free;
}

function evaluateSafety(readings, details = {}) {
  const freeChlorine = num(readings.freeChlorine);
  const ph = num(readings.ph);
  const criticalUncertain = ['freeChlorine', 'ph'].some(key =>
    details[key]?.invalid ||
    ['low', 'rejected'].includes(details[key]?.confidence) ||
    readings[key] == null
  );
  if (criticalUncertain) return { level: 'caution', title: 'VERIFY BEFORE USING THE SPA', reason: 'Chlorine or pH is not reliable enough yet.' };
  if (!Number.isFinite(freeChlorine) || !Number.isFinite(ph)) return { level: 'caution', title: 'MORE INFORMATION NEEDED', reason: 'A chlorine and pH reading are required.' };
  if (freeChlorine < 3) return { level: 'bad', title: "DON'T USE THE SPA YET", reason: `Free chlorine is ${freeChlorine} ppm — below the use range.` };
  if (freeChlorine > 10) return { level: 'bad', title: "DON'T USE THE SPA YET", reason: `Free chlorine is ${freeChlorine} ppm — above the 3–10 ppm use range.` };
  if (ph < 7.0 || ph > 7.8) return { level: 'bad', title: "DON'T USE THE SPA YET", reason: `pH is ${ph}, outside the 7.0–7.8 use range.` };
  return { level: 'good', title: 'WATER IS IN THE USE RANGE', reason: 'Free chlorine and pH are both in range.' };
}

function inventoryItem(inventory, id) {
  return inventory?.find(item => item.id === id);
}

function inventoryName(inventory, id, fallback) {
  return inventoryItem(inventory, id)?.name?.trim() || fallback;
}

function inventoryDose(inventory, id, fallback) {
  const dose = Number(inventoryItem(inventory, id)?.dosePer500);
  return Number.isFinite(dose) && dose > 0 ? dose : fallback;
}

function treatmentPlan(readings, gallons, inventory = []) {
  const freeChlorine = num(readings.freeChlorine);
  const ph = num(readings.ph);
  const alkalinity = num(readings.alkalinity);
  const scale = gallons / 500;
  const sanitizerDose = (inventoryDose(inventory, 'sanitizer', 0.5) * scale).toFixed(2);
  const phUpDose = (inventoryDose(inventory, 'raise', 1) * scale).toFixed(2);
  const phUpLowDose = (inventoryDose(inventory, 'raise', 1) * 2 * scale).toFixed(2);

  if (Number.isFinite(freeChlorine) && freeChlorine > 10) {
    const reduction = Math.max(0, freeChlorine - 5);
    const calculatedDose = inventoryDose(inventory, 'neutralizer', 0.05) * scale * reduction;
    const startingDose = calculatedDose / 2;
    return {
      action: 'dose', focus: 'free chlorine', followUpTitle: 'Retest free chlorine', retestMinutes: 60,
      title: 'High chlorine: wait, or optionally neutralize',
      explanation: `Free chlorine is ${freeChlorine} ppm, above the app's 3–10 ppm use range. Waiting uncovered with circulation is the default. Neutralizer is an optional faster correction.`,
      product: inventoryName(inventory, 'neutralizer', 'AquaDoc Chlorine Neutralizer'),
      dose: `Conservative starting dose for ${gallons} gal: about ${startingDose.toFixed(2)} oz (${(startingDose * 28.3495).toFixed(1)} g). This is half the calculated amount to approach 5 ppm.`,
      steps: ['Do not use the hot tub while free chlorine is above 10 ppm.', 'Confirm the reading with a fresh strip and remove any chlorine feeder.', `If choosing neutralizer, weigh about ${startingDose.toFixed(2)} oz (${(startingDose * 28.3495).toFixed(1)} g) and add it according to the label with circulation running.`, 'Wait 1 hour and retest before adding any more.', 'Alternatively, add nothing, leave the cover open safely, circulate, and let chlorine fall naturally.'],
      note: 'Never mix spa chemicals. Spa Coach uses AquaDoc’s published guide of about 1 oz per 1 ppm per 10,000 gallons, then starts at half the calculated dose because strips and water volume are approximate.'
    };
  }
  if (Number.isFinite(freeChlorine) && freeChlorine < 3) return {
    action: 'dose', focus: 'free chlorine', followUpTitle: 'Retest free chlorine', retestMinutes: 5,
    title: 'Raise free chlorine first',
    explanation: `Free chlorine is ${freeChlorine} ppm. Correct sanitizer before adjusting the secondary water-balance readings.`,
    product: inventoryName(inventory, 'sanitizer', 'Leisure Time Spa 56'), dose: `Label-scaled regular dose for ${gallons} gal: about ${sanitizerDose} oz`,
    steps: [`Measure about ${sanitizerDose} oz of Spa 56.`, 'Add it according to the product label with circulation running.', 'Circulate for 5 minutes.', 'Retest free chlorine before using the spa or adding more.'],
    note: 'The app scales the bottle’s ½ oz per 500 gal regular dose. Confirm the product label if your formulation changes.'
  };
  if (Number.isFinite(ph) && ph > 7.8) return {
    action: 'dose', focus: 'pH', followUpTitle: 'Retest pH and alkalinity', retestMinutes: 30,
    title: 'Lower pH', explanation: `pH is ${ph}, above the desired range.`,
    product: 'SpaChoice pH Decreaser', dose: 'Start with 0.5 oz, per the bottle’s incremental-dose directions',
    steps: ['Turn on the blower or filter.', 'Premix 0.5 oz of product with water in a plastic pail.', 'Add the diluted product to the spa.', 'Wait 30 minutes and retest.', 'Do not exceed 1 oz at one time.'],
    note: 'This product can also lower total alkalinity, so retest both before another dose.'
  };
  if (Number.isFinite(ph) && ph < 7.2) {
    const dose = ph < 6.8 ? phUpLowDose : phUpDose;
    return {
      action: 'dose', focus: 'pH', followUpTitle: 'Retest pH and alkalinity', retestMinutes: 60,
      title: 'Raise pH', explanation: `pH is ${ph}.`, product: inventoryName(inventory, 'raise', 'Leisure Time Spa Up'),
      dose: `Label-scaled dose for ${gallons} gal: about ${dose} oz`,
      steps: [`Measure about ${dose} oz of Spa Up.`, 'Add it according to the product label.', 'Circulate the water.', 'Retest before adding another dose.'],
      note: 'Spa Up also affects total alkalinity, which is why the app retests instead of calculating a large one-shot correction.'
    };
  }
  if (Number.isFinite(alkalinity) && alkalinity < 80) return {
    action: 'advice', focus: 'total alkalinity', followUpTitle: 'Confirm low alkalinity', retestMinutes: null,
    title: 'Sanitizer and pH look okay; alkalinity is low',
    explanation: `Total alkalinity is ${alkalinity} ppm. Your current inventory does not include a dedicated alkalinity increaser.`,
    product: null, dose: '',
    steps: ['Do not add more chlorine just for this reading.', 'Do not use pH increaser solely to chase alkalinity if pH is already in range.', 'Confirm the alkalinity reading with a fresh strip before buying or dosing another product.'],
    note: 'Spa Coach will remember the low alkalinity while you work through higher-priority sanitizer and pH issues first.'
  };
  if (Number.isFinite(alkalinity) && alkalinity > 140) return {
    action: 'advice', focus: 'total alkalinity', followUpTitle: 'Confirm high alkalinity', retestMinutes: null,
    title: 'Alkalinity is elevated', explanation: `Total alkalinity is ${alkalinity} ppm.`, product: null, dose: '',
    steps: ['Retest to confirm the reading.', 'Watch pH; high alkalinity can make pH harder to control.', 'Avoid adding Spa Up while alkalinity is high.'],
    note: 'The app will prioritize a pH correction if pH also rises above range.'
  };
  return {
    action: 'none', focus: null, followUpTitle: null, retestMinutes: null,
    title: 'No chemical adjustment is the first priority',
    explanation: 'Free chlorine and pH are in the app’s use range, and no higher-priority correction is indicated by these readings.',
    product: null, dose: '', steps: ['Log this test.', 'Retest before your next soak or whenever water conditions change.'],
    note: 'Test-strip readings are approximate; confirm anything that looks inconsistent with the bottle chart.'
  };
}

function unresolvedIssuesFor(readings) {
  const issues = [];
  const freeChlorine = num(readings?.freeChlorine);
  const ph = num(readings?.ph);
  const alkalinity = num(readings?.alkalinity);
  if (Number.isFinite(freeChlorine) && freeChlorine > 10) issues.push({ key: 'fc-high', label: `Free chlorine high (${freeChlorine} ppm)`, focus: 'free chlorine', priority: 1 });
  else if (Number.isFinite(freeChlorine) && freeChlorine < 3) issues.push({ key: 'fc-low', label: `Free chlorine low (${freeChlorine} ppm)`, focus: 'free chlorine', priority: 1 });
  if (Number.isFinite(ph) && ph > 7.8) issues.push({ key: 'ph-high', label: `pH high (${ph})`, focus: 'pH', priority: 2 });
  else if (Number.isFinite(ph) && ph < 7.2) issues.push({ key: 'ph-low', label: `pH low (${ph})`, focus: 'pH', priority: 2 });
  if (Number.isFinite(alkalinity) && alkalinity < 80) issues.push({ key: 'ta-low', label: `Alkalinity low (${alkalinity} ppm)`, focus: 'total alkalinity', priority: 3 });
  else if (Number.isFinite(alkalinity) && alkalinity > 140) issues.push({ key: 'ta-high', label: `Alkalinity high (${alkalinity} ppm)`, focus: 'total alkalinity', priority: 3 });
  return issues.sort((a, b) => a.priority - b.priority);
}

globalThis.SpaChemistry = Object.freeze({
  classify,
  evaluateSafety,
  isChemistryConflict,
  num,
  treatmentPlan,
  unresolvedIssuesFor
});
})();
