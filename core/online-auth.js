(function(){
'use strict';
const TOKEN_KEY='tdb_session_token';

async function request(path,options={}){
  const token=localStorage.getItem(TOKEN_KEY);
  const {timeoutMs=9000,...fetchOptions}=options;
  const headers={'Content-Type':'application/json',...(fetchOptions.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  const controller=new AbortController();
  const timer=Number(timeoutMs)>0?setTimeout(()=>controller.abort(),Number(timeoutMs)):null;
  let res;
  try{
    res=await fetch(path,{...fetchOptions,headers,signal:controller.signal});
  }catch(err){
    if(controller.signal.aborted){const e=new Error('O servidor demorou para responder.');e.code='REQUEST_TIMEOUT';e.status=408;throw e}
    throw err;
  }finally{if(timer)clearTimeout(timer)}
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const err=new Error(data.error||'Erro de autenticação.');err.status=res.status;err.code=data.code||null;throw err}
  return data;
}
async function register(username,password,avatar=null){
  const data=await request('/api/auth/register',{method:'POST',body:JSON.stringify({username,password,avatar}),timeoutMs:12000});
  localStorage.setItem(TOKEN_KEY,data.token);
  return data.user;
}
async function login(username,password){
  const data=await request('/api/auth/login',{method:'POST',body:JSON.stringify({username,password}),timeoutMs:12000});
  localStorage.setItem(TOKEN_KEY,data.token);
  return data.user;
}
async function session(){
  if(!localStorage.getItem(TOKEN_KEY)) return null;
  try{
    window.__TDB_AUTH_TRANSIENT_ERROR__=null;
    return (await request('/api/auth/session',{timeoutMs:9000})).user;
  }catch(err){
    if(err?.status===401){localStorage.removeItem(TOKEN_KEY);return null}
    // Não apaga uma sessão válida só porque o Vercel/Supabase demorou.
    window.__TDB_AUTH_TRANSIENT_ERROR__=err;
    console.warn('[TDB auth] sessão não pôde ser validada agora:',err?.message||err);
    return null;
  }
}
async function logout(){
  try{await request('/api/auth/logout',{method:'POST',timeoutMs:7000})}catch{}
  localStorage.removeItem(TOKEN_KEY);
}
window.TDBAuthOnline={
  register,
  login,
  session,
  logout,
  get token(){return localStorage.getItem(TOKEN_KEY)},
  get hasToken(){return !!localStorage.getItem(TOKEN_KEY)}
};
})();
