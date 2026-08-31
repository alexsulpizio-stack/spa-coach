import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/state.js';

const { STATE_SCHEMA_VERSION,migrateState }=globalThis.SpaState;

test('legacy state is normalized and versioned',()=>{
  const migrated=migrateState({profile:{name:'Legacy'},inventory:[],history:'invalid'});
  assert.equal(migrated.stateSchemaVersion,STATE_SCHEMA_VERSION);
  assert.equal(migrated.profile.name,'Legacy');
  assert.equal(migrated.profile.volume,290);
  assert.ok(migrated.inventory.some(item=>item.id==='neutralizer'));
  assert.deepEqual(migrated.history,[]);
});

test('state migration caps learned colors and history',()=>{
  const migrated=migrateState({
    history:Array.from({length:250},(_,id)=>({id})),
    scannerCalibrations:Array.from({length:100},(_,id)=>({id}))
  });
  assert.equal(migrated.history.length,200);
  assert.equal(migrated.scannerCalibrations.length,72);
});
