import { requireApiUser,sendApiError } from '../../api-auth.js';
import { socialSummary } from '../../social-service.js';
export default async function handler(req,res){if(req.method!=='GET')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req),summary=await socialSummary(user.id);res.setHeader('Cache-Control','no-store, max-age=0');res.json({ok:true,...summary})}catch(err){sendApiError(res,err)}}
