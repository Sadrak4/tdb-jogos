import * as Platform from '../../platform-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';
export default async function handler(req,res){
  try{const user=await requireApiUser(req);if(req.method==='GET')return res.json({ok:true,profile:await Platform.musicProfile(user)});if(req.method==='POST')return res.json({ok:true,...await Platform.musicProfileAction(user,req.body?.action||{})});return res.status(405).json({error:'Método inválido'})}catch(err){sendApiError(res,err)}
}
