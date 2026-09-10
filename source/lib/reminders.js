(() => {
const DAY_MS = 86400000;
const STORAGE_KEY = 'spaCoachState';
const WATER_TEST_REMINDER_KEY = 'water-test';
const FLOATER_REMINDER_KEY = 'chlorine-floater';
const DEFAULT_WATER_TEST_REMINDER = Object.freeze({ enabled:true, days:7 });
const DEFAULT_FLOATER_REMINDER = Object.freeze({ enabled:true, days:3 });
const MAINTENANCE_FIELDS = [
  { key:'lastDrainRefill', historyType:'drain-refill', input:'maintenanceLastFill', label:'When was the spa last drained and refilled?' },
  { key:'lastFilterRinse', historyType:'filter-rinse', input:'maintenanceLastRinse', label:'When was the filter last rinsed?' },
  { key:'lastFilterReplacement', historyType:'filter-replacement', input:'maintenanceLastReplacement', label:'When was the filter last replaced?' }
];

function maintenanceDueAt(lastDone, days, now = Date.now()) {
  const base = lastDone ? new Date(lastDone).getTime() : now;
  return base + Math.max(1, Number(days) || 1) * DAY_MS;
}

function maintenanceDue(lastDone, days, now = Date.now()) {
  if (!lastDone) return { label: 'Not started', level: 'neutral' };
  const daysLeft = Math.ceil((maintenanceDueAt(lastDone, days, now) - now) / DAY_MS);
  if (daysLeft < 0) return { label: `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}`, level: 'bad' };
  if (daysLeft === 0) return { label: 'Due today', level: 'caution' };
  return { label: `Due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, level: daysLeft <= 2 ? 'caution' : 'good' };
}

function futureRelative(iso, now = Date.now()) {
  if (!iso) return 'No timer set';
  const milliseconds = new Date(iso).getTime() - now;
  if (milliseconds <= -60000) {
    const overdueMinutes = Math.floor(Math.abs(milliseconds) / 60000);
    if (overdueMinutes < 60) return `Overdue by ${overdueMinutes} min`;
    const overdueHours = Math.floor(overdueMinutes / 60);
    const remainingMinutes = overdueMinutes % 60;
    return remainingMinutes ? `Overdue by ${overdueHours} hr ${remainingMinutes} min` : `Overdue by ${overdueHours} hr`;
  }
  if (milliseconds <= 0) return 'Due now';
  const minutes = Math.ceil(milliseconds / 60000);
  if (minutes < 60) return `Retest in ${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `Retest in ${hours} hr ${remainingMinutes} min` : `Retest in ${hours} hr`;
  }
  const days = Math.ceil(minutes / 1440);
  return `Retest in ${days} day${days === 1 ? '' : 's'}`;
}

function readSavedState() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  } catch (_) { return {}; }
}

function writeSavedState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
  catch (_) { return false; }
}

function latestHistoryAt(history, type) {
  if (!Array.isArray(history)) return null;
  let latest = null;
  let latestTime = -Infinity;
  history.forEach(entry => {
    if (entry?.type !== type || !entry.at) return;
    const time = new Date(entry.at).getTime();
    if (Number.isFinite(time) && time > latestTime) { latestTime = time; latest = entry.at; }
  });
  return latest;
}

function waterTestReminderConfig(state = readSavedState()) {
  return { ...DEFAULT_WATER_TEST_REMINDER, ...(state.waterTestReminder || {}) };
}

function floaterReminderConfig(state = readSavedState()) {
  return { ...DEFAULT_FLOATER_REMINDER, ...(state.floaterReminder || {}) };
}

function syncWaterTestReminder(now = Date.now()) {
  if (typeof window === 'undefined' || typeof globalThis.SpaNativeBridge === 'undefined') return;
  const bridge = globalThis.SpaNativeBridge.createNativeBridge(window).get();
  if (!bridge) return;
  const state = readSavedState();
  const config = waterTestReminderConfig(state);
  try {
    if (!config.enabled) {
      bridge.cancelReminder(WATER_TEST_REMINDER_KEY);
      return;
    }
    const lastTest = latestHistoryAt(state.history, 'water-test');
    const dueAt = maintenanceDueAt(lastTest, config.days, now);
    const scheduledAt = Math.max(now + 60000, dueAt);
    bridge.scheduleReminder(
      WATER_TEST_REMINDER_KEY,
      scheduledAt,
      'Time to test your spa water',
      'Check chlorine, pH, alkalinity, and hardness. Test before each use even if the weekly reminder is not due yet.'
    );
  } catch (err) {
    console.warn('Could not sync water test reminder', err);
  }
}

