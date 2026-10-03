import crypto from 'crypto';
import {
  initSupabase,
  isSupabaseReady,
  getSupabaseClient,
  getSharedValue,
  setSharedValue
} from './realtime-store.js';

const ADMIN_SESSION_MS=12*60*60*1000;
const ADMIN_USERNAME='adm';
// Somente o hash/salt ficam no servidor. A senha em texto puro nunca é enviada ao navegador.
const ADMIN_PASSWORD_SALT='73b425711eee7ee60fe2c60e13e7f4fa';
const ADMIN_PASSWORD_HASH='c7e65f647837c1e76624e8939eef6261b06527caf7331fe40af6caea2644d7931320b16c7f612431a2a4c7f14c6a3afe57ce96acca7ac5263886e78986ac64c3';

function normalize(v){return String(v||'').trim().toLowerCase()}
function hashPassword(password,salt){return crypto.scryptSync(String(password),salt,64).toString('hex')}
function safeEqualHex(a,b){
  try{
    const x=Buffer.from(a,'hex'),y=Buffer.from(b,'hex');
    return x.length===y.length&&crypto.timingSafeEqual(x,y);
  }catch{return false}
}
function adminSessionsKey(){return 'local:admin:sessions'}
function publicAdmin(){return{username:ADMIN_USERNAME,role:'admin'}}
function generatedPassword(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out='TDB-';
  for(let i=0;i<10;i++)out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

export async function loginAdmin(username,password){
  const okUser=normalize(username)===ADMIN_USERNAME;
  const computed=hashPassword(password,ADMIN_PASSWORD_SALT);
  if(!okUser||!safeEqualHex(computed,ADMIN_PASSWORD_HASH)) throw new Error('Usuário ou senha de administrador inválidos.');

  await initSupabase();
  const token=crypto.randomBytes(32).toString('hex');
  const expiresAt=Date.now()+ADMIN_SESSION_MS;

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {error}=await db.from('tdb_admin_sessions').insert({
      token,
      username:ADMIN_USERNAME,
      expires_at:new Date(expiresAt).toISOString()
    });
    if(error) throw new Error(error.message);
  }else{
    const sessions=await getSharedValue(adminSessionsKey(),{});
    sessions[token]={username:ADMIN_USERNAME,expiresAt};
    await setSharedValue(adminSessionsKey(),sessions);
  }

  await audit('admin_login',{details:{expiresAt:new Date(expiresAt).toISOString()}});
  return{admin:publicAdmin(),token,expiresAt};
}

export async function adminSession(token){
  if(!token)return null;
  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {data,error}=await db.from('tdb_admin_sessions').select('username,expires_at').eq('token',token).maybeSingle();
    if(error)throw new Error(error.message);
    if(!data)return null;
    if(new Date(data.expires_at).getTime()<=Date.now()){
      await db.from('tdb_admin_sessions').delete().eq('token',token);
      return null;
    }
    return data.username===ADMIN_USERNAME?publicAdmin():null;
  }

  const sessions=await getSharedValue(adminSessionsKey(),{});
  const entry=sessions[token];
  if(!entry||entry.expiresAt<=Date.now())return null;
  return entry.username===ADMIN_USERNAME?publicAdmin():null;
}

export async function logoutAdmin(token){
  if(!token)return;
  await initSupabase();
  if(isSupabaseReady()){
    const db=getSupabaseClient();
    await db.from('tdb_admin_sessions').delete().eq('token',token);
    await audit('admin_logout');
    return;
  }
  const sessions=await getSharedValue(adminSessionsKey(),{});
  delete sessions[token];
  await setSharedValue(adminSessionsKey(),sessions);
}

async function audit(action,{targetUserId=null,details={}}={}){
  await initSupabase();
  if(!isSupabaseReady())return;
  const db=getSupabaseClient();
  await db.from('tdb_admin_audit_logs').insert({
    admin_username:ADMIN_USERNAME,
    action,
    target_user_id:targetUserId||null,
    details:details&&typeof details==='object'?details:{value:String(details||'')}
  });
}

export async function overview(){
  await initSupabase();
  if(!isSupabaseReady())return{users:0,banned:0,openReports:0,errors24h:0,onlineUsers:0,openRooms:0,activeMatches:0,maintenance:{enabled:false}};
  const db=getSupabaseClient();
  const since=new Date(Date.now()-24*60*60*1000).toISOString();
  const onlineSince=new Date(Date.now()-30*1000).toISOString();
  const [users,banned,reports,errors,online,rooms,matches,maintenance]=await Promise.all([
    db.from('tdb_users').select('*',{count:'exact',head:true}),
    db.from('tdb_users').select('*',{count:'exact',head:true}).eq('banned',true),
    db.from('tdb_reports').select('*',{count:'exact',head:true}).in('status',['open','reviewing']),
    db.from('tdb_error_logs').select('*',{count:'exact',head:true}).gte('created_at',since),
    db.from('tdb_presence').select('*',{count:'exact',head:true}).gte('updated_at',onlineSince),
    db.from('tdb_rooms').select('*',{count:'exact',head:true}).eq('status','open'),
    db.from('tdb_matches').select('*',{count:'exact',head:true}).neq('status','finished'),
    getSharedValue('app:maintenance',{enabled:false,message:'TDB em manutenção • voltamos em breve'})
  ]);
  return{
    users:users.count||0,banned:banned.count||0,openReports:reports.count||0,errors24h:errors.count||0,
    onlineUsers:online.count||0,openRooms:rooms.count||0,activeMatches:matches.count||0,
    maintenance:maintenance||{enabled:false}
  };
}

