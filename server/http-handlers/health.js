import { backendStatus } from '../realtime-store.js';

export default async function handler(req,res){
  const status=await backendStatus();
  const adminBypass=!!req?.tdbMaintenanceAdminBypass;
  const readyForMultiplayer=adminBypass?(status.supabase||!status.production):status.readyForMultiplayer;
  const maintenance={...(status.maintenance||{enabled:false}),adminBypass};
  res.status(200).json({
    ok:true,
    app:'TDB',
    version:'7.2.3',
    realtime:'supabase-realtime+http-fallback',
    supabase:status.supabase,
    configured:status.configured,
    schemaReady:status.schemaReady,
    storage:status.storage,
    readyForMultiplayer,
    production:status.production,
    maintenance,
    error:maintenance.enabled&&!adminBypass?null:(readyForMultiplayer?null:status.error)
  });
}
