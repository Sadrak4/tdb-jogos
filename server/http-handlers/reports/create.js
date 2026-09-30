import { requireApiUser,sendApiError } from '../../api-auth.js';import { createReport } from '../../report-service.js';
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req);const report=await createReport(user,req.body||{});res.json({ok:true,report})}catch(err){sendApiError(res,err)}}
