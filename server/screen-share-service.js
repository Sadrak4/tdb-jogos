import { getSharedValue,setSharedValue,getRoomPrivate } from './realtime-store.js';

const BROADCAST_STALE_MS=22_000;
const VIEWER_STALE_MS=22_000;
const MAX_SIGNAL_CHARS=120_000;

function now(){return Date.now()}
function key(code){return `screen:${String(code||'').toUpperCase()}`}
function clone(v){return structuredClone(v)}
function defaultState(code){return{roomCode:String(code||'').toUpperCase(),active:false,broadcastId:null,broadcaster:null,startedAt:null,broadcasterHeartbeatAt:null,viewers:{},revision:0,updatedAt:now()}}
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
  const room=await getRoomPrivate(String(code||'').toUpperCase());
  if(!room||room.game!=='music')throw new Error('Sala TDB Lounge não encontrada.');
  if(!isMember(room,user.id))throw new Error('Você não está nesta sala.');
  return room;
}
function freshState(raw,code){
  const s=raw&&typeof raw==='object'?clone(raw):defaultState(code);
  s.roomCode=String(code||'').toUpperCase();
  s.viewers=s.viewers&&typeof s.viewers==='object'?s.viewers:{};
  s.revision=Number(s.revision||0);
  s.updatedAt=Number(s.updatedAt||now());
  return s;
}
function cleanup(s){
  let changed=false;
  const t=now();
  if(s.active&&(!s.broadcasterHeartbeatAt||t-Number(s.broadcasterHeartbeatAt)>BROADCAST_STALE_MS)){
    Object.assign(s,defaultState(s.roomCode),{revision:Number(s.revision||0)+1,updatedAt:t});
    return true;
  }
  for(const [id,v] of Object.entries(s.viewers||{})){
    if(!v?.updatedAt||t-Number(v.updatedAt)>VIEWER_STALE_MS){delete s.viewers[id];changed=true}
  }
  if(changed){s.revision++;s.updatedAt=t}
  return changed;
}
async function load(code){
  const s=freshState(await getSharedValue(key(code),null),code);
  if(cleanup(s))await setSharedValue(key(code),s);
  return s;
}
async function save(s,kind='update'){
  s.updatedAt=now();s.revision=Number(s.revision||0)+1;
  await setSharedValue(key(s.roomCode),s);
  return s;
}
function publicViewer(v,{includeOffer=false,includeAnswer=false}={}){
  return{
    id:v.id,username:v.username,avatar:v.avatar||null,status:v.status||'requested',requestedAt:v.requestedAt||null,updatedAt:v.updatedAt||null,
    ...(includeOffer?{offer:v.offer||null}:{}),
    ...(includeAnswer?{answer:v.answer||null}:{})
  };
}
function forUser(s,user){
  const mine=s.broadcaster?.id===user.id;
  const own=s.viewers?.[user.id]||null;
  return{
    roomCode:s.roomCode,
    active:!!s.active,
    broadcastId:s.broadcastId||null,
    broadcaster:s.broadcaster||null,
    startedAt:s.startedAt||null,
    revision:Number(s.revision||0),
    viewerCount:Object.keys(s.viewers||{}).length,
    viewers:mine?Object.values(s.viewers||{}).map(v=>publicViewer(v,{includeAnswer:true})):[],
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
  return forUser(await load(code),user);
}

export async function action(code,user,action={}){
  const room=await roomFor(code,user);
  const s=await load(room.code);
  const type=String(action.type||'').toUpperCase();
  const t=now();

  if(type==='START'){
    if(!isPlayer(room,user.id))throw new Error('Somente participantes da sala podem transmitir.');
    if(s.active&&s.broadcaster?.id!==user.id)throw new Error(`${s.broadcaster?.username||'Outra pessoa'} já está compartilhando a tela.`);
    const broadcastId=cleanSessionId(action.broadcastId);
    Object.assign(s,defaultState(room.code),{
      active:true,broadcastId,
      broadcaster:{id:user.id,username:user.username,avatar:user.avatar||null},
      startedAt:t,broadcasterHeartbeatAt:t,viewers:{},revision:Number(s.revision||0)
    });
    await save(s,'start');
    return forUser(s,user);
  }

  if(type==='HEARTBEAT'){
    if(!s.active||s.broadcaster?.id!==user.id||s.broadcastId!==String(action.broadcastId||''))throw new Error('Transmissão não está ativa para esta conta.');
    s.broadcasterHeartbeatAt=t;
    await save(s,'heartbeat');
    return forUser(s,user);
  }

  if(type==='STOP'){
    if(s.active&&s.broadcaster?.id!==user.id&&room.ownerId!==user.id)throw new Error('Somente quem transmite ou o host pode encerrar a transmissão.');
    const next=defaultState(room.code);next.revision=Number(s.revision||0);
    await save(next,'stop');
    return forUser(next,user);
  }

  if(type==='WATCH'){
    if(!s.active||!s.broadcaster)throw new Error('Nenhuma transmissão ativa.');
    if(s.broadcaster.id===user.id)throw new Error('Você já é quem está transmitindo.');
    s.viewers[user.id]={id:user.id,username:user.username,avatar:user.avatar||null,status:'requested',requestedAt:t,updatedAt:t,offer:null,answer:null};
    await save(s,'watch');
    return forUser(s,user);
  }

  if(type==='VIEW_HEARTBEAT'){
    const viewer=s.viewers?.[user.id];
    if(viewer){viewer.updatedAt=t;await save(s,'viewer-heartbeat')}
    return forUser(s,user);
  }

  if(type==='LEAVE_VIEW'){
    if(s.viewers?.[user.id]){delete s.viewers[user.id];await save(s,'leave-view')}
    return forUser(s,user);
  }

  if(type==='OFFER'){
    if(!s.active||s.broadcaster?.id!==user.id)throw new Error('Somente quem transmite pode enviar a oferta WebRTC.');
    const viewerId=String(action.viewerId||'');
    const viewer=s.viewers?.[viewerId];
    if(!viewer)throw new Error('Espectador não está mais aguardando a transmissão.');
    viewer.offer=cleanSignal(action.description);viewer.answer=null;viewer.status='offered';viewer.updatedAt=t;
    await save(s,'offer');
    return forUser(s,user);
  }

  if(type==='ANSWER'){
    const viewer=s.viewers?.[user.id];
    if(!viewer||!viewer.offer)throw new Error('Oferta de transmissão não encontrada.');
    viewer.answer=cleanSignal(action.description);viewer.status='answered';viewer.updatedAt=t;
    await save(s,'answer');
    return forUser(s,user);
  }

  if(type==='CONNECTED'){
    const viewer=s.viewers?.[user.id];
    if(viewer){viewer.status='connected';viewer.updatedAt=t;await save(s,'connected')}
    return forUser(s,user);
  }

  if(type==='RESET_VIEWER'){
    if(!s.active||s.broadcaster?.id!==user.id)throw new Error('Somente quem transmite pode reiniciar uma conexão.');
    const viewer=s.viewers?.[String(action.viewerId||'')];
    if(viewer){viewer.status='requested';viewer.offer=null;viewer.answer=null;viewer.updatedAt=t;await save(s,'reset-viewer')}
    return forUser(s,user);
  }

  throw new Error('Ação de compartilhamento inválida.');
}
