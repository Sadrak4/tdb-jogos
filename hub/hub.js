import {renderClassicChess,renderClassicTruco,chessMoveOptions,chessPgn} from './classic-games.js';
import {initDiscover} from './discover.js';
// TDB 8.0 Beta • Sala social única, mídia persistente, mesas independentes.
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=x=>String(x||'').slice(0,60);
const gameNames={chess:'Xadrez',truco:'Truco'};
const symbols={chess:'♟',truco:'♠'};
const S={token:localStorage.getItem('tdb_session_token')||'',user:null,room:null,snapshot:null,rooms:[],tab:'tables',selectedTable:null,selectedSq:null,gameVersion:'',queueRevision:-1,trackKey:'',youtubeReady:false,yt:null,audioArmed:false,desiredPlay:false,stream:null,peers:new Map(),watchPc:null,watchStream:null,watchSession:'',signalCursor:0,signalBusy:false,refreshBusy:false,refreshPending:false,messagesCursor:0,updateTimer:null,signalTimer:null,heartbeatTimer:null,clockOffset:0,authMode:'login',modalResolve:null,poolAngle:0,poolPower:.62,roomEpoch:0};
S.favoriteIds=new Set();S.libraryProfile=null;S.lastMusicLog='';
S.musicIntent='';S.musicNeedsInitialAlign=false;S.musicTrackChangedAt=0;S.musicLastSeekAt=0;S.musicDriftSince=0;S.musicLastIntentAt=0;
S.gameWindowMode='normal';S.trucoHideNext=false;S.gameWindowTableId=null;S.dragGame=null;
S.shareRoom=null;S.shareSession=null;S.shareRoomName='';S.shareTimer=null;S.viewerPcs=new Map();S.shareCursors={};S.shareSignature='';
const actionIn=(code,type,extra={})=>hubPost('action',{code,action:{type,...extra}});
let toastTimer;
function toast(message){const el=$('#toast');el.textContent=String(message);el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3900)}
const show=(selector,on=true)=>$(selector)?.classList.toggle('hidden',!on);
const shortName=name=>String(name||'?').slice(0,1).toUpperCase();
const memberIds=()=>S.snapshot?.room?.members||[];
const isHost=()=>S.snapshot?.room?.ownerId===S.user?.id;
async function request(path,body=null){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),14000);
  try{
    const response=await fetch(path,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',...(S.token?{Authorization:`Bearer ${S.token}`}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||`Falha na API: ${response.status}`);
    return data;
  }catch(e){if(e.name==='AbortError')throw new Error('O servidor demorou para responder.');throw e}
  finally{clearTimeout(timeout)}
}
const hubGet=(op,params={})=>request(`/api/hub?${new URLSearchParams({op,...params})}`);
const hubPost=(op,params={})=>request('/api/hub',{op,...params});
const action=(type,extra={})=>hubPost('action',{code:S.room,action:{type,...extra}});
function setView(view){show('#home',view==='home');show('#room-view',view==='room');$$('[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===view));$('#where').textContent=view==='home'?'Explorar salas':S.snapshot?.room?.name||'Sala social';window.scrollTo({top:0,behavior:'instant'})}
function loggedIn(user){S.user=user;show('#auth',false);show('#shell',true);$('#user-name').textContent=user.username;$('#user-avatar').textContent=shortName(user.username);$('#status').textContent='Conectado';setView('home');refreshRooms();initDiscover();request('/api/platform/music-profile').then(d=>{if(S.user?.id!==user.id)return;S.favoriteIds=new Set((d.profile?.favorites||[]).map(t=>t.videoId));S.queueRevision=-1;if(S.snapshot?.room?.music)syncMusic(S.snapshot.room.music)}).catch(()=>{});}
function loggedOut(){S.favoriteIds.clear();S.libraryProfile=null;closeGameWindow(true);S.user=null;S.token='';localStorage.removeItem('tdb_session_token');show('#auth');show('#shell',false);$('#auth-user').focus()}
async function login(){if(!S.token){loggedOut();return}try{const data=await request('/api/auth/session');loggedIn(data.user);if(localStorage.getItem('tdb_hub_last_room'))await enter(localStorage.getItem('tdb_hub_last_room'),true)}catch{loggedOut()}}
$('#auth-toggle').addEventListener('click',()=>{S.authMode=S.authMode==='login'?'register':'login';$('#auth-title').textContent=S.authMode==='login'?'Entre no seu mundo.':'Faça parte da galera.';$('#auth-submit').innerHTML=S.authMode==='login'?'Entrar no TDB <span>→</span>':'Criar minha conta <span>→</span>';$('#auth-toggle').innerHTML=S.authMode==='login'?'Ainda não tem conta? <b>Criar conta</b>':'Já tem conta? <b>Entrar</b>'});
$('#auth-form').addEventListener('submit',async e=>{e.preventDefault();const btn=$('#auth-submit');btn.disabled=true;try{const d=await request(`/api/auth/${S.authMode}`,{username:$('#auth-user').value.trim(),password:$('#auth-pass').value});S.token=d.token;localStorage.setItem('tdb_session_token',d.token);loggedIn(d.user);toast(`Bem-vindo ao TDB, ${d.user.username}!`)}catch(err){toast(err.message)}finally{btn.disabled=false}});
$('#logout').addEventListener('click',async()=>{try{await request('/api/auth/logout',{})}catch{}stopLocalShare();closeViewer();stopTimers();S.room=null;S.snapshot=null;localStorage.removeItem('tdb_hub_last_room');S.yt?.pauseVideo?.();loggedOut()});
function dialog({title,description,fields,submit='Confirmar',icon='✦'}){
  return new Promise(resolve=>{
    const modal=$('#modal');$('#modal-title').textContent=title;$('#modal-description').textContent=description||'';$('#modal-icon').textContent=icon;$('#modal-ok').textContent=submit;
    $('#modal-fields').innerHTML=fields.map(f=>`<label class="modal-field"${Object.entries(f.when||{}).map(([key,value])=>` data-when-${esc(key)}="${esc(value)}"`).join('')}>${esc(f.label)}${f.type==='select'?`<select name="${esc(f.name)}">${f.options.map(o=>`<option value="${esc(o[0])}" ${String(f.value??'')===String(o[0])?'selected':''}>${esc(o[1])}</option>`).join('')}</select>`:`<input name="${esc(f.name)}" ${f.required?'required':''} type="${f.type||'text'}" placeholder="${esc(f.placeholder||'')}" maxlength="${f.max||80}" value="${esc(f.value||'')}">`}${f.hint?`<small class="modal-hint">${esc(f.hint)}</small>`:''}</label>`).join('');
    updateModalFields();
    S.modalResolve=resolve;modal.showModal();modal.querySelector('input:not(:disabled),select:not(:disabled)')?.focus();
  });
}
// Campos específicos de cada jogo aparecem somente quando fazem sentido.
function updateModalFields(){
  const root=$('#modal-fields');if(!root)return;
  for(const label of root.querySelectorAll('.modal-field')){
    const conditions=[...label.attributes].filter(a=>a.name.startsWith('data-when-'));
    const visible=conditions.every(a=>{
      const key=a.name.slice('data-when-'.length);
      return root.querySelector(`[name="${key}"]`)?.value===a.value;
    });
    label.classList.toggle('hidden',!visible);
    label.querySelectorAll('input,select').forEach(input=>{input.disabled=!visible});
  }
}
$('#modal-fields').addEventListener('change',updateModalFields);
function settleModal(value){const resolve=S.modalResolve;S.modalResolve=null;$('#modal').close();resolve?.(value)}
$('#modal-form').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.target);settleModal(Object.fromEntries(fd.entries()))});
$('#modal-close').addEventListener('click',()=>settleModal(null));$('#modal-cancel').addEventListener('click',()=>settleModal(null));$('#modal').addEventListener('cancel',e=>{e.preventDefault();settleModal(null)});
async function createRoom(){const f=await dialog({title:'Crie sua sala',description:'Seu espaço para ouvir música, compartilhar tela e jogar com os amigos.',icon:'✦',submit:'Criar sala',fields:[{name:'name',label:'Nome da sala',placeholder:'Ex.: Galera da madrugada',required:true,max:60},{name:'visibility',label:'Visibilidade',type:'select',options:[['public','Pública • aparece na lista'],['private','Privada • acesso pelo código']]}]});if(!f)return;try{const d=await hubPost('create',f);await enter(d.code);toast('Sala criada! Convide os amigos pelo código.')}catch(e){toast(e.message)}}
async function joinPrompt(){const f=await dialog({title:'Entrar com código',description:'Peça o código da sala para o seu amigo.',icon:'⌁',submit:'Entrar',fields:[{name:'code',label:'Código da sala',required:true,placeholder:'SALA-1234ABCD'}]});if(f)await enter(f.code)}
$$('[data-create-room]').forEach(b=>b.addEventListener('click',createRoom));$('#top-create').addEventListener('click',createRoom);$('#top-join').addEventListener('click',joinPrompt);
$('#top-training')?.addEventListener('click',async()=>{
  const f=await dialog({title:'Treinamento individual',description:'Partida pessoal contra BOT, sem ranking. Você pode voltar ao seu histórico depois.',icon:'♟',submit:'Começar treinamento',fields:[
    {name:'game',label:'Jogo',type:'select',options:[['chess','Xadrez'],['truco','Truco']]},
    {name:'difficulty',label:'Dificuldade dos BOTs',type:'select',options:[['easy','Fácil'],['medium','Médio'],['hard','Difícil']]},
    {name:'seats',label:'Truco (modalidade)',type:'select',options:[['2','1 contra 1'],['4','2 contra 2 (três BOTs)']]}
  ]});
  if(!f)return;
  try{const d=await hubPost('train',{game:f.game,difficulty:f.difficulty,settings:{seats:f.seats}});await enter(d.code);S.selectedTable=d.tableId;S.gameVersion='';await refresh();toast('Treinamento iniciado!')}
  catch(e){toast(e.message)}
});

