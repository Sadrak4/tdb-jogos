import { requireApiUser } from '../../api-auth.js';
import { logError } from '../../error-log.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});let user=null;try{user=await requireApiUser(req)}catch{}await logError({level:'error',source:'client',route:req.body?.route||null,userId:user?.id||null,message:req.body?.message||'Erro no cliente',stack:req.body?.stack||null,context:req.body?.context||{}});res.json({ok:true})}
