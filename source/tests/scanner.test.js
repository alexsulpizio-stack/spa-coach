import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import '../lib/scanner.js';

const { REFERENCES, detectPadsAlongAxis, matchColor } = globalThis.SpaScanner;
const fixtures=JSON.parse(await readFile(new URL('./fixtures/scanner-rgb-cases.json',import.meta.url),'utf8'));

test('documented scanner RGB fixtures retain their expected chart values',()=>{
  for(const fixture of fixtures){
    const result=matchColor(fixture.rgb,REFERENCES[fixture.key],fixture.key);
    assert.equal(result.value,fixture.expected,`${fixture.key} ${fixture.source}`);
    assert.notEqual(result.confidence,'low',`${fixture.key} should be usable for review`);
  }
});

test('learned calibration is considered without bypassing confidence output',()=>{
  const learned=[{key:'ph',value:7.2,rgb:[180,90,70]}];
  const result=matchColor([180,90,70],REFERENCES.ph,'ph',learned);
  assert.equal(result.value,7.2);
  assert.ok(['high','medium','low'].includes(result.confidence));
});

test('vertical six-pad geometry is detected from a deterministic mask',()=>{
  const width=120,height=360,mask=new Uint8Array(width*height);
  for(const center of [40,92,144,196,248,300]){
    for(let y=center-10;y<=center+10;y++)for(let x=50;x<=70;x++)mask[y*width+x]=1;
  }
  const result=detectPadsAlongAxis(mask,width,height,'vertical');
  assert.equal(result?.points.length,6);
  assert.equal(result?.orientation,'vertical');
  assert.ok(['high','medium'].includes(result?.confidence));
});

test('noisy geometry search has a strict combination budget',()=>{
  const width=140,height=560,mask=new Uint8Array(width*height);
  for(const center of Array.from({length:14},(_,index)=>25+index*38)){
    for(let y=center-7;y<=center+7;y++)for(let x=58;x<=82;x++)mask[y*width+x]=1;
  }
  const result=detectPadsAlongAxis(mask,width,height,'vertical');
  assert.equal(result?.points.length,6);
  assert.ok(result.searchEvaluations<=250);
});
