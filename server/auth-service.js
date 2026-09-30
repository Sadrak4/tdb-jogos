import crypto from 'crypto';
import { getSharedValue,setSharedValue } from './realtime-store.js';

function usersKey(){return 'auth:users'}
function sessionsKey(){return 'auth:sessions'}
function normalize(u){return String(u||'').trim().toLowerCase()}
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(String(password),salt,64).toString('hex');
  return {salt,hash};
}
function safeUser(u){return {id:u.id,username:u.username,avatar:u.avatar||null,createdAt:u.createdAt}}
export async function register(username,password,avatar=null){
  username=String(username||'').trim();
  if(username.length<3) throw new Error('Usuário precisa de pelo menos 3 caracteres.');
  if(String(password||'').length<4) throw new Error('Senha precisa de pelo menos 4 caracteres.');
  const users=await getSharedValue(usersKey(),[]);
  if(users.some(u=>normalize(u.username)===normalize(username))) throw new Error('Usuário já existe.');
  const hp=hashPassword(password);
  const user={id:`TDB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,username,avatar,salt:hp.salt,passwordHash:hp.hash,createdAt:Date.now()};
  users.push(user);await setSharedValue(usersKey(),users);
  return safeUser(user);
}
export async function login(username,password){
  const users=await getSharedValue(usersKey(),[]);
  const user=users.find(u=>normalize(u.username)===normalize(username));
  if(!user) throw new Error('Usuário ou senha inválidos.');
  const hp=hashPassword(password,user.salt);
  if(!crypto.timingSafeEqual(Buffer.from(hp.hash,'hex'),Buffer.from(user.passwordHash,'hex'))) throw new Error('Usuário ou senha inválidos.');
  const sessions=await getSharedValue(sessionsKey(),{});
  const token=crypto.randomBytes(32).toString('hex');
  sessions[token]={userId:user.id,createdAt:Date.now()};
  await setSharedValue(sessionsKey(),sessions);
  return {user:safeUser(user),token};
}
export async function session(token){
  if(!token) return null;
  const sessions=await getSharedValue(sessionsKey(),{});
  const entry=sessions[token];if(!entry) return null;
  const users=await getSharedValue(usersKey(),[]);
  const user=users.find(u=>u.id===entry.userId);
  return user?safeUser(user):null;
}
export async function logout(token){
  const sessions=await getSharedValue(sessionsKey(),{});
  delete sessions[token];await setSharedValue(sessionsKey(),sessions);
}