$('#refresh-rooms').addEventListener('click',refreshRooms);$('#home-refresh').addEventListener('click',refreshRooms);
$('#nav-home').addEventListener('click',()=>setView('home'));
$('#nav-room').addEventListener('click',()=>S.room?setView('room'):toast('Entre em uma sala primeiro.'));
// Non-destructive per-device layout preferences; games and audio stay mounted.
const roomLayoutPrefs={music:localStorage.getItem('tdb_hide_music_panel')==='yes',social:localStorage.getItem('tdb_hide_social_panel')==='yes'};
function applyRoomLayout(){
  const root=$('#room-view');if(!root)return;
  root.classList.toggle('tdb-hide-music',roomLayoutPrefs.music);
  root.classList.toggle('tdb-hide-social',roomLayoutPrefs.social);
  const music=$('#room-toggle-music'),social=$('#room-toggle-social');
  if(music){music.setAttribute('aria-pressed',String(roomLayoutPrefs.music));music.textContent=roomLayoutPrefs.music?'♫ Mostrar música':'♫ Ocultar painel de música'}
  if(social){social.setAttribute('aria-pressed',String(roomLayoutPrefs.social));social.textContent=roomLayoutPrefs.social?'◉ Mostrar chat e pessoas':'◉ Ocultar painel social'}
}
$('#room-toggle-music')?.addEventListener('click',()=>{if(!roomLayoutPrefs.music&&S.snapshot?.room?.music?.playing){toast('Para manter o player do YouTube visível, pause a música antes de ocultar o painel.');return}roomLayoutPrefs.music=!roomLayoutPrefs.music;localStorage.setItem('tdb_hide_music_panel',roomLayoutPrefs.music?'yes':'no');applyRoomLayout()});
$('#room-toggle-social')?.addEventListener('click',()=>{roomLayoutPrefs.social=!roomLayoutPrefs.social;localStorage.setItem('tdb_hide_social_panel',roomLayoutPrefs.social?'yes':'no');applyRoomLayout()});
applyRoomLayout();
// Premium Gold + Social: quick actions call the existing, already-tested controls.
$('#home-join')?.addEventListener('click',()=>$('#top-join')?.click());
$('#home-training')?.addEventListener('click',()=>$('#top-training')?.click());
$('#home-library')?.addEventListener('click',()=>$('#music-library')?.click());
$('#home-history')?.addEventListener('click',()=>$('#nav-history')?.click());
$('#social-members-open')?.addEventListener('click',()=>{selectTab('members');$('#members-panel')?.scrollIntoView({block:'nearest',behavior:'smooth'})});
$('#social-chat-open')?.addEventListener('click',()=>{selectTab('chat');$('#chat-panel')?.scrollIntoView({block:'nearest',behavior:'smooth'})});
$('#social-chat-form')?.addEventListener('submit',e=>{
  e.preventDefault();const input=$('#social-chat-input'),val=input?.value.trim();if(!val||!S.room)return;
  $('#chat-input').value=val;input.value='';$('#chat-form').requestSubmit();
});
$('#dock-play')?.addEventListener('click',()=>$('#music-play')?.click());
$('#dock-next')?.addEventListener('click',()=>$('#music-next')?.click());
$('#dock-open')?.addEventListener('click',()=>$('#room-music-card')?.scrollIntoView({block:'center',behavior:'smooth'}));
function formatCount(n){return n===1?'1 pessoa':`${n} pessoas`}
function roomCard(r){const publicRoom=r.visibility!=='private';return `<article class="room-card" data-enter="${esc(r.code)}"><div class="room-card-top"><span class="room-card-icon">⌂</span><span class="pill ${publicRoom?'':'private'}">${publicRoom?'Pública':'Privada'}</span></div><h3>${esc(r.name)}</h3><div class="room-code-mini">${esc(r.code)}</div><div class="card-foot"><span>◦ ${formatCount(r.members||0)}</span><span>Entrar →</span></div></article>`}
async function refreshRooms(){if(!S.user)return;try{const r=await hubGet('list');S.rooms=r.rooms||[];$('#home-rooms').innerHTML=S.rooms.length?S.rooms.map(roomCard).join(''):'<div class="empty-state"><span>⌂</span><h3>Sem salas abertas</h3>Seja o primeiro a criar uma!</div>';$('#home-room-count').textContent=String(S.rooms.length).padStart(2,'0');
  $('#home-people-count').textContent=String(S.rooms.reduce((total,room)=>total+Number(room.members||0),0)).padStart(2,'0');
  $('#room-list').innerHTML=S.rooms.slice(0,35).map(r=>`<button class="room-side-item" data-enter="${esc(r.code)}"><span class="room-dot">⌂</span><span class="room-side-copy"><b>${esc(r.name)}</b><small>${r.visibility==='private'?'Privada':'Pública'} • ${formatCount(r.members||0)}</small></span></button>`).join('')||'<span class="muted">Nenhuma sala</span>'}catch(e){toast(e.message)}}
$('#home-rooms').addEventListener('click',e=>{const id=e.target.closest('[data-enter]')?.dataset.enter;if(id)enter(id)});$('#room-list').addEventListener('click',e=>{const id=e.target.closest('[data-enter]')?.dataset.enter;if(id)enter(id)});
async function enter(rawCode,silent=false){const code=String(rawCode||'').trim().toUpperCase();if(!code)return;if(S.room===code){try{await hubPost('join',{code});await refresh()}catch(e){toast(e.message)}setView('room');return}try{await hubPost('join',{code});stopTimers();closeViewer();if(S.yt?.pauseVideo)S.yt.pauseVideo();S.room=code;S.roomEpoch++;S.snapshot=null;S.messagesCursor=0;S.selectedTable=null;closeGameWindow(true);S.gameVersion='';S.queueRevision=-1;S.trackKey='';S.signalCursor=0;localStorage.setItem('tdb_hub_last_room',code);S.tab='tables';selectTab('tables');setView('room');await refresh();startTimers();if(!silent)toast('Você entrou na sala!')}catch(err){if(silent){localStorage.removeItem('tdb_hub_last_room')}else toast(err.message)}}
function stopTimers(){clearInterval(S.updateTimer);clearInterval(S.signalTimer);clearInterval(S.heartbeatTimer);S.updateTimer=S.signalTimer=S.heartbeatTimer=null}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&S.room)void refresh(true)});
function startTimers(){stopTimers();const tick=()=>{
    if(!S.room)return;
    if(document.visibilityState!=='hidden')void refresh();
    S.updateTimer=setTimeout(tick,document.visibilityState==='hidden'?12000:S.selectedTable?1800:4500);
  };
  S.updateTimer=setTimeout(tick,1800);S.signalTimer=setInterval(()=>{if(S.shareRoom||S.watchSession||S.viewerPcs.size)pollSignals()},3000);S.heartbeatTimer=setInterval(()=>{action('heartbeat').catch(()=>{});},22000)}
async function refresh(force=false){
  if(!S.room)return;
  if(S.refreshBusy){
    if(!force)return;
    await new Promise(resolve=>{
      const wait=()=>{if(!S.refreshBusy)resolve();else setTimeout(wait,20)};
      wait();
    });
    return refresh();
  }
  const epoch=S.roomEpoch;S.refreshBusy=true;
  try{
    const requestedAt=Date.now();
    const d=await hubGet('snapshot',{code:S.room,...(S.selectedTable?{tableId:S.selectedTable}:{}),...(S.messagesCursor?{messagesAfter:S.messagesCursor}:{})});
    if(epoch!==S.roomEpoch)return;
    S.clockOffset=Number(d.serverTime||Date.now())-((requestedAt+Date.now())/2);
    const old=S.snapshot;
    if(d.messagesDelta&&old){
      const existing=new Map((old.messages||[]).map(m=>[Number(m.id),m]));
      for(const m of d.messages||[])existing.set(Number(m.id),m);
      d.messages=[...existing.values()].sort((a,b)=>Number(a.id)-Number(b.id)).slice(-60);
    }
    S.messagesCursor=Math.max(0,...(d.messages||[]).map(m=>Number(m.id)||0));
    // Uma resposta de polling iniciada antes da jogada não pode voltar o tabuleiro no tempo.
    if(old?.game&&d.game&&S.selectedTable&&Number(d.game.version||0)<Number(old.game.version||0))d.game=old.game;
    S.snapshot=d;updateRoom(old);$('#status').textContent='Sincronizado'}catch(e){if(epoch===S.roomEpoch){$('#status').textContent='Reconectando';console.warn('[Hub refresh]',e.message);if(/Entre nesta sala|Você não participa/.test(e.message)&&!S.rejoining){S.rejoining=true;hubPost('join',{code:S.room}).then(()=>refresh()).catch(err=>toast(err.message)).finally(()=>S.rejoining=false)}}}finally{S.refreshBusy=false;if(S.refreshPending&&epoch===S.roomEpoch){S.refreshPending=false;queueMicrotask(()=>refresh())}}}
