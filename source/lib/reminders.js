(() => {
const DAY_MS = 86400000;
const STORAGE_KEY = 'spaCoachState';
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

function recoverMaintenanceDatesFromHistory() {
  const state = readSavedState();
  let changed = false;
  MAINTENANCE_FIELDS.forEach(field => {
    if (state[field.key]) return;
    const recovered = latestHistoryAt(state.history, field.historyType);
    if (recovered) { state[field.key] = recovered; changed = true; }
  });
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

// This file loads immediately before app.js. Repair legacy/mismatched state first so
// app.js sees recovered maintenance dates when it creates reminders and renders status.
recoverMaintenanceDatesFromHistory();
installMaintenanceOnboarding();

globalThis.SpaReminders = Object.freeze({
  futureRelative,
  maintenanceDue,
  maintenanceDueAt,
  recoverMaintenanceDatesFromHistory
});
})();
