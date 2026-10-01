import { getSharedValue,setSharedValue,removeSharedValue,listSharedValues,getRoomPrivate } from './realtime-store.js';

// Screen sharing signaling deliberately uses separate tdb_shared rows.
// This prevents broadcaster heartbeats, viewer heartbeats, offers and answers
// from overwriting one another when Vercel handles requests concurrently.
const BROADCAST_STALE_MS=120_000;
const VIEWER_STALE_MS=120_000;
const MAX_SIGNAL_CHARS=180_000;

function now(){return Date.now()}
function codeOf(code){return String(code||'').toUpperCase()}
function metaKey(code){return `screen:${codeOf(code)}:meta`}
function broadcastHeartbeatKey(code,broadcastId){return `screen:${codeOf(code)}:broadcast-heartbeat:${broadcastId}`}
function signalPrefix(code,broadcastId){return `screen:${codeOf(code)}:signal:${broadcastId}:`}
function signalKey(code,broadcastId,type,userId){return `${signalPrefix(code,broadcastId)}${type}:${userId}`}
function defaultMeta(code){return{roomCode:codeOf(code),active:false,broadcastId:null,broadcaster:null,startedAt:null,revision:0,updatedAt:now()}}
function clone(v){return structuredClone(v)}
function isMember(room,userId){return (room.players||[]).some(p=>p.id===userId)||(room.spectators||[]).some(p=>p.id===userId)}
function isPlayer(room,userId){return (room.players||[]).some(p=>p.id===userId)}
function cleanSignal(v){
  if(!v||typeof v!=='object')return null;
  const type=String(v.type||'');
  const sdp=String(v.sdp||'');
  if(!['offer','answer'].includes(type)||!sdp||sdp.length>MAX_SIGNAL_CHARS)throw new Error('Sinal WebRTC inválido.');
  return{type,sdp};
}
function cleanSessionId(v){
  const value=String(v||'').trim();
  if(!/^[A-Za-z0-9_-]{8,80}$/.test(value))throw new Error('Sessão de transmissão inválida.');
  return value;
}
async function roomFor(code,user){
  const room=await getRoomPrivate(codeOf(code));
  if(!room||room.game!=='music')throw new Error('Sala TDB Lounge não encontrada.');
  if(!isMember(room,user.id))throw new Error('Você não está nesta sala.');
  return room;
}
function freshMeta(raw,code){
  const m=raw&&typeof raw==='object'?clone(raw):defaultMeta(code);
  m.roomCode=codeOf(code);
  m.revision=Number(m.revision||0);
  m.updatedAt=Number(m.updatedAt||now());
  return m;
}
function assertBroadcast(meta,requestedId){
  const id=String(requestedId||'');
  if(id&&meta.broadcastId!==id)throw new Error('A transmissão mudou. Atualize a sala e tente novamente.');
}
async function loadMeta(code){
  const m=freshMeta(await getSharedValue(metaKey(code),null),code);
  if(m.active&&m.broadcastId){
    const hb=await getSharedValue(broadcastHeartbeatKey(code,m.broadcastId),null);
    const heartbeatAt=Number(hb?.updatedAt||m.startedAt||0);
    if(!heartbeatAt||now()-heartbeatAt>BROADCAST_STALE_MS){
      const latest=freshMeta(await getSharedValue(metaKey(code),null),code);
      // Do not let cleanup of an old broadcast overwrite a newer START/STOP.
      if(latest.active&&latest.broadcastId===m.broadcastId){
        const oldBroadcastId=latest.broadcastId;
        const stopped={...defaultMeta(code),revision:Number(latest.revision||0)+1,endedReason:'timeout',updatedAt:now()};
        await setSharedValue(metaKey(code),stopped);
        cleanupBroadcastRows(code,oldBroadcastId).catch(()=>{});
        return stopped;
      }
      return latest;
    }
  }
  return m;
}
async function saveMeta(meta){
  meta.updatedAt=now();
  meta.revision=Number(meta.revision||0)+1;
  await setSharedValue(metaKey(meta.roomCode),meta);
  return meta;
}
function parseSignals(rows,prefix){
  const map=new Map();
  for(const row of rows||[]){
    const tail=String(row.key||'').slice(prefix.length);
    const colon=tail.indexOf(':');
    if(colon<1)continue;
    const type=tail.slice(0,colon);
    const userId=tail.slice(colon+1);
    if(!userId)continue;
    const item=map.get(userId)||{id:userId};
    item[type]=row.value;
    map.set(userId,item);
  }
  return map;
}
async function cleanupBroadcastRows(code,broadcastId){
  if(!broadcastId)return;
  const prefix=signalPrefix(code,broadcastId);
  const rows=await listSharedValues(prefix);
  await Promise.allSettled([
    ...rows.map(row=>removeSharedValue(row.key)),
    removeSharedValue(broadcastHeartbeatKey(code,broadcastId))
  ]);
}

