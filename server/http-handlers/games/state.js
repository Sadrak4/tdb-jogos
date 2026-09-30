import * as Games from '../../game-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const code=String(req.query?.roomCode||'').toUpperCase();
    const role=req.query?.role==='spectator'?'spectator':'player';

    const state=await Games.refreshGame(code);
    if(!state) return res.status(404).json({ok:false,error:'Partida ainda não iniciada.'});

    res.setHeader('Cache-Control','no-store, max-age=0');
    res.json({
      ok:true,
      state:Games.viewFor(state,user.id,role),
      serverTime:Date.now()
    });
  }catch(err){sendApiError(res,err)}
}
