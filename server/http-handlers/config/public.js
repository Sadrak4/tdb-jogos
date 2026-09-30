import { backendStatus,publicSupabaseConfig } from '../../realtime-store.js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método inválido'});
  const status=await backendStatus();
  const cfg=publicSupabaseConfig();
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.json({
    ok:true,
    supabaseUrl:cfg.url||null,
    supabasePublishableKey:cfg.publishableKey||null,
    realtimeEnabled:!!(status.supabase&&cfg.url&&cfg.publishableKey)
  });
}
