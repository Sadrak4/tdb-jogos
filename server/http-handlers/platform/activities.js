import {getActivities,applyActivityAction} from '../../activity-service.js';
import {requireApiUser,sendApiError} from '../../api-auth.js';
export default async function handler(req,res){
  try{
    const user=await requireApiUser(req);
    if(req.method==='GET')return res.json({ok:true,activities:await getActivities(req.query?.code,user)});
    if(req.method==='POST')return res.json({ok:true,activities:await applyActivityAction(req.body?.code,user,req.body?.action)});
    return res.status(405).json({ok:false,error:'Método inválido.'});
  }catch(err){return sendApiError(res,err)}
}
