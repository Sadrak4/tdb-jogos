/* TDB 8.3.1 Social & Admin — existing endpoints, no alternate game implementations. */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const https=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'?u.href:''}catch{return''}};
const avatar=u=>{const url=https(u?.avatarImage||u?.avatar_image);return url?`style="background-image:url('${esc(url).replace(/'/g,'%27')}')"`:''};
let user=null,social=null,lastQuery='',socialBusy=false;
const accountToken=()=>localStorage.getItem('tdb_session_token')||'';
const roomCode=()=>$('#room-code-text')?.textContent?.trim()||'';
const notify=text=>{const toast=$('#toast');if(!toast)return;toast.textContent=String(text);toast.classList.add('visible');clearTimeout(window.__tdbSocialToast);window.__tdbSocialToast=setTimeout(()=>toast.classList.remove('visible'),4000)};
async function call(route,body){
  const token=accountToken();if(!token)throw Error('Sua sessão TDB expirou. Entre novamente.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const result=await fetch('/api/'+route,{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});const data=await result.json().catch(()=>({}));if(!result.ok||data.ok===false)throw Error(data.error||'Serviço indisponível.');return data}
  finally{clearTimeout(timer)}
}
const nav=view=>document.dispatchEvent(new CustomEvent('tdb:navigate',{detail:{view}}));
for(const key of ['profile','friends'])$('#nav-'+key)?.addEventListener('click',()=>nav(key));
$('#universe-room-invite')?.addEventListener('click',()=>nav('friends'));
async function ensureUser(){if(user)return user;const data=await call('auth/session');user=data.user;return user}
function profileStats(stats){return ['chess','truco'].map(game=>{const r=stats?.[game]||{},name=game==='chess'?'Xadrez':'Truco';return `<div class="universe-stats-game">${name.toUpperCase()}</div>${[['played','Partidas'],['wins','Vitórias'],['losses','Derrotas'],['draws','Empates'],['canceled','Canceladas']].map(([key,label])=>`<div class="universe-stat"><strong>${Number(r[key]||0)}</strong><small>${label}</small></div>`).join('')}`}).join('')}
const date=v=>{const d=new Date(v||0);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})};
function activityRow(x){const g=x.game==='chess'?'Xadrez':x.game==='truco'?'Truco':x.game||'Partida';const side=x.winner_ids?.includes(user.id)?'Vitória':x.loser_ids?.includes(user.id)?'Derrota':x.result_type==='canceled'?'Cancelada':'Empate';return `<div class="universe-timeline-item"><span>${x.game==='chess'?'♟':'♠'}</span><div><b>${esc(g)} · ${esc(side)}</b><small>${esc(date(x.finished_at))} · ${esc(x.mode||'')}</small></div></div>`}
async function loadProfile(){const root=$('#profile-stats'),recent=$('#profile-recent');try{const u=await ensureUser();const r=await call('profile/public?id='+encodeURIComponent(u.id));user={...u,...r.user};$('#profile-username').textContent=user.username;$('#profile-id').textContent=user.id;const av=$('#profile-avatar');av.textContent=user.username.slice(0,1).toUpperCase();av.style.backgroundImage=https(user.avatarImage)?`url(${JSON.stringify(https(user.avatarImage))})`:'';const cover=$('#profile-cover');cover.style.backgroundImage=https(user.banner)?`linear-gradient(#060b09a8,#111810e5),url(${JSON.stringify(https(user.banner))})`:'';root.innerHTML=profileStats(r.stats);recent.innerHTML=(r.recent||[]).slice(0,7).map(activityRow).join('')||'<div class="universe-state-empty">Ainda não há partidas registradas.</div>';if(r.statsPendingMigration)recent.insertAdjacentHTML('beforeend','<p class="subtle">Totais completos dependem do SQL da 8.1.4.</p>')}catch(e){root.textContent='Não foi possível carregar suas estatísticas: '+e.message;recent.textContent='Tente novamente mais tarde.'}}
const editDialog=$('#profile-edit-dialog'),editForm=$('#profile-edit-form');
$('#profile-edit')?.addEventListener('click',async()=>{try{const u=await ensureUser();editForm.elements.username.value=u.username||'';editForm.elements.avatarImage.value=u.avatarImage||'';editForm.elements.banner.value=u.banner||'';editDialog.showModal()}catch(e){notify(e.message)}});
$('#profile-edit-close')?.addEventListener('click',()=>editDialog.close());
$('#profile-edit-cancel')?.addEventListener('click',()=>editDialog.close());
editForm?.addEventListener('submit',async e=>{e.preventDefault();const btn=editForm.querySelector('button[type="submit"]');if(!editForm.reportValidity())return;btn.disabled=true;
  try{const u=await ensureUser(),fd=new FormData(editForm);const avatarImage=String(fd.get('avatarImage')||'').trim(),banner=String(fd.get('banner')||'').trim();if((avatarImage&&!https(avatarImage))||(banner&&!https(banner)))throw Error('Use apenas endereços HTTPS válidos para as imagens.');const result=await call('profile/update',{username:String(fd.get('username')||'').trim(),avatar:u.avatar||null,avatarImage,banner});user=result.user;document.dispatchEvent(new CustomEvent('tdb:profile-updated',{detail:{user}}));editDialog.close();await loadProfile();notify('Perfil atualizado com sucesso!')}
  catch(err){notify(err.message)}finally{btn.disabled=false}
});

