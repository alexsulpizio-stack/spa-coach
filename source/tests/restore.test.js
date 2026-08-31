import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/backup.js';
import '../lib/state.js';

const { buildBackupPayload,restoreFullBackup }=globalThis.SpaBackup;
const { migrateState }=globalThis.SpaState;
const createdAt='2026-08-31T12:00:00.000Z';
const decodeDataUrl=value=>({decoded:value});

function dependencies({failStorage=false}={}){
  let stored='{"profile":{"name":"Original"}}';
  let photos=[{id:'original'}];
  return {
    deps:{
      migrateState,
      decodeDataUrl,
      stateKey:'spaCoachState',
      storage:{
        getItem:()=>stored,
        setItem:(_,value)=>{if(failStorage&&value.includes('Restored'))throw new Error('quota');stored=value;},
        removeItem:()=>{stored=null;}
      },
      photoStore:{
        getAll:async()=>structuredClone(photos),
        replaceAll:async records=>{photos=structuredClone(records);}
      }
    },
    snapshot:()=>({stored,photos})
  };
}

test('restore validates, migrates, and replaces state and photos',async()=>{
  const harness=dependencies();
  const payload=buildBackupPayload(
    {profile:{name:'Restored'},history:[]},
    [{id:'new',fullBlob:'data:image/jpeg;base64,AQ==',at:createdAt}],
    createdAt
  );
  await restoreFullBackup(payload,harness.deps);
  assert.match(harness.snapshot().stored,/Restored/);
  assert.equal(harness.snapshot().photos[0].id,'new');
  assert.equal(harness.snapshot().photos[0].fullBlob.decoded,'data:image/jpeg;base64,AQ==');
});

test('storage failure rolls photos and state back',async()=>{
  const harness=dependencies({failStorage:true});
  const before=harness.snapshot();
  const payload=buildBackupPayload(
    {profile:{name:'Restored'},history:[]},
    [{id:'new',fullBlob:'data:image/jpeg;base64,AQ==',at:createdAt}],
    createdAt
  );
  await assert.rejects(restoreFullBackup(payload,harness.deps),/quota/);
  assert.deepEqual(harness.snapshot(),before);
});
