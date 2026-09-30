(function(){
'use strict';

const CACHE_KEYS={
  rooms:'tdb_online_rooms_cache',
  matches:'tdb_online_matches_cache',
  presence:'tdb_online_presence_cache',
  shared:'tdb_online_shared_cache'
};

const listeners=new Map();
const cache={
  rooms:read(CACHE_KEYS.rooms,[]),
  matches:read(CACHE_KEYS.matches,[]),
  presence:read(CACHE_KEYS.presence,{}),
  shared:read(CACHE_KEYS.shared,{})
};

let socket=null;
let wsConnected=false;
let backendConnected=false;
let redisBacked=false;
let production=false;
let readyForMultiplayer=false;
let reconnectTimer=null;
let reconnectDelay=1000;
let snapshotTimer=null;
let currentGame=null;
let gamePollTimer=null;

function read(key,fallback){
  try{
    const raw=localStorage.getItem(key);
    return raw===null?fallback:JSON.parse(raw);
  }catch{return fallback}
}
function write(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}catch{}
}
function token(){
  return localStorage.getItem('tdb_session_token')||'';
}
async function api(path,options={}){
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token()) headers.Authorization=`Bearer ${token()}`;

  const res=await fetch(path,{
    cache:'no-store',
    ...options,
    headers
  });

  const data=await res.json().catch(()=>({}));
  if(!res.ok){
    const err=new Error(data.error||`Erro HTTP ${res.status}`);
    err.status=res.status;
    throw err;
  }
  return data;
}
function emitLocal(channel,payload){
  for(const cb of listeners.get(channel)||[]){
    try{cb(structuredClone(payload))}catch(err){console.error(err)}
  }
}
function persistAll(){
  write(CACHE_KEYS.rooms,cache.rooms);
  write(CACHE_KEYS.matches,cache.matches);
  write(CACHE_KEYS.presence,cache.presence);
  write(CACHE_KEYS.shared,cache.shared);
}
function signature(value){
  try{return JSON.stringify(value)}catch{return String(Date.now())}
}
function statusEvent(){
  window.dispatchEvent(new CustomEvent('tdb-online-status',{
    detail:{
      connected:backendConnected,
      websocket:wsConnected,
      redis:redisBacked,
      production,
      readyForMultiplayer
    }
  }));
}
function syncEvent(kind){
  window.dispatchEvent(new CustomEvent('tdb-online-sync',{detail:{kind}}));
}
function onlineError(err){
  const message=err?.message||String(err||'Erro online');
  console.error('[TDB Online]',err);
  window.dispatchEvent(new CustomEvent('tdb-online-error',{detail:{message}}));
  if(typeof window.toast==='function') window.toast(message);
}

function applySnapshot(payload){
  const data=payload?.data||{};
  const status=payload?.status||{};

  const oldRooms=signature(cache.rooms);
  const oldMatches=signature(cache.matches);
  const oldPresence=signature(cache.presence);
  const oldShared=signature(cache.shared);

  cache.rooms=Array.isArray(data.rooms)?data.rooms:[];
  cache.matches=Array.isArray(data.matches)?data.matches:[];
  cache.presence=data.presence||{};
  cache.shared=data.shared||{};

  redisBacked=!!status.redis;
  production=!!status.production;
  readyForMultiplayer=!!status.readyForMultiplayer;
  backendConnected=true;
  persistAll();
  activateOnlineAdapters();
  statusEvent();

  if(signature(cache.rooms)!==oldRooms) syncEvent('rooms');
  if(signature(cache.matches)!==oldMatches) syncEvent('matches');
  if(signature(cache.presence)!==oldPresence) syncEvent('presence');

  if(signature(cache.shared)!==oldShared){
    for(const [key,value] of Object.entries(cache.shared)){
      emitLocal(`shared:${key}`,value);
    }
    syncEvent('shared');
  }
}

async function refreshSnapshot(){
  try{
    const result=await api(`/api/state/snapshot?_=${Date.now()}`,{method:'GET'});
    applySnapshot(result);
  }catch(err){
    if(backendConnected){
      backendConnected=false;
      readyForMultiplayer=false;
      statusEvent();
    }
  }
}

