import * as Games from '../../game-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

function publicRoom(room){
  const copy=structuredClone(room);
  copy.hasPassword=!!copy.password;
  delete copy.password;
  return copy;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const code=String(req.body?.roomCode||'').toUpperCase();
    const room=await Games.returnToRoom(code,user.id);
    res.json({ok:true,room:publicRoom(room),serverTime:Date.now()});
  }catch(err){sendApiError(res,err)}
}
