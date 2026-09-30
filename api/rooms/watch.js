import { getRoomPrivate,setRoomPrivate,backendStatus } from '../../server/realtime-store.js';
import { requireApiUser,sendApiError } from '../../server/api-auth.js';

function publicRoom(room){
  const copy=structuredClone(room);
  copy.hasPassword=!!copy.password;
  delete copy.password;
  return copy;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const [user,status]=await Promise.all([requireApiUser(req),backendStatus()]);
    if(status.production&&!status.redis) throw new Error('Redis não configurado.');

    const code=String(req.body?.code||'').toUpperCase();
    const room=await getRoomPrivate(code);
    if(!room) throw new Error('Sala não encontrada.');
    if(room.status!=='playing') throw new Error('A partida ainda não começou.');

    room.spectators=room.spectators||[];
    if(!room.spectators.some(s=>s.id===user.id)){
      room.spectators.push({id:user.id,username:user.username,avatar:user.avatar||null});
    }
    await setRoomPrivate(room);
    res.json({ok:true,room:publicRoom(room)});
  }catch(err){sendApiError(res,err)}
}
