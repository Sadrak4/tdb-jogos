(function(){
'use strict';
let feedTimer=null,reconnectTimer=null,lastReactionIds=new Set(),loadingTimer=null,lastMaintenance={enabled:false};
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function user(){return window.TDBCore?.auth?.currentUser?.()||null}
function room(){return window.TDBCore?.rooms?.active?.()||null}
function settings(){return window.TDBCore?.storage?.get?.('tbd_settings',{})||{}}
function applyGraphics(){const s=settings();document.documentElement.dataset.motion=s.animations===false?'reduced':'full';document.documentElement.classList.toggle('tdb-particles-off',s.particles===false)}
function ensureLayer(){
  if(document.getElementById('tdbPlatformLayer'))return;
  const el=document.createElement('div');el.id='tdbPlatformLayer';el.innerHTML=`
    <div id="tdbMaintenanceOverlay" class="tdb-maintenance-overlay"></div>
    <div id="tdbAdminMaintenanceBar" class="tdb-admin-maintenance-bar"></div>
    <div id="tdbSyncOverlay" class="tdb-sync-overlay"><div><span class="tdb-sync-spinner"></span><strong id="tdbSyncText">Sincronizando…</strong></div></div>
    <div id="tdbReconnectWatch" class="tdb-reconnect-watch"></div>
    <div id="tdbGameDock" class="tdb-game-dock"></div>
    <aside id="tdbRoomSocial" class="tdb-room-social"><div class="tdb-social-head"><div><strong>Chat da sala</strong><small id="tdbSocialMeta"></small></div><button onclick="TDBPlatformUI.closeSocial()">×</button></div><div id="tdbReactionBar" class="tdb-reaction-bar"></div><div id="tdbRoomMessages" class="tdb-room-messages"></div><form id="tdbRoomChatForm" class="tdb-chat-form"><input id="tdbRoomChatInput" maxlength="280" placeholder="Mensagem para a sala…"><button>Enviar</button></form></aside>
    <div id="tdbReactionStage" class="tdb-reaction-stage"></div>`;
  document.body.appendChild(el);
  $('#tdbRoomChatForm').addEventListener('submit',sendMessage);
  $('#tdbReactionBar').innerHTML=['😂','🔥','👏','😮','❤️','👍'].map(e=>`<button type="button" onclick="TDBPlatformUI.react('${e}')">${e}</button>`).join('');
}
function showLoading(text='Sincronizando…',timeout=5000){ensureLayer();clearTimeout(loadingTimer);$('#tdbSyncText').textContent=text;$('#tdbSyncOverlay').classList.add('show');if(timeout)loadingTimer=setTimeout(hideLoading,timeout)}
function hideLoading(){clearTimeout(loadingTimer);$('#tdbSyncOverlay')?.classList.remove('show')}
function setMaintenance(value={}){
  ensureLayer();
  lastMaintenance=value||{enabled:false};
  const box=$('#tdbMaintenanceOverlay'),bar=$('#tdbAdminMaintenanceBar');
  const inAdmin=location.hash==='#admin';
  const adminBypass=!!value?.enabled&&!!value?.adminBypass&&!inAdmin;
  box.classList.remove('show');bar.classList.remove('show');
  if(inAdmin||!value?.enabled)return;
  if(adminBypass){
    bar.innerHTML=`<div><strong>🛠 MODO MANUTENÇÃO ATIVO</strong><span>Somente administradores podem usar o TDB agora.</span></div><div class="tdb-admin-maintenance-actions"><button onclick="TDBPlatformUI.openAdmin()">Painel ADM</button><button class="danger" onclick="TDBPlatformUI.endMaintenance()">Encerrar manutenção</button></div>`;
    bar.classList.add('show');
    return;
  }
  box.innerHTML=`<div><img src="assets/logo-transparent.png" alt=""><span>MANUTENÇÃO</span><h1>${esc(value.message||'TDB em manutenção • voltamos em breve')}</h1><p>Seu login continua seguro. Partidas e salas ficam bloqueadas até a manutenção terminar.</p><button class="tdb-maintenance-admin-link" onclick="TDBPlatformUI.openAdmin()">Acesso administrativo</button></div>`;
  box.classList.add('show');
}
function openAdmin(){location.hash='#admin'}
async function endMaintenance(){
  if(!window.TDBAdmin?.hasToken)return openAdmin();
  if(!confirm('Encerrar o modo manutenção e liberar o TDB para todos os usuários?'))return;
  try{
    const result=await window.TDBAdmin.setMaintenance(false,lastMaintenance?.message||'TDB em manutenção • voltamos em breve',{allowAdminAccess:true});
    lastMaintenance=result?.maintenance||{enabled:false};
    await window.TDBOnline?.refreshHealth?.();
    window.toast?.('Modo manutenção encerrado. TDB liberado para os usuários.');
  }catch(err){window.toast?.(err.message||'Não foi possível encerrar a manutenção.');openAdmin()}
}
function isGameScreen(){return !!document.querySelector('.blackjack-page,.chess-page,.truco-game,.truco-table,.pool-page,.music-page,.spectator-placeholder')}
function refreshDock(){ensureLayer();const r=room(),dock=$('#tdbGameDock');if(!r||!isGameScreen()){dock.classList.remove('show');return}const spectators=(r.spectators||[]).length;dock.innerHTML=`<button onclick="TDBPlatformUI.toggleFullscreen()" title="Tela cheia">⛶</button><button onclick="TDBPlatformUI.openSocial()" title="Chat e reações">💬</button><span>👁 ${spectators}</span>`;dock.classList.add('show')}
function toggleFullscreen(){if(!document.fullscreenElement){document.body.classList.add('tdb-game-focus');document.documentElement.requestFullscreen?.();}else{document.body.classList.remove('tdb-game-focus');document.exitFullscreen?.();}}
async function refreshFeed(){const r=room();if(!r||!window.TDBOnline?.connected)return;try{const feed=await window.TDBOnline.getRoomFeed(r.code);renderFeed(feed)}catch{}}
function renderFeed(feed){if(!feed)return;const box=$('#tdbRoomMessages');if(box){box.innerHTML=(feed.messages||[]).map(m=>`<div class="tdb-chat-msg ${m.userId===user()?.id?'mine':''}"><div class="avatar">${esc(m.avatar||String(m.username||'?').slice(0,2).toUpperCase())}</div><div><strong>${esc(m.username)}</strong><p>${esc(m.message)}</p><small>${new Date(m.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div></div>`).join('')||'<div class="tdb-chat-empty">Nenhuma mensagem ainda.</div>';box.scrollTop=box.scrollHeight}const meta=$('#tdbSocialMeta');if(meta)meta.textContent=`${Number(feed.spectatorCount||0)} espectador(es)`;for(const reaction of feed.reactions||[]){if(lastReactionIds.has(reaction.id))continue;lastReactionIds.add(reaction.id);spawnReaction(reaction)}if(lastReactionIds.size>100)lastReactionIds=new Set([...lastReactionIds].slice(-50))}
function spawnReaction(r){const stage=$('#tdbReactionStage');if(!stage)return;const el=document.createElement('div');el.className='tdb-reaction-pop';el.innerHTML=`<b>${esc(r.emoji)}</b><span>${esc(r.username)}</span>`;el.style.setProperty('--rx',`${20+Math.random()*60}vw`);stage.appendChild(el);setTimeout(()=>el.remove(),2200)}
async function sendMessage(e){e.preventDefault();const r=room(),input=$('#tdbRoomChatInput');const text=input?.value.trim();if(!r||!text)return;input.value='';try{await window.TDBOnline.sendRoomMessage(r.code,text);await refreshFeed()}catch(err){window.toast?.(err.message||'Não foi possível enviar.') }}
async function react(emoji){const r=room();if(!r)return;try{await window.TDBOnline.sendRoomReaction(r.code,emoji);await refreshFeed()}catch(err){window.toast?.(err.message||'Não foi possível reagir.') }}
function openSocial(){ensureLayer();$('#tdbRoomSocial').classList.add('open');refreshFeed();clearInterval(feedTimer);feedTimer=setInterval(refreshFeed,2200)}
function closeSocial(){$('#tdbRoomSocial')?.classList.remove('open');clearInterval(feedTimer);feedTimer=null}
function refreshReconnect(){ensureLayer();const r=room(),box=$('#tdbReconnectWatch');if(!r){box.classList.remove('show');return}const disconnected=(r.players||[]).filter(p=>p.connection==='reconnecting');if(!disconnected.length){box.classList.remove('show');return}box.innerHTML=disconnected.map(p=>{const left=Math.max(0,Math.ceil((Number(p.reconnectUntil||Date.now())-Date.now())/1000));return `<div><span class="pulse"></span><strong>${esc(p.username)} desconectou</strong><small>aguardando ${left}s</small></div>`}).join('');box.classList.add('show')}
function tick(){applyGraphics();refreshDock();refreshReconnect()}
window.addEventListener('tdb-online-status',e=>{setMaintenance(e.detail?.maintenance||{enabled:false});if(e.detail?.phase==='reconnecting')showLoading('Reconectando…',3500);else if(e.detail?.connected)hideLoading()});
window.addEventListener('tdb-maintenance',e=>setMaintenance(e.detail||{enabled:true}));
window.addEventListener('tdb-room-feed-update',e=>{if(room()?.code===e.detail?.roomCode)refreshFeed()});
window.addEventListener('hashchange',()=>setMaintenance(window.TDBOnline?.maintenance||{enabled:false}));
window.addEventListener('storage',applyGraphics);document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('tdb-game-focus')});
new MutationObserver(()=>setTimeout(()=>{
  refreshDock();
  // A playable screen already rendered: never leave the initial sync veil over it.
  if(document.querySelector('.truco-screen,.chess-screen,.pool-page,.blackjack-page,.music-screen')) hideLoading();
},10)).observe(document.getElementById('app'),{childList:true,subtree:false});
setInterval(tick,1000);reconnectTimer=setInterval(refreshReconnect,1000);
ensureLayer();applyGraphics();setMaintenance(window.TDBOnline?.maintenance||{enabled:false});
window.TDBPlatformUI={showLoading,hideLoading,setMaintenance,openAdmin,endMaintenance,openSocial,closeSocial,react,refreshFeed,toggleFullscreen,applyGraphics,refreshDock};
})();
