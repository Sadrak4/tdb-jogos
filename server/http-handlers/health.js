import { backendStatus } from '../realtime-store.js';

export default async function handler(_req,res){
  const status=await backendStatus();
  res.status(200).json({
    ok:true,
    app:'TDB JOGOS',
    version:'5.4.0',
    realtime:'supabase-realtime+http-fallback',
    supabase:status.supabase,
    configured:status.configured,
    schemaReady:status.schemaReady,
    storage:status.storage,
    readyForMultiplayer:status.readyForMultiplayer,
    production:status.production,
    error:status.readyForMultiplayer?null:status.error
  });
}
