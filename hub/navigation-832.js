/* TDB 8.3.2 — six destinations, rooms with three tabs. Games/services remain in hub.js. */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let roomData=[],currentTab='mine';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const savedCode=()=>localStorage.getItem('tdb_hub_last_room')||'';
function updateMine(){const code=savedCode(),room=roomData.find(x=>x.code===code);const name=$('#rooms-current-name'),label=$('#rooms-current-code'),btn=$('#rooms-continue');if(!name)return;name.textContent=room?.name||(code?'Última sala visitada':'Nenhuma sala selecionada');label.textContent=code||'Você pode criar uma sala nova ou explorar as abertas.';btn.disabled=!code;btn.title=code?'Entrar novamente usando as permissões existentes':'Primeiro entre em uma sala ou crie uma nova';}
function renderRooms(){const q=($('#rooms-search')?.value||'').trim().toLocaleLowerCase('pt-BR');const entries=roomData.filter(r=>!q||(r.name+' '+r.code).toLocaleLowerCase('pt-BR').includes(q));const root=$('#rooms-explore-grid');if(!root)return;root.innerHTML=entries.length?entries.map(r=>`<article class="room-card" data-enter="${esc(r.code)}" tabindex="0" role="button" aria-label="Entrar na sala ${esc(r.name)}"><div class="room-card-top"><span class="room-card-icon">⌂</span><span class="pill ${r.visibility==='private'?'private':''}">${r.visibility==='private'?'Privada':'Pública'}</span></div><h3>${esc(r.name)}</h3><div class="room-code-mini">${esc(r.code)}</div><div class="card-foot"><span>◦ ${Number(r.members||0)} ${Number(r.members||0)===1?'pessoa':'pessoas'}</span><span>Entrar →</span></div></article>`).join(''):`<div class="universe-state-empty">${q?'Nenhuma sala corresponde à pesquisa.':'Nenhuma sala pública disponível. Crie a primeira!'}</div>`;}
function tab(tab){const name=['mine','create','explore'].includes(tab)?tab:'mine';currentTab=name;$$('[data-rooms-tab]').forEach(b=>{const active=b.dataset.roomsTab===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});for(const x of ['mine','create','explore'])$('#rooms-'+x)?.classList.toggle('hidden',x!==name);updateMine();if(name==='explore')renderRooms();}
$$('[data-rooms-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.roomsTab)));
document.addEventListener('tdb:rooms',e=>{roomData=e.detail?.rooms||[];updateMine();renderRooms()});
document.addEventListener('tdb:rooms-tab',e=>tab(e.detail?.tab));
document.addEventListener('tdb:view',e=>{if(e.detail?.view==='rooms')tab(currentTab);else if(e.detail?.view==='room')updateMine()});
$('#rooms-search')?.addEventListener('input',renderRooms);
$('#rooms-refresh')?.addEventListener('click',()=>$('#refresh-rooms')?.click());
$('#rooms-continue')?.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('tdb:resume-room')));
for(const id of ['rooms-new-from-mine','rooms-create-action'])$('#'+id)?.addEventListener('click',()=>$('#top-create')?.click());
for(const id of ['rooms-join-from-mine','rooms-join-code'])$('#'+id)?.addEventListener('click',()=>$('#top-join')?.click());
$('#rooms-create-private-help')?.addEventListener('click',()=>{window.alert('Salas públicas aparecem na lista. Salas privadas exigem código ou convite. O criador controla as permissões e as mesas. Salas sem pessoas podem expirar após uma hora.');});
$('#rooms-explore-grid')?.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-enter]')){e.preventDefault();e.target.closest('[data-enter]').click()}});
tab('mine');
