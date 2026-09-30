import * as Auth from '../../server/auth-service.js';
import { backendStatus } from '../../server/realtime-store.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const status=await backendStatus();
    if(status.production&&!status.redis) return res.status(503).json({error:'Configure REDIS_URL na Vercel para usar contas online.'});
    res.json(await Auth.login(req.body?.username,req.body?.password));
  }
  catch(err){res.status(401).json({error:err.message})}
}
