import * as Admin from '../../admin-service.js';
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});
  const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');
  await Admin.logoutAdmin(token);res.json({ok:true});
}
