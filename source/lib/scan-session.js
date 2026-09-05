(() => {
const {
  colorCandidate,
  detectPadsAlongAxis,
  samplePatchFromPixels,
  estimateWhitePoint,
  buildPadReadings
} = globalThis.SpaScanner;

const EMPTY_PAD_SAMPLE = Object.freeze({
  rgb:[0,0,0], innerSpread:0, outerSpread:0, outerMedianSpread:0,
  innerHueSpread:0, innerSatSpread:0, outerHueSpread:0
});

function hasValidDimensions(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

function hasUsableRgba(data, width, height) {
  return hasValidDimensions(width, height) && data && data.length >= Math.ceil(width) * Math.ceil(height) * 4;
}

function pickBestDetection(vertical, horizontal) {
  if (vertical && horizontal) return vertical.score >= horizontal.score ? vertical : horizontal;
  return vertical || horizontal || null;
}

function detectOnMask(mask, width, height) {
  return pickBestDetection(
    detectPadsAlongAxis(mask, width, height, 'vertical'),
    detectPadsAlongAxis(mask, width, height, 'horizontal')
  );
}

function dilateMask(mask, width, height) {
  const expanded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          expanded[yy * width + xx] = 1;
        }
      }
    }
  }
  return expanded;
}

function detectPadsFromPixels(data, width, height) {
  if (!hasUsableRgba(data, width, height)) return null;
  width = Math.floor(width);
  height = Math.floor(height);
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < mask.length; i += 4, p++) {
    mask[p] = colorCandidate(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
  }
  const primary = detectOnMask(mask, width, height);
  if (primary) return primary;
  // A 90-degree image resize can thin narrow colored pads enough to split a
  // candidate run. A single-pixel dilation restores continuity without
  // changing the geometry scoring rules or accepting blank images.
  return detectOnMask(dilateMask(mask, width, height), width, height);
}

function scalePoints(points, fromWidth, fromHeight, toWidth, toHeight) {
  if (!Array.isArray(points) || !hasValidDimensions(fromWidth, fromHeight) || !hasValidDimensions(toWidth, toHeight)) return [];
  return points.map(point => ({
    x: point.x * toWidth / fromWidth,
    y: point.y * toHeight / fromHeight
  }));
}

function sourcePointFromCanvas(point, sourceWidth, sourceHeight, canvasWidth, canvasHeight) {
  if (!point || !hasValidDimensions(sourceWidth, sourceHeight) || !hasValidDimensions(canvasWidth, canvasHeight)) {
    return point ? { x: point.x, y: point.y } : null;
  }
  return {
    x: point.x * sourceWidth / canvasWidth,
    y: point.y * sourceHeight / canvasHeight
  };
}

