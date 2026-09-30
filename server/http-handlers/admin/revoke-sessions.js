import * as Admin from '../../admin-service.js';import { requireAdmin,sendAdminError } from '../../admin-auth.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});try{await requireAdmin(req);await Admin.revokeUserSessions(req.body?.userId);res.json({ok:true})}catch(err){sendAdminError(res,err)}}
