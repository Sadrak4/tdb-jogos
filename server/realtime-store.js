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
const SUPABASE_INIT_TIMEOUT_MS=4500;
const SUPABASE_QUERY_TIMEOUT_MS=6500;
function withTimeout(promise,ms=SUPABASE_INIT_TIMEOUT_MS,label='Supabase'){
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} não respondeu em ${Math.ceil(ms/1000)}s.`)),ms)});
  return Promise.race([Promise.resolve(promise),timeout]).finally(()=>clearTimeout(timer));
}
export async function runSupabaseQuery(query,label='Supabase',ms=SUPABASE_QUERY_TIMEOUT_MS){
  const controller=new AbortController();
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},Math.max(250,Number(ms)||SUPABASE_QUERY_TIMEOUT_MS));
  try{
    let q=query;
    if(q&&typeof q.abortSignal==='function')q=q.abortSignal(controller.signal);
    return await withTimeout(Promise.resolve(q),Math.max(250,Number(ms)||SUPABASE_QUERY_TIMEOUT_MS)+150,label);
  }catch(err){
    if(timedOut||controller.signal.aborted){
      const timeoutErr=new Error(`${label} não respondeu dentro do tempo esperado.`);
      timeoutErr.code='SUPABASE_TIMEOUT';
      throw timeoutErr;
    }
    throw err;
  }finally{clearTimeout(timer)}
}

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
        global:{headers:{'X-Client-Info':'tdb-jogos-server/7.2.3'}}
      });
      const checks=await withTimeout(Promise.all([
        supabaseClient.from('tdb_rooms').select('code',{head:true,count:'exact'}).limit(1),
        supabaseClient.from('tdb_game_results').select('match_id',{head:true,count:'exact'}).limit(1),
        supabaseClient.from('tdb_friend_requests').select('sender_id',{head:true,count:'exact'}).limit(1),
        supabaseClient.from('tdb_room_invites').select('id',{head:true,count:'exact'}).limit(1),
        supabaseClient.from('tdb_reports').select('id',{head:true,count:'exact'}).limit(1),
        supabaseClient.from('tdb_admin_sessions').select('token',{head:true,count:'exact'}).limit(1),
        supabaseClient.from('tdb_users').select('id,banned',{head:true,count:'exact'}).limit(1)
      ]),SUPABASE_INIT_TIMEOUT_MS,'Supabase');
      const schemaError=checks.find(x=>x.error)?.error;
      if(schemaError){supabaseReady=true;schemaReady=false;lastError=`Schema v5.5 pendente: ${schemaError.message}`;return false;}


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
      const {error}=await runSupabaseQuery(supabaseClient.from('tdb_events').insert({
        topic:String(topic||'general'),
        room_code:roomCode||null,
        kind:String(kind||'update')
      }),'Evento do Supabase',3500);
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
  const {data,error}=await runSupabaseQuery(supabaseClient.from(table).select('*'),`Tabela ${table} do Supabase`);
  if(error) throw new Error(error.message);
  return data||[];
}

export async function snapshot(){
  await initSupabase();

  if(isSupabaseReady()){
    const [roomsRes,matchesRes,presenceRes,sharedRes]=await Promise.all([
      runSupabaseQuery(supabaseClient.from('tdb_rooms').select('data').neq('status','closed'),'Salas do Supabase'),
      runSupabaseQuery(supabaseClient.from('tdb_matches').select('data').neq('status','finished'),'Partidas do Supabase'),
      runSupabaseQuery(supabaseClient.from('tdb_presence').select('user_id,data,updated_at'),'Presença do Supabase'),
      runSupabaseQuery(supabaseClient.from('tdb_shared').select('key,value').like('key','music:%'),'Estado compartilhado do Supabase')
    ]);

    for(const r of [roomsRes,matchesRes,presenceRes,sharedRes]){
      if(r.error) throw new Error(r.error.message);
    }

    const now=Date.now();
    const rooms=(roomsRes.data||[]).map(row=>{
      const room=clone(row.data||{});
      room.hasPassword=!!room.password;
      delete room.password;
      return room;
    }).filter(room=>!room.emptyExpiresAt || Number(room.emptyExpiresAt)>now);

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

  const now=Date.now();
  const rooms=[...MEMORY.rooms.values()].map(room=>{
    const copy=clone(room);
    copy.hasPassword=!!copy.password;
    delete copy.password;
    return copy;
  }).filter(room=>!room.emptyExpiresAt || Number(room.emptyExpiresAt)>now);
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
    const {error}=await runSupabaseQuery(supabaseClient.from('tdb_rooms').upsert({
      code:room.code,
      game:room.game||null,
      owner_id:room.ownerId||null,
      status:room.status||'open',
      privacy:room.privacy||'public',
      data:room,
      updated_at:new Date().toISOString()
    },{onConflict:'code'}),'Salvar sala no Supabase');
    if(error) throw new Error(error.message);
  }else{
    MEMORY.rooms.set(room.code,clone(room));
  }
  await emitEvent('rooms',room.code,'upsert');
}

async function removeRoom(code){
  if(isSupabaseReady()){
    const {error}=await runSupabaseQuery(supabaseClient.from('tdb_rooms').delete().eq('code',code),'Remover sala do Supabase');
    if(error) throw new Error(error.message);
  }else MEMORY.rooms.delete(code);
  await emitEvent('rooms',code,'remove');
}

async function upsertMatch(match){
  if(isSupabaseReady()){
    const {error}=await runSupabaseQuery(supabaseClient.from('tdb_matches').upsert({
      match_id:match.matchId,
      room_code:match.roomCode||null,
      game:match.game||null,
      status:match.status||'playing',
      data:match,
      updated_at:new Date().toISOString()
    },{onConflict:'match_id'}),'Salvar partida no Supabase');
    if(error) throw new Error(error.message);
  }else MEMORY.matches.set(match.matchId,clone(match));
  await emitEvent('matches',match.roomCode||null,'upsert');
}

async function removeMatch(matchId){
  let roomCode=null;
  if(isSupabaseReady()){
    const {data}=await runSupabaseQuery(supabaseClient.from('tdb_matches').select('room_code').eq('match_id',matchId).maybeSingle(),'Localizar partida no Supabase');
    roomCode=data?.room_code||null;
    const {error}=await runSupabaseQuery(supabaseClient.from('tdb_matches').delete().eq('match_id',matchId),'Remover partida do Supabase');
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
    const {error}=await runSupabaseQuery(supabaseClient.from('tdb_presence').upsert({
      user_id:userId,
      status:payload.status,
      data:payload,
      updated_at:new Date().toISOString()
    },{onConflict:'user_id'}),'Atualizar presença no Supabase');
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
    const {data,error}=await runSupabaseQuery(supabaseClient
      .from('tdb_shared')
      .select('value')
      .eq('key',key)
      .maybeSingle(),'Ler estado compartilhado do Supabase');

    if(error) throw new Error(error.message);
    return data?.value ?? fallback;
  }

  return MEMORY.shared.has(key)?clone(MEMORY.shared.get(key)):fallback;
}

function sharedEventMeta(key=''){
  if(key.startsWith('game:')) return {topic:'game',roomCode:key.slice(5).split(':')[0]||null};
  if(key.startsWith('music:')) return {topic:'music',roomCode:key.slice(6).split(':')[0]||null};
  if(key.startsWith('screen:')) return {topic:'screenshare',roomCode:key.slice(7).split(':')[0]||null};
  return {topic:'shared',roomCode:null};
}

export async function setSharedValue(key,value){
  await initSupabase();

  if(isSupabaseReady()){
    const {error}=await runSupabaseQuery(supabaseClient.from('tdb_shared').upsert({
      key,
      value,
      updated_at:new Date().toISOString()
    },{onConflict:'key'}),'Salvar estado compartilhado no Supabase');
    if(error) throw new Error(error.message);
  }else MEMORY.shared.set(key,clone(value));

  const {topic,roomCode}=sharedEventMeta(key);
  await emitEvent(topic,roomCode,'set');
  return value;
}

export async function removeSharedValue(key){
  await initSupabase();
  if(isSupabaseReady()){
    const {error}=await runSupabaseQuery(supabaseClient.from('tdb_shared').delete().eq('key',key),'Remover estado compartilhado do Supabase');
    if(error) throw new Error(error.message);
  }else MEMORY.shared.delete(key);
  const {topic,roomCode}=sharedEventMeta(key);
  await emitEvent(topic,roomCode,'remove');
  return true;
}

export async function listSharedValues(prefix){
  await initSupabase();
  const out=[];
  if(isSupabaseReady()){
    const safePrefix=String(prefix||'');
    const {data,error}=await runSupabaseQuery(supabaseClient
      .from('tdb_shared')
      .select('key,value,updated_at')
      .like('key',`${safePrefix}%`),'Listar estado compartilhado do Supabase');
    if(error) throw new Error(error.message);
    for(const row of data||[])out.push({key:row.key,value:clone(row.value),updatedAt:row.updated_at?new Date(row.updated_at).getTime():0});
    return out;
  }
  for(const [key,value] of MEMORY.shared.entries()){
    if(key.startsWith(prefix))out.push({key,value:clone(value),updatedAt:Number(value?.updatedAt||0)});
  }
  return out;
}

export async function getRoomPrivate(code){
  await initSupabase();

  if(isSupabaseReady()){
    const {data,error}=await runSupabaseQuery(supabaseClient
      .from('tdb_rooms')
      .select('data')
      .eq('code',code)
      .maybeSingle(),'Ler sala do Supabase');

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

  const maintenance=await getSharedValue('app:maintenance',{enabled:false,message:'TDB em manutenção • voltamos em breve'}).catch(()=>({enabled:false}));
  return {
    supabase:isSupabaseReady(),
    configured,
    schemaReady,
    production,
    storage:isSupabaseReady()?'supabase':'memory',
    readyForMultiplayer:(isSupabaseReady() || !production) && !maintenance?.enabled,
    maintenance:maintenance&&typeof maintenance==='object'?maintenance:{enabled:false},
    error:lastError
  };
}
