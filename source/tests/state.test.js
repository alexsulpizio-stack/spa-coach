import test from 'node:test';
import assert from 'node:assert/strict';

import '../lib/state.js';

const { STATE_SCHEMA_VERSION,migrateState }=globalThis.SpaState;

test('legacy state is normalized and versioned',()=>{
  const migrated=migrateState({profile:{name:'Legacy'},inventory:[],history:'invalid'});
  assert.equal(migrated.stateSchemaVersion,STATE_SCHEMA_VERSION);
  assert.equal(migrated.profile.name,'Legacy');
  assert.equal(migrated.profile.volume,290);
  assert.equal(migrated.profile.bodyOfWater,'spa');
  assert.equal(migrated.profile.sanitizerSystem,'chlorine');
  assert.ok(migrated.inventory.some(item=>item.id==='neutralizer'));
  assert.ok(migrated.inventory.some(item=>item.id==='chlorineTabs'));
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

test('pool salt profiles are preserved and normalized',()=>{
  const migrated=migrateState({profile:{bodyOfWater:'pool',poolType:'in-ground',sanitizerSystem:'salt',saltTarget:'3400',pumpHours:12}});
  assert.equal(migrated.profile.bodyOfWater,'pool');
  assert.equal(migrated.profile.poolType,'in-ground');
  assert.equal(migrated.profile.sanitizerSystem,'salt');
  assert.equal(migrated.profile.saltTarget,3400);
  assert.equal(migrated.profile.pumpHours,12);
});

test('multiple water profiles preserve the selected profile',()=>{
  const migrated=migrateState({
    profiles:[
      {id:'spa',name:'Hot tub',bodyOfWater:'spa',volume:290},
      {id:'pool',name:'Salt pool',bodyOfWater:'pool',sanitizerSystem:'salt',volume:12000}
    ],
    activeProfileId:'pool'
  });
  assert.equal(migrated.activeProfileId,'pool');
  assert.equal(migrated.profile.name,'Salt pool');
  assert.equal(migrated.profiles.length,2);
});

test('profile contexts keep readings and strip history separated',()=>{
  const migrated=migrateState({
    profiles:[{id:'spa',name:'Spa'},{id:'pool',name:'Pool',bodyOfWater:'pool'}],
    activeProfileId:'pool',
    profileContextVersion:2,
    profileData:{
      spa:{readings:{ph:7.2},history:[{id:'spa-test',type:'water-test'}]},
      pool:{readings:{ph:7.6},history:[{id:'pool-test',type:'water-test'}]}
    }
  });
  assert.deepEqual(migrated.profileData.spa.readings,{ph:7.2});
  assert.equal(migrated.profileData.spa.history[0].profileId,'spa');
  assert.deepEqual(migrated.profileData.pool.readings,{ph:7.6});
  assert.equal(migrated.profileData.pool.history[0].profileId,'pool');
});

test('legacy untagged history is assigned to the spa profile',()=>{
  const migrated=migrateState({
    profiles:[{id:'spa',name:'Spa'},{id:'pool',name:'Pool',bodyOfWater:'pool'}],
    activeProfileId:'pool',
    history:[{id:'old-test',type:'water-test'}]
  });
  assert.equal(migrated.profileData.spa.history[0].profileId,'spa');
  assert.equal(migrated.profileData.pool.history.length,0);
  assert.equal(migrated.profileContextVersion,2);
});

test('legacy history is recovered from old profile buckets',()=>{
  const migrated=migrateState({
    profiles:[{id:'spa',name:'Spa'},{id:'pool',name:'Pool',bodyOfWater:'pool'}],
    activeProfileId:'pool',
    profileData:{pool:{history:[{id:'old-test',type:'water-test'}]}}
  });
  assert.equal(migrated.profileData.spa.history[0].id,'old-test');
  assert.equal(migrated.profileData.spa.history[0].profileId,'spa');
  assert.equal(migrated.profileData.pool.history.length,0);
});

test('legacy duplicate profiles gain a pool option during migration',()=>{
  const migrated=migrateState({
    profile:{name:'My PureSpa',bodyOfWater:'spa',volume:290},
    profiles:[
      {id:'spa-default',name:'My PureSpa',bodyOfWater:'spa',volume:290},
      {id:'profile-2',name:'My PureSpa',bodyOfWater:'spa',volume:290}
    ],
    activeProfileId:'spa-default'
  });
  assert.equal(migrated.profiles[1].bodyOfWater,'pool');
  assert.equal(migrated.profiles[1].name,'My Pool');
  assert.equal(migrated.profiles[1].volume,9336);
});

test('pool closing checklist state is preserved safely',()=>{
  const migrated=migrateState({poolClosing:{startedAt:'2026-09-14T12:00:00.000Z',completedSteps:[0,2,'bad'],closedAt:null}});
  assert.equal(migrated.poolClosing.startedAt,'2026-09-14T12:00:00.000Z');
  assert.deepEqual(migrated.poolClosing.completedSteps,[0,2]);
  assert.equal(migrated.poolClosing.closedAt,null);
});

test('newer logged water tests clear stale follow-up reminders',()=>{
  const migrated=migrateState({
    history:[
      {id:'old-test',type:'water-test',at:'2026-09-10T12:00:00.000Z'},
      {id:'new-test',type:'water-test',at:'2026-09-13T12:00:00.000Z'}
    ],
    pendingFollowUp:{sourceTestId:'old-test',kind:'retest',dueAt:'2026-09-10T13:00:00.000Z',title:'Retest free chlorine'}
  });
  assert.equal(migrated.pendingFollowUp,null);
});

test('current follow-up remains attached to the latest logged test',()=>{
  const followUp={sourceTestId:'new-test',kind:'retest',dueAt:'2026-09-13T13:00:00.000Z'};
  const migrated=migrateState({
    history:[{id:'new-test',type:'water-test',at:'2026-09-13T12:00:00.000Z'}],
    pendingFollowUp:followUp
  });
  assert.deepEqual(migrated.pendingFollowUp,followUp);
});

