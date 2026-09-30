import * as Auth from '../../auth-service.js';
import { snapshot } from '../../realtime-store.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método inválido'});
  try{
    const user=await requireApiUser(req);
    const [friends,snap]=await Promise.all([Auth.listFriends(user.id),snapshot()]);
    const result=friends.map(friend=>{
      const p=snap.presence?.[friend.id];
      let status='Offline';
      if(p?.status==='playing') status=`Jogando ${p.game||''}`.trim();
      else if(p?.status==='watching') status='Assistindo';
      else if(p?.status==='listening') status='No TDB Music';
      else if(p && Date.now()-(p.updatedAt||0)<90000) status='Online';
      return {...friend,status};
    });
    res.setHeader('Cache-Control','no-store, max-age=0');
    res.json({ok:true,friends:result});
  }catch(err){sendApiError(res,err)}
}
