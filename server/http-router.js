import health from './http-handlers/health.js';
import publicConfig from './http-handlers/config/public.js';
import profileUpdate from './http-handlers/profile/update.js';
import authRegister from './http-handlers/auth/register.js';
import authLogin from './http-handlers/auth/login.js';
import authSession from './http-handlers/auth/session.js';
import authLogout from './http-handlers/auth/logout.js';

import snapshot from './http-handlers/state/snapshot.js';

import roomUpsert from './http-handlers/rooms/upsert.js';
import roomJoin from './http-handlers/rooms/join.js';
import roomLeave from './http-handlers/rooms/leave.js';
import roomRemove from './http-handlers/rooms/remove.js';
import roomWatch from './http-handlers/rooms/watch.js';

import gameStart from './http-handlers/games/start.js';
import gameState from './http-handlers/games/state.js';
import gameAction from './http-handlers/games/action.js';

import sharedGet from './http-handlers/shared/get.js';
import sharedSet from './http-handlers/shared/set.js';
import presenceSet from './http-handlers/presence/set.js';

import friendsList from './http-handlers/friends/list.js';
import friendsAdd from './http-handlers/friends/add.js';
import friendsRemove from './http-handlers/friends/remove.js';

const ROUTES=new Map([
  ['health',health],
  ['config',publicConfig],
  ['profile/update',profileUpdate],
  ['auth/register',authRegister],
  ['auth/login',authLogin],
  ['auth/session',authSession],
  ['auth/logout',authLogout],
  ['state/snapshot',snapshot],
  ['rooms/upsert',roomUpsert],
  ['rooms/join',roomJoin],
  ['rooms/leave',roomLeave],
  ['rooms/remove',roomRemove],
  ['rooms/watch',roomWatch],
  ['games/start',gameStart],
  ['games/state',gameState],
  ['games/action',gameAction],
  ['shared/get',sharedGet],
  ['shared/set',sharedSet],
  ['presence/set',presenceSet],
  ['friends/list',friendsList],
  ['friends/add',friendsAdd],
  ['friends/remove',friendsRemove]
]);

function normalizeRoute(req,override){
  if(override) return String(override).replace(/^\/+|\/+$/g,'');
  const q=req?.query?.route;
  if(Array.isArray(q)) return q.join('/');
  if(typeof q==='string'&&q) return q.replace(/^\/+|\/+$/g,'');
  try{
    return new URL(req.url,'http://localhost').pathname.replace(/^\/api\/?/,'').replace(/^\/+|\/+$/g,'');
  }catch{return ''}
}

export async function handleHttpApi(req,res,override){
  const route=normalizeRoute(req,override);
  const handler=ROUTES.get(route);
  if(!handler){
    return res.status(404).json({ok:false,error:`API não encontrada: /api/${route}`});
  }
  try{
    return await handler(req,res);
  }catch(err){
    console.error(`[TDB API] ${route}`,err);
    if(!res.headersSent) return res.status(500).json({ok:false,error:err?.message||'Erro interno'});
  }
}

export default handleHttpApi;
