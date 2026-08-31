(() => {
const STATE_SCHEMA_VERSION = 1;

const DEFAULT_STATE = {
  stateSchemaVersion: STATE_SCHEMA_VERSION,
  profile: { name: 'My PureSpa', volume: 290, sanitizer: 'chlorine' },
  onboardingComplete: false,
  inventory: [
    { id:'sanitizer', name:'Leisure Time Spa 56', purpose:'Sanitizer / shock', quantity:1, unit:'container', lowAt:0.25, dosePer500:0.5 },
    { id:'raise', name:'Leisure Time Spa Up', purpose:'Raises pH / alkalinity', quantity:1, unit:'container', lowAt:0.25, dosePer500:1 },
    { id:'lower', name:'SpaChoice pH Decreaser', purpose:'Lowers pH / alkalinity', quantity:1, unit:'container', lowAt:0.25, dosePer500:0.5 },
    { id:'neutralizer', name:'AquaDoc Chlorine Neutralizer', purpose:'Optional high-chlorine reducer', quantity:1, unit:'container', lowAt:0.25, dosePer500:0.05 },
    { id:'filter', name:'Intex Type S1', purpose:'Filter cartridge', quantity:1, unit:'cartridge', lowAt:1 }
  ],
  maintenance: { filterEnabled:true, filterDays:7, drainEnabled:true, drainDays:90, replacementEnabled:true, replacementDays:90 },
  readings: null,
  scan: null,
  history: [],
  lastFilterRinse: null,
  lastDrainRefill: null,
  lastFilterReplacement: null,
  pendingFollowUp: null,
  unresolvedIssues: [],
  scannerCalibrations: []
};

function clone(value) {
  return structuredClone(value);
}

function migrateState(input) {
  const saved = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const inventory = Array.isArray(saved.inventory)
    ? saved.inventory.map((item, index) => ({
        quantity: 1,
        unit: 'container',
        lowAt: 0.25,
        ...item,
        id: item?.id || `custom-${index}`
      }))
    : clone(DEFAULT_STATE.inventory);
  if (!inventory.some(item => item.id === 'neutralizer')) {
    inventory.push(clone(DEFAULT_STATE.inventory.find(item => item.id === 'neutralizer')));
  }
  return {
    ...clone(DEFAULT_STATE),
    ...saved,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
    profile: { ...DEFAULT_STATE.profile, ...(saved.profile || {}) },
    maintenance: { ...DEFAULT_STATE.maintenance, ...(saved.maintenance || {}) },
    inventory,
    history: Array.isArray(saved.history) ? saved.history.slice(-200) : [],
    scannerCalibrations: Array.isArray(saved.scannerCalibrations) ? saved.scannerCalibrations.slice(-72) : []
  };
}

globalThis.SpaState = Object.freeze({ DEFAULT_STATE, STATE_SCHEMA_VERSION, migrateState });
})();
