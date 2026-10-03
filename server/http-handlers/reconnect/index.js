import { requireApiUser,sendApiError } from '../../api-auth.js';
import { reconnectUser } from '../../maintenance-service.js';
import * as Games from '../../game-service.js';
export default async function handler(req,res){if(req.method!=='GET')return res.status(405).json({error:'Método inválido'});try{const user=await requireApiUser(req),found=await reconnectUser(user);let state=null;if(found.room?.status==='playing'&&['chess','truco','pool'].includes(found.room.game)){const full=await Games.refreshGame(found.room.code);if(full)state=Games.viewFor(full,user.id,found.role||'player')}res.setHeader('Cache-Control','no-store, max-age=0');res.json({ok:true,...found,state,graceSeconds:90})}catch(err){sendApiError(res,err)}}
