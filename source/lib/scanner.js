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

// These are the documented wet-strip prototypes already captured by the project.
const WET_PROTOTYPES = {
  hardness:[{ value:250, rgb:[83,70,113] }],
  freeChlorine:[{ value:20, rgb:[45,18,43] }],
  ph:[{ value:7.8, rgb:[148,98,100] }],
  alkalinity:[{ value:40, rgb:[161,137,76] }],
  cya:[{ value:'30–50', rgb:[132,96,74] }]
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

function matchColor(rgb, refs, key, learnedCalibrations=[]) {
  const lab=rgbToLab(rgb);
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
      : Math.hypot(lab[0]-refLab[0],lab[1]-refLab[1],lab[2]-refLab[2]);
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
    if(best.d>32||separation<3)confidence='low';
    else if(best.d>22||separation<6)confidence='medium';
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
  if(bestMinor<0)return null;
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
    const previous=merged.at(-1);
    if(previous&&run.start-previous.end-1<=2){
      const firstSize=previous.end-previous.start+1,secondSize=run.end-run.start+1;
      previous.coverage=(previous.coverage*firstSize+run.coverage*secondSize)/(firstSize+secondSize);
      previous.end=run.end;
    }else merged.push({...run});
  });
  const minimumRun=Math.max(3,Math.round(majorLength*.008)),maximumRun=Math.max(minimumRun+1,Math.round(majorLength*.12));
  let filtered=merged.filter(run=>run.end-run.start+1>=minimumRun&&run.end-run.start+1<=maximumRun);
  if(filtered.length<6)return null;
  if(filtered.length>14)filtered=[...filtered].sort((a,b)=>b.coverage*(b.end-b.start+1)-a.coverage*(a.end-a.start+1)).slice(0,14).sort((a,b)=>a.start-b.start);
  let best=null;
  const choose=(start,chosen)=>{
    if(chosen.length===6){
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
  return {...best,points,orientation,confidence:best.cv<.25&&best.coverage>.48&&best.extreme<1.8?'high':'medium'};
}

globalThis.SpaScanner=Object.freeze({PAD_ORDER,REFERENCES,WET_PROTOTYPES,colorCandidate,detectPadsAlongAxis,matchColor,rgbToLab});
})();
