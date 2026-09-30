import { requireApiUser,sendApiError } from '../../api-auth.js';
import { musicAction } from '../../music-service.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req),state=await musicAction(req.body?.roomCode,user,req.body?.action||{});res.json({ok:true,state,serverTime:Date.now()})}catch(err){sendApiError(res,err)}}
