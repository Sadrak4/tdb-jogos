import * as Auth from '../../auth-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const updated=await Auth.updateProfile(
      user.id,
      req.body?.username,
      req.body?.avatar||null
    );
    res.json({ok:true,user:updated});
  }catch(err){sendApiError(res,err)}
}
