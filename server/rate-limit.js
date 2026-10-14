import { createHash } from 'node:crypto';
import { initSupabase,isSupabaseReady,getSupabaseClient,runSupabaseQuery } from './realtime-store.js';
const RULES={
  'discover':{limit:90,windowMs:60*1000},
  'hub':{limit:210,windowMs:60*1000},
  'auth/register':{limit:6,windowMs:10*60*1000},'auth/login':{limit:30,windowMs:5*60*1000},
  'rooms/upsert':{limit:20,windowMs:60*1000},'rooms/join':{limit:40,windowMs:60*1000},
  'games/start':{limit:12,windowMs:60*1000},'games/action':{limit:180,windowMs:60*1000},
  'music/action':{limit:120,windowMs:60*1000},'friends/add':{limit:20,windowMs:5*60*1000},
  'friends/respond':{limit:30,windowMs:5*60*1000},'invites/send':{limit:30,windowMs:5*60*1000},
  'users/search':{limit:60,windowMs:60*1000},'logs/client':{limit:20,windowMs:60*1000},
  'reports/create':{limit:8,windowMs:10*60*1000},'admin/login':{limit:10,windowMs:10*60*1000},
  'admin/users':{limit:120,windowMs:60*1000},'admin/reset-password':{limit:20,windowMs:10*60*1000},
  'admin/ban':{limit:30,windowMs:10*60*1000},'admin/revoke-sessions':{limit:30,windowMs:10*60*1000},
  'admin/logs':{limit:120,windowMs:60*1000},'admin/reports':{limit:120,windowMs:60*1000}
};
function identity(req){const ip=String(req.headers?.['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');return token?`t:${createHash('sha256').update(token).digest('hex').slice(0,24)}`:`ip:${ip}`}
const localLimits=new Map();
function localCheck(key,limit,windowMs){
  const now=Date.now(),last=localLimits.get(key);
  const reset=!last||now-last.started>=windowMs;
  const value=reset?{started:now,count:1}:{started:last.started,count:last.count+1};
  localLimits.set(key,value);
  if(localLimits.size>4000){for(const [k,v] of localLimits)if(now-v.started>windowMs)localLimits.delete(k)}
  return value.count>limit?{ok:false,retryAfterMs:windowMs-(now-value.started)}:{ok:true};
}
export async function enforceRateLimit(req,route){
  const rule=RULES[route];if(!rule)return{ok:true};
  const type=String(req.method||'GET').toUpperCase();
  const action=req.body?.action?.type||'';
  // Polling (read-only GET, signaling pull, heartbeat) gets a local short-lived
  // limiter. Never write a tdb_rate_limits row on each 2-second snapshot.
  if(route==='discover'&&type==='GET')return localCheck(`${route}:${identity(req)}`,rule.limit,rule.windowMs);
  if(route==='hub'&&(type==='GET'||(type==='POST'&&req.body?.op==='action'&&['signal:pull','heartbeat','screen:heartbeat'].includes(action)))){
    return localCheck(`${route}:${identity(req)}`,240,60000);
  }
  try{
    await initSupabase();if(!isSupabaseReady())return{ok:true};
    const db=getSupabaseClient(),key=`${route}:${identity(req)}`,now=Date.now();
    const {data:result,error:rpcError}=await runSupabaseQuery(db.rpc('tdb_rate_consume',{
      p_key:key,p_window_ms:rule.windowMs,p_limit:rule.limit
    }),'Controle de frequência atômico',2500);
    if(!rpcError){
      return result?.allowed===false?{ok:false,retryAfterMs:Math.max(1000,Number(result.retry_after_ms)||1000)}:{ok:true};
    }
    // Compatibilidade durante instalação: manter proteção antiga. Após aplicar
    // a migração 8.1.4, a rota sensível executa apenas uma chamada ao banco.
    if(!['PGRST202','42883'].includes(rpcError.code))throw new Error(rpcError.message);
    const {data,error}=await runSupabaseQuery(db.from('tdb_rate_limits').select('*').eq('key',key).maybeSingle(),'Rate limit',2500);
    if(error)return{ok:true};
    const started=data?new Date(data.window_started_at).getTime():0,reset=!data||now-started>=rule.windowMs,count=reset?1:Number(data.count||0)+1,windowStartedAt=new Date(reset?now:started).toISOString();
    await runSupabaseQuery(db.from('tdb_rate_limits').upsert({key,window_started_at:windowStartedAt,count,updated_at:new Date(now).toISOString()},{onConflict:'key'}),'Rate limit',2500);
    if(count>rule.limit)return{ok:false,retryAfterMs:Math.max(1000,rule.windowMs-(now-(reset?now:started)))};
    return{ok:true};
  }catch(err){
    // Rate limit é proteção auxiliar. Se o banco estiver lento, não deve travar
    // login, entrada em sala nem ações da partida.
    console.warn('[TDB rate limit]',err?.message||err);
    return localCheck(`${route}:${identity(req)}:fallback`,rule.limit,rule.windowMs);
  }
}

