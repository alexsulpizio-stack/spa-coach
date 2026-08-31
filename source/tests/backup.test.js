import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/backup.js';

const { buildBackupPayload, migrateBackupPayload, validateBackupPayload } = globalThis.SpaBackup;

const createdAt = '2026-08-31T12:00:00.000Z';
const state = { profile: { name: 'Test Spa' }, history: [] };
const photos = [{
  id: 'photo-1',
  fullBlob: 'data:image/jpeg;base64,AQID',
  thumbBlob: 'data:image/jpeg;base64,AQI=',
  at: createdAt
}];

test('full backup payload round-trips through JSON', () => {
  const payload = buildBackupPayload(state, photos, createdAt);
  const restored = validateBackupPayload(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(restored.state, state);
  assert.deepEqual(restored.photos, photos);
  assert.equal(restored.version, 4);
});

test('backup validation rejects unsupported or incomplete data', () => {
  assert.throws(() => validateBackupPayload({}), /format/);
  assert.throws(
    () => validateBackupPayload({ format: 'spa-coach-full-backup', version: 2, createdAt, state, photos: [] }),
    /version/
  );
  assert.throws(
    () => validateBackupPayload({ format: 'spa-coach-full-backup', version: 4, createdAt, state, photos: {} }),
    /photos/
  );
});

test('legacy v3 backups migrate to the current envelope',()=>{
  const migrated=migrateBackupPayload({format:'spa-coach-full-backup',version:3,createdAt,state,photos:[]});
  assert.equal(migrated.version,4);
  assert.equal(migrated.stateSchemaVersion,0);
});

test('backup validation rejects malformed photo data', () => {
  assert.throws(
    () => validateBackupPayload(buildBackupPayload(state, [{ id: 'bad', fullBlob: 'not-a-data-url' }], createdAt)),
    /photo/
  );
});
