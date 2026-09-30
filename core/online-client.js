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
let reconnectTimer=null;
let reconnectDelay=1000;
let connected=false;
let redisBacked=false;

function read(key,fallback){
  try{
    const raw=localStorage.getItem(key);
    return raw===null?fallback:JSON.parse(raw);
  }catch{
    return fallback;
  }
}
function write(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}catch{}
}
function emitLocal(channel,payload){
  for(const cb of listeners.get(channel)||[]){
    try{cb(structuredClone(payload))}catch{}
  }
}
function send(message){
  if(socket?.readyState===WebSocket.OPEN){
    socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}
function wsUrl(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  return `${proto}//${location.host}/api/ws`;
}
function persistAll(){
  write(CACHE_KEYS.rooms,cache.rooms);
  write(CACHE_KEYS.matches,cache.matches);
  write(CACHE_KEYS.presence,cache.presence);
  write(CACHE_KEYS.shared,cache.shared);
}
function dispatchSync(kind){
  window.dispatchEvent(new CustomEvent('tdb-online-sync',{detail:{kind}}));
}

function applyMessage(msg){
  if(!msg) return;

  if(msg.type==='connected'){
    connected=true;
    redisBacked=!!msg.redis;
    reconnectDelay=1000;
    send({type:'hello',userId:window.TDBCore?.auth?.currentUser?.()?.id||window.state?.user?.id||null});
    window.dispatchEvent(new CustomEvent('tdb-online-status',{detail:{connected:true,redis:redisBacked}}));
    return;
  }

  if(msg.type==='snapshot'){
    cache.rooms=Array.isArray(msg.data?.rooms)?msg.data.rooms:[];
    cache.matches=Array.isArray(msg.data?.matches)?msg.data.matches:[];
    cache.presence=msg.data?.presence||{};
    cache.shared=msg.data?.shared||{};
    redisBacked=!!msg.data?.redis;
    persistAll();
    activateOnlineAdapters();
    dispatchSync('snapshot');
    return;
  }

  if(msg.type==='room:join:result'){
    window.dispatchEvent(new CustomEvent('tdb-room-join-result',{detail:msg}));
    return;
  }

  if(msg.type==='room:upsert' && msg.room?.code){
    const i=cache.rooms.findIndex(r=>r.code===msg.room.code);
    if(i>=0) cache.rooms[i]=msg.room; else cache.rooms.push(msg.room);
    write(CACHE_KEYS.rooms,cache.rooms);
    dispatchSync('rooms');
    return;
  }

  if(msg.type==='room:remove'){
    cache.rooms=cache.rooms.filter(r=>r.code!==msg.code);
    write(CACHE_KEYS.rooms,cache.rooms);
    dispatchSync('rooms');
    return;
  }

  if(msg.type==='match:upsert' && msg.match?.matchId){
    const i=cache.matches.findIndex(m=>m.matchId===msg.match.matchId);
    if(i>=0) cache.matches[i]=msg.match; else cache.matches.push(msg.match);
    write(CACHE_KEYS.matches,cache.matches);
    dispatchSync('matches');
    return;
  }

  if(msg.type==='match:remove'){
    cache.matches=cache.matches.filter(m=>m.matchId!==msg.matchId);
    write(CACHE_KEYS.matches,cache.matches);
    dispatchSync('matches');
    return;
  }

  if(msg.type==='presence:set' && msg.userId){
    cache.presence[msg.userId]=msg.presence||{
      userId:msg.userId,status:msg.status,...(msg.extra||{}),updatedAt:Date.now()
    };
    write(CACHE_KEYS.presence,cache.presence);
    dispatchSync('presence');
    return;
  }

  if(msg.type==='shared:set' && msg.key){
    cache.shared[msg.key]=msg.value;
    write(CACHE_KEYS.shared,cache.shared);
    emitLocal(`shared:${msg.key}`,msg.value);
    dispatchSync('shared');
    return;
  }

  if(msg.type==='shared:value' && msg.key){
    cache.shared[msg.key]=msg.value;
    write(CACHE_KEYS.shared,cache.shared);
    emitLocal(`shared:${msg.key}`,msg.value);
    return;
  }

  if(msg.type==='error'){
    window.dispatchEvent(new CustomEvent('tdb-online-error',{detail:{message:msg.message||'Erro online'}}));
    if(typeof window.toast==='function') window.toast(msg.message||'Erro online');
    return;
  }

  if(msg.type==='game:state'){
    emitLocal(`game:${msg.roomCode}`,msg.state);
    window.dispatchEvent(new CustomEvent('tdb-game-state',{detail:{roomCode:msg.roomCode,state:msg.state}}));
    return;
  }

  if(msg.type==='realtime:event'){
    emitLocal(msg.channel,msg.payload);
  }
}

class OnlineRoomAdapter{
  list(){return structuredClone(cache.rooms)}
  replace(rooms){
    cache.rooms=structuredClone(rooms||[]);
    write(CACHE_KEYS.rooms,cache.rooms);
    for(const room of cache.rooms) send({type:'room:upsert',room});
    return rooms;
  }
  active(){return window.TDBCore.storage.get('tbd_active_room',null)}
  setActive(room){
    if(room) window.TDBCore.storage.set('tbd_active_room',room);
    else window.TDBCore.storage.remove('tbd_active_room');
  }
  upsert(room){
    const i=cache.rooms.findIndex(r=>r.code===room.code);
    if(i>=0) cache.rooms[i]=structuredClone(room); else cache.rooms.push(structuredClone(room));
    write(CACHE_KEYS.rooms,cache.rooms);
    send({type:'room:upsert',room});
    return room;
  }
  remove(code){
    cache.rooms=cache.rooms.filter(r=>r.code!==code);
    write(CACHE_KEYS.rooms,cache.rooms);
    send({type:'room:remove',code});
    const active=this.active();
    if(active?.code===code) this.setActive(null);
  }
}

class OnlineMatchAdapter{
  list(){return structuredClone(cache.matches)}
  replace(matches){
    cache.matches=structuredClone(matches||[]);
    write(CACHE_KEYS.matches,cache.matches);
    for(const match of cache.matches) send({type:'match:upsert',match});
    return matches;
  }
  upsert(match){
    const i=cache.matches.findIndex(m=>m.matchId===match.matchId);
    if(i>=0) cache.matches[i]=structuredClone(match); else cache.matches.push(structuredClone(match));
    write(CACHE_KEYS.matches,cache.matches);
    send({type:'match:upsert',match});
    return match;
  }
  remove(matchId){
    cache.matches=cache.matches.filter(m=>m.matchId!==matchId);
    write(CACHE_KEYS.matches,cache.matches);
    send({type:'match:remove',matchId});
  }
  byRoom(roomCode){
    return structuredClone(cache.matches.find(m=>m.roomCode===roomCode && m.status!=='finished')||null);
  }
}

class OnlinePresenceAdapter{
  set(userId,status,extra={}){
    const value={userId,status,...extra,updatedAt:Date.now()};
    cache.presence[userId]=value;
    write(CACHE_KEYS.presence,cache.presence);
    send({type:'presence:set',userId,status,extra});
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
    send({type:'realtime:publish',channel,payload});
  }
}

class OnlineSharedStateAdapter{
  get(key,fallback=null){
    const value=cache.shared[key];
    if(value===undefined){
      send({type:'shared:get',key});
      return fallback;
    }
    return structuredClone(value);
  }
  set(key,value){
    cache.shared[key]=structuredClone(value);
    write(CACHE_KEYS.shared,cache.shared);
    emitLocal(`shared:${key}`,value);
    send({type:'shared:set',key,value});
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

function connect(){
  if(location.protocol==='file:') return;
  if(socket && [WebSocket.OPEN,WebSocket.CONNECTING].includes(socket.readyState)) return;

  clearTimeout(reconnectTimer);

  try{
    socket=new WebSocket(wsUrl());

    socket.addEventListener('message',event=>{
      try{applyMessage(JSON.parse(event.data))}catch{}
    });

    socket.addEventListener('close',()=>{
      connected=false;
      window.dispatchEvent(new CustomEvent('tdb-online-status',{detail:{connected:false,redis:redisBacked}}));
      reconnectTimer=setTimeout(connect,reconnectDelay);
      reconnectDelay=Math.min(reconnectDelay*1.6,10000);
    });

    socket.addEventListener('error',()=>{});
  }catch{
    reconnectTimer=setTimeout(connect,reconnectDelay);
  }
}

window.TDBOnline={
  connect,
  send,
  joinRoom(code,password,user){return send({type:'room:join',code,password,user})},
  joinGame(roomCode,userId,role='player'){return send({type:'game:join',roomCode,userId,role})},
  startGame(roomCode,userId){return send({type:'game:start',roomCode,userId})},
  gameAction(roomCode,userId,action){return send({type:'game:action',roomCode,userId,action})},
  syncGame(roomCode,userId,role='player'){return send({type:'game:sync',roomCode,userId,role})},
  get connected(){return connected},
  get redis(){return redisBacked},
  get cache(){return cache},
  get url(){return wsUrl()}
};

connect();
})();
