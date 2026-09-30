import { initSupabase,isSupabaseReady,getSupabaseClient } from './realtime-store.js';
const RULES={
  'auth/register':{limit:6,windowMs:10*60*1000},'auth/login':{limit:30,windowMs:5*60*1000},
  'rooms/upsert':{limit:20,windowMs:60*1000},'rooms/join':{limit:40,windowMs:60*1000},
  'games/start':{limit:12,windowMs:60*1000},'games/action':{limit:180,windowMs:60*1000},
  'music/action':{limit:120,windowMs:60*1000},'friends/add':{limit:20,windowMs:5*60*1000},
  'friends/respond':{limit:30,windowMs:5*60*1000},'invites/send':{limit:30,windowMs:5*60*1000},
  'users/search':{limit:60,windowMs:60*1000},'logs/client':{limit:20,windowMs:60*1000}
};
function identity(req){const ip=String(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');return token?`t:${token.slice(0,16)}`:`ip:${ip}`}
export async function enforceRateLimit(req,route){const rule=RULES[route];if(!rule)return{ok:true};await initSupabase();if(!isSupabaseReady())return{ok:true};const db=getSupabaseClient(),key=`${route}:${identity(req)}`,now=Date.now();const {data,error}=await db.from('tdb_rate_limits').select('*').eq('key',key).maybeSingle();if(error)return{ok:true};const started=data?new Date(data.window_started_at).getTime():0,reset=!data||now-started>=rule.windowMs,count=reset?1:Number(data.count||0)+1,windowStartedAt=new Date(reset?now:started).toISOString();await db.from('tdb_rate_limits').upsert({key,window_started_at:windowStartedAt,count,updated_at:new Date(now).toISOString()},{onConflict:'key'});if(count>rule.limit)return{ok:false,retryAfterMs:Math.max(1000,rule.windowMs-(now-(reset?now:started)))};return{ok:true}}
