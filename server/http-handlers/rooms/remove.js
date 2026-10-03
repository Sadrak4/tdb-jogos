import { getRoomPrivate,applyMutation } from '../../realtime-store.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const code=String(req.body?.code||'').toUpperCase();
    const room=await getRoomPrivate(code);
    if(!room) return res.json({ok:true});
    if(room.ownerId!==user.id) throw new Error('Somente o host pode encerrar a sala.');
    await applyMutation({type:'room:remove',code});
    res.json({ok:true});
  }catch(err){sendApiError(res,err)}
}
