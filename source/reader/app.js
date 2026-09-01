const { APP_VERSION } = globalThis.SpaVersion;
const { createPhotoStore } = globalThis.SpaPhotoStore;
const { PAD_ORDER, shouldLearnCalibration } = globalThis.SpaScanner;
const {
  EMPTY_PAD_SAMPLE,
  detectPadsFromBitmap,
  pixelsFromBitmap,
  scalePoints,
  samplePadsAtSourcePoints,
  analyzePadSamples,
  cropPadFromBitmap
} = globalThis.SpaScanSession;
const { classify, evaluateSafety, isChemistryConflict, num } = globalThis.SpaChemistry;

const STATE_KEY = 'spaStripReaderState';
const DEFAULT_STATE = {
  onboardingComplete: false,
  readings: null,
  scan: null,
  history: [],
  scannerCalibrations: []
};

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
  const photoStore = createPhotoStore(window.indexedDB, APP_VERSION, { databaseName: 'SpaStripReaderPhotoDB' });

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULT_STATE };
      return {
        ...DEFAULT_STATE,
        ...saved,
        history: Array.isArray(saved.history) ? saved.history.slice(-200) : [],
        scannerCalibrations: Array.isArray(saved.scannerCalibrations) ? saved.scannerCalibrations.slice(-72) : []
      };
    } catch (_) {
      return { ...DEFAULT_STATE };
    }
  }
  function saveState() { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }

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
    c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
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
      const active = screen.id === id;
      screen.classList.toggle('active', active);
      screen.setAttribute('aria-hidden', String(!active));
      screen.inert = !active;
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (id === 'homeScreen') renderHome();
    if (id === 'historyScreen') renderHistory();
    if (id === 'settingsScreen') renderSettings();
    if (id === 'savedPhotosScreen') renderSavedPhotoLibrary();
    requestAnimationFrame(() => {
      const target = $(id)?.querySelector('h2, h3, button');
      if (target) {
        if (/^H[23]$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll:true });
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
  $('manualReadingsBtn').onclick = () => {
    state.readings = Object.fromEntries(PAD_ORDER.map(pad => [pad.key, null]));
    state.scan = {
      at: new Date().toISOString(),
      version: APP_VERSION,
      detectionMode: 'manual-entry',
      details: Object.fromEntries(PAD_ORDER.map(pad => [
        pad.key,
        { confidence:'manual', invalid:['freeChlorine','ph'].includes(pad.key), reason:['freeChlorine','ph'].includes(pad.key) ? 'manual-required' : null }
      ]))
    };
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
      sourcePixels = null;
      await prepareSavedPhoto(bitmap);
      currentWorkingPhotoId = null;
      if (origin === 'camera' && currentPhotoFullBlob) {
        try {
          const at = new Date().toISOString();
          currentWorkingPhotoId = `capture-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          await photoStore.put(currentWorkingPhotoId, currentPhotoFullBlob, currentPhotoThumbBlob, at, { kind:'capture' });
        } catch (_) { currentWorkingPhotoId = null; }
      }
      beginScanForCurrentImage();
    } catch (err) {
      alert('Strip Reader could not open that image. Try another photo or take a new one.');
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
    $('autoDetectStatus').innerHTML = '<strong>Finding the strip…</strong><br>Looking for all six reagent pads.';
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
  function getSourcePixels() {
    if (sourcePixels || !sourceImage) return sourcePixels;
    sourcePixels = pixelsFromBitmap(sourceImage);
    return sourcePixels;
  }
  function canvasToSourcePoint(x, y) {
    if (!sourceImage || !canvas.width || !canvas.height) return { x, y };
    return { x: x * sourceImage.width / canvas.width, y: y * sourceImage.height / canvas.height };
  }
  function autoDetectPads() {
    if (!sourceImage || !canvas.width || !canvas.height) return null;
    const result = detectPadsFromBitmap(sourceImage);
    if (!result) return null;
    result.points = scalePoints(result.points, sourceImage.width, sourceImage.height, canvas.width, canvas.height);
    return result;
  }
  function runAutoDetection() {
    let result;
    try {
      result = autoDetectPads();
    } catch (error) {
      console.warn('Automatic pad detection failed', error);
      enterManualMode('Automatic detection stopped safely. Tap the six pads manually from the tip toward the handle.');
      return;
    }
    if (!result || result.confidence === 'low') {
      enterManualMode('Automatic detection could not confidently find six pads. Tap them manually from the tip toward the handle.');
      return;
    }
    autoDetectionActive = true;
    autoDetectionInfo = result;
    taps = result.points;
    sampled = taps.map(p => samplePatch(p.x, p.y));
    drawScanImage();
    renderTapProgress();
    $('autoDetectStatus').className = 'callout success-callout scan-detect-callout';
    $('autoDetectStatus').innerHTML = `<strong>6 pads found automatically.</strong><br>${result.orientation==='vertical'?'Vertical':'Horizontal'} strip · ${result.confidence} geometry confidence. Check that markers 1–6 sit near the center of each colored pad.`;
    $('autoDetectActions').classList.remove('hidden');
    $('manualTapControls').classList.add('hidden');
    $('analyzeManualBtn').classList.add('hidden');
  }
  function enterManualMode(message='Tap each reagent pad manually.') {
    autoDetectionActive = false;
    autoDetectionInfo = null;
    taps = []; sampled = [];
    drawScanImage();
    $('autoDetectStatus').className = 'callout warn-callout scan-detect-callout';
    $('autoDetectStatus').innerHTML = `<strong>Manual placement</strong><br>${message}`;
    $('autoDetectActions').classList.add('hidden');
    $('manualTapControls').classList.remove('hidden');
    $('analyzeManualBtn').classList.add('hidden');
    renderTapProgress();
  }
  $('acceptAutoBtn').onclick = () => { if (taps.length === PAD_ORDER.length) analyzeTaps(); };
  $('manualModeBtn').onclick = () => enterManualMode('Tap each pad from the reagent tip toward the handle.');

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
  }
  canvas.addEventListener('click', onCanvasTap);
  canvas.addEventListener('touchend', onCanvasTap, { passive: false });

  function samplePatch(x, y) {
    const pixels = getSourcePixels();
    if (!pixels) return { ...EMPTY_PAD_SAMPLE };
    return samplePadsAtSourcePoints(pixels, [canvasToSourcePoint(x, y)])[0];
  }
  function makePadCrop(x, y) {
    return cropPadFromBitmap(sourceImage, x, y, canvas.width, canvas.height);
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
        $('tapHelp').textContent = 'Nothing has been analyzed yet. If a marker is wrong, use “Back one pad”, replace it, then tap Analyze These Pads.';
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
    const pixels = getSourcePixels();
    const sourcePoints = taps.map(point => canvasToSourcePoint(point.x, point.y));
    const result = analyzePadSamples(sampled, pixels, sourcePoints, state.scannerCalibrations);
    const whitePoint = result.whitePoint;
    if (result.flipped) {
      taps = [...taps].reverse();
      sampled = [...sampled].reverse();
      drawScanImage();
    }
    PAD_ORDER.forEach((pad, i) => {
      if (result.details[pad.key]) result.details[pad.key].cropDataUrl = makePadCrop(taps[i].x, taps[i].y);
    });
    state.readings = result.readings;
    state.scan = {
      at: new Date().toISOString(),
      details: result.details,
      version: APP_VERSION,
      detectionMode: autoDetectionActive ? 'automatic' : 'manual',
      detection: autoDetectionInfo ? {
        orientation: autoDetectionInfo.orientation,
        confidence: autoDetectionInfo.confidence,
        score: Math.round(autoDetectionInfo.score * 10) / 10,
        flipped: result.flipped,
        whiteBalanced: Boolean(whitePoint)
      } : { flipped: result.flipped, whiteBalanced: Boolean(whitePoint) }
    };
    saveState();
    renderResults();
    showScreen('resultsScreen');
  }

  function displayValue(pad, value, detail = null) {
    if (value === null || value === undefined || value === '') {
      if (detail?.skipped) return 'Unknown / skipped';
      const candidate = detail?.candidate;
      if (candidate !== undefined && candidate !== null && !detail?.invalid) return `Uncertain (~${candidate}${pad.unit ? ' ' + pad.unit : ''})`;
      return detail?.invalid ? 'Not readable' : 'Uncertain';
    }
    return `${value}${pad.unit ? ' ' + pad.unit : ''}`;
  }
  function rgbCss(rgb) {
    return Array.isArray(rgb) ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : '#ddd';
  }
  function padColorMarkup(detail, padName) {
    if (detail?.cropDataUrl) return `<img src="${detail.cropDataUrl}" alt="${escapeHtml(padName)} pad color">`;
    if (Array.isArray(detail?.rgb)) return `<div class="sample-swatch" style="background:${rgbCss(detail.rgb)}" role="img" aria-label="${escapeHtml(padName)} sampled color"></div>`;
    return '';
  }
  function renderResults() {
    const readings = state.readings || {};
    const details = state.scan?.details || {};
    const list = $('resultRows');
    list.innerHTML = '';
    PAD_ORDER.forEach(pad => {
      const node = $('resultRowTemplate').content.cloneNode(true);
      const row = node.querySelector('.result-row');
      node.querySelector('.result-name').textContent = pad.name;
      const d = details[pad.key];
      const conf = !d ? 'manual' : d.invalid ? 'not readable' : d.confidence === 'confirmed' ? 'confirmed' : `${d.confidence} confidence`;
      node.querySelector('.result-confidence').textContent = conf;
      const val = node.querySelector('.result-value');
      val.textContent = displayValue(pad, readings[pad.key], d);
      val.classList.add((d?.invalid || d?.uncertain) ? 'caution' : classify(pad.key, readings[pad.key]));
      const photo = padColorMarkup(d, pad.name);
      const photoSlot = node.querySelector('.result-pad-photo');
      if (photo) {
        photoSlot.innerHTML = photo;
        row.classList.add('has-pad-photo');
      }
      list.appendChild(node);
    });
    const safety = evaluateSafety(readings, details);
    const box = $('useStatus');
    box.className = `use-status ${safety.level}`;
    box.innerHTML = `<div>${escapeHtml(safety.title)}</div>${safety.reason ? `<div class="use-status-detail">${escapeHtml(safety.reason)}</div>` : ''}`;
    const warnings = [];
    if (Object.values(details).some(d => d?.confidence === 'low' || d?.uncertain)) warnings.push('One or more pads are uncertain. Review those values against the bottle chart before relying on them.');
    if (Object.values(details).some(d => d?.reason === 'uneven-pad')) warnings.push('A pad was marked not readable because its center color was too uneven to measure reliably.');
    if (details.totalChlorine?.reason === 'chemistry-conflict' || isChemistryConflict(num(readings.totalChlorine), num(readings.freeChlorine))) warnings.push('Total chlorine cannot be lower than free chlorine. Correct the reading or mark Total Chlorine Unknown / skip.');
    if (state.scan?.detection?.flipped) warnings.push('The reader flipped pad 1–6 because the colors fit the bottle order better that way. Confirm the tip is pad 1.');
    $('scanWarnings').innerHTML = warnings.map(w=>`<div class="callout warn-callout">⚠️ ${w}</div>`).join('');
  }

  $('editReadingsBtn').onclick = () => { renderReadingForm(); showScreen('editScreen'); };

  function reviewPresetValue(pad, detail, readings) {
    let selected = detail.invalid ? '__unknown' : (readings[pad.key] ?? detail.candidate ?? detail.value ?? '');
    if (selected === '' || selected == null) selected = detail.invalid ? '__unknown' : '';
    if (pad.key === 'totalChlorine' && selected !== '__unknown' && isChemistryConflict(selected, readings.freeChlorine)) {
      selected = '__unknown';
    }
    return selected === '' || selected == null ? '' : String(selected);
  }
  function renderReadingForm() {
    const r = state.readings || {};
    const details = state.scan?.details || {};
    const freeChlorine = num(r.freeChlorine ?? details.freeChlorine?.value);
    $('readingForm').innerHTML = PAD_ORDER.map(pad => {
      const d = details[pad.key] || {};
      const selected = reviewPresetValue(pad, d, r);
      const opts = [
        `<option value="" ${selected === '' ? 'selected' : ''} disabled>Select reading…</option>`,
        ...pad.values.map(v => {
          const blocked = pad.key === 'totalChlorine' && Number.isFinite(freeChlorine) && Number.isFinite(num(v)) && num(v) < freeChlorine;
          return `<option value="${String(v)}" ${String(v)===String(selected)?'selected':''} ${blocked?'disabled':''}>${displayValue(pad,v)}${blocked ? ' (below free chlorine)' : ''}</option>`;
        }),
        `<option value="__unknown">Unknown / skip</option>`
      ].join('');
      const skippedForChlorine = pad.key === 'totalChlorine' && selected === '__unknown' && Number.isFinite(freeChlorine);
      const note = skippedForChlorine && Number.isFinite(num(r.totalChlorine ?? d.value)) && isChemistryConflict(r.totalChlorine ?? d.value, freeChlorine)
        ? `<span class="verify-note">Total chlorine was set to Unknown / skip because it cannot be below free chlorine (${freeChlorine} ppm). The bottle chart tops out at 10 ppm.</span>`
        : d.invalid
          ? '<span class="verify-note">Scanner rejected this pad — it is set to Unknown / skip. Choose a bottle-chart value if you can read it.</span>'
          : d.uncertain
            ? '<span class="verify-note">Scanner was uncertain — please confirm.</span>'
            : skippedForChlorine && freeChlorine > 10
              ? `<span class="verify-note">Free chlorine is ${freeChlorine} ppm, above every total chlorine bottle-chart step. Total chlorine is Unknown / skip so you can continue.</span>`
              : '';
      const alternatives = (d.alternatives || []).slice(0,2);
      const padPhoto = padColorMarkup(d, pad.name);
      const comparison = (padPhoto || alternatives.length)
        ? `<div class="pad-compare">
            <div class="pad-photo-box">
              ${padPhoto || `<div class="sample-swatch" style="background:#ddd"></div>`}
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
  function refreshTotalChlorineOptions() {
    const freeChlorine = num($('edit_freeChlorine')?.value);
    const tcSelect = $('edit_totalChlorine');
    if (!tcSelect) return;
    [...tcSelect.options].forEach(option => {
      if (option.value === '' || option.value === '__unknown') return;
      const value = num(option.value);
      const blocked = Number.isFinite(freeChlorine) && Number.isFinite(value) && value < freeChlorine;
      option.disabled = blocked;
      const label = option.dataset.baseLabel || option.textContent.replace(/ \(below free chlorine\)$/, '');
      option.dataset.baseLabel = label;
      option.textContent = blocked ? `${label} (below free chlorine)` : label;
    });
  }
  function validateReviewForm() {
    const validation = $('reviewValidation');
    const saveBtn = $('saveEditsBtn');
    if (!validation || !saveBtn) return;
    let { r, incompleteRejected } = reviewFormValues();
    let autoSkippedTotalChlorine = false;
    const tcSelect = $('edit_totalChlorine');
    if (tcSelect && isChemistryConflict(r.totalChlorine, r.freeChlorine)) {
      tcSelect.value = '__unknown';
      autoSkippedTotalChlorine = true;
      ({ r, incompleteRejected } = reviewFormValues());
    }
    let msg = '';
    let blocking = false;
    if (incompleteRejected) {
      msg = 'For each rejected pad, choose a bottle-chart value or “Unknown / skip.”';
      blocking = true;
    } else if (autoSkippedTotalChlorine) {
      const fc = num(r.freeChlorine);
      msg = Number.isFinite(fc) && fc > 10
        ? `Total chlorine was set to Unknown / skip. Free chlorine is ${fc} ppm, above the 10 ppm bottle-chart maximum.`
        : `Total chlorine was set to Unknown / skip because it cannot be below free chlorine (${fc} ppm).`;
    }
    saveBtn.disabled = blocking;
    validation.className = msg ? (blocking ? 'callout bad-callout' : 'callout warn-callout') : 'callout success-callout hidden';
    validation.textContent = msg;
    refreshTotalChlorineOptions();
  }
  $('saveEditsBtn').onclick = () => {
    validateReviewForm();
    if ($('saveEditsBtn').disabled) return;
    const { r } = reviewFormValues();
    PAD_ORDER.forEach(pad => {
      const raw = $(`edit_${pad.key}`).value;
      if (state.scan?.details?.[pad.key]) {
        const d = state.scan.details[pad.key];
        if ($('calibrationOptIn')?.checked && shouldLearnCalibration(d, r[pad.key], raw === '__unknown')) {
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
    if (isChemistryConflict(num(r.totalChlorine), num(r.freeChlorine))) {
      validateReviewForm();
      return;
    }
    state.readings = r;
    saveState(); renderResults(); showScreen('resultsScreen');
  };

  async function saveCurrentReading() {
    const safety = evaluateSafety(state.readings || {}, state.scan?.details || {});
    const id = crypto.randomUUID?.() || String(Date.now());
    const at = new Date().toISOString();
    let photoSaved = false;
    if (currentPhotoFullBlob) {
      try {
        photoSaved = await photoStore.put(id, currentPhotoFullBlob, currentPhotoThumbBlob, at, { kind:'test' });
        if (photoSaved && currentWorkingPhotoId && currentWorkingPhotoId !== id) {
          try { await photoStore.remove(currentWorkingPhotoId); } catch (_) {}
          currentWorkingPhotoId = null;
        }
      } catch (_) { photoSaved = false; }
    }
    const historyDetails = structuredClone(state.scan?.details || {});
    Object.values(historyDetails).forEach(d => { if (d && typeof d === 'object') delete d.cropDataUrl; });
    state.history.unshift({
      id, at, type: 'water-test',
      readings: structuredClone(state.readings),
      scanDetails: historyDetails,
      scanVersion: state.scan?.version || APP_VERSION,
      safety,
      photoSaved
    });
    state.history = state.history.slice(0, 200);
    saveState();
    return photoSaved;
  }
  $('saveReadingBtn').onclick = async () => {
    const hadPhoto = Boolean(currentPhotoFullBlob);
    const photoSaved = await saveCurrentReading();
    showScreen('homeScreen');
    if (hadPhoto && !photoSaved) setTimeout(() => alert('The reading was saved, but the strip photo could not be stored on this device.'), 50);
  };

  function shortName(key) {
    return ({ hardness:'Hardness', totalChlorine:'Total Cl', freeChlorine:'Free Cl', ph:'pH', alkalinity:'Alkalinity', cya:'CYA' })[key] || key;
  }
  function renderHome() {
    const panel = $('homeStatus');
    if (state.readings) {
      const safety = evaluateSafety(state.readings, state.scan?.details || {});
      panel.className = `status-panel ${safety.level}`;
      const fcText = state.readings.freeChlorine == null ? 'uncertain' : `${state.readings.freeChlorine} ppm`;
      const phText = state.readings.ph == null ? 'uncertain' : state.readings.ph;
      const lastLogged = state.history.find(h => h.type === 'water-test')?.at;
      panel.innerHTML = `<div class="status-title">${escapeHtml(safety.title)}</div><div class="status-copy">${safety.reason ? `${escapeHtml(safety.reason)}<br>` : ''}Last scanned ${relativeTime(lastLogged || state.scan?.at)} · Free chlorine ${fcText} · pH ${phText}</div>`;
    } else {
      panel.className = 'status-panel neutral';
      panel.innerHTML = '<div class="status-title">No strip scanned yet</div><div class="status-copy">Photograph a fresh strip to see hardness, chlorine, pH, alkalinity, and CYA.</div>';
    }
    renderHistoryInto($('recentHistory'), state.history.slice(0, 3));
  }
  function renderHistory() { renderHistoryInto($('historyList'), state.history); }
  function renderHistoryInto(el, entries) {
    if (!entries.length) { el.innerHTML = '<div class="muted small">Nothing saved yet.</div>'; return; }
    el.innerHTML = entries.map(h => {
      const r = h.readings || {};
      const d = h.scanDetails || {};
      const safety = h.safety || evaluateSafety(r, d);
      const resultBits = PAD_ORDER.map(pad => {
        const detail = d[pad.key];
        const shown = displayValue(pad, r[pad.key], detail);
        const conf = detail?.invalid ? 'rejected' : detail?.confidence ? detail.confidence : 'legacy';
        const swatch = padColorMarkup(detail, pad.name);
        return `<div class="history-reading${swatch?' has-swatch':''}">${swatch}<span>${escapeHtml(shortName(pad.key))}</span><strong>${escapeHtml(shown)}</strong><em>${escapeHtml(conf)}</em></div>`;
      }).join('');
      const photoBlock = h.photoSaved ? `<div class="history-photo-row" data-photo-row="${escapeHtml(h.id)}">
        <button class="history-thumb-btn" data-photo-action="view" data-photo-id="${escapeHtml(h.id)}" aria-label="View saved test photo"><img class="history-thumb" data-photo-thumb="${escapeHtml(h.id)}" alt="Saved test strip thumbnail"></button>
        <div class="history-photo-actions">
          <button class="secondary" data-photo-action="view" data-photo-id="${escapeHtml(h.id)}">View photo</button>
          <button class="secondary" data-photo-action="rescan" data-photo-id="${escapeHtml(h.id)}">Rescan photo</button>
        </div>
      </div>` : '';
      return `<div class="history-entry ${safety.level}">
        <div class="history-entry-top"><div><div class="history-entry-title">Strip reading</div><div class="history-entry-meta">${formatDateTime(h.at)}</div></div><span class="history-safety ${safety.level}">${escapeHtml(safety.title)}</span></div>
        <div class="history-reading-grid">${resultBits}</div>
        ${photoBlock}
      </div>`;
    }).join('');
    hydrateHistoryPhotos(el);
  }
  async function hydrateHistoryPhotos(el) {
    const imgs = [...el.querySelectorAll('[data-photo-thumb]')];
    await Promise.all(imgs.map(async img => {
      try {
        const rec = await photoStore.get(img.dataset.photoThumb);
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
      const records = await photoStore.getAll();
      if (!records.length) {
        el.innerHTML = '<div class="muted small">No strip photos saved on this browser yet.</div>';
        return;
      }
      el.innerHTML = records.map(rec => {
        const entry = state.history.find(h => h.id === rec.id);
        const label = entry ? `Saved reading · ${formatDateTime(entry.at)}` : `Camera photo · ${formatDateTime(rec.at)}`;
        return `<button class="saved-library-item" data-library-photo-id="${escapeHtml(rec.id)}"><img data-library-thumb="${escapeHtml(rec.id)}" alt="Saved strip photo"><span><strong>${escapeHtml(label)}</strong><em>Tap to use this photo</em></span></button>`;
      }).join('');
      await Promise.all([...el.querySelectorAll('[data-library-thumb]')].map(async img => {
        const rec = await photoStore.get(img.dataset.libraryThumb);
        if (rec?.thumbBlob) img.src = makeObjectUrl(rec.thumbBlob);
      }));
    } catch (_) {
      el.innerHTML = '<div class="muted small">Could not open the saved-photo library.</div>';
    }
  }
  async function useLibraryPhoto(id) {
    try {
      const rec = await photoStore.get(id);
      if (!rec?.fullBlob) throw new Error('missing photo');
      const bitmap = await createImageBitmap(rec.fullBlob);
      sourceImage = bitmap;
      sourcePixels = null;
      currentPhotoFullBlob = rec.fullBlob;
      currentPhotoThumbBlob = rec.thumbBlob || await compressBitmap(bitmap, 260, .72);
      currentWorkingPhotoId = rec.kind === 'capture' ? rec.id : null;
      beginScanForCurrentImage();
    } catch (_) { alert('Strip Reader could not use that saved photo.'); }
  }
  $('openSavedPhotosBtn').onclick = async () => { await renderSavedPhotoLibrary(); showScreen('savedPhotosScreen'); };
  $('savedPhotoLibrary').onclick = async (e) => {
    const btn = e.target.closest('[data-library-photo-id]');
    if (btn) await useLibraryPhoto(btn.dataset.libraryPhotoId);
  };
  async function viewSavedPhoto(id) {
    try {
      const rec = await photoStore.get(id);
      if (!rec?.fullBlob) { alert('That saved photo is no longer available on this device.'); return; }
      currentViewedPhotoId = id;
      const entry = state.history.find(h => h.id === id);
      $('savedPhotoTitle').textContent = entry ? `Strip reading · ${formatDateTime(entry.at)}` : 'Saved test strip photo';
      $('savedPhotoMeta').textContent = 'Stored locally on this device.';
      $('savedPhotoImage').src = makeObjectUrl(rec.fullBlob);
      showScreen('photoScreen');
    } catch (_) { alert('Strip Reader could not open that saved photo.'); }
  }
  async function rescanSavedPhoto(id) {
    try {
      const rec = await photoStore.get(id);
      if (!rec?.fullBlob) { alert('That saved photo is no longer available on this device.'); return; }
      const bitmap = await createImageBitmap(rec.fullBlob);
      sourceImage = bitmap;
      sourcePixels = null;
      currentPhotoFullBlob = rec.fullBlob;
      currentPhotoThumbBlob = rec.thumbBlob || await compressBitmap(bitmap, 260, .72);
      beginScanForCurrentImage();
    } catch (_) { alert('Strip Reader could not rescan that saved photo.'); }
  }
  async function deleteSavedPhoto(id) {
    if (!confirm('Delete this saved strip photo? The readings will remain in history.')) return;
    try { await photoStore.remove(id); } catch (_) { alert('Strip Reader could not delete that photo.'); return; }
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

  $('clearHistoryBtn').onclick = async () => {
    if (!confirm('Clear all Strip Reader history and locally saved test-strip photos?')) return;
    try { await photoStore.clear(); } catch (_) {}
    state.history = [];
    state.readings = null;
    state.scan = null;
    saveState();
    renderHistory();
    renderHome();
  };

  function renderSettings() {
    const installedVersion = $('installedVersion');
    if (installedVersion) {
      installedVersion.textContent = `PHONE v${APP_VERSION}`;
      if ($('headerVersion')) $('headerVersion').textContent = `PHONE v${APP_VERSION}`;
      document.title = `Strip Reader PHONE v${APP_VERSION}`;
    }
    const calibrationCount = (state.scannerCalibrations || []).length;
    $('calibrationSummary').textContent = calibrationCount
      ? `${calibrationCount} learned color${calibrationCount===1?'':'s'} saved locally. Reset them if scanner results become less accurate.`
      : 'No learned colors saved.';
    $('resetCalibrationsBtn').disabled = calibrationCount === 0;
  }
  $('resetCalibrationsBtn').onclick = () => {
    if (!confirm('Reset all learned strip colors? Printed and built-in wet references will remain.')) return;
    state.scannerCalibrations = [];
    saveState();
    renderSettings();
  };
  $('finishOnboardingBtn').onclick = () => { state.onboardingComplete = true; saveState(); showScreen('homeScreen'); };

  function resetTestFlow() {
    clearInterval(timerHandle);
    $('timerBtn').disabled = false;
    $('timerBtn').textContent = 'START OPTIONAL 15-SECOND TIMER';
    $('countdown').classList.add('hidden');
    $('photoPrompt').classList.remove('hidden');
    const callout = $('photoReadyCallout');
    if (callout) callout.innerHTML = '<strong>Ready when you are.</strong> The timer is optional. If the strip is already at its read time, take or choose a photo now.';
    $('stripCameraInput').value = '';
    $('stripGalleryInput').value = '';
    taps = []; sampled = []; sourceImage = null; sourcePixels = null;
    autoDetectionActive = false; autoDetectionInfo = null;
    currentPhotoFullBlob = null; currentPhotoThumbBlob = null;
    currentViewedPhotoId = null; currentWorkingPhotoId = null;
  }
  function relativeTime(iso) {
    if (!iso) return 'recently';
    const ms = Date.now() - new Date(iso).getTime(), min = Math.round(ms / 60000);
    if (min < 1) return 'just now'; if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60); if (h < 24) return `${h} hr ago`;
    return formatDate(iso);
  }
  function formatDate(iso) { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(iso)); }
  function formatDateTime(iso) { return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(iso)); }
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  try {
    if ($('headerVersion')) $('headerVersion').textContent = `PHONE v${APP_VERSION}`;
    document.title = `Strip Reader PHONE v${APP_VERSION}`;
  } catch (_) {}
  renderHome();
  if (!state.onboardingComplete) showScreen('onboardingScreen');
})();
