import { requireAdmin,sendAdminError } from '../../admin-auth.js';
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método inválido'});
  try{const admin=await requireAdmin(req);res.json({ok:true,admin})}catch(err){sendAdminError(res,err)}
}