async function doAction(type,more={},thenRefresh=true){
  try{
    const result=await action(type,more);
    if(thenRefresh){
      // Mesas e permissões requerem confirmação visual antes de ações dependentes.
      if(type.startsWith('table:')||type==='room:settings'||type==='room:kick')await refresh(true);
      else void refresh(true);
    }
    return result;
  }catch(e){toast(e.message);return null}
}
$('#leave-room').addEventListener('click',async()=>{if(!S.room)return;const active=S.snapshot?.room?.tables?.some(t=>t.status==='playing'&&t.players.some(p=>p.id===S.user?.id));if(active&&!confirm('Você está participando de uma partida. Se não retornar em até 3 minutos, poderá perder por abandono. Deseja sair?'))return;await doAction('leave',{},false);closeViewer();stopTimers();S.room=null;S.snapshot=null;S.selectedTable=null;closeGameWindow(true);S.roomEpoch++;S.yt?.pauseVideo?.();S.trackKey='';localStorage.removeItem('tdb_hub_last_room');setView('home');refreshRooms();toast('Você saiu da sala.')});
$('#room-delete').addEventListener('click',async()=>{if(!S.room||!confirm('Excluir permanentemente esta sala e encerrar todas as mesas?'))return;const result=await doAction('room:delete',{},false);if(result){if(S.shareRoom===S.room)stopLocalShare(true);stopTimers();S.room=null;S.snapshot=null;S.roomEpoch++;localStorage.removeItem('tdb_hub_last_room');setView('home');refreshRooms();toast('Sala excluída.')}});
$('#room-settings').addEventListener('click',async()=>{
  const r=S.snapshot?.room;if(!r||!isHost())return;
  const f=await dialog({title:'Permissões da sala',description:'Somente o criador original pode alterar.',fields:[
    {name:'tables',value:r.permissions?.tables||'everyone',label:'Quem pode criar mesas',type:'select',options:[['everyone','Todos'],['owner','Somente criador'],['approved','Somente autorizados']]},
    {name:'add',value:r.permissions?.music?.add||'everyone',label:'Quem pode adicionar músicas',type:'select',options:[['everyone','Todos'],['owner','Somente criador']]},
    {name:'play',value:r.permissions?.music?.play||'everyone',label:'Quem pode pausar ou tocar',type:'select',options:[['everyone','Todos'],['owner','Somente criador']]},
    {name:'remove',value:r.permissions?.music?.remove||'owner',label:'Quem pode remover músicas',type:'select',options:[['owner','Somente criador'],['everyone','Todos']]},
    {name:'next',value:r.permissions?.music?.next||'owner',label:'Quem pode pular faixas',type:'select',options:[['owner','Somente criador'],['everyone','Todos']]},
    {name:'voteSkip',value:String(r.permissions?.music?.voteSkip!==false),label:'Votação para pular',type:'select',options:[['true','Ativada'],['false','Desativada']]}
  ]});
  if(f)await doAction('room:settings',{tables:f.tables,music:{add:f.add,play:f.play,remove:f.remove,next:f.next,seek:f.next,select:f.next},voteSkip:f.voteSkip==='true'});
});
$('#copy-code').addEventListener('click',async()=>{if(!S.room)return;try{await navigator.clipboard.writeText(S.room);toast('Código copiado!')}catch{toast(`Código: ${S.room}`)}});
function updateRoom(old){const r=S.snapshot?.room;if(!r)return;$('#room-name').textContent=r.name;$('#where').textContent=r.name;$('#room-code-text').textContent=r.code;$('#room-member-count').textContent=formatCount(r.members.length);show('#room-settings',isHost());show('#room-delete',isHost());if(!old||JSON.stringify(old.room?.tables)!==JSON.stringify(r.tables))renderTables();if(S.tab==='members'&&(!old||JSON.stringify(old.room?.members)!==JSON.stringify(r.members)))renderMembers();if(!old||JSON.stringify(old.messages)!==JSON.stringify(S.snapshot.messages))renderMessages();syncMusic(r.music);syncShare(r.screens||[]);renderSelectedGame();renderSocialPreview();}
function selectTab(name){S.tab=name;$$('.tab').forEach(b=>b.classList.toggle('selected',b.dataset.tab===name));show('#tables-panel',name==='tables');show('#chat-panel',name==='chat');show('#members-panel',name==='members');if(name==='members')renderMembers()}
// Side previews are read-only mirrors of the already-authorized room snapshot.
// They do not create a second chat stream or bypass the existing API.
function renderSocialPreview(){
  const room=S.snapshot?.room;if(!room)return;
  const people=$('#social-members-preview');
  if(people){
    const members=Array.isArray(room.members)?room.members:[];
    const html=members.slice(0,5).map(u=>`<div class="social-person"><span class="avatar">${esc(shortName(u.username))}</span><span class="social-person-info"><b>${esc(u.username)}</b><small>${u.id===room.ownerId?'★ Criador da sala':'Participante'}</small></span><span class="live-pulse"></span></div>`).join('')+(members.length>5?`<span class="social-more">+ ${members.length-5} participantes</span>`:'')||'<span class="subtle">Ninguém na sala.</span>';
    if(people.dataset.signature!==html){people.dataset.signature=html;people.innerHTML=html}
  }
  const messages=$('#social-chat-preview');
  if(messages){
    const recent=(S.snapshot.messages||[]).slice(-4);
    const signature=JSON.stringify(recent);
    if(messages.dataset.signature!==signature){
      messages.dataset.signature=signature;
      messages.innerHTML=recent.map(m=>`<div class="social-mini-message"><div class="social-mini-message-header"><b>${esc(m.username)}</b><time>${new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></div><p>${esc(m.message)}</p></div>`).join('')||'<span class="subtle">Nenhuma mensagem ainda. Seja o primeiro!</span>';
      messages.scrollTop=messages.scrollHeight;
    }
  }
}

