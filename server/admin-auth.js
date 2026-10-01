import * as Admin from './admin-service.js';
export async function requireAdmin(req){
  const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)throw new Error('Sessão de administrador ausente.');
  const admin=await Admin.adminSession(token);
  if(!admin)throw new Error('Sessão de administrador inválida.');
  return admin;
}
export function sendAdminError(res,err,status=400){
  const message=err?.message||'Erro administrativo.';
  const auth=/sessão de administrador/i.test(message);
  return res.status(auth?401:status).json({ok:false,error:message});
}
