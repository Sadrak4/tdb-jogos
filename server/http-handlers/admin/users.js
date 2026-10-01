import * as Admin from '../../admin-service.js';import { requireAdmin,sendAdminError } from '../../admin-auth.js';
export default async function handler(req,res){if(req.method!=='GET')return res.status(405).json({error:'Método inválido'});try{await requireAdmin(req);res.json({ok:true,users:await Admin.listUsers(req.query?.q||'')})}catch(err){sendAdminError(res,err)}}
