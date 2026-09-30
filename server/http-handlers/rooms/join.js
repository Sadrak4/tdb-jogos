import { getRoomPrivate,setRoomPrivate,backendStatus } from '../../realtime-store.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

function publicRoom(room){
  const copy=structuredClone(room);
  copy.hasPassword=!!copy.password;
  delete copy.password;
  return copy;
}
function capacity(room){
  if(room.game==='truco') return Number(room.trucoSeats||4);
  if(room.game==='chess') return 2;
  if(room.game==='music') return Number(room.musicCapacity||20);
  return 5;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const [user,status]=await Promise.all([requireApiUser(req),backendStatus()]);
    if(status.production&&!status.redis) throw new Error('Redis não configurado. Configure REDIS_URL na Vercel para usar salas online.');

    const {code,password}=req.body||{};
    const room=await getRoomPrivate(String(code||'').toUpperCase());
    if(!room) return res.status(404).json({ok:false,error:'Sala não encontrada.'});

    if(room.privacy==='private'&&String(room.password||'')!==String(password||'')){
      return res.status(403).json({ok:false,error:'Senha incorreta.'});
    }

    room.players=room.players||[];
    if(!room.players.some(p=>p.id===user.id)){
      if(room.players.length>=capacity(room)) return res.status(409).json({ok:false,error:'Sala cheia.'});
      room.players.push({
        id:user.id,
        username:user.username,
        avatar:user.avatar||null
      });
    }

    await setRoomPrivate(room);
    res.json({ok:true,room:publicRoom(room)});
  }catch(err){sendApiError(res,err)}
}
