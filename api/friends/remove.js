import * as Auth from '../../server/auth-service.js';
import { requireApiUser,sendApiError } from '../../server/api-auth.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    await Auth.removeFriend(user.id,String(req.body?.friendId||''));
    res.json({ok:true});
  }catch(err){sendApiError(res,err)}
}