function detectPadsFromBitmap(sourceImage) {
  if (!sourceImage?.width || !sourceImage?.height) return null;
  const maxDim = 180;
  const scale = Math.min(1, maxDim / Math.max(sourceImage.width, sourceImage.height));
  const width = Math.max(1, Math.round(sourceImage.width * scale));
  const height = Math.max(1, Math.round(sourceImage.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sourceImage, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const result = detectPadsFromPixels(data, width, height);
  if (!result) return null;
  return {
    ...result,
    points: scalePoints(result.points, width, height, sourceImage.width, sourceImage.height)
  };
}

function detectPadsForCanvas(sourceImage, canvasWidth, canvasHeight) {
  if (!sourceImage || !hasValidDimensions(canvasWidth, canvasHeight)) return null;
  const result = detectPadsFromBitmap(sourceImage);
  if (!result) return null;
  return {
    ...result,
    points: scalePoints(result.points, sourceImage.width, sourceImage.height, canvasWidth, canvasHeight)
  };
}

function pixelsFromBitmap(sourceImage) {
  if (!sourceImage?.width || !sourceImage?.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = sourceImage.width;
  canvas.height = sourceImage.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sourceImage, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

function samplePadsAtSourcePoints(sourcePixels, sourcePoints) {
  const points = Array.isArray(sourcePoints) ? sourcePoints : [];
  if (!sourcePixels || !hasUsableRgba(sourcePixels.data, sourcePixels.width, sourcePixels.height)) {
    return points.map(() => ({ ...EMPTY_PAD_SAMPLE }));
  }
  return points.map(point =>
    samplePatchFromPixels(sourcePixels.data, sourcePixels.width, sourcePixels.height, point.x, point.y)
  );
}

function assessPadGlare(sourcePixels, sourcePoints) {
  const points = Array.isArray(sourcePoints) ? sourcePoints : [];
  if (!sourcePixels || !hasUsableRgba(sourcePixels.data, sourcePixels.width, sourcePixels.height) || !points.length) {
    return { detected:false, affected:[], maxRatio:0 };
  }
  const { data, width, height } = sourcePixels;
  const minDim = Math.min(width, height);
  const radius = Math.max(8, Math.min(18, Math.round(minDim * .0055)));
  const affected = [];
  let maxRatio = 0;
  points.forEach((point, index) => {
    const cx = Math.round(point.x), cy = Math.round(point.y);
    let total = 0, clipped = 0, usableSupport = 0;
    for (let y = Math.max(0, cy-radius); y <= Math.min(height-1, cy+radius); y++) {
      for (let x = Math.max(0, cx-radius); x <= Math.min(width-1, cx+radius); x++) {
        const dx=x-cx, dy=y-cy;
        if (dx*dx+dy*dy > radius*radius) continue;
        const i=(y*width+x)*4;
        const r=data[i], g=data[i+1], b=data[i+2];
        const maximum=Math.max(r,g,b), minimum=Math.min(r,g,b);
        total++;
        if (minimum>=248 && maximum-minimum<=8) clipped++;
        else if (maximum<248 && minimum>8) usableSupport++;
      }
    }
    const ratio = total ? clipped / total : 0;
    maxRatio = Math.max(maxRatio, ratio);
    // Some valid pads, especially low free-chlorine swatches, are intentionally
    // pale and have little chroma. Require a localized clipped highlight plus
    // surrounding non-clipped pixels instead of requiring saturated color.
    const enoughSupport = usableSupport >= Math.max(12, Math.round(total * .08));
    const enoughGlare = clipped >= Math.max(8, Math.round(total * .04));
    if (enoughSupport && enoughGlare && ratio >= .04 && ratio <= .65) {
      affected.push({ index, ratio: Math.round(ratio * 1000) / 1000, clipped, total });
    }
  });
  return { detected:affected.length>0, affected, maxRatio:Math.round(maxRatio*1000)/1000 };
}

function analyzePadSamples(sampled, sourcePixels, sourcePoints, learnedCalibrations = []) {
  const points = Array.isArray(sourcePoints) ? sourcePoints : [];
  const whitePoint = sourcePixels && hasUsableRgba(sourcePixels.data, sourcePixels.width, sourcePixels.height)
    ? estimateWhitePoint(sourcePixels.data, sourcePixels.width, sourcePixels.height, points)
    : null;
  const glare = assessPadGlare(sourcePixels, points);
  const result = buildPadReadings(sampled, learnedCalibrations, { whitePoint });
  if (glare.detected) {
    const keys = Object.keys(result.readings);
    glare.affected.forEach(item => {
      const padIndex = result.flipped ? keys.length - 1 - item.index : item.index;
      const key = keys[padIndex];
      if (!key || !result.details[key]) return;
      result.details[key] = {
        ...result.details[key],
        invalid:true,
        reason:'glare',
        confidence:'rejected',
        candidate:result.readings[key],
        glareRatio:item.ratio
      };
      result.readings[key] = null;
    });
    if (typeof globalThis.alert === 'function') {
      globalThis.alert('Glare detected on one or more test-strip pads. Change the phone angle or move away from direct light, then retake the photo. Keep the flash off and use diffuse light.');
    }
  }
  return { ...result, whitePoint, glare };
}

function cropPadFromBitmap(sourceImage, canvasX, canvasY, canvasWidth, canvasHeight) {
  if (!sourceImage || !hasValidDimensions(canvasWidth, canvasHeight)) return null;
  try {
    const scaleX = sourceImage.width / canvasWidth;
    const scaleY = sourceImage.height / canvasHeight;
    const half = 42;
    const sx = Math.max(0, (canvasX - half) * scaleX);
    const sy = Math.max(0, (canvasY - half) * scaleY);
    const sw = Math.min(sourceImage.width - sx, half * 2 * scaleX);
    const sh = Math.min(sourceImage.height - sy, half * 2 * scaleY);
    if (sw <= 0 || sh <= 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 112;
    canvas.height = 112;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .82);
  } catch (_) {
    return null;
  }
}

globalThis.SpaScanSession = Object.freeze({
  EMPTY_PAD_SAMPLE,
  pickBestDetection,
  detectPadsFromPixels,
  detectPadsFromBitmap,
  detectPadsForCanvas,
  pixelsFromBitmap,
  scalePoints,
  sourcePointFromCanvas,
  samplePadsAtSourcePoints,
  assessPadGlare,
  analyzePadSamples,
  cropPadFromBitmap
});
})();
