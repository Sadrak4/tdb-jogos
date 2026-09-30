import { createClient } from '@supabase/supabase-js';

const MEMORY = {
  rooms:new Map(),
  matches:new Map(),
  presence:new Map(),
  shared:new Map(),
  events:[]
};

let supabaseClient=null;
let supabaseReady=false;
let schemaReady=false;
let initPromise=null;
let lastError=null;
let lastInitAt=0;

function envSecret(){
  return process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || '';
}
function envUrl(){
  return process.env.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || '';
}
function envPublishable(){
  return process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || '';
}

export async function initSupabase(){
  if(initPromise && isSupabaseReady()) return initPromise;
  if(initPromise && Date.now()-lastInitAt<5000) return initPromise;

  lastInitAt=Date.now();
  initPromise=(async()=>{
    const url=envUrl();
    const secret=envSecret();

    if(!url || !secret){
      supabaseReady=false;
      schemaReady=false;
      lastError='Variáveis do Supabase ausentes.';
      return false;
    }

    try{
      supabaseClient=createClient(url,secret,{
        auth:{persistSession:false,autoRefreshToken:false},
        global:{headers:{'X-Client-Info':'tdb-jogos-server/5.0'}}
      });

      const {error}=await supabaseClient
        .from('tdb_rooms')
        .select('code',{head:true,count:'exact'})
        .limit(1);

      if(error){
        supabaseReady=true;
        schemaReady=false;
        lastError=error.message;
        return false;
      }

      supabaseReady=true;
      schemaReady=true;
      lastError=null;
      return true;
    }catch(err){
      supabaseReady=false;
      schemaReady=false;
      lastError=err?.message||String(err);
      return false;
    }
  })();

  return initPromise;
}

export function getSupabaseClient(){
  return supabaseClient;
}
export function isSupabaseReady(){
  return supabaseReady && schemaReady;
}
export function publicSupabaseConfig(){
  return {
    url:envUrl(),
    publishableKey:envPublishable()
  };
}

function clone(v){return structuredClone(v)}

export async function emitEvent(topic,roomCode=null,kind='update'){
  await initSupabase();

  if(isSupabaseReady()){
    try{
      const {error}=await supabaseClient.from('tdb_events').insert({
        topic:String(topic||'general'),
        room_code:roomCode||null,
        kind:String(kind||'update')
      });
      if(error) console.warn('[TDB Supabase event]',error.message);

      // Small probabilistic cleanup so this tiny invalidation table does not grow forever.
      if(Math.random()<0.015){
        const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
        supabaseClient.from('tdb_events').delete().lt('created_at',cutoff).then(()=>{}).catch(()=>{});
      }
    }catch{}
    return;
  }

  MEMORY.events.push({topic,room_code:roomCode,kind,created_at:Date.now()});
  if(MEMORY.events.length>500) MEMORY.events.splice(0,MEMORY.events.length-500);
}

async function listTable(table){
  await initSupabase();
  if(!isSupabaseReady()) return null;
  const {data,error}=await supabaseClient.from(table).select('*');
  if(error) throw new Error(error.message);
  return data||[];
}

export async function snapshot(){
  await initSupabase();

  if(isSupabaseReady()){
    const [roomsRes,matchesRes,presenceRes,sharedRes]=await Promise.all([
      supabaseClient.from('tdb_rooms').select('data').neq('status','closed'),
      supabaseClient.from('tdb_matches').select('data').neq('status','finished'),
      supabaseClient.from('tdb_presence').select('user_id,data,updated_at'),
      supabaseClient.from('tdb_shared').select('key,value').like('key','music:%')
    ]);

    for(const r of [roomsRes,matchesRes,presenceRes,sharedRes]){
      if(r.error) throw new Error(r.error.message);
    }

    const rooms=(roomsRes.data||[]).map(row=>{
      const room=clone(row.data||{});
      room.hasPassword=!!room.password;
      delete room.password;
      return room;
    });

    const matches=(matchesRes.data||[]).map(row=>clone(row.data||{}));

    const presence={};
    for(const row of presenceRes.data||[]){
      const value=clone(row.data||{});
      value.updatedAt=value.updatedAt||new Date(row.updated_at).getTime();
      presence[row.user_id]=value;
    }

    const shared={};
    for(const row of sharedRes.data||[]) shared[row.key]=clone(row.value);

    return {rooms,matches,presence,shared,supabase:true};
  }

  const rooms=[...MEMORY.rooms.values()].map(room=>{
    const copy=clone(room);
    copy.hasPassword=!!copy.password;
    delete copy.password;
    return copy;
  });
  const matches=[...MEMORY.matches.values()].map(clone);
  const presence=Object.fromEntries([...MEMORY.presence.entries()].map(([k,v])=>[k,clone(v)]));
  const shared={};
  for(const [key,value] of MEMORY.shared.entries()){
    if(key.startsWith('music:')) shared[key]=clone(value);
  }
  return {rooms,matches,presence,shared,supabase:false};
}

