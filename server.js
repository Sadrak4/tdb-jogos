import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

import { attachRealtime } from './server/realtime-hub.js';

import { handleHttpApi } from './server/http-router.js';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const startPort=Number(process.env.PORT||8080);

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
  const app=express();
  app.use(express.json({limit:'1mb'}));
  app.use('/api',async(req,res,next)=>{
    if(req.path==='/ws') return next();
    const route=req.path.replace(/^\/+|\/+$/g,'');
    await handleHttpApi(req,res,route);
  });

  app.use(express.static(__dirname,{
    etag:false,
    lastModified:false,
    setHeaders(res){res.setHeader('Cache-Control','no-store')}
  }));

  app.use((req,res)=>{
    if(req.path.startsWith('/api/')) return res.status(404).json({error:'API não encontrada'});
    res.sendFile(path.join(__dirname,'index.html'));
  });

  const server=http.createServer(app);
  await attachRealtime(server);

  server.once('error',err=>{
    if(err.code==='EADDRINUSE'&&attempt<20){
      console.log(`Porta ${port} ocupada. Tentando ${port+1}...`);
      return setTimeout(()=>start(port+1,attempt+1),100);
    }
    console.error(err);
  });

  server.listen(port,'127.0.0.1',()=>{
    const url=`http://localhost:${port}`;
    console.log('');
    console.log('======================================');
    console.log(' TDB JOGOS v4.2 - Online Sync Fix');
    console.log('======================================');
    console.log(`Site: ${url}`);
    console.log(`API: ${url}/api/health`);
    console.log(`WebSocket: ws://localhost:${port}/api/ws`);
    console.log(process.env.REDIS_URL?'Redis: configurado':'Redis: memória local (válido apenas para desenvolvimento)');
    console.log('');
    openBrowser(url);
  });
}

start(startPort);
