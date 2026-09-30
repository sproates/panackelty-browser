// Local test server only; does not publish or expose the repository.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.env.PLAYGROUND_SITE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)),'build/site');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json'};
http.createServer((req,res)=>{
  try{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';
    let file=path.resolve(root,relative);
    if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end();}
}).listen(4174,'127.0.0.1');
