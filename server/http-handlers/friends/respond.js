import { requireApiUser,sendApiError } from '../../api-auth.js';
import { acceptFriendRequest,rejectFriendRequest } from '../../social-service.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req),senderId=String(req.body?.senderId||'').toUpperCase(),accept=!!req.body?.accept;const friend=accept?await acceptFriendRequest(user.id,senderId):(await rejectFriendRequest(user.id,senderId),null);res.json({ok:true,accepted:accept,friend})}catch(err){sendApiError(res,err)}}
