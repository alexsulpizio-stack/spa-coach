import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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

export function isUnpublishedRelease(appVersion, versionCode, released){
  return versionCode > Number(released.versionCode) && compare(appVersion, released.versionName) > 0;
}

async function readReleasedManifest(){
  return JSON.parse(await readFile(new URL('../../update.json', import.meta.url), 'utf8'));
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if(invokedDirectly){
  semver(APP_VERSION);
  if(!Number.isInteger(VERSION_CODE)||VERSION_CODE<=0)throw new Error('VERSION_CODE must be a positive integer');

  if(process.argv.includes('--github-publish')){
    const current=await readReleasedManifest();
    const publish=isUnpublishedRelease(APP_VERSION, VERSION_CODE, current);
    if(process.env.GITHUB_OUTPUT){
      await appendFile(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
    }
    console.log(publish
      ? `Version ${APP_VERSION} (${VERSION_CODE}) is unpublished and should be released.`
      : `Version ${APP_VERSION} (${VERSION_CODE}) matches released ${current.versionName} (${current.versionCode}); skip publish.`);
    process.exit(0);
  }

  if(process.argv.includes('--release')){
    const current=await readReleasedManifest();
    if(!isUnpublishedRelease(APP_VERSION, VERSION_CODE, current)){
      throw new Error(`VERSION_CODE ${VERSION_CODE} / ${APP_VERSION} must exceed released ${current.versionCode} / ${current.versionName}`);
    }
  }

  console.log(`Version ${APP_VERSION} (${VERSION_CODE}) is valid.`);
}
