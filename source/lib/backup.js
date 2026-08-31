(() => {
const BACKUP_FORMAT = 'spa-coach-full-backup';
const BACKUP_VERSION = 4;

function buildBackupPayload(state, photos, createdAt = new Date().toISOString(), appVersion = '') {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    stateSchemaVersion: Number(state?.stateSchemaVersion) || 1,
    createdAt,
    state,
    photos
  };
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Backup payload must be an object');
  if (payload.format !== BACKUP_FORMAT) throw new Error('Unsupported backup format');
  if (payload.version !== BACKUP_VERSION) throw new Error('Unsupported backup version');
  if (!payload.createdAt || !Number.isFinite(new Date(payload.createdAt).getTime())) throw new Error('Backup date is invalid');
  if (!payload.state || typeof payload.state !== 'object' || Array.isArray(payload.state)) throw new Error('Backup state is missing');
  if (!Array.isArray(payload.photos)) throw new Error('Backup photos must be an array');
  const ids = new Set();
  for (const photo of payload.photos) {
    if (!photo || typeof photo !== 'object' || typeof photo.id !== 'string' || !photo.id || ids.has(photo.id) ||
        typeof photo.fullBlob !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(photo.fullBlob)) {
      throw new Error('Backup contains an invalid photo');
    }
    ids.add(photo.id);
    if (photo.thumbBlob != null && (typeof photo.thumbBlob !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(photo.thumbBlob))) {
      throw new Error('Backup contains an invalid thumbnail');
    }
  }
  return payload;
}

function migrateBackupPayload(rawPayload) {
  if (!rawPayload || rawPayload.format !== BACKUP_FORMAT) throw new Error('Unsupported backup format');
  const sourceVersion = Number(rawPayload.version || 1);
  if (sourceVersion < 1 || sourceVersion > BACKUP_VERSION) throw new Error('Unsupported backup version');
  const migrated = sourceVersion < 4
    ? {
        ...rawPayload,
        version: 4,
        appVersion: rawPayload.appVersion || '',
        stateSchemaVersion: Number(rawPayload.stateSchemaVersion || rawPayload.state?.stateSchemaVersion) || 0
      }
    : { ...rawPayload };
  return validateBackupPayload(migrated);
}

function preparePhotoRecords(photos, decodeDataUrl) {
  return photos.map(photo => {
    const { fullBlob, thumbBlob, ...metadata } = photo;
    return {
      ...metadata,
      fullBlob: decodeDataUrl(fullBlob),
      thumbBlob: decodeDataUrl(thumbBlob || fullBlob)
    };
  });
}

async function restoreFullBackup(rawPayload, dependencies) {
  const payload = migrateBackupPayload(rawPayload);
  const nextState = dependencies.migrateState(payload.state);
  const nextPhotos = preparePhotoRecords(payload.photos, dependencies.decodeDataUrl);
  const previousState = dependencies.storage.getItem(dependencies.stateKey);
  const previousPhotos = await dependencies.photoStore.getAll();
  try {
    await dependencies.photoStore.replaceAll(nextPhotos);
    dependencies.storage.setItem(dependencies.stateKey, JSON.stringify(nextState));
  } catch (error) {
    await dependencies.photoStore.replaceAll(previousPhotos);
    if (previousState == null) dependencies.storage.removeItem(dependencies.stateKey);
    else dependencies.storage.setItem(dependencies.stateKey, previousState);
    throw error;
  }
  return { state: nextState, photoCount: nextPhotos.length };
}

globalThis.SpaBackup = Object.freeze({
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackupPayload,
  migrateBackupPayload,
  preparePhotoRecords,
  restoreFullBackup,
  validateBackupPayload
});
})();
