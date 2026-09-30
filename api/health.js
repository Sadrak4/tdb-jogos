import { backendStatus } from '../server/realtime-store.js';

export default async function handler(_req,res){
  const status=await backendStatus();
  res.status(200).json({
    ok:true,
    app:'TDB JOGOS',
    version:'4.2.0',
    realtime:'websocket+http-fallback',
    redis:status.redis,
    readyForMultiplayer:status.readyForMultiplayer,
    production:status.production
  });
}
