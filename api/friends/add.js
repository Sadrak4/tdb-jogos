import * as Auth from '../../server/auth-service.js';
import { requireApiUser,sendApiError } from '../../server/api-auth.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const friend=await Auth.addFriend(user.id,String(req.body?.friendId||'').trim().toUpperCase());
    res.json({ok:true,friend:{...friend,status:'Offline'}});
  }catch(err){sendApiError(res,err)}
}
