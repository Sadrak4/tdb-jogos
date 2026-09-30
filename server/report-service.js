import { initSupabase,isSupabaseReady,getSupabaseClient } from './realtime-store.js';
function clean(v,max){const s=String(v||'').trim();return s.length>max?s.slice(0,max):s}
export async function createReport(user,{category='bug',message='',context={}}={}){
  const text=clean(message,4000);
  if(text.length<8)throw new Error('Descreva o problema com um pouco mais de detalhe.');
  const allowed=new Set(['bug','error','other']);
  await initSupabase();
  if(!isSupabaseReady())throw new Error('Serviço de reportes indisponível.');
  const db=getSupabaseClient();
  const payload={
    user_id:user?.id||null,
    username_snapshot:user?.username||null,
    category:allowed.has(category)?category:'other',
    message:text,
    context:context&&typeof context==='object'?context:{},
    status:'open'
  };
  const {data,error}=await db.from('tdb_reports').insert(payload).select('id,status,created_at').single();
  if(error)throw new Error(error.message);
  return data;
}
