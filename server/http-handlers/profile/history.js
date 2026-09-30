import { requireApiUser,sendApiError } from '../../api-auth.js';
import { profileHistory } from '../../stats-service.js';
export default async function handler(req,res){if(req.method!=='GET')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req);res.setHeader('Cache-Control','no-store, max-age=0');res.json({ok:true,...await profileHistory(user.id)})}catch(err){sendApiError(res,err)}}