async function signalsFor(meta,{cleanup=true}={}){
  if(!meta.active||!meta.broadcastId)return new Map();
  const prefix=signalPrefix(meta.roomCode,meta.broadcastId);
  const rows=await listSharedValues(prefix);
  const map=parseSignals(rows,prefix);
  if(!cleanup)return map;

  const t=now();
  const stale=[];
  for(const [userId,item] of map){
    const requestedAt=Number(item.viewer?.requestedAt||0);
    const heartbeatAt=Number(item.heartbeat?.updatedAt||requestedAt||0);
    if(!item.viewer||!heartbeatAt||t-heartbeatAt>VIEWER_STALE_MS)stale.push(userId);
  }
  for(const userId of stale){
    await Promise.allSettled(['viewer','heartbeat','offer','answer','connected'].map(type=>removeSharedValue(signalKey(meta.roomCode,meta.broadcastId,type,userId))));
    map.delete(userId);
  }
  return map;
}
function publicViewer(item,{includeOffer=false,includeAnswer=false}={}){
  const v=item?.viewer||{};
  const status=item?.connected?'connected':item?.answer?'answered':item?.offer?'offered':'requested';
  return{
    id:v.id||item?.id,
    username:v.username||'Usuário',
    avatar:v.avatar||null,
    status,
    requestedAt:v.requestedAt||null,
    updatedAt:item?.heartbeat?.updatedAt||v.requestedAt||null,
    ...(includeOffer?{offer:item?.offer?.description||null}:{}),
    ...(includeAnswer?{answer:item?.answer?.description||null}:{})
  };
}
async function forUser(meta,user){
  const mine=meta.broadcaster?.id===user.id;
  const signals=await signalsFor(meta);
  const own=signals.get(user.id)||null;
  return{
    roomCode:meta.roomCode,
    active:!!meta.active,
    broadcastId:meta.broadcastId||null,
    broadcaster:meta.broadcaster||null,
    startedAt:meta.startedAt||null,
    revision:Number(meta.revision||0),
    viewerCount:signals.size,
    viewers:mine?[...signals.values()].map(v=>publicViewer(v,{includeAnswer:true})):[],
    selfViewer:own?publicViewer(own,{includeOffer:true}):null,
    isBroadcaster:mine
  };
}

