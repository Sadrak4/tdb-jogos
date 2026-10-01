import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
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

  app.use('/api',async(req,res)=>{
    await handleHttpApi(req,res);
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

  const server=app.listen(port,'127.0.0.1',()=>{
    const url=`http://localhost:${port}`;
    console.log('');
    console.log('======================================');
    console.log(' TDB JOGOS v6.1.2 - Screen Share Fix');
    console.log('======================================');
    console.log(`Site: ${url}`);
    console.log(`Health: ${url}/api/health`);
    console.log(process.env.SUPABASE_URL?'Supabase: variáveis encontradas':'Supabase: não configurado (memória local)');
    console.log('');
    openBrowser(url);
  });

  server.on('error',err=>{
    if(err.code==='EADDRINUSE'&&attempt<20){
      server.close(()=>setTimeout(()=>start(port+1,attempt+1),100));
      return;
    }
    console.error(err);
  });
}
start(startPort);
