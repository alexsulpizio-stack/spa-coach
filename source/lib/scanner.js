(() => {
const PAD_ORDER = [
  { key:'hardness', name:'Total Hardness', unit:'ppm', values:[0, 100, 250, 500, 1000] },
  { key:'totalChlorine', name:'Total Chlorine', unit:'ppm', values:[0, 0.5, 1, 3, 5, 10] },
  { key:'freeChlorine', name:'Free Chlorine', unit:'ppm', values:[0, 0.5, 1, 3, 5, 10, 20] },
  { key:'ph', name:'pH', unit:'', values:[6.2, 6.8, 7.2, 7.8, 8.4] },
  { key:'alkalinity', name:'Total Alkalinity', unit:'ppm', values:[0, 40, 80, 120, 180, 240] },
  { key:'cya', name:'Cyanuric Acid', unit:'ppm', values:[0, '30–50', 100, 150, 300] }
];

const REFERENCES = {
  hardness: [
    { value:0, rgb:[62,75,121] }, { value:100, rgb:[85,70,133] },
    { value:250, rgb:[103,64,128] }, { value:500, rgb:[143,45,101] }, { value:1000, rgb:[183,40,94] }
  ],
  totalChlorine: [
    { value:0, rgb:[165,158,103] }, { value:0.5, rgb:[161,159,113] }, { value:1, rgb:[156,158,118] },
    { value:3, rgb:[145,161,124] }, { value:5, rgb:[126,160,129] }, { value:10, rgb:[103,159,132] }
  ],
  freeChlorine: [
    { value:0, rgb:[248,249,248] }, { value:0.5, rgb:[244,241,229] }, { value:1, rgb:[245,235,233] },
    { value:3, rgb:[227,201,229] }, { value:5, rgb:[212,158,214] }, { value:10, rgb:[197,107,198] },
    { value:20, rgb:[159,62,172] }
  ],
  ph: [
    { value:6.2, rgb:[221,170,94] }, { value:6.8, rgb:[230,150,100] }, { value:7.2, rgb:[216,120,84] },
    { value:7.8, rgb:[216,108,105] }, { value:8.4, rgb:[223,74,108] }
  ],
  alkalinity: [
    { value:0, rgb:[143,97,38] }, { value:40, rgb:[122,103,44] }, { value:80, rgb:[104,100,45] },
    { value:120, rgb:[109,111,88] }, { value:180, rgb:[78,108,90] }, { value:240, rgb:[86,107,110] }
  ],
  cya: [
    { value:0, rgb:[231,180,81] }, { value:'30–50', rgb:[225,132,65] }, { value:100, rgb:[218,91,89] },
    { value:150, rgb:[206,42,139] }, { value:300, rgb:[191,38,166] }
  ]
};

function shadePrinted(rgb, amount) {
  return rgb.map(channel => Math.max(0, Math.min(255, Math.round(channel * (1 - amount)))));
}

// Documented wet captures plus extra wet-darkened chart steps so chlorine and
// neighboring pads still match when the reagent is darker than the bottle print.
const WET_PROTOTYPES = {
  hardness:[
    { value:250, rgb:[83,70,113] },
    { value:0, rgb:shadePrinted([62,75,121], .12) },
    { value:500, rgb:shadePrinted([143,45,101], .16) }
  ],
  totalChlorine:[
    { value:0, rgb:shadePrinted([165,158,103], .2) },
    { value:5, rgb:shadePrinted([126,160,129], .18) },
    { value:10, rgb:shadePrinted([103,159,132], .18) }
  ],
  freeChlorine:[
    { value:20, rgb:[45,18,43] },
    { value:5, rgb:shadePrinted([212,158,214], .22) },
    { value:10, rgb:shadePrinted([197,107,198], .22) }
  ],
  ph:[
    { value:7.8, rgb:[148,98,100] },
    { value:7.2, rgb:shadePrinted([216,120,84], .22) },
    { value:8.4, rgb:shadePrinted([223,74,108], .2) }
  ],
  alkalinity:[
    { value:40, rgb:[161,137,76] },
    { value:80, rgb:shadePrinted([104,100,45], .12) },
    { value:120, rgb:shadePrinted([109,111,88], .12) }
  ],
  cya:[
    { value:'30–50', rgb:[132,96,74] },
    { value:100, rgb:shadePrinted([218,91,89], .22) },
    { value:150, rgb:shadePrinted([206,42,139], .2) }
  ]
};

function rgbToLab([r,g,b]) {
  r/=255; g/=255; b/=255;
  r=r>.04045?Math.pow((r+.055)/1.055,2.4):r/12.92;
  g=g>.04045?Math.pow((g+.055)/1.055,2.4):g/12.92;
  b=b>.04045?Math.pow((b+.055)/1.055,2.4):b/12.92;
  let x=(r*.4124+g*.3576+b*.1805)/.95047;
  let y=(r*.2126+g*.7152+b*.0722);
  let z=(r*.0193+g*.1192+b*.9505)/1.08883;
  const f=value=>value>.008856?Math.cbrt(value):(7.787*value)+(16/116);
  x=f(x); y=f(y); z=f(z);
  return [(116*y)-16,500*(x-y),200*(y-z)];
}

function labToLch([lightness,a,b]) {
  const chroma=Math.hypot(a,b);
  return { L:lightness, C:chroma, h:(Math.atan2(b,a)*180/Math.PI+360)%360 };
}

function hueDistance(a,b) {
  const distance=Math.abs(a-b)%360;
  return Math.min(distance,360-distance);
}

function deltaE2000(lab1,lab2) {
  const [L1,a1,b1]=lab1,[L2,a2,b2]=lab2;
  const C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cbar=(C1+C2)/2;
  const Cbar7=Cbar**7,G=.5*(1-Math.sqrt(Cbar7/(Cbar7+25**7)));
  const a1p=a1*(1+G),a2p=a2*(1+G);
  const C1p=Math.hypot(a1p,b1),C2p=Math.hypot(a2p,b2);
  const hp= (a,b)=>{const h=Math.atan2(b,a)*180/Math.PI;return h>=0?h:h+360;};
  const h1p=C1p<1e-8?0:hp(a1p,b1),h2p=C2p<1e-8?0:hp(a2p,b2);
  const dLp=L2-L1,dCp=C2p-C1p;
  let dhp=0;
  if(C1p>=1e-8&&C2p>=1e-8){
    dhp=h2p-h1p;
    if(dhp>180)dhp-=360;
    else if(dhp<-180)dhp+=360;
  }
  const dHp=2*Math.sqrt(C1p*C2p)*Math.sin(dhp*Math.PI/360);
  const Lbarp=(L1+L2)/2,Cbarp=(C1p+C2p)/2;
  let hbarp=h1p+h2p;
  if(C1p>=1e-8&&C2p>=1e-8){
    if(Math.abs(h1p-h2p)<=180)hbarp=(h1p+h2p)/2;
    else hbarp=(h1p+h2p<360)?(h1p+h2p+360)/2:(h1p+h2p-360)/2;
  }
  const T=1-.17*Math.cos((hbarp-30)*Math.PI/180)+.24*Math.cos(2*hbarp*Math.PI/180)
    +.32*Math.cos((3*hbarp+6)*Math.PI/180)-.2*Math.cos((4*hbarp-63)*Math.PI/180);
  const dTheta=30*Math.exp(-(((hbarp-275)/25)**2));
  const Rc=2*Math.sqrt(Cbarp**7/(Cbarp**7+25**7));
  const SL=1+(.015*(Lbarp-50)**2)/Math.sqrt(20+(Lbarp-50)**2);
  const SC=1+.045*Cbarp,SH=1+.015*Cbarp*T;
  const RT=-Math.sin(2*dTheta*Math.PI/180)*Rc;
  const dL=dLp/SL,dC=dCp/SC,dH=dHp/SH;
  return Math.sqrt(dL*dL+dC*dC+dH*dH+RT*dC*dH);
}

function clampByte(value) {
  return Math.max(0,Math.min(255,Math.round(value)));
}

function whiteBalanceRgb(rgb,whitePoint) {
  if(!Array.isArray(whitePoint)||whitePoint.length<3)return rgb;
  const [wr,wg,wb]=whitePoint;
  const avg=(wr+wg+wb)/3;
  if(avg<50)return rgb;
  const scale=channel=>{
    const ratio=avg/Math.max(8,channel);
    return Math.max(.72,Math.min(1.38,ratio));
  };
  return [clampByte(rgb[0]*scale(wr)),clampByte(rgb[1]*scale(wg)),clampByte(rgb[2]*scale(wb))];
}

function applyColorCast(rgb,whitePoint) {
  const [wr,wg,wb]=whitePoint;
  const avg=(wr+wg+wb)/3;
  return [clampByte(rgb[0]*wr/avg),clampByte(rgb[1]*wg/avg),clampByte(rgb[2]*wb/avg)];
}

function matchColor(rgb, refs, key, learnedCalibrations=[], options={}) {
  const sample=options.whitePoint?whiteBalanceRgb(rgb,options.whitePoint):rgb;
  const lab=rgbToLab(sample);
  const lch=labToLch(lab);
  const hueDriven=['hardness','ph','alkalinity','cya'].includes(key)&&lch.C>=8;
  const candidates=[
    ...refs.map(ref=>({...ref,calibration:'printed'})),
    ...(WET_PROTOTYPES[key]||[]).map(ref=>({...ref,calibration:'wet'})),
    ...learnedCalibrations.filter(ref=>ref.key===key).slice(-12).map(ref=>({value:ref.value,rgb:ref.rgb,calibration:'learned'}))
  ];
  const scored=candidates.map(ref=>{
    const refLab=rgbToLab(ref.rgb),refLch=labToLch(refLab);
    const distance=hueDriven
      ? hueDistance(lch.h,refLch.h)+Math.abs(lch.C-refLch.C)*.07+Math.abs(lch.L-refLch.L)*.025
      : deltaE2000(lab,refLab);
    return {...ref,d:distance,hueDiff:hueDistance(lch.h,refLch.h),refLch};
  }).sort((a,b)=>a.d-b.d);
  const ranked=[];
  scored.forEach(item=>{if(!ranked.some(existing=>String(existing.value)===String(item.value)))ranked.push(item);});
  let best=ranked[0],second=ranked[1];
  if(key==='ph'&&best?.value===8.4&&second?.value===7.8&&(second.d-best.d)<3.5&&lch.L<58)[best,second]=[second,best];
  const separation=second?second.d-best.d:999;
  let confidence='high';
  if(hueDriven){
    if(best.hueDiff>24||separation<1.5)confidence='low';
    else if(best.hueDiff>14||separation<4)confidence='medium';
  }else{
    if(best.d>28||separation<2.5)confidence='low';
    else if(best.d>18||separation<5)confidence='medium';
  }
  if(best.calibration==='wet'&&best.d<8&&confidence==='low')confidence='medium';
  if(key==='freeChlorine'&&best.value===20&&best.hueDiff<12&&lch.L<=best.refLch.L+4)confidence=separation>=1.5?'high':'medium';
  const canonicalRgb=value=>refs.find(ref=>String(ref.value)===String(value))?.rgb||best.rgb;
  return {
    value:best.value,
    distance:Math.round(best.d*10)/10,
    separation:Math.round(separation*10)/10,
    hueDiff:Math.round(best.hueDiff*10)/10,
    confidence,
    mode:hueDriven?'hue-calibrated':'lab',
    alternatives:[best,second].filter(Boolean).map(item=>({value:item.value,rgb:canonicalRgb(item.value),distance:Math.round(item.d*10)/10}))
  };
}

function assignmentScore(matches) {
  const mean=matches.reduce((sum,item)=>sum+item.distance,0)/Math.max(1,matches.length);
  const lows=matches.filter(item=>item.confidence==='low').length;
  return mean+lows*8;
}

function preferPadAssignment(rgbs, learnedCalibrations=[], options={}) {
  if(!Array.isArray(rgbs)||rgbs.length!==PAD_ORDER.length)return {flipped:false,rgbs,matches:[]};
  const score=colors=>PAD_ORDER.map((pad,index)=>matchColor(colors[index],REFERENCES[pad.key],pad.key,learnedCalibrations,options));
  const forward=score(rgbs);
  const reversedColors=[...rgbs].reverse();
  const reverse=score(reversedColors);
  const flipped=assignmentScore(reverse)<assignmentScore(forward)-6;
  return {
    flipped,
    rgbs:flipped?reversedColors:rgbs,
    matches:flipped?reverse:forward,
    forwardScore:assignmentScore(forward),
    reverseScore:assignmentScore(reverse)
  };
}

function shouldLearnCalibration(detail, confirmedValue, skipped=false) {
  if(skipped||!Array.isArray(detail?.rgb))return false;
  if(confirmedValue===null||confirmedValue===undefined||confirmedValue==='')return false;
  return String(detail.value)!==String(confirmedValue);
}

function rgbToHsv([r,g,b]) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=0;
  if(d){
    if(max===r)h=60*(((g-b)/d)%6);
    else if(max===g)h=60*(((b-r)/d)+2);
    else h=60*(((r-g)/d)+4);
  }
  if(h<0)h+=360;
  return {h,s:max===0?0:d/max,v:max};
}

function samplePatchFromPixels(data,width,height,x,y) {
  const minDim=Math.min(width,height);
  const innerRadius=Math.max(8,Math.min(18,Math.round(minDim*.0055)));
  const outerRadius=Math.max(18,Math.min(40,Math.round(minDim*.012)));
  const patch=radius=>{
    const sx=Math.max(0,Math.round(x-radius));
    const sy=Math.max(0,Math.round(y-radius));
    const sw=Math.min(width-sx,radius*2+1);
    const sh=Math.min(height-sy,radius*2+1);
    const colors=[],all=[];
    for(let py=sy;py<sy+sh;py++){
      for(let px=sx;px<sx+sw;px++){
        const i=(py*width+px)*4;
        const rgb=[data[i],data[i+1],data[i+2]];
        all.push(rgb);
        const maximum=Math.max(...rgb),minimum=Math.min(...rgb);
        if(maximum-minimum>18&&maximum<250&&minimum>10)colors.push(rgb);
      }
    }
    const use=colors.length>=20?colors:all;
    const median=channel=>{
      const values=use.map(item=>item[channel]).sort((a,b)=>a-b);
      return values[Math.floor(values.length/2)]||0;
    };
    const rgb=[median(0),median(1),median(2)];
    const distances=use.map(item=>Math.hypot(item[0]-rgb[0],item[1]-rgb[1],item[2]-rgb[2])).sort((a,b)=>a-b);
    const p90=distances[Math.floor(distances.length*.9)]||0;
    const medianSpread=distances[Math.floor(distances.length*.5)]||0;
    const hsv=use.map(rgbToHsv).filter(item=>item.s>=.16&&item.v>=.07&&item.v<=.98);
    let hueSpread=0,satSpread=0;
    if(hsv.length>=12){
      const cosMean=hsv.reduce((sum,item)=>sum+Math.cos(item.h*Math.PI/180),0)/hsv.length;
      const sinMean=hsv.reduce((sum,item)=>sum+Math.sin(item.h*Math.PI/180),0)/hsv.length;
      const R=Math.max(1e-6,Math.hypot(cosMean,sinMean));
      hueSpread=Math.sqrt(Math.max(0,-2*Math.log(R)))*180/Math.PI;
      const sats=hsv.map(item=>item.s).sort((a,b)=>a-b);
      const q=f=>sats[Math.min(sats.length-1,Math.floor((sats.length-1)*f))];
      satSpread=q(.9)-q(.1);
    }
    return {rgb,p90,medianSpread,hueSpread,satSpread};
  };
  const inner=patch(innerRadius);
  const outer=patch(outerRadius);
  return {
    rgb:inner.rgb,
    innerSpread:Math.round(inner.p90*10)/10,
    outerSpread:Math.round(outer.p90*10)/10,
    outerMedianSpread:Math.round(outer.medianSpread*10)/10,
    innerHueSpread:Math.round(inner.hueSpread*10)/10,
    innerSatSpread:Math.round(inner.satSpread*1000)/1000,
    outerHueSpread:Math.round(outer.hueSpread*10)/10
  };
}

function estimateWhitePoint(data,width,height,points) {
  if(!data||!points?.length)return null;
  const minDim=Math.min(width,height);
  const inner=Math.max(14,Math.round(minDim*.018));
  const outer=Math.max(inner+6,Math.round(minDim*.038));
  const samples=[];
  points.forEach(point=>{
    const cx=Math.round(point.x),cy=Math.round(point.y);
    for(let y=cy-outer;y<=cy+outer;y++){
      if(y<0||y>=height)continue;
      for(let x=cx-outer;x<=cx+outer;x++){
        if(x<0||x>=width)continue;
        const chebyshev=Math.max(Math.abs(x-cx),Math.abs(y-cy));
        if(chebyshev<inner||chebyshev>outer)continue;
        const i=(y*width+x)*4;
        const r=data[i],g=data[i+1],b=data[i+2];
        const maximum=Math.max(r,g,b),minimum=Math.min(r,g,b);
        if(maximum-minimum<48&&(r+g+b)/3>110&&maximum<252)samples.push([r,g,b]);
      }
    }
  });
  if(samples.length<24)return null;
  const median=channel=>{
    const values=samples.map(item=>item[channel]).sort((a,b)=>a-b);
    return values[Math.floor(values.length/2)];
  };
  return [median(0),median(1),median(2)];
}

function readingNumber(value) {
  if(typeof value==='number')return value;
  if(value===''||value==null)return NaN;
  return Number(value);
}

function buildPadReadings(sampled, learnedCalibrations=[], options={}) {
  const assignment=preferPadAssignment((sampled||[]).map(item=>item.rgb),learnedCalibrations,options);
  const ordered=assignment.flipped?[...sampled].reverse():sampled;
  const readings={},details={};
  PAD_ORDER.forEach((pad,index)=>{
    const sample=ordered[index];
    const match=matchColor(sample.rgb,REFERENCES[pad.key],pad.key,learnedCalibrations,options);
    const detail={...match,rgb:sample.rgb,innerSpread:sample.innerSpread,outerSpread:sample.outerSpread,
      innerHueSpread:sample.innerHueSpread,innerSatSpread:sample.innerSatSpread,outerHueSpread:sample.outerHueSpread};
    const centerIsMottled=sample.innerHueSpread>30&&sample.innerSatSpread>.2&&sample.innerSpread>55;
    const tcIsMottled=pad.key==='totalChlorine'&&(
      sample.innerHueSpread>8||sample.innerSatSpread>.16||sample.innerSpread>34
    );
    if(tcIsMottled||centerIsMottled){
      detail.invalid=true;
      detail.reason='uneven-pad';
      detail.confidence='rejected';
    }else if(sample.outerSpread>95&&detail.confidence==='high'){
      detail.confidence='medium';
      detail.edgeNoise=true;
    }
    details[pad.key]=detail;
    readings[pad.key]=detail.invalid?null:match.value;
  });
  const tc=readingNumber(readings.totalChlorine),fc=readingNumber(readings.freeChlorine);
  if(Number.isFinite(tc)&&Number.isFinite(fc)&&tc<fc){
    details.totalChlorine.invalid=true;
    details.totalChlorine.reason='chemistry-conflict';
    details.totalChlorine.confidence='rejected';
    details.totalChlorine.candidate=readings.totalChlorine;
    readings.totalChlorine=null;
  }
  PAD_ORDER.forEach(pad=>{
    const detail=details[pad.key];
    if(!detail.invalid&&detail.confidence==='low'){
      detail.uncertain=true;
      detail.candidate=readings[pad.key];
      if(pad.key==='totalChlorine'){
        detail.invalid=true;
        detail.reason='unreliable-color';
        detail.confidence='rejected';
        readings[pad.key]=null;
      }else if(!['freeChlorine','ph'].includes(pad.key)){
        readings[pad.key]=null;
      }
    }
  });
  return {readings,details,flipped:assignment.flipped,assignment};
}

function colorCandidate(r,g,b) {
  const maximum=Math.max(r,g,b),minimum=Math.min(r,g,b);
  return maximum-minimum>18&&maximum<250&&minimum>6;
}

function detectPadsAlongAxis(mask,width,height,orientation) {
  const vertical=orientation==='vertical',minorLength=vertical?width:height,majorLength=vertical?height:width;
  const counts=new Float32Array(minorLength);
  if(vertical)for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x])counts[x]++;
  else for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x])counts[y]++;
  const windowSize=Math.max(7,Math.round(minorLength*.045)),halfWindow=Math.floor(windowSize/2);
  let bestMinor=-1,bestSmooth=-1;
  for(let i=Math.round(minorLength*.04);i<Math.round(minorLength*.96);i++){
    let sum=0;
    for(let j=Math.max(0,i-halfWindow);j<=Math.min(minorLength-1,i+halfWindow);j++)sum+=counts[j];
    if(sum>bestSmooth){bestSmooth=sum;bestMinor=i;}
  }
  if(bestMinor<0||bestSmooth<=0)return null;
  const bandHalf=Math.max(7,Math.round(minorLength*.027)),bandStart=Math.max(0,bestMinor-bandHalf),bandEnd=Math.min(minorLength-1,bestMinor+bandHalf);
  const fractions=new Float32Array(majorLength),bandWidth=bandEnd-bandStart+1;
  for(let major=0;major<majorLength;major++){
    let hits=0;
    for(let minor=bandStart;minor<=bandEnd;minor++)if(mask[vertical?major*width+minor:minor*width+major])hits++;
    fractions[major]=hits/bandWidth;
  }
  const runs=[];
  let index=0;
  while(index<majorLength){
    if(fractions[index]>=.32){
      const start=index;let total=0,count=0;
      while(index<majorLength&&fractions[index]>=.32){total+=fractions[index];count++;index++;}
      runs.push({start,end:index-1,coverage:total/Math.max(1,count)});
    }else index++;
  }
  const merged=[];
  runs.forEach(run=>{
    const previous=merged[merged.length-1];
    if(previous&&run.start-previous.end-1<=2){
      const firstSize=previous.end-previous.start+1,secondSize=run.end-run.start+1;
      previous.coverage=(previous.coverage*firstSize+run.coverage*secondSize)/(firstSize+secondSize);
      previous.end=run.end;
    }else merged.push({...run});
  });
  const minimumRun=Math.max(3,Math.round(majorLength*.008)),maximumRun=Math.max(minimumRun+1,Math.round(majorLength*.12));
  let filtered=merged.filter(run=>run.end-run.start+1>=minimumRun&&run.end-run.start+1<=maximumRun);
  if(filtered.length<6)return null;
  // Noisy backgrounds can create dozens of candidate color bands. Keep only
  // the strongest ten so the six-pad combination search stays strictly bounded.
  if(filtered.length>10)filtered=[...filtered].sort((a,b)=>b.coverage*(b.end-b.start+1)-a.coverage*(a.end-a.start+1)).slice(0,10).sort((a,b)=>a.start-b.start);
  let best=null;
  let searchEvaluations=0;
  const choose=(start,chosen)=>{
    if(searchEvaluations>=250)return;
    if(chosen.length===6){
      searchEvaluations++;
      const centers=chosen.map(run=>(run.start+run.end)/2),gaps=centers.slice(1).map((center,i)=>center-centers[i]);
      const mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
      if(mean<majorLength*.025||mean>majorLength*.22)return;
      const deviation=Math.sqrt(gaps.reduce((sum,gap)=>sum+(gap-mean)**2,0)/gaps.length),cv=deviation/Math.max(1,mean);
      const coverage=chosen.reduce((sum,run)=>sum+run.coverage,0)/6;
      const sizes=chosen.map(run=>run.end-run.start+1),sizeMean=sizes.reduce((a,b)=>a+b,0)/6;
      const sizeCv=Math.sqrt(sizes.reduce((sum,size)=>sum+(size-sizeMean)**2,0)/6)/Math.max(1,sizeMean);
      const extreme=Math.max(...gaps)/Math.max(1,Math.min(...gaps));
      const score=coverage*100-cv*70-sizeCv*12-Math.max(0,extreme-1.8)*18;
      if(!best||score>best.score)best={score,chosen:[...chosen],cv,coverage,meanGap:mean,extreme};
      return;
    }
    for(let i=start;i<=filtered.length-(6-chosen.length);i++)choose(i+1,[...chosen,filtered[i]]);
  };
  choose(0,[]);
  if(!best)return null;
  const points=best.chosen.map(run=>(run.start+run.end)/2).map(center=>vertical?{x:bestMinor,y:center}:{x:center,y:bestMinor});
  let confidence='medium';
  if(best.cv>.35||best.coverage<.32||best.extreme>2.4)confidence='low';
  else if(best.cv<.25&&best.coverage>.48&&best.extreme<1.8)confidence='high';
  return {...best,points,orientation,searchEvaluations,confidence};
}

globalThis.SpaScanner=Object.freeze({
  PAD_ORDER,
  REFERENCES,
  WET_PROTOTYPES,
  colorCandidate,
  detectPadsAlongAxis,
  matchColor,
  rgbToLab,
  deltaE2000,
  whiteBalanceRgb,
  applyColorCast,
  samplePatchFromPixels,
  estimateWhitePoint,
  preferPadAssignment,
  shouldLearnCalibration,
  buildPadReadings
});
})();
