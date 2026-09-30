import * as Auth from './auth-service.js';

export async function requireApiUser(req){
  const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token) throw new Error('Sessão online ausente.');
  const user=await Auth.session(token);
  if(!user) throw new Error('Sessão online inválida.');
  return user;
}

export function sendApiError(res,err,status=400){
  const message=err?.message||'Erro no servidor.';
  const authError=/sessão/i.test(message);
  res.status(authError?401:status).json({ok:false,error:message});
}
