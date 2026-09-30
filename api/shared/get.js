import { getSharedValue,getRoomPrivate } from '../../server/realtime-store.js';
import { requireApiUser,sendApiError } from '../../server/api-auth.js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const key=String(req.query?.key||'');
    if(!key.startsWith('music:')) throw new Error('Chave compartilhada inválida.');
    const code=key.slice(6);
    const room=await getRoomPrivate(code);
    if(!room) throw new Error('Sala não encontrada.');
    if(!(room.players||[]).some(p=>p.id===user.id)) throw new Error('Você não está nesta sala.');

    const value=await getSharedValue(key,null);
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.json({ok:true,key,value,serverTime:Date.now()});
  }catch(err){sendApiError(res,err)}
}
