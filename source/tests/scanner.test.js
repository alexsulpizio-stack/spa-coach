import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import '../lib/scanner.js';

const {
  REFERENCES,
  PAD_ORDER,
  WET_PROTOTYPES,
  detectPadsAlongAxis,
  matchColor,
  applyColorCast,
  samplePatchFromPixels,
  estimateWhitePoint,
  preferPadAssignment,
  shouldLearnCalibration,
  buildPadReadings
} = globalThis.SpaScanner;
const fixtures=JSON.parse(await readFile(new URL('./fixtures/scanner-rgb-cases.json',import.meta.url),'utf8'));

function fillRect(data,width,x0,y0,x1,y1,rgb) {
  for(let y=y0;y<=y1;y++){
    for(let x=x0;x<=x1;x++){
      const i=(y*width+x)*4;
      data[i]=rgb[0]; data[i+1]=rgb[1]; data[i+2]=rgb[2]; data[i+3]=255;
    }
  }
}

test('documented scanner RGB fixtures retain their expected chart values',()=>{
  for(const fixture of fixtures){
    const result=matchColor(fixture.rgb,REFERENCES[fixture.key],fixture.key);
    assert.equal(result.value,fixture.expected,`${fixture.key} ${fixture.source}`);
    assert.notEqual(result.confidence,'low',`${fixture.key} should be usable for review`);
  }
});

test('every printed chart swatch matches itself',()=>{
  for(const [key,refs] of Object.entries(REFERENCES)){
    for(const ref of refs){
      const result=matchColor(ref.rgb,REFERENCES[key],key);
      assert.equal(result.value,ref.value,`${key} printed ${ref.value}`);
    }
  }
});

test('wet prototypes keep their documented values',()=>{
  for(const [key,refs] of Object.entries(WET_PROTOTYPES)){
    for(const ref of refs){
      const result=matchColor(ref.rgb,REFERENCES[key],key);
      assert.equal(result.value,ref.value,`${key} wet ${ref.value}`);
    }
  }
});

test('warm lighting is corrected back to the printed chart value',()=>{
  const whitePoint=[210,190,140];
  const printed=REFERENCES.ph.find(ref=>ref.value===7.2).rgb;
  const cast=applyColorCast(printed,whitePoint);
  const raw=matchColor(cast,REFERENCES.ph,'ph');
  const balanced=matchColor(cast,REFERENCES.ph,'ph',[],{whitePoint});
  assert.equal(balanced.value,7.2);
  assert.ok(balanced.distance<=raw.distance);
});

test('learned calibration is considered without bypassing confidence output',()=>{
  const learned=[{key:'ph',value:7.2,rgb:[180,90,70]}];
  const result=matchColor([180,90,70],REFERENCES.ph,'ph',learned);
  assert.equal(result.value,7.2);
  assert.ok(['high','medium','low'].includes(result.confidence));
});

test('calibration is stored only when the user changes the scanner value',()=>{
  const detail={value:7.8,rgb:[148,98,100]};
  assert.equal(shouldLearnCalibration(detail,7.8,false),false);
  assert.equal(shouldLearnCalibration(detail,7.2,false),true);
  assert.equal(shouldLearnCalibration(detail,7.2,true),false);
  assert.equal(shouldLearnCalibration(detail,0,false),true);
});

test('full-resolution patch sampling uses the pad center median',()=>{
  const width=120,height=120;
  const data=new Uint8ClampedArray(width*height*4);
  fillRect(data,width,0,0,width-1,height-1,[240,240,240]);
  fillRect(data,width,40,40,80,80,[103,64,128]);
  const sample=samplePatchFromPixels(data,width,height,60,60);
  assert.deepEqual(sample.rgb,[103,64,128]);
});

