import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { attachRealtime } from './server/realtime-hub.js';
import * as Auth from './server/auth-service.js';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const root=__dirname;
const startPort=Number(process.env.PORT||8080);

const mime={
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
  '.webp':'image/webp'
};

function safePath(urlPath){
  const clean=decodeURIComponent((urlPath||'/').split('?')[0]);
  const target=clean==='/'?'/index.html':clean;
  const resolved=path.normalize(path.join(root,target));
  return resolved.startsWith(root)?resolved:null;
}

function openBrowser(url){
  try{
    if(process.platform==='win32'){
      spawn('cmd',['/c','start','',url],{detached:true,stdio:'ignore'}).unref();
    }else if(process.platform==='darwin'){
      spawn('open',[url],{detached:true,stdio:'ignore'}).unref();
    }else{
      spawn('xdg-open',[url],{detached:true,stdio:'ignore'}).unref();
    }
  }catch{}
}

async function start(port,attempt=0){
  const server=http.createServer((req,res)=>{
    if(req.url?.startsWith('/api/auth/')){
      const chunks=[];
      req.on('data',c=>chunks.push(c));
      req.on('end',async()=>{
        let body={};try{body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{}}catch{}
        try{
          if(req.url.startsWith('/api/auth/register')&&req.method==='POST'){
            await Auth.register(body.username,body.password,body.avatar||null);
            const result=await Auth.login(body.username,body.password);
            res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));
          }
          if(req.url.startsWith('/api/auth/login')&&req.method==='POST'){
            const result=await Auth.login(body.username,body.password);
            res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(result));
          }
          const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
          if(req.url.startsWith('/api/auth/session')&&req.method==='GET'){
            const user=await Auth.session(token);if(!user) throw new Error('Sessão inválida');
            res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({user}));
          }
          if(req.url.startsWith('/api/auth/logout')&&req.method==='POST'){
            await Auth.logout(token);res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true}));
          }
          res.writeHead(404);return res.end();
        }catch(err){
          res.writeHead(400,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:err.message}));
        }
      });
      return;
    }

    if(req.url?.startsWith('/api/health')){
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      return res.end(JSON.stringify({ok:true,app:'TDB JOGOS',version:'3.0.0'}));
    }

    // Upgrade requests are consumed by ws; normal GET /api/ws just returns a hint.
    if(req.url?.startsWith('/api/ws')){
      res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
      return res.end('TDB JOGOS WebSocket endpoint');
    }

    const file=safePath(req.url);
    if(!file){
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(file,(err,stat)=>{
      if(err || !stat.isFile()){
        res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});
        return res.end('Arquivo não encontrado');
      }

      res.writeHead(200,{
        'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream',
        'Cache-Control':'no-store'
      });
      fs.createReadStream(file).pipe(res);
    });
  });

  await attachRealtime(server);

  server.once('error',err=>{
    if(err.code==='EADDRINUSE' && attempt<20){
      console.log(`Porta ${port} ocupada. Tentando ${port+1}...`);
      return setTimeout(()=>start(port+1,attempt+1),100);
    }
    console.error(err);
  });

  server.listen(port,'127.0.0.1',()=>{
    const url=`http://localhost:${port}`;
    console.log('');
    console.log('======================================');
    console.log(' TDB JOGOS v3.0 - Online Foundation');
    console.log('======================================');
    console.log(`Site: ${url}`);
    console.log(`WebSocket: ws://localhost:${port}/api/ws`);
    console.log(process.env.REDIS_URL?'Redis: configurado':'Redis: não configurado (memória local)');
    console.log('');
    openBrowser(url);
  });
}

start(startPort);