export async function listUsers(query=''){
  await initSupabase();
  if(!isSupabaseReady())return[];
  const db=getSupabaseClient();
  let q=db.from('tdb_users')
    .select('id,username,avatar,created_at,banned,banned_reason,banned_at')
    .order('created_at',{ascending:false})
    .limit(100);
  const text=String(query||'').trim();
  if(text){
    const escaped=text.replace(/[%_]/g,'').slice(0,64);
    q=/^TDB-/i.test(escaped)?q.ilike('id',`%${escaped}%`):q.ilike('username',`%${escaped}%`);
  }
  const {data,error}=await q;
  if(error)throw new Error(error.message);
  const users=data||[];
  if(!users.length)return users;
  const ids=users.map(u=>u.id);
  const nowIso=new Date().toISOString();
  const [sessions,presence]=await Promise.all([
    db.from('tdb_sessions').select('user_id,expires_at').in('user_id',ids).gt('expires_at',nowIso),
    db.from('tdb_presence').select('user_id,status,data,updated_at').in('user_id',ids)
  ]);
  if(sessions.error)throw new Error(sessions.error.message);
  if(presence.error)throw new Error(presence.error.message);
  const sessionCount=new Map();
  for(const row of sessions.data||[])sessionCount.set(row.user_id,(sessionCount.get(row.user_id)||0)+1);
  const presenceMap=new Map((presence.data||[]).map(row=>[row.user_id,row]));
  return users.map(u=>{const pr=presenceMap.get(u.id);const age=pr?Date.now()-new Date(pr.updated_at).getTime():Infinity;return{...u,active_sessions:sessionCount.get(u.id)||0,presence_status:age<30000?(pr?.data?.status||pr?.status||'online'):age<90000?'away':'offline',client_version:pr?.data?.version||null,current_game:pr?.data?.game||null,current_room:pr?.data?.roomCode||null,last_seen_at:pr?.updated_at||null}});
}

export async function resetUserPassword(userId,newPassword=null){
  await initSupabase();
  if(!isSupabaseReady())throw new Error('Supabase indisponível.');
  const db=getSupabaseClient();
  const user=String(userId||'').trim().toUpperCase();
  if(!user.startsWith('TDB-'))throw new Error('ID inválido.');

  const generated=!newPassword;
  const password=generated?generatedPassword():String(newPassword);
  if(password.length<6)throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');

  const salt=crypto.randomBytes(16).toString('hex');
  const passwordHash=hashPassword(password,salt);
  const {data,error}=await db.from('tdb_users').update({salt,password_hash:passwordHash}).eq('id',user).select('id,username').maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error('Conta não encontrada.');

  await db.from('tdb_sessions').delete().eq('user_id',user);
  await audit('password_reset',{targetUserId:user,details:{generated}});
  return{user:data,temporaryPassword:generated?password:null};
}

export async function setUserBan(userId,banned,reason=''){
  await initSupabase();
  if(!isSupabaseReady())throw new Error('Supabase indisponível.');
  const db=getSupabaseClient();
  const user=String(userId||'').trim().toUpperCase();
  const isBanned=!!banned;
  const payload={
    banned:isBanned,
    banned_reason:isBanned?String(reason||'Suspenso pela administração').slice(0,500):null,
    banned_at:isBanned?new Date().toISOString():null
  };
  const {data,error}=await db.from('tdb_users').update(payload).eq('id',user).select('id,username,banned,banned_reason,banned_at').maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error('Conta não encontrada.');
  if(isBanned)await db.from('tdb_sessions').delete().eq('user_id',user);
  await audit(isBanned?'user_ban':'user_unban',{targetUserId:user,details:{reason:payload.banned_reason}});
  return data;
}

export async function revokeUserSessions(userId){
  await initSupabase();
  if(!isSupabaseReady())throw new Error('Supabase indisponível.');
  const db=getSupabaseClient();
  const user=String(userId||'').trim().toUpperCase();
  const {error}=await db.from('tdb_sessions').delete().eq('user_id',user);
  if(error)throw new Error(error.message);
  await audit('sessions_revoked',{targetUserId:user});
  return true;
}

export async function listErrorLogs(limit=150){
  await initSupabase();
  if(!isSupabaseReady())return[];
  const db=getSupabaseClient();
  const {data,error}=await db.from('tdb_error_logs').select('*').order('created_at',{ascending:false}).limit(Math.max(1,Math.min(300,Number(limit)||150)));
  if(error)throw new Error(error.message);
  return data||[];
}

