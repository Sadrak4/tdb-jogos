import {requireApiUser} from '../api-auth.js';
import * as Hub from '../hub-service.js';
export default async function handler(req,res){
  try{
    const started=performance.now();
    const reply=(payload)=>{const t=req.tdbTimings||{};res.setHeader?.('Server-Timing',`rate;dur=${(t.rate||0).toFixed(1)},maintenance;dur=${(t.maintenance||0).toFixed(1)},hub;dur=${(performance.now()-started).toFixed(1)}`);return res.json(payload)};
    const user=await requireApiUser(req);
    const input=req.method==='GET'?req.query||{}:req.body||{};
    const op=String(input.op||'');
    if(req.method==='GET'){
      if(op==='list')return reply({ok:true,rooms:await Hub.listRooms(user)});
      if(op==='snapshot')return reply({ok:true,...await Hub.getSnapshot(input.code,user,input.tableId,input.messagesAfter)});
    }else if(req.method==='POST'){
      if(op==='train')return reply({ok:true,...await Hub.startTraining(user,input)});
      if(op==='create')return reply({ok:true,...await Hub.createRoom(user,input)});
      if(op==='join')return reply({ok:true,...await Hub.joinRoom(input.code,user)});
      if(op==='action')return reply({ok:true,...await Hub.act(String(input.code||'').toUpperCase(),user,input.action||{})});
    }
    return res.status(405).json({ok:false,error:'Operação inválida.'});
  }catch(err){return res.status(err.status||(err.code==='STALE_STATE'?409:/sessão/i.test(err.message)?401:400)).json({ok:false,error:err.message||'Erro na sala.'})}
}
