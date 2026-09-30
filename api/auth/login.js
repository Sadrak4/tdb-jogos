import * as Auth from '../../server/auth-service.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{res.json(await Auth.login(req.body?.username,req.body?.password))}
  catch(err){res.status(401).json({error:err.message})}
}
