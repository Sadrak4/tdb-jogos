(function(){
'use strict';
const CACHE_KEYS={rooms:'tdb_online_rooms_cache',matches:'tdb_online_matches_cache',presence:'tdb_online_presence_cache',shared:'tdb_online_shared_cache'};
const listeners=new Map();const pending=new Map();const cache={rooms:read(CACHE_KEYS.rooms,[]),matches:read(CACHE_KEYS.matches,[]),presence:read(CACHE_KEYS.presence,{}),shared:read(CACHE_KEYS.shared,{})};
let backendConnected=false,supabaseBacked=false,realtimeConnected=false,production=false,readyForMultiplayer=false,maintenanceState={enabled:false};
let connectionPhase='connecting',failureCount=0,snapshotTimer=null,heartbeatTimer=null,currentGame=null,gamePollTimer=null,latencyMs=null,clientSuspended=false;
let presenceContext={status:'online',roomCode:null,game:null,view:null};
let supabaseBrowser=null,realtimeChannel=null,realtimeInitStarted=false;
function read(k,f){try{const r=localStorage.getItem(k);return r===null?f:JSON.parse(r)}catch{return f}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
function token(){return localStorage.getItem('tdb_session_token')||''}
function actionId(prefix='A'){return`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`}
function singleFlight(key,fn,cooldown=450){if(pending.has(key))return pending.get(key);const p=Promise.resolve().then(fn).finally(()=>setTimeout(()=>pending.delete(key),cooldown));pending.set(key,p);return p}
async function api(path,options={}){
  if(clientSuspended&&options.allowWhileSuspended!==true){
    const err=new Error('Cliente online pausado.');err.code='CLIENT_SUSPENDED';throw err;
  }
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token())headers.Authorization=`Bearer ${token()}`;
  const res=await fetch(path,{cache:'no-store',...options,headers});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){
    const err=new Error(data.error||`Erro HTTP ${res.status}`);err.status=res.status;err.code=data.code||null;
    if(err.code==='MAINTENANCE')window.dispatchEvent(new CustomEvent('tdb-maintenance',{detail:{enabled:true,message:err.message}}));
    if(res.status===401&&/sessão/i.test(err.message)){
      localStorage.removeItem('tdb_session_token');
      if(!clientSuspended&&window.__TDB_EXPLICIT_LOGOUT__!==true){
        window.dispatchEvent(new CustomEvent('tdb-session-expired',{detail:{message:'Sua sessão online expirou. Entre novamente.'}}));
      }
    }
    throw err;
  }
  return data;
}
function emitLocal(ch,payload){for(const cb of listeners.get(ch)||[]){try{cb(structuredClone(payload))}catch(err){console.error(err)}}}
function persistAll(){write(CACHE_KEYS.rooms,cache.rooms);write(CACHE_KEYS.matches,cache.matches);write(CACHE_KEYS.presence,cache.presence);write(CACHE_KEYS.shared,cache.shared)}
function signature(v){try{return JSON.stringify(v)}catch{return String(Date.now())}}
function statusEvent(){window.dispatchEvent(new CustomEvent('tdb-online-status',{detail:{connected:backendConnected,supabase:supabaseBacked,realtime:realtimeConnected,production,readyForMultiplayer,phase:connectionPhase,latencyMs,maintenance:maintenanceState}}))}
function syncEvent(kind){window.dispatchEvent(new CustomEvent('tdb-online-sync',{detail:{kind}}))}
function setPhase(phase){if(connectionPhase!==phase){connectionPhase=phase;statusEvent()}}
function logClientError(err,context={}){if(!token())return;fetch('/api/logs/client',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token()}`},body:JSON.stringify({message:err?.message||String(err),stack:err?.stack||null,route:location.pathname,context:{version:'6.1.1',...context}}),keepalive:true}).catch(()=>{})}
function onlineError(err,context={}){const message=err?.message||String(err||'Erro online');console.error('[TDB Online]',err);logClientError(err,context);window.dispatchEvent(new CustomEvent('tdb-online-error',{detail:{message}}));if(typeof window.toast==='function')window.toast(message)}
function applySnapshot(payload){const data=payload?.data||{},status=payload?.status||{};const oldRooms=signature(cache.rooms),oldMatches=signature(cache.matches),oldPresence=signature(cache.presence),oldShared=signature(cache.shared);cache.rooms=Array.isArray(data.rooms)?data.rooms:[];cache.matches=Array.isArray(data.matches)?data.matches:[];cache.presence=data.presence||{};cache.shared=data.shared||{};supabaseBacked=!!status.supabase;production=!!status.production;readyForMultiplayer=!!status.readyForMultiplayer;maintenanceState=status.maintenance||{enabled:false};backendConnected=true;failureCount=0;setPhase(readyForMultiplayer?'online':'connecting');persistAll();activateOnlineAdapters();statusEvent();if(signature(cache.rooms)!==oldRooms)syncEvent('rooms');if(signature(cache.matches)!==oldMatches)syncEvent('matches');if(signature(cache.presence)!==oldPresence)syncEvent('presence');if(signature(cache.shared)!==oldShared){for(const [key,value] of Object.entries(cache.shared))emitLocal(`shared:${key}`,value);syncEvent('shared')}}
async function refreshHealth(){const started=performance.now();try{const r=await api(`/api/health?_=${Date.now()}`,{method:'GET'});latencyMs=Math.max(1,Math.round(performance.now()-started));backendConnected=!!r.ok;supabaseBacked=!!r.supabase;production=!!r.production;readyForMultiplayer=!!r.readyForMultiplayer;maintenanceState=r.maintenance||{enabled:false};failureCount=0;setPhase(readyForMultiplayer?'online':'connecting');statusEvent();return r}catch(err){latencyMs=null;backendConnected=false;readyForMultiplayer=false;failureCount++;setPhase(failureCount>=3?'offline':'reconnecting');statusEvent();return null}}
async function refreshSnapshot(){if(clientSuspended)return false;try{applySnapshot(await api(`/api/state/snapshot?_=${Date.now()}`,{method:'GET'}));return true}catch(err){console.warn('[TDB snapshot]',err?.message||err);await refreshHealth();return false}}
function scheduleSnapshot(){
  clearInterval(snapshotTimer);snapshotTimer=null;
  if(clientSuspended)return;
  snapshotTimer=setInterval(()=>refreshSnapshot(),document.hidden?12000:5000);
}
document.addEventListener('visibilitychange',()=>{if(clientSuspended)return;scheduleSnapshot();if(!document.hidden)heartbeatNow()});
async function initSupabaseRealtime(){if(realtimeInitStarted||location.protocol==='file:')return;realtimeInitStarted=true;try{const cfg=await api(`/api/config?_=${Date.now()}`,{method:'GET'});if(!cfg.realtimeEnabled||!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase?.createClient){realtimeConnected=false;statusEvent();return}supabaseBrowser=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});realtimeChannel=supabaseBrowser.channel('tdb-events-client').on('postgres_changes',{event:'INSERT',schema:'public',table:'tdb_events'},payload=>{const row=payload.new||{},topic=row.topic||'general',roomCode=row.room_code||null;if(topic==='game'&&currentGame?.roomCode===roomCode){syncGame(roomCode,currentGame.role);return}if(topic==='music'){if(roomCode)refreshShared(`music:${roomCode}`);return}if(['friends','invites'].includes(topic)){syncEvent('social');return}if(topic==='roomfeed'){window.dispatchEvent(new CustomEvent('tdb-room-feed-update',{detail:{roomCode}}));return}if(topic==='screenshare'){window.dispatchEvent(new CustomEvent('tdb-screen-share-update',{detail:{roomCode}}));return}refreshSnapshot()}).subscribe(status=>{realtimeConnected=status==='SUBSCRIBED';statusEvent()})}catch(err){console.warn('[TDB Supabase Realtime]',err);realtimeConnected=false;statusEvent()}}
class OnlineRoomAdapter{list(){return structuredClone(cache.rooms)}replace(rooms){cache.rooms=structuredClone(rooms||[]);write(CACHE_KEYS.rooms,cache.rooms);return rooms}active(){return window.TDBCore.storage.get('tbd_active_room',null)}setActive(room){if(room)window.TDBCore.storage.set('tbd_active_room',room);else window.TDBCore.storage.remove('tbd_active_room')}upsert(room){const i=cache.rooms.findIndex(r=>r.code===room.code);if(i>=0)cache.rooms[i]=structuredClone(room);else cache.rooms.push(structuredClone(room));write(CACHE_KEYS.rooms,cache.rooms);singleFlight(`room-upsert:${room.code}`,()=>api('/api/rooms/upsert',{method:'POST',body:JSON.stringify({room})}).then(result=>{if(result.room){const j=cache.rooms.findIndex(r=>r.code===result.room.code);if(j>=0)cache.rooms[j]=result.room;else cache.rooms.push(result.room);write(CACHE_KEYS.rooms,cache.rooms);syncEvent('rooms')}}).catch(err=>onlineError(err,{action:'room-upsert'})));return room}remove(code){cache.rooms=cache.rooms.filter(r=>r.code!==code);write(CACHE_KEYS.rooms,cache.rooms);singleFlight(`room-remove:${code}`,()=>api('/api/rooms/remove',{method:'POST',body:JSON.stringify({code})}).catch(err=>console.warn('[TDB remove room]',err.message)))}}
class OnlineMatchAdapter{list(){return structuredClone(cache.matches)}replace(m){cache.matches=structuredClone(m||[]);write(CACHE_KEYS.matches,cache.matches);return m}upsert(m){const i=cache.matches.findIndex(x=>x.matchId===m.matchId);if(i>=0)cache.matches[i]=structuredClone(m);else cache.matches.push(structuredClone(m));write(CACHE_KEYS.matches,cache.matches);return m}remove(id){cache.matches=cache.matches.filter(m=>m.matchId!==id);write(CACHE_KEYS.matches,cache.matches)}byRoom(code){return structuredClone(cache.matches.find(m=>m.roomCode===code&&m.status!=='finished')||null)}}
class OnlinePresenceAdapter{set(userId,status,extra={}){presenceContext={status:status||'online',roomCode:extra.roomCode||null,game:extra.game||null,view:extra.view||null};const enriched={...extra,version:'6.1.1',view:extra.view||presenceContext.view||null};const v={userId,status,...enriched,updatedAt:Date.now()};cache.presence[userId]=v;write(CACHE_KEYS.presence,cache.presence);api('/api/presence/set',{method:'POST',body:JSON.stringify({status,extra:enriched})}).catch(()=>{});return v}get(id){return structuredClone(cache.presence[id]||{status:'offline'})}all(){return structuredClone(cache.presence)}}
class OnlineRealtimeAdapter{subscribe(ch,cb){if(!listeners.has(ch))listeners.set(ch,new Set());listeners.get(ch).add(cb);return()=>listeners.get(ch)?.delete(cb)}publish(ch,p){emitLocal(ch,p)}}
class OnlineSharedStateAdapter{get(key,fallback=null){return cache.shared[key]===undefined?fallback:structuredClone(cache.shared[key])}set(key,value){cache.shared[key]=structuredClone(value);write(CACHE_KEYS.shared,cache.shared);emitLocal(`shared:${key}`,value);return value}subscribe(key,cb){return realtime.subscribe(`shared:${key}`,cb)}}
const rooms=new OnlineRoomAdapter(),matches=new OnlineMatchAdapter(),presence=new OnlinePresenceAdapter(),realtime=new OnlineRealtimeAdapter(),sharedState=new OnlineSharedStateAdapter();
function activateOnlineAdapters(){if(window.TDBCore)window.TDBCore.useOnlineAdapters({rooms,matches,presence,realtime,sharedState})}
async function heartbeatNow(){if(clientSuspended||!token()||location.protocol==='file:')return false;const started=performance.now();try{const hb=currentGame?{status:'playing',roomCode:currentGame.roomCode,game:presenceContext.game||null}:{...presenceContext};await api('/api/heartbeat',{method:'POST',body:JSON.stringify({...hb,version:'6.1.1',view:presenceContext.view||null})});latencyMs=Math.max(1,Math.round(performance.now()-started));statusEvent();return true}catch{latencyMs=null;statusEvent();return false}}
function scheduleHeartbeat(){
  clearInterval(heartbeatTimer);heartbeatTimer=null;
  if(clientSuspended)return;
  heartbeatTimer=setInterval(heartbeatNow,12000);
}
async function reconnect(){return singleFlight('reconnect',async()=>{try{return await api(`/api/reconnect?_=${Date.now()}`,{method:'GET'})}catch(err){if(err.status!==401)onlineError(err,{action:'reconnect'});return{ok:false,room:null}}},250)}
async function upsertRoomOnline(room){return singleFlight(`room-save:${room.code}`,async()=>{try{const r=await api('/api/rooms/upsert',{method:'POST',body:JSON.stringify({room})});if(r.room){const i=cache.rooms.findIndex(x=>x.code===r.room.code);if(i>=0)cache.rooms[i]=r.room;else cache.rooms.push(r.room);write(CACHE_KEYS.rooms,cache.rooms);syncEvent('rooms')}return r.room}catch(err){onlineError(err,{action:'room-save'});return null}},450)}
async function upsertRoom(room){
  return singleFlight(`room-save:${room.code}`,async()=>{
    try{
      const result=await api('/api/rooms/upsert',{method:'POST',body:JSON.stringify({room})});
      if(result.room){
        const i=cache.rooms.findIndex(r=>r.code===result.room.code);
        if(i>=0)cache.rooms[i]=result.room;else cache.rooms.push(result.room);
        write(CACHE_KEYS.rooms,cache.rooms);syncEvent('rooms');
      }
      return result.room||null;
    }catch(err){onlineError(err,{action:'room-upsert'});return null}
  },500);
}
async function joinRoom(code,password=''){return singleFlight(`join:${code}`,async()=>{try{const result=await api('/api/rooms/join',{method:'POST',body:JSON.stringify({code,password})}),room=result.room,i=cache.rooms.findIndex(r=>r.code===room.code);if(i>=0)cache.rooms[i]=room;else cache.rooms.push(room);write(CACHE_KEYS.rooms,cache.rooms);window.dispatchEvent(new CustomEvent('tdb-room-join-result',{detail:{ok:true,room}}));syncEvent('rooms');return true}catch(err){window.dispatchEvent(new CustomEvent('tdb-room-join-result',{detail:{ok:false,code,error:err.message}}));return false}},500)}
async function watchRoom(code){return singleFlight(`watch:${code}`,async()=>{try{const r=await api('/api/rooms/watch',{method:'POST',body:JSON.stringify({code})});if(r.room){const i=cache.rooms.findIndex(x=>x.code===r.room.code);if(i>=0)cache.rooms[i]=r.room;else cache.rooms.push(r.room);write(CACHE_KEYS.rooms,cache.rooms);syncEvent('rooms')}return r.room}catch(err){onlineError(err,{action:'watch-room'});return null}},500)}
async function leaveRoom(code){return singleFlight(`leave:${code}`,async()=>{try{await api('/api/rooms/leave',{method:'POST',body:JSON.stringify({code})});await refreshSnapshot();return true}catch(err){onlineError(err,{action:'leave-room'});return false}},500)}
async function kickPlayer(code,targetId){return singleFlight(`kick:${code}:${targetId}`,async()=>{const r=await api('/api/rooms/kick',{method:'POST',body:JSON.stringify({code,targetId})});await refreshSnapshot();return r.room},500)}
function dispatchGameState(roomCode,state){
  if(currentGame&&currentGame.roomCode===roomCode){
    const incomingMatchId=state?.matchId||null;
    const incomingStartedAt=Number(state?.startedAt||0);
    const currentStartedAt=Number(currentGame.startedAt||0);

    // Different matchId can mean either:
    // 1) a legitimate newer rematch started by the host; or
    // 2) a late response from the old match.
    // Accept only the newer match.
    if(currentGame.matchId&&incomingMatchId&&currentGame.matchId!==incomingMatchId){
      if(incomingStartedAt<=currentStartedAt) return false;
      currentGame.version=0;
    }

    if(incomingMatchId) currentGame.matchId=incomingMatchId;
    if(incomingStartedAt) currentGame.startedAt=incomingStartedAt;
    currentGame.version=Number(state?.version||0);
  }

  window.dispatchEvent(new CustomEvent('tdb-game-state',{detail:{roomCode,state}}));
  return true;
}
async function startGame(roomCode){return singleFlight(`start:${roomCode}`,async()=>{try{const r=await api('/api/games/start',{method:'POST',body:JSON.stringify({roomCode})});if(r.state)dispatchGameState(roomCode,r.state);await refreshSnapshot();return true}catch(err){onlineError(err,{action:'start-game'});return false}},650)}
async function returnGameToRoom(roomCode){
  stopGameSync();
  return singleFlight(`game-return:${roomCode}`,async()=>{
    try{
      const r=await api('/api/games/return',{
        method:'POST',
        body:JSON.stringify({roomCode})
      });
      if(r.room){
        const i=cache.rooms.findIndex(x=>x.code===r.room.code);
        if(i>=0) cache.rooms[i]=r.room; else cache.rooms.push(r.room);
        write(CACHE_KEYS.rooms,cache.rooms);
        syncEvent('rooms');
      }
      return r.room||null;
    }catch(err){
      onlineError(err,{action:'game-return'});
      return null;
    }
  },400);
}
async function rematchGame(roomCode){
  stopGameSync();
  return singleFlight(`game-rematch:${roomCode}`,async()=>{
    try{
      const r=await api('/api/games/rematch',{
        method:'POST',
        body:JSON.stringify({roomCode})
      });
      if(r.room){
        const i=cache.rooms.findIndex(x=>x.code===r.room.code);
        if(i>=0) cache.rooms[i]=r.room; else cache.rooms.push(r.room);
        write(CACHE_KEYS.rooms,cache.rooms);
      }
      if(r.state){
        currentGame={roomCode,role:'player',version:Number(r.state.version||0),matchId:r.state.matchId||null,startedAt:Number(r.state.startedAt||0)};
        dispatchGameState(roomCode,r.state);
        clearInterval(gamePollTimer);
        gamePollTimer=setInterval(()=>{
          if(currentGame?.roomCode===roomCode) syncGame(roomCode,'player');
        },900);
      }
      syncEvent('rooms');
      return r;
    }catch(err){
      onlineError(err,{action:'game-rematch'});
      return null;
    }
  },650);
}
async function syncGame(roomCode,role='player'){try{const r=await api(`/api/games/state?roomCode=${encodeURIComponent(roomCode)}&role=${encodeURIComponent(role)}&_=${Date.now()}`,{method:'GET'});if(r.state)dispatchGameState(roomCode,r.state);return true}catch(err){if(err.status!==404)console.warn('[TDB game sync]',err.message);return false}}
function joinGame(roomCode,userId,role='player'){currentGame={roomCode,role,version:0,matchId:null,startedAt:0};clearInterval(gamePollTimer);syncGame(roomCode,role);gamePollTimer=setInterval(()=>{if(currentGame?.roomCode===roomCode)syncGame(roomCode,role)},900);return true}
async function gameAction(roomCode,userId,action){return singleFlight(`game-action:${roomCode}`,async()=>{try{const enriched={...action,actionId:action.actionId||actionId('GAME'),expectedVersion:currentGame?.version??undefined},r=await api('/api/games/action',{method:'POST',body:JSON.stringify({roomCode,action:enriched})});if(r.state)dispatchGameState(roomCode,r.state);return true}catch(err){if(err.code==='STALE_STATE'||/partida mudou/i.test(err.message)){await syncGame(roomCode,currentGame?.role||'player');if(typeof window.toast==='function')window.toast('A partida foi atualizada. Tente novamente.');return false}onlineError(err,{action:'game-action'});return false}},180)}
function stopGameSync(){currentGame=null;clearInterval(gamePollTimer);gamePollTimer=null}
async function refreshShared(key){try{const r=await api(`/api/shared/get?key=${encodeURIComponent(key)}&_=${Date.now()}`,{method:'GET'});cache.shared[key]=r.value;write(CACHE_KEYS.shared,cache.shared);emitLocal(`shared:${key}`,r.value);return r.value}catch{return null}}
async function musicAction(roomCode,action){return singleFlight(`music:${roomCode}:${action.type}`,async()=>{try{const r=await api('/api/music/action',{method:'POST',body:JSON.stringify({roomCode,action:{...action,actionId:action.actionId||actionId('MUS')}})});cache.shared[`music:${roomCode}`]=r.state;write(CACHE_KEYS.shared,cache.shared);emitLocal(`shared:music:${roomCode}`,r.state);return r.state}catch(err){onlineError(err,{action:'music-action'});return null}},180)}

async function getRoomFeed(code){return(await api(`/api/platform/room-feed?code=${encodeURIComponent(code)}&_=${Date.now()}`,{method:'GET'})).feed}
async function sendRoomMessage(code,message){return await api('/api/platform/room-feed',{method:'POST',body:JSON.stringify({type:'MESSAGE',code,message})})}
async function sendRoomReaction(code,emoji){return await api('/api/platform/room-feed',{method:'POST',body:JSON.stringify({type:'REACTION',code,emoji})})}

async function screenShareState(code){return await api(`/api/platform/screen-share?code=${encodeURIComponent(code)}&_=${Date.now()}`,{method:'GET'})}
async function screenShareAction(code,action){return await api('/api/platform/screen-share',{method:'POST',body:JSON.stringify({code,action})})}
async function musicProfile(){return(await api(`/api/platform/music-profile?_=${Date.now()}`,{method:'GET'})).profile}
async function musicProfileAction(action){return await api('/api/platform/music-profile',{method:'POST',body:JSON.stringify({action})})}
async function updateProfile(username,avatar){const r=await api('/api/profile/update',{method:'POST',body:JSON.stringify({username,avatar})});return r.user}
async function socialSummary(){return await api(`/api/friends/list?_=${Date.now()}`,{method:'GET'})}
async function listFriends(){return(await socialSummary()).friends||[]}
async function searchUsers(q){return(await api(`/api/users/search?q=${encodeURIComponent(q)}&_=${Date.now()}`,{method:'GET'})).users||[]}
async function addFriend(friendId){return singleFlight(`friend:${friendId}`,async()=>await api('/api/friends/add',{method:'POST',body:JSON.stringify({friendId})}),500)}
async function respondFriend(senderId,accept){return singleFlight(`friend-response:${senderId}`,async()=>await api('/api/friends/respond',{method:'POST',body:JSON.stringify({senderId,accept})}),500)}
async function removeFriend(friendId){await api('/api/friends/remove',{method:'POST',body:JSON.stringify({friendId})});return true}
async function sendInvite(friendId,roomCode){return singleFlight(`invite:${friendId}:${roomCode}`,async()=>await api('/api/invites/send',{method:'POST',body:JSON.stringify({friendId,roomCode})}),600)}
async function respondInvite(inviteId,accept){return singleFlight(`invite-response:${inviteId}`,async()=>await api('/api/invites/respond',{method:'POST',body:JSON.stringify({inviteId,accept})}),500)}
async function getProfileHistory(){return await api(`/api/profile/history?_=${Date.now()}`,{method:'GET'})}
async function submitReport(category,message,context={}){return await api('/api/reports/create',{method:'POST',body:JSON.stringify({category,message,context})})}
async function boot(){
  clientSuspended=false;
  setPhase('connecting');
  await refreshHealth();
  await refreshSnapshot();
  scheduleSnapshot();
  scheduleHeartbeat();
  await heartbeatNow();
  await initSupabaseRealtime();
}
function suspend(){
  clientSuspended=true;
  clearInterval(snapshotTimer);snapshotTimer=null;
  clearInterval(heartbeatTimer);heartbeatTimer=null;
  stopGameSync();
  try{
    if(supabaseBrowser&&realtimeChannel)supabaseBrowser.removeChannel(realtimeChannel);
  }catch{}
  realtimeChannel=null;realtimeConnected=false;realtimeInitStarted=false;
  setPhase('offline');
}
async function resume(){
  if(!clientSuspended)return true;
  await boot();
  return true;
}
window.TDBOnline={connect:boot,suspend,resume,refreshSnapshot,refreshHealth,refreshShared,reconnect,heartbeatNow,upsertRoom:upsertRoomOnline,joinRoom,watchRoom,leaveRoom,kickPlayer,getRoomFeed,sendRoomMessage,sendRoomReaction,screenShareState,screenShareAction,musicProfile,musicProfileAction,joinGame,stopGameSync,startGame,returnGameToRoom,rematchGame,gameAction,musicAction,syncGame,updateProfile,socialSummary,listFriends,searchUsers,addFriend,respondFriend,removeFriend,sendInvite,respondInvite,getProfileHistory,submitReport,send:()=>false,get connected(){return backendConnected},get supabase(){return supabaseBacked},get realtime(){return realtimeConnected},get phase(){return connectionPhase},get production(){return production},get readyForMultiplayer(){return readyForMultiplayer},get maintenance(){return maintenanceState},get latencyMs(){return latencyMs},get cache(){return cache}};
boot();
})();
