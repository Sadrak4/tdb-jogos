import { WebSocketServer, WebSocket } from 'ws';
import {
  initRedis,
  snapshot,
  applyMutation,
  publishGlobal,
  subscribeGlobal,
  isRedisReady,
  getRoomPrivate,
  setRoomPrivate
} from './realtime-store.js';
import * as Games from './game-service.js';

const LOCAL_CLIENTS=new Set();
let globalSubscriptionStarted=false;

function send(ws,payload){
  if(ws.readyState!==WebSocket.OPEN) return;
  try{ws.send(JSON.stringify(payload))}catch{}
}

function broadcastLocal(payload){
  for(const ws of LOCAL_CLIENTS) send(ws,payload);
}

async function emitEverywhere(payload){
  const published=await publishGlobal(payload);
  if(!published) broadcastLocal(payload);
}

async function ensureGlobalSubscription(){
  if(globalSubscriptionStarted) return;
  globalSubscriptionStarted=true;

  const ok=await subscribeGlobal(async(payload)=>{
    if(payload?.type==='game:invalidate'&&payload.roomCode){
      for(const ws of LOCAL_CLIENTS){
        if(ws.tdbRoomCode===payload.roomCode) await sendGameStateToSocket(ws,payload.roomCode);
      }
      return;
    }
    broadcastLocal(payload);
  });

  if(!ok){
    globalSubscriptionStarted=false;
  }
}



function publicRoom(room){
  const copy=structuredClone(room);
  copy.hasPassword=!!copy.password;
  delete copy.password;
  return copy;
}
async function broadcastRoom(room){
  await emitEverywhere({type:'room:upsert',room:publicRoom(room),serverTime:Date.now()});
}

async function sendGameStateToSocket(ws,code){
  const state=await Games.refreshGame(code);
  if(!state) return;
  const userId=ws.tdbUserId||'';
  const role=ws.tdbRole||'spectator';
  send(ws,{type:'game:state',roomCode:code,state:Games.viewFor(state,userId,role),serverTime:Date.now()});
}
async function broadcastGameState(code){
  const state=await Games.getGame(code);
  if(!state) return;
  for(const client of LOCAL_CLIENTS){
    if(client.tdbRoomCode!==code) continue;
    send(client,{type:'game:state',roomCode:code,state:Games.viewFor(state,client.tdbUserId||'',client.tdbRole||'spectator'),serverTime:Date.now()});
  }
  await publishGlobal({type:'game:invalidate',roomCode:code,serverTime:Date.now()});
}

async function handleMessage(ws,message){
  if(!message || typeof message!=='object') return;

  if(message.type==='hello'){
    ws.tdbUserId=message.userId||ws.tdbUserId||'';
    send(ws,{type:'snapshot',data:await snapshot(),serverTime:Date.now()});
    return;
  }

  if(message.type==='game:join'){
    ws.tdbUserId=message.userId||'';
    ws.tdbRoomCode=message.roomCode;
    ws.tdbRole=message.role==='spectator'?'spectator':'player';
    await sendGameStateToSocket(ws,message.roomCode);
    return;
  }

  if(message.type==='game:start'){
    const rooms=(await snapshot()).rooms||[];
    const room=rooms.find(r=>r.code===message.roomCode);
    if(!room) throw new Error('Sala não encontrada.');
    if(room.ownerId!==message.userId) throw new Error('Somente o host inicia.');
    await Games.startGame(room);
    await broadcastGameState(room.code);
    return;
  }

  if(message.type==='game:action'){
    ws.tdbUserId=message.userId||ws.tdbUserId||'';
    ws.tdbRoomCode=message.roomCode;
    ws.tdbRole='player';
    await Games.applyAction(message.roomCode,ws.tdbUserId,message.action||{});
    await broadcastGameState(message.roomCode);
    return;
  }

  if(message.type==='game:sync'){
    ws.tdbUserId=message.userId||ws.tdbUserId||'';
    ws.tdbRoomCode=message.roomCode;
    ws.tdbRole=message.role||ws.tdbRole||'spectator';
    await sendGameStateToSocket(ws,message.roomCode);
    return;
  }

  if(message.type==='shared:get'){
    if(!String(message.key||'').startsWith('music:')) throw new Error('Shared key não permitido.');
    const snap=await snapshot();
    send(ws,{type:'shared:value',key:message.key,value:snap.shared?.[message.key] ?? null});
    return;
  }

  if(message.type==='room:join'){
    const room=await getRoomPrivate(message.code);
    if(!room) throw new Error('Sala não encontrada.');
    if(room.privacy==='private' && String(room.password||'')!==String(message.password||'')){
      send(ws,{type:'room:join:result',ok:false,code:message.code,error:'Senha incorreta.'});
      return;
    }
    const cap=room.game==='truco'?Number(room.trucoSeats||4):room.game==='chess'?2:room.game==='music'?20:5;
    room.players=room.players||[];
    if(!room.players.some(p=>p.id===message.user?.id)){
      if(room.players.length>=cap) throw new Error('Sala cheia.');
      room.players.push({
        id:message.user.id,
        username:message.user.username,
        avatar:message.user.avatar||null
      });
    }
    await setRoomPrivate(room);
    await broadcastRoom(room);
    send(ws,{type:'room:join:result',ok:true,room:publicRoom(room)});
    return;
  }

  const mutationTypes=new Set([
    'room:upsert','room:remove',
    'match:upsert','match:remove',
    'presence:set','shared:set'
  ]);

  if(mutationTypes.has(message.type)){
    if(message.type==='shared:set' && !String(message.key||'').startsWith('music:')){
      throw new Error('Shared key não permitido.');
    }

    if(message.type==='room:upsert' && message.room){
      const previous=await getRoomPrivate(message.room.code);
      if(previous?.password && !message.room.password){
        message.room.password=previous.password;
      }
      if(previous?.privacy==='private' && !message.room.privacy){
        message.room.privacy='private';
      }
    }

    await applyMutation(message);

    if(message.type==='room:upsert' && message.room){
      await broadcastRoom(message.room);
    }else{
      await emitEverywhere({...message,serverTime:Date.now()});
    }
    return;
  }

  if(message.type==='realtime:publish'){
    await emitEverywhere({
      type:'realtime:event',
      channel:message.channel,
      payload:message.payload,
      serverTime:Date.now()
    });
  }
}

export async function attachRealtime(server){
  await initRedis();
  ensureGlobalSubscription();

  const wss=new WebSocketServer({server});

  wss.on('connection',(ws)=>{
    LOCAL_CLIENTS.add(ws);

    send(ws,{
      type:'connected',
      redis:isRedisReady(),
      serverTime:Date.now()
    });

    ws.on('message',async raw=>{
      try{
        const message=JSON.parse(String(raw));
        await handleMessage(ws,message);
      }catch(err){
        console.error('[TDB WS]',err);
        send(ws,{type:'error',message:err?.message||'Ação inválida.'});
      }
    });

    ws.on('close',()=>LOCAL_CLIENTS.delete(ws));
    ws.on('error',()=>LOCAL_CLIENTS.delete(ws));
  });

  return wss;
}
