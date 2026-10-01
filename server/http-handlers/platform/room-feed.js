import * as Platform from '../../platform-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';
export default async function handler(req,res){
  try{
    const user=await requireApiUser(req);
    if(req.method==='GET')return res.json({ok:true,feed:await Platform.roomFeed(req.query?.code,user)});
    if(req.method==='POST'){
      const type=String(req.body?.type||'').toUpperCase();
      if(type==='MESSAGE')return res.json({ok:true,entry:await Platform.sendRoomMessage(req.body?.code,user,req.body?.message)});
      if(type==='REACTION')return res.json({ok:true,entry:await Platform.sendRoomReaction(req.body?.code,user,req.body?.emoji)});
      throw new Error('Ação inválida.');
    }
    return res.status(405).json({error:'Método inválido'});
  }catch(err){sendApiError(res,err)}
}
