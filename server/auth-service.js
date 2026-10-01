import crypto from 'crypto';
import {
  initSupabase,
  isSupabaseReady,
  getSupabaseClient,
  getSharedValue,
  setSharedValue,
  emitEvent
} from './realtime-store.js';

const SESSION_MS=30*24*60*60*1000;

function normalize(u){return String(u||'').trim().toLowerCase()}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(String(password),salt,64).toString('hex');
  return {salt,hash};
}
function safeUser(u){
  return {
    id:u.id,
    username:u.username,
    avatar:u.avatar||null,
    createdAt:u.created_at?new Date(u.created_at).getTime():(u.createdAt||Date.now())
  };
}
function usersKey(){return 'local:auth:users'}
function sessionsKey(){return 'local:auth:sessions'}
function friendKey(userId){return `local:friends:${userId}`}

export async function register(username,password,avatar=null){
  username=String(username||'').trim();
  if(normalize(username)==='adm') throw new Error('Esse nome de usuário é reservado.');
  if(username.length<3) throw new Error('Usuário precisa de pelo menos 3 caracteres.');
  if(String(password||'').length<4) throw new Error('Senha precisa de pelo menos 4 caracteres.');

  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const usernameNormalized=normalize(username);

    const {data:existing,error:findError}=await db
      .from('tdb_users')
      .select('id')
      .eq('username_normalized',usernameNormalized)
      .maybeSingle();

    if(findError) throw new Error(findError.message);
    if(existing) throw new Error('Usuário já existe.');

    const hp=hashPassword(password);
    const user={
      id:`TDB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      username,
      username_normalized:usernameNormalized,
      avatar,
      salt:hp.salt,
      password_hash:hp.hash
    };

    const {data,error}=await db.from('tdb_users').insert(user).select('*').single();
    if(error){
      if(String(error.code)==='23505') throw new Error('Usuário já existe.');
      throw new Error(error.message);
    }
    return safeUser(data);
  }

  const users=await getSharedValue(usersKey(),[]);
  if(users.some(u=>normalize(u.username)===normalize(username))) throw new Error('Usuário já existe.');
  const hp=hashPassword(password);
  const user={id:`TDB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,username,avatar,salt:hp.salt,passwordHash:hp.hash,createdAt:Date.now()};
  users.push(user);await setSharedValue(usersKey(),users);
  return safeUser(user);
}

export async function login(username,password){
  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {data:user,error}=await db
      .from('tdb_users')
      .select('*')
      .eq('username_normalized',normalize(username))
      .maybeSingle();

    if(error) throw new Error(error.message);
    if(!user) throw new Error('Usuário ou senha inválidos.');
    if(user.banned) throw new Error(`Conta suspensa${user.banned_reason?`: ${user.banned_reason}`:''}.`);

    const hp=hashPassword(password,user.salt);
    const a=Buffer.from(hp.hash,'hex');
    const b=Buffer.from(user.password_hash,'hex');
    if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) throw new Error('Usuário ou senha inválidos.');

    const token=crypto.randomBytes(32).toString('hex');
    const expiresAt=new Date(Date.now()+SESSION_MS).toISOString();

    const {error:sessionError}=await db.from('tdb_sessions').insert({
      token,
      user_id:user.id,
      expires_at:expiresAt
    });
    if(sessionError) throw new Error(sessionError.message);

    return {user:safeUser(user),token};
  }

  const users=await getSharedValue(usersKey(),[]);
  const user=users.find(u=>normalize(u.username)===normalize(username));
  if(!user) throw new Error('Usuário ou senha inválidos.');
  const hp=hashPassword(password,user.salt);
  if(!crypto.timingSafeEqual(Buffer.from(hp.hash,'hex'),Buffer.from(user.passwordHash,'hex'))) throw new Error('Usuário ou senha inválidos.');
  const sessions=await getSharedValue(sessionsKey(),{});
  const token=crypto.randomBytes(32).toString('hex');
  sessions[token]={userId:user.id,createdAt:Date.now(),expiresAt:Date.now()+SESSION_MS};
  await setSharedValue(sessionsKey(),sessions);
  return {user:safeUser(user),token};
}

export async function session(token){
  if(!token) return null;
  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {data:s,error}=await db
      .from('tdb_sessions')
      .select('user_id,expires_at')
      .eq('token',token)
      .maybeSingle();

    if(error) throw new Error(error.message);
    if(!s) return null;

    if(new Date(s.expires_at).getTime()<=Date.now()){
      await db.from('tdb_sessions').delete().eq('token',token);
      return null;
    }

    const {data:user,error:userError}=await db
      .from('tdb_users')
      .select('*')
      .eq('id',s.user_id)
      .maybeSingle();

    if(userError) throw new Error(userError.message);
    if(user?.banned){
      await db.from('tdb_sessions').delete().eq('token',token);
      return null;
    }
    return user?safeUser(user):null;
  }

  const sessions=await getSharedValue(sessionsKey(),{});
  const entry=sessions[token];
  if(!entry || (entry.expiresAt&&entry.expiresAt<=Date.now())) return null;
  const users=await getSharedValue(usersKey(),[]);
  const user=users.find(u=>u.id===entry.userId);
  return user?safeUser(user):null;
}

