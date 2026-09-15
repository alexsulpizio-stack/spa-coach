Warning: truncated output (original token count: 19962)
Total output lines: 1484

const { APP_VERSION } = globalThis.SpaVersion;
const { DEFAULT_STATE: defaultState, migrateState } = globalThis.SpaState;
const { createPhotoStore } = globalThis.SpaPhotoStore;
const nativeAdapter = globalThis.SpaNativeBridge.createNativeBridge(window);
const {
  PAD_ORDER,
  shouldLearnCalibration
} = globalThis.SpaScanner;
const {
  EMPTY_PAD_SAMPLE,
  detectPadsFromBitmap,
  pixelsFromBitmap,
  scalePoints,
  samplePadsAtSourcePoints,
  analyzePadSamples,
  cropPadFromBitmap
} = globalThis.SpaScanSession;
const {
  classify,
  evaluateSafety,
  isChemistryConflict,
  num,
  treatmentPlan,
  unresolvedIssuesFor
} = globalThis.SpaChemistry;
const { formatMinutes, makeFollowUp } = globalThis.SpaFollowUp;
const { futureRelative, maintenanceDue, maintenanceDueAt } = globalThis.SpaReminders;
const { buildBackupPayload, restoreFullBackup } = globalThis.SpaBackup;

(() => {
  'use strict';

  let state = loadState();
  let sourceImage = null;
  let sourcePixels = null;
  let taps = [];
  let sampled = [];
  let timerHandle = null;
  let currentPhotoFullBlob = null;
  let currentPhotoThumbBlob = null;
  let currentViewedPhotoId = null;
  let currentWorkingPhotoId = null;
  let autoDetectionActive = false;
  let autoDetectionInfo = null;
  const photoObjectUrls = new Set();

  const $ = (id) => document.getElementById(id);
  const screens = [...document.querySelectorAll('.screen')];

  // Native Android bridge. The browser/LAN build continues to work without it,
  // but only the installed Android build can post reliable reminders outside the app.
  function nativeBridge() {
    return nativeAdapter.get();
  }
  function isNativeAndroidApp() {
    return nativeAdapter.isNativeApp();
  }
  function nativePermissionStatus() {
    return nativeAdapter.notificationPermission();
  }
  function reminderBody(follow) {
    const fc = num(state.readings?.freeChlorine);
    if (follow?.focus === 'free chlorine' && Number.i…18962 tokens truncated…'numeric'}).format(new Date(iso)); }
  function formatDateTime(iso) { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso)); }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  setInterval(() => {
    if ($('homeScreen')?.classList.contains('active') && state.pendingFollowUp?.dueAt) renderHome();
  }, 60000);

  // Phone/PWA helpers. Over ordinary LAN HTTP the camera file input works;
  // browser installation/offline support requires a secure context.
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const btn = $('installAppBtn');
    if (btn) btn.classList.remove('hidden');
  });
  const installBtn = $('installAppBtn');
  if (installBtn) installBtn.onclick = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.classList.add('hidden');
  };

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  syncNativeReminder();
  try {
    const lastCheck=Number(localStorage.getItem('spaCoachLastUpdateCheck')||0);
    if(isNativeAndroidApp() && Date.now()-lastCheck>86400000) {
      localStorage.setItem('spaCoachLastUpdateCheck',String(Date.now()));
      nativeBridge()?.checkForUpdatesSilently?.();
    }
  } catch (_) {}
  try {
    const version = nativeBridge()?.getAppVersion?.() || APP_VERSION;
    if ($('headerVersion')) $('headerVersion').textContent = `PHONE v${version}`;
    document.title = `Spa Coach PHONE v${version}`;
  } catch (_) {}
  renderHome();
  if (!state.onboardingComplete) showScreen('onboardingScreen');
})();

