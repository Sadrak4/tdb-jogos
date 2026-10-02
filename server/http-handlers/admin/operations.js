import * as Admin from '../../admin-service.js';
import { requireAdmin,sendAdminError } from '../../admin-auth.js';
export default async function handler(req,res){
  try{
    const admin=await requireAdmin(req);
    if(req.method==='GET')return res.json({ok:true,operations:await Admin.operations()});
    if(req.method==='POST')return res.json({ok:true,maintenance:await Admin.setMaintenance(req.body?.enabled,req.body?.message,{reason:req.body?.reason,allowAdminAccess:req.body?.allowAdminAccess!==false,actor:admin?.username||'adm'})});
    return res.status(405).json({error:'Método inválido'});
  }catch(err){sendAdminError(res,err)}
}
