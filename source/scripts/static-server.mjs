import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname);
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};

createServer(async(request,response)=>{
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    let file=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(file!==root&&!file.startsWith(root+sep))throw new Error('Invalid path');
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    response.end(await readFile(file));
  }catch(_){
    response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
    response.end('Not found');
  }
}).listen(port,'127.0.0.1',()=>console.log(`Spa Coach test server listening on ${port}`));
