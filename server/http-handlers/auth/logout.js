import * as Auth from '../../auth-service.js';

export default async function handler(req,res){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  await Auth.logout(token);res.json({ok:true});
}
