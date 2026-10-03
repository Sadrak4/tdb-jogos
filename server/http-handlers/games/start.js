import { getRoomPrivate,backendStatus } from '../../realtime-store.js';
import * as Games from '../../game-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';
function publicRoom(room){const copy=structuredClone(room);copy.hasPassword=!!copy.password;delete copy.password;return copy}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const [user,status]=await Promise.all([requireApiUser(req),backendStatus()]);
    if(status.production&&!status.supabase) throw new Error('Supabase não configurado. O multiplayer não pode iniciar.');

    const code=String(req.body?.roomCode||'').toUpperCase();
    const room=await getRoomPrivate(code);
    if(!room) throw new Error('Sala não encontrada.');
    if(room.game==='blackjack') return res.status(503).json({ok:false,error:'Blackjack está em manutenção temporária.',code:'GAME_MAINTENANCE'});
    if(room.ownerId!==user.id) throw new Error('Somente o host pode iniciar.');

    const current=await Games.getGame(code);
    if(current && !Games.isTerminal(current) && room.status==='playing'){
      throw new Error('Já existe uma partida em andamento nesta sala.');
    }

    const withPoolBot=room.game==='pool'&&req.body?.withBot===true;
    if(withPoolBot){
      const humans=(room.players||[]).filter(p=>!p.bot&&!String(p.id||'').startsWith('BOT-'));
      if(humans.length!==1||humans[0].id!==user.id) throw new Error('O BOT só pode ser iniciado quando o host estiver sozinho na sala.');
      room.players=[humans[0],{id:`BOT-POOL-${room.code}`,username:'Bot TDB',avatar:'BOT',avatarImage:null,bot:true,connection:'online'}];
      room.poolBotEnabled=true;
    }

    const required=room.game==='truco'?Number(room.trucoSeats||4):['chess','pool'].includes(room.game)?2:1;
    if((room.players||[]).length<required) throw new Error(`A sala precisa de ${required} jogador(es).`);
    if((room.players||[]).some(p=>!p.bot&&p.connection==='reconnecting')) throw new Error('Aguarde todos os jogadores reconectarem antes de iniciar.');

    // Games.startGame só marca a sala como playing depois que o estado oficial
    // foi gravado. Assim uma falha não prende a sala em uma partida inexistente.
    const state=await Games.startGame(room);
    res.json({
      ok:true,
      room:publicRoom(room),
      state:Games.viewFor(state,user.id,'player'),
      serverTime:Date.now()
    });
  }catch(err){sendApiError(res,err)}
}