$$('.tab').forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.tab)));
function renderMembers(){const r=S.snapshot?.room;if(!r)return;
  $('#members-list').innerHTML=r.members.map(u=>`<div class="member-card ${r.ownerId===u.id?'owner':''}"><span class="avatar">${esc(shortName(u.username))}</span><div class="member-copy"><b>${esc(u.username)}</b><span>${r.ownerId===u.id?'Criador da sala':'Participante da sala'}</span></div>${isHost()&&u.id!==S.user.id?`<button class="btn btn-soft" data-tablegrant="${esc(u.id)}" title="Autorizar criação de mesas">✓ Mesa</button><button class="btn btn-outline" data-roomkick="${esc(u.id)}">Remover</button>`:`<small class="member-role ${r.ownerId===u.id?'owner':''}">${r.ownerId===u.id?'★ Criador':'● Online'}</small>`}</div>`).join('');
}
$('#members-list').addEventListener('click',async e=>{
  const k=e.target.closest('[data-roomkick]'),a=e.target.closest('[data-tablegrant]');
  if(k&&confirm('Remover e bloquear esta pessoa da sala?'))await doAction('room:kick',{userId:k.dataset.roomkick});
  if(a)await doAction('room:allow-table',{userId:a.dataset.tablegrant,allow:true});
});
function renderMessages(){const box=$('#messages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<110;box.innerHTML=(S.snapshot?.messages||[]).map(m=>{const own=(m.user_id||m.userId)===S.user?.id;return `<div class="message ${own?'own':''}"><div class="msg-avatar">${esc(shortName(m.username))}</div><div class="msg-body"><div class="msg-meta"><b>${esc(m.username)}</b><time>${new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></div><p>${esc(m.message)}</p></div></div>`}).join('')||'<div class="empty-state">Ainda não há mensagens. Puxe assunto!</div>';if(nearBottom)box.scrollTop=box.scrollHeight}
$('#chat-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('#chat-input'),val=input.value.trim();if(!val)return;input.value='';if(!await doAction('message',{message:val})){input.value=val}else input.focus()});
function tableCard(t){
  const me=t.players.some(p=>p.id===S.user.id),watch=t.watchers?.some(p=>p.id===S.user.id),organizer=t.ownerId===S.user.id,owner=isHost(),seats=t.settings?.seats||2,full=t.players.length>=seats;
  const state=t.status==='playing'?'● Ao vivo':t.status==='finished'?'Concluída':'Aguardando';
  const votes=t.rematchVotes||[],humans=t.players.filter(p=>!p.bot),ready=humans.every(p=>votes.includes(p.id));
  const card=t.players.map(p=>esc(p.username)+(p.bot?' 🤖':'' )).join(' × ');
  const watching=organizer?(t.watchers||[]).map(p=>`<div class="subtle">${esc(p.username)} está assistindo <button class="btn btn-outline" data-task="unwatch" data-user="${esc(p.id)}" data-id="${esc(t.id)}">Remover espectador</button></div>`).join(''):'';
  const req=(t.requests||[]).map(p=>`<div class="subtle">${esc(p.username)} quer assistir ${organizer?`<button class="btn btn-soft" data-task="approve" data-user="${esc(p.id)}" data-id="${t.id}">Aceitar</button><button class="btn btn-outline" data-task="deny" data-user="${esc(p.id)}" data-id="${t.id}">Recusar</button>`:''}</div>`).join('');
  return `<div class="table-card game-${esc(t.game)}"><div class="table-card-top"><span class="table-card-icon">${symbols[t.game]||'♟'}</span><span class="pill ${t.status==='playing'?'live':''}">${state}</span></div><h3>${gameNames[t.game]}${t.game==='truco'&&seats===4?' 2×2':''}</h3><div class="table-meta"><span>${t.players.length}/${seats} jogadores</span><span>${t.watchers?.length||0} espectador(es)</span></div><p>${card||'Aguardando jogadores'}</p><div class="card-actions">
    ${!me&&t.status==='waiting'&&!full?`<button class="btn btn-primary" data-task="join" data-id="${t.id}">Jogar</button>`:''}
    ${me||watch||t.settings?.spectators==='open'?`<button class="btn btn-soft" data-task="open" data-id="${t.id}">${me?'Abrir jogo':'Assistir'}</button>`:t.settings?.spectators==='approval'?`<button class="btn btn-outline" data-task="watch" data-id="${t.id}">Solicitar acesso</button>`:''}
    ${t.status==='waiting'&&organizer&&!full?`<button class="btn btn-soft" data-task="bot" data-id="${t.id}">+ BOT</button>`:''}
    ${t.status==='waiting'&&organizer&&t.players.length>1?`<button class="btn btn-soft" data-task="swap" data-id="${t.id}">Organizar equipes</button>`:''}
    ${t.status==='waiting'&&organizer&&full?`<button class="btn btn-primary" data-task="start" data-id="${t.id}">Iniciar</button>`:''}
    ${t.status==='finished'&&me&&!votes.includes(S.user.id)?`<button class="btn btn-soft" data-task="vote-rematch" data-id="${t.id}">Aceitar revanche</button>`:''}
    ${t.status==='finished'&&organizer&&ready?`<button class="btn btn-primary" data-task="restart" data-id="${t.id}">Iniciar revanche</button>`:''}
    ${organizer||owner?`<button class="btn btn-outline icon-only" data-task="remove" data-id="${t.id}" title="Encerrar mesa">×</button>`:''}
  </div>${req}${watching}</div>`;
}
function renderTables(){const r=S.snapshot?.room;if(!r)return;const tables=r.tables.filter(t=>t.game!=='pool');$('#tables-list').innerHTML=tables.length?tables.map(tableCard).join(''):'<div class="empty-state"><span>♟</span><h3>Que tal uma partida?</h3>Crie a primeira mesa e chame os amigos.</div>';if(S.selectedTable&&!tables.some(x=>x.id===S.selectedTable)){S.selectedTable=null;S.gameVersion='';closeGameWindow(true);show('#game-area',false)}}
// A criação acontece DENTRO da sala online, inclusive partidas contra BOT.
// O backend cria as vagas de BOT na mesma operação que cria a mesa.
async function createGameTable(defaultMode='friends'){
  if(!S.room){toast('Entre em uma sala para criar uma mesa.');return}
  const f=await dialog({title:'Nova mesa na sala',description:'Escolha o jogo e o tipo de adversário. As opções abaixo mudam de acordo com o jogo.',icon:'♟',submit:'Criar mesa',fields:[
    {name:'game',label:'Qual jogo?',type:'select',options:[['chess','♟ Xadrez'],['truco','♠ Truco']]},
    {name:'mode',label:'Com quem você quer jogar?',value:defaultMode,type:'select',options:[['friends','Com amigos da sala'],['bot','Com BOT dentro desta sala']]},
    {name:'seats',label:'Modalidade do Truco',type:'select',when:{game:'truco'},options:[['2','1×1 — dois jogadores'],['4','2×2 — quatro jogadores']]},
    {name:'clock',label:'Xadrez: relógio por jogador',type:'select',when:{game:'chess'},options:[['0','Sem relógio'],['60','1 minuto'],['180','3 minutos'],['300','5 minutos'],['600','10 minutos'],['900','15 minutos']]},
    {name:'color',label:'Xadrez: cor das suas peças',type:'select',when:{game:'chess'},options:[['random','Aleatória'],['white','Brancas'],['black','Pretas']]},
    {name:'trucoTurnTimer',label:'Truco: tempo por jogada',type:'select',when:{game:'truco'},options:[['0','Sem limite'],['30','30 segundos'],['60','60 segundos']]},
    {name:'botDifficulty',label:'Dificuldade dos BOTs',type:'select',when:{mode:'bot'},options:[['easy','Fácil'],['medium','Médio'],['hard','Difícil']]},
    {name:'botCount',label:'Quantos BOTs adicionar agora?',hint:'Os lugares restantes podem ser ocupados por amigos. Você também poderá incluir mais BOTs e organizar as equipes antes de iniciar.',type:'select',when:{game:'truco',seats:'4',mode:'bot'},options:[['1','1 BOT'],['2','2 BOTs'],['3','3 BOTs — jogar sozinho']]},
    {name:'spectators',label:'Quem pode assistir?',type:'select',options:[['open','Todos da sala'],['closed','Ninguém'],['approval','Somente com aprovação']]}
  ]});
  if(!f)return;
  const settings={spectators:f.spectators};
  if(f.game==='chess'){settings.clock=f.clock;settings.color=f.color}
  if(f.game==='truco'){settings.seats=f.seats;settings.turnTimer=f.trucoTurnTimer}
  const bots=f.mode==='bot'?(f.game==='truco'&&f.seats==='4'?Number(f.botCount||1):1):0;
  const result=await doAction('table:create',{game:f.game,settings,bots,botDifficulty:f.botDifficulty||'medium'});
  if(!result?.table)return;
  const table=result.table,seats=Number(table.settings?.seats||2);
  if(bots&&table.players?.length===seats){
    const started=await doAction('table:start',{tableId:table.id});
    if(started){openGameTable(table.id);selectTab('tables');await refresh();toast('Partida contra BOT iniciada nesta sala!')}
    else toast('Mesa com BOT criada. Você pode iniciá-la pelo cartão da mesa.');
  }else{
    toast(bots?'Mesa com BOT criada! Convide amigos ou adicione outros BOTs para completar.':'Mesa criada! Convide amigos ou adicione BOTs.');
  }
}
$('#new-table').addEventListener('click',()=>createGameTable('friends'));
$('#new-bot-table').addEventListener('click',()=>createGameTable('bot'));
$('#tables-list').addEventListener('click',async e=>{
  const b=e.target.closest('[data-task]');if(!b)return;
  const id=b.dataset.id,type=b.dataset.task;
  if(type==='open'){openGameTable(id);await refresh();return}
  if(type==='bot'){
    const f=await dialog({title:'Adicionar BOT',description:'O organizador escolhe a dificuldade individual.',icon:'🤖',submit:'Adicionar',fields:[{name:'difficulty',label:'Dificuldade',type:'select',options:[['easy','Fácil'],['medium','Médio'],['hard','Difícil']]}]});
    if(f)await doAction('table:bot',{tableId:id,difficulty:f.difficulty});return;
  }
  if(type==='swap'){
    const t=S.snapshot?.room?.tables.find(x=>x.id===id);if(!t)return;
    const options=t.players.map((p,i)=>[String(i),`${i+1} — ${p.username}${t.game==='truco'?` (Equipe ${i%2+1})`:''}`]);
    const f=await dialog({title:'Organizar equipes',description:'Troque duas posições. No Truco 2×2, posições 1 e 3 são a Equipe 1; 2 e 4 são a Equipe 2.',fields:[{name:'a',label:'Jogador A',type:'select',options},{name:'b',label:'Trocar com jogador B',type:'select',options}]});
    if(f)await doAction('table:swap',{tableId:id,a:Number(f.a),b:Number(f.b)});return;
  }
  if(type==='remove'&&!confirm('Encerrar mesa? Se houver partida ativa, será cancelada administrativamente.'))return;
  const result=await doAction(`table:${type}`,{tableId:id,...(b.dataset.user?{userId:b.dataset.user}:{})});
  if(result&&['start','join','watch','restart'].includes(type)){openGameTable(id);await refresh()}
  if(result&&type==='remove'&&S.selectedTable===id){S.selectedTable=null;S.gameVersion='';closeGameWindow(true);show('#game-area',false)}
});
function openGameTable(id){
  if(S.selectedTable!==id){S.selectedSq=null;S.trucoHideNext=false;}
  S.selectedTable=id;S.gameWindowTableId=id;S.gameVersion='';S.favoriteIds=new Set();S.libraryProfile=null;S.lastMusicLog='';
S.musicIntent='';S.musicNeedsInitialAlign=false;S.musicTrackChangedAt=0;S.musicLastSeekAt=0;S.musicDriftSince=0;S.musicLastIntentAt=0;
S.gameWindowMode='normal';
  // Reset position only when the user opens a new table.
  const win=$('#game-window');win?.style.removeProperty('left');win?.style.removeProperty('top');win?.style.removeProperty('transform');
}
function closeGameWindow(clearSelection=false){
  show('#game-window',false);show('#game-restore',false);S.favoriteIds=new Set();S.libraryProfile=null;S.lastMusicLog='';
S.musicIntent='';S.musicNeedsInitialAlign=false;S.musicTrackChangedAt=0;S.musicLastSeekAt=0;S.musicDriftSince=0;S.musicLastIntentAt=0;
S.gameWindowMode='normal';
  if(clearSelection){S.gameWindowTableId=null;S.trucoHideNext=false;S.selectedSq=null;}
}
function renderSelectedGame(){
  const container=$('#game-area'),table=S.snapshot?.room?.tables.find(t=>t.id===S.selectedTable&&t.game!=='pool');
  if(!table){show('#game-area',false);closeGameWindow(true);return}
  const classic=true; // Somente Xadrez e Truco disponíveis no TDB 8.1.3.
  show('#game-area',!classic);
  if(classic){
    S.gameWindowTableId=table.id;
    show('#game-window',S.gameWindowMode!=='minimized');show('#game-restore',S.gameWindowMode==='minimized');
    $('#game-window').classList.toggle('maximized',S.gameWindowMode==='maximized');
    $('#game-window-title').textContent=`${symbols[table.game]} ${gameNames[table.game]} • Mesa online`;
    $('#game-window-subtitle').textContent=`${S.snapshot.room.name} • ${table.players.map(p=>p.username).join(' × ')}`;
    $('#game-restore').textContent=`${symbols[table.game]} Retomar ${gameNames[table.game]}`;
  }
  const g=S.snapshot.game,version=`${table.id}:${table.status}:${g?.version||'none'}:${g?.phase||''}:${g?.status||''}`;
  if(version===S.gameVersion)return;
  S.gameVersion=version;
  if(classic){
    const body=$('#game-window-body');
    body.innerHTML=!g?`<div class="empty-state game-wait"><h3>Esperando participantes</h3><p>O organizador pode iniciar quando a mesa estiver completa.</p></div>`:table.game==='chess'?renderClassicChess(g,{selected:S.selectedSq,userId:S.user?.id}):renderClassicTruco(g,{userId:S.user?.id,hideMode:S.trucoHideNext});
    updateGameClocks();return;
  }
  const me=table.players.some(p=>p.id===S.user.id),top=`<div class="game-top"><div><h2>${symbols[table.game]} ${gameNames[table.game]}</h2><div class="game-sub">${table.players.map(p=>esc(p.username)).join(' × ')} • ${me?'Jogando':'Assistindo'}</div></div><button class="btn btn-outline" data-closegame="1">↶ Voltar às mesas</button></div>`;
  container.innerHTML=top+'<div class="empty-state">Jogo indisponível nesta versão.</div>';
}
function updateGameClocks(){
  const g=S.snapshot?.game;
  if(!g||g.game!=='chess'||!g.clockEnabled||!S.selectedTable)return;
  for(const color of ['white','black']){
    const el=$(`[data-chess-clock="${color}"]`);if(!el)continue;
    const running=g.status==='playing'&&!g.pausedAt&&g.turn===color;
    const time=Number(g.clocks?.[color]||0)-(running?Math.max(0,(Date.now()+S.clockOffset-Number(g.serverClockAt||Date.now()))/1000):0);
    el.textContent=`${String(Math.floor(Math.max(0,Math.ceil(time))/60)).padStart(2,'0')}:${String(Math.max(0,Math.ceil(time))%60).padStart(2,'0')}`;
  }
}
setInterval(updateGameClocks,1000);
function gameWindowClick(e){
  const ctl=e.target.closest('[data-window]');if(ctl){
    if(ctl.dataset.window==='close'){S.selectedTable=null;S.gameVersion='';closeGameWindow(true);toast('Janela fechada. Sua partida continua na mesa.');}
    else if(ctl.dataset.window==='minimize'){S.gameWindowMode='minimized';show('#game-window',false);show('#game-restore',true);}
    else if(ctl.dataset.window==='maximize'){S.gameWindowMode=S.gameWindowMode==='maximized'?'normal':'maximized';$('#game-window').classList.toggle('maximized',S.gameWindowMode==='maximized');$('#game-window').style.removeProperty('left');$('#game-window').style.removeProperty('top');$('#game-window').style.removeProperty('transform');}
    return;
  }
  const b=e.target.closest('[data-move],[data-truco],[data-truco-toggle-hide],[data-chess-action]');if(!b)return;
  if(b.dataset.move){chessMove(b.dataset.move);return}
  if(b.dataset.trucoToggleHide){S.trucoHideNext=!S.trucoHideNext;S.gameVersion='';renderSelectedGame();return}
  if(b.dataset.truco){const [type,value]=b.dataset.truco.split('|');
    const act=type==='PLAY_CARD'?{type,cardIdx:Number(value),hidden:!!S.trucoHideNext&&Number(S.snapshot?.game?.round)>0}:type==='RESPOND_RAISE'?{type,answer:value}:type==='ELEVEN_DECISION'?{type,play:value==='yes'}:{type};
    S.trucoHideNext=false;playAction(act);return;
  }
  if(b.dataset.chessAction){const type=b.dataset.chessAction;
    if(type==='pgn'){const text=chessPgn(S.snapshot?.game||{});navigator.clipboard?.writeText(text).then(()=>toast('PGN copiado.')).catch(()=>toast(text));return}
    if(type==='RESIGN'&&!confirm('Desistir desta partida de Xadrez?'))return;
    playAction({type});
  }
}
// Desktop: arrastar peças como no Xadrez original; toque/clique continua disponível.
$('#game-window').addEventListener('dragstart',e=>{
  const piece=e.target.closest('.chess-piece[draggable="true"]');
  const sq=piece?.closest('[data-move]');
  if(!sq||S.snapshot?.game?.game!=='chess'){e.preventDefault();return}
  S.chessDragFrom=sq.dataset.move;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',S.chessDragFrom);
});
$('#game-window').addEventListener('dragover',e=>{
  if(S.chessDragFrom&&e.target.closest('.chess-square[data-move]')){e.preventDefault();e.dataTransfer.dropEffect='move'}
});
$('#game-window').addEventListener('drop',async e=>{
  const square=e.target.closest('.chess-square[data-move]');
  if(!square||!S.chessDragFrom)return;
  e.preventDefault();
  const from=S.chessDragFrom,to=square.dataset.move;S.chessDragFrom=null;
  if(!S.selectedSq||`${S.selectedSq.r},${S.selectedSq.c}`!==from){S.selectedSq=null;await chessMove(from)}
  if(from!==to)await chessMove(to);
});
$('#game-window').addEventListener('dragend',()=>S.chessDragFrom=null);
$('#game-window').addEventListener('click',gameWindowClick);
$('#game-restore').addEventListener('click',()=>{if(!S.selectedTable)return;S.favoriteIds=new Set();S.libraryProfile=null;S.lastMusicLog='';
S.musicIntent='';S.musicNeedsInitialAlign=false;S.musicTrackChangedAt=0;S.musicLastSeekAt=0;S.musicDriftSince=0;S.musicLastIntentAt=0;
S.gameWindowMode='normal';show('#game-window',true);show('#game-restore',false)});
// Janela arrastável no desktop. Arrastar não interfere na partida.
$('#game-window-handle').addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('button')||S.gameWindowMode==='maximized'||matchMedia('(max-width:720px)').matches)return;
  const win=$('#game-window'),r=win.getBoundingClientRect();S.dragGame={pointerId:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};e.currentTarget.setPointerCapture(e.pointerId);
});
$('#game-window-handle').addEventListener('pointermove',e=>{
  if(!S.dragGame||S.dragGame.pointerId!==e.pointerId)return;
  const win=$('#game-window');win.style.left=`${Math.max(0,Math.min(innerWidth-win.offsetWidth,e.clientX-S.dragGame.dx))}px`;win.style.top=`${Math.max(0,Math.min(innerHeight-55,e.clientY-S.dragGame.dy))}px`;win.style.transform='none';
});
$('#game-window-handle').addEventListener('pointerup',()=>S.dragGame=null);
$('#game-window-handle').addEventListener('pointercancel',()=>S.dragGame=null);
$('#game-area').addEventListener('click',async e=>{
  if(e.target.closest('[data-closegame]')){S.selectedTable=null;S.gameVersion='';show('#game-area',false);return}
  const b=e.target.closest('[data-move],[data-truco],[data-game]');if(!b)return;
  if(b.dataset.move){await chessMove(b.dataset.move);return}
  if(b.dataset.truco){const [type,value]=b.dataset.truco.split('|');if(type==='RESIGN'&&!confirm('Tem certeza que deseja desistir da partida?'))return;const act=type==='PLAY_CARD'?{type,cardIdx:Number(value)}:type==='RESPOND_RAISE'?{type,answer:value}:type==='ELEVEN_DECISION'?{type,play:value==='yes'}:{type};await playAction(act);return}
});
let gameActionBusy=false;
async function playAction(act){
  if(!S.selectedTable||gameActionBusy)return;
  const tableId=S.selectedTable,roomEpoch=S.roomEpoch;
  gameActionBusy=true;
  const area=$('#game-window-body');area?.classList.add('game-pending');
  try{
    // A resposta já contém a visão autorizada do jogo: não repetir a consulta da sala.
    const r=await action('game:action',{tableId,action:{...act,expectedVersion:S.snapshot?.game?.version}});
    if(S.roomEpoch!==roomEpoch||S.selectedTable!==tableId)return;
    if(r?.game&&S.snapshot){
      S.snapshot.game=r.game;
      S.gameVersion='';
      renderSelectedGame();
      // Somente no encerramento precisamos atualizar o card/placar da sala.
      if(r.game.status==='finished'||r.game.status==='canceled'||r.game.status==='resigned'||r.game.status==='checkmate'||r.game.status==='draw'||r.game.phase==='finished'||r.game.phase==='abandoned')void refresh();
    }else void refresh();
  }catch(e){toast(e.message);if(/mudou|atualizad|version|versão/i.test(e.message))void refresh()}
  finally{gameActionBusy=false;$('#game-window-body')?.classList.remove('game-pending')}
}
const pieceMap={white:{king:'♔',queen:'♕',rook:'♖',bishop:'♗',knight:'♘',pawn:'♙'},black:{king:'♚',queen:'♛',rook:'♜',bishop:'♝',knight:'♞',pawn:'♟'}};
function chessHTML(g){const ranks=g.localColor==='black'?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7],files=g.localColor==='black'?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];const squares=ranks.flatMap(r=>files.map(c=>{const p=g.board[r][c];return `<button aria-label="Casa ${'abcdefgh'[c]}${8-r}" class="square ${(r+c)%2===0?'light':'dark'} ${S.selectedSq?.r===r&&S.selectedSq?.c===c?'selected':''} ${p?.color==='white'?'whitepiece':'blackpiece'}" data-move="${r},${c}">${p?pieceMap[p.color][p.type]:''}</button>`})).join('');const status=g.status==='playing'?`Vez das ${g.turn==='white'?'brancas':'pretas'}`:`Partida encerrada: ${esc(g.status)}`;return `<div class="game-status">${status} ${g.winner?`· Vencedor: ${g.winner}`:''}</div><div class="chess-board">${squares}</div><div class="game-controls"><button class="btn btn-outline" data-truco="OFFER_DRAW">Pedir empate</button><button class="btn btn-outline" data-truco="ACCEPT_DRAW">Aceitar empate</button><button class="btn btn-outline" data-truco="RESIGN">Desistir</button></div><p class="game-description">Selecione uma peça sua e depois a casa de destino. Roque e promoção são processados pelo servidor.</p>`}
async function chessMove(value){
  const g=S.snapshot?.game;if(!g||g.game!=='chess'||g.status!=='playing'||g.pausedAt||!g.localColor||g.turn!==g.localColor)return;
  const [r,c]=value.split(',').map(Number),p=g.board?.[r]?.[c];
  if(!S.selectedSq){if(p?.color===g.localColor){S.selectedSq={r,c};S.gameVersion='';renderSelectedGame()}return}
  const from=S.selectedSq;const options=chessMoveOptions(g,from);const legal=options.find(m=>m.to.r===r&&m.to.c===c);
  if(legal){
    let promotion='queen';
    if(legal.promotion){const f=await dialog({title:'Promoção do peão',description:'Escolha a peça para substituir o seu peão.',icon:'♕',submit:'Promover',fields:[{name:'piece',label:'Peça',type:'select',options:[['queen','♕ Dama'],['rook','♖ Torre'],['bishop','♗ Bispo'],['knight','♘ Cavalo']]}]});if(!f)return;promotion=f.piece}
    S.selectedSq=null;await playAction({type:'MOVE',from,to:{r,c},castle:legal.castle,promotion});return;
  }
  S.selectedSq=p?.color===g.localColor?{r,c}:null;S.gameVersion='';renderSelectedGame();
}
const suits={diamonds:'♦',spades:'♠',hearts:'♥',clubs:'♣'};
function playingCard(card,click){if(!card)return `<div class="playing-card">🂠</div>`;return `<button class="playing-card ${card.suit}" ${click||'disabled'}><b>${esc(card.rank)}</b><span>${suits[card.suit]||''}</span></button>`}
function trucoHTML(g){const me=g.players?.find(p=>p.id===S.user.id),active=me&&g.current===me.seat&&g.phase==='playing',hand=g.hands?.[g.localSeat]||[],turn=g.players?.find(p=>p.seat===g.current)?.username||'Jogador';let controls='';if(g.phase==='raise-response'&&me&&me.team===g.pendingRaise?.targetTeam)controls=`<button class="btn btn-primary" data-truco="RESPOND_RAISE|accept">Aceitar</button><button class="btn btn-soft" data-truco="RESPOND_RAISE|raise">Aumentar</button><button class="btn btn-outline" data-truco="RESPOND_RAISE|run">Correr</button>`;else if(g.phase==='eleven'&&me&&me.team===g.eleven?.team)controls=`<button class="btn btn-primary" data-truco="ELEVEN_DECISION|yes">Jogar mão de 11</button><button class="btn btn-outline" data-truco="ELEVEN_DECISION|no">Correr</button>`;else if(active)controls='<button class="btn btn-soft" data-truco="REQUEST_RAISE">Pedir Truco!</button>';return `<div class="game-status">${g.phase==='finished'?'Partida encerrada':`Vez: ${esc(turn)} • Rodada ${g.round+1}`} · Pontuação ${g.scores?.join(' × ')||'0 × 0'}</div><div class="truco-table"><p>Vira: <b>${esc(g.vira?.rank||'?')}${suits[g.vira?.suit]||''}</b> · Manilha: <b>${esc(g.manilhaRank||'?')}</b> · Valendo ${g.handValue} ponto(s)</p><div class="table-trick">${(g.trickCards||[]).map(t=>playingCard(t.card,'')).join('')||'<span class="subtle">Aguardando cartas na mesa</span>'}</div><div class="cards-hand">${hand.map((c,i)=>playingCard(c,c&&active?`data-truco="PLAY_CARD|${i}"`:'disabled')).join('')||'<span class="subtle">Aguardando cartas…</span>'}</div><div class="game-controls">${controls}</div></div><p class="game-description">Truco 1 contra 1 com regras processadas pelo servidor. Suas cartas ficam ocultas dos espectadores.</p>`}
function musicSyncStatus(text,status='waiting'){
  const el=$('#music-sync-state');if(!el)return;
  if(el.textContent!==text)el.textContent=text;
  el.dataset.status=status;
}
function expectedMusicTime(m){
  const start=Number(m.startedAt);
  const base=Math.max(0,Number(m.position)||0);
  return m.playing&&Number.isFinite(start)&&start>0
    ?Math.max(0,base+(Date.now()+S.clockOffset-start)/1000):base;
}
function logAudibleMusic(){
  const m=S.snapshot?.room?.music,track=m?.queue?.[m.index];
  if(!S.room||!m?.playing||!track||!S.audioArmed||!/^[A-Za-z0-9_-]{11}$/.test(track.videoId))return;
  const key=`${S.user?.id}:${S.room}:${track.videoId}:${m.index}`;
  if(S.lastMusicLog===key)return;
  S.lastMusicLog=key;
  request('/api/platform/music-profile',{action:{type:'RECORD_PLAY',roomCode:S.room,videoId:track.videoId}}).catch(()=>{S.lastMusicLog=''});
}
function syncMusic(m){
  if(!m)return;
  // O player incorporado deve permanecer visível quando há reprodução ativa.
  if(m.playing&&roomLayoutPrefs.music){roomLayoutPrefs.music=false;localStorage.setItem('tdb_hide_music_panel','no');applyRoomLayout()}
  $('#queue-count').textContent=String(m.queue.length);$('#music-label').textContent=m.playing?'● Tocando':'Pausada';$('#music-play').textContent=m.playing?'Ⅱ':'▶';
  const track=m.queue[m.index];$('#track-name').textContent=track?.title||'Nenhuma música tocando';
  $('#dock-now').textContent=track?.title||'Nenhuma música tocando';$('#dock-play').textContent=m.playing?'Ⅱ':'▶';
  $('#dock-play').setAttribute('aria-label',m.playing?'Pausar música':'Reproduzir música');show('#yt-placeholder',!track);
  if(m.revision!==S.queueRevision){
    S.queueRevision=m.revision;
    $('#queue').innerHTML=m.queue.map((t,i)=>`<div class="queue-item ${i===m.index?'active':''}"><span class="queue-index">${i===m.index?'♫':i+1}</span><span class="queue-track" title="${esc(t.title)}">${esc(t.title)}</span><button data-music="select" data-index="${i}" title="Tocar esta faixa">▶</button><button data-music="favorite" data-video="${esc(t.videoId)}" data-title="${esc(t.title)}" class="favorite-track" aria-pressed="${S.favoriteIds.has(t.videoId)}" title="Favoritar">${S.favoriteIds.has(t.videoId)?'♥':'♡'}</button><button data-music="remove" data-id="${esc(t.id)}" title="Remover">×</button></div>`).join('')||'<small class="subtle">Sua fila está vazia.</small>';
  }
  const changed=track?.videoId!==(S.trackKey||'');
  if(changed){
    S.trackKey=track?.videoId||'';S.musicIntent='';S.musicNeedsInitialAlign=!!track;S.musicDriftSince=0;S.musicTrackChangedAt=Date.now();S.musicLastSeekAt=Date.now();S.lastMusicLog='';
    if(S.yt)try{if(track)S.yt.cueVideoById(track.videoId);else S.yt.stopVideo()}catch{}
  }
  if(!track){musicSyncStatus('● Sem música na fila');return}
  if(!S.audioArmed||!S.youtubeReady){musicSyncStatus('◷ Ative o áudio neste navegador');return}
  if(!S.yt){musicSyncStatus('◷ Aguardando player do YouTube');return}
  try{
    const state=S.yt.getPlayerState?.();const now=Date.now();const targetIntent=`${track.videoId}:${m.playing?'play':'pause'}`;
    if(S.musicIntent!==targetIntent){
      S.musicIntent=targetIntent;S.musicLastIntentAt=now;S.musicDriftSince=0;
      if(m.playing){S.yt.playVideo?.()}else if(state===1){S.yt.pauseVideo?.()}
    }else if(m.playing&&state===2&&now-S.musicLastIntentAt>12000){
      // Recover a stalled/paused player at most once every 12 seconds.
      S.musicLastIntentAt=now;S.yt.playVideo?.();
    }
    if(!m.playing){musicSyncStatus('Ⅱ Música pausada');return}
    if(state===3||state===-1||state===5){musicSyncStatus('◷ YouTube carregando','waiting');S.musicDriftSince=0;return}
    if(state!==1){musicSyncStatus('◷ Aguardando reprodução','waiting');return}
    logAudibleMusic();
    const current=Number(S.yt.getCurrentTime?.()||0),expected=expectedMusicTime(m),drift=Math.abs(current-expected);
    if(!Number.isFinite(current)||!Number.isFinite(expected))return;
    // A primeira entrada tardia na sala pode precisar de UM ajuste imediato.
    // Isso não faz parte da rotina periódica de correção (que usa cooldown).
    if(S.musicNeedsInitialAlign&&now-S.musicTrackChangedAt>1100){
      S.musicNeedsInitialAlign=false;
      if(drift>4){S.yt.seekTo?.(expected,true);S.musicLastSeekAt=now;S.musicDriftSince=0;musicSyncStatus('● Alinhamento inicial concluído','ok');return}
    }
    if(drift<2.5){S.musicDriftSince=0;musicSyncStatus('● Sincronizado','ok');return}
    if(drift<=7){S.musicDriftSince=0;musicSyncStatus('● Reproduzindo · pequena diferença tolerada','ok');return}
    if(!S.musicDriftSince)S.musicDriftSince=now;
    musicSyncStatus('◷ Verificando sincronização','waiting');
    // 10 seconds of sustained large drift and 30 seconds cooldown avoid play/seek loops.
    if(now-S.musicDriftSince>10000&&now-S.musicLastSeekAt>30000&&now-S.musicTrackChangedAt>7000){
      S.yt.seekTo?.(expected,true);S.musicLastSeekAt=now;S.musicDriftSince=0;
      musicSyncStatus('↻ Correção pontual de sincronização','waiting');
    }
  }catch{musicSyncStatus('◷ Player não disponível','waiting')}
}
function readyYouTube(){if(!window.YT?.Player)return;S.yt=new window.YT.Player('yt-player',{height:'200',width:'320',videoId:'',playerVars:{playsinline:1,rel:0,origin:location.origin},events:{onReady:()=>{S.youtubeReady=true;const m=S.snapshot?.room?.music;if(m){S.trackKey='';syncMusic(m)}},onError:e=>{toast(`O YouTube não permitiu tocar este vídeo (${e.data}).`)},onStateChange:e=>{if(e.data===1){logAudibleMusic();if(S.musicNeedsInitialAlign)setTimeout(()=>{if(S.snapshot?.room?.music?.playing)syncMusic(S.snapshot.room.music)},1300)}if(e.data===0&&S.snapshot?.room?.music?.playing){const m=S.snapshot.room.music;const track=m.queue[m.index];if(track&&S.user?.id===S.snapshot.room.ownerId)musicAction('next')}}}})}
const ytWait=setInterval(()=>{if(window.YT?.Player){clearInterval(ytWait);readyYouTube()}},300);
async function musicAction(type,params={}){if(!S.room)return;return doAction('music',{action:{type,...params}})}
$('#music-form').addEventListener('submit',async e=>{e.preventDefault();const link=$('#music-link').value.trim();if(!link)return;const res=await musicAction('add',{url:link});if(res){$('#music-link').value='';toast('Música adicionada à playlist.')}});
$('#music-play').addEventListener('click',()=>musicAction(S.snapshot?.room?.music?.playing?'pause':'play'));
$('#music-prev').addEventListener('click',()=>musicAction('seek',{position:0}));$('#music-next').addEventListener('click',()=>musicAction('next'));
$('#music-vote').addEventListener('click',()=>musicAction('vote'));
$('#music-unlock').addEventListener('click',()=>{S.audioArmed=true;S.musicIntent='';try{S.yt?.unMute?.();S.yt?.setVolume?.(Number($("#music-volume").value)||0);if(S.snapshot?.room?.music?.playing)S.yt?.playVideo?.()}catch{}$('#music-unlock').textContent='Áudio ativo';toast('Áudio habilitado neste navegador.');});
$('#queue').addEventListener('click',async e=>{const b=e.target.closest('[data-music]');if(!b)return;
  if(b.dataset.music==='favorite'){
    b.disabled=true;try{const d=await request('/api/platform/music-profile',{action:{type:'TOGGLE_FAVORITE',track:{videoId:b.dataset.video,title:b.dataset.title}}});
      S.favoriteIds=new Set((d.favorites||[]).map(t=>t.videoId));
      b.setAttribute('aria-pressed',String(S.favoriteIds.has(b.dataset.video)));b.textContent=S.favoriteIds.has(b.dataset.video)?'♥':'♡';toast('Favoritos atualizados.');
    }catch(err){toast(err.message)}finally{b.disabled=false}return;
  }
  await musicAction(b.dataset.music,b.dataset.music==='select'?{index:Number(b.dataset.index)}:{id:b.dataset.id});
});
$('#music-volume').addEventListener('input',e=>{try{S.yt?.setVolume?.(Number(e.target.value))}catch{}localStorage.setItem('tdb_music_volume',e.target.value)});
$('#music-save').addEventListener('click',async()=>{if(!S.room)return;
  const f=await dialog({title:'Salvar playlist pessoal',description:'Copia as músicas da fila para sua biblioteca pessoal.',fields:[{name:'name',label:'Nome da playlist',required:true,max:30}]});if(!f)return;
  try{await request('/api/platform/music-profile',{action:{type:'SAVE_PRESET',roomCode:S.room,name:f.name}});toast('Playlist salva na sua conta.')}catch(e){toast(e.message)}
});
function libraryRows(profile,q=''){
  const fav=profile.favorites||[],presets=profile.presets||[],history=profile.history||[],needle=q.toLocaleLowerCase('pt-BR').trim();
  const match=t=>String(t||'').toLocaleLowerCase('pt-BR').includes(needle);
  const playlistHtml=presets.filter(p=>match(p.name)||(p.tracks||[]).some(t=>match(t.title))).map(p=>{
    const tracks=p.tracks||[];
    const rows=tracks.map((t,i)=>({t,i})).filter(({t})=>!needle||match(t.title)||match(p.name)).map(({t,i})=>`<div class="library-track"><span class="library-song">${esc(t.title||'YouTube')}</span><button data-library="add" data-video="${esc(t.videoId)}" title="Adicionar à fila">+ Fila</button><button data-library="move" data-id="${esc(p.id)}" data-from="${i}" data-to="${i-1}" title="Mover acima" ${i===0?'disabled':''}>↑</button><button data-library="move" data-id="${esc(p.id)}" data-from="${i}" data-to="${i+1}" title="Mover abaixo" ${i===tracks.length-1?'disabled':''}>↓</button><button data-library="remove" data-id="${esc(p.id)}" data-index="${i}" title="Remover da playlist">×</button></div>`).join('');
    return `<div class="library-row"><div><b>${esc(p.name)}</b><small>${tracks.length} músicas</small></div><div class="library-actions"><button class="btn btn-soft" data-library="load" data-id="${esc(p.id)}">+ Fila</button><button class="btn btn-outline" data-library="rename" data-id="${esc(p.id)}">Renomear</button><button class="btn btn-outline" data-library="delete" data-id="${esc(p.id)}">Excluir</button></div></div><div class="library-tracks">${rows}</div>`;
  }).join('')||'<p class="subtle">Nenhuma playlist encontrada.</p>';
  const favorites=fav.filter(f=>match(f.title)).map(f=>`<div class="library-track"><span class="library-song">♥ ${esc(f.title||'YouTube')}</span><button data-library="add" data-video="${esc(f.videoId)}">+ Fila</button></div>`).join('')||'<p class="subtle">Nenhum favorito encontrado.</p>';
  const recent=history.filter(h=>match(h.title)).slice(0,70).map(h=>`<div class="library-track"><span class="library-song">${esc(h.title||'YouTube')}<small> · ${new Date(h.playedAt).toLocaleString('pt-BR')}</small></span><button data-library="add" data-video="${esc(h.videoId)}" title="Reproduzir novamente">↻ Repetir</button></div>`).join('')||'<p class="subtle">Seu histórico aparecerá quando você ouvir músicas no TDB.</p>';
  return `<div class="library-section"><h3>Playlists pessoais (${presets.length})</h3>${playlistHtml}</div><div class="library-section"><h3>Favoritos (${fav.length})</h3>${favorites}</div><div class="library-section"><h3>Histórico de reprodução (${history.length})</h3>${recent}</div>`;
}
function renderLibrary(q=''){
  const data=$('#library-data');if(!data||!S.libraryProfile)return;
  data.innerHTML=`<div class="library-tools"><label for="library-search">Buscar músicas e playlists</label><input id="library-search" type="search" value="${esc(q)}" placeholder="Buscar na minha biblioteca" autocomplete="off"></div><div id="library-results">${libraryRows(S.libraryProfile,q)}</div>`;
}
async function openLibrary(){try{
  const {profile}=await request('/api/platform/music-profile');S.libraryProfile=profile;
  S.favoriteIds=new Set((profile.favorites||[]).map(t=>t.videoId));S.queueRevision=-1;if(S.snapshot?.room?.music)syncMusic(S.snapshot.room.music);
  renderLibrary();if(!$('#library-dialog').open)$('#library-dialog').showModal();
}catch(err){toast(err.message)}}
$('#music-library').addEventListener('click',openLibrary);
$('#library-close').addEventListener('click',()=>$('#library-dialog').close());
$('#library-data').addEventListener('input',e=>{
  if(e.target.id!=='library-search'||!S.libraryProfile)return;
  $('#library-results').innerHTML=libraryRows(S.libraryProfile,e.target.value);
});
$('#library-data').addEventListener('click',async e=>{
  const b=e.target.closest('[data-library]');if(!b)return;
  const type=b.dataset.library;
  if(type==='add'){
    if(!S.room){toast('Entre em uma sala para adicionar músicas à fila.');return}
    await musicAction('add',{url:`https://www.youtube.com/watch?v=${b.dataset.video}`});return;
  }
  if(type==='load'){
    if(!S.room){toast('Entre em uma sala para carregar playlists.');return}
    try{await request('/api/platform/music-profile',{action:{type:'APPLY_PRESET',roomCode:S.room,presetId:b.dataset.id}});toast('Playlist adicionada à fila.');await refresh()}catch(err){toast(err.message)}return;
  }
  if(type==='delete'&&!confirm('Excluir sua playlist pessoal?'))return;
  if(type==='remove'&&!confirm('Remover música desta playlist?'))return;
  let action=null;
  if(type==='rename'){
    const current=S.libraryProfile?.presets?.find(x=>x.id===b.dataset.id);
    const fields=[{name:'name',label:'Nome da playlist',value:current?.name||'',max:30,required:true}];
    const form=await dialog({title:'Renomear playlist',description:'Essa alteração afeta somente sua biblioteca pessoal.',icon:'♫',submit:'Salvar nome',fields});
    if(!form)return;action={type:'RENAME_PRESET',presetId:b.dataset.id,name:form.name};
  }else if(type==='delete')action={type:'DELETE_PRESET',presetId:b.dataset.id};
  else if(type==='move')action={type:'MOVE_PRESET_TRACK',presetId:b.dataset.id,from:Number(b.dataset.from),to:Number(b.dataset.to)};
  else if(type==='remove')action={type:'REMOVE_PRESET_TRACK',presetId:b.dataset.id,index:Number(b.dataset.index)};
  if(!action)return;
  b.disabled=true;
  try{
    const query=$('#library-search')?.value||'';
    const d=await request('/api/platform/music-profile',{action});
    if(d.presets)S.libraryProfile.presets=d.presets;
    renderLibrary(query);toast('Biblioteca pessoal atualizada.');
  }catch(err){toast(err.message);b.disabled=false}
});
$('#nav-history').addEventListener('click',async()=>{try{const d=await request('/api/profile/history');const items=d.recent||[];
  $('#history-data').innerHTML=items.length?items.map(x=>{const won=(x.winner_ids||[]).includes(S.user.id),lost=(x.loser_ids||[]).includes(S.user.id);const result=x.result_type==='canceled'?'Cancelada':won?'Vitória':lost?'Derrota':'Empate';return `<div class="history-row"><div><b>${esc(gameNames[x.game]||x.game)}</b> · ${esc(result)}<small>${new Date(x.finished_at).toLocaleString('pt-BR')} · ${esc(x.mode||'')} · ${(x.participants||[]).some(p=>String(p.id).startsWith('BOT-'))?'Contra BOT':'Multiplayer'}</small></div></div>`}).join(''):'<p class="subtle">Você ainda não tem partidas registradas.</p>';
  $('#history-dialog').showModal();}catch(err){toast(err.message)}});
