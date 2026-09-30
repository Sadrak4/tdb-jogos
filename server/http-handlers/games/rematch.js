import * as Games from '../../game-service.js';
import { getRoomPrivate } from '../../realtime-store.js';
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

    const state=await Games.rematchGame(code,user.id);
    const room=await getRoomPrivate(code);

    res.json({
      ok:true,
      room:publicRoom(room),
      state:Games.viewFor(state,user.id,'player'),
      serverTime:Date.now()
    });
  }catch(err){sendApiError(res,err)}
}
