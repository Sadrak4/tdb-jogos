import * as Admin from '../../admin-service.js';
import { sendAdminError } from '../../admin-auth.js';
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});
  try{const result=await Admin.loginAdmin(req.body?.username,req.body?.password);res.json({ok:true,...result})}catch(err){sendAdminError(res,err,401)}
}
