import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

import { attachRealtime } from './server/realtime-hub.js';

import health from './api/health.js';
import authRegister from './api/auth/register.js';
import authLogin from './api/auth/login.js';
import authSession from './api/auth/session.js';
import authLogout from './api/auth/logout.js';

import snapshot from './api/state/snapshot.js';
import roomUpsert from './api/rooms/upsert.js';
import roomJoin from './api/rooms/join.js';
import roomLeave from './api/rooms/leave.js';
import roomWatch from './api/rooms/watch.js';
import roomRemove from './api/rooms/remove.js';

import gameStart from './api/games/start.js';
import gameState from './api/games/state.js';
import gameAction from './api/games/action.js';

import sharedGet from './api/shared/get.js';
import sharedSet from './api/shared/set.js';
import presenceSet from './api/presence/set.js';

import friendsList from './api/friends/list.js';
import friendsAdd from './api/friends/add.js';
import friendsRemove from './api/friends/remove.js';

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

function mount(app,method,route,handler){
  app[method](route,async(req,res)=>{
    try{
      await handler(req,res);
    }catch(err){
      console.error(`[TDB API] ${method.toUpperCase()} ${route}`,err);
      if(!res.headersSent) res.status(500).json({ok:false,error:err.message||'Erro interno'});
    }
  });
}

async function start(port,attempt=0){
  const app=express();
  app.use(express.json({limit:'1mb'}));

  mount(app,'get','/api/health',health);

  mount(app,'post','/api/auth/register',authRegister);
  mount(app,'post','/api/auth/login',authLogin);
  mount(app,'get','/api/auth/session',authSession);
  mount(app,'post','/api/auth/logout',authLogout);

  mount(app,'get','/api/state/snapshot',snapshot);

  mount(app,'post','/api/rooms/upsert',roomUpsert);
  mount(app,'post','/api/rooms/join',roomJoin);
  mount(app,'post','/api/rooms/leave',roomLeave);
  mount(app,'post','/api/rooms/watch',roomWatch);
  mount(app,'post','/api/rooms/remove',roomRemove);

  mount(app,'post','/api/games/start',gameStart);
  mount(app,'get','/api/games/state',gameState);
  mount(app,'post','/api/games/action',gameAction);

  mount(app,'get','/api/shared/get',sharedGet);
  mount(app,'post','/api/shared/set',sharedSet);

  mount(app,'post','/api/presence/set',presenceSet);

  mount(app,'get','/api/friends/list',friendsList);
  mount(app,'post','/api/friends/add',friendsAdd);
  mount(app,'post','/api/friends/remove',friendsRemove);

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
