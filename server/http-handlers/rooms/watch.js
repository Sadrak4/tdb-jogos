import { getRoomPrivate,setRoomPrivate,backendStatus } from '../../realtime-store.js';
import { getGame,isTerminal } from '../../game-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';
import { areFriends,hasValidRoomInvite } from '../../social-service.js';

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
    if(status.production&&!status.supabase) throw new Error('Supabase não configurado.');

    const code=String(req.body?.code||'').toUpperCase();
    const room=await getRoomPrivate(code);
    if(!room) throw new Error('Sala não encontrada.');
    if(room.game==='blackjack') return res.status(503).json({ok:false,error:'Blackjack está em manutenção temporária.',code:'GAME_MAINTENANCE'});
    if(room.game==='pool'&&room.poolAllowSpectators===false) throw new Error('O host desativou espectadores nesta sala.');
    const gameState=await getGame(code);
    // O estado oficial da partida é a fonte da verdade. Um status `playing`
    // sem game ativo é uma sala fantasma e não pode ser transformado em "ao vivo".
    const live=!!(gameState && !isTerminal(gameState));
    if(!live){
      if(room.status==='playing'){
        room.status='open';delete room.startedAt;delete room.finishedAt;
        await setRoomPrivate(room);
      }
      throw new Error('A partida ainda não começou.');
    }
    if(room.status!=='playing'){room.status='playing';room.startedAt=room.startedAt||Date.now();await setRoomPrivate(room);}
    if(room.privacy==='private'&&!(room.players||[]).some(p=>p.id===user.id)) throw new Error('Sala privada: entre como jogador para assistir.');
    if(room.privacy==='friends'&&room.ownerId&&room.ownerId!==user.id&&!(await areFriends(room.ownerId,user.id))) throw new Error('Somente amigos do host podem assistir.');
    if(room.privacy==='invite'&&room.ownerId!==user.id&&!(await hasValidRoomInvite(user.id,room.code))) throw new Error('Somente convidados podem assistir.');

    room.spectators=room.spectators||[];
    if(!room.spectators.some(s=>s.id===user.id)){
      room.spectators.push({id:user.id,username:user.username,avatar:user.avatar||null,avatarImage:user.avatarImage||null});
    }
    await setRoomPrivate(room);
    res.json({ok:true,room:publicRoom(room)});
  }catch(err){sendApiError(res,err)}
}
