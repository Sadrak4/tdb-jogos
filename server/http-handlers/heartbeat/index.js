import { requireApiUser,sendApiError } from '../../api-auth.js';
import { heartbeat } from '../../maintenance-service.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req);res.json(await heartbeat(user,req.body||{}))}catch(err){sendApiError(res,err)}}
