const { APP_VERSION } = globalThis.SpaVersion;
const { DEFAULT_STATE: defaultState, migrateState } = globalThis.SpaState;
const { createPhotoStore } = globalThis.SpaPhotoStore;
const nativeAdapter = globalThis.SpaNativeBridge.createNativeBridge(window);
const {
  PAD_ORDER,
  REFERENCES,
  WET_PROTOTYPES,
  colorCandidate,
  detectPadsAlongAxis,
  matchColor
} = globalThis.SpaScanner;
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
    if (follow?.focus === 'free chlorine' && Number.isFinite(fc)) return `Free chlorine was ${fc} ppm. Tap to start a new water test.`;
    if (follow?.focus === 'pH' && state.readings?.ph != null) return `pH was ${state.readings.ph}. Tap to retest the water before another adjustment.`;
    return 'Your Spa Coach follow-up is due. Tap to retest the water.';
  }
  function syncNativeReminder() {
    const bridge = nativeBridge();
    if (!bridge) return;
    const follow = state.pendingFollowUp;
    try {
      if (follow?.kind === 'retest' && follow?.dueAt) {
        bridge.scheduleReminder(
          'retest',
          new Date(follow.dueAt).getTime(),
          follow.title || 'Time to retest your water',
          reminderBody(follow)
        );
      } else {
        bridge.cancelReminder('retest');
      }
      const maintenance = state.maintenance || defaultState.maintenance;
      syncMaintenanceReminder(bridge, 'filter', maintenance.filterEnabled, state.lastFilterRinse, maintenance.filterDays,
        'Time to rinse the filter', 'Rinse the spa filter, then log it in Spa Coach.');
      syncMaintenanceReminder(bridge, 'drain', maintenance.drainEnabled, state.lastDrainRefill, maintenance.drainDays,
        'Time to drain and refill', 'Refresh the spa water, then log the refill in Spa Coach.');
      syncMaintenanceReminder(bridge, 'replacement', maintenance.replacementEnabled, state.lastFilterReplacement, maintenance.replacementDays,
        'Time to replace the filter', 'Install a fresh filter cartridge, then log it in Spa Coach.');
    } catch (err) { console.warn('Could not sync native reminder', err); }
  }
  function syncMaintenanceReminder(bridge, key, enabled, lastDone, days, title, body) {
    if (!enabled) { bridge.cancelReminder(key); return; }
    bridge.scheduleReminder(key, maintenanceDueAt(lastDone, days), title, body);
  }
  function renderNotificationSettings() {
    const status = $('notificationStatus'), help = $('notificationHelp'), enable = $('enableNotificationsBtn'), test = $('testNotificationBtn');
    if (!status || !help || !enable || !test) return;
    if (!isNativeAndroidApp()) {
      status.textContent = 'Available in the installed Android app';
      help.textContent = 'The Wi-Fi/browser build can show reminders only while Spa Coach is open. Install the Android build for notifications that appear outside the app.';
      enable.classList.add('hidden'); test.classList.add('hidden');
      return;
    }
    const permission = nativePermissionStatus();
    if (permission === 'granted') {
      status.textContent = 'Phone reminders are enabled';
      help.textContent = 'Retest reminders will appear in Android notifications even when Spa Coach is closed. Android may delay a reminder slightly to save battery.';
      enable.classList.add('hidden'); test.classList.remove('hidden');
    } else {
      status.textContent = permission === 'denied' ? 'Phone reminders are blocked' : 'Phone reminders are ready to enable';
      help.textContent = permission === 'denied' ? 'Android notification permission is off for Spa Coach. Tap below and allow notifications when Android asks.' : 'Allow Spa Coach to post Android notifications for retests and maintenance follow-ups.';
      enable.textContent = 'ENABLE PHONE REMINDERS';
      enable.classList.remove('hidden'); test.classList.add('hidden');
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem('spaCoachState') || 'null');
      return migrateState(saved);
    } catch (_) { return migrateState(null); }
  }
  function saveState() { localStorage.setItem('spaCoachState', JSON.stringify(state)); }
  // Strip photos are kept in IndexedDB, not localStorage. This keeps binary image
  // data separate from the small JSON state and lets history retain photos locally.
  const photoStore = createPhotoStore(window.indexedDB, APP_VERSION);
  const putPhotoRecord = (...args) => photoStore.put(...args);
  const getPhotoRecord = id => photoStore.get(id);
  const getAllPhotoRecords = () => photoStore.getAll();
  const deletePhotoRecord = id => photoStore.remove(id);
  const clearPhotoRecords = () => photoStore.clear();

  function canvasBlob(canvasEl, type='image/jpeg', quality=.82) {
    return new Promise((resolve, reject) => {
      canvasEl.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode image')), type, quality);
    });
  }

  async function compressBitmap(bitmap, maxDimension, quality) {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bitmap.width * scale));
    c.height = Math.max(1, Math.round(bitmap.height * scale));
    const cctx = c.getContext('2d');
    cctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return await canvasBlob(c, 'image/jpeg', quality);
  }

  async function prepareSavedPhoto(bitmap) {
    try {
      currentPhotoFullBlob = await compressBitmap(bitmap, 1600, .82);
      currentPhotoThumbBlob = await compressBitmap(bitmap, 260, .72);
    } catch (_) {
      currentPhotoFullBlob = null;
      currentPhotoThumbBlob = null;
    }
  }

  function makeObjectUrl(blob) {
    const url = URL.createObjectURL(blob);
    photoObjectUrls.add(url);
    return url;
  }
  window.addEventListener('pagehide', () => photoObjectUrls.forEach(url => URL.revokeObjectURL(url)), { once:true });

  function showScreen(id) {
    screens.forEach(screen => {
      const active=screen.id===id;
      screen.classList.toggle('active',active);
      screen.setAttribute('aria-hidden',String(!active));
      screen.inert=!active;
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (id === 'homeScreen') renderHome();
    if (id === 'historyScreen') renderHistory();
    if (id === 'settingsScreen') renderSettings();
    if (id === 'savedPhotosScreen') renderSavedPhotoLibrary();
    requestAnimationFrame(()=>{
      const target=$(id)?.querySelector('h2, h3, button');
      if(target){
        if(/^H[23]$/.test(target.tagName))target.setAttribute('tabindex','-1');
        target.focus({preventScroll:true});
      }
    });
  }

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) showScreen(go.dataset.go);
  });

  $('settingsBtn').onclick = () => showScreen('settingsScreen');
  $('startTestBtn').onclick = () => { resetTestFlow(); showScreen('testScreen'); };
  $('openHistoryBtn').onclick = () => showScreen('historyScreen');
  $('manualReadingsBtn').onclick=()=>{
    state.readings=Object.fromEntries(PAD_ORDER.map(pad=>[pad.key,null]));
    state.scan={at:new Date().toISOString(),version:APP_VERSION,detectionMode:'manual-entry',details:Object.fromEntries(PAD_ORDER.map(pad=>[
      pad.key,
      {confidence:'manual',invalid:['freeChlorine','ph'].includes(pad.key),reason:['freeChlorine','ph'].includes(pad.key)?'manual-required':null}
    ]))};
    renderReadingForm();
    showScreen('editScreen');
  };

  $('timerBtn').onclick = startTimer;
  function startTimer() {
    clearInterval(timerHandle);
    $('timerBtn').disabled = true;
    $('timerBtn').textContent = 'HOLD STRIP LEVEL';
    $('countdown').classList.remove('hidden');
    $('photoPrompt').classList.add('hidden');
    const callout = $('photoReadyCallout');
    if (callout) callout.innerHTML = '<strong>Timer running.</strong> Hold the strip level. Photo choices will appear at 15 seconds.';
    let n = 15;
    $('countdown').textContent = n;
    timerHandle = setInterval(() => {
      n -= 1;
      $('countdown').textContent = n;
      if (n <= 0) {
        clearInterval(timerHandle);
        $('countdown').textContent = 'NOW';
        $('photoPrompt').classList.remove('hidden');
        const callout = $('photoReadyCallout');
        if (callout) callout.innerHTML = '<strong>Read now.</strong> Photograph the strip while the pads are still wet.';
        if (navigator.vibrate) navigator.vibrate([120, 70, 120]);
      }
    }, 1000);
  }

  async function loadStripPhotoFromInput(e, origin='gallery') {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      sourceImage = bitmap;
      await prepareSavedPhoto(bitmap);
      currentWorkingPhotoId = null;
      if (origin === 'camera' && currentPhotoFullBlob) {
        try {
          const at = new Date().toISOString();
          currentWorkingPhotoId = `capture-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          await putPhotoRecord(currentWorkingPhotoId, currentPhotoFullBlob, currentPhotoThumbBlob, at, { kind:'capture' });
        } catch (_) { currentWorkingPhotoId = null; }
      }
      beginScanForCurrentImage();
    } catch (err) {
      alert('Spa Coach could not open that image. Try another photo or take a new one.');
    }
  }

  $('stripCameraInput').onchange = (e) => loadStripPhotoFromInput(e, 'camera');
  $('stripGalleryInput').onchange = (e) => loadStripPhotoFromInput(e, 'gallery');

  function beginScanForCurrentImage() {
    taps = [];
    sampled = [];
    autoDetectionActive = false;
    autoDetectionInfo = null;
    drawScanImage();
    showScreen('scanScreen');
    $('autoDetectStatus').className = 'callout scan-detect-callout';
    $('autoDetectStatus').innerHTML = '<strong>Finding the strip…</strong><br>Spa Coach is looking for all six reagent pads.';
    $('autoDetectActions').classList.add('hidden');
    $('manualTapControls').classList.add('hidden');
    $('tapProgress').innerHTML = '';
    $('tapPrompt').textContent = 'Finding the strip automatically…';
    $('tapHelp').textContent = 'Best results: keep the strip roughly straight, with the reagent tip toward the top or left of the photo.';
    setTimeout(runAutoDetection, 80);
  }

  const canvas = $('stripCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  function drawScanImage() {
    if (!sourceImage) return;
    const maxW = 1200;
    const scale = Math.min(1, maxW / sourceImage.width);
    canvas.width = Math.round(sourceImage.width * scale);
    canvas.height = Math.round(sourceImage.height * scale);
    ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
    taps.forEach((p, i) => drawTapMarker(p.x, p.y, i + 1));
  }

  function drawTapMarker(x, y, n) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(11,101,116,.78)';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 1);
    ctx.restore();
  }

  function colorCandidateLegacy(r, g, b) {
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    return (max - min) > 18 && max < 250 && min > 6;
  }

  function detectPadsAlongAxisLegacy(mask, w, h, orientation) {
    const vertical = orientation === 'vertical';
    const minorLen = vertical ? w : h;
    const majorLen = vertical ? h : w;
    const counts = new Float32Array(minorLen);

    if (vertical) {
      for (let y=0; y<h; y++) for (let x=0; x<w; x++) if (mask[y*w+x]) counts[x] += 1;
    } else {
      for (let y=0; y<h; y++) for (let x=0; x<w; x++) if (mask[y*w+x]) counts[y] += 1;
    }

    const win = Math.max(7, Math.round(minorLen * .045));
    const halfWin = Math.floor(win/2);
    let bestMinor = -1, bestSmooth = -1;
    const lo = Math.round(minorLen * .04), hi = Math.round(minorLen * .96);
    for (let i=lo; i<hi; i++) {
      let sum = 0;
      for (let j=Math.max(0,i-halfWin); j<=Math.min(minorLen-1,i+halfWin); j++) sum += counts[j];
      if (sum > bestSmooth) { bestSmooth = sum; bestMinor = i; }
    }
    if (bestMinor < 0) return null;

    const bandHalf = Math.max(7, Math.round(minorLen * .027));
    const bandStart = Math.max(0, bestMinor-bandHalf), bandEnd = Math.min(minorLen-1, bestMinor+bandHalf);
    const bandWidth = bandEnd-bandStart+1;
    const fractions = new Float32Array(majorLen);
    for (let major=0; major<majorLen; major++) {
      let hits=0;
      for (let minor=bandStart; minor<=bandEnd; minor++) {
        const idx = vertical ? major*w+minor : minor*w+major;
        if (mask[idx]) hits++;
      }
      fractions[major] = hits / bandWidth;
    }

    const threshold = .32;
    const rawRuns = [];
    let i=0;
    while (i<majorLen) {
      if (fractions[i] >= threshold) {
        const start=i; let total=0, n=0;
        while (i<majorLen && fractions[i] >= threshold) { total += fractions[i]; n++; i++; }
        rawRuns.push({ start, end:i-1, coverage: total/Math.max(1,n) });
      } else i++;
    }

    // Merge tiny breaks caused by texture or glare inside one reagent pad.
    const merged=[];
    for (const run of rawRuns) {
      const prev=merged[merged.length-1];
      if (prev && run.start-prev.end-1 <= 2) {
        const n1=prev.end-prev.start+1, n2=run.end-run.start+1;
        prev.coverage=(prev.coverage*n1+run.coverage*n2)/(n1+n2);
        prev.end=run.end;
      } else merged.push({...run});
    }

    const minRun=Math.max(3,Math.round(majorLen*.008));
    const maxRun=Math.max(minRun+1,Math.round(majorLen*.12));
    let runs=merged.filter(r => (r.end-r.start+1)>=minRun && (r.end-r.start+1)<=maxRun);
    if (runs.length < 6) return null;
    if (runs.length > 14) {
      runs = [...runs].sort((a,b)=>(b.coverage*(b.end-b.start+1))-(a.coverage*(a.end-a.start+1))).slice(0,14).sort((a,b)=>a.start-b.start);
    }

    // Choose the six bands with the most strip-like spacing. This prevents a stray
    // colored object from being mistaken for a seventh reagent pad.
    let best=null;
    const choose=(start, chosen) => {
      if (chosen.length===6) {
        const centers=chosen.map(r=>(r.start+r.end)/2);
        const gaps=centers.slice(1).map((c,idx)=>c-centers[idx]);
        const mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
        if (mean < majorLen*.025 || mean > majorLen*.22) return;
        const std=Math.sqrt(gaps.reduce((a,g)=>a+(g-mean)*(g-mean),0)/gaps.length);
        const cv=std/Math.max(1,mean);
        const coverage=chosen.reduce((a,r)=>a+r.coverage,0)/6;
        const sizes=chosen.map(r=>r.end-r.start+1);
        const sizeMean=sizes.reduce((a,b)=>a+b,0)/6;
        const sizeStd=Math.sqrt(sizes.reduce((a,v)=>a+(v-sizeMean)*(v-sizeMean),0)/6);
        const sizeCv=sizeStd/Math.max(1,sizeMean);
        const minGap=Math.max(1,Math.min(...gaps)), maxGap=Math.max(...gaps);
        const extreme=maxGap/minGap;
        const score=coverage*100-cv*70-sizeCv*12-Math.max(0,extreme-1.8)*18;
        if (!best || score>best.score) best={score, chosen:[...chosen], cv, coverage, meanGap:mean, extreme};
        return;
      }
      for (let k=start; k<=runs.length-(6-chosen.length); k++) choose(k+1,[...chosen,runs[k]]);
    };
    choose(0,[]);
    if (!best) return null;

    const centers=best.chosen.map(r=>(r.start+r.end)/2);
    const points=centers.map(c=>vertical?{x:bestMinor,y:c}:{x:c,y:bestMinor});
    const confidence=(best.cv<.25 && best.coverage>.48 && best.extreme<1.8) ? 'high' : 'medium';
    return {...best, points, orientation, confidence};
  }

  function autoDetectPads() {
    if (!sourceImage || !canvas.width || !canvas.height) return null;
    // Geometry does not need full camera resolution. A smaller working image
    // keeps older phones responsive while preserving six-pad spacing.
    const maxDim=420;
    const scale=Math.min(1,maxDim/Math.max(sourceImage.width,sourceImage.height));
    const w=Math.max(1,Math.round(sourceImage.width*scale));
    const h=Math.max(1,Math.round(sourceImage.height*scale));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const cctx=c.getContext('2d',{willReadFrequently:true});
    cctx.drawImage(sourceImage,0,0,w,h);
    const data=cctx.getImageData(0,0,w,h).data;
    const mask=new Uint8Array(w*h);
    for (let i=0,p=0; i<data.length; i+=4,p++) mask[p]=colorCandidate(data[i],data[i+1],data[i+2])?1:0;

    const vertical=detectPadsAlongAxis(mask,w,h,'vertical');
    const horizontal=detectPadsAlongAxis(mask,w,h,'horizontal');
    let result=null;
    if (vertical && horizontal) result=vertical.score>=horizontal.score?vertical:horizontal;
    else result=vertical||horizontal;
    if (!result) return null;

    // Map detection coordinates back onto the visible scan canvas.
    result.points=result.points.map(p=>({x:p.x*canvas.width/w,y:p.y*canvas.height/h}));
    return result;
  }

  function runAutoDetection() {
    let result;
    try {
      result=autoDetectPads();
    } catch (error) {
      console.warn('Automatic pad detection failed',error);
      enterManualMode('Automatic detection stopped safely. Tap the six pads manually from the tip toward the handle.');
      return;
    }
    if (!result || result.confidence==='low') {
      enterManualMode('Automatic detection could not confidently find six pads. Tap them manually from the tip toward the handle.');
      return;
    }
    autoDetectionActive=true;
    autoDetectionInfo=result;
    taps=result.points;
    sampled=taps.map(p=>samplePatch(p.x,p.y));
    drawScanImage();
    renderTapProgress();
    $('autoDetectStatus').className='callout success-callout scan-detect-callout';
    $('autoDetectStatus').innerHTML=`<strong>6 pads found automatically.</strong><br>${result.orientation==='vertical'?'Vertical':'Horizontal'} strip · ${result.confidence} geometry confidence. Check that markers 1–6 sit near the center of each colored pad.`;
    $('autoDetectActions').classList.remove('hidden');
    $('manualTapControls').classList.add('hidden');
    $('analyzeManualBtn').classList.add('hidden');
  }

  function enterManualMode(message='Tap each reagent pad manually.') {
    autoDetectionActive=false;
    autoDetectionInfo=null;
    taps=[]; sampled=[];
    drawScanImage();
    $('autoDetectStatus').className='callout warn-callout scan-detect-callout';
    $('autoDetectStatus').innerHTML=`<strong>Manual placement</strong><br>${message}`;
    $('autoDetectActions').classList.add('hidden');
    $('manualTapControls').classList.remove('hidden');
    $('analyzeManualBtn').classList.add('hidden');
    renderTapProgress();
  }

  $('acceptAutoBtn').onclick=()=>{
    if (taps.length===PAD_ORDER.length) analyzeTaps();
  };
  $('manualModeBtn').onclick=()=>enterManualMode('Tap each pad from the reagent tip toward the handle.');

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e.changedTouches?.[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  }

  function onCanvasTap(e) {
    e.preventDefault();
    if (!sourceImage || autoDetectionActive || taps.length >= PAD_ORDER.length) return;
    const p = canvasPoint(e);
    taps.push(p);
    sampled.push(samplePatch(p.x, p.y));
    drawScanImage();
    renderTapProgress();
    // Manual placement no longer auto-analyzes after pad 6. Give the user a
    // chance to back up one or more pads, inspect every marker, and explicitly
    // confirm the placement before chemistry analysis starts.
  }
  canvas.addEventListener('click', onCanvasTap);
  canvas.addEventListener('touchend', onCanvasTap, { passive: false });

  function samplePatch(x, y) {
    // v0.2.9: measure the reagent color from a deliberately small CENTER patch.
    // The larger patch is diagnostic only; wet edges, droplets and the white strip
    // around a pad must not cause an otherwise clean reagent pad to be rejected.
    const minDim = Math.min(canvas.width, canvas.height);
    const innerRadius = Math.max(5, Math.min(11, Math.round(minDim * .0055)));
    const outerRadius = Math.max(12, Math.min(24, Math.round(minDim * .012)));

    const rgbToHsv = ([r,g,b]) => {
      r/=255; g/=255; b/=255;
      const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
      let h=0;
      if (d) {
        if (max===r) h=60*(((g-b)/d)%6);
        else if (max===g) h=60*(((b-r)/d)+2);
        else h=60*(((r-g)/d)+4);
      }
      if (h<0) h+=360;
      return { h, s:max===0?0:d/max, v:max };
    };

    const patch = (radius) => {
      const sx = Math.max(0, Math.round(x - radius));
      const sy = Math.max(0, Math.round(y - radius));
      const sw = Math.min(canvas.width - sx, radius * 2 + 1);
      const sh = Math.min(canvas.height - sy, radius * 2 + 1);
      const data = ctx.getImageData(sx, sy, sw, sh).data;
      const colors = [];
      const all = [];
      for (let i = 0; i < data.length; i += 4) {
        const rgb = [data[i], data[i + 1], data[i + 2]];
        all.push(rgb);
        const max = Math.max(...rgb), min = Math.min(...rgb);
        if (max - min > 8 && max < 250 && min > 10) colors.push(rgb);
      }
      const use = colors.length >= 20 ? colors : all;
      const median = channel => {
        const a = use.map(c => c[channel]).sort((a,b)=>a-b);
        return a[Math.floor(a.length/2)] || 0;
      };
      const rgb = [median(0), median(1), median(2)];
      const distances = use.map(c => Math.hypot(c[0]-rgb[0], c[1]-rgb[1], c[2]-rgb[2])).sort((a,b)=>a-b);
      const p90 = distances[Math.floor(distances.length * .90)] || 0;
      const medianSpread = distances[Math.floor(distances.length * .50)] || 0;

      // Hue/saturation variation is more useful than raw brightness variation on a
      // wet strip. Dark purple pads can vary greatly in brightness while remaining
      // chemically uniform; a truly mottled pad tends to contain conflicting hues.
      const hsv = use.map(rgbToHsv).filter(c => c.s >= .16 && c.v >= .07 && c.v <= .98);
      let hueSpread = 0, satSpread = 0;
      if (hsv.length >= 12) {
        const cosMean = hsv.reduce((a,c)=>a+Math.cos(c.h*Math.PI/180),0)/hsv.length;
        const sinMean = hsv.reduce((a,c)=>a+Math.sin(c.h*Math.PI/180),0)/hsv.length;
        const R = Math.max(1e-6, Math.hypot(cosMean, sinMean));
        hueSpread = Math.sqrt(Math.max(0,-2*Math.log(R))) * 180 / Math.PI;
        const sats = hsv.map(c=>c.s).sort((a,b)=>a-b);
        const q = f => sats[Math.min(sats.length-1, Math.floor((sats.length-1)*f))];
        satSpread = q(.90)-q(.10);
      }
      return { rgb, p90, medianSpread, hueSpread, satSpread };
    };

    const inner = patch(innerRadius);
    const outer = patch(outerRadius);
    return {
      rgb: inner.rgb,
      innerSpread: Math.round(inner.p90 * 10) / 10,
      outerSpread: Math.round(outer.p90 * 10) / 10,
      outerMedianSpread: Math.round(outer.medianSpread * 10) / 10,
      innerHueSpread: Math.round(inner.hueSpread * 10) / 10,
      innerSatSpread: Math.round(inner.satSpread * 1000) / 1000,
      outerHueSpread: Math.round(outer.hueSpread * 10) / 10
    };
  }

  function makePadCrop(x, y) {
    if (!sourceImage || !canvas.width || !canvas.height) return null;
    try {
      const scaleX = sourceImage.width / canvas.width;
      const scaleY = sourceImage.height / canvas.height;
      const half = 42;
      const sx = Math.max(0, (x - half) * scaleX);
      const sy = Math.max(0, (y - half) * scaleY);
      const sw = Math.min(sourceImage.width - sx, half * 2 * scaleX);
      const sh = Math.min(sourceImage.height - sy, half * 2 * scaleY);
      const c = document.createElement('canvas');
      c.width = 112; c.height = 112;
      const cctx = c.getContext('2d');
      cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, c.width, c.height);
      cctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', .82);
    } catch (_) { return null; }
  }

  function renderTapProgress() {
    $('tapProgress').innerHTML = PAD_ORDER.map((p,i)=>`<span class="tap-dot ${i < taps.length ? 'done':''}">${i+1}. ${p.name}</span>`).join('');
    if (autoDetectionActive && taps.length === PAD_ORDER.length) {
      $('tapPrompt').textContent = 'Six pads found automatically';
      $('tapHelp').textContent = 'Marker 1 should be at the reagent tip end; marker 6 should be closest to the long handle.';
    } else {
      const next = PAD_ORDER[taps.length];
      if (next) {
        $('tapPrompt').textContent = `Tap pad ${taps.length + 1}: ${next.name}`;
        $('tapHelp').textContent = taps.length
          ? 'Made a mistake? Tap “Back one pad” as many times as needed, then continue.'
          : 'Go from the tip of the strip toward the handle.';
      } else {
        $('tapPrompt').textContent = 'Check all six pad markers';
        $('tapHelp').textContent = 'Nothing has been analyzed yet. If a marker is wrong, use “Back one pad” (repeatedly if needed), replace it, then tap Analyze These Pads.';
      }
    }
    $('undoTapBtn').disabled = taps.length === 0;
    const analyzeBtn = $('analyzeManualBtn');
    if (analyzeBtn) analyzeBtn.classList.toggle('hidden', autoDetectionActive || taps.length !== PAD_ORDER.length);
  }

  $('undoTapBtn').onclick = () => {
    if (!autoDetectionActive && taps.length) {
      taps.pop(); sampled.pop(); drawScanImage(); renderTapProgress();
    }
  };
  $('resetTapsBtn').onclick = () => enterManualMode('Start over: tap each pad from the reagent tip toward the handle.');
  $('analyzeManualBtn').onclick = () => {
    if (!autoDetectionActive && taps.length === PAD_ORDER.length) analyzeTaps();
  };

  function analyzeTaps() {
    const readings = {};
    const details = {};
    PAD_ORDER.forEach((pad, i) => {
      const sample = sampled[i];
      const match = matchColor(sample.rgb, REFERENCES[pad.key], pad.key, state.scannerCalibrations);
      const detail = { ...match, rgb: sample.rgb, innerSpread: sample.innerSpread, outerSpread: sample.outerSpread,
        innerHueSpread: sample.innerHueSpread, innerSatSpread: sample.innerSatSpread, outerHueSpread: sample.outerHueSpread,
        cropDataUrl: makePadCrop(taps[i].x, taps[i].y) };

      // v0.3 quality gate: do NOT reject a clean pad merely because its wet edges
      // or brightness vary. Total Chlorine gets a tighter two-tone/mottling check;
      // other pads are rejected only for extreme conflicting color inside the center.
      const centerIsMottled = sample.innerHueSpread > 30 && sample.innerSatSpread > .20 && sample.innerSpread > 55;
      const tcIsMottled = pad.key === 'totalChlorine' && (
        sample.innerHueSpread > 8 || sample.innerSatSpread > .16 || sample.innerSpread > 34 || sample.outerMedianSpread > 30
      );
      if (tcIsMottled || centerIsMottled) {
        detail.invalid = true;
        detail.reason = 'uneven-pad';
        detail.confidence = 'rejected';
      } else if (sample.outerSpread > 95 && detail.confidence === 'high') {
        // Edge noise is worth a confidence downgrade, not rejection.
        detail.confidence = 'medium';
        detail.edgeNoise = true;
      }
      details[pad.key] = detail;
      readings[pad.key] = detail.invalid ? null : match.value;
    });

    // Chemistry sanity check: total chlorine cannot be lower than free chlorine.
    const tc = num(readings.totalChlorine), fc = num(readings.freeChlorine);
    if (Number.isFinite(tc) && Number.isFinite(fc) && tc < fc) {
      details.totalChlorine.invalid = true;
      details.totalChlorine.reason = 'chemistry-conflict';
      details.totalChlorine.confidence = 'rejected';
      details.totalChlorine.candidate = readings.totalChlorine;
      readings.totalChlorine = null;
    }

    // Low-confidence noncritical values keep their candidate for review but are not
    // silently promoted to an authoritative measurement.
    PAD_ORDER.forEach(pad => {
      const d = details[pad.key];
      if (!d.invalid && d.confidence === 'low') {
        d.uncertain = true;
        d.candidate = readings[pad.key];
        if (pad.key === 'totalChlorine') {
          d.invalid = true;
          d.reason = 'unreliable-color';
          d.confidence = 'rejected';
          readings[pad.key] = null;
        } else if (!['freeChlorine', 'ph'].includes(pad.key)) {
          readings[pad.key] = null;
        }
      }
    });

    state.readings = readings;
    state.scan = { at: new Date().toISOString(), details, version: APP_VERSION, detectionMode: autoDetectionActive ? 'automatic' : 'manual', detection: autoDetectionInfo ? { orientation:autoDetectionInfo.orientation, confidence:autoDetectionInfo.confidence, score:Math.round(autoDetectionInfo.score*10)/10 } : null };
    saveState();
    renderResults();
    showScreen('resultsScreen');
  }

  function matchColorLegacy(rgb, refs, key) {
    const lab = rgbToLab(rgb);
    const lch = labToLch(lab);
    const hueDriven = ['hardness', 'ph', 'alkalinity', 'cya'].includes(key) && lch.C >= 8;
    const candidates = [
      ...refs.map(r => ({ ...r, calibration: 'printed' })),
      ...(WET_PROTOTYPES[key] || []).map(r => ({ ...r, calibration: 'wet' })),
      ...(state.scannerCalibrations || []).filter(r => r.key === key).slice(-12).map(r => ({ value:r.value, rgb:r.rgb, calibration:'learned' }))
    ];

    const scored = candidates.map(ref => {
      const refLab = rgbToLab(ref.rgb);
      const refLch = labToLch(refLab);
      let d;
      if (hueDriven) {
        d = hueDistance(lch.h, refLch.h) + Math.abs(lch.C-refLch.C)*.07 + Math.abs(lch.L-refLch.L)*.025;
      } else {
        d = deltaE(lab, refLab);
      }
      return { ...ref, d, hueDiff: hueDistance(lch.h, refLch.h), refLch };
    }).sort((a,b)=>a.d-b.d);

    const ranked = [];
    for (const item of scored) {
      if (!ranked.some(x => String(x.value) === String(item.value))) ranked.push(item);
    }

    let best = ranked[0], second = ranked[1];
    if (key === 'ph' && best?.value === 8.4 && second?.value === 7.8 && (second.d - best.d) < 3.5 && lch.L < 58) {
      [best, second] = [second, best];
    }

    const separation = second ? second.d - best.d : 999;
    let confidence = 'high';
    if (hueDriven) {
      if (best.hueDiff > 24 || separation < 1.5) confidence = 'low';
      else if (best.hueDiff > 14 || separation < 4) confidence = 'medium';
    } else {
      if (best.d > 32 || separation < 3) confidence = 'low';
      else if (best.d > 22 || separation < 6) confidence = 'medium';
    }
    if (best.calibration === 'wet' && best.d < 8 && confidence === 'low') confidence = 'medium';
    if (key === 'freeChlorine' && best.value === 20 && best.hueDiff < 12 && lch.L <= best.refLch.L + 4) {
      confidence = separation >= 1.5 ? 'high' : 'medium';
    }

    const canonicalRgb = value => refs.find(r => String(r.value) === String(value))?.rgb || best.rgb;
    const alternatives = [best, second].filter(Boolean).map(item => ({
      value: item.value, rgb: canonicalRgb(item.value), distance: Math.round(item.d * 10)/10
    }));

    return {
      value: best.value,
      distance: Math.round(best.d * 10)/10,
      separation: Math.round(separation*10)/10,
      hueDiff: Math.round(best.hueDiff*10)/10,
      confidence,
      mode: hueDriven ? 'hue-calibrated' : 'lab',
      alternatives
    };
  }

  function rgbToLab([r,g,b]) {
    r/=255; g/=255; b/=255;
    r = r > .04045 ? Math.pow((r+.055)/1.055,2.4) : r/12.92;
    g = g > .04045 ? Math.pow((g+.055)/1.055,2.4) : g/12.92;
    b = b > .04045 ? Math.pow((b+.055)/1.055,2.4) : b/12.92;
    let x=(r*.4124+g*.3576+b*.1805)/.95047;
    let y=(r*.2126+g*.7152+b*.0722)/1.0;
    let z=(r*.0193+g*.1192+b*.9505)/1.08883;
    const f=t=>t>.008856?Math.cbrt(t):(7.787*t)+(16/116);
    x=f(x); y=f(y); z=f(z);
    return [(116*y)-16, 500*(x-y), 200*(y-z)];
  }
  function labToLch([L,a,b]) {
    const C = Math.hypot(a,b);
    const h = (Math.atan2(b,a) * 180 / Math.PI + 360) % 360;
    return { L, C, h };
  }
  function hueDistance(a,b) {
    const d = Math.abs(a-b) % 360;
    return Math.min(d, 360-d);
  }
  function deltaE(a,b) { return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); }
  function displayValue(pad, value, detail = null) {
    if (value === null || value === undefined || value === '') {
      if (detail?.skipped) return 'Unknown / skipped';
      const candidate = detail?.candidate;
      if (candidate !== undefined && candidate !== null && !detail?.invalid) return `Uncertain (~${candidate}${pad.unit ? ' ' + pad.unit : ''})`;
      return detail?.invalid ? 'Not readable' : 'Uncertain';
    }
    return `${value}${pad.unit ? ' ' + pad.unit : ''}`;
  }

  function renderResults() {
    const readings = state.readings || {};
    const details = state.scan?.details || {};
    const list = $('resultRows');
    list.innerHTML = '';
    PAD_ORDER.forEach(pad => {
      const node = $('resultRowTemplate').content.cloneNode(true);
      node.querySelector('.result-name').textContent = pad.name;
      const d = details[pad.key];
      const conf = !d ? 'manual' : d.invalid ? 'not readable' : d.confidence === 'confirmed' ? 'confirmed' : `${d.confidence} confidence`;
      node.querySelector('.result-confidence').textContent = conf;
      const val = node.querySelector('.result-value');
      val.textContent = displayValue(pad, readings[pad.key], d);
      val.classList.add((d?.invalid || d?.uncertain) ? 'caution' : classify(pad.key, readings[pad.key]));
      list.appendChild(node);
    });

    const safety = evaluateSafety(readings, details);
    const box = $('useStatus');
    box.className = `use-status ${safety.level}`;
    box.innerHTML = `<div>${escapeHtml(safety.title)}</div>${safety.reason ? `<div class="use-status-detail">${escapeHtml(safety.reason)}</div>` : ''}`;

    const warnings = [];
    const criticalLow = ['freeChlorine','ph'].some(k => ['low','rejected','skipped'].includes(details[k]?.confidence) || details[k]?.invalid || readings[k] == null);
    const tcNow = num(readings.totalChlorine), fcNow = num(readings.freeChlorine);
    const chemistryConflict = isChemistryConflict(tcNow, fcNow);
    $('treatmentBtn').textContent = (criticalLow || chemistryConflict) ? 'REVIEW READINGS FIRST' : 'WHAT SHOULD I DO?';
    if (Object.values(details).some(d => d?.confidence === 'low' || d?.uncertain)) warnings.push('One or more pads are uncertain. Review those values against the bottle chart before relying on them.');
    if (Object.values(details).some(d => d?.reason === 'uneven-pad')) warnings.push('A pad was marked not readable because its center color was too uneven to measure reliably.');
    if (details.totalChlorine?.reason === 'chemistry-conflict' || chemistryConflict) warnings.push('Total chlorine cannot be lower than free chlorine. Correct the reading or mark Total Chlorine Unknown / skip before treatment.');
    $('scanWarnings').innerHTML = warnings.map(w=>`<div class="callout warn-callout">⚠️ ${w}</div>`).join('');
  }

  $('editReadingsBtn').onclick = () => { renderReadingForm(); showScreen('editScreen'); };

  function rgbCss(rgb) {
    return Array.isArray(rgb) ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : '#ddd';
  }

  function renderReadingForm() {
    const r = state.readings || {};
    const details = state.scan?.details || {};
    $('readingForm').innerHTML = PAD_ORDER.map(pad => {
      const d = details[pad.key] || {};
      const selected = d.invalid ? '' : (r[pad.key] ?? d.candidate ?? d.value ?? '');
      const opts = [
        `<option value="" ${selected === '' ? 'selected' : ''} disabled>Select reading…</option>`,
        ...pad.values.map(v => `<option value="${String(v)}" ${String(v)===String(selected)?'selected':''}>${displayValue(pad,v)}</option>`),
        `<option value="__unknown">Unknown / skip</option>`
      ].join('');

      const note = d.invalid
        ? '<span class="verify-note">Scanner rejected this pad — select a bottle-chart value or choose Unknown / skip.</span>'
        : d.uncertain
          ? '<span class="verify-note">Scanner was uncertain — please confirm.</span>'
          : '';

      const alternatives = (d.alternatives || []).slice(0,2);
      const comparison = (d.invalid || d.uncertain || d.confidence === 'low') && (d.cropDataUrl || alternatives.length)
        ? `<div class="pad-compare">
            <div class="pad-photo-box">
              ${d.cropDataUrl ? `<img src="${d.cropDataUrl}" alt="${escapeHtml(pad.name)} pad crop">` : `<div class="sample-swatch" style="background:${rgbCss(d.rgb)}"></div>`}
              <span>Your pad</span>
            </div>
            <div class="reference-choices">
              ${alternatives.map(a => `<button type="button" class="reference-choice" aria-label="Choose ${escapeHtml(displayValue(pad,a.value))} for ${escapeHtml(pad.name)}" data-pad="${pad.key}" data-value="${String(a.value)}">
                <span class="reference-swatch" style="background:${rgbCss(a.rgb)}"></span>
                <strong>${escapeHtml(displayValue(pad,a.value))}</strong>
                <small>Tap to choose</small>
              </button>`).join('')}
            </div>
          </div>`
        : '';

      return `<div class="reading-edit-card ${d.invalid ? 'rejected' : ''}">
        <div class="reading-edit-row">
          <label for="edit_${pad.key}">${pad.name}${note}</label>
          <select id="edit_${pad.key}" data-pad-select="${pad.key}">${opts}</select>
        </div>
        ${comparison}
      </div>`;
    }).join('');

    document.querySelectorAll('.reference-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const select = $(`edit_${btn.dataset.pad}`);
        if (select) {
          select.value = btn.dataset.value;
          select.dispatchEvent(new Event('change', { bubbles:true }));
        }
      });
    });
    document.querySelectorAll('[data-pad-select]').forEach(sel => sel.addEventListener('change', validateReviewForm));
    validateReviewForm();
  }

  function reviewFormValues() {
    const r = {};
    let incompleteRejected = false;
    PAD_ORDER.forEach(pad => {
      const select = $(`edit_${pad.key}`);
      if (!select) return;
      const raw = select.value;
      const d = state.scan?.details?.[pad.key] || {};
      if (raw === '') {
        r[pad.key] = null;
        if (d.invalid) incompleteRejected = true;
      } else if (raw === '__unknown') {
        r[pad.key] = null;
      } else {
        r[pad.key] = raw.includes('–') ? raw : Number(raw);
      }
    });
    return { r, incompleteRejected };
  }

  function validateReviewForm() {
    const validation = $('reviewValidation');
    const saveBtn = $('saveEditsBtn');
    if (!validation || !saveBtn) return;
    const { r, incompleteRejected } = reviewFormValues();
    const tc = num(r.totalChlorine), fc = num(r.freeChlorine);
    const conflict = isChemistryConflict(tc, fc);

    let msg = '';
    if (incompleteRejected) {
      msg = 'For each rejected pad, choose a bottle-chart value or “Unknown / skip.”';
    } else if (conflict) {
      msg = `Total chlorine (${tc} ppm) cannot be lower than free chlorine (${fc} ppm). Correct one reading or mark Total Chlorine Unknown / skip.`;
    }
    saveBtn.disabled = Boolean(msg);
    validation.className = msg ? 'callout bad-callout' : 'callout success-callout hidden';
    validation.textContent = msg;
  }

  $('saveEditsBtn').onclick = () => {
    validateReviewForm();
    if ($('saveEditsBtn').disabled) return;

    const { r } = reviewFormValues();
    PAD_ORDER.forEach(pad => {
      const raw = $(`edit_${pad.key}`).value;
      if (state.scan?.details?.[pad.key]) {
        const d = state.scan.details[pad.key];
        if ($('calibrationOptIn')?.checked && raw !== '__unknown' && Array.isArray(d.rgb) && String(d.candidate) !== String(r[pad.key])) {
          state.scannerCalibrations = [...(state.scannerCalibrations || []), { key:pad.key, value:r[pad.key], rgb:d.rgb, at:new Date().toISOString() }].slice(-72);
        }
        if (raw === '__unknown') {
          d.confidence = 'skipped';
          d.invalid = false;
          d.uncertain = false;
          d.skipped = true;
          d.reason = null;
          d.candidate = null;
        } else {
          d.confidence = 'confirmed';
          d.invalid = false;
          d.uncertain = false;
          d.skipped = false;
          d.reason = null;
          d.candidate = r[pad.key];
        }
      }
    });

    const tc = num(r.totalChlorine), fc = num(r.freeChlorine);
    if (isChemistryConflict(tc, fc)) {
      validateReviewForm();
      return;
    }

    state.readings = r;
    saveState(); renderResults(); showScreen('resultsScreen');
  };

  $('treatmentBtn').onclick = () => {
    const details = state.scan?.details || {};
    const criticalLow = ['freeChlorine','ph'].some(k => ['low','rejected','skipped'].includes(details[k]?.confidence) || details[k]?.invalid || state.readings?.[k] == null);
    const tc = num(state.readings?.totalChlorine), fc = num(state.readings?.freeChlorine);
    const chemistryConflict = isChemistryConflict(tc, fc);
    if (criticalLow || chemistryConflict) { renderReadingForm(); showScreen('editScreen'); return; }
    renderTreatment(); showScreen('treatmentScreen');
  };

  function renderTreatment() {
    const plan = treatmentPlan(state.readings || {}, state.profile.volume, state.inventory);
    state.currentPlan = plan;
    const c = $('treatmentContent');
    const configurableRetest = plan.retestMode === 'configurable';
    const fixedRetest = Number.isFinite(plan.retestMinutes) && !configurableRetest;
    const retestControl = configurableRetest ? `
      <div class="retest-box">
        <label class="field"><strong>When should Spa Coach flag a retest?</strong>
          <select id="retestDelaySelect">
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="120" selected>2 hours</option>
            <option value="240">4 hours</option>
            <option value="720">12 hours</option>
            <option value="1440">Tomorrow</option>
            <option value="0">No timed reminder</option>
          </select>
        </label>
        <div class="muted small">In the installed Android app, this also schedules a phone notification. In the browser build, the reminder remains in-app only.</div>
      </div>` : fixedRetest ? `
      <div class="callout success-callout"><strong>Next:</strong> Spa Coach will flag a retest in about ${escapeHtml(formatMinutes(plan.retestMinutes))} after you log this step.</div>` : '';

    c.innerHTML = `
      <h2 class="treatment-title">${escapeHtml(plan.title)}</h2>
      <p>${escapeHtml(plan.explanation)}</p>
      ${plan.product ? `<div class="treatment-product"><strong>${escapeHtml(plan.product)}</strong><span>${escapeHtml(plan.dose)}</span></div>` : ''}
      <ol class="instructions">${plan.steps.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ol>
      ${plan.note ? `<div class="callout warn-callout">${escapeHtml(plan.note)}</div>` : ''}
      ${retestControl}
    `;

    const primary = $('logTreatmentBtn');
    const secondary = $('skipTreatmentBtn');
    if (plan.action === 'wait') {
      primary.textContent = 'LOG TEST & WAIT';
      secondary.textContent = 'RETEST NOW';
      secondary.classList.remove('hidden');
    } else if (plan.action === 'dose') {
      primary.textContent = 'I ADDED THIS';
      secondary.textContent = 'LOG WITHOUT TREATMENT';
      secondary.classList.remove('hidden');
    } else if (plan.action === 'advice') {
      primary.textContent = 'LOG THIS PLAN';
      secondary.textContent = 'JUST LOG TEST';
      secondary.classList.remove('hidden');
    } else {
      primary.textContent = 'LOG THIS TEST';
      secondary.classList.add('hidden');
    }
  }

  function selectedRetestDelay(plan) {
    const select = $('retestDelaySelect');
    if (select) return Math.max(0, Number(select.value) || 0);
    return Number.isFinite(plan?.retestMinutes) ? plan.retestMinutes : null;
  }

  $('logTreatmentBtn').onclick = async () => {
    const plan = state.currentPlan || treatmentPlan(state.readings || {}, state.profile.volume, state.inventory);
    const delay = selectedRetestDelay(plan);
    const treatmentDone = plan.action === 'dose';
    const photoSaved = await logCurrentTest(plan, treatmentDone, { createFollowUp: plan.action !== 'none', delayMinutes: delay });
    showScreen('homeScreen');
    if (currentPhotoFullBlob && !photoSaved) setTimeout(() => alert('The test was logged, but the strip photo could not be saved on this device.'), 50);
  };

  $('skipTreatmentBtn').onclick = async () => {
    const plan = state.currentPlan || treatmentPlan(state.readings || {}, state.profile.volume, state.inventory);
    if (plan.action === 'wait') {
      const hadPhoto = Boolean(currentPhotoFullBlob);
      const photoSaved = await logCurrentTest(plan, false, { createFollowUp:true, delayMinutes:0 });
      resetTestFlow();
      showScreen('testScreen');
      if (hadPhoto && !photoSaved) setTimeout(() => alert('The test was logged, but the strip photo could not be saved on this device.'), 50);
      return;
    }
    const photoSaved = await logCurrentTest(plan, false, { createFollowUp: plan.action !== 'none', delayMinutes:null, treatmentSkipped: plan.action === 'dose' });
    showScreen('homeScreen');
    if (currentPhotoFullBlob && !photoSaved) setTimeout(() => alert('The test was logged, but the strip photo could not be saved on this device.'), 50);
  };

  async function logCurrentTest(plan, treatmentDone, options={}) {
    const safety = evaluateSafety(state.readings || {}, state.scan?.details || {});
    const id = crypto.randomUUID?.() || String(Date.now());
    const at = new Date().toISOString();
    const priorFollowUp = state.pendingFollowUp ? structuredClone(state.pendingFollowUp) : null;
    const issues = unresolvedIssuesFor(state.readings || {});
    let photoSaved = false;
    if (currentPhotoFullBlob) {
      try {
        photoSaved = await putPhotoRecord(id, currentPhotoFullBlob, currentPhotoThumbBlob, at, { kind:'test' });
        if (photoSaved && currentWorkingPhotoId && currentWorkingPhotoId !== id) {
          try { await deletePhotoRecord(currentWorkingPhotoId); } catch (_) {}
          currentWorkingPhotoId = null;
        }
      } catch (_) { photoSaved = false; }
    }

    const historyDetails = structuredClone(state.scan?.details || {});
    Object.values(historyDetails).forEach(d => { if (d && typeof d === 'object') delete d.cropDataUrl; });

    const followUp = options.createFollowUp ? makeFollowUp(id, at, plan, issues, options) : null;
    state.pendingFollowUp = followUp;
    state.unresolvedIssues = issues;

    state.history.unshift({
      id,
      at,
      type: 'water-test',
      readings: structuredClone(state.readings),
      scanDetails: historyDetails,
      scanVersion: state.scan?.version || '0.1',
      safety,
      plan: plan?.title || null,
      planAction: plan?.action || null,
      treatmentDone,
      treatmentSkipped:Boolean(options.treatmentSkipped),
      unresolvedIssues: structuredClone(issues),
      followUp: followUp ? structuredClone(followUp) : null,
      retestOf: priorFollowUp?.sourceTestId || null,
      photoSaved
    });
    state.history = state.history.slice(0, 200);
    saveState();
    syncNativeReminder();
    return photoSaved;
  }

  $('logFilterBtn').onclick = () => {
    const now = new Date().toISOString();
    state.lastFilterRinse = now;
    state.history.unshift({ id: String(Date.now()), at: now, type:'filter-rinse' });
    saveState(); syncNativeReminder(); renderHome();
  };

  $('logDrainBtn').onclick = () => {
    const now = new Date().toISOString();
    state.lastDrainRefill = now;
    state.history.unshift({ id: String(Date.now()), at: now, type:'drain-refill' });
    saveState(); syncNativeReminder(); renderHome();
  };

  $('logReplacementBtn').onclick = () => {
    const now=new Date().toISOString(); state.lastFilterReplacement=now;
    state.history.unshift({id:String(Date.now()),at:now,type:'filter-replacement'});
    saveState(); syncNativeReminder(); renderHome(); renderSettings();
  };

  function renderHome() {
    const profile=state.profile;
    document.querySelector('#homeScreen .hero-card h2').textContent = profile.name || 'My PureSpa';
    document.querySelector('#homeScreen .hero-card .hero-row .muted:last-child').textContent = `6-person · ${profile.volume} gal · Chlorine`;
    document.querySelector('.spa-badge').innerHTML = `${profile.volume}<br><span>GAL</span>`;
    const panel=$('homeStatus');
    if (state.readings) {
      const safety=evaluateSafety(state.readings, state.scan?.details || {});
      panel.className=`status-panel ${safety.level}`;
      const fcText = state.readings.freeChlorine == null ? 'uncertain' : `${state.readings.freeChlorine} ppm`;
      const phText = state.readings.ph == null ? 'uncertain' : state.readings.ph;
      const lastLogged = state.history.find(h=>h.type==='water-test')?.at;
      panel.innerHTML=`<div class="status-title">${escapeHtml(safety.title)}</div><div class="status-copy">${safety.reason ? `${escapeHtml(safety.reason)}<br>` : ''}Last tested ${relativeTime(lastLogged || state.scan?.at)} · Free chlorine ${fcText} · pH ${phText}</div>`;
    } else {
      panel.className='status-panel neutral';
      panel.innerHTML='<div class="status-title">Needs a water test</div><div class="status-copy">Scan a fresh AquaChek strip before using the spa.</div>';
    }

    const followPanel = $('followUpPanel');
    const follow = state.pendingFollowUp;
    if (follow) {
      followPanel.classList.remove('hidden');
      const timing = follow.dueAt ? futureRelative(follow.dueAt) : (follow.kind === 'action' ? 'Treatment still pending' : 'No timer set');
      const exactDue = follow.dueAt ? `Due ${formatDateTime(follow.dueAt)}` : '';
      const issueSource = (follow.unresolvedIssues?.length ? follow.unresolvedIssues : state.unresolvedIssues) || [];
      const issueTags = issueSource.length ? `<div class="issue-tags">${issueSource.map(i=>`<span>${escapeHtml(i.label)}</span>`).join('')}</div>` : '';
      const continueButton = follow.kind === 'action' ? '<button class="secondary full followup-action" id="continuePlanBtn">VIEW NEXT STEP</button>' : '';
      followPanel.innerHTML=`
        <div class="followup-kicker">NEXT STEP</div>
        <div class="followup-title">${escapeHtml(follow.title || 'Retest water')}</div>
        <div class="followup-time ${follow.dueAt && new Date(follow.dueAt).getTime() <= Date.now() ? 'due' : ''}">${escapeHtml(timing)}</div>
        ${exactDue ? `<div class="followup-exact">${escapeHtml(exactDue)}</div>` : ''}
        <div class="followup-copy">${escapeHtml(follow.reason || '')}</div>
        ${issueTags}
        ${continueButton}`;
      const continueBtn = $('continuePlanBtn');
      if (continueBtn) continueBtn.onclick = () => { renderTreatment(); showScreen('treatmentScreen'); };
      $('startTestBtn').textContent = follow.kind === 'retest' ? (follow.dueAt && new Date(follow.dueAt).getTime() <= Date.now() ? 'RETEST NOW' : 'RETEST WATER') : 'TEST MY WATER';
    } else {
      followPanel.classList.add('hidden');
      followPanel.innerHTML='';
      $('startTestBtn').textContent = 'TEST MY WATER';
    }

    $('filterStatus').textContent = maintenanceStatus(state.lastFilterRinse, state.maintenance.filterDays, 'filter rinse');
    $('drainStatus').textContent = maintenanceStatus(state.lastDrainRefill, state.maintenance.drainDays, 'drain/refill');
    renderMaintenanceDashboard();
    renderHistoryInto($('recentHistory'), state.history.slice(0,3));
  }

  function renderHistory() { renderHistoryInto($('historyList'), state.history); }
  function renderHistoryInto(el, entries) {
    if (!entries.length) { el.innerHTML='<div class="muted small">Nothing logged yet.</div>'; return; }
    el.innerHTML=entries.map(h=>{
      if (h.type==='filter-rinse') return `<div class="history-entry"><div class="history-entry-title">Filter rinsed</div><div class="history-entry-meta">${formatDateTime(h.at)}</div></div>`;
      if (h.type==='drain-refill') return `<div class="history-entry"><div class="history-entry-title">Spa drained and refilled</div><div class="history-entry-meta">${formatDateTime(h.at)}</div></div>`;
      if (h.type==='filter-replacement') return `<div class="history-entry"><div class="history-entry-title">Filter replaced</div><div class="history-entry-meta">${formatDateTime(h.at)}</div></div>`;
      const r=h.readings||{};
      const d=h.scanDetails||{};
      const safety=h.safety || evaluateSafety(r,d);
      const resultBits = PAD_ORDER.map(pad => {
        const detail=d[pad.key];
        const raw=r[pad.key];
        const shown=displayValue(pad, raw, detail);
        const conf=detail?.invalid ? 'rejected' : detail?.confidence ? detail.confidence : 'legacy';
        return `<div class="history-reading"><span>${escapeHtml(shortName(pad.key))}</span><strong>${escapeHtml(shown)}</strong><em>${escapeHtml(conf)}</em></div>`;
      }).join('');
      const photoBlock = h.photoSaved ? `<div class="history-photo-row" data-photo-row="${escapeHtml(h.id)}">
        <button class="history-thumb-btn" data-photo-action="view" data-photo-id="${escapeHtml(h.id)}" aria-label="View saved test photo"><img class="history-thumb" data-photo-thumb="${escapeHtml(h.id)}" alt="Saved test strip thumbnail"></button>
        <div class="history-photo-actions">
          <button class="secondary" data-photo-action="view" data-photo-id="${escapeHtml(h.id)}">View photo</button>
          <button class="secondary" data-photo-action="rescan" data-photo-id="${escapeHtml(h.id)}">Rescan photo</button>
        </div>
      </div>` : '';
      const issues = h.unresolvedIssues || [];
      const issueLine = issues.length ? `<div class="history-issues">Still tracked: ${issues.map(i=>escapeHtml(i.label)).join(' · ')}</div>` : '';
      const followLine = h.followUp ? `<div class="history-followup"><strong>Next:</strong> ${escapeHtml(h.followUp.title)}${h.followUp.dueAt ? ` · ${escapeHtml(formatDateTime(h.followUp.dueAt))}` : ''}</div>` : '';
      const doneMark = h.treatmentDone ? ' ✓ added' : h.planAction === 'wait' ? ' · waiting' : h.treatmentSkipped ? ' · not completed' : '';
      return `<div class="history-entry ${safety.level}">
        <div class="history-entry-top"><div><div class="history-entry-title">Water test</div><div class="history-entry-meta">${formatDateTime(h.at)}</div></div><span class="history-safety ${safety.level}">${escapeHtml(safety.title)}</span></div>
        <div class="history-reading-grid">${resultBits}</div>
        ${h.plan?`<div class="history-entry-detail">${escapeHtml(h.plan)}${escapeHtml(doneMark)}</div>`:''}
        ${followLine}
        ${issueLine}
        ${photoBlock}
      </div>`;
    }).join('');
    hydrateHistoryPhotos(el);
  }

  async function hydrateHistoryPhotos(el) {
    const imgs = [...el.querySelectorAll('[data-photo-thumb]')];
    await Promise.all(imgs.map(async img => {
      try {
        const rec = await getPhotoRecord(img.dataset.photoThumb);
        if (!rec?.thumbBlob) throw new Error('missing photo');
        img.src = makeObjectUrl(rec.thumbBlob);
      } catch (_) {
        const row = img.closest('[data-photo-row]');
        if (row) row.remove();
      }
    }));
  }

  async function renderSavedPhotoLibrary() {
    const el = $('savedPhotoLibrary');
    if (!el) return;
    el.innerHTML = '<div class="muted small">Loading saved photos…</div>';
    try {
      const records = await getAllPhotoRecords();
      if (!records.length) {
        el.innerHTML = '<div class="muted small">No Spa Coach photos saved on this browser yet.</div>';
        return;
      }
      el.innerHTML = records.map(rec => {
        const entry = state.history.find(h => h.id === rec.id);
        const label = entry ? `Logged test · ${formatDateTime(entry.at)}` : `Camera photo · ${formatDateTime(rec.at)}`;
        return `<button class="saved-library-item" data-library-photo-id="${escapeHtml(rec.id)}"><img data-library-thumb="${escapeHtml(rec.id)}" alt="Saved strip photo"><span><strong>${escapeHtml(label)}</strong><em>Tap to use this photo</em></span></button>`;
      }).join('');
      await Promise.all([...el.querySelectorAll('[data-library-thumb]')].map(async img => {
        const rec = await getPhotoRecord(img.dataset.libraryThumb);
        if (rec?.thumbBlob) img.src = makeObjectUrl(rec.thumbBlob);
      }));
    } catch (_) {
      el.innerHTML = '<div class="muted small">Spa Coach could not open the saved-photo library.</div>';
    }
  }

  async function useLibraryPhoto(id) {
    try {
      const rec = await getPhotoRecord(id);
      if (!rec?.fullBlob) throw new Error('missing photo');
      const bitmap = await createImageBitmap(rec.fullBlob);
      sourceImage = bitmap;
      currentPhotoFullBlob = rec.fullBlob;
      currentPhotoThumbBlob = rec.thumbBlob || await compressBitmap(bitmap, 260, .72);
      currentWorkingPhotoId = rec.kind === 'capture' ? rec.id : null;
      beginScanForCurrentImage();
    } catch (_) { alert('Spa Coach could not use that saved photo.'); }
  }

  $('openSavedPhotosBtn').onclick = async () => { await renderSavedPhotoLibrary(); showScreen('savedPhotosScreen'); };
  $('savedPhotoLibrary').onclick = async (e) => {
    const btn = e.target.closest('[data-library-photo-id]');
    if (btn) await useLibraryPhoto(btn.dataset.libraryPhotoId);
  };

  async function viewSavedPhoto(id) {
    try {
      const rec = await getPhotoRecord(id);
      if (!rec?.fullBlob) { alert('That saved photo is no longer available on this device.'); return; }
      currentViewedPhotoId = id;
      const entry = state.history.find(h => h.id === id);
      $('savedPhotoTitle').textContent = entry ? `Water test · ${formatDateTime(entry.at)}` : 'Saved test strip photo';
      $('savedPhotoMeta').textContent = 'Stored locally on this device.';
      $('savedPhotoImage').src = makeObjectUrl(rec.fullBlob);
      showScreen('photoScreen');
    } catch (_) { alert('Spa Coach could not open that saved photo.'); }
  }

  async function rescanSavedPhoto(id) {
    try {
      const rec = await getPhotoRecord(id);
      if (!rec?.fullBlob) { alert('That saved photo is no longer available on this device.'); return; }
      const bitmap = await createImageBitmap(rec.fullBlob);
      sourceImage = bitmap;
      currentPhotoFullBlob = rec.fullBlob;
      currentPhotoThumbBlob = rec.thumbBlob || await compressBitmap(bitmap, 260, .72);
      beginScanForCurrentImage();
    } catch (_) { alert('Spa Coach could not rescan that saved photo.'); }
  }

  async function deleteSavedPhoto(id) {
    if (!confirm('Delete this saved strip photo? The test readings will remain in history.')) return;
    try { await deletePhotoRecord(id); } catch (_) { alert('Spa Coach could not delete that photo.'); return; }
    const entry = state.history.find(h => h.id === id);
    if (entry) entry.photoSaved = false;
    saveState();
    currentViewedPhotoId = null;
    showScreen('historyScreen');
  }

  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-photo-action]');
    if (!btn) return;
    const id = btn.dataset.photoId;
    if (!id) return;
    if (btn.dataset.photoAction === 'view') await viewSavedPhoto(id);
    if (btn.dataset.photoAction === 'rescan') await rescanSavedPhoto(id);
  });

  $('rescanSavedPhotoBtn').onclick = async () => { if (currentViewedPhotoId) await rescanSavedPhoto(currentViewedPhotoId); };
  $('deleteSavedPhotoBtn').onclick = async () => { if (currentViewedPhotoId) await deleteSavedPhoto(currentViewedPhotoId); };

  function shortName(key) {
    return ({ hardness:'Hardness', totalChlorine:'Total Cl', freeChlorine:'Free Cl', ph:'pH', alkalinity:'Alkalinity', cya:'CYA' })[key] || key;
  }

  $('clearHistoryBtn').onclick = async () => {
    if (!confirm('Clear all Spa Coach history and all locally saved test-strip photos?')) return;
    try { await clearPhotoRecords(); } catch (_) {}
    state.history=[]; state.lastFilterRinse=null; state.lastDrainRefill=null; state.lastFilterReplacement=null; state.pendingFollowUp=null; state.unresolvedIssues=[]; state.readings=null; state.scan=null; saveState(); syncNativeReminder(); renderHistory();
  };
  $('exportBtn').onclick = () => {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='spa-coach-export.json'; a.click(); URL.revokeObjectURL(a.href);
  };

  function blobToDataUrl(blob) { return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(reader.error); reader.readAsDataURL(blob); }); }
  function dataUrlToBlob(dataUrl) { const [header,data]=dataUrl.split(','); const type=(header.match(/data:([^;]+)/)||[])[1]||'image/jpeg'; const bytes=atob(data); const array=new Uint8Array(bytes.length); for(let i=0;i<bytes.length;i++)array[i]=bytes.charCodeAt(i); return new Blob([array],{type}); }
  async function buildFullBackup() {
    const photos=await getAllPhotoRecords(), encoded=[];
    for(const photo of photos) encoded.push({...photo,fullBlob:await blobToDataUrl(photo.fullBlob),thumbBlob:await blobToDataUrl(photo.thumbBlob||photo.fullBlob)});
    const payload=buildBackupPayload(state, encoded, new Date().toISOString(), APP_VERSION);
    return {json:JSON.stringify(payload),filename:`spa-coach-backup-${new Date().toISOString().slice(0,10)}.json`,count:encoded.length};
  }
  $('fullBackupBtn').onclick=async()=>{
    const status=$('backupStatus'); status.textContent='Preparing backup…';
    try {
      const backup=await buildFullBackup();
      if(isNativeAndroidApp() && nativeBridge()?.saveBackup) nativeBridge().saveBackup(backup.json,backup.filename);
      else { const blob=new Blob([backup.json],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=backup.filename; a.click(); URL.revokeObjectURL(a.href); status.textContent=`Backup complete · ${backup.count} saved photo${backup.count===1?'':'s'} included.`; }
    } catch(_) { status.textContent='Backup failed. Please try again.'; }
  };
  $('shareBackupBtn').onclick=async()=>{
    const status=$('backupStatus'); status.textContent='Preparing cloud-ready backup...';
    try {
      const backup=await buildFullBackup();
      if(isNativeAndroidApp() && nativeBridge()?.shareBackup) { nativeBridge().shareBackup(backup.json,backup.filename); return; }
      const file=new File([backup.json],backup.filename,{type:'application/json'});
      if(!navigator.share||!navigator.canShare?.({files:[file]})) throw new Error('unsupported');
      await navigator.share({title:'Spa Coach backup',text:'Spa Coach full backup',files:[file]});
      status.textContent=`Backup shared with ${backup.count} saved photo${backup.count===1?'':'s'}.`;
    } catch(err) { if(err?.name!=='AbortError') status.textContent='Sharing is unavailable here. Use Download Full Backup instead.'; }
  };
  window.addEventListener('spa-backup-status',event=>{ if($('backupStatus')) $('backupStatus').textContent=event.detail||'Backup finished.'; });
  $('restoreBackupInput').onchange=async event=>{
    const file=event.target.files?.[0]; if(!file)return;
    const status=$('backupStatus');
    try {
      const payload=JSON.parse(await file.text());
      if(!confirm(`Restore this backup from ${formatDateTime(payload.createdAt)}? Current Spa Coach data will be replaced.`))return;
      await restoreFullBackup(payload, {
        migrateState,
        decodeDataUrl:dataUrlToBlob,
        photoStore,
        storage:localStorage,
        stateKey:'spaCoachState'
      });
      status.textContent='Restore complete. Reopening Spa Coach…'; setTimeout(()=>location.reload(),500);
    } catch(_) { status.textContent='Restore failed safely. Your existing Spa Coach data was kept.'; }
    finally { event.target.value=''; }
  };

  function renderSettings() {
    $('spaNameInput').value=state.profile.name;
    $('spaVolumeInput').value=state.profile.volume;
    $('sanitizerInput').value=state.profile.sanitizer;
    const installedVersion = $('installedVersion');
    if (installedVersion) {
      let version = APP_VERSION;
      try { version = nativeBridge()?.getAppVersion?.() || version; } catch (_) {}
      installedVersion.textContent = `PHONE v${version}`;
      if ($('headerVersion')) $('headerVersion').textContent = `PHONE v${version}`;
      document.title = `Spa Coach PHONE v${version}`;
    }
    renderInventoryEditor();
    $('filterReminderEnabled').checked=state.maintenance.filterEnabled;
    $('filterIntervalDays').value=state.maintenance.filterDays;
    $('drainReminderEnabled').checked=state.maintenance.drainEnabled;
    $('drainIntervalDays').value=state.maintenance.drainDays;
    $('replacementReminderEnabled').checked=state.maintenance.replacementEnabled;
    $('replacementIntervalDays').value=state.maintenance.replacementDays;
    const calibrationCount=(state.scannerCalibrations||[]).length;
    $('calibrationSummary').textContent=calibrationCount
      ? `${calibrationCount} learned color${calibrationCount===1?'':'s'} saved locally. Reset them if scanner results become less accurate.`
      : 'No learned colors saved.';
    $('resetCalibrationsBtn').disabled=calibrationCount===0;
    renderNotificationSettings();
  }

  function renderInventoryEditor() {
    $('inventoryEditor').innerHTML=(state.inventory || []).map((item,index)=>`<div class="inventory-edit-row" data-inventory-index="${index}">
      <input aria-label="Product name" placeholder="Product name" value="${escapeHtml(item.name)}">
      <input aria-label="Purpose" placeholder="Purpose" value="${escapeHtml(item.purpose)}">
      <input aria-label="Quantity" title="Quantity remaining" type="number" min="0" step="0.01" value="${Number(item.quantity ?? 1)}">
      <input aria-label="Unit" placeholder="Unit" value="${escapeHtml(item.unit || 'container')}">
      <input aria-label="Low stock threshold" title="Low-stock threshold" type="number" min="0" step="0.01" value="${Number(item.lowAt ?? 0.25)}">
      <input aria-label="Dose per 500 gallons" title="Label dose in ounces per 500 gallons (optional)" type="number" min="0" step="0.01" placeholder="oz / 500 gal" value="${item.dosePer500 ?? ''}">
      <div class="stock-stepper"><button type="button" aria-label="Decrease quantity for ${escapeHtml(item.name)}" data-stock-delta="-0.25" data-stock-index="${index}">−</button><button type="button" aria-label="Increase quantity for ${escapeHtml(item.name)}" data-stock-delta="0.25" data-stock-index="${index}">+</button></div>
      <button class="text-btn danger-text" data-remove-inventory="${index}" type="button">Remove</button></div>`).join('');
  }
  function collectInventory() {
    return [...document.querySelectorAll('[data-inventory-index]')].map((row,index)=>({
      id: state.inventory?.[index]?.id || `custom-${Date.now()}-${index}`,
      name: row.querySelectorAll('input')[0].value.trim(), purpose: row.querySelectorAll('input')[1].value.trim(),
      quantity:Math.max(0,Number(row.querySelectorAll('input')[2].value)||0), unit:row.querySelectorAll('input')[3].value.trim()||'container',
      lowAt:Math.max(0,Number(row.querySelectorAll('input')[4].value)||0),
      dosePer500:Math.max(0,Number(row.querySelectorAll('input')[5].value)||0)
    })).filter(item=>item.name);
  }
  $('addInventoryBtn').onclick=()=>{ state.inventory=collectInventory(); state.inventory.push({id:`custom-${Date.now()}`,name:'',purpose:''}); renderInventoryEditor(); };
  $('inventoryEditor').onclick=e=>{ const stock=e.target.closest('[data-stock-delta]'); if(stock){ state.inventory=collectInventory(); const item=state.inventory[Number(stock.dataset.stockIndex)]; if(item){item.quantity=Math.max(0,item.quantity+Number(stock.dataset.stockDelta)); saveState(); renderInventoryEditor(); renderHome();} return;} const button=e.target.closest('[data-remove-inventory]'); if(!button)return; state.inventory=collectInventory().filter((_,i)=>i!==Number(button.dataset.removeInventory)); renderInventoryEditor(); };
  $('saveInventoryBtn').onclick=()=>{ state.inventory=collectInventory(); saveState(); renderInventoryEditor(); };
  $('resetCalibrationsBtn').onclick=()=>{
    if(!confirm('Reset all learned strip colors? Printed and built-in wet references will remain.'))return;
    state.scannerCalibrations=[];
    saveState();
    renderSettings();
  };
  $('saveMaintenanceBtn').onclick=()=>{
    state.maintenance={ filterEnabled:$('filterReminderEnabled').checked, filterDays:Math.max(1,Number($('filterIntervalDays').value)||7), drainEnabled:$('drainReminderEnabled').checked, drainDays:Math.max(7,Number($('drainIntervalDays').value)||90), replacementEnabled:$('replacementReminderEnabled').checked, replacementDays:Math.max(7,Number($('replacementIntervalDays').value)||90) };
    saveState(); syncNativeReminder(); renderHome();
  };
  $('checkUpdatesBtn').onclick=()=>{
    const status=$('updateStatus');
    if (!isNativeAndroidApp()) { status.textContent='Open the installed Android app to check for OTA updates.'; return; }
    status.textContent='Checking for updates…';
    try { nativeBridge()?.checkForUpdates?.(); } catch (_) { status.textContent='Could not start the update check.'; }
  };
  window.addEventListener('spa-update-status',event=>{ if ($('updateStatus')) $('updateStatus').textContent=event.detail || 'Update check finished.'; });
  $('finishOnboardingBtn').onclick=()=>{ state.onboardingComplete=true; saveState(); showScreen('homeScreen'); };

  const enableNotificationsBtn = $('enableNotificationsBtn');
  if (enableNotificationsBtn) enableNotificationsBtn.onclick = () => {
    try { nativeBridge()?.requestNotificationPermission?.(); } catch (_) {}
    setTimeout(() => { renderNotificationSettings(); syncNativeReminder(); }, 700);
  };
  const testNotificationBtn = $('testNotificationBtn');
  if (testNotificationBtn) testNotificationBtn.onclick = () => {
    try { nativeBridge()?.sendTestNotification?.(); } catch (_) {}
  };
  window.addEventListener('spa-notification-permission', () => { renderNotificationSettings(); syncNativeReminder(); });
  window.addEventListener('spa-native-reminder', (event) => {
    if (event?.detail?.action === 'retest' || !event?.detail) {
      resetTestFlow();
      showScreen('testScreen');
      const callout = $('photoReadyCallout');
      if (callout) callout.innerHTML = '<strong>Reminder opened.</strong> Time to retest your water. Use a fresh strip when you are ready.';
    }
  });
  $('saveSettingsBtn').onclick = () => {
    state.profile.name=$('spaNameInput').value.trim() || 'My PureSpa';
    state.profile.volume=Math.max(1, Number($('spaVolumeInput').value)||290);
    state.profile.sanitizer=$('sanitizerInput').value;
    saveState(); showScreen('homeScreen');
  };

  function resetTestFlow() {
    clearInterval(timerHandle);
    $('timerBtn').disabled=false; $('timerBtn').textContent='START OPTIONAL 15-SECOND TIMER';
    $('countdown').classList.add('hidden'); $('photoPrompt').classList.remove('hidden');
    const callout = $('photoReadyCallout');
    if (callout) callout.innerHTML = '<strong>Ready when you are.</strong> The timer is optional. If the strip is already at its read time, take or choose a photo now.';
    $('stripCameraInput').value=''; $('stripGalleryInput').value=''; taps=[]; sampled=[]; sourceImage=null; autoDetectionActive=false; autoDetectionInfo=null;
    currentPhotoFullBlob=null; currentPhotoThumbBlob=null; currentViewedPhotoId=null; currentWorkingPhotoId=null;
  }
  function relativeTime(iso) {
    if (!iso) return 'recently';
    const ms=Date.now()-new Date(iso).getTime(), min=Math.round(ms/60000);
    if (min<1) return 'just now'; if (min<60) return `${min} min ago`;
    const h=Math.round(min/60); if (h<24) return `${h} hr ago`;
    return formatDate(iso);
  }
  function maintenanceStatus(lastDone, days, label) {
    if (!lastDone) return `No ${label} logged yet. Reminder begins when you log one.`;
    const due=maintenanceDueAt(lastDone, days);
    const remaining=due-Date.now();
    if (remaining<=0) return `${label[0].toUpperCase()+label.slice(1)} is due now · last logged ${formatDate(lastDone)}.`;
    return `Last logged ${formatDate(lastDone)} · next due ${formatDate(new Date(due).toISOString())}.`;
  }
  function renderMaintenanceDashboard() {
    const el=$('maintenanceDashboard'); if(!el)return;
    const m=state.maintenance;
    const items=[
      ['Filter rinse',m.filterEnabled,maintenanceDue(state.lastFilterRinse,m.filterDays)],
      ['Filter replacement',m.replacementEnabled,maintenanceDue(state.lastFilterReplacement,m.replacementDays)],
      ['Drain & refill',m.drainEnabled,maintenanceDue(state.lastDrainRefill,m.drainDays)]
    ];
    const low=(state.inventory||[]).filter(i=>Number(i.quantity)<=Number(i.lowAt));
    el.innerHTML=items.map(([name,enabled,due])=>`<div class="maintenance-tile ${enabled?due.level:'neutral'}"><strong>${escapeHtml(name)}</strong><span>${enabled?escapeHtml(due.label):'Reminder off'}</span></div>`).join('')+
      `<div class="maintenance-tile ${low.length?'caution':'good'}"><strong>Chemical stock</strong><span>${low.length?`${low.length} low: ${low.map(i=>escapeHtml(i.name)).join(', ')}`:'Stock levels look good'}</span></div>`;
  }
  function formatDate(iso) { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(iso)); }
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
