import { requireApiUser,sendApiError } from '../../api-auth.js';
import { sendFriendRequest } from '../../social-service.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req),result=await sendFriendRequest(user.id,req.body?.friendId);res.json({ok:true,...result})}catch(err){sendApiError(res,err)}}
