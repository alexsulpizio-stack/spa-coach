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

function detectPadsFromPixels(data, width, height) {
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    mask[p] = colorCandidate(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
  }
  const vertical = detectPadsAlongAxis(mask, width, height, 'vertical');
  const horizontal = detectPadsAlongAxis(mask, width, height, 'horizontal');
  if (vertical && horizontal) return vertical.score >= horizontal.score ? vertical : horizontal;
  return vertical || horizontal || null;
}

function scalePoints(points, fromWidth, fromHeight, toWidth, toHeight) {
  return (points || []).map(point => ({
    x: point.x * toWidth / fromWidth,
    y: point.y * toHeight / fromHeight
  }));
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

function pixelsFromBitmap(sourceImage) {
  const canvas = document.createElement('canvas');
  canvas.width = sourceImage.width;
  canvas.height = sourceImage.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sourceImage, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imageData.data, width: canvas.width, height: canvas.height };
}

function samplePadsAtSourcePoints(sourcePixels, sourcePoints) {
  if (!sourcePixels) return (sourcePoints || []).map(() => ({ ...EMPTY_PAD_SAMPLE }));
  return sourcePoints.map(point =>
    samplePatchFromPixels(sourcePixels.data, sourcePixels.width, sourcePixels.height, point.x, point.y)
  );
}

function analyzePadSamples(sampled, sourcePixels, sourcePoints, learnedCalibrations = []) {
  const whitePoint = sourcePixels
    ? estimateWhitePoint(sourcePixels.data, sourcePixels.width, sourcePixels.height, sourcePoints)
    : null;
  return { ...buildPadReadings(sampled, learnedCalibrations, { whitePoint }), whitePoint };
}

function cropPadFromBitmap(sourceImage, canvasX, canvasY, canvasWidth, canvasHeight) {
  if (!sourceImage || !canvasWidth || !canvasHeight) return null;
  try {
    const scaleX = sourceImage.width / canvasWidth;
    const scaleY = sourceImage.height / canvasHeight;
    const half = 42;
    const sx = Math.max(0, (canvasX - half) * scaleX);
    const sy = Math.max(0, (canvasY - half) * scaleY);
    const sw = Math.min(sourceImage.width - sx, half * 2 * scaleX);
    const sh = Math.min(sourceImage.height - sy, half * 2 * scaleY);
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
  detectPadsFromPixels,
  detectPadsFromBitmap,
  pixelsFromBitmap,
  scalePoints,
  samplePadsAtSourcePoints,
  analyzePadSamples,
  cropPadFromBitmap
});
})();
