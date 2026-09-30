import * as Auth from '../../server/auth-service.js';

export default async function handler(req,res){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const user=await Auth.session(token);
  if(!user) return res.status(401).json({error:'Sessão inválida'});
  res.json({user});
}
