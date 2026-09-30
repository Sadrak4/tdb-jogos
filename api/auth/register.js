import * as Auth from '../../server/auth-service.js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    await Auth.register(req.body?.username,req.body?.password,req.body?.avatar||null);
    res.json(await Auth.login(req.body?.username,req.body?.password));
  }catch(err){res.status(400).json({error:err.message})}
}
