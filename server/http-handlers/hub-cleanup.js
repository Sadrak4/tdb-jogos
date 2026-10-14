import {timingSafeEqual} from 'node:crypto';
import {cleanupExpired} from '../hub-service.js';
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Método inválido.'});
  const expected=String(process.env.CRON_SECRET||'');
  const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');
  const a=Buffer.from(expected),b=Buffer.from(token);
  if(!expected||a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({ok:false,error:'Cron não autorizado.'});
  try{return res.status(200).json({ok:true,...await cleanupExpired(200)})}
  catch(err){return res.status(503).json({ok:false,error:err.message||'Limpeza indisponível.'})}
}