function scheduleSnapshot(){
  clearInterval(snapshotTimer);
  snapshotTimer=setInterval(()=>{
    refreshSnapshot();
  }, document.hidden ? 5000 : 1800);
}
document.addEventListener('visibilitychange',scheduleSnapshot);

function wsUrl(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  return `${proto}//${location.host}/api/ws`;
}
function wsSend(message){
  if(socket?.readyState===WebSocket.OPEN){
    try{socket.send(JSON.stringify(message));return true}catch{}
  }
  return false;
}
function handleWsMessage(msg){
  if(!msg) return;

  if(msg.type==='connected'){
    wsConnected=true;
    reconnectDelay=1000;
    statusEvent();
    wsSend({type:'hello',userId:window.TDBCore?.auth?.currentUser?.()?.id||null});
    return;
  }

  if(msg.type==='snapshot'){
    // WebSocket snapshot is only an accelerator. HTTP remains source of recovery.
    if(msg.data){
      applySnapshot({
        data:msg.data,
        status:{
          redis:!!msg.data.redis,
          production,
          readyForMultiplayer:!!msg.data.redis||!production
        }
      });
    }
    return;
  }

  if(msg.type==='room:upsert'||msg.type==='room:remove'||msg.type==='shared:set'||msg.type==='presence:set'){
    refreshSnapshot();
    return;
  }

  if(msg.type==='game:state'){
    window.dispatchEvent(new CustomEvent('tdb-game-state',{
      detail:{roomCode:msg.roomCode,state:msg.state}
    }));
    return;
  }

  if(msg.type==='game:invalidate'&&msg.roomCode){
    if(currentGame?.roomCode===msg.roomCode) syncGame(msg.roomCode,currentGame.role);
    return;
  }

  if(msg.type==='realtime:event'){
    emitLocal(msg.channel,msg.payload);
    return;
  }

  if(msg.type==='error'){
    onlineError(new Error(msg.message||'Erro no realtime.'));
  }
}

function connectWebSocket(){
  if(location.protocol==='file:') return;
  if(socket && [WebSocket.OPEN,WebSocket.CONNECTING].includes(socket.readyState)) return;

  clearTimeout(reconnectTimer);
  try{
    socket=new WebSocket(wsUrl());
    socket.addEventListener('message',event=>{
      try{handleWsMessage(JSON.parse(event.data))}catch{}
    });
    socket.addEventListener('close',()=>{
      wsConnected=false;
      statusEvent();
      reconnectTimer=setTimeout(connectWebSocket,reconnectDelay);
      reconnectDelay=Math.min(reconnectDelay*1.6,10000);
    });
    socket.addEventListener('error',()=>{});
  }catch{
    reconnectTimer=setTimeout(connectWebSocket,reconnectDelay);
  }
}

class OnlineRoomAdapter{
  list(){return structuredClone(cache.rooms)}
  replace(rooms){
    cache.rooms=structuredClone(rooms||[]);
    write(CACHE_KEYS.rooms,cache.rooms);
    return rooms;
  }
  active(){return window.TDBCore.storage.get('tbd_active_room',null)}
  setActive(room){
    if(room) window.TDBCore.storage.set('tbd_active_room',room);
    else window.TDBCore.storage.remove('tbd_active_room');
  }
  upsert(room){
    const i=cache.rooms.findIndex(r=>r.code===room.code);
    if(i>=0) cache.rooms[i]=structuredClone(room);
    else cache.rooms.push(structuredClone(room));
    write(CACHE_KEYS.rooms,cache.rooms);

    api('/api/rooms/upsert',{
      method:'POST',
      body:JSON.stringify({room})
    }).then(result=>{
      if(result.room){
        const j=cache.rooms.findIndex(r=>r.code===result.room.code);
        if(j>=0) cache.rooms[j]=result.room;
        write(CACHE_KEYS.rooms,cache.rooms);
        syncEvent('rooms');
      }
    }).catch(onlineError);

    return room;
  }
  remove(code){
    cache.rooms=cache.rooms.filter(r=>r.code!==code);
    write(CACHE_KEYS.rooms,cache.rooms);
    api('/api/rooms/remove',{
      method:'POST',
      body:JSON.stringify({code})
    }).catch(err=>console.warn('[TDB remove room]',err.message));
  }
}

