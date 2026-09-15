Warning: truncated output (original token count: 1897)
Total output lines: 134

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
  profileData: {},
  lastFilterRinse: null,
  lastDrainRefill: null,
  lastFilterReplacement: null,
  poolClosing: { startedAt: null, completedSteps: [], closedAt: null },
  lastFloaterCheck: null,
  pendingFollowUp: null,
  unresolvedIssues: [],
  scannerCalibrations: []
};

function clone(v…897 tokens truncated… const savedContext = rawProfileData[profile.id] && typeof rawProfileData[profile.id] === 'object' ? rawProfileData[profile.id] : null;
    const context = savedContext ? { ...savedContext } : {};
    contextKeys.forEach(key => {
      if (!(key in context)) context[key] = key === 'history' ? [] : (key === 'unresolvedIssues' ? [] : null);
    });
    if (!savedContext && profile.id === activeProfileId) {
      contextKeys.forEach(key => { if (key in saved) context[key] = clone(saved[key]); });
    }
    context.history = (Array.isArray(context.history) ? context.history : []).slice(-200).map(entry => ({ ...entry, profileId: entry.profileId || profile.id }));
    context.poolClosing = { startedAt: context.poolClosing?.startedAt || null, completedSteps: Array.isArray(context.poolClosing?.completedSteps) ? context.poolClosing.completedSteps.filter(Number.isInteger) : [], closedAt: context.poolClosing?.closedAt || null };
    profileData[profile.id] = context;
  });
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
    profileData,
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