function syncFloaterReminder(now = Date.now()) {
  if (typeof window === 'undefined' || typeof globalThis.SpaNativeBridge === 'undefined') return;
  const bridge = globalThis.SpaNativeBridge.createNativeBridge(window).get();
  if (!bridge) return;
  const state = readSavedState();
  const config = floaterReminderConfig(state);
  try {
    if (!config.enabled) {
      bridge.cancelReminder(FLOATER_REMINDER_KEY);
      return;
    }
    const lastCheck = state.lastFloaterCheck || latestHistoryAt(state.history, 'floater-check');
    const dueAt = maintenanceDueAt(lastCheck, config.days, now);
    const scheduledAt = Math.max(now + 60000, dueAt);
    bridge.scheduleReminder(
      FLOATER_REMINDER_KEY,
      scheduledAt,
      'Check the chlorine floater',
      'Make sure chlorine tablets remain, the floater is dispensing freely, and the setting has not moved.'
    );
  } catch (err) {
    console.warn('Could not sync chlorine floater reminder', err);
  }
}

function recoverMaintenanceDatesFromHistory() {
  const state = readSavedState();
  let changed = false;
  MAINTENANCE_FIELDS.forEach(field => {
    if (state[field.key]) return;
    const recovered = latestHistoryAt(state.history, field.historyType);
    if (recovered) { state[field.key] = recovered; changed = true; }
  });
  if (!state.lastFloaterCheck) {
    const recoveredFloater = latestHistoryAt(state.history, 'floater-check');
    if (recoveredFloater) { state.lastFloaterCheck = recoveredFloater; changed = true; }
  }
  if (changed) writeSavedState(state);
  return state;
}

function isoToLocalDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localDateToIso(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function maintenanceDateFieldsHtml(prefix='') {
  const state = readSavedState();
  return MAINTENANCE_FIELDS.map(field => {
    const id = `${prefix}${field.input}`;
    const value = isoToLocalDate(state[field.key]);
    return `<label class="field">${field.label}<input id="${id}" type="date" value="${value}" /></label>`;
  }).join('');
}

function applyMaintenanceDateInputs(prefix='', completeOnboarding=false) {
  const state = readSavedState();
  MAINTENANCE_FIELDS.forEach(field => {
    const el = document.getElementById(`${prefix}${field.input}`);
    if (!el) return;
    const iso = localDateToIso(el.value);
    if (iso) state[field.key] = iso;
    else if (!state[field.key]) state[field.key] = null;
  });
  if (completeOnboarding) state.onboardingComplete = true;
  state.maintenanceDatesSetupComplete = MAINTENANCE_FIELDS.every(field => Boolean(state[field.key]));
  return writeSavedState(state);
}

function saveWaterTestReminderSettings() {
  const enabled = document.getElementById('waterTestReminderEnabled');
  const days = document.getElementById('waterTestReminderDays');
  if (!enabled || !days) return false;
  const state = readSavedState();
  state.waterTestReminder = {
    enabled: Boolean(enabled.checked),
    days: Math.max(1, Math.min(30, Number(days.value) || DEFAULT_WATER_TEST_REMINDER.days))
  };
  if (!writeSavedState(state)) return false;
  syncWaterTestReminder();
  return true;
}

function saveFloaterReminderSettings() {
  const enabled = document.getElementById('floaterReminderEnabled');
  const days = document.getElementById('floaterReminderDays');
  if (!enabled || !days) return false;
  const state = readSavedState();
  state.floaterReminder = {
    enabled: Boolean(enabled.checked),
    days: Math.max(1, Math.min(30, Number(days.value) || DEFAULT_FLOATER_REMINDER.days))
  };
  if (!writeSavedState(state)) return false;
  syncFloaterReminder();
  return true;
}

function logFloaterCheck() {
  const state = readSavedState();
  const at = new Date().toISOString();
  state.lastFloaterCheck = at;
  state.history = Array.isArray(state.history) ? state.history : [];
  state.history.unshift({ id:`floater-${Date.now()}`, at, type:'floater-check' });
  if (state.history.length > 200) state.history = state.history.slice(0, 200);
  if (!writeSavedState(state)) return false;
  syncFloaterReminder();
  return true;
}

function installWaterTestReminderSettings() {
  if (typeof document === 'undefined') return;
  const settings = document.getElementById('settingsScreen');
  if (!settings || document.getElementById('waterTestReminderCard')) return;
  const state = readSavedState();
  const config = waterTestReminderConfig(state);
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'waterTestReminderCard';
  card.innerHTML = `<div class="section-label">Water testing</div><h3>Test-water reminder</h3><p class="muted small">Intex recommends testing before each use and at least once a week. Spa Coach resets this reminder every time you log a water test.</p><label class="check-field"><input id="waterTestReminderEnabled" type="checkbox" ${config.enabled ? 'checked' : ''}> <span>Remind me to test the water</span></label><label class="field">Remind me after this many days without a test<input id="waterTestReminderDays" type="number" min="1" max="30" value="${Math.max(1, Number(config.days) || 7)}" /></label><button class="secondary full" id="saveWaterTestReminderBtn" type="button">SAVE WATER TEST REMINDER</button>`;
  settings.appendChild(card);
  document.getElementById('saveWaterTestReminderBtn').addEventListener('click', () => {
    if (saveWaterTestReminderSettings()) location.reload();
  });
}

function installFloaterReminderUi() {
  if (typeof document === 'undefined') return;
  const state = readSavedState();
  const config = floaterReminderConfig(state);
  const settings = document.getElementById('settingsScreen');
  if (settings && !document.getElementById('floaterReminderCard')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'floaterReminderCard';
    card.innerHTML = `<div class="section-label">Chlorine floater</div><h3>Floater check reminder</h3><p class="muted small">Check that tablets remain, the openings are clear, and the dispensing setting has not moved.</p><label class="check-field"><input id="floaterReminderEnabled" type="checkbox" ${config.enabled ? 'checked' : ''}> <span>Remind me to check the chlorine floater</span></label><label class="field">Remind me after this many days without a check<input id="floaterReminderDays" type="number" min="1" max="30" value="${Math.max(1, Number(config.days) || 3)}" /></label><button class="secondary full" id="saveFloaterReminderBtn" type="button">SAVE FLOATER REMINDER</button>`;
    settings.appendChild(card);
    document.getElementById('saveFloaterReminderBtn').addEventListener('click', () => {
      if (saveFloaterReminderSettings()) location.reload();
    });
  }

  const home = document.getElementById('homeScreen');
  if (home && !document.getElementById('floaterCheckCard')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'floaterCheckCard';
    const status = maintenanceDue(state.lastFloaterCheck || latestHistoryAt(state.history, 'floater-check'), config.days);
    card.innerHTML = `<div class="card-heading-row"><div><div class="section-label">Sanitizer</div><h3>Chlorine floater</h3></div><button class="secondary small-btn" id="logFloaterCheckBtn" type="button">Log check</button></div><div class="muted small" id="floaterCheckStatus">${config.enabled ? status.label : 'Reminder disabled'}</div>`;
    const dashboardCard = document.getElementById('maintenanceDashboard')?.closest('.card');
    if (dashboardCard?.parentNode) dashboardCard.parentNode.insertBefore(card, dashboardCard);
    else home.appendChild(card);
    document.getElementById('logFloaterCheckBtn').addEventListener('click', () => {
      if (logFloaterCheck()) location.reload();
    });
  }
}

function installMaintenanceOnboarding() {
  if (typeof document === 'undefined') return;
  const finish = document.getElementById('finishOnboardingBtn');
  if (finish && !document.getElementById('maintenanceOnboardingDates')) {
    const panel = document.createElement('div');
    panel.id = 'maintenanceOnboardingDates';
    panel.className = 'callout';
    panel.innerHTML = `<strong>Set your maintenance starting point</strong><p class="muted small">Spa Coach uses dates you already logged when available. Fill in anything missing so reminders are based on your spa's real maintenance history. Leave a date blank if you genuinely do not know it.</p>${maintenanceDateFieldsHtml('onboarding-')}`;
    finish.parentNode.insertBefore(panel, finish);
    finish.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      applyMaintenanceDateInputs('onboarding-', true);
      location.reload();
    }, true);
  }

  const settings = document.getElementById('settingsScreen');
  if (settings && !document.getElementById('maintenanceDatesCard')) {
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'maintenanceDatesCard';
    card.innerHTML = `<div class="section-label">Maintenance dates</div><h3>Reminder starting points</h3><p class="muted small">Existing logged maintenance is reused automatically. Change these only if the recorded date is missing or wrong.</p>${maintenanceDateFieldsHtml('settings-')}<button class="secondary full" id="saveMaintenanceDatesBtn" type="button">SAVE MAINTENANCE DATES</button>`;
    settings.appendChild(card);
    document.getElementById('saveMaintenanceDatesBtn').addEventListener('click', () => {
      if (applyMaintenanceDateInputs('settings-', false)) location.reload();
    });
  }
}

function installRecurringReminderSync() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const syncAll = () => { syncWaterTestReminder(); syncFloaterReminder(); };
  setTimeout(syncAll, 0);
  document.addEventListener('click', event => {
    if (!event.target?.closest?.('#logTreatmentBtn, #skipTreatmentBtn')) return;
    setTimeout(syncWaterTestReminder, 2000);
  });
  window.addEventListener('pagehide', syncAll);
  window.setInterval(syncAll, 30000);
}

recoverMaintenanceDatesFromHistory();
installMaintenanceOnboarding();
installWaterTestReminderSettings();
installFloaterReminderUi();
installRecurringReminderSync();

globalThis.SpaReminders = Object.freeze({
  futureRelative,
  maintenanceDue,
  maintenanceDueAt,
  recoverMaintenanceDatesFromHistory,
  syncWaterTestReminder,
  waterTestReminderConfig,
  syncFloaterReminder,
  floaterReminderConfig,
  logFloaterCheck
});
})();