class OnlineMatchAdapter{
  list(){return structuredClone(cache.matches)}
  replace(matches){
    cache.matches=structuredClone(matches||[]);
    write(CACHE_KEYS.matches,cache.matches);
    return matches;
  }
  upsert(match){
    const i=cache.matches.findIndex(m=>m.matchId===match.matchId);
    if(i>=0) cache.matches[i]=structuredClone(match);
    else cache.matches.push(structuredClone(match));
    write(CACHE_KEYS.matches,cache.matches);
    return match;
  }
  remove(matchId){
    cache.matches=cache.matches.filter(m=>m.matchId!==matchId);
    write(CACHE_KEYS.matches,cache.matches);
  }
  byRoom(roomCode){
    return structuredClone(cache.matches.find(m=>m.roomCode===roomCode&&m.status!=='finished')||null);
  }
}

class OnlinePresenceAdapter{
  set(userId,status,extra={}){
    const value={userId,status,...extra,updatedAt:Date.now()};
    cache.presence[userId]=value;
    write(CACHE_KEYS.presence,cache.presence);

    api('/api/presence/set',{
      method:'POST',
      body:JSON.stringify({status,extra})
    }).catch(()=>{});

    return value;
  }
  get(userId){return structuredClone(cache.presence[userId]||{status:'offline'})}
  all(){return structuredClone(cache.presence)}
}

class OnlineRealtimeAdapter{
  subscribe(channel,callback){
    if(!listeners.has(channel)) listeners.set(channel,new Set());
    listeners.get(channel).add(callback);
    return ()=>listeners.get(channel)?.delete(callback);
  }
  publish(channel,payload){
    emitLocal(channel,payload);
    wsSend({type:'realtime:publish',channel,payload});
  }
}

class OnlineSharedStateAdapter{
  get(key,fallback=null){
    return cache.shared[key]===undefined?fallback:structuredClone(cache.shared[key]);
  }
  set(key,value){
    cache.shared[key]=structuredClone(value);
    write(CACHE_KEYS.shared,cache.shared);
    emitLocal(`shared:${key}`,value);

    api('/api/shared/set',{
      method:'POST',
      body:JSON.stringify({key,value})
    }).then(result=>{
      cache.shared[key]=result.value;
      write(CACHE_KEYS.shared,cache.shared);
      emitLocal(`shared:${key}`,result.value);
    }).catch(onlineError);

    return value;
  }
  subscribe(key,callback){
    return realtime.subscribe(`shared:${key}`,callback);
  }
}

const rooms=new OnlineRoomAdapter();
const matches=new OnlineMatchAdapter();
const presence=new OnlinePresenceAdapter();
const realtime=new OnlineRealtimeAdapter();
const sharedState=new OnlineSharedStateAdapter();

function activateOnlineAdapters(){
  if(!window.TDBCore) return;
  window.TDBCore.useOnlineAdapters({rooms,matches,presence,realtime,sharedState});
}

async function joinRoom(code,password=''){
  try{
    const result=await api('/api/rooms/join',{
      method:'POST',
      body:JSON.stringify({code,password})
    });

    const room=result.room;
    const i=cache.rooms.findIndex(r=>r.code===room.code);
    if(i>=0) cache.rooms[i]=room;
    else cache.rooms.push(room);
    write(CACHE_KEYS.rooms,cache.rooms);

    window.dispatchEvent(new CustomEvent('tdb-room-join-result',{
      detail:{ok:true,room}
    }));
    syncEvent('rooms');
    return true;
  }catch(err){
    window.dispatchEvent(new CustomEvent('tdb-room-join-result',{
      detail:{ok:false,code,error:err.message}
    }));
    return false;
  }
}

