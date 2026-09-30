import { requireApiUser,sendApiError } from '../../api-auth.js';
import { searchUsers } from '../../social-service.js';
export default async function handler(req,res){if(req.method!=='GET')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req);res.setHeader('Cache-Control','no-store, max-age=0');res.json({ok:true,users:await searchUsers(user.id,req.query?.q||'')})}catch(err){sendApiError(res,err)}}
