import { readFile } from 'node:fs/promises';

const input=process.argv[2];
if(!input)throw new Error('Usage: node canonicalize-update-manifest.mjs <manifest.json>');
const parsed=JSON.parse(await readFile(input,'utf8'));
delete parsed.signature;

function canonical(value){
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object'){
    return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

process.stdout.write(canonical(parsed));
