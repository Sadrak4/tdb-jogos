import { snapshot, backendStatus } from '../../realtime-store.js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método inválido'});
  try{
    const [data,status]=await Promise.all([snapshot(),backendStatus()]);
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.json({ok:true,data,status,serverTime:Date.now()});
  }catch(err){
    res.status(500).json({ok:false,error:err.message});
  }
}