export async function logout(token){
  if(!token) return;
  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {error}=await db.from('tdb_sessions').delete().eq('token',token);
    if(error) throw new Error(error.message);
    return;
  }

  const sessions=await getSharedValue(sessionsKey(),{});
  delete sessions[token];
  await setSharedValue(sessionsKey(),sessions);
}

export async function findUserById(id){
  const wanted=String(id||'').trim().toUpperCase();
  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {data,error}=await db.from('tdb_users').select('*').eq('id',wanted).maybeSingle();
    if(error) throw new Error(error.message);
    return data?safeUser(data):null;
  }

  const users=await getSharedValue(usersKey(),[]);
  const user=users.find(u=>String(u.id||'').toUpperCase()===wanted);
  return user?safeUser(user):null;
}

export async function listFriends(userId){
  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {data:links,error}=await db
      .from('tdb_friends')
      .select('friend_id')
      .eq('user_id',userId);

    if(error) throw new Error(error.message);
    const ids=(links||[]).map(x=>x.friend_id);
    if(!ids.length) return [];

    const {data:users,error:usersError}=await db
      .from('tdb_users')
      .select('*')
      .in('id',ids);

    if(usersError) throw new Error(usersError.message);
    const byId=new Map((users||[]).map(u=>[u.id,safeUser(u)]));
    return ids.map(id=>byId.get(id)).filter(Boolean);
  }

  const ids=await getSharedValue(friendKey(userId),[]);
  const users=await getSharedValue(usersKey(),[]);
  return ids.map(id=>users.find(u=>u.id===id)).filter(Boolean).map(safeUser);
}

export async function addFriend(userId,friendId){
  if(String(userId)===String(friendId)) throw new Error('Você não pode adicionar a si mesmo.');
  const target=await findUserById(friendId);
  if(!target) throw new Error('ID de jogador não encontrado.');

  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {error}=await db.from('tdb_friends').upsert({
      user_id:userId,
      friend_id:target.id
    },{onConflict:'user_id,friend_id'});
    if(error) throw new Error(error.message);
    await emitEvent('friends',null,'add');
    return target;
  }

  const ids=await getSharedValue(friendKey(userId),[]);
  if(!ids.includes(target.id)){
    ids.push(target.id);
    await setSharedValue(friendKey(userId),ids);
  }
  return target;
}

export async function removeFriend(userId,friendId){
  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const {error}=await db.from('tdb_friends').delete()
      .or(`and(user_id.eq.${userId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userId})`);
    if(error) throw new Error(error.message);
    await emitEvent('friends',null,'remove');
    return true;
  }

  const ids=await getSharedValue(friendKey(userId),[]);
  await setSharedValue(friendKey(userId),ids.filter(id=>id!==friendId));
  return true;
}


export async function updateProfile(userId,username,avatar=null){
  username=String(username||'').trim();
  if(username.length<3) throw new Error('Usuário precisa de pelo menos 3 caracteres.');

  await initSupabase();

  if(isSupabaseReady()){
    const db=getSupabaseClient();
    const usernameNormalized=normalize(username);

    const {data:existing,error:findError}=await db
      .from('tdb_users')
      .select('id')
      .eq('username_normalized',usernameNormalized)
      .neq('id',userId)
      .maybeSingle();

    if(findError) throw new Error(findError.message);
    if(existing) throw new Error('Esse nome já está em uso.');

    const {data,error}=await db
      .from('tdb_users')
      .update({
        username,
        username_normalized:usernameNormalized,
        avatar:avatar||null
      })
      .eq('id',userId)
      .select('*')
      .single();

    if(error){
      if(String(error.code)==='23505') throw new Error('Esse nome já está em uso.');
      throw new Error(error.message);
    }

    await emitEvent('profile',null,'update');
    return safeUser(data);
  }

  const users=await getSharedValue(usersKey(),[]);
  if(users.some(u=>u.id!==userId&&normalize(u.username)===normalize(username))) throw new Error('Esse nome já está em uso.');
  const idx=users.findIndex(u=>u.id===userId);
  if(idx<0) throw new Error('Conta não encontrada.');
  users[idx]={...users[idx],username,avatar};
  await setSharedValue(usersKey(),users);
  return safeUser(users[idx]);
}
