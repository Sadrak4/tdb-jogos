import { requireApiUser,sendApiError } from '../../api-auth.js';
import { respondRoomInvite } from '../../social-service.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req);res.json({ok:true,...await respondRoomInvite(user.id,Number(req.body?.inviteId),!!req.body?.accept)})}catch(err){sendApiError(res,err)}}
