import { readFile } from 'node:fs/promises';

await import('../lib/version.js');
const {APP_VERSION,VERSION_CODE}=globalThis.SpaVersion;

function semver(value){
  const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if(!match)throw new Error(`Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
}
function compare(left,right){
  const a=semver(left),b=semver(right);
  for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];
  return 0;
}

semver(APP_VERSION);
if(!Number.isInteger(VERSION_CODE)||VERSION_CODE<=0)throw new Error('VERSION_CODE must be a positive integer');

if(process.argv.includes('--release')){
  const current=JSON.parse(await readFile(new URL('../../update.json',import.meta.url),'utf8'));
  if(VERSION_CODE<=Number(current.versionCode))throw new Error(`VERSION_CODE ${VERSION_CODE} must exceed released code ${current.versionCode}`);
  if(compare(APP_VERSION,current.versionName)<=0)throw new Error(`APP_VERSION ${APP_VERSION} must exceed released version ${current.versionName}`);
}

console.log(`Version ${APP_VERSION} (${VERSION_CODE}) is valid.`);
