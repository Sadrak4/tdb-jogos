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
    if(status.production&&!status.redis) throw new Error('Redis não configurado. Configure REDIS_URL na Vercel para usar o multiplayer.');

    const room=structuredClone(req.body?.room||null);
    if(!room?.code) throw new Error('Sala inválida.');

    const previous=await getRoomPrivate(room.code);

    if(!previous){
      if(room.ownerId!==user.id) throw new Error('Somente o criador pode registrar esta sala.');
    }else{
      const isOwner=previous.ownerId===user.id;
      const isMember=(previous.players||[]).some(p=>p.id===user.id);
      if(!isOwner&&!isMember) throw new Error('Você não pertence a esta sala.');

      if(!isOwner){
        // Members may only move a music room into playing/listening state.
        const memberStatus=(previous.game==='music'&&room.status==='playing')?'playing':previous.status;
        room.ownerId=previous.ownerId;
        room.owner=previous.owner;
        room.name=previous.name;
        room.players=previous.players;
        room.spectators=previous.spectators||[];
        room.privacy=previous.privacy;
        room.password=previous.password;
        room.createdAt=previous.createdAt;
        room.status=memberStatus;
      }else{
        if(previous.password&&!room.password) room.password=previous.password;
        if(previous.privacy==='private') room.privacy='private';
      }
    }

    await setRoomPrivate(room);
    res.json({ok:true,room:publicRoom(room)});
  }catch(err){sendApiError(res,err)}
}
