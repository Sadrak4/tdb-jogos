import * as Platform from '../../platform-service.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';
function publicRoom(room){const copy=structuredClone(room);copy.hasPassword=!!copy.password;delete copy.password;return copy}
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});
  try{const user=await requireApiUser(req);const room=await Platform.setReady(req.body?.code,user,req.body?.ready);res.json({ok:true,room:publicRoom(room)})}catch(err){sendApiError(res,err)}
}
