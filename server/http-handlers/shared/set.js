import { getSharedValue,setSharedValue,getRoomPrivate,backendStatus } from '../../realtime-store.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const [user,status]=await Promise.all([requireApiUser(req),backendStatus()]);
    if(status.production&&!status.redis) throw new Error('Redis não configurado. TDB Music online indisponível.');

    const key=String(req.body?.key||'');
    if(!key.startsWith('music:')) throw new Error('Chave compartilhada inválida.');
    const code=key.slice(6);
    const room=await getRoomPrivate(code);
    if(!room) throw new Error('Sala não encontrada.');
    if(!(room.players||[]).some(p=>p.id===user.id)) throw new Error('Você não está nesta sala.');

    await setSharedValue(key,req.body?.value);
    res.json({ok:true,key,value:req.body?.value,serverTime:Date.now()});
  }catch(err){sendApiError(res,err)}
}
