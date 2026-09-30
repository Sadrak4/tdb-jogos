import { getRoomPrivate,setRoomPrivate,applyMutation } from '../../realtime-store.js';
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
    const code=String(req.body?.code||'').toUpperCase();
    const room=await getRoomPrivate(code);
    if(!room) return res.json({ok:true,room:null});

    room.players=(room.players||[]).filter(p=>p.id!==user.id);
    room.spectators=(room.spectators||[]).filter(p=>p.id!==user.id);

    if(room.players.length===0){
      await applyMutation({type:'room:remove',code});
      return res.json({ok:true,room:null});
    }else if(room.ownerId===user.id){
      const next=room.players[0];
      room.ownerId=next.id;
      room.owner=next.username;
    }

    await setRoomPrivate(room);
    res.json({ok:true,room:publicRoom(room)});
  }catch(err){sendApiError(res,err)}
}