export async function listAuditLogs(limit=150){
  await initSupabase();
  if(!isSupabaseReady())return[];
  const db=getSupabaseClient();
  const {data,error}=await db.from('tdb_admin_audit_logs').select('*').order('created_at',{ascending:false}).limit(Math.max(1,Math.min(300,Number(limit)||150)));
  if(error)throw new Error(error.message);
  return data||[];
}

export async function listReports(status='all',limit=200){
  await initSupabase();
  if(!isSupabaseReady())return[];
  const db=getSupabaseClient();
  let q=db.from('tdb_reports').select('*').order('created_at',{ascending:false}).limit(Math.max(1,Math.min(300,Number(limit)||200)));
  if(status&&status!=='all')q=q.eq('status',status);
  const {data,error}=await q;
  if(error)throw new Error(error.message);
  return data||[];
}

export async function updateReport(reportId,{status,adminNote}={}){
  await initSupabase();
  if(!isSupabaseReady())throw new Error('Supabase indisponível.');
  const allowed=new Set(['open','reviewing','resolved']);
  const nextStatus=allowed.has(status)?status:'reviewing';
  const db=getSupabaseClient();
  const {data,error}=await db.from('tdb_reports').update({
    status:nextStatus,
    admin_note:String(adminNote||'').slice(0,2000)||null,
    updated_at:new Date().toISOString()
  }).eq('id',Number(reportId)).select('*').maybeSingle();
  if(error)throw new Error(error.message);
  if(!data)throw new Error('Reporte não encontrado.');
  await audit('report_update',{details:{reportId:Number(reportId),status:nextStatus}});
  return data;
}


export async function operations(){
  await initSupabase();

  let maintenance={enabled:false,message:'TDB em manutenção • voltamos em breve'};
  try{
    maintenance=await getSharedValue('app:maintenance',maintenance)||maintenance;
  }catch(err){
    console.warn('[TDB ADM] leitura da manutenção:',err?.message||err);
  }

  if(!isSupabaseReady()){
    return{
      rooms:[],
      maintenance,
      errorVersions:[],
      warnings:['Supabase indisponível: controles de manutenção continuam visíveis, mas dados operacionais podem estar incompletos.']
    };
  }

  const db=getSupabaseClient();
  const [roomsRes,logsRes]=await Promise.all([
    db.from('tdb_rooms').select('code,game,owner_id,status,privacy,data,updated_at').order('updated_at',{ascending:false}).limit(150),
    db.from('tdb_error_logs').select('context,created_at').order('created_at',{ascending:false}).limit(500)
  ]);

  const warnings=[];
  if(roomsRes.error)warnings.push(`Salas: ${roomsRes.error.message}`);
  if(logsRes.error)warnings.push(`Logs: ${logsRes.error.message}`);

  const byVersion=new Map();
  for(const row of logsRes.error?[]:(logsRes.data||[])){
    const v=String(row.context?.version||'sem versão');
    byVersion.set(v,(byVersion.get(v)||0)+1);
  }
  const errorVersions=[...byVersion.entries()]
    .map(([version,count])=>({version,count}))
    .sort((a,b)=>b.count-a.count);

  const rooms=(roomsRes.error?[]:(roomsRes.data||[])).map(row=>({
    code:row.code,
    game:row.game,
    ownerId:row.owner_id,
    status:row.status,
    privacy:row.privacy,
    updated_at:row.updated_at,
    name:row.data?.name||row.code,
    players:row.data?.players?.length||0,
    spectators:row.data?.spectators?.length||0,
    emptyExpiresAt:row.data?.emptyExpiresAt||null
  }));

  return{rooms,maintenance,errorVersions,warnings};
}

export async function setMaintenance(enabled,message=''){
  await initSupabase();
  if(process.env.VERCEL&&!isSupabaseReady()){
    throw new Error('Supabase indisponível. Retome/conecte o projeto antes de alterar o modo manutenção.');
  }

  const value={
    enabled:!!enabled,
    message:String(message||'TDB em manutenção • voltamos em breve').trim().slice(0,240)||'TDB em manutenção • voltamos em breve',
    updatedAt:Date.now(),
    source:'admin'
  };

  await setSharedValue('app:maintenance',value);

  // Confirmação com pequenas tentativas para evitar falso erro após escrita no Supabase.
  let stored=null;
  for(let attempt=0;attempt<3;attempt++){
    try{stored=await getSharedValue('app:maintenance',null)}catch{}
    if(stored&&!!stored.enabled===value.enabled)break;
    await new Promise(resolve=>setTimeout(resolve,90*(attempt+1)));
  }

  if(!stored||!!stored.enabled!==value.enabled){
    throw new Error('A manutenção foi enviada, mas o servidor não conseguiu confirmar o novo estado.');
  }

  try{await audit(value.enabled?'maintenance_on':'maintenance_off',{details:stored})}
  catch(err){console.warn('[TDB ADM] auditoria de manutenção:',err?.message||err)}

  return stored;
}
