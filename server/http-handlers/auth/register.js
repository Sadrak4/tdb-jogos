import * as Auth from '../../auth-service.js';
import { backendStatus } from '../../realtime-store.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const status=await backendStatus();
    if(status.production&&!status.supabase) return res.status(503).json({error:'Configure o Supabase na Vercel e execute SUPABASE-SCHEMA.sql antes de criar contas online.'});
    await Auth.register(req.body?.username,req.body?.password,req.body?.avatar||null);
    res.json(await Auth.login(req.body?.username,req.body?.password));
  }catch(err){res.status(400).json({error:err.message})}
}
