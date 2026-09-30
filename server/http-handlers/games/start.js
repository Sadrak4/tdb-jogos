import { getRoomPrivate,setRoomPrivate,backendStatus } from '../../realtime-store.js';
import * as Games from '../../game-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const [user,status]=await Promise.all([requireApiUser(req),backendStatus()]);
    if(status.production&&!status.supabase) throw new Error('Supabase não configurado. O multiplayer não pode iniciar.');

    const code=String(req.body?.roomCode||'').toUpperCase();
    const room=await getRoomPrivate(code);
    if(!room) throw new Error('Sala não encontrada.');
    if(room.ownerId!==user.id) throw new Error('Somente o host pode iniciar.');

    const required=room.game==='truco'?Number(room.trucoSeats||4):room.game==='chess'?2:1;
    if((room.players||[]).length<required) throw new Error(`A sala precisa de ${required} jogador(es).`);
    if((room.players||[]).some(p=>p.connection==='reconnecting')) throw new Error('Aguarde todos os jogadores reconectarem antes de iniciar.');

    room.status='playing';
    await setRoomPrivate(room);

    const state=await Games.startGame(room);
    res.json({
      ok:true,
      room,
      state:Games.viewFor(state,user.id,'player'),
      serverTime:Date.now()
    });
  }catch(err){sendApiError(res,err)}
}