async function watchRoom(code){
  try{
    const result=await api('/api/rooms/watch',{
      method:'POST',
      body:JSON.stringify({code})
    });
    if(result.room){
      const i=cache.rooms.findIndex(r=>r.code===result.room.code);
      if(i>=0) cache.rooms[i]=result.room; else cache.rooms.push(result.room);
      write(CACHE_KEYS.rooms,cache.rooms);
      syncEvent('rooms');
    }
    return result.room;
  }catch(err){
    onlineError(err);
    return null;
  }
}

async function leaveRoom(code){
  try{
    await api('/api/rooms/leave',{
      method:'POST',
      body:JSON.stringify({code})
    });
    await refreshSnapshot();
    return true;
  }catch(err){
    onlineError(err);
    return false;
  }
}

function dispatchGameState(roomCode,state){
  window.dispatchEvent(new CustomEvent('tdb-game-state',{
    detail:{roomCode,state}
  }));
}

async function startGame(roomCode){
  try{
    const result=await api('/api/games/start',{
      method:'POST',
      body:JSON.stringify({roomCode})
    });
    if(result.state) dispatchGameState(roomCode,result.state);
    await refreshSnapshot();
    return true;
  }catch(err){
    onlineError(err);
    return false;
  }
}

async function syncGame(roomCode,role='player'){
  try{
    const result=await api(`/api/games/state?roomCode=${encodeURIComponent(roomCode)}&role=${encodeURIComponent(role)}&_=${Date.now()}`,{
      method:'GET'
    });
    if(result.state) dispatchGameState(roomCode,result.state);
    return true;
  }catch(err){
    if(err.status!==404) console.warn('[TDB game sync]',err.message);
    return false;
  }
}

function joinGame(roomCode,userId,role='player'){
  currentGame={roomCode,role};
  wsSend({type:'game:join',roomCode,userId,role});

  clearInterval(gamePollTimer);
  syncGame(roomCode,role);
  gamePollTimer=setInterval(()=>{
    if(currentGame?.roomCode===roomCode) syncGame(roomCode,role);
  },850);
  return true;
}

async function gameAction(roomCode,userId,action){
  try{
    const result=await api('/api/games/action',{
      method:'POST',
      body:JSON.stringify({roomCode,action})
    });
    if(result.state) dispatchGameState(roomCode,result.state);
    return true;
  }catch(err){
    onlineError(err);
    return false;
  }
}

function stopGameSync(){
  currentGame=null;
  clearInterval(gamePollTimer);
  gamePollTimer=null;
}

async function refreshShared(key){
  try{
    const result=await api(`/api/shared/get?key=${encodeURIComponent(key)}&_=${Date.now()}`,{method:'GET'});
    cache.shared[key]=result.value;
    write(CACHE_KEYS.shared,cache.shared);
    emitLocal(`shared:${key}`,result.value);
    return result.value;
  }catch(err){
    return null;
  }
}

async function listFriends(){
  const result=await api(`/api/friends/list?_=${Date.now()}`,{method:'GET'});
  return result.friends||[];
}
async function addFriend(friendId){
  const result=await api('/api/friends/add',{
    method:'POST',
    body:JSON.stringify({friendId})
  });
  return result.friend;
}
async function removeFriend(friendId){
  await api('/api/friends/remove',{
    method:'POST',
    body:JSON.stringify({friendId})
  });
  return true;
}

async function boot(){
  await refreshSnapshot();
  scheduleSnapshot();
  connectWebSocket();
}

window.TDBOnline={
  connect:boot,
  refreshSnapshot,
  refreshShared,
  joinRoom,
  watchRoom,
  leaveRoom,
  joinGame,
  stopGameSync,
  startGame,
  gameAction,
  syncGame,
  listFriends,
  addFriend,
  removeFriend,
  send:wsSend,
  get connected(){return backendConnected},
  get websocket(){return wsConnected},
  get redis(){return redisBacked},
  get production(){return production},
  get readyForMultiplayer(){return readyForMultiplayer},
  get cache(){return cache},
  get url(){return wsUrl()}
};

boot();
})();