$('#history-close').addEventListener('click',()=>$('#history-dialog').close());

// WebRTC: up to three independent broadcasters per room. Each spectator opens
// only the streams they choose, with independently controlled audio.
// No paid TURN/SFU dependency. Pure peer-to-peer: restrictive NATs may not connect.
const stun=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]; // STUN público sem garantia de disponibilidade; sem TURN/SFU contratado.
async function iceComplete(pc){if(pc.iceGatheringState==='complete')return;await new Promise(resolve=>{const done=()=>{clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',watch);resolve()};const watch=()=>{if(pc.iceGatheringState==='complete')done()};const timeout=setTimeout(done,9000);pc.addEventListener('icegatheringstatechange',watch)})}
function showBroadcastBar(){show('#broadcast-bar',!!S.stream);$('#broadcast-room').textContent=S.shareRoomName||S.shareRoom||'sala de origem';}
async function stopLocalShare(silent=false){
  const origin=S.shareRoom,session=S.shareSession;
  // Clear state first to prevent track-ended callbacks re-entering the stop routine.
  const stream=S.stream;S.stream=null;S.shareRoom=null;S.shareSession=null;clearInterval(S.shareTimer);S.shareTimer=null;
  for(const pc of S.peers.values())pc.close();S.peers.clear();stream?.getTracks?.().forEach(t=>t.stop());
  showBroadcastBar();
  if(origin&&session&&!silent)try{await actionIn(origin,'screen:stop',{sessionId:session})}catch(e){console.warn('[TDB share stop]',e.message)}
  if(S.room)await refresh();
}
function closeViewer(){for(const pc of S.viewerPcs.values())pc.close();S.viewerPcs.clear();S.shareSignature='';}
$('#broadcast-stop').addEventListener('click',()=>stopLocalShare());
$('#share-start').addEventListener('click',async()=>{
  if(!S.room)return;
  if(S.stream){toast('Você já transmite para outra sala. Encerre antes de iniciar novamente.');return}
  if(!navigator.mediaDevices?.getDisplayMedia){toast('Compartilhar tela exige navegador moderno e HTTPS.');return}
  let stream=null;
  try{
    stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:20,max:24},width:{ideal:1280,max:1920},height:{ideal:720,max:1080}},audio:true});
    const origin=S.room,originName=S.snapshot?.room?.name||origin;
    const d=await actionIn(origin,'screen:start');
    S.stream=stream;S.shareRoom=origin;S.shareSession=d.sessionId;S.shareRoomName=originName;
    clearInterval(S.shareTimer);S.shareTimer=setInterval(async()=>{if(S.shareRoom&&S.shareSession){try{await actionIn(S.shareRoom,'screen:heartbeat',{sessionId:S.shareSession})}catch(e){toast('A transmissão da sala de origem foi encerrada.');await stopLocalShare(true)}}},18000);
    stream.getVideoTracks()[0]?.addEventListener('ended',()=>stopLocalShare());
    showBroadcastBar();toast('Transmitindo para a sala de origem. Você pode navegar pelo TDB.');
    await refresh();
  }catch(e){stream?.getTracks?.().forEach(t=>t.stop());toast(e.message||'Captura cancelada.')}
});
$('#share-stop').addEventListener('click',()=>stopLocalShare());
async function watchScreen(session){
  if(S.viewerPcs.has(session.sessionId))return;
  const pc=new RTCPeerConnection({iceServers:stun,iceCandidatePoolSize:1});S.viewerPcs.set(session.sessionId,pc);
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='connected')toast('Transmissão conectada.');
    if(pc.connectionState==='failed'){
      toast('Não foi possível conectar diretamente. Esta versão gratuita não usa servidor TURN; tente outra rede ou conexão.');
      pc.close();S.viewerPcs.delete(session.sessionId);
    }
  };
  pc.addTransceiver('video',{direction:'recvonly'});pc.addTransceiver('audio',{direction:'recvonly'});
  pc.ontrack=e=>{const video=document.querySelector(`[data-screen-video="${session.sessionId}"]`);if(!video)return;
    video.srcObject=e.streams[0];video.muted=false;
    const saved=localStorage.getItem('tdb_stream_volume_'+session.ownerId);
    video.volume=saved===null?0.75:Math.max(0,Math.min(1,Number(saved)/100));
    video.play().catch(()=>toast('Clique no vídeo para ativar som e imagem.'));
  };
  try{await pc.setLocalDescription(await pc.createOffer());await iceComplete(pc);
    await actionIn(S.room,'signal:send',{to:session.ownerId,kind:'offer',sessionId:session.sessionId,payload:{sdp:pc.localDescription}});
    toast('Conectando à transmissão...');
  }catch(e){pc.close();S.viewerPcs.delete(session.sessionId);toast(e.message)}
}
$('#screens-list').addEventListener('click',async e=>{const b=e.target.closest('[data-moderate-screen]');if(b&&isHost()&&confirm('Encerrar transmissão deste participante?'))await doAction('screen:stop',{sessionId:b.dataset.moderateScreen});});
$('#screens-list').addEventListener('click',e=>{
  const b=e.target.closest('[data-watch-session]');if(!b)return;
  const entry=(S.snapshot?.room?.screens||[]).find(x=>x.sessionId===b.dataset.watchSession);
  if(entry)watchScreen(entry);
});
$('#screens-list').addEventListener('input',e=>{
  const b=e.target.closest('[data-screen-volume]');if(!b)return;
  const video=document.querySelector(`[data-screen-video="${b.dataset.screenVolume}"]`);
  const stream=(S.snapshot?.room?.screens||[]).find(x=>x.sessionId===b.dataset.screenVolume);
  if(video)video.volume=Number(b.value)/100;
  if(stream)localStorage.setItem('tdb_stream_volume_'+stream.ownerId,b.value);
});
function syncShare(screens){
  screens=Array.isArray(screens)?screens:[];
  $('#share-indicator').textContent=screens.length?`● ${screens.length}/3 ao vivo`:'Inativo';
  $('#share-meta').textContent=screens.length?`${screens.length} transmissão(ões) disponíveis nesta sala`:'Mostre sua tela para a sala';
  show('#share-start',!S.stream&&screens.length<3);
  show('#share-stop',!!S.stream&&S.shareRoom===S.room);
  show('#share-placeholder',screens.length===0);
  showBroadcastBar();
  const signature=screens.map(x=>x.sessionId).join('|');
  if(signature===S.shareSignature)return;S.shareSignature=signature;
  const current=new Set(screens.map(x=>x.sessionId));
  for(const [id,pc] of S.viewerPcs)if(!current.has(id)){pc.close();S.viewerPcs.delete(id)}
  $('#screens-list').innerHTML=screens.map(x=>{
    const own=x.ownerId===S.user?.id;
    const saved=Number(localStorage.getItem('tdb_stream_volume_'+x.ownerId)||75);
    return `<div class="screen-entry"><header><b>${esc(x.username)}</b><span class="subtle">${own?'Sua transmissão':'● Ao vivo'}</span></header>
      <video data-screen-video="${esc(x.sessionId)}" autoplay playsinline controls></video>
      <footer>${own?'Você está transmitindo':`<button class="btn btn-soft" data-watch-session="${esc(x.sessionId)}">▶ Assistir</button>`}${isHost()&&!own?`<button class="btn btn-outline" data-moderate-screen="${esc(x.sessionId)}">Encerrar</button>`:''}<span class="subtle">Volume</span><input aria-label="Volume de ${esc(x.username)}" data-screen-volume="${esc(x.sessionId)}" type="range" min="0" max="100" value="${Math.max(0,Math.min(100,saved))}"></footer></div>`;
  }).join('');
  if(S.stream){const video=document.querySelector(`[data-screen-video="${S.shareSession}"]`);if(video){video.srcObject=S.stream;video.muted=true}}
}
async function pollSignals(){
  if(S.signalBusy)return;
  const rooms=[...new Set([S.room,S.shareRoom].filter(Boolean))];if(!rooms.length)return;
  S.signalBusy=true;
  try{
    for(const origin of rooms){
      const cursor=S.shareCursors[origin]||0;
      const d=await actionIn(origin,'signal:pull',{after:cursor,sessionId:origin===S.shareRoom?S.shareSession:undefined});
      for(const sig of d.signals||[]){
        S.shareCursors[origin]=Math.max(S.shareCursors[origin]||0,Number(sig.id)||0);
        if(sig.kind==='offer'&&S.stream&&origin===S.shareRoom&&S.shareSession===sig.session_id){
          const key=sig.session_id+':'+sig.sender;
          S.peers.get(key)?.close();const pc=new RTCPeerConnection({iceServers:stun,iceCandidatePoolSize:1});S.peers.set(key,pc);
          pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){pc.close();S.peers.delete(key);console.warn('[TDB P2P] espectador sem conexão direta; TURN não contratado.')}};
          for(const track of S.stream.getTracks()){
            const sender=pc.addTrack(track,S.stream);
            if(track.kind==='video'&&typeof sender.getParameters==='function'){
              try{const params=sender.getParameters();if(params.encodings?.length){params.encodings[0].maxBitrate=1800000;sender.setParameters(params).catch(()=>{})}}catch{}
            }
          }
          await pc.setRemoteDescription(sig.payload.sdp);await pc.setLocalDescription(await pc.createAnswer());await iceComplete(pc);
          await actionIn(origin,'signal:send',{to:sig.sender,kind:'answer',sessionId:sig.session_id,payload:{sdp:pc.localDescription}});
        }else if(sig.kind==='answer'&&S.viewerPcs.has(sig.session_id)){
          const pc=S.viewerPcs.get(sig.session_id);
          if(pc.signalingState==='have-local-offer')await pc.setRemoteDescription(sig.payload.sdp);
        }
      }
    }
  }catch(e){console.warn('[TDB WebRTC]',e.message)}finally{S.signalBusy=false}
}
login();

try{const v=Number(localStorage.getItem("tdb_music_volume"));if(v>=0&&v<=100&&localStorage.getItem("tdb_music_volume")!==null)$("#music-volume").value=v}catch{}