test('strip plastic around pads estimates a usable white point',()=>{
  const width=80,height=80;
  const data=new Uint8ClampedArray(width*height*4);
  fillRect(data,width,0,0,width-1,height-1,[232,228,214]);
  fillRect(data,width,30,30,50,50,[103,64,128]);
  const white=estimateWhitePoint(data,width,height,[{x:40,y:40}]);
  assert.ok(white);
  assert.ok(white[0]>180&&white[1]>170&&white[2]>140);
});

test('reversed pad colors are flipped back into tip-to-handle order',()=>{
  const forward=PAD_ORDER.map(pad=>REFERENCES[pad.key][0].rgb);
  const reversed=[...forward].reverse();
  const assignment=preferPadAssignment(reversed);
  assert.equal(assignment.flipped,true);
  assert.equal(preferPadAssignment(forward).flipped,false);
});

test('total chlorine with noisy edges stays readable when the center is even',()=>{
  const sample=rgb=>({rgb,innerSpread:4,outerSpread:80,outerMedianSpread:40,innerHueSpread:2,innerSatSpread:.02,outerHueSpread:2});
  const sampled=[
    sample(REFERENCES.hardness[2].rgb),
    sample(REFERENCES.totalChlorine[4].rgb),
    sample(REFERENCES.freeChlorine[4].rgb),
    sample(REFERENCES.ph[2].rgb),
    sample(REFERENCES.alkalinity[1].rgb),
    sample(REFERENCES.cya[1].rgb)
  ];
  const result=buildPadReadings(sampled);
  assert.equal(result.readings.totalChlorine,5);
  assert.notEqual(result.details.totalChlorine.reason,'uneven-pad');
});

test('buildPadReadings rejects total chlorine below free chlorine',()=>{
  const sample=rgb=>({rgb,innerSpread:4,outerSpread:8,outerMedianSpread:4,innerHueSpread:2,innerSatSpread:.02,outerHueSpread:2});
  const sampled=[
    sample(REFERENCES.hardness[2].rgb),
    sample(REFERENCES.totalChlorine[0].rgb),
    sample(REFERENCES.freeChlorine[6].rgb),
    sample(REFERENCES.ph[2].rgb),
    sample(REFERENCES.alkalinity[1].rgb),
    sample(REFERENCES.cya[1].rgb)
  ];
  const result=buildPadReadings(sampled);
  assert.equal(result.readings.freeChlorine,20);
  assert.equal(result.readings.totalChlorine,null);
  assert.equal(result.details.totalChlorine.reason,'chemistry-conflict');
});

test('vertical six-pad geometry is detected from a deterministic mask',()=>{
  const width=45,height=180,mask=new Uint8Array(width*height);
  for(const center of [15,45,75,105,135,165]){
    for(let y=center-4;y<=center+4;y++)for(let x=18;x<=28;x++)mask[y*width+x]=1;
  }
  const result=detectPadsAlongAxis(mask,width,height,'vertical');
  assert.equal(result?.points.length,6);
  assert.equal(result?.orientation,'vertical');
  assert.ok(['high','medium'].includes(result?.confidence));
  assert.notEqual(result?.confidence,'low');
});

test('irregular pad spacing reports low geometry confidence',()=>{
  const width=45,height=180,mask=new Uint8Array(width*height);
  for(const center of [12,28,50,95,130,168]){
    for(let y=center-4;y<=center+4;y++)for(let x=18;x<=28;x++)mask[y*width+x]=1;
  }
  const result=detectPadsAlongAxis(mask,width,height,'vertical');
  assert.equal(result?.points.length,6);
  assert.equal(result?.confidence,'low');
});

test('noisy geometry search has a strict combination budget',()=>{
  const width=45,height=180,mask=new Uint8Array(width*height);
  for(const center of Array.from({length:14},(_,index)=>8+index*12)){
    for(let y=center-2;y<=center+2;y++)for(let x=18;x<=28;x++)mask[y*width+x]=1;
  }
  const result=detectPadsAlongAxis(mask,width,height,'vertical');
  assert.equal(result?.points.length,6);
  assert.ok(result.searchEvaluations<=250);
});
