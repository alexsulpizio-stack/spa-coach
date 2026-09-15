(() => {
const STATE_SCHEMA_VERSION = 1;

const DEFAULT_STATE = {
  stateSchemaVersion: STATE_SCHEMA_VERSION,
  profile: { name: 'My PureSpa', volume: 290, sanitizer: 'chlorine', bodyOfWater: 'spa', poolType: 'above-ground', sanitizerSystem: 'chlorine', saltTarget: 3200, pumpHours: 8 },
  profiles: [{ id: 'spa-default', name: 'My PureSpa', volume: 290, sanitizer: 'chlorine', bodyOfWater: 'spa', poolType: 'above-ground', sanitizerSystem: 'chlorine', saltTarget: 3200, pumpHours: 8 }],
  activeProfileId: 'spa-default',
  onboardingComplete: false,
  inventory: [
    { id:'sanitizer', name:'Leisure Time Spa 56', purpose:'Sanitizer / shock', quantity:1, unit:'container', lowAt:0.25, dosePer500:0.5 },
    { id:'chlorineTabs', name:'Chlorine tablets (1-inch)', purpose:'Floating feeder sanitizer', quantity:1, unit:'tablet', lowAt:4, dosePer500:1 },
    { id:'raise', name:'Leisure Time Spa Up', purpose:'Raises pH / alkalinity', quantity:1, unit:'container', lowAt:0.25, dosePer500:1 },
    { id:'lower', name:'SpaChoice pH Decreaser', purpose:'Lowers pH / alkalinity', quantity:1, unit:'container', lowAt:0.25, dosePer500:0.5 },
    { id:'neutralizer', name:'AquaDoc Chlorine Neutralizer', purpose:'Optional high-chlorine reducer', quantity:1, unit:'container', lowAt:0.25, dosePer500:0.05 },
    { id:'filter', name:'Intex Type S1', purpose:'Filter cartridge', quantity:1, unit:'cartridge', lowAt:1 }
  ],
  maintenance: { filterEnabled:true, filterDays:7, drainEnabled:true, drainDays:90, replacementEnabled:true, replacementDays:30 },
  waterTestReminder: { enabled:true, days:7 },
  floaterReminder: { enabled:true, days:3 },
  readings: null,
  scan: null,
  history: [],
  lastFilterRinse: null,
  lastDrainRefill: null,
  lastFilterReplacement: null,
  poolClosing: { startedAt: null, completedSteps: [], closedAt: null },
  lastFloaterCheck: null,
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
  if (!inventory.some(item => item.id === 'chlorineTabs')) {
    const tabs = clone(DEFAULT_STATE.inventory.find(item => item.id === 'chlorineTabs'));
    const sanitizerAt = inventory.findIndex(item => item.id === 'sanitizer');
    if (sanitizerAt >= 0) inventory.splice(sanitizerAt + 1, 0, tabs);
    else inventory.push(tabs);
  }
  const history = Array.isArray(saved.history) ? saved.history.slice(-200) : [];
  const latestWaterTest = [...history].reverse().find(entry => entry?.type === 'water-test');
  const pendingFollowUp = saved.pendingFollowUp && typeof saved.pendingFollowUp === 'object'
    ? saved.pendingFollowUp
    : null;
  // A completed newer test supersedes any stale follow-up left by an older
  // session or notification. This keeps the dashboard and native reminder in
  // sync with the actual logged history.
  const reconciledFollowUp = pendingFollowUp && latestWaterTest
    && pendingFollowUp.sourceTestId !== latestWaterTest.id
    ? null
    : pendingFollowUp;
  const baseProfile = { ...DEFAULT_STATE.profile, ...(saved.profile || {}) };
  const rawProfiles = Array.isArray(saved.profiles) && saved.profiles.length ? saved.profiles : [{ id: 'spa-default', ...baseProfile }];
  const profiles = rawProfiles.map((profile, index) => ({
    ...DEFAULT_STATE.profile,
    ...profile,
    id: String(profile?.id || `profile-${index + 1}`),
    bodyOfWater: profile?.bodyOfWater === 'pool' ? 'pool' : 'spa',
    poolType: profile?.poolType === 'in-ground' ? 'in-ground' : 'above-ground',
    sanitizerSystem: profile?.sanitizerSystem === 'salt' ? 'salt' : 'chlorine',
    saltTarget: Math.max(0, Number(profile?.saltTarget ?? DEFAULT_STATE.profile.saltTarget) || DEFAULT_STATE.profile.saltTarget),
    pumpHours: Math.min(24, Math.max(1, Number(profile?.pumpHours ?? DEFAULT_STATE.profile.pumpHours) || DEFAULT_STATE.profile.pumpHours))
  }));
  // Older builds could create a second profile that was just another spa copy.
  // Give that accidental duplicate a useful pool identity after upgrading.
  if (!profiles.some(profile => profile.bodyOfWater === 'pool') && profiles.length > 1) {
    const poolCandidate = profiles[1];
    poolCandidate.name = poolCandidate.name === 'My PureSpa' ? 'My Pool' : poolCandidate.name;
    poolCandidate.bodyOfWater = 'pool';
    if (poolCandidate.volume === DEFAULT_STATE.profile.volume) poolCandidate.volume = 9336;
  }
  const activeProfileId = profiles.some(profile => profile.id === saved.activeProfileId) ? saved.activeProfileId : profiles[0].id;
  const activeProfile = profiles.find(profile => profile.id === activeProfileId) || profiles[0];
  return {
    ...clone(DEFAULT_STATE),
    ...saved,
    stateSchemaVersion: STATE_SCHEMA_VERSION,
    profile: activeProfile,
    profiles,
    activeProfileId,
    maintenance: { ...DEFAULT_STATE.maintenance, ...(saved.maintenance || {}) },
    waterTestReminder: { ...DEFAULT_STATE.waterTestReminder, ...(saved.waterTestReminder || {}) },
    floaterReminder: { ...DEFAULT_STATE.floaterReminder, ...(saved.floaterReminder || {}) },
    inventory,
    history,
    pendingFollowUp: reconciledFollowUp,
    poolClosing: {
      startedAt: saved.poolClosing?.startedAt || null,
      completedSteps: Array.isArray(saved.poolClosing?.completedSteps) ? saved.poolClosing.completedSteps.filter(Number.isInteger) : [],
      closedAt: saved.poolClosing?.closedAt || null
    },
    scannerCalibrations: Array.isArray(saved.scannerCalibrations) ? saved.scannerCalibrations.slice(-72) : []
  };
}

globalThis.SpaState = Object.freeze({ DEFAULT_STATE, STATE_SCHEMA_VERSION, migrateState });
})();

