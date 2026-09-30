(function(){
'use strict';
const TOKEN_KEY='tdb_session_token';

async function request(path,options={}){
  const token=localStorage.getItem(TOKEN_KEY);
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  const res=await fetch(path,{...options,headers});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Erro de autenticação.');
  return data;
}
async function register(username,password,avatar=null){
  const data=await request('/api/auth/register',{method:'POST',body:JSON.stringify({username,password,avatar})});
  localStorage.setItem(TOKEN_KEY,data.token);
  return data.user;
}
async function login(username,password){
  const data=await request('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
  localStorage.setItem(TOKEN_KEY,data.token);
  return data.user;
}
async function session(){
  if(!localStorage.getItem(TOKEN_KEY)) return null;
  try{return (await request('/api/auth/session')).user}catch{return null}
}
async function logout(){
  try{await request('/api/auth/logout',{method:'POST'})}catch{}
  localStorage.removeItem(TOKEN_KEY);
}
window.TDBAuthOnline={register,login,session,logout,get token(){return localStorage.getItem(TOKEN_KEY)}};
})();
