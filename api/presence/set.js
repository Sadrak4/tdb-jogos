import { applyMutation,backendStatus } from '../../server/realtime-store.js';
import { requireApiUser,sendApiError } from '../../server/api-auth.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const [user,status]=await Promise.all([requireApiUser(req),backendStatus()]);
    if(status.production&&!status.redis) return res.json({ok:true,skipped:true});

    const message={
      type:'presence:set',
      userId:user.id,
      status:req.body?.status||'online',
      extra:req.body?.extra||{}
    };
    await applyMutation(message);
    res.json({ok:true,presence:message.presence});
  }catch(err){sendApiError(res,err)}
}
