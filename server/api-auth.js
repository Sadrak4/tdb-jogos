import * as Auth from './auth-service.js';
import { logError } from './error-log.js';
export async function requireApiUser(req){const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw new Error('Sessão online ausente.');const user=await Auth.session(token);if(!user)throw new Error('Sessão online inválida.');return user}
export function sendApiError(res,err,status=400){const message=err?.message||'Erro no servidor.',authError=/sessão/i.test(message),stale=err?.code==='STALE_STATE';logError({route:res?.req?.url||null,message,stack:err?.stack,context:{code:err?.code||null}});res.status(authError?401:stale?409:status).json({ok:false,error:message,code:err?.code||null})}
