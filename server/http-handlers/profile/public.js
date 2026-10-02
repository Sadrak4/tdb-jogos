import { requireApiUser,sendApiError } from '../../api-auth.js';
import { findUserById } from '../../auth-service.js';
import { profileHistory } from '../../stats-service.js';
import { initSupabase,isSupabaseReady,getSupabaseClient } from '../../realtime-store.js';

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método inválido'});
  try{
    await requireApiUser(req);
    const id=String(req.query?.id||'').trim().toUpperCase();
    const user=await findUserById(id);
    if(!user)return res.status(404).json({ok:false,error:'Jogador não encontrado.'});
    let presence={status:'offline',data:{},updated_at:null};
    await initSupabase();
    if(isSupabaseReady()){
      const db=getSupabaseClient();
      const {data}=await db.from('tdb_presence').select('status,data,updated_at').eq('user_id',id).maybeSingle();
      if(data)presence=data;
    }
    const age=presence.updated_at?Date.now()-new Date(presence.updated_at).getTime():Infinity;
    const status=age<30000?(presence.data?.status||presence.status||'online'):age<90000?'away':'offline';
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.json({ok:true,user,presence:{status,game:presence.data?.game||null,roomCode:presence.data?.roomCode||null},...(await profileHistory(id))});
  }catch(err){sendApiError(res,err)}
}