export function iceServers(){
  const urls=String(process.env.SCREEN_SHARE_STUN_URLS||'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',').map(x=>x.trim()).filter(Boolean);
  const servers=urls.length?[{urls}]:[];
  const turnUrls=String(process.env.SCREEN_SHARE_TURN_URLS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(turnUrls.length){
    const turn={urls:turnUrls};
    if(process.env.SCREEN_SHARE_TURN_USERNAME)turn.username=process.env.SCREEN_SHARE_TURN_USERNAME;
    if(process.env.SCREEN_SHARE_TURN_CREDENTIAL)turn.credential=process.env.SCREEN_SHARE_TURN_CREDENTIAL;
    servers.push(turn);
  }
  return servers;
}

export async function state(code,user){
  await roomFor(code,user);
  return await forUser(await loadMeta(code),user);
}

export async function action(code,user,action={}){
  const room=await roomFor(code,user);
  const type=String(action.type||'').toUpperCase();
  const t=now();
  let meta=await loadMeta(room.code);

  if(type==='START'){
    if(!isPlayer(room,user.id))throw new Error('Somente participantes da sala podem transmitir.');
    if(meta.active&&meta.broadcaster?.id!==user.id)throw new Error(`${meta.broadcaster?.username||'Outra pessoa'} já está compartilhando a tela.`);
    const broadcastId=cleanSessionId(action.broadcastId);
    const previousBroadcastId=meta.active&&meta.broadcaster?.id===user.id?meta.broadcastId:null;
    meta={...defaultMeta(room.code),active:true,broadcastId,broadcaster:{id:user.id,username:user.username,avatar:user.avatar||null},startedAt:t,revision:Number(meta.revision||0)};
    await saveMeta(meta);
    await setSharedValue(broadcastHeartbeatKey(room.code,broadcastId),{updatedAt:t});
    if(previousBroadcastId&&previousBroadcastId!==broadcastId)cleanupBroadcastRows(room.code,previousBroadcastId).catch(()=>{});
    return await forUser(meta,user);
  }

  if(type==='HEARTBEAT'){
    if(!meta.active||meta.broadcaster?.id!==user.id||meta.broadcastId!==String(action.broadcastId||''))throw new Error('Transmissão não está ativa para esta conta.');
    await setSharedValue(broadcastHeartbeatKey(room.code,meta.broadcastId),{updatedAt:t});
    // Re-read meta after writing heartbeat so a concurrent STOP cannot be resurrected.
    meta=await loadMeta(room.code);
    return await forUser(meta,user);
  }

  if(type==='STOP'){
    if(meta.active&&meta.broadcaster?.id!==user.id&&room.ownerId!==user.id)throw new Error('Somente quem transmite ou o host pode encerrar a transmissão.');
    const requestedId=String(action.broadcastId||'');
    // A delayed STOP from an older tab/session must never kill a newer broadcast.
    if(requestedId&&meta.active&&meta.broadcastId!==requestedId)return await forUser(meta,user);
    const oldBroadcastId=meta.broadcastId;
    const next={...defaultMeta(room.code),revision:Number(meta.revision||0),endedReason:'stopped'};
    await saveMeta(next);
    cleanupBroadcastRows(room.code,oldBroadcastId).catch(()=>{});
    return await forUser(next,user);
  }

  if(type==='WATCH'){
    if(!meta.active||!meta.broadcaster)throw new Error('Nenhuma transmissão ativa.');
    assertBroadcast(meta,action.broadcastId);
    if(meta.broadcaster.id===user.id)throw new Error('Você já é quem está transmitindo.');
    const bid=meta.broadcastId;
    const viewer={id:user.id,username:user.username,avatar:user.avatar||null,requestedAt:t};
    // Remove any stale negotiation BEFORE publishing the viewer request.
    // This prevents a fresh offer from being deleted by the WATCH cleanup.
    await Promise.allSettled(['offer','answer','connected'].map(k=>removeSharedValue(signalKey(room.code,bid,k,user.id))));
    await Promise.all([
      setSharedValue(signalKey(room.code,bid,'viewer',user.id),viewer),
      setSharedValue(signalKey(room.code,bid,'heartbeat',user.id),{updatedAt:t})
    ]);
    return await forUser(meta,user);
  }

  if(type==='VIEW_HEARTBEAT'){
    if(meta.active&&meta.broadcastId){
      assertBroadcast(meta,action.broadcastId);
      const viewer=await getSharedValue(signalKey(room.code,meta.broadcastId,'viewer',user.id),null);
      if(viewer)await setSharedValue(signalKey(room.code,meta.broadcastId,'heartbeat',user.id),{updatedAt:t});
    }
    return await forUser(meta,user);
  }

  if(type==='LEAVE_VIEW'){
    const requestedId=String(action.broadcastId||'');
    if(requestedId&&meta.broadcastId!==requestedId)return await forUser(meta,user);
    if(meta.broadcastId){
      await Promise.allSettled(['viewer','heartbeat','offer','answer','connected'].map(k=>removeSharedValue(signalKey(room.code,meta.broadcastId,k,user.id))));
    }
    return await forUser(meta,user);
  }

  if(type==='OFFER'){
    if(!meta.active||meta.broadcaster?.id!==user.id)throw new Error('Somente quem transmite pode enviar a oferta WebRTC.');
    assertBroadcast(meta,action.broadcastId);
    const viewerId=String(action.viewerId||'');
    const viewer=await getSharedValue(signalKey(room.code,meta.broadcastId,'viewer',viewerId),null);
    if(!viewer)throw new Error('Espectador não está mais aguardando a transmissão.');
    const description=cleanSignal(action.description);
    // Clear old answer/connected state before publishing the fresh offer event.
    await Promise.allSettled(['answer','connected'].map(k=>removeSharedValue(signalKey(room.code,meta.broadcastId,k,viewerId))));
    await setSharedValue(signalKey(room.code,meta.broadcastId,'offer',viewerId),{description,updatedAt:t});
    return await forUser(meta,user);
  }

  if(type==='ANSWER'){
    if(!meta.active||!meta.broadcastId)throw new Error('A transmissão terminou antes da resposta.');
    assertBroadcast(meta,action.broadcastId);
    const viewer=await getSharedValue(signalKey(room.code,meta.broadcastId,'viewer',user.id),null);
    const offer=await getSharedValue(signalKey(room.code,meta.broadcastId,'offer',user.id),null);
    if(!viewer||!offer?.description)throw new Error('Oferta de transmissão não encontrada.');
    await setSharedValue(signalKey(room.code,meta.broadcastId,'answer',user.id),{description:cleanSignal(action.description),updatedAt:t});
    return await forUser(meta,user);
  }

  if(type==='CONNECTED'){
    if(meta.active&&meta.broadcastId){
      assertBroadcast(meta,action.broadcastId);
      const viewer=await getSharedValue(signalKey(room.code,meta.broadcastId,'viewer',user.id),null);
      if(viewer)await setSharedValue(signalKey(room.code,meta.broadcastId,'connected',user.id),{updatedAt:t});
    }
    return await forUser(meta,user);
  }

  if(type==='RESET_VIEWER'){
    if(!meta.active||meta.broadcaster?.id!==user.id)throw new Error('Somente quem transmite pode reiniciar uma conexão.');
    assertBroadcast(meta,action.broadcastId);
    const viewerId=String(action.viewerId||'');
    await Promise.allSettled(['offer','answer','connected'].map(k=>removeSharedValue(signalKey(room.code,meta.broadcastId,k,viewerId))));
    return await forUser(meta,user);
  }

  throw new Error('Ação de compartilhamento inválida.');
}
