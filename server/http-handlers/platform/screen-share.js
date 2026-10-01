import * as Screen from '../../screen-share-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

export default async function handler(req,res){
  try{
    const user=await requireApiUser(req);
    if(req.method==='GET'){
      const state=await Screen.state(req.query?.code,user);
      res.setHeader('Cache-Control','no-store, max-age=0');
      return res.json({ok:true,state,iceServers:Screen.iceServers(),serverTime:Date.now()});
    }
    if(req.method==='POST'){
      const state=await Screen.action(req.body?.code,user,req.body?.action||{});
      return res.json({ok:true,state,iceServers:Screen.iceServers(),serverTime:Date.now()});
    }
    return res.status(405).json({error:'Método inválido'});
  }catch(err){sendApiError(res,err)}
}
