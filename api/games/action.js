import * as Games from '../../server/game-service.js';
import { requireApiUser,sendApiError } from '../../server/api-auth.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const code=String(req.body?.roomCode||'').toUpperCase();
    const state=await Games.applyAction(code,user.id,req.body?.action||{});
    res.json({
      ok:true,
      state:Games.viewFor(state,user.id,'player'),
      serverTime:Date.now()
    });
  }catch(err){sendApiError(res,err)}
}
