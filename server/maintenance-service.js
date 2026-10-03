import {initSupabase,isSupabaseReady,getSupabaseClient,getSharedValue,setSharedValue,setRoomPrivate,applyMutation,emitEvent,runSupabaseQuery} from './realtime-store.js';
import { abandonGame,getGame,isTerminal } from './game-service.js';
const DISCONNECTED_AFTER_MS=25_000;export const RECONNECT_GRACE_MS=90_000;export const EMPTY_ROOM_TTL_MS=5*60*1000;const CLEANUP_EVERY_MS=10_000;
function publicRoom(room){const copy=structuredClone(room);copy.hasPassword=!!copy.password;delete copy.password;return copy}
export async function cleanupStale({force=false}={}){await initSupabase();if(!isSupabaseReady())return{changed:0};const now=Date.now(),lock=await getSharedValue('system:cleanup',{at:0});if(!force&&now-Number(lock?.at||0)<CLEANUP_EVERY_MS)return{changed:0,skipped:true};await setSharedValue('system:cleanup',{at:now});const db=getSupabaseClient();const [roomsRes,presenceRes]=await Promise.all([runSupabaseQuery(db.from('tdb_rooms').select('code,data,status').neq('status','closed'),'Limpeza de salas'),runSupabaseQuery(db.from('tdb_presence').select('user_id,updated_at,data'),'Limpeza de presença')]);if(roomsRes.error)throw new Error(roomsRes.error.message);if(presenceRes.error)throw new Error(presenceRes.error.message);const lastSeen=new Map((presenceRes.data||[]).map(p=>[p.user_id,new Date(p.updated_at).getTime()]));let changed=0;for(const row of roomsRes.data||[]){const room=structuredClone(row.data||{});if(!room?.code)continue;const before=JSON.stringify(room),keep=[];for(const player of room.players||[]){const seen=lastSeen.get(player.id)||Number(player.lastSeenAt||room.createdAt||0),age=now-seen;if(age>RECONNECT_GRACE_MS){if(room.status==='playing'&&['chess','truco','pool','blackjack'].includes(room.game)){try{await abandonGame(room.code,player.id,'reconnect-timeout');if(['chess','truco','pool'].includes(room.game)){room.status='finished';room.finishedAt=now}}catch(err){console.warn('[cleanup abandon]',err.message)}}continue}if(age>DISCONNECTED_AFTER_MS){player.connection='reconnecting';player.disconnectedAt=seen;player.reconnectUntil=seen+RECONNECT_GRACE_MS}else{player.connection='online';delete player.disconnectedAt;delete player.reconnectUntil}keep.push(player)}room.players=keep;if(!room.players.length){if(!room.emptySince){room.emptySince=now;room.emptyExpiresAt=now+EMPTY_ROOM_TTL_MS;room.status='open';room.ownerId=null;room.owner='';delete room.finishedAt;delete room.startedAt;await setRoomPrivate(room);changed++;continue}if(now>=Number(room.emptyExpiresAt||0)){await applyMutation({type:'room:remove',code:room.code});changed++;continue}if(JSON.stringify(room)!==before){await setRoomPrivate(room);changed++}continue}delete room.emptySince;delete room.emptyExpiresAt;const owner=room.players.find(p=>p.id===room.ownerId);if(!owner){const next=room.players.find(p=>p.connection!=='reconnecting')||room.players[0];room.ownerId=next.id;room.owner=next.username;room.hostMigratedAt=now}if(JSON.stringify(room)!==before){await setRoomPrivate(room);changed++}}
const nowIso=new Date(now).toISOString(),dayAgo=new Date(now-24*60*60*1000).toISOString(),monthAgo=new Date(now-30*24*60*60*1000).toISOString(),sixMonthsAgo=new Date(now-180*24*60*60*1000).toISOString();await Promise.allSettled([db.from('tdb_sessions').delete().lt('expires_at',nowIso),db.from('tdb_admin_sessions').delete().lt('expires_at',nowIso),db.from('tdb_room_invites').update({status:'expired'}).eq('status','pending').lt('expires_at',nowIso),db.from('tdb_events').delete().lt('created_at',dayAgo),db.from('tdb_rate_limits').delete().lt('updated_at',new Date(now-2*60*60*1000).toISOString()),db.from('tdb_error_logs').delete().lt('created_at',monthAgo),db.from('tdb_admin_audit_logs').delete().lt('created_at',sixMonthsAgo)]);return{changed}}
export async function heartbeat(user,{status='online',roomCode=null,game=null,version=null,view=null}={}){await initSupabase();if(!isSupabaseReady())return{ok:true};const db=getSupabaseClient(),payload={userId:user.id,status,roomCode:roomCode||null,game:game||null,version:String(version||'7.2.3').slice(0,24),view:String(view||'').slice(0,48)||null,updatedAt:Date.now()};const {error}=await runSupabaseQuery(db.from('tdb_presence').upsert({user_id:user.id,status,data:payload,updated_at:new Date().toISOString()},{onConflict:'user_id'}),'Heartbeat de presença');if(error)throw new Error(error.message);cleanupStale().catch(err=>console.warn('[TDB heartbeat cleanup]',err?.message||err));return{ok:true,serverTime:Date.now()}}
export async function reconnectUser(user){
  // Reconectar não deve esperar a varredura global de manutenção. Ela roda em paralelo.
  cleanupStale().catch(err=>console.warn('[TDB reconnect cleanup]',err?.message||err));
  await initSupabase();if(!isSupabaseReady())return{room:null,role:null};
  const db=getSupabaseClient();
  const {data,error}=await runSupabaseQuery(db.from('tdb_rooms').select('data,updated_at').neq('status','closed').order('updated_at',{ascending:false}),'Reconexão de salas');
  if(error)throw new Error(error.message);
  const found=(data||[]).map(r=>r.data).find(room=>(room.players||[]).some(p=>p.id===user.id)||(room.spectators||[]).some(s=>s.id===user.id));
  if(!found)return{room:null,role:null};

  // Recupera salas que ficaram marcadas como playing após uma falha no start.
  if(found.status==='playing'&&['chess','truco','pool'].includes(found.game)){
    try{
      const game=await getGame(found.code);
      if(!game){found.status='open';delete found.startedAt;delete found.finishedAt;await setRoomPrivate(found)}
      else if(isTerminal(game)){found.status='finished';found.finishedAt=found.finishedAt||Date.now();await setRoomPrivate(found)}
    }catch(err){console.warn('[TDB reconnect recovery]',err?.message||err)}
  }

  const role=(found.players||[]).some(p=>p.id===user.id)?'player':'spectator';
  if(role==='player'){
    const p=found.players.find(p=>p.id===user.id);
    if(p){p.username=user.username;p.avatar=user.avatar||p.avatar||null;p.avatarImage=user.avatarImage||p.avatarImage||null;p.connection='online';p.lastSeenAt=Date.now();delete p.disconnectedAt;delete p.reconnectUntil}
    await setRoomPrivate(found);
  }
  heartbeat(user,{status:found.status==='playing'?'playing':'room',roomCode:found.code,game:found.game}).catch(err=>console.warn('[TDB reconnect heartbeat]',err?.message||err));
  await emitEvent('rooms',found.code,'reconnect');
  return{room:publicRoom(found),role};
}