function userRow(u,buttons=[]){const name=u.username||u.user?.username||u.sender?.username||u.id||'Jogador',id=u.id||u.user?.id||u.sender?.id||'';return `<div class="universe-user-row"><span class="universe-user-badge" ${avatar(u.user||u.sender||u)}>${!https((u.user||u.sender||u).avatarImage)?esc(String(name).slice(0,1).toUpperCase()):''}</span><span class="universe-user-details"><b>${esc(name)}</b><small>${esc(u.status||id)}</small></span><span class="universe-user-actions">${buttons.map(b=>`<button class="btn ${b.primary?'btn-primary':'btn-outline'}" type="button" data-social="${esc(b.action)}" ${b.target?`data-target="${esc(b.target)}"`:''} ${b.inviteId?`data-invite="${esc(b.inviteId)}"`:''}>${esc(b.label)}</button>`).join('')}</span></div>`}
function invitable(){return /^SALA-[A-Z0-9]{8}$/i.test(roomCode()) && !!localStorage.getItem('tdb_hub_last_room') && localStorage.getItem('tdb_hub_last_room')===roomCode()}
function renderFriends(){if(!social)return;const friends=social.friends||[];$('#friends-list').innerHTML=friends.length?friends.map(f=>userRow(f,[{action:'view',label:'Perfil',target:f.id},...(invitable()?[{action:'invite',label:'Convidar à sala',target:f.id,primary:true}]:[]),{action:'remove',label:'Remover',target:f.id}])).join(''):'<div class="universe-state-empty">Você ainda não adicionou amigos.</div>';
 $('#friends-incoming').innerHTML=(social.incoming||[]).map(f=>userRow(f.user,[{action:'accept',label:'Aceitar',target:f.sender_id,primary:true},{action:'reject',label:'Recusar',target:f.sender_id}])).join('')||'<p class="subtle">Nenhum pedido pendente.</p>';
 $('#friends-outgoing').innerHTML=(social.outgoing||[]).map(f=>userRow(f.user,[])).join('')||'<p class="subtle">Nenhum pedido enviado.</p>';
 $('#friends-invites').innerHTML=(social.invites||[]).map(i=>userRow({...i.sender,status:'Convite para '+i.room_code},[{action:'join-invite',label:'Aceitar',inviteId:i.id,primary:true},{action:'decline-invite',label:'Recusar',inviteId:i.id}])).join('')||'<p class="subtle">Nenhum convite pendente.</p>';
}
async function loadFriends(){if(socialBusy)return;socialBusy=true;try{await ensureUser();social=await call('friends/list');renderFriends()}catch(e){$('#friends-list').innerHTML=`<div class="universe-state-empty">${esc(e.message)}<p>Confira se o esquema social do Supabase foi instalado.</p></div>`;notify(e.message)}finally{socialBusy=false}}
$('#friends-refresh')?.addEventListener('click',loadFriends);
$('#friends-search-form')?.addEventListener('submit',async e=>{e.preventDefault();const q=$('#friends-query').value.trim();if(q.length<2)return;lastQuery=q;const area=$('#friends-results');area.textContent='Buscando jogadores...';try{const d=await call('users/search?q='+encodeURIComponent(q));const friends=new Set((social?.friends||[]).map(f=>f.id));area.innerHTML=(d.users||[]).map(u=>userRow(u,[{action:friends.has(u.id)?'view':'add',label:friends.has(u.id)?'Ver perfil':'Adicionar amigo',target:u.id,primary:true}])).join('')||'<p class="subtle">Nenhum jogador encontrado.</p>'}catch(err){area.textContent=err.message}});
async function viewPublicProfile(id){try{const r=await call('profile/public?id='+encodeURIComponent(id));const u=r.user||{};const stats=r.stats||{};const lines=['chess','truco'].map(g=>{const s=stats[g]||{};return `${g==='chess'?'Xadrez':'Truco'}: ${s.wins||0} vitórias, ${s.losses||0} derrotas`});alert(`${u.username||id}\nID: ${u.id||id}\n${lines.join('\n')}`)}catch(e){notify(e.message)}}
async function handleSocial(action,target,inviteId){switch(action){
  case 'view':await viewPublicProfile(target);return;
  case 'add':await call('friends/add',{friendId:target});notify('Solicitação enviada.');break;
  case 'remove':if(!confirm('Remover este usuário da lista de amigos?'))return;await call('friends/remove',{friendId:target});notify('Amizade removida.');break;
  case 'accept':case 'reject':await call('friends/respond',{senderId:target,accept:action==='accept'});notify(action==='accept'?'Amizade aceita.':'Solicitação recusada.');break;
  case 'invite':{const code=roomCode();if(!code.startsWith('SALA-'))throw Error('Entre em uma sala primeiro para convidar seu amigo.');await call('invites/send',{friendId:target,roomCode:code});notify('Convite enviado!');break}
  case 'join-invite':case 'decline-invite':{const result=await call('invites/respond',{inviteId:Number(inviteId),accept:action==='join-invite'});if(result.accepted&&result.roomCode){localStorage.setItem('tdb_hub_last_room',result.roomCode);nav('home');document.dispatchEvent(new CustomEvent('tdb:resume-room'))}else notify('Convite recusado.');break}
}await loadFriends()}
$('#friends-view')?.addEventListener('click',async e=>{const b=e.target.closest('[data-social]');if(!b||b.disabled)return;b.disabled=true;try{await handleSocial(b.dataset.social,b.dataset.target,b.dataset.invite)}catch(err){notify(err.message)}finally{b.disabled=false}});
let lastView='home';document.addEventListener('tdb:view',e=>{const view=e.detail?.view;lastView=view;if(view==='profile')void loadProfile();if(view==='friends')void loadFriends();});
document.addEventListener('tdb:auth',e=>{user=e.detail?.user||null;social=null;});
