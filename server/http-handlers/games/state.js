import * as Games from '../../game-service.js';
import { getRoomPrivate } from '../../realtime-store.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';
import { heartbeat } from '../../maintenance-service.js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const code=String(req.query?.roomCode||'').toUpperCase();
    const requestedRole=req.query?.role==='spectator'?'spectator':'player';
    const room=await getRoomPrivate(code);
    if(!room) return res.status(404).json({ok:false,error:'Sala não encontrada.'});

    const isPlayer=(room.players||[]).some(p=>p.id===user.id);
    const isSpectator=(room.spectators||[]).some(p=>p.id===user.id);
    if(requestedRole==='player'&&!isPlayer) return res.status(403).json({ok:false,error:'Você não é jogador desta partida.'});
    if(requestedRole==='spectator'&&!isPlayer&&!isSpectator) return res.status(403).json({ok:false,error:'Entre como espectador antes de acompanhar esta partida.'});
    if(requestedRole==='spectator'&&room.game==='pool'&&room.poolAllowSpectators===false&&!isPlayer) return res.status(403).json({ok:false,error:'O host desativou espectadores nesta sala.'});

    const role=requestedRole==='spectator'?'spectator':'player';
    await heartbeat(user,{status:role==='spectator'?'watching':'playing',roomCode:code,game:room.game});

    const state=await Games.refreshGame(code);
    if(!state) return res.status(404).json({ok:false,error:'Partida ainda não iniciada.'});

    res.setHeader('Cache-Control','no-store, max-age=0');
    res.json({ok:true,state:Games.viewFor(state,user.id,role),serverTime:Date.now()});
  }catch(err){sendApiError(res,err)}
}
