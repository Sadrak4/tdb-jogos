(function(){
'use strict';
const TOKEN_KEY='tdb_admin_token';
function token(){return localStorage.getItem(TOKEN_KEY)||''}
async function api(path,options={}){
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token())headers.Authorization=`Bearer ${token()}`;
  const res=await fetch(path,{cache:'no-store',...options,headers});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){
    const err=new Error(data.error||`Erro HTTP ${res.status}`);err.status=res.status;
    if(res.status===401&&path!=='/api/admin/login')localStorage.removeItem(TOKEN_KEY);
    throw err;
  }
  return data;
}
async function login(username,password){const r=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username,password})});localStorage.setItem(TOKEN_KEY,r.token);return r.admin}
async function session(){if(!token())return null;try{return(await api('/api/admin/session',{method:'GET'})).admin}catch{return null}}
async function logout(){try{await api('/api/admin/logout',{method:'POST'})}catch{}localStorage.removeItem(TOKEN_KEY)}
async function overview(){return(await api('/api/admin/overview',{method:'GET'})).overview}
async function users(q=''){return(await api(`/api/admin/users?q=${encodeURIComponent(q)}&_=${Date.now()}`,{method:'GET'})).users||[]}
async function resetPassword(userId,newPassword=null){return await api('/api/admin/reset-password',{method:'POST',body:JSON.stringify({userId,newPassword})})}
async function setBan(userId,banned,reason=''){return await api('/api/admin/ban',{method:'POST',body:JSON.stringify({userId,banned,reason})})}
async function revokeSessions(userId){return await api('/api/admin/revoke-sessions',{method:'POST',body:JSON.stringify({userId})})}
async function logs(type='errors'){return(await api(`/api/admin/logs?type=${encodeURIComponent(type)}&_=${Date.now()}`,{method:'GET'})).logs||[]}
async function reports(status='all'){return(await api(`/api/admin/reports?status=${encodeURIComponent(status)}&_=${Date.now()}`,{method:'GET'})).reports||[]}
async function updateReport(reportId,status,adminNote=''){return await api('/api/admin/reports',{method:'POST',body:JSON.stringify({reportId,status,adminNote})})}
window.TDBAdmin={login,session,logout,overview,users,resetPassword,setBan,revokeSessions,logs,reports,updateReport,get hasToken(){return!!token()}};
})();
