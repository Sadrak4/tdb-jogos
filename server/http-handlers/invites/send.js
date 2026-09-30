import { requireApiUser,sendApiError } from '../../api-auth.js';
import { sendRoomInvite } from '../../social-service.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req),invite=await sendRoomInvite(user.id,String(req.body?.friendId||'').toUpperCase(),req.body?.roomCode);res.json({ok:true,invite})}catch(err){sendApiError(res,err)}}
