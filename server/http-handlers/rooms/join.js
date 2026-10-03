import { getRoomPrivate,setRoomPrivate,backendStatus,applyMutation } from '../../realtime-store.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';
import { heartbeat } from '../../maintenance-service.js';
import { areFriends,hasValidRoomInvite } from '../../social-service.js';
import * as Games from '../../game-service.js';

function publicRoom(room){
  const copy=structuredClone(room);
  copy.hasPassword=!!copy.password;
  delete copy.password;
  return copy;
}
function capacity(room){
  if(room.game==='truco')return Number(room.trucoSeats||4);
  if(room.game==='chess'||room.game==='pool')return 2;
  if(room.game==='blackjack')return 3;
  if(room.game==='music')return Number(room.musicCapacity||20);
  return 5;
}
async function recoverPhantomPlayingRoom(room){
  if(!room||room.status!=='playing'||!['truco','pool','chess'].includes(room.game))return room;
  try{
    const game=await Games.getGame(room.code);
    if(game&&!Games.isTerminal(game))return room;
    // Uma tentativa de iniciar pode ter falhado depois de marcar a sala.
    // Se não existe partida ativa, a sala volta a aceitar jogadores.
    room.status='open';
    delete room.startedAt;
    delete room.finishedAt;
    await setRoomPrivate(room);
  }catch(err){
    console.warn('[TDB room recovery]',err?.message||err);
  }
  return room;
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});
  try{
    const [user,status]=await Promise.all([requireApiUser(req),backendStatus()]);
    if(status.production&&!status.supabase)throw new Error('Supabase não configurado.');

    const {code,password}=req.body||{};
    let room=await getRoomPrivate(String(code||'').toUpperCase());
    if(!room)return res.status(404).json({ok:false,error:'Sala não encontrada.'});
    if(room.game==='blackjack')return res.status(503).json({ok:false,error:'Blackjack está em manutenção temporária.',code:'GAME_MAINTENANCE'});
    if(room.emptyExpiresAt&&Date.now()>=Number(room.emptyExpiresAt)){
      await applyMutation({type:'room:remove',code:room.code});
      return res.status(404).json({ok:false,error:'Essa sala expirou.'});
    }

    room=await recoverPhantomPlayingRoom(room);
    const alreadyPlayer=(room.players||[]).some(p=>p.id===user.id);
    if(!['music','blackjack'].includes(room.game)&&room.status!=='open'&&!alreadyPlayer){
      return res.status(409).json({ok:false,error:'A partida já está em andamento.'});
    }
    if(room.privacy==='private'&&String(room.password||'')!==String(password||''))return res.status(403).json({ok:false,error:'Senha incorreta.'});
    if(room.privacy==='friends'&&room.ownerId&&room.ownerId!==user.id&&!(await areFriends(room.ownerId,user.id)))return res.status(403).json({ok:false,error:'Esta sala aceita somente amigos do host.'});
    if(room.privacy==='invite'&&room.ownerId!==user.id&&!(await hasValidRoomInvite(user.id,room.code)))return res.status(403).json({ok:false,error:'Esta sala aceita somente convidados.'});

    room.players=room.players||[];
    let player=room.players.find(p=>p.id===user.id);
    const now=Date.now();
    if(!player){
      if(room.players.length>=capacity(room))return res.status(409).json({ok:false,error:'Sala cheia.'});
      const wasEmpty=room.players.length===0;
      player={id:user.id,username:user.username,avatar:user.avatar||null,avatarImage:user.avatarImage||null,connection:'online',lastSeenAt:now};
      room.players.push(player);
      if(wasEmpty){
        room.ownerId=user.id;room.owner=user.username;room.status='open';
        delete room.emptySince;delete room.emptyExpiresAt;delete room.finishedAt;delete room.startedAt;
      }
    }else{
      player.username=user.username;player.avatar=user.avatar||player.avatar||null;player.avatarImage=user.avatarImage||player.avatarImage||null;
      player.connection='online';player.lastSeenAt=now;
      delete player.disconnectedAt;delete player.reconnectUntil;delete room.emptySince;delete room.emptyExpiresAt;
    }

    await setRoomPrivate(room);
    // Presença não é parte da transação de entrada. Se ela falhar, o jogador
    // continua dentro da sala e o próximo heartbeat corrige o status.
    heartbeat(user,{status:room.game==='music'?'listening':room.status==='playing'?'playing':'room',roomCode:room.code,game:room.game})
      .catch(err=>console.warn('[TDB join heartbeat]',err?.message||err));

    return res.json({ok:true,room:publicRoom(room)});
  }catch(err){sendApiError(res,err)}
}
