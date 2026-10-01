(function(){
'use strict';
const root=()=>document.getElementById('app');
const A=()=>window.TDBAdmin;
let adminState={tab:'overview',users:[],reports:[],logs:[],logType:'errors',reportStatus:'all',operations:{rooms:[],maintenance:{enabled:false},errorVersions:[]}};
function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function fmt(date){try{return new Date(date).toLocaleString('pt-BR')}catch{return'—'}}
function sound(name){window.TDBSound?.play?.(name||'click')}
function adminToast(msg,type='success'){
  let el=document.getElementById('adminToast');
  if(!el){el=document.createElement('div');el.id='adminToast';el.className='toast';document.body.appendChild(el)}
  el.textContent=msg;el.classList.add('show');sound(type==='error'?'error':'success');clearTimeout(window.__adminToast);window.__adminToast=setTimeout(()=>el.classList.remove('show'),2600);
}
function shell(content,active=adminState.tab){
  return `<section class="admin-shell">
    <aside class="admin-sidebar">
      <div class="admin-brand"><img src="assets/logo-transparent.png" alt=""><div><strong>TDB JOGOS</strong><small>Painel administrativo</small></div></div>
      <nav class="admin-nav">
        <button class="${active==='overview'?'active':''}" onclick="TDBAdminUI.openTab('overview')">Visão geral</button>
        <button class="${active==='users'?'active':''}" onclick="TDBAdminUI.openTab('users')">Contas</button>
        <button class="${active==='reports'?'active':''}" onclick="TDBAdminUI.openTab('reports')">Reportes</button>
        <button class="${active==='logs'?'active':''}" onclick="TDBAdminUI.openTab('logs')">Logs</button>
        <button class="${active==='operations'?'active':''}" onclick="TDBAdminUI.openTab('operations')">Operação</button>
      </nav>
      <div class="admin-sidebar-bottom"><button class="btn btn-dark full" onclick="TDBAdminUI.logout()">Sair do ADM</button><button class="link-btn" onclick="TDBAdminUI.backToSite()">Voltar ao site</button></div>
    </aside>
    <main class="admin-main">${content}</main>
  </section>`;
}
async function renderLogin(message=''){
  root().innerHTML=`<section class="admin-login-page"><div class="admin-login-card panel">
    <div class="admin-brand centered"><img src="assets/logo-transparent.png" alt=""><div><strong>TDB JOGOS</strong><small>Administração</small></div></div>
    <h1>Acesso administrativo</h1><p class="muted">Área restrita para gerenciamento de contas, reportes e logs.</p>
    ${message?`<div class="admin-login-error">${esc(message)}</div>`:''}
    <form id="adminLoginForm" class="form-grid">
      <div class="field"><label>Usuário</label><input id="adminUser" autocomplete="username" required></div>
      <div class="field"><label>Senha</label><input id="adminPassword" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary full" type="submit">Entrar no painel</button>
    </form>
    <button class="link-btn admin-back-site" onclick="TDBAdminUI.backToSite()">← Voltar ao TDB JOGOS</button>
  </div></section>`;
  document.getElementById('adminLoginForm').onsubmit=async e=>{
    e.preventDefault();
    const btn=e.submitter; if(btn)btn.disabled=true;
    try{
      await A().login(document.getElementById('adminUser').value,document.getElementById('adminPassword').value);
      sound('success');await openTab('overview');
    }catch(err){sound('error');renderLogin(err.message||'Acesso negado.')}finally{if(btn)btn.disabled=false}
  };
}
async function renderOverview(){
  const o=await A().overview();
  root().innerHTML=shell(`<div class="admin-head"><div><h1>Visão geral</h1><p>Controle operacional do TDB JOGOS.</p></div><span class="admin-secure-badge">● Sessão ADM protegida</span></div>
    <div class="admin-stats">
      <article><span>Contas criadas</span><strong>${Number(o.users||0)}</strong></article>
      <article><span>Usuários online</span><strong>${Number(o.onlineUsers||0)}</strong></article>
      <article><span>Salas abertas</span><strong>${Number(o.openRooms||0)}</strong></article>
      <article><span>Partidas em andamento</span><strong>${Number(o.activeMatches||0)}</strong></article>
      <article><span>Reportes abertos</span><strong>${Number(o.openReports||0)}</strong></article>
      <article><span>Erros nas últimas 24h</span><strong>${Number(o.errors24h||0)}</strong></article>
      <article><span>Manutenção</span><strong>${o.maintenance?.enabled?'ATIVA':'OFF'}</strong></article>
    </div>
    <div class="panel admin-info-panel"><h2>Ações rápidas</h2><div class="admin-quick-actions"><button class="btn btn-secondary" onclick="TDBAdminUI.openTab('users')">Gerenciar contas</button><button class="btn btn-secondary" onclick="TDBAdminUI.openTab('reports')">Ver reportes</button><button class="btn btn-secondary" onclick="TDBAdminUI.openTab('logs')">Abrir logs</button><button class="btn btn-secondary" onclick="TDBAdminUI.openTab('operations')">Operação / manutenção</button></div><p class="muted">Senhas antigas nunca podem ser visualizadas. Em recuperação, o painel redefine a senha e encerra as sessões antigas.</p></div>`,'overview');
}
function userRow(u){
  return `<div class="admin-user-row ${u.banned?'is-banned':''}">
    <div class="avatar">${esc(u.avatar||String(u.username||'?').slice(0,2).toUpperCase())}</div>
    <div class="admin-user-main"><strong>${esc(u.username)}</strong><code>${esc(u.id)}</code><small>Criada em ${fmt(u.created_at)}${u.banned?` • Banida: ${esc(u.banned_reason||'sem motivo')}`:''}</small><small>Versão: ${esc(u.client_version||'—')} • Sessões: ${Number(u.active_sessions||0)} • ${esc(u.current_game||'sem jogo')} ${u.current_room?`• ${esc(u.current_room)}`:''}</small></div>
    <span class="admin-status ${u.banned?'bad':!['offline','away'].includes(u.presence_status)?'good':'warn'}">${u.banned?'BANIDA':esc(String(u.presence_status||'offline').toUpperCase())}</span>
    <div class="admin-user-actions"><button class="btn btn-secondary btn-sm" onclick="TDBAdminUI.resetPassword('${esc(u.id)}')">Recuperar / senha</button><button class="btn ${u.banned?'btn-secondary':'btn-danger'} btn-sm" onclick="TDBAdminUI.toggleBan('${esc(u.id)}',${u.banned?'false':'true'})">${u.banned?'Desbanir':'Banir'}</button><button class="btn btn-dark btn-sm" onclick="TDBAdminUI.revoke('${esc(u.id)}')">Encerrar sessões</button></div>
  </div>`;
}
async function renderUsers(query=''){
  adminState.users=await A().users(query);
  root().innerHTML=shell(`<div class="admin-head"><div><h1>Contas</h1><p>Busca, recuperação, troca de senha, banimento e sessões.</p></div></div>
    <div class="panel admin-search-panel"><div class="admin-search"><input id="adminUserSearch" value="${esc(query)}" placeholder="Buscar por nome ou TDB-ID"><select id="adminUserStatus" class="select" onchange="TDBAdminUI.applyUserFilters()"><option value="all">Todos</option><option value="active">Ativos</option><option value="banned">Banidos</option><option value="online">Online</option><option value="sessions">Com sessão ativa</option></select><button class="btn btn-primary" onclick="TDBAdminUI.searchUsers()">Pesquisar</button><button class="btn btn-dark" onclick="TDBAdminUI.openTab('users')">Limpar</button></div></div>
    <div class="panel admin-list" id="adminUserList">${adminState.users.length?adminState.users.map(userRow).join(''):'<div class="empty-state">Nenhuma conta encontrada.</div>'}</div>`,'users');
  document.getElementById('adminUserSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')searchUsers()});
}
function applyUserFilters(){const v=document.getElementById('adminUserStatus')?.value||'all';let rows=adminState.users||[];if(v==='active')rows=rows.filter(u=>!u.banned);if(v==='banned')rows=rows.filter(u=>u.banned);if(v==='online')rows=rows.filter(u=>!['offline','away'].includes(u.presence_status));if(v==='sessions')rows=rows.filter(u=>Number(u.active_sessions||0)>0);const box=document.getElementById('adminUserList');if(box)box.innerHTML=rows.length?rows.map(userRow).join(''):'<div class="empty-state">Nenhuma conta neste filtro.</div>'}
function reportCard(r){
  const ctx=r.context||{};
  return `<article class="admin-report-card">
    <div class="admin-report-top"><div><span class="admin-report-category">${esc(String(r.category||'bug').toUpperCase())}</span><strong>#${r.id} • ${esc(r.username_snapshot||r.user_id||'Usuário')}</strong><small>${fmt(r.created_at)}</small></div><span class="admin-status ${r.status==='resolved'?'good':r.status==='reviewing'?'warn':'bad'}">${esc(r.status)}</span></div>
    <p>${esc(r.message)}</p>
    <div class="admin-context"><span>Tela: ${esc(ctx.view||'—')}</span><span>Jogo: ${esc(ctx.game||'—')}</span><span>Sala: ${esc(ctx.roomCode||'—')}</span><span>Versão: ${esc(ctx.version||'—')}</span></div>
    ${r.admin_note?`<div class="admin-note"><strong>Nota ADM:</strong> ${esc(r.admin_note)}</div>`:''}
    <div class="admin-report-actions"><button class="btn btn-secondary btn-sm" onclick="TDBAdminUI.updateReport(${r.id},'reviewing')">Em análise</button><button class="btn btn-primary btn-sm" onclick="TDBAdminUI.updateReport(${r.id},'resolved')">Resolver</button></div>
  </article>`;
}
async function renderReports(status=adminState.reportStatus){
  adminState.reportStatus=status;adminState.reports=await A().reports(status);
  root().innerHTML=shell(`<div class="admin-head"><div><h1>Reportes</h1><p>Relatos enviados diretamente pelos jogadores.</p></div><div class="admin-log-tabs"><input id="adminReportUser" placeholder="Conta / ID" oninput="TDBAdminUI.applyReportFilters()"><select id="adminReportDate" class="select" onchange="TDBAdminUI.applyReportFilters()"><option value="all">Qualquer data</option><option value="1">Hoje</option><option value="7">7 dias</option><option value="30">30 dias</option></select><select class="select admin-filter" onchange="TDBAdminUI.filterReports(this.value)"><option value="all" ${status==='all'?'selected':''}>Todos</option><option value="open" ${status==='open'?'selected':''}>Abertos</option><option value="reviewing" ${status==='reviewing'?'selected':''}>Em análise</option><option value="resolved" ${status==='resolved'?'selected':''}>Resolvidos</option></select></div></div>
    <div class="admin-report-grid" id="adminReportGrid">${adminState.reports.length?adminState.reports.map(reportCard).join(''):'<div class="panel empty-state">Nenhum reporte neste filtro.</div>'}</div>`,'reports');
}
function applyReportFilters(){const q=(document.getElementById('adminReportUser')?.value||'').trim().toLowerCase(),days=document.getElementById('adminReportDate')?.value||'all';let rows=adminState.reports||[];if(q)rows=rows.filter(r=>String(r.username_snapshot||r.user_id||'').toLowerCase().includes(q));if(days!=='all'){const cutoff=Date.now()-Number(days)*86400000;rows=rows.filter(r=>new Date(r.created_at).getTime()>=cutoff)}const box=document.getElementById('adminReportGrid');if(box)box.innerHTML=rows.length?rows.map(reportCard).join(''):'<div class="panel empty-state">Nenhum reporte neste filtro.</div>'}
function logRow(l,type){
  if(type==='audit')return `<div class="admin-log-row"><time>${fmt(l.created_at)}</time><span class="admin-log-source">ADM</span><strong>${esc(l.action)}</strong><code>${esc(l.target_user_id||'—')}</code><small>${esc(JSON.stringify(l.details||{}))}</small></div>`;
  return `<div class="admin-log-row"><time>${fmt(l.created_at)}</time><span class="admin-log-source">${esc(l.source||'server')}</span><strong>${esc(l.message||'Erro')}</strong><code>${esc(l.user_id||l.route||'—')}</code><small>${esc(l.stack||JSON.stringify(l.context||{}))}</small></div>`;
}
async function renderLogs(type=adminState.logType){
  adminState.logType=type;adminState.logs=await A().logs(type);
  const versions=[...new Set((adminState.logs||[]).map(l=>l.context?.version).filter(Boolean))];
  root().innerHTML=shell(`<div class="admin-head"><div><h1>Logs</h1><p>Erros de cliente/servidor e auditoria das ações administrativas.</p></div><div class="admin-log-tabs"><button class="btn ${type==='errors'?'btn-primary':'btn-dark'} btn-sm" onclick="TDBAdminUI.showLogs('errors')">Erros</button><button class="btn ${type==='audit'?'btn-primary':'btn-dark'} btn-sm" onclick="TDBAdminUI.showLogs('audit')">Auditoria</button><select id="adminLogVersion" class="select" onchange="TDBAdminUI.applyLogFilters()"><option value="all">Todas versões</option>${versions.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select><select id="adminLogDate" class="select" onchange="TDBAdminUI.applyLogFilters()"><option value="all">Qualquer data</option><option value="1">24h</option><option value="7">7 dias</option><option value="30">30 dias</option></select></div></div>
    <div class="panel admin-log-list" id="adminLogList">${adminState.logs.length?adminState.logs.map(l=>logRow(l,type)).join(''):'<div class="empty-state">Nenhum log encontrado.</div>'}</div>`,'logs');
}
function applyLogFilters(){const version=document.getElementById('adminLogVersion')?.value||'all',days=document.getElementById('adminLogDate')?.value||'all';let rows=adminState.logs||[];if(version!=='all')rows=rows.filter(l=>String(l.context?.version||'')===version);if(days!=='all'){const cutoff=Date.now()-Number(days)*86400000;rows=rows.filter(l=>new Date(l.created_at).getTime()>=cutoff)}const box=document.getElementById('adminLogList');if(box)box.innerHTML=rows.length?rows.map(l=>logRow(l,adminState.logType)).join(''):'<div class="empty-state">Nenhum log neste filtro.</div>'}
async function renderOperations(){adminState.operations=await A().operations();const o=adminState.operations||{},m=o.maintenance||{};root().innerHTML=shell(`<div class="admin-head"><div><h1>Operação</h1><p>Salas, manutenção e qualidade por versão.</p></div><span class="admin-status ${m.enabled?'bad':'good'}">${m.enabled?'MANUTENÇÃO ATIVA':'SISTEMA ONLINE'}</span></div><div class="panel admin-info-panel"><h2>Modo manutenção</h2><p class="muted">Bloqueia ações de jogo e sala, mas mantém login, status e painel administrativo acessíveis.</p><div class="admin-search"><input id="maintenanceMessage" value="${esc(m.message||'TDB em manutenção • voltamos em breve')}" maxlength="240"><button class="btn ${m.enabled?'btn-secondary':'btn-danger'}" onclick="TDBAdminUI.toggleMaintenance(${m.enabled?'false':'true'})">${m.enabled?'Desativar manutenção':'Ativar manutenção'}</button></div></div><div class="two-col"><div class="panel"><div class="panel-header"><h2>Salas recentes</h2><span>${(o.rooms||[]).length}</span></div><div class="panel-body admin-log-list">${(o.rooms||[]).map(r=>`<div class="admin-log-row"><time>${fmt(r.updated_at)}</time><span class="admin-log-source">${esc(r.game||'—')}</span><strong>${esc(r.name||r.code)}</strong><code>${esc(r.code)}</code><small>${r.players} jogador(es) • ${r.spectators} espectador(es) • ${esc(r.status)} • ${esc(r.privacy)}</small></div>`).join('')||'<div class="empty-state">Nenhuma sala.</div>'}</div></div><div class="panel"><div class="panel-header"><h2>Erros por versão</h2></div><div class="panel-body">${(o.errorVersions||[]).map(v=>`<div class="social-row"><strong>${esc(v.version)}</strong><span class="admin-status ${v.count>10?'bad':v.count>3?'warn':'good'}">${v.count} erro(s)</span></div>`).join('')||'<div class="empty-state">Sem erros recentes.</div>'}</div></div></div>`,'operations')}
async function toggleMaintenance(enabled){const message=document.getElementById('maintenanceMessage')?.value||'';if(enabled&&!confirm('Ativar modo manutenção agora? Jogadores verão a tela de manutenção.'))return;try{await A().setMaintenance(enabled,message);adminToast(enabled?'Modo manutenção ativado.':'Modo manutenção desativado.');await renderOperations()}catch(err){adminToast(err.message,'error')}}
async function openTab(tab){
  adminState.tab=tab;
  try{
    if(tab==='users')return renderUsers();
    if(tab==='reports')return renderReports();
    if(tab==='logs')return renderLogs();
    if(tab==='operations')return renderOperations();
    return renderOverview();
  }catch(err){
    if(err.status===401)return renderLogin('Sua sessão administrativa expirou.');
    adminToast(err.message||'Falha ao carregar painel.','error');
  }
}
async function resetPassword(userId){
  const entered=prompt('Digite uma nova senha (mínimo 6 caracteres).\nDeixe em branco para gerar uma senha temporária.\nCancelar não altera nada.');
  if(entered===null)return;
  try{
    const r=await A().resetPassword(userId,entered.trim()||null);
    if(r.temporaryPassword){
      const secret=r.temporaryPassword;
      const box=document.createElement('div');box.className='modal-backdrop';box.id='adminSecretModal';
      box.innerHTML=`<div class="modal admin-secret-modal"><div class="modal-head"><h3>Senha temporária criada</h3><button class="icon-btn" onclick="document.getElementById('adminSecretModal').remove()">×</button></div><div class="modal-body"><p>Envie esta senha ao dono da conta por um canal seguro. Ela é mostrada aqui somente agora.</p><div class="admin-secret"><code>${esc(secret)}</code><button class="btn btn-secondary btn-sm" id="copyAdminSecret">Copiar</button></div><p class="muted">Todas as sessões anteriores da conta foram encerradas.</p></div></div>`;
      document.body.appendChild(box);document.getElementById('copyAdminSecret').onclick=()=>navigator.clipboard?.writeText(secret).then(()=>adminToast('Senha copiada.'));
    }else adminToast('Senha alterada e sessões antigas encerradas.');
    await renderUsers(document.getElementById('adminUserSearch')?.value||'');
  }catch(err){adminToast(err.message,'error')}
}
async function toggleBan(userId,banned){
  let reason='';
  if(banned){reason=prompt('Motivo do banimento:','Violação das regras do TDB JOGOS')||'';if(!reason)return}
  if(!confirm(banned?'Banir esta conta e encerrar todas as sessões?':'Desbanir esta conta?'))return;
  try{await A().setBan(userId,banned,reason);adminToast(banned?'Conta banida.':'Conta desbanida.');await renderUsers()}catch(err){adminToast(err.message,'error')}
}
async function revoke(userId){if(!confirm('Encerrar todas as sessões desta conta?'))return;try{await A().revokeSessions(userId);adminToast('Sessões encerradas.')}catch(err){adminToast(err.message,'error')}}
async function updateReport(reportId,status){const note=prompt('Nota administrativa (opcional):','')??'';try{await A().updateReport(reportId,status,note);adminToast('Reporte atualizado.');await renderReports(adminState.reportStatus)}catch(err){adminToast(err.message,'error')}}
function searchUsers(){renderUsers(document.getElementById('adminUserSearch')?.value.trim()||'')}
function filterReports(v){renderReports(v)}
function showLogs(type){renderLogs(type)}
async function logout(){await A().logout();sound('back');renderLogin()}
function backToSite(){location.hash='';location.reload()}
async function boot(){
  if(location.hash!=='#admin')return;
  const session=await A()?.session?.();
  if(session)openTab('overview');else renderLogin();
}
window.TDBAdminUI={boot,renderLogin,openTab,searchUsers,applyUserFilters,resetPassword,toggleBan,revoke,filterReports,applyReportFilters,showLogs,applyLogFilters,updateReport,toggleMaintenance,logout,backToSite};
window.addEventListener('hashchange',()=>{if(location.hash==='#admin')boot()});
boot();
})();
