(() => {
const BACKUP_FORMAT = 'spa-coach-full-backup';
const BACKUP_VERSION = 3;

function buildBackupPayload(state, photos, createdAt = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    state,
    photos
  };
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Backup payload must be an object');
  if (payload.format !== BACKUP_FORMAT) throw new Error('Unsupported backup format');
  if (payload.version !== BACKUP_VERSION) throw new Error('Unsupported backup version');
  if (!payload.state || typeof payload.state !== 'object' || Array.isArray(payload.state)) throw new Error('Backup state is missing');
  if (!Array.isArray(payload.photos)) throw new Error('Backup photos must be an array');
  for (const photo of payload.photos) {
    if (!photo || typeof photo !== 'object' || !photo.id || typeof photo.fullBlob !== 'string' || !photo.fullBlob.startsWith('data:')) {
      throw new Error('Backup contains an invalid photo');
    }
    if (photo.thumbBlob != null && (typeof photo.thumbBlob !== 'string' || !photo.thumbBlob.startsWith('data:'))) {
      throw new Error('Backup contains an invalid thumbnail');
    }
  }
  return payload;
}

globalThis.SpaBackup = Object.freeze({
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackupPayload,
  validateBackupPayload
});
})();