async function upsertRoom(room){
  if(isSupabaseReady()){
    const {error}=await supabaseClient.from('tdb_rooms').upsert({
      code:room.code,
      game:room.game||null,
      owner_id:room.ownerId||null,
      status:room.status||'open',
      privacy:room.privacy||'public',
      data:room,
      updated_at:new Date().toISOString()
    },{onConflict:'code'});
    if(error) throw new Error(error.message);
  }else{
    MEMORY.rooms.set(room.code,clone(room));
  }
  await emitEvent('rooms',room.code,'upsert');
}

async function removeRoom(code){
  if(isSupabaseReady()){
    const {error}=await supabaseClient.from('tdb_rooms').delete().eq('code',code);
    if(error) throw new Error(error.message);
  }else MEMORY.rooms.delete(code);
  await emitEvent('rooms',code,'remove');
}

async function upsertMatch(match){
  if(isSupabaseReady()){
    const {error}=await supabaseClient.from('tdb_matches').upsert({
      match_id:match.matchId,
      room_code:match.roomCode||null,
      game:match.game||null,
      status:match.status||'playing',
      data:match,
      updated_at:new Date().toISOString()
    },{onConflict:'match_id'});
    if(error) throw new Error(error.message);
  }else MEMORY.matches.set(match.matchId,clone(match));
  await emitEvent('matches',match.roomCode||null,'upsert');
}

async function removeMatch(matchId){
  let roomCode=null;
  if(isSupabaseReady()){
    const {data}=await supabaseClient.from('tdb_matches').select('room_code').eq('match_id',matchId).maybeSingle();
    roomCode=data?.room_code||null;
    const {error}=await supabaseClient.from('tdb_matches').delete().eq('match_id',matchId);
    if(error) throw new Error(error.message);
  }else{
    roomCode=MEMORY.matches.get(matchId)?.roomCode||null;
    MEMORY.matches.delete(matchId);
  }
  await emitEvent('matches',roomCode,'remove');
}

async function setPresence(userId,status,extra={}){
  const payload={userId,status:status||'online',...extra,updatedAt:Date.now()};
  if(isSupabaseReady()){
    const {error}=await supabaseClient.from('tdb_presence').upsert({
      user_id:userId,
      status:payload.status,
      data:payload,
      updated_at:new Date().toISOString()
    },{onConflict:'user_id'});
    if(error) throw new Error(error.message);
  }else MEMORY.presence.set(userId,clone(payload));
  await emitEvent('presence',extra?.roomCode||null,'set');
  return payload;
}

export async function applyMutation(message){
  await initSupabase();
  switch(message.type){
    case 'room:upsert':
      if(message.room?.code) await upsertRoom(message.room);
      return;
    case 'room:remove':
      if(message.code) await removeRoom(message.code);
      return;
    case 'match:upsert':
      if(message.match?.matchId) await upsertMatch(message.match);
      return;
    case 'match:remove':
      if(message.matchId) await removeMatch(message.matchId);
      return;
    case 'presence:set':
      if(message.userId) message.presence=await setPresence(message.userId,message.status,message.extra||{});
      return;
    case 'shared:set':
      if(message.key) await setSharedValue(message.key,message.value);
      return;
  }
}

// Kept for compatibility with older code. Supabase Realtime now carries invalidations.
export async function publishGlobal(){return false}
export async function subscribeGlobal(){return false}

export async function getSharedValue(key,fallback=null){
  await initSupabase();

  if(isSupabaseReady()){
    const {data,error}=await supabaseClient
      .from('tdb_shared')
      .select('value')
      .eq('key',key)
      .maybeSingle();

    if(error) throw new Error(error.message);
    return data?.value ?? fallback;
  }

  return MEMORY.shared.has(key)?clone(MEMORY.shared.get(key)):fallback;
}

export async function setSharedValue(key,value){
  await initSupabase();

  if(isSupabaseReady()){
    const {error}=await supabaseClient.from('tdb_shared').upsert({
      key,
      value,
      updated_at:new Date().toISOString()
    },{onConflict:'key'});
    if(error) throw new Error(error.message);
  }else MEMORY.shared.set(key,clone(value));

  const roomCode=key.startsWith('game:')?key.slice(5):key.startsWith('music:')?key.slice(6):null;
  const topic=key.startsWith('game:')?'game':key.startsWith('music:')?'music':'shared';
  await emitEvent(topic,roomCode,'set');
  return value;
}

export async function getRoomPrivate(code){
  await initSupabase();

  if(isSupabaseReady()){
    const {data,error}=await supabaseClient
      .from('tdb_rooms')
      .select('data')
      .eq('code',code)
      .maybeSingle();

    if(error) throw new Error(error.message);
    return data?.data?clone(data.data):null;
  }

  return MEMORY.rooms.get(code)?clone(MEMORY.rooms.get(code)):null;
}

export async function setRoomPrivate(room){
  if(!room?.code) return null;
  await initSupabase();
  await upsertRoom(room);
  return room;
}

export async function backendStatus(){
  await initSupabase();
  const production=!!process.env.VERCEL;
  const configured=!!envUrl() && !!envSecret();

  return {
    supabase:isSupabaseReady(),
    configured,
    schemaReady,
    production,
    storage:isSupabaseReady()?'supabase':'memory',
    readyForMultiplayer:isSupabaseReady() || !production,
    error:lastError
  };
}
