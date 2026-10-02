
window.addEventListener('error',event=>{
  console.error('[TDB] Erro de interface:',event.error||event.message);
});
window.addEventListener('unhandledrejection',event=>{
  console.error('[TDB] Promise rejeitada:',event.reason);
});


const app = document.getElementById('app');
const Core = window.TDBCore;

if(!Core){
  throw new Error('TDBCore não foi carregado antes do app.js');
}

const DEFAULT_SETTINGS = { sound: true, friendNotifications: true, animations: true, particles: true, masterVolume: 55, uiVolume: 42, gameVolume: 50, notificationVolume: 48 };

const state = {
  user: Core.auth.currentUser(),
  users: Core.auth.users(),
  friends: Core.storage.get('tbd_friends', []),
  rooms: Core.rooms.list(),
  settings: {...DEFAULT_SETTINGS,...Core.storage.get('tbd_settings', DEFAULT_SETTINGS)},
  view: 'login',
  selectedGame: null,
  activeRoom: Core.rooms.active(),
  roomFilter: 'all',
  social: {incoming:[],outgoing:[],invites:[]},
  userSearch: [],
  profileHistory: null,
  actionLocks: new Set(),
  botReturnRoom: null,
  notifiedInviteIds: new Set(),
  inviteToastTimer: null,
  knownRoomPlayers: new Set(),
  connectionStates: new Map()
};


window.addEventListener('tdb-online-sync',event=>{
  if(Core.mode!=='online'||window.__TDB_EXPLICIT_LOGOUT__===true) return;

  const syncKind=event.detail?.kind||'general';
  state.rooms=Core.rooms.list();

  // Keep active room data fresh, but never rebuild the current screen here.
  // This listener can fire from Realtime, polling and heartbeat-related updates.
  if(state.activeRoom && !state.activeRoom.simulation){
    const latest=state.rooms.find(r=>r.code===state.activeRoom.code);
    if(latest){
      const previousOwner=state.activeRoom.ownerId;
      const previousConnections=new Map((state.activeRoom.players||[]).map(p=>[p.id,p.connection||'online']));
      state.activeRoom=latest;
      Core.rooms.setActive(latest);
      for(const p of latest.players||[]){
        const before=previousConnections.get(p.id);
        const after=p.connection||'online';
        if(before&&before!==after){
          if(after==='reconnecting') toast(`${p.username} desconectou • aguardando reconexão.`);
          if(before==='reconnecting'&&after==='online') toast(`${p.username} reconectou.`);
        }
      }

      if(state.view==='waiting'){
        patchWaitingRoom(previousOwner!==latest.ownerId);

        if(latest.status==='playing' && ['truco','chess','blackjack'].includes(latest.game) && OnlineGameBridge.roomCode!==latest.code){
          OnlineGameBridge.start(latest,'player');
        }
      }
    }
  }

  if(syncKind==='rooms'){
    if(state.view==='lobby') patchLobbyDynamic();
    if(state.view==='game') patchGameRooms();
  }

  if(['social','friends','invites','presence'].includes(syncKind) && state.user){
    refreshSocialData(false);
  }


  // IMPORTANT: never call renderLobby(), drawGamePage() or renderWaitingRoom()
  // from background synchronization. Rebuilding #app caused the v5.2 flicker.
});

window.addEventListener('tdb-online-status',event=>{
  const detail=event.detail||{};
  const el=document.getElementById('onlineStatusPill');
  const ping=document.getElementById('onlinePingPill');
  if(ping) ping.textContent=Number.isFinite(detail.latencyMs)?`${detail.latencyMs} ms`:'';
  window.TDBPlatformUI?.setMaintenance?.(detail.maintenance||{enabled:false});
  if(!el) return;
  el.classList.remove('online','warning','connecting','offline');
  const phase=detail.phase||'connecting';
  if(detail.connected && detail.readyForMultiplayer){
    el.textContent=detail.realtime?'ONLINE':'ONLINE • FALLBACK'; el.classList.add('online');
  }else if(detail.connected && detail.production && !detail.supabase){
    el.textContent='SEM SUPABASE'; el.classList.add('warning');
  }else if(phase==='reconnecting'){
    el.textContent='RECONECTANDO…'; el.classList.add('connecting');
  }else if(phase==='connecting'){
    el.textContent='CONECTANDO…'; el.classList.add('connecting');
  }else{
    el.textContent='OFFLINE'; el.classList.add('offline');
  }
});


const OnlineGameBridge={
  roomCode:null,
  role:'player',
  start(room,role='player'){
    if(Core.mode!=='online' || !window.TDBOnline?.connected) return false;
    this.roomCode=room.code;
    this.role=role;
    window.TDBOnline.joinGame(room.code,state.user.id,role);
    return true;
  },
  stop(){
    window.TDBOnline?.stopGameSync?.();
    this.roomCode=null;
  },
  action(action){
    if(!this.roomCode) return false;
    return window.TDBOnline.gameAction(this.roomCode,state.user.id,action);
  }
};
window.OnlineGameBridge=OnlineGameBridge;

window.addEventListener('tdb-game-state',event=>{
  if(window.__TDB_EXPLICIT_LOGOUT__===true)return;
  const {roomCode,state:gameState}=event.detail||{};
  if(!gameState || roomCode!==OnlineGameBridge.roomCode) return;

  if(gameState.game==='chess'){
    state.view='playing-chess';
    window.applyOnlineChessState?.(gameState,state.activeRoom,OnlineGameBridge.role);
  }else if(gameState.game==='truco'){
    state.view='playing-truco';
    applyOnlineTrucoState(gameState,OnlineGameBridge.role);
  }else if(gameState.game==='blackjack'){
    state.view='playing-blackjack';
    window.applyOnlineBlackjackState?.(gameState,state.activeRoom,OnlineGameBridge.role);
  }
});

const games = {
  truco: { name: 'Truco', symbol: '🃏', subtitle: 'Blefe, parceria e resenha.', players: 4, minPlayers: 2, prefix: 'TRC' },
  blackjack: { name: 'Blackjack', symbol: '♠️', subtitle: 'Mesa premium contra dealer automático.', players: 3, minPlayers: 1, prefix: 'BLJ' },
  chess: { name: 'Xadrez', symbol: '♟️', subtitle: 'Partidas rápidas 1x1 entre amigos.', players: 2, minPlayers: 2, prefix: 'XDR' },
  music: { name: 'TDB Lobby', symbol: '◈', subtitle: 'Música, chat e compartilhamento de tela em uma sala.', players: 20, minPlayers: 1, prefix: 'MUS' }
};

Core.sound.setEnabled(state.settings.sound);
window.TDBSound?.configure?.({enabled:state.settings.sound,master:(state.settings.masterVolume??55)/100,ui:(state.settings.uiVolume??42)/100,game:(state.settings.gameVolume??50)/100,notification:(state.settings.notificationVolume??48)/100});

document.documentElement.dataset.motion=state.settings.animations===false?'reduced':'full';
document.documentElement.classList.toggle('tdb-particles-off',state.settings.particles===false);


function migrateUsers() {
  let changed = false;
  state.users = state.users.map(u => {
    if (!u.username && u.email) {
      u.username = u.email.split('@')[0];
      changed = true;
    }
    if (!u.avatar) { u.avatar = initials(u.username || 'J'); changed = true; }
    if (!u.status) { u.status = 'No lobby'; changed = true; }
    return u;
  });
  if (state.user && !state.user.username && state.user.email) {
    state.user.username = state.user.email.split('@')[0];
    changed = true;
  }
  if (changed) {
    saveUsers();
    if (state.user) saveSession(state.user);
  }
}
migrateUsers();


function logoTag(extra='') {
  return `<img ${extra} src="assets/logo-transparent.png" alt="TDB" onerror="this.style.display='none'">`;
}
function uiIcon(name,cls=''){ return window.TDBIcons?.svg?.(name,cls)||''; }
function greeting(){ const h=new Date().getHours(); return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'; }
function saveUsers(){ Core.auth.saveUsers(state.users); }
function saveFriends(){ Core.storage.set('tbd_friends', state.friends); }
function saveRooms(){ Core.rooms.replace(state.rooms); }
function saveSettings(){
  Core.storage.set('tbd_settings', state.settings);
  Core.sound.setEnabled(state.settings.sound);
  window.TDBSound?.configure?.({enabled:state.settings.sound,master:(state.settings.masterVolume??55)/100,ui:(state.settings.uiVolume??42)/100,game:(state.settings.gameVolume??50)/100,notification:(state.settings.notificationVolume??48)/100});
  window.TDBPlatformUI?.applyGraphics?.();
}
function saveSession(user){
  state.user=user;
  Core.auth.setCurrentUser(user);
  if(user){ setPresence('lobby'); window.TDBOnline?.heartbeatNow?.(); }
}
function saveActiveRoom(room){
  state.activeRoom=room;
  Core.rooms.setActive(room);
}

function genPlayerId(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out='TBD-';
  for(let i=0;i<6;i++) out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function genRoomCode(gameKey){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out=games[gameKey].prefix+'-';
  for(let i=0;i<4;i++) out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function initials(name='Jogador'){
  return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
}
function escapeHtml(str=''){
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>el.classList.remove('show'),2200);
}
function playUiSound(freq=460,duration=.055){
  if(!state.settings.sound) return;
  if(window.TDBSound?.tone){
    return window.TDBSound.tone({frequency:freq,duration,volume:.5,type:'triangle',category:'ui'});
  }
  try{
    window.TDBCore?.sound?.tone?.({frequency:freq,duration,volume:.018,type:'triangle'});
  }catch{}
}
function currentStatus(){
  if(state.activeRoom){
    const g=games[state.activeRoom.game];
    return state.activeRoom.status==='playing' ? `Jogando ${g.name}` : `Na sala de ${g.name}`;
  }
  return 'No lobby';
}



async function guardedAction(key,fn){
  if(state.actionLocks.has(key)) return false;
  state.actionLocks.add(key);
  try{return await fn()}finally{setTimeout(()=>state.actionLocks.delete(key),350)}
}
function connectionLabel(player){
  if(player?.connection!=='reconnecting') return '';
  const left=Math.max(0,Math.ceil((Number(player.reconnectUntil||Date.now())-Date.now())/1000));
  return ` • Reconectando (${left}s)`;
}
function renderInviteBanner(){
  const invites=state.social?.invites||[];
  if(!invites.length) return '';
  const i=invites[0];
  return `<div class="invite-banner"><strong>Convite de ${escapeHtml(i.sender?.username||'amigo')}</strong><span>Sala ${escapeHtml(i.room_code)}</span><button class="btn btn-primary btn-sm" onclick="respondRoomInvite(${i.id},true)">Entrar</button><button class="btn btn-dark btn-sm" onclick="respondRoomInvite(${i.id},false)">Recusar</button></div>`;
}


function privacyLabel(room){
  const map={public:'Pública',private:'Com senha',friends:'Somente amigos',invite:'Somente convite'};
  return map[room?.privacy]||'Pública';
}
function lobbyPulseHtml(){
  const presence=window.TDBOnline?.cache?.presence||{};
  const now=Date.now();
  const online=Object.values(presence).filter(p=>now-Number(p.updatedAt||0)<30000).length;
  const open=state.rooms.filter(r=>r.status==='open'&&(!r.emptyExpiresAt||Number(r.emptyExpiresAt)>now)).length;
  const friendsPlaying=state.friends.filter(f=>/^(Jogando|Ouvindo|Na sala)/.test(f.status||'')).length;
  return `<div class="lobby-pulse" id="lobbyPulse"><article><span>Jogadores online</span><strong>${online}</strong></article><article><span>Salas abertas</span><strong>${open}</strong></article><article><span>Amigos ativos</span><strong>${friendsPlaying}</strong></article></div>`;
}
function openFriendQuickProfile(id){
  const f=state.friends.find(x=>x.id===id);if(!f)return;
  document.getElementById('friendQuickModal')?.remove();
  const el=document.createElement('div');el.className='modal-backdrop';el.id='friendQuickModal';el.innerHTML=`<div class="modal"><div class="modal-head"><h3>${escapeHtml(f.username)}</h3><button class="icon-btn" onclick="document.getElementById('friendQuickModal').remove()">×</button></div><div class="modal-body"><div class="profile-card"><div class="profile-avatar-xl">${escapeHtml(f.avatar||initials(f.username))}</div><h2>${escapeHtml(f.username)}</h2><div class="code-box">${escapeHtml(f.id)}</div><p class="muted">${escapeHtml(f.status||'Offline')}</p></div></div><div class="modal-foot">${state.activeRoom?`<button class="btn btn-primary" onclick="inviteFriend('${f.id}')">Convidar para minha sala</button>`:''}</div></div>`;document.body.appendChild(el);
}
function copyRoomInvite(code){
  const text=`Entre na sala ${code} do TDB`;
  if(navigator.clipboard)navigator.clipboard.writeText(text).then(()=>toast('Convite copiado.'));
  else toast(text);
}

function setPresence(status,extra={}){
  if(state.user?.id) Core.presence.set(state.user.id,status,extra);
}
function getActiveMatchByRoom(roomCode){ return Core.matches.byRoom(roomCode); }
function upsertMatch(match){ Core.matches.upsert(match); Core.realtime.publish(`match:${match.matchId}`,match); return match; }
function finishMatch(matchId,reason='finished'){
  const matches=Core.matches.list(); const m=matches.find(x=>x.matchId===matchId); if(!m) return;
  m.status='finished'; m.finishedAt=Date.now(); m.finishReason=reason; Core.matches.replace(matches);
}
const EMPTY_ROOM_TTL_MS=5*60*1000;
function destroyRoomAndMatch(roomCode,reason='empty'){
  const m=getActiveMatchByRoom(roomCode); if(m) finishMatch(m.matchId,reason); removeLocalRoom(roomCode);
}
function currentRole(room){
  if(!room||!state.user) return 'none';
  if((room.players||[]).some(p=>p.id===state.user.id)) return 'player';
  if((room.spectators||[]).some(p=>p.id===state.user.id)) return 'spectator';
  return 'none';
}
function addSpectator(room,user){
  room.spectators=room.spectators||[];
  if(!room.spectators.some(s=>s.id===user.id)) room.spectators.push({id:user.id,username:user.username,avatar:user.avatar});
  syncLocalRoom(room);
}
function removeSpectator(room,userId){ room.spectators=(room.spectators||[]).filter(s=>s.id!==userId); syncLocalRoom(room); }
function publicLiveMatches(){
  return state.rooms.filter(r=>r.status==='playing').map(room=>({room,match:getActiveMatchByRoom(room.code),spectators:(room.spectators||[]).length}));
}
async function watchRoom(code){
  let room=getRoomByCode(code);
  if(!room) return toast('Sala não encontrada.');
  if(room.status!=='playing') return toast('Essa partida ainda não começou.');

  if(Core.mode==='online' && window.TDBOnline?.connected && ['truco','chess','blackjack'].includes(room.game)){
    if(!ensureOnlineMultiplayerReady()) return;

    const remoteRoom=await window.TDBOnline.watchRoom(code);
    if(!remoteRoom) return;
    room=remoteRoom;

    saveActiveRoom(room);
    setPresence('watching',{roomCode:room.code,game:room.game});
    OnlineGameBridge.start(room,'spectator');

    app.innerHTML=`${topbar()}<section class="spectator-placeholder">${logoTag()}<h1>Conectando à partida...</h1><p>Modo espectador online</p><button class="btn btn-secondary" onclick="leaveRoom()">Voltar</button></section>`;
    return;
  }

  addSpectator(room,state.user);
  saveActiveRoom(room);
  setPresence('watching',{roomCode:room.code,game:room.game});

  if(room.game==='chess' && typeof window.renderChessSpectator==='function') return window.renderChessSpectator(room);
  if(room.game==='truco' && typeof window.renderTrucoSpectator==='function') return window.renderTrucoSpectator(room);
  toast('Modo espectador indisponível.');
}
window.watchRoom=watchRoom;

function humanPlayers(room){
  return (room.players||[]).filter(p=>!p.bot && !String(p.id||'').startsWith('BOT-'));
}
function botPlayers(room){
  return (room.players||[]).filter(p=>p.bot || String(p.id||'').startsWith('BOT-'));
}
function shouldDestroyBotOnlyRoom(room){
  return room?.game==='truco' && humanPlayers(room).length===0;
}
function syncLocalRoom(room){
  // Local adapter. Later this becomes the network/server adapter.
  if(!room || !room.code) return;
  const idx=state.rooms.findIndex(r=>r.code===room.code);
  if(idx>=0) state.rooms[idx]=structuredClone(room);
  else state.rooms.push(structuredClone(room));
  if(Core.mode==='online') Core.rooms.upsert(room);
  else saveRooms();
  saveActiveRoom(room);
}
function removeLocalRoom(code){
  state.rooms=state.rooms.filter(r=>r.code!==code);
  if(Core.mode==='online') Core.rooms.remove(code);
  else saveRooms();
  if(state.activeRoom?.code===code) saveActiveRoom(null);
}
function trucoDispatch(action,payload={}){
  if(truco?.onlineMode){
    const map={
      PLAY_CARD:{type:'PLAY_CARD',cardIdx:payload.cardIdx,hidden:!!payload.hidden},
      REQUEST_RAISE:{type:'REQUEST_RAISE'},
      RESPOND_RAISE:{type:'RESPOND_RAISE',answer:payload.action},
      ELEVEN_DECISION:{type:'ELEVEN_DECISION',play:!!payload.play}
    };
    if(map[action]) return OnlineGameBridge.action(map[action]);
    return false;
  }

  switch(action){
    case 'PLAY_CARD': return applyPlayCard(payload);
    case 'REQUEST_RAISE': return applyRequestRaise(payload);
    case 'RESPOND_RAISE': return applyRespondRaise(payload);
    case 'ELEVEN_DECISION': return applyLocalElevenDecision(payload);
    default:
      console.warn('[TDB Truco] Ação local desconhecida:',action);
      return false;
  }
}

function cleanupEmptyLocalRooms(){
  if(Core.mode==='online') return;
  const before=state.rooms.length;
  const activeCode=state.activeRoom?.code || null;
  const now=Date.now();

  state.rooms=state.rooms.filter(room=>{
    const humans=humanPlayers(room);

    if(room.simulation) return false;

    if(humans.length===0){
      if(!room.emptySince){
        room.emptySince=now;
        room.emptyExpiresAt=now+EMPTY_ROOM_TTL_MS;
        room.status='open';
        room.owner='';
        room.ownerId=null;
      }
      return now<Number(room.emptyExpiresAt||0);
    }

    delete room.emptySince;
    delete room.emptyExpiresAt;

    if(room.status==='playing' && room.code!==activeCode && room.game!=='music') return false;

    return true;
  });

  if(state.rooms.length!==before) saveRooms();
}
function getAllRooms(gameKey){
  cleanupEmptyLocalRooms();
  return state.rooms
    .filter(r=>r.game===gameKey)
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}

function roomCapacity(room){
  if(!room) return 0;
  if(room.game==='truco') return Number(room.trucoSeats||4);
  if(room.game==='blackjack') return 3;
  if(room.game==='music') return Number(room.musicCapacity||20);
  return games[room.game].players;
}

function getRoomByCode(code){
  cleanupEmptyLocalRooms();
  return state.rooms.find(r=>r.code===code);
}
function updateStoredRoom(room){
  const idx=state.rooms.findIndex(r=>r.code===room.code);
  if(idx>=0) state.rooms[idx]=room;
  else state.rooms.push(room);

  if(Core.mode==='online') Core.rooms.upsert(room);
  else saveRooms();

  saveActiveRoom(room);
}

function renderAuth(mode='login'){
  state.view=mode;
  const isRegister=mode==='register';
  app.innerHTML=`
  <section class="auth-shell fade-in">
    <aside class="auth-visual">
      <div class="brand-lockup">
        ${logoTag()}
        <div><div class="brand-name">TDB</div><div class="brand-sub">JOGOS ENTRE AMIGOS</div></div>
      </div>
      <div class="auth-copy">
        <h1>A espera ficou<br>mais divertida.</h1>
        <p>Truco, Xadrez, Blackjack e música em um só lugar. Entre com a galera e transforme aqueles minutos de fila em uma partida.</p>
        <div class="pill-row"><span class="pill">Truco</span><span class="pill">Blackjack</span><span class="pill">Xadrez</span><span class="pill">TDB Lobby</span></div>
      </div>
    </aside>
    <section class="auth-panel">
      <div class="auth-card">
        <h1>${isRegister?'Criar conta':'Entrar'}</h1>
        <p class="lead">${isRegister?'Escolha seu nome de usuário. Seu ID único é criado automaticamente.':'Entre usando seu nome de usuário e sua senha.'}</p>
        <form id="authForm" class="form-grid">
          <div class="field"><label>Nome de usuário</label><input id="username" maxlength="24" autocomplete="username" placeholder="Ex.: Renan" required></div>
          <div class="field"><label>Senha</label><input id="password" type="password" minlength="4" autocomplete="${isRegister?'new-password':'current-password'}" placeholder="Sua senha" required></div>
          ${isRegister?`<div class="field"><label>Confirmar senha</label><input id="password2" type="password" minlength="4" autocomplete="new-password" placeholder="Repita sua senha" required></div>`:''}
          <button class="btn btn-primary full" type="submit">${isRegister?'Registrar':'Entrar'}</button>
        </form>
        ${isRegister?`<div class="mini-note">Não pedimos e-mail nesta versão. Seu identificador público será algo como <strong>TBD-7X4K92</strong>.</div>`:''}
        <div class="auth-switch">${isRegister?'Já tem uma conta?':'Ainda não tem uma conta?'} <button class="link-btn" id="switchAuth">${isRegister?'Entrar':'Criar conta'}</button></div>
        <div class="auth-admin-link"><a href="#admin" class="link-btn">Administração</a></div>
      </div>
    </section>
  </section>`;
  document.getElementById('switchAuth').onclick=()=>renderAuth(isRegister?'login':'register');
  document.getElementById('authForm').onsubmit=async e=>{
    e.preventDefault();
    const username=document.getElementById('username').value.trim();
    const password=document.getElementById('password').value;
    const useServer=location.protocol!=='file:' && !!window.TDBAuthOnline;

    if(isRegister){
      const p2=document.getElementById('password2').value;
      if(username.length<3) return toast('Use pelo menos 3 caracteres no nome.');
      if(password.length<4) return toast('Use pelo menos 4 caracteres na senha.');
      if(password!==p2) return toast('As senhas não coincidem.');

      if(useServer){
        try{
          const user=await window.TDBAuthOnline.register(username,password,null);
          saveSession(user);
          state.user=user;
          window.__TDB_EXPLICIT_LOGOUT__=false;
          window.TDBSound?.play?.('success',{channel:'auth-success',dedupeMs:120});
          await window.TDBOnline?.resume?.();
          await window.TDBOnline?.refreshSnapshot?.();
          setTimeout(renderLobby,120);
          return;
        }catch(err){
          return toast(err.message||'Não foi possível criar a conta online.');
        }
      }

      if(state.users.some(u=>(u.username||'').toLowerCase()===username.toLowerCase())) return toast('Esse nome de usuário já está em uso.');
      const user={id:genPlayerId(),username,password,avatar:initials(username),status:'No lobby',createdAt:new Date().toISOString()};
      state.users.push(user);
      saveUsers();
      saveSession(user);
      window.TDBSound?.play?.('success',{channel:'auth-success',dedupeMs:120});
      setTimeout(renderLobby,180);
      return;
    }

    if(useServer){
      try{
        const user=await window.TDBAuthOnline.login(username,password);
        saveSession(user);
        state.user=user;
        window.__TDB_EXPLICIT_LOGOUT__=false;
        window.TDBSound?.play?.('success',{channel:'auth-success',dedupeMs:120});
        await window.TDBOnline?.resume?.();
        await window.TDBOnline?.refreshSnapshot?.();
        setTimeout(()=>{
          if(state.activeRoom && state.activeRoom.players?.some(p=>p.id===user.id)) renderWaitingRoom();
          else renderLobby();
        },120);
        return;
      }catch(err){
        return toast(err.message||'Nome de usuário ou senha incorretos.');
      }
    }

    const user=state.users.find(u=>(u.username||'').toLowerCase()===username.toLowerCase()&&u.password===password);
    if(!user) return toast('Nome de usuário ou senha incorretos.');
    saveSession(user);
    window.TDBSound?.play?.('success',{channel:'auth-success',dedupeMs:120});
    setTimeout(()=>{
      if(state.activeRoom && state.activeRoom.players?.some(p=>p.id===user.id)) renderWaitingRoom();
      else renderLobby();
    },180);
  };
}

function topbar(active='home'){
  return `<header class="topbar">
    <div class="topbar-left">
      <div class="top-brand" onclick="goHome()" style="cursor:pointer">${logoTag()}<strong>TDB</strong></div>
      <nav class="nav-links">
        <button data-label="Início" class="nav-link ${active==='home'?'active':''}" onclick="goHome()">${uiIcon('home')}<span>Início</span></button>
        <button data-label="Amigos" class="nav-link ${active==='friends'?'active':''}" onclick="renderFriends()">${uiIcon('friends')}<span>Amigos</span></button>
        <button data-label="Perfil" class="nav-link ${active==='profile'?'active':''}" onclick="renderProfile()">${uiIcon('profile')}<span>Perfil</span></button>
        <button data-label="Configurações" class="nav-link ${active==='settings'?'active':''}" onclick="renderSettings()">${uiIcon('settings')}<span>Configurações</span></button>
      </nav>
    </div>
    <div class="topbar-right">
      <span id="onlineStatusPill" class="online-status-pill ${window.TDBOnline?.readyForMultiplayer?'online':window.TDBOnline?.phase==='reconnecting'||window.TDBOnline?.phase==='connecting'?'connecting':'offline'}">${window.TDBOnline?.readyForMultiplayer?(window.TDBOnline?.realtime?'ONLINE':'ONLINE • FALLBACK'):window.TDBOnline?.phase==='reconnecting'?'RECONECTANDO…':window.TDBOnline?.phase==='connecting'?'CONECTANDO…':'OFFLINE'}</span><span id="onlinePingPill" class="online-ping-pill">${Number.isFinite(window.TDBOnline?.latencyMs)?`${window.TDBOnline.latencyMs} ms`:''}</span>
      <div class="profile-mini" onclick="renderProfile()" style="cursor:pointer"><div class="avatar">${escapeHtml(state.user?.avatar||initials(state.user?.username))}</div><div class="profile-lines"><strong>${escapeHtml(state.user?.username||'Jogador')}</strong><small>${escapeHtml(state.user?.id||'')}</small></div></div>
      <button class="btn btn-dark" title="Sair" onclick="logout()">${uiIcon('logout')}<span>Sair</span></button>
    </div>
  </header>`;
}

function renderLiveMatches(){
  const live=publicLiveMatches();
  if(!live.length) return `<div class="live-empty">Nenhuma partida ao vivo agora.</div>`;
  return live.map(({room,spectators})=>{
    const names=(room.players||[]).map(p=>escapeHtml(p.username)).join(room.game==='music'?' • ':' vs ');
    return `<article class="live-card"><div class="live-card-top"><strong>${games[room.game]?.name||room.game}</strong><span class="live-dot">● AO VIVO</span></div><h3>${names||'Partida em andamento'}</h3><p>Sala ${escapeHtml(room.code)} • 👁 ${spectators}</p><button class="btn btn-secondary" onclick="watchRoom('${room.code}')">Assistir partida</button></article>`;
  }).join('');
}

function exitActiveContext(reason='leave'){
  OnlineGameBridge.stop();
  const room=state.activeRoom;
  if(!room) return;

  if(Core.mode==='online' && window.TDBOnline?.connected && !room.simulation){
    window.TDBOnline.leaveRoom(room.code);
    saveActiveRoom(null);
    return;
  }

  const role=currentRole(room);

  if(role==='spectator'){
    room.spectators=(room.spectators||[]).filter(s=>s.id!==state.user?.id);
    if(state.rooms.some(r=>r.code===room.code)) syncLocalRoom(room);
    saveActiveRoom(null);
    return;
  }

  if(role==='player'){
    const leavingIsHost=room.ownerId===state.user?.id;
    room.players=(room.players||[]).filter(p=>p.id!==state.user?.id);
    const humans=humanPlayers(room);

    // Salas de simulação/bot continuam temporárias. Salas reais vazias
    // permanecem no lobby por 5 minutos e podem ser retomadas por outro jogador.
    if(humans.length===0){
      if(room.simulation){
        destroyRoomAndMatch(room.code,reason);
      }else{
        room.players=[];
        room.status='open';
        room.owner='';
        room.ownerId=null;
        room.emptySince=Date.now();
        room.emptyExpiresAt=room.emptySince+EMPTY_ROOM_TTL_MS;
        syncLocalRoom(room);
      }
      saveActiveRoom(null);
      return;
    }

    if(leavingIsHost){
      const nextHost=humans[0] || room.players[0];
      if(nextHost){
        room.ownerId=nextHost.id;
        room.owner=nextHost.username;
      }
    }

    syncLocalRoom(room);
    saveActiveRoom(null);
  }
}

function goHome(){
  try{
    exitActiveContext('go-home');
    setPresence('lobby');
    renderLobby();
  }catch(err){
    console.error('[TDB] Falha ao voltar ao início:',err);
    saveActiveRoom(null);
    renderLobby();
  }
}
window.goHome=goHome;


function patchLobbyDynamic(){
  if(state.view!=='lobby') return;
  const live=document.getElementById('lobbyLiveGrid');
  const gamesBox=document.getElementById('lobbyGameGrid');
  const friends=document.getElementById('lobbyFriendsGrid');
  const pulse=document.getElementById('lobbyPulseWrap');

  if(live) live.innerHTML=renderLiveMatches();
  if(gamesBox) gamesBox.innerHTML=gameCard('truco')+gameCard('blackjack')+gameCard('chess')+gameCard('music');
  if(friends) friends.innerHTML=state.friends.slice(0,3).map(friendCard).join('');
  if(pulse) pulse.innerHTML=lobbyPulseHtml();
}

function visibleRoomsForSelectedGame(){
  if(!state.selectedGame) return [];
  let rooms=getAllRooms(state.selectedGame);
  if(state.roomFilter==='open') rooms=rooms.filter(r=>r.status==='open');
  if(state.roomFilter==='playing') rooms=rooms.filter(r=>r.status==='playing');
  return rooms;
}

function patchGameRooms(){
  if(state.view!=='game') return;
  const list=document.getElementById('gameRoomList');
  const count=document.getElementById('gameRoomCount');
  if(!list) return;

  const rooms=visibleRoomsForSelectedGame();
  list.innerHTML=rooms.length?rooms.map(roomRow).join(''):`<div class="empty-state">Nenhuma sala nesse filtro.</div>`;
  if(count) count.textContent=`${rooms.length} encontrada${rooms.length===1?'':'s'}`;
}

function minimumPlayersForRoom(room){
  if(room.game==='truco')return Number(room.trucoSeats||4);
  if(room.game==='chess')return 2;
  if(room.game==='blackjack')return 1;
  return 1;
}
function waitingHostActions(room){
  const cap=roomCapacity(room);
  const enough=(room.players||[]).length>=minimumPlayersForRoom(room);
  const startDisabled=enough?'':`disabled title="Aguardando jogadores"`;
  if(room.game==='truco'){
    return `<button class="btn btn-secondary" onclick="startTrucoWithBots()">Testar com ${cap===2?'1 bot':'3 bots'}</button>
      <button class="btn btn-primary" ${startDisabled} onclick="startGame()">${enough?'Iniciar partida':'Aguardando jogadores'}</button>`;
  }
  if(room.game==='chess'){
    return `<button class="btn btn-secondary" onclick="launchChessBot()">Testar com bot</button>
      <button class="btn btn-primary" ${startDisabled} onclick="startGame()">${enough?'Iniciar partida':'Aguardando jogadores'}</button>`;
  }
  if(room.game==='blackjack'){
    return `<button class="btn btn-primary" onclick="startGame()">Abrir mesa de Blackjack</button>`;
  }
  if(room.game==='music')return `<button class="btn btn-primary" onclick="openMusicRoom()">Abrir TDB Lobby</button>`;
  return `<button class="btn btn-primary" ${startDisabled} onclick="startGame()">Iniciar partida</button>`;
}

function waitingNonHostAction(room){
  return room.game==='music'
    ? `<button class="btn btn-primary" onclick="openMusicRoom()">Entrar no player</button>`
    : `<span class="muted">Aguardando o host iniciar.</span>`;
}

function waitingPlayersHtml(room){
  const isHost=room.ownerId===state.user.id;
  const cap=roomCapacity(room);
  return `${(room.players||[]).map(p=>playerSlot(p,isHost)).join('')}
    ${Array.from({length:Math.max(0,Math.min(cap,6)-(room.players?.length||0))}).map(()=>`<div class="player-slot empty">Aguardando jogador...</div>`).join('')}
    ${cap>6?`<div class="player-slot empty">Capacidade da sala: ${cap}</div>`:''}`;
}

function patchWaitingRoom(forceActions=false){
  if(state.view!=='waiting' || !state.activeRoom) return;
  const room=state.activeRoom;
  const list=document.getElementById('waitingPlayerList');
  const host=document.getElementById('waitingHostName');
  const actions=document.getElementById('waitingActions');

  if(list) list.innerHTML=waitingPlayersHtml(room);
  if(host) host.textContent=room.owner||'—';

  if(actions && (forceActions || actions.dataset.ownerId!==String(room.ownerId||''))){
    const isHost=room.ownerId===state.user.id;
    actions.dataset.ownerId=String(room.ownerId||'');
    actions.innerHTML=`<button class="btn btn-dark" onclick="leaveRoom()">Sair da sala</button>
      ${isHost?waitingHostActions(room):waitingNonHostAction(room)}`;
  }
}


function renderLobby(){
  if(!state.user) return renderAuth('login');
  state.view='lobby';
  if(location.protocol!=='file:' && window.TDBOnline?.connected) refreshSocialData(false);
  app.innerHTML=`${topbar('home')}
  <section class="dashboard fade-in">
    ${renderInviteBanner()}
    <div class="hero-strip">
      <span class="eyebrow">${greeting()}, ${escapeHtml(state.user.username)}</span>
      <h1>A espera ficou mais divertida.</h1>
      <p>Seu espaço para jogar, assistir e ficar com a galera. Escolha uma experiência e entre direto na ação.</p>
    </div>
    <div id="lobbyPulseWrap">${lobbyPulseHtml()}</div>
    <div class="section-title"><div><h2>Partidas ao vivo</h2><p>Assista sem interferir na partida.</p></div></div>
    <div class="live-grid" id="lobbyLiveGrid">${renderLiveMatches()}</div>
    <div class="section-title"><div><h2>Escolha um jogo</h2><p>As salas ficam dentro de cada jogo.</p></div></div>
    <div class="game-grid" id="lobbyGameGrid">${gameCard('truco')}${gameCard('blackjack')}${gameCard('chess')}${gameCard('music')}</div>
    <div class="section-title"><div><h2>Amigos online</h2><p>Convide alguém para entrar na sua próxima mesa.</p></div><button class="link-btn" onclick="renderFriends()">Ver todos →</button></div>
    <div class="friends-grid" id="lobbyFriendsGrid">${state.friends.slice(0,3).map(friendCard).join('')}</div>
  </section>`;
}

function gameCard(key){
  const g=games[key], art=key==='truco'?'art-truco':key==='blackjack'?'art-blackjack':key==='chess'?'art-chess':'art-music';
  const open=getAllRooms(key).filter(r=>r.status==='open').length;
  return `<article class="game-card" onclick="renderGame('${key}')">
    <div class="game-art ${art}"></div><div class="game-symbol">${g.symbol}</div>
    <div class="game-content"><span class="game-count">${open} sala${open===1?'':'s'} aberta${open===1?'':'s'}</span><h3>${g.name}</h3><p>${g.subtitle}</p><button class="btn btn-primary">Ver salas ${uiIcon('chevron')}</button></div>
  </article>`;
}
function friendCard(f){
  const status=f.status||'Offline';
  const busy=/^(Jogando|Ouvindo|Na sala)/.test(status);
  const offline=status==='Offline';
  return `<div class="friend-card">
    <div class="avatar">${escapeHtml(f.avatar||initials(f.username))}</div>
    <div class="friend-meta" onclick="openFriendQuickProfile('${f.id}')"><strong>${escapeHtml(f.username)}</strong><span><i class="dot ${offline?'offline':busy?'busy':'online'}"></i>${escapeHtml(status)}</span><small>${escapeHtml(f.id)} • abrir perfil rápido</small></div>
    <button class="btn btn-dark" onclick="event.stopPropagation();inviteFriend('${f.id}')">Convidar</button>
  </div>`;
}

async function openInviteFriendsModal(){
  if(!state.activeRoom) return toast('Entre ou crie uma sala antes de convidar amigos.');
  if(window.TDBOnline?.connected) await refreshSocialData(false);
  document.getElementById('inviteFriendsModal')?.remove();

  const overlay=document.createElement('div');
  overlay.className='modal-backdrop';
  overlay.id='inviteFriendsModal';
  overlay.innerHTML=`<div class="modal invite-friends-modal">
    <div class="modal-head">
      <div>
        <h3>Convidar amigos</h3>
        <p class="muted">Você continua na sala enquanto envia os convites.</p>
      </div>
      <button class="icon-btn" onclick="closeInviteFriendsModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="invite-friend-list">
        ${state.friends.length?state.friends.map(f=>`<div class="social-row">
          <div class="avatar">${escapeHtml(f.avatar||initials(f.username))}</div>
          <div class="friend-meta"><strong>${escapeHtml(f.username)}</strong><small>${escapeHtml(f.id)}</small></div>
          <button class="btn btn-primary btn-sm" onclick="inviteFriendFromModal('${f.id}',this)">Convidar</button>
        </div>`).join(''):'<div class="muted">Você ainda não tem amigos adicionados.</div>'}
      </div>
    </div>
  </div>`;

  overlay.addEventListener('click',event=>{
    if(event.target===overlay) closeInviteFriendsModal();
  });
  document.body.appendChild(overlay);
}
function closeInviteFriendsModal(){
  document.getElementById('inviteFriendsModal')?.remove();
}
async function inviteFriendFromModal(id,button){
  if(!state.activeRoom) return toast('A sala não está mais ativa.');
  if(!window.TDBOnline?.connected) return toast('Servidor online indisponível.');
  if(button?.disabled) return;

  const original=button?.textContent||'Convidar';
  if(button){button.disabled=true;button.textContent='Enviando…'}

  try{
    const result=await guardedAction(`invite-${id}`,()=>window.TDBOnline.sendInvite(id,state.activeRoom.code));
    if(result?.ok){
      if(button) button.textContent='Enviado ✓';
      toast('Convite enviado. Você continua na sala.');
      setTimeout(()=>{
        if(button?.isConnected){
          button.disabled=false;
          button.textContent=original;
        }
      },1800);
    }else if(button){
      button.disabled=false;
      button.textContent=original;
    }
  }catch(err){
    if(button){button.disabled=false;button.textContent=original}
    toast(err.message||'Não foi possível enviar o convite.');
  }
}

async function inviteFriend(id){
  const friend=state.friends.find(x=>x.id===id);
  if(!state.activeRoom) return toast(`Entre ou crie uma sala antes de convidar ${friend?.username||'o amigo'}.`);
  return inviteFriendFromModal(id,null);
}


function renderGame(key){
  state.selectedGame=key; state.view='game'; state.roomFilter='all';
  drawGamePage();
}
function drawGamePage(){
  const key=state.selectedGame, g=games[key];
  const rooms=visibleRoomsForSelectedGame();
  app.innerHTML=`${topbar()}
  <section class="game-page fade-in game-page-${key}" style="--v7-game-art:url('assets/v7/${key==='music'?'lounge':key}.svg')">
    <div class="back-row">
      <div class="game-head"><div class="big-symbol">${g.symbol}</div><div><h1>${g.name}</h1><p>${g.subtitle} • até ${g.players} jogadores</p></div></div>
      <div class="room-actions"><button class="btn btn-primary" onclick="openCreateRoom()">${uiIcon('plus')} Criar sala</button><button class="btn btn-secondary" onclick="openJoinCode()">${uiIcon('key')} Entrar com código</button><button class="btn btn-dark" onclick="goHome()">${uiIcon('back')} Voltar</button></div>
    </div>
    <div class="filter-row">
      <button class="filter-chip ${state.roomFilter==='all'?'active':''}" onclick="setRoomFilter('all')">Todas</button>
      <button class="filter-chip ${state.roomFilter==='open'?'active':''}" onclick="setRoomFilter('open')">Abertas</button>
      <button class="filter-chip ${state.roomFilter==='playing'?'active':''}" onclick="setRoomFilter('playing')">Em andamento</button>
    </div>
    <div class="rooms-layout">
      <div class="panel">
        <div class="panel-header"><h2>Salas de ${g.name}</h2><span class="muted" id="gameRoomCount">${rooms.length} encontrada${rooms.length===1?'':'s'}</span></div>
        <div class="panel-body"><div class="room-list" id="gameRoomList">${rooms.length?rooms.map(roomRow).join(''):`<div class="empty-state">Nenhuma sala nesse filtro.</div>`}</div></div>
      </div>
      <aside class="panel side-info"><div class="panel-header"><h2>Como funciona</h2></div><div class="panel-body">
        <h3>Salas abertas</h3><p>Você pode entrar enquanto houver vaga. A sala pode ser pública, somente amigos, somente convite ou protegida por senha.</p>
        <h3 style="margin-top:22px;">${key==='chess'?'Xadrez Tradicional':key==='blackjack'?'Blackjack TDB':key==='music'?'TDB Lobby':'Em andamento'}</h3><p>${key==='chess'?'Partidas 1x1 com movimentos legais, xeque, mate, roque, en passant e promoção.':key==='blackjack'?'Até 3 jogadores contra o dealer. Pedir, parar, dobrar e separar, com entrada durante a rodada para jogar na próxima.':key==='music'?'Música compartilhada, chat e transmissão de tela opcional na mesma sala.':'Continuam visíveis para mostrar onde a galera está jogando.'}</p>
        <h3 style="margin-top:22px;">Seu jogo</h3><ul><li>Crie uma sala.</li><li>Compartilhe o código.</li><li>Convide amigos.</li></ul>
      </div></aside>
    </div>
  </section>`;
}
function setRoomFilter(filter){ state.roomFilter=filter; drawGamePage(); }
function roomRow(room){
  const g=games[room.game], cap=roomCapacity(room), open=room.status==='open', full=(room.players?.length||0)>=cap;
  const joinable=['music','blackjack'].includes(room.game) ? !full : (open&&!full);
  const watchable=room.status==='playing'&&['truco','chess','blackjack'].includes(room.game)&&!joinable;
  const empty=!(room.players||[]).length;
  const emptyLeft=empty&&room.emptyExpiresAt?Math.max(0,Math.ceil((Number(room.emptyExpiresAt)-Date.now())/60000)):0;
  const ownerLabel=empty?'Sala vazia':`Host: ${escapeHtml(room.owner||'—')}`;
  const spectators=(room.spectators||[]).length;
  return `<div class="room-row ${empty?'room-empty-grace':''}">
    <div class="room-name"><strong>${escapeHtml(room.name)}</strong><span>${room.code} • ${ownerLabel} ${room.privacy==='private'?'🔒':room.privacy==='friends'?'👥':room.privacy==='invite'?'✉️':''}${room.game==='truco'?` • ${cap===2?'1x1':'2x2'}`:''}${room.game==='music'?' • ◈ Lounge':room.game==='blackjack'?' • até 3 vs dealer':''}${empty&&emptyLeft?` • expira em ~${emptyLeft} min`:''}</span></div>
    <div class="room-stat"><strong>${room.players?.length||0}/${cap}</strong><span>${room.game==='music'?'Ouvintes':`Jogadores${spectators?` • 👁 ${spectators}`:''}`}</span></div>
    <div><span class="badge ${open?'open':'playing'}">${empty?'Vazia':room.game==='music'?(open?'Aberta':'Tocando'):room.game==='blackjack'?(open?'Aberta':'Rodada em andamento'):open?'Aberta':'Em andamento'}</span></div>
    <button class="btn ${joinable?'btn-primary':watchable?'btn-secondary':'btn-dark'}" ${joinable?`onclick="requestJoinRoom('${room.code}')"`:watchable?`onclick="watchRoom('${room.code}')"`:'disabled'}>${joinable?'Entrar':watchable?'Assistir':full?'Cheia':'Jogando'}</button>
  </div>`;
}
function openCreateRoom(){
  const g=games[state.selectedGame];
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="modalBackdrop"><div class="modal">
    <div class="modal-head"><h3>Criar jogo de ${g.name}</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field"><label>Nome da sala</label><input id="roomName" maxlength="30" value="Sala de ${escapeHtml(state.user.username)}"></div>
      <div class="field"><label>Privacidade</label><select id="roomPrivacy" class="select"><option value="public">Pública</option><option value="friends">Somente amigos</option><option value="invite">Somente convite</option><option value="private">Com senha</option></select></div>
      <div class="field"><label>Senha (usada em “Com senha”)</label><input id="roomPassword" maxlength="16" placeholder="Até 16 caracteres"></div>
      ${state.selectedGame==='truco'?`<div class="field"><label>Formato do truco</label><select id="trucoSeats" class="select"><option value="2">2 jogadores (1x1)</option><option value="4" selected>4 jogadores (2x2)</option></select></div><div class="field"><label>Tempo por jogada</label><select id="turnTimer" class="select"><option value="0">Sem limite</option><option value="30">30 segundos</option><option value="60">60 segundos</option></select></div>`:''}
      ${state.selectedGame==='chess'?`
        <div class="field"><label>Tempo da partida</label>
          <select id="chessClock" class="select">
            <option value="0">Sem relógio</option>
            <option value="60">1 minuto</option>
            <option value="180">3 minutos</option>
            <option value="300">5 minutos</option>
            <option value="600" selected>10 minutos</option>
            <option value="900">15 minutos</option>
          </select>
        </div>
        <div class="field"><label>Sua cor</label>
          <select id="chessColor" class="select">
            <option value="random" selected>Aleatória</option>
            <option value="white">Brancas</option>
            <option value="black">Pretas</option>
          </select>
        </div>`:''}
      ${state.selectedGame==='blackjack'?`
        <div class="field"><label>Tempo por decisão</label><select id="blackjackTurnTimer" class="select"><option value="15">15 segundos</option><option value="20" selected>20 segundos</option><option value="30">30 segundos</option><option value="0">Sem limite</option></select></div>
        <div class="field"><label>Aposta mínima</label><select id="blackjackMinBet" class="select"><option value="10">10 fichas</option><option value="25" selected>25 fichas</option><option value="50">50 fichas</option></select></div>
        <div class="field"><label>Fichas iniciais</label><select id="blackjackStartingChips" class="select"><option value="500">500</option><option value="1000" selected>1.000</option><option value="2000">2.000</option></select></div>
        <div class="field"><label>Baralhos no shoe</label><select id="blackjackDecks" class="select"><option value="1">1 baralho</option><option value="2">2 baralhos</option><option value="4" selected>4 baralhos</option></select></div>
        <div class="mini-note">Dealer para em qualquer 17 • Blackjack paga 3:2 • até 3 jogadores.</div>`:''}
      ${state.selectedGame==='music'?`
        <div class="field"><label>Quem controla o player</label>
          <select id="musicControl" class="select">
            <option value="everyone" selected>Todos na sala</option>
            <option value="host">Somente host</option>
          </select>
        </div>
        <div class="field"><label>Quem pode pular</label>
          <select id="musicSkipMode" class="select">
            <option value="vote" selected>Votação para pular</option>
            <option value="everyone">Todos podem pular</option>
            <option value="host">Somente host</option>
          </select>
        </div>
        <div class="field"><label>Limite de músicas por pessoa</label><select id="musicQueueLimit" class="select"><option value="3">3</option><option value="5" selected>5</option><option value="10">10</option><option value="0">Sem limite</option></select></div>`:''}
    </div></div>
    <div class="modal-foot"><button class="btn btn-dark" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="createRoom()">Criar sala</button></div>
  </div></div>`);
}
function openJoinCode(){
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="modalBackdrop"><div class="modal">
    <div class="modal-head"><h3>Entrar com código</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field"><label>Código da sala</label><input id="joinCode" maxlength="12" placeholder="Ex.: TRC-81KQ" style="text-transform:uppercase"></div>
      <div class="field"><label>Senha (se houver)</label><input id="joinPassword" maxlength="16" type="password" placeholder="Opcional"></div>
    </div></div>
    <div class="modal-foot"><button class="btn btn-dark" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="joinByCode()">Entrar</button></div>
  </div></div>`);
}
function closeModal(){ document.getElementById('modalBackdrop')?.remove(); }


function ensureOnlineLogin(){
  if(location.protocol==='file:') return true;
  if(!window.TDBAuthOnline?.hasToken){
    clearLocalSessionState();
    renderAuth('login');
    setTimeout(()=>toast('Faça login novamente para usar os recursos online.'),80);
    return false;
  }
  return true;
}

function ensureOnlineMultiplayerReady(){
  if(!window.TDBOnline) return true;
  if(window.TDBOnline.production && !window.TDBOnline.supabase){
    toast('O multiplayer precisa do Supabase. Conecte o banco, execute SUPABASE-SCHEMA.sql e faça um novo deploy.');
    return false;
  }
  if(location.protocol!=='file:' && !window.TDBOnline.connected){
    toast('Conectando ao servidor. Aguarde alguns segundos e tente novamente.');
    return false;
  }
  return true;
}

async function createRoom(){
  if(!ensureOnlineLogin()) return;
  if(location.protocol!=='file:' && window.TDBOnline && !ensureOnlineMultiplayerReady()) return;

  return guardedAction('create-room',async()=>{
    const name=document.getElementById('roomName').value.trim()||`Sala de ${state.user.username}`;
    const privacy=document.getElementById('roomPrivacy').value;
    const password=document.getElementById('roomPassword').value.trim();
    const turnTimer=state.selectedGame==='truco' ? Number(document.getElementById('turnTimer')?.value||0) : 0;
    const trucoSeats=state.selectedGame==='truco' ? Number(document.getElementById('trucoSeats')?.value||4) : null;
    const chessClock=state.selectedGame==='chess' ? Number(document.getElementById('chessClock')?.value||0) : null;
    const chessColor=state.selectedGame==='chess' ? (document.getElementById('chessColor')?.value||'random') : null;
    const musicControl=state.selectedGame==='music' ? (document.getElementById('musicControl')?.value||'everyone') : null;
    const musicSkipMode=state.selectedGame==='music' ? (document.getElementById('musicSkipMode')?.value||'vote') : null;
    const musicQueueLimit=state.selectedGame==='music' ? Number(document.getElementById('musicQueueLimit')?.value||5) : null;
    const blackjackTurnTimer=state.selectedGame==='blackjack' ? Number(document.getElementById('blackjackTurnTimer')?.value||20) : null;
    const blackjackMinBet=state.selectedGame==='blackjack' ? Number(document.getElementById('blackjackMinBet')?.value||25) : null;
    const blackjackStartingChips=state.selectedGame==='blackjack' ? Number(document.getElementById('blackjackStartingChips')?.value||1000) : null;
    const blackjackDecks=state.selectedGame==='blackjack' ? Number(document.getElementById('blackjackDecks')?.value||4) : null;

    const candidate={
      code:genRoomCode(state.selectedGame),game:state.selectedGame,name,
      owner:state.user.username,ownerId:state.user.id,privacy,password,status:'open',
      turnTimer,trucoSeats,chessClock,chessColor,musicControl,musicSkipMode,musicQueueLimit,blackjackTurnTimer,blackjackMinBet,blackjackStartingChips,blackjackDecks,
      players:[{username:state.user.username,id:state.user.id,avatar:state.user.avatar,connection:'online'}],
      spectators:[],createdAt:Date.now()
    };

    let room=candidate;
    if(Core.mode==='online' && window.TDBOnline?.connected){
      window.TDBPlatformUI?.showLoading?.('Criando sala…');
      room=await window.TDBOnline.upsertRoom(candidate);
      window.TDBPlatformUI?.hideLoading?.();
      if(!room) return false;
    }else{
      const i=state.rooms.findIndex(r=>r.code===room.code);
      if(i>=0) state.rooms[i]=room; else state.rooms.push(room);
      saveRooms();
    }

    const i=state.rooms.findIndex(r=>r.code===room.code);
    if(i>=0) state.rooms[i]=room; else state.rooms.push(room);
    saveActiveRoom(room);
    state.selectedGame=room.game;
    state.view=room.game==='music'?'music':'waiting';
    closeModal(); window.TDBSound?.play?.('roomJoin',{channel:'room-create',dedupeMs:120});
    if(room.game==='music') return openMusicRoom();
    renderWaitingRoom();
    return true;
  });
}

window.addEventListener('tdb-room-join-result',event=>{
  window.TDBPlatformUI?.hideLoading?.();
  const result=event.detail||{};
  if(!result.ok){
    state.view='game';
    return toast(result.error||'Não foi possível entrar na sala.');
  }

  const room=result.room;
  const i=state.rooms.findIndex(r=>r.code===room.code);
  if(i>=0) state.rooms[i]=room;
  else state.rooms.push(room);

  state.selectedGame=room.game;
  saveActiveRoom(room);
  closeModal();

  // Set the destination before realtime room updates can redraw the room list.
  state.view=room.game==='music'?'music':room.game==='blackjack'&&room.status==='playing'?'playing-blackjack':'waiting';

  if(room.game==='music') return openMusicRoom();
  if(room.game==='blackjack'&&room.status==='playing'){OnlineGameBridge.start(room,'player');return;}
  renderWaitingRoom();
});

async function requestJoinRoom(code){
  if(!ensureOnlineLogin()) return;
  if(location.protocol!=='file:' && window.TDBOnline && !ensureOnlineMultiplayerReady()) return;
  const room=getRoomByCode(code);
  if(!room) return toast('Sala não encontrada.');

  if(Core.mode==='online' && window.TDBOnline?.connected){
    let password='';
    if(room.privacy==='private' || room.hasPassword){
      password=prompt('Senha da sala:')||'';
      if(!password) return;
    }

    state.view='joining';
    window.TDBPlatformUI?.showLoading?.('Entrando na sala…');
    const sent=await guardedAction(`join-${code}`,()=>window.TDBOnline.joinRoom(code,password));

    if(!sent){
      state.view='game';
      window.TDBPlatformUI?.hideLoading?.();
      return toast('Conexão online indisponível. Tente novamente.');
    }
    return;
  }

  if(room.privacy==='private'){
    const pass=prompt('Senha da sala:');
    if(pass!==room.password) return toast('Senha incorreta.');
  }
  joinRoom(room);
}
function joinRoom(code,password=''){
  const source=typeof code==='object' ? code : getRoomByCode(code);
  const room=structuredClone(source);
  if(!room) return toast('Sala não encontrada.');
  if(room.status!=='open' && !['music','blackjack'].includes(room.game)) return toast('Essa partida já está em andamento.');
  if(room.password && room.password!==password) return toast('Senha incorreta.');

  if(!room.players.some(p=>p.id===state.user.id)){
    if(room.players.length>=roomCapacity(room)) return toast('A sala está cheia.');
    const wasEmpty=room.players.length===0;
    room.players.push({username:state.user.username,id:state.user.id,avatar:state.user.avatar,connection:'online'});
    if(wasEmpty){
      room.owner=state.user.username;
      room.ownerId=state.user.id;
      room.status='open';
      delete room.emptySince;
      delete room.emptyExpiresAt;
    }
    updateStoredRoom(room);
  }else{
    saveActiveRoom(room);
  }

  state.selectedGame=room.game;
  closeModal();
  window.TDBSound?.play?.('roomJoin',{channel:'room-join',dedupeMs:120});

  if(room.game==='music'){
    state.view='music';
    return openMusicRoom();
  }

  state.view='waiting';
  renderWaitingRoom();
}
async function joinByCode(){
  if(!ensureOnlineLogin()) return;
  if(location.protocol!=='file:' && window.TDBOnline && !ensureOnlineMultiplayerReady()) return;
  const code=document.getElementById('joinCode').value.trim().toUpperCase();
  const pass=document.getElementById('joinPassword').value;
  if(!code) return toast('Digite o código da sala.');

  const room=getRoomByCode(code);
  if(!room) return toast('Sala não encontrada.');
  state.selectedGame=room.game;

  if(Core.mode==='online' && window.TDBOnline?.connected){
    state.view='joining';
    window.TDBPlatformUI?.showLoading?.('Entrando na sala…');
    const sent=await guardedAction(`join-${code}`,()=>window.TDBOnline.joinRoom(code,pass));
    if(!sent){
      state.view='game';
      window.TDBPlatformUI?.hideLoading?.();
      return toast('Conexão online indisponível. Tente novamente.');
    }
    return;
  }

  joinRoom(code,pass);
}


function launchChessBot(){
  try{
    OnlineGameBridge.stop();
    state.botReturnRoom=state.activeRoom?structuredClone(state.activeRoom):null;
    state.view='bot-chess';
    if(!state.activeRoom || state.activeRoom.game!=='chess'){
      return toast('Entre em uma sala de Xadrez primeiro.');
    }
    if(typeof window.startChessWithBot!=='function'){
      console.error('[TDB] Módulo do Xadrez não carregado.');
      return toast('O módulo do Xadrez não carregou. Recarregue a página.');
    }
    window.startChessWithBot();
  }catch(err){
    console.error('[TDB] Erro ao iniciar partida com bot:',err);
    toast('Não foi possível iniciar a partida com o bot.');
  }
}
window.launchChessBot=launchChessBot;

function renderWaitingRoom(){
  if(state.activeRoom?.simulation && state.botReturnRoom){
    const latest=state.rooms.find(r=>r.code===state.botReturnRoom.code) || state.botReturnRoom;
    state.activeRoom=structuredClone(latest);
    Core.rooms.setActive(state.activeRoom);
    state.botReturnRoom=null;
  }

  if(!state.activeRoom) return renderLobby();
  state.view='waiting';

  if(Core.mode==='online' && window.TDBOnline?.connected && !state.activeRoom.simulation && state.activeRoom.status==='playing' && ['truco','chess','blackjack'].includes(state.activeRoom.game)){
    OnlineGameBridge.start(state.activeRoom,'player');
  }

  const room=state.activeRoom;
  if(state.__knownRoomCode!==room.code){state.knownRoomPlayers=new Set();state.__knownRoomCode=room.code;}
  const g=games[room.game];
  const isHost=room.ownerId===state.user.id;
  const cap=roomCapacity(room);

  const meta=
    room.game==='truco' ? ` • ${cap===2?'1x1':'2x2'}` :
    room.game==='chess' ? ` • 1x1 • ${room.chessClock?Math.floor(room.chessClock/60)+' min':'Sem relógio'}` :
    room.game==='blackjack' ? ` • até 3 jogadores • dealer automático` :
    room.game==='music' ? ` • Lounge compartilhado` : '';

  const hostActions=waitingHostActions(room);
  const nonHostAction=waitingNonHostAction(room);

  app.innerHTML=`${topbar()}
  <section class="waiting-room fade-in"><div class="waiting-card">
    <div class="waiting-hero"><div class="game-head"><div class="big-symbol">${g.symbol}</div><div>
      <h1>${escapeHtml(room.name)}</h1>
      <p>${g.name}${meta} • ${privacyLabel(room)} • Host: <span id="waitingHostName">${escapeHtml(room.owner)}</span></p>
      <div class="code-box">Código: <strong>${room.code}</strong><button class="link-btn" onclick="copyCode('${room.code}')">Copiar</button></div>
    </div></div></div>

    <div class="room-tools">
      <button class="btn btn-primary" onclick="copyRoomInvite('${room.code}')">${uiIcon('copy')} Copiar convite</button>
      <button class="btn btn-secondary" onclick="openInviteFriendsModal()">${uiIcon('invite')} Convidar amigos</button>
      <button class="btn btn-secondary" onclick="TDBPlatformUI.openSocial()">${uiIcon('chat')} Chat da sala</button>
      <button class="btn btn-dark" onclick="toggleFullscreen()">${uiIcon('fullscreen')} Tela cheia</button>
    </div>

    <div class="player-list" id="waitingPlayerList">
      ${waitingPlayersHtml(room)}
    </div>

    <div class="waiting-actions" id="waitingActions" data-owner-id="${escapeHtml(room.ownerId||'')}">
      <button class="btn btn-dark" onclick="leaveRoom()">Sair da sala</button>
      ${isHost?hostActions:nonHostAction}
    </div>
  </div></section>`;
}
function playerSlot(p,isHost){
  const canKick=isHost && p.id!==state.user.id;
  const known=state.knownRoomPlayers.has(p.id);state.knownRoomPlayers.add(p.id);
  return `<div class="player-slot ${known?'':'player-entry'}"><div class="avatar">${escapeHtml(p.avatar||initials(p.username))}</div><div class="slot-main"><strong>${escapeHtml(p.username)} ${p.id===state.activeRoom.ownerId?'<span class="host-tag">HOST</span>':''}</strong><div class="muted small">${escapeHtml(p.id||'Jogador')}${connectionLabel(p)}</div></div>${canKick?`<button class="btn btn-danger btn-sm" onclick="kickPlayer('${p.id}')">Expulsar</button>`:''}</div>`;
}
async function kickPlayer(id){
  const room=state.activeRoom;if(!room) return;
  if(Core.mode==='online'&&window.TDBOnline?.connected){
    const updated=await window.TDBOnline.kickPlayer(room.code,id);
    if(updated){state.activeRoom=updated;Core.rooms.setActive(updated);toast('Jogador removido da sala.');patchWaitingRoom(true)}
    return;
  }
  room.players=room.players.filter(p=>p.id!==id);updateStoredRoom(room);toast('Jogador removido da sala.');patchWaitingRoom(true);
}
function leaveRoom(){
  try{
    exitActiveContext('leave-room');
    setPresence('lobby');
    renderLobby();
  }catch(err){
    console.error('[TDB] Falha ao sair da sala:',err);
    saveActiveRoom(null);
    renderLobby();
  }
}

function openMusicRoom(){
  const room=state.activeRoom;
  if(!room || room.game!=='music') return toast('Entre em uma sala TDB Lobby primeiro.');
  if(typeof window.startMusicRoom!=='function') return toast('Módulo TDB Lobby não carregou.');

  state.view='music';

  // TDB Lobby is a persistent shared room, not a competitive match.
  // Do not flip it between open/playing or re-upsert it just to open the player.
  if(Core.mode!=='online'){
    updateStoredRoom(room);
  }

  setPresence('listening',{roomCode:room.code,game:'music'});

  try{
    window.startMusicRoom(structuredClone(room));
  }catch(err){
    console.error('[TDB Lobby] Falha ao abrir sala:',err);
    state.view='game';
    toast('Não foi possível abrir o TDB Lobby. Tente novamente.');
  }
}
window.openMusicRoom=openMusicRoom;

async function startGame(){
  return guardedAction('start-game',async()=>{
  const room=state.activeRoom;
  if(!room) return toast('Sala não encontrada.');
  const g=games[room.game];

  if(room.game==='music') return openMusicRoom();
  if((room.players||[]).length<minimumPlayersForRoom(room)) return toast(`A sala ainda precisa de ${minimumPlayersForRoom(room)} jogador(es).`);

  if(Core.mode==='online' && window.TDBOnline?.connected && ['truco','chess','blackjack'].includes(room.game)){
    if(!ensureOnlineMultiplayerReady()) return;

    const required=room.game==='truco'?roomCapacity(room):room.game==='chess'?2:1;
    if((room.players?.length||0)<required){
      return toast(`${g.name} precisa de ${required} jogador${required>1?'es':''}.`);
    }

    room.status='playing';
    state.view=room.game==='truco'?'playing-truco':room.game==='chess'?'playing-chess':'playing-blackjack';
    updateStoredRoom(room);
    setPresence('playing',{roomCode:room.code,game:room.game});
    // Prepare the bridge identity, but do not start polling yet.
    // Polling before /games/start could fetch the previous terminal match and reopen its result.
    OnlineGameBridge.stop();
    OnlineGameBridge.roomCode=room.code;
    OnlineGameBridge.role='player';
    window.TDBSound?.play?.('gameStart',{channel:'game-start',dedupeMs:180});

    window.TDBPlatformUI?.showLoading?.('Sincronizando partida…');
    const ok=await window.TDBOnline.startGame(room.code);
    window.TDBPlatformUI?.hideLoading?.();
    if(!ok){
      OnlineGameBridge.stop();
      room.status='open';
      state.view='waiting';
      updateStoredRoom(room);
      renderWaitingRoom();
      return;
    }

    // The fresh state was already returned by /games/start. Now enable recovery polling.
    window.TDBOnline.joinGame(room.code,state.user.id,'player');
    return;
  }

  if(room.game==='truco'){
    const cap=roomCapacity(room);
    if((room.players?.length||0)<cap) return toast(`Truco precisa de ${cap} jogador${cap>1?'es':''}. Use “Testar com bots” no modo local.`);
    room.status='playing';
    state.view='playing-truco';
    updateStoredRoom(room);
    upsertMatch({matchId:`TRUCO-${Date.now()}`,roomCode:room.code,game:'truco',status:'playing',players:structuredClone(room.players),createdAt:Date.now()});
    setPresence('playing',{roomCode:room.code,game:'truco'});
    window.TDBSound?.play?.('gameStart',{channel:'game-start',dedupeMs:180});
    return startTrucoGame(room,false);
  }

  if(room.game==='chess'){
    if((room.players?.length||0)<2) return toast('Xadrez precisa de 2 jogadores. Use “Testar com bot” no modo local.');
    room.status='playing';
    state.view='playing-chess';
    updateStoredRoom(room);
    upsertMatch({matchId:`CHESS-${Date.now()}`,roomCode:room.code,game:'chess',status:'playing',players:structuredClone(room.players),createdAt:Date.now()});
    setPresence('playing',{roomCode:room.code,game:'chess'});
    window.TDBSound?.play?.('gameStart',{channel:'game-start',dedupeMs:180});
    return window.startChessGame?.(room,false);
  }

  if(room.game==='blackjack') return toast('O Blackjack usa o servidor online para manter o dealer e o baralho sincronizados.');

  if((room.players?.length||0)<g.minPlayers) return toast(`Aguarde pelo menos ${g.minPlayers} jogador${g.minPlayers>1?'es':''}.`);
  room.status='playing';
  updateStoredRoom(room);
  window.TDBSound?.play?.('gameStart',{channel:'game-start',dedupeMs:180});
  toast(`Partida de ${g.name} iniciada.`);
  renderWaitingRoom();

  });
}
function copyCode(code){
  if(navigator.clipboard) navigator.clipboard.writeText(code).then(()=>toast('Código copiado.'));
  else toast(`Código: ${code}`);
}
function toggleFullscreen(){
  const gameLike=['playing-truco','playing-chess','playing-blackjack','music','watching'].includes(state.view)||!!document.querySelector('.blackjack-page,.chess-page,.truco-game,.truco-table,.music-page');
  if(!document.fullscreenElement){
    if(gameLike)document.body.classList.add('tdb-game-focus');
    document.documentElement.requestFullscreen?.();
  }else{
    document.body.classList.remove('tdb-game-focus');
    document.exitFullscreen?.();
  }
}

document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('tdb-game-focus')});

function renderFriends(skipRefresh=false){
  if(!state.user) return renderAuth('login');
  state.view='friends';
  const incoming=state.social.incoming||[],outgoing=state.social.outgoing||[],invites=state.social.invites||[];
  app.innerHTML=`${topbar('friends')}<section class="dashboard fade-in">
    <div class="page-head"><div><h1 class="page-title">Amigos</h1><p class="muted">Pedidos de amizade, busca por nome/ID e convites de sala.</p></div></div>
    ${invites.length?`<div class="panel social-alerts"><div class="panel-header"><h2>Convites de sala</h2><span class="badge open">${invites.length}</span></div><div class="panel-body">${invites.map(i=>`<div class="social-row"><div><strong>${escapeHtml(i.sender?.username||'Amigo')}</strong><small>Sala ${escapeHtml(i.room_code)}</small></div><div><button class="btn btn-primary btn-sm" onclick="respondRoomInvite(${i.id},true)">Entrar</button> <button class="btn btn-dark btn-sm" onclick="respondRoomInvite(${i.id},false)">Recusar</button></div></div>`).join('')}</div></div>`:''}
    <div class="two-col">
      <div class="panel"><div class="panel-header"><h2>Seus amigos</h2><span class="muted">${state.friends.length}</span></div><div class="panel-body"><div class="friend-list">${state.friends.length?state.friends.map(friendCard).join(''):'<div class="muted">Nenhum amigo adicionado.</div>'}</div></div></div>
      <div class="panel"><div class="panel-header"><h2>Buscar jogador</h2></div><div class="panel-body">
        <div class="field"><label>Nome ou ID TDB</label><input id="friendSearch" placeholder="Ex.: Sadrake ou TDB-AB12CD34" onkeydown="if(event.key==='Enter')searchPlayers()"></div>
        <button class="btn btn-primary full" style="margin-top:12px" onclick="searchPlayers()">Pesquisar</button>
        <div id="friendSearchResults" class="social-results">${renderUserSearchResults()}</div>
      </div></div>
    </div>
    <div class="two-col social-bottom">
      <div class="panel"><div class="panel-header"><h2>Pedidos recebidos</h2><span class="muted">${incoming.length}</span></div><div class="panel-body">${incoming.length?incoming.map(r=>`<div class="social-row"><div><strong>${escapeHtml(r.user?.username||r.sender_id)}</strong><small>${escapeHtml(r.sender_id)}</small></div><div><button class="btn btn-primary btn-sm" onclick="respondFriendRequest('${r.sender_id}',true)">Aceitar</button> <button class="btn btn-dark btn-sm" onclick="respondFriendRequest('${r.sender_id}',false)">Recusar</button></div></div>`).join(''):'<div class="muted">Nenhum pedido pendente.</div>'}</div></div>
      <div class="panel"><div class="panel-header"><h2>Pedidos enviados</h2><span class="muted">${outgoing.length}</span></div><div class="panel-body">${outgoing.length?outgoing.map(r=>`<div class="social-row"><div><strong>${escapeHtml(r.user?.username||r.receiver_id)}</strong><small>Aguardando resposta</small></div></div>`).join(''):'<div class="muted">Nenhum pedido enviado.</div>'}</div></div>
    </div>
  </section>`;
  if(!skipRefresh&&location.protocol!=='file:'&&window.TDBOnline?.connected) refreshSocialData(false);
}
function renderUserSearchResults(){
  const rows=state.userSearch||[];
  if(!rows.length) return '<div class="mini-note">Pesquise por nome ou pelo ID TDB-...</div>';
  return rows.map(u=>`<div class="social-row"><div class="avatar">${escapeHtml(u.avatar||initials(u.username))}</div><div class="friend-meta"><strong>${escapeHtml(u.username)}</strong><small>${escapeHtml(u.id)}</small></div><button class="btn btn-secondary btn-sm" onclick="sendFriendRequest('${u.id}')">Enviar pedido</button></div>`).join('');
}

function showRoomInviteToast(invite){
  if(!invite || state.notifiedInviteIds.has(invite.id)) return;
  state.notifiedInviteIds.add(invite.id);

  document.getElementById('roomInviteToast')?.remove();
  if(state.inviteToastTimer) clearTimeout(state.inviteToastTimer);

  const el=document.createElement('div');
  el.id='roomInviteToast';
  el.className='room-invite-toast';
  el.innerHTML=`<div class="room-invite-copy">
      <strong>🎮 Convite para jogar</strong>
      <span><b>${escapeHtml(invite.sender?.username||'Um amigo')}</b> convidou você para a sala <b>${escapeHtml(invite.room_code)}</b>.</span>
      <small>O aviso fecha em 10 segundos. O convite continua salvo em Amigos.</small>
    </div>
    <div class="room-invite-actions">
      <button class="btn btn-primary btn-sm" onclick="acceptRoomInviteToast(${invite.id})">Aceitar</button>
      <button class="btn btn-dark btn-sm" onclick="dismissRoomInviteToast()">Depois</button>
    </div>
    <div class="invite-progress"></div>`;
  document.body.appendChild(el);

  state.inviteToastTimer=setTimeout(()=>dismissRoomInviteToast(),10000);
}
function dismissRoomInviteToast(){
  if(state.inviteToastTimer) clearTimeout(state.inviteToastTimer);
  state.inviteToastTimer=null;
  document.getElementById('roomInviteToast')?.remove();
}
async function acceptRoomInviteToast(inviteId){
  dismissRoomInviteToast();
  const result=await guardedAction(`invite-toast-${inviteId}`,()=>window.TDBOnline.respondInvite(inviteId,true));
  if(!result) return;

  await refreshSocialData(false);

  if(result.room){
    const room=result.room;
    const index=state.rooms.findIndex(x=>x.code===room.code);
    if(index>=0) state.rooms[index]=room; else state.rooms.push(room);
    state.selectedGame=room.game;
    saveActiveRoom(room);
    toast('Convite aceito.');
    if(room.game==='music') return openMusicRoom();
    if(room.game==='blackjack'&&room.status==='playing'){state.view='playing-blackjack';OnlineGameBridge.start(room,'player');return;}
    state.view='waiting';
    return renderWaitingRoom();
  }

  if(result.roomCode){
    toast('Convite aceito. Entrando na sala…');
    return requestJoinRoom(result.roomCode);
  }
}

async function refreshSocialData(render=true){
  if(!window.TDBOnline?.connected) return;
  try{
    const summary=await window.TDBOnline.socialSummary();
    state.friends=summary.friends||[];
    state.social={incoming:summary.incoming||[],outgoing:summary.outgoing||[],invites:summary.invites||[]};
    saveFriends();

    if(state.view==='lobby') patchLobbyDynamic();
    if(state.view==='friends'){
      const list=document.querySelector('.friend-list');
      if(list) list.innerHTML=state.friends.length?state.friends.map(friendCard).join(''):'<div class="muted">Nenhum amigo adicionado.</div>';
    }

    const unseen=(state.social.invites||[]).find(i=>!state.notifiedInviteIds.has(i.id));
    if(unseen) showRoomInviteToast(unseen);
  }catch(err){
    console.warn('[TDB Social]',err);
  }
}
async function searchPlayers(){
  const q=document.getElementById('friendSearch')?.value.trim()||'';
  if(q.length<2)return toast('Digite pelo menos 2 caracteres.');
  try{state.userSearch=await window.TDBOnline.searchUsers(q);const box=document.getElementById('friendSearchResults');if(box)box.innerHTML=renderUserSearchResults()}catch(err){toast(err.message||'Falha na busca.')}
}
async function sendFriendRequest(id){
  if(!ensureOnlineLogin()) return;
  const result=await guardedAction(`friend-${id}`,()=>window.TDBOnline.addFriend(id));
  if(!result) return;
  toast(result.autoAccepted?'Pedido cruzado: amizade aceita automaticamente.':'Pedido de amizade enviado.');
  await refreshSocialData(false);
}
async function addFriendById(){
  const id=document.getElementById('friendId')?.value.trim().toUpperCase();if(!id)return toast('Digite o ID do jogador.');return sendFriendRequest(id);
}
async function respondFriendRequest(senderId,accept){
  const r=await guardedAction(`friend-response-${senderId}`,()=>window.TDBOnline.respondFriend(senderId,accept));if(r){toast(accept?'Amizade aceita.':'Pedido recusado.');await refreshSocialData(false)}
}
async function respondRoomInvite(inviteId,accept){
  const r=await guardedAction(`invite-response-${inviteId}`,()=>window.TDBOnline.respondInvite(inviteId,accept));
  if(!r) return;
  await refreshSocialData(false);
  if(accept&&r.room){
    const room=r.room;const i=state.rooms.findIndex(x=>x.code===room.code);if(i>=0)state.rooms[i]=room;else state.rooms.push(room);
    state.selectedGame=room.game;saveActiveRoom(room);toast('Convite aceito.');if(room.game==='music')return openMusicRoom();if(room.game==='blackjack'&&room.status==='playing'){state.view='playing-blackjack';OnlineGameBridge.start(room,'player');return;}return renderWaitingRoom();
  }
  if(accept&&r.roomCode){toast('Convite aceito. Entrando na sala…');return requestJoinRoom(r.roomCode)}
  toast('Convite recusado.');
  if(state.view==='friends') renderFriends(true);
  else if(state.view==='lobby') patchLobbyDynamic();
}

function renderProfile(){
  state.view='profile';
  app.innerHTML=`${topbar('profile')}<section class="dashboard fade-in">
    <div class="page-head"><div><h1 class="page-title">Seu perfil</h1><p class="muted">Histórico competitivo considera apenas partidas contra jogadores reais.</p></div></div>
    <div class="profile-grid">
      <div class="panel profile-card"><div class="profile-avatar-xl">${escapeHtml(state.user.avatar||initials(state.user.username))}</div><h2>${escapeHtml(state.user.username)}</h2><div class="code-box">${escapeHtml(state.user.id)} <button class="link-btn" onclick="copyCode('${state.user.id}')">Copiar</button></div><p class="muted">${currentStatus()}</p></div>
      <div class="panel"><div class="panel-header"><h2>Editar perfil</h2></div><div class="panel-body"><div class="form-grid"><div class="field"><label>Nome de usuário</label><input id="editUsername" maxlength="24" value="${escapeHtml(state.user.username)}"></div><div class="field"><label>Avatar curto</label><input id="editAvatar" maxlength="2" value="${escapeHtml(state.user.avatar||initials(state.user.username))}"></div><button class="btn btn-primary" onclick="saveProfile()">Salvar alterações</button></div></div></div>
    </div>
    <div id="profileCompetitive">${renderProfileHistory()}</div>
  </section>`;
  refreshProfileHistory();
}
function renderProfileHistory(){
  const h=state.profileHistory;if(!h)return `<div class="panel"><div class="panel-body"><div class="muted">Carregando histórico competitivo…</div></div></div>`;
  const gameNames={truco:'Truco',chess:'Xadrez',blackjack:'Blackjack'};
  const stats=Object.entries(h.stats||{}).map(([game,x])=>`<div class="stat-card"><span>${gameNames[game]||game}</span><strong>${x.wins}</strong><small>vitórias • ${x.losses} derrotas • ${x.draws} empates • ${x.played} partidas</small></div>`).join('')||'<div class="muted">Nenhuma partida real concluída ainda.</div>';
  window.__TDB_PROFILE_RESULTS__=h.recent||[];
  const recent=(h.recent||[]).map((r,i)=>{const won=(r.winner_ids||[]).includes(state.user.id),lost=(r.loser_ids||[]).includes(state.user.id);const outcome=won?'Vitória':lost?'Derrota':'Empate';const pgn=r.game==='chess'&&r.metadata?.pgn?`<button class="link-btn" onclick="copyRecentPgn(${i})">Copiar PGN</button>`:'';return `<div class="history-row"><div><strong>${escapeHtml(gameNames[r.game]||r.game)} • ${outcome}</strong><small>${new Date(r.finished_at).toLocaleString('pt-BR')} • ${escapeHtml(r.mode||'')}</small></div>${pgn}</div>`}).join('')||'<div class="muted">Sem histórico recente.</div>';
  return `<div class="section-title"><div><h2>Histórico competitivo</h2><p>Partidas com bots não alteram estas estatísticas.</p></div></div><div class="stats-grid">${stats}</div><div class="panel"><div class="panel-header"><h2>Partidas recentes</h2></div><div class="panel-body history-list">${recent}</div></div>`;
}
async function refreshProfileHistory(){
  if(!window.TDBOnline?.connected)return;
  try{state.profileHistory=await window.TDBOnline.getProfileHistory();if(state.view==='profile'){const el=document.getElementById('profileCompetitive');if(el)el.innerHTML=renderProfileHistory()}}catch(err){console.warn('[Histórico]',err)}
}
function copyRecentPgn(i){const pgn=window.__TDB_PROFILE_RESULTS__?.[i]?.metadata?.pgn||'';if(pgn)navigator.clipboard?.writeText(pgn).then(()=>toast('PGN copiado.'))}

async function saveProfile(){
  const username=document.getElementById('editUsername').value.trim();
  const avatar=document.getElementById('editAvatar').value.trim()||initials(username);
  if(username.length<3) return toast('Use pelo menos 3 caracteres.');

  if(location.protocol!=='file:' && window.TDBOnline?.connected && window.TDBOnline?.supabase){
    try{
      const updated=await window.TDBOnline.updateProfile(username,avatar);
      state.user=updated;
      Core.auth.setCurrentUser(updated);
      const idx=state.users.findIndex(u=>u.id===updated.id);
      if(idx>=0) state.users[idx]={...state.users[idx],...updated};
      toast('Perfil atualizado no Supabase.');
      return renderProfile();
    }catch(err){
      return toast(err.message||'Não foi possível atualizar o perfil.');
    }
  }

  if(state.users.some(u=>u.id!==state.user.id&&(u.username||'').toLowerCase()===username.toLowerCase())) return toast('Esse nome já está em uso.');
  const idx=state.users.findIndex(u=>u.id===state.user.id);
  state.user.username=username; state.user.avatar=avatar;
  if(idx>=0) state.users[idx]={...state.users[idx],username,avatar};
  saveUsers(); saveSession(state.user);
  toast('Perfil atualizado.'); renderProfile();
}

function audioSlider(title,desc,key,value){
  return `<div class="panel setting-row audio-setting"><div><h3>${title}</h3><p>${desc}</p></div><div class="audio-slider-wrap"><input type="range" min="0" max="100" step="1" value="${Number(value??50)}" oninput="updateAudioSetting('${key}',this.value,this.nextElementSibling)"><output>${Number(value??50)}%</output></div></div>`;
}
function renderSettings(){
  state.view='settings';
  app.innerHTML=`${topbar('settings')}<section class="dashboard fade-in">
    <div class="page-head"><div><h1 class="page-title">Configurações</h1><p class="muted">Gráficos, animações, áudio, interface e suporte do TDB.</p></div></div>
    <div class="settings-stack">
      ${settingRow('Animações completas','Movimentos de cartas, peças, fichas, entrada de jogadores e transições.','animations',state.settings.animations!==false)}
      ${settingRow('Efeitos de partículas','Permite efeitos visuais decorativos. Desative em PCs mais fracos.','particles',state.settings.particles!==false)}
      ${settingRow('Sons do TDB','Ativa cliques, efeitos de partidas e alertas sonoros.','sound',state.settings.sound)}
      ${audioSlider('Volume geral','Limite mestre de todos os efeitos. O padrão é propositalmente baixo.','masterVolume',state.settings.masterVolume??55)}
      ${audioSlider('Interface','Botões, navegação, confirmação e retorno.','uiVolume',state.settings.uiVolume??42)}
      ${audioSlider('Jogos','Cartas do Truco e movimentos do Xadrez.','gameVolume',state.settings.gameVolume??50)}
      ${audioSlider('Alertas sonoros','Efeitos curtos de avisos.','notificationVolume',state.settings.notificationVolume??48)}
      <div class="panel setting-row"><div><h3>Testar áudio</h3><p>Toca um efeito curto no volume atual.</p></div><button class="btn btn-secondary" onclick="testCurrentAudio()">Testar som</button></div>
      ${settingRow('Avisos de amigos','Preparado para avisar quando amigos ficarem online.','friendNotifications',state.settings.friendNotifications)}
      <div class="panel setting-row"><div><h3>Tela cheia</h3><p>Use o navegador em modo imersivo.</p></div><button class="btn btn-secondary" onclick="toggleFullscreen()">Alternar tela cheia</button></div>
      <div class="panel report-panel">
        <div class="panel-header"><div><h2>Reportar bug ou erro</h2><p class="muted">O reporte vai diretamente para o painel administrativo.</p></div><span class="badge open">SUPORTE</span></div>
        <div class="panel-body report-form">
          <div class="field"><label>Tipo</label><select id="reportCategory" class="select"><option value="bug">Bug</option><option value="error">Erro</option><option value="other">Outro problema</option></select></div>
          <div class="field"><label>Descreva o que aconteceu</label><textarea id="reportMessage" rows="5" maxlength="4000" placeholder="Ex.: Entrei no Truco 2x2, cliquei em... e aconteceu..."></textarea></div>
          <div class="report-context-note">O sistema envia junto apenas contexto técnico útil: tela atual, jogo, sala, versão e navegador.</div>
          <button class="btn btn-primary" id="sendReportBtn" onclick="submitBugReport()">Enviar reporte</button>
        </div>
      </div>
    </div>
  </section>`;
}
function settingRow(title,desc,key,value){
  return `<div class="panel setting-row"><div><h3>${title}</h3><p>${desc}</p></div><label class="switch"><input type="checkbox" ${value?'checked':''} onchange="toggleSetting('${key}',this.checked)"><span class="slider"></span></label></div>`;
}
function toggleSetting(key,val){ state.settings[key]=val; saveSettings(); if(key==='sound'&&val) window.TDBSound?.play?.('confirm'); toast('Configuração salva.'); }
function updateAudioSetting(key,value,output){
  state.settings[key]=Math.max(0,Math.min(100,Number(value)||0));
  if(output) output.textContent=`${state.settings[key]}%`;
  saveSettings();
}
async function testCurrentAudio(){
  if(!state.settings.sound) return toast('Ative os sons primeiro.');
  const ok=await window.TDBSound?.test?.();
  if(ok===false)toast('O navegador bloqueou o áudio. Clique novamente em Testar som.');
}
async function submitBugReport(){
  if(!window.TDBOnline?.connected) return toast('É preciso estar online para enviar um reporte.');
  const category=document.getElementById('reportCategory')?.value||'bug';
  const message=document.getElementById('reportMessage')?.value.trim()||'';
  if(message.length<8) return toast('Descreva o problema com um pouco mais de detalhe.');
  const btn=document.getElementById('sendReportBtn');if(btn){btn.disabled=true;btn.textContent='Enviando…'}
  try{
    await window.TDBOnline.submitReport(category,message,{
      view:state.view,
      game:state.selectedGame||state.activeRoom?.game||null,
      roomCode:state.activeRoom?.code||null,
      version:'7.0.1',
      onlinePhase:window.TDBOnline?.phase||null,
      latencyMs:window.TDBOnline?.latencyMs??null,
      browser:navigator.userAgent.slice(0,500)
    });
    document.getElementById('reportMessage').value='';
    window.TDBSound?.play?.('success');
    toast('Reporte enviado para a administração.');
  }catch(err){
    window.TDBSound?.play?.('error');
    toast(err.message||'Não foi possível enviar o reporte.');
  }finally{if(btn){btn.disabled=false;btn.textContent='Enviar reporte'}}
}

async function logout(){
  if(window.__TDB_EXPLICIT_LOGOUT__===true)return;
  window.__TDB_EXPLICIT_LOGOUT__=true;
  state.view='login';
  clearTimeout(state.inviteToastTimer);
  const leavingRoom=state.activeRoom&&!state.activeRoom.simulation?state.activeRoom.code:null;
  try{
    OnlineGameBridge.stop();
    if(location.protocol!=='file:'&&leavingRoom&&window.TDBOnline?.connected){
      try{await window.TDBOnline.leaveRoom(leavingRoom)}catch{}
    }
    if(state.user?.id){
      try{Core.presence.set(state.user.id,'offline')}catch{}
    }
    window.TDBOnline?.suspend?.();
    if(location.protocol!=='file:'&&window.TDBAuthOnline){
      await window.TDBAuthOnline.logout();
    }
  }catch(err){
    console.warn('[TDB] Logout remoto:',err);
  }finally{
    clearLocalSessionState();
    state.rooms=Core.rooms.list();
    state.friends=[];
    state.social={incoming:[],outgoing:[],invites:[]};
    window.TDBPlatformUI?.hideLoading?.();
    renderAuth('login');
  }
}


function syncAdaptiveLayout(){
  requestAnimationFrame(()=>{
    const top=document.querySelector('.topbar');
    const topH=top ? Math.round(top.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--topbar-h',`${topH}px`);
    document.documentElement.style.setProperty('--app-vh',`${window.innerHeight * .01}px`);
    document.documentElement.style.setProperty('--app-vw',`${window.innerWidth * .01}px`);
  });
}
window.addEventListener('resize',syncAdaptiveLayout,{passive:true});
window.addEventListener('orientationchange',syncAdaptiveLayout,{passive:true});
new MutationObserver(syncAdaptiveLayout).observe(app,{childList:true,subtree:false});
window.syncAdaptiveLayout=syncAdaptiveLayout;


let __tdbSessionBooting=false;

function clearLocalSessionState(){
  state.user=null;
  state.activeRoom=null;
  Core.auth.setCurrentUser(null);
  Core.rooms.setActive(null);
}

async function bootAuthenticatedApp(){
  if(location.hash==='#admin')return;
  if(__tdbSessionBooting) return;
  __tdbSessionBooting=true;

  const hosted=location.protocol!=='file:' && !!window.TDBAuthOnline;

  if(hosted){
    // Hosted TDB trusts the server session, never an old local-only user.
    const serverUser=await window.TDBAuthOnline.session();

    if(!serverUser){
      clearLocalSessionState();
      __tdbSessionBooting=false;
      return renderAuth('login');
    }

    state.user=serverUser;
    Core.auth.setCurrentUser(serverUser);

    try{await window.TDBOnline?.refreshSnapshot?.();await window.TDBOnline?.heartbeatNow?.()}catch{}
    let reconnect=null;
    try{reconnect=await window.TDBOnline?.reconnect?.()}catch{}
    if(reconnect?.room){
      state.activeRoom=reconnect.room;state.selectedGame=reconnect.room.game;Core.rooms.setActive(reconnect.room);
      __tdbSessionBooting=false;
      if(reconnect.room.game==='music') return openMusicRoom();
      if(reconnect.room.status==='playing'&&['chess','truco','blackjack'].includes(reconnect.room.game)){
        state.view=reconnect.room.game==='truco'?'playing-truco':reconnect.room.game==='chess'?'playing-chess':'playing-blackjack';
        OnlineGameBridge.start(reconnect.room,reconnect.role||'player');
        if(reconnect.state){
          window.dispatchEvent(new CustomEvent('tdb-game-state',{detail:{roomCode:reconnect.room.code,state:reconnect.state}}));
        }else{
          window.TDBOnline?.syncGame?.(reconnect.room.code,reconnect.role||'player');
        }
        return;
      }
      return renderWaitingRoom();
    }
    state.activeRoom=null;Core.rooms.setActive(null);__tdbSessionBooting=false;await refreshSocialData(false);return renderLobby();
  }

  __tdbSessionBooting=false;
  if(state.user){
    if(state.activeRoom && state.activeRoom.players?.some(p=>p.id===state.user.id)){if(state.activeRoom.game==='blackjack'&&state.activeRoom.status==='playing'){state.view='playing-blackjack';OnlineGameBridge.start(state.activeRoom,'player');return;}return renderWaitingRoom();}
    return renderLobby();
  }
  renderAuth('login');
}

window.addEventListener('tdb-session-expired',event=>{
  if(location.protocol==='file:'||window.__TDB_EXPLICIT_LOGOUT__===true) return;
  clearLocalSessionState();
  renderAuth('login');
  setTimeout(()=>toast(event.detail?.message||'Sua sessão online expirou. Entre novamente.'),80);
});


window.renderLobby=renderLobby;
window.renderGame=renderGame;
window.drawGamePage=drawGamePage;
window.setRoomFilter=setRoomFilter;
window.openCreateRoom=openCreateRoom;
window.openJoinCode=openJoinCode;
window.closeModal=closeModal;
window.createRoom=createRoom;
window.requestJoinRoom=requestJoinRoom;
window.joinRoom=joinRoom;
window.joinByCode=joinByCode;
window.renderWaitingRoom=renderWaitingRoom;
window.kickPlayer=kickPlayer;
window.leaveRoom=leaveRoom;
window.startGame=startGame;
window.copyCode=copyCode;
window.toggleFullscreen=toggleFullscreen;
window.renderFriends=renderFriends;
window.addFriendById=addFriendById;
window.renderProfile=renderProfile;
window.openInviteFriendsModal=openInviteFriendsModal;
window.closeInviteFriendsModal=closeInviteFriendsModal;
window.inviteFriendFromModal=inviteFriendFromModal;
window.acceptRoomInviteToast=acceptRoomInviteToast;
window.dismissRoomInviteToast=dismissRoomInviteToast;
window.searchPlayers=searchPlayers;
window.sendFriendRequest=sendFriendRequest;
window.respondFriendRequest=respondFriendRequest;
window.respondRoomInvite=respondRoomInvite;
window.copyRecentPgn=copyRecentPgn;
window.saveProfile=saveProfile;
window.renderSettings=renderSettings;
window.updateAudioSetting=updateAudioSetting;
window.testCurrentAudio=testCurrentAudio;
window.submitBugReport=submitBugReport;
window.toggleSetting=toggleSetting;
window.inviteFriend=inviteFriend;
window.logout=logout;
window.toast=toast;

bootAuthenticatedApp();


/* ==========================================================
   TRUCO PAULISTA ENGINE - v0.3 LOCAL TEST
   4 players / 2x2 / bots for local testing
   ========================================================== */

const SUITS = [
  {key:'clubs',sym:'♣',name:'Paus',power:4,red:false},
  {key:'hearts',sym:'♥',name:'Copas',power:3,red:true},
  {key:'spades',sym:'♠',name:'Espadas',power:2,red:false},
  {key:'diamonds',sym:'♦',name:'Ouros',power:1,red:true}
];
const RANKS = ['4','5','6','7','Q','J','K','A','2','3'];
const BASE_POWER = {'4':1,'5':2,'6':3,'7':4,'Q':5,'J':6,'K':7,'A':8,'2':9,'3':10};
const NEXT_RANK = {'4':'5','5':'6','6':'7','7':'Q','Q':'J','J':'K','K':'A','A':'2','2':'3','3':'4'};

let truco = null;
let trucoTimerInterval = null;



function playDealSound(step=0){ if(!state.settings.sound)return; window.TDBSound?.play?.('cardDeal',{channel:`deal-${step}`,dedupeMs:0}); }
function playCardSound(hidden=false){ if(!state.settings.sound)return; window.TDBSound?.play?.(hidden?'cardHidden':'cardPlay',{channel:'card-play',dedupeMs:20}); }
function playTrucoSound(){ if(!state.settings.sound)return; window.TDBSound?.play?.('truco',{channel:'truco-call',dedupeMs:80}); }
function startTrucoWithBots(){
  if(!state.activeRoom || state.activeRoom.game!=='truco') return;
  OnlineGameBridge.stop();
  state.botReturnRoom=structuredClone(state.activeRoom);
  state.view='bot-truco';
  const user=state.user;
  const room=structuredClone(state.activeRoom);
  const cap=roomCapacity(room);
  if(cap===2){
    room.players=[
      {username:user.username,id:user.id,avatar:user.avatar,bot:false},
      {username:'Bot Rival',id:'BOT-RIVAL',avatar:'R',bot:true}
    ];
  }else{
    const bots=[
      {username:'Bot Ouro',id:'BOT-OURO',avatar:'O',bot:true},
      {username:'Bot Paus',id:'BOT-PAUS',avatar:'P',bot:true},
      {username:'Bot Copas',id:'BOT-COPAS',avatar:'C',bot:true}
    ];
    room.players=[
      {username:user.username,id:user.id,avatar:user.avatar,bot:false},
      bots[0],bots[1],bots[2]
    ];
  }
  room.status='playing';
  room.simulation=true;
  saveActiveRoom(room);
  startTrucoGame(room,true);
}


function applyOnlineTrucoState(serverState,role='player'){
  const previousSelected=truco?.selectedCard ?? null;
  const previousVersion=Number(truco?.version||0);
  const previousWinner=truco?.winner ?? null;
  const previousTrickResultCount=Number(truco?.trickResults?.length||0);

  truco=structuredClone(serverState);
  truco.onlineMode=true;
  truco.spectatorMode=role==='spectator';
  truco.room=state.activeRoom||{};

  // localSeat is supplied privately by the server for each authenticated player.
  truco.localSeat=Number.isInteger(serverState.localSeat)?serverState.localSeat:null;

  // Keep a selected card only while the exact same server version is still active.
  truco.selectedCard=Number(serverState.version||0)===previousVersion?previousSelected:null;

  // Normalize server field names to the UI model.
  truco.roundWinners=truco.trickResults||[];
  truco.lastHandSummary=serverState.lastHandSummary||null;
  truco.lastTrickSummary=serverState.lastTrickSummary||null;
  truco.handOfEleven=truco.eleven
    ? {team:truco.eleven.team,pending:truco.eleven.pending,responses:truco.eleven.responses||{}}
    : null;

  if(truco.phase==='eleven') truco.phase='eleven-decision';

  truco.trickCards=(truco.trickCards||[]).map(tc=>({
    ...tc,
    player:tc.player ?? tc.seat
  }));

  truco.ironRevealed=false;
  truco.discardCount=0;
  truco.timerLeft=truco.turnDeadlineAt
    ? Math.max(0,Math.ceil((truco.turnDeadlineAt-Date.now())/1000))
    : Number(truco.room?.turnTimer||truco.turnTimer||0);
  truco.raiseLevel=truco.handValue;
  truco.starter=truco.activeSeats?.[0]??0;

  // Server state is already fully dealt. Hidden opponent cards are null placeholders.
  truco.revealCounts=truco.revealCounts||{};
  for(const seat of truco.activeSeats||[]){
    truco.revealCounts[seat]=(truco.hands?.[seat]||[]).length;
  }

  if(truco.pendingRaise && truco.pendingRaise.bySeat!==undefined){
    truco.pendingRaise.byPlayer=truco.pendingRaise.bySeat;
    truco.pendingRaise.votes=truco.pendingRaise.responses||{};
  }

  const newResultCount=Number(truco.trickResults?.length||0);
  if(truco.phase==='resolving' && newResultCount>previousTrickResultCount){
    const winner=truco.trickResults[newResultCount-1];
    const mine=localTrucoTeam();
    setTimeout(()=>showRoundFlash(
      winner==='tie'?'EMPATE NA RODADA':winner===mine?(truco.mode==='1v1'?'VOCÊ VENCEU A RODADA':'NOSSA DUPLA VENCEU A RODADA'):(truco.mode==='1v1'?'ADVERSÁRIO VENCEU A RODADA':'ELES VENCERAM A RODADA')
    ),30);
  }

  if(previousWinner===null && truco.winner!==null && !truco.spectatorMode){
    window.TDBSound?.play?.(truco.winner===localTrucoTeam()?'victory':'defeat',{channel:'truco-result',dedupeMs:500});
  }

  renderTruco();
}
window.applyOnlineTrucoState=applyOnlineTrucoState;

function startTrucoGame(room,localBots=false){
  document.getElementById('trucoRoot')?.remove();
  clearInterval(trucoTimerInterval);

  const cap=Number(room.trucoSeats||4);
  let players=[];

  if(cap===2){
    const p0=room.players[0] || {username:state.user.username,id:state.user.id,avatar:state.user.avatar,bot:false};
    const p1=room.players[1] || {username:'Bot Rival',id:'BOT-RIVAL',avatar:'R',bot:true};
    players=[
      {...p0, seat:0, team:0, bot:!!p0.bot},
      {...p1, seat:2, team:1, bot:!!p1.bot}
    ];
  } else {
    const ordered=room.players.slice(0,4);
    const seatMap=[0,1,2,3];
    players=ordered.map((p,i)=>({...p,seat:seatMap[i],team:i%2,bot:!!p.bot}));
  }

  const activeSeats=players.map(p=>p.seat).sort((a,b)=>a-b);

  truco={
    room,
    localBots,
    mode:cap===2?'1v1':'2v2',
    players,
    activeSeats,
    dealerIndex:activeSeats.length-1,
    scores:[0,0],
    dealer:activeSeats[activeSeats.length-1],
    starter:activeSeats[0],
    current:activeSeats[0],
    handValue:1,
    raiseLevel:1,
    pendingRaise:null,
    round:0,
    roundWinners:[],
    trickCards:[],
    pendingTrick:null,
    lastTrickSummary:null,
    lastHandSummary:null,
    hands:[[],[],[],[]],
    vira:null,
    manilhaRank:null,
    phase:'dealing',
    selectedCard:null,
    logs:[],
    handOfEleven:null,
    ironHand:false,
    ironRevealed:false,
    timerLeft:0,
    winner:null,
    afterDealPhase:'playing',
    discardCount:0,
    raiseVotes:null,
    revealCounts:{0:0,1:0,2:0,3:0},
    actionSeq:0,
    raiseToken:0,
    matchId:`MATCH-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  };

  dealNewHand();
}

function makeDeck(){
  const deck=[];
  for(const r of RANKS) for(const s of SUITS) deck.push({rank:r,suit:s.key,id:`${r}-${s.key}-${Math.random().toString(36).slice(2,8)}`});
  for(let i=deck.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}
function suitInfo(card){ return SUITS.find(s=>s.key===card.suit); }
function cardStrength(card){
  if(card.rank===truco.manilhaRank) return 100 + suitInfo(card).power;
  return BASE_POWER[card.rank];
}
function compareCards(a,b){
  const pa=cardStrength(a.card), pb=cardStrength(b.card);
  if(pa>pb) return 1;
  if(pa<pb) return -1;
  return 0;
}
function logTruco(msg){
  truco.logs.unshift(msg);
  truco.logs=truco.logs.slice(0,30);
}
function dealNewHand(){
  clearInterval(trucoTimerInterval);
  const deck=makeDeck();

  truco.hands=[[],[],[],[]];
  truco.revealCounts={0:0,1:0,2:0,3:0};

  for(let c=0;c<3;c++){
    for(const seat of truco.activeSeats){
      truco.hands[seat].push(deck.pop());
    }
  }

  truco.vira=deck.pop();
  truco.manilhaRank=NEXT_RANK[truco.vira.rank];
  truco.round=0;
  truco.roundWinners=[];
  truco.trickCards=[];
  truco.pendingTrick=null;
  truco.lastTrickSummary=null;
  truco.trickResolveAt=null;
  truco.handValue=1;
  truco.raiseLevel=1;
  truco.pendingRaise=null;
  truco.raiseVotes=null;
  truco.selectedCard=null;
  truco.discardCount=0;
  truco.ironHand = truco.scores[0]===11 && truco.scores[1]===11;
  truco.ironRevealed=false;

  const elevenTeam = truco.scores[0]===11 ? 0 : truco.scores[1]===11 ? 1 : null;
  truco.handOfEleven = elevenTeam!==null && !truco.ironHand ? {team:elevenTeam,pending:true,responses:{}} : null;

  truco.dealerIndex=(truco.dealerIndex+1)%truco.activeSeats.length;
  const starterIndex=(truco.dealerIndex+1)%truco.activeSeats.length;
  truco.dealer=truco.activeSeats[truco.dealerIndex];
  truco.starter=truco.activeSeats[starterIndex];
  truco.current=truco.starter;

  truco.afterDealPhase = truco.ironHand ? 'iron-intro' : truco.handOfEleven ? 'eleven-decision' : 'playing';
  truco.phase='dealing';

  logTruco(`Nova mão. Vira ${cardText(truco.vira)} • Manilha ${truco.manilhaRank}.`);
  renderTruco();
  animateDealReveal();
}
function cardText(c){ return `${c.rank}${suitInfo(c).sym}`; }


function localTrucoSeat(){
  if(truco?.onlineMode && Number.isInteger(truco.localSeat)) return truco.localSeat;
  return 0;
}
function localTrucoTeam(){
  const seat=localTrucoSeat();
  return truco?.players?.find(p=>p.seat===seat)?.team ?? 0;
}
function isLocalTrucoPlayer(){
  return !truco?.spectatorMode && Number.isInteger(localTrucoSeat());
}

function playerBySeat(seat){
  return truco?.players?.find(p=>p.seat===seat) || null;
}
function nextActiveSeat(seat){
  const order=truco.activeSeats||[0,1,2,3];
  const idx=order.indexOf(seat);
  return order[(idx+1)%order.length];
}

function trucoVisualLayout(){
  const active=truco?.activeSeats||[];
  if(!active.length) return {bottom:null,top:null,left:null,right:null};

  let me=localTrucoSeat();
  if(!Number.isInteger(me) || !active.includes(me)) me=active[0];

  if(active.length===2){
    const opponent=active.find(seat=>seat!==me) ?? null;
    return {bottom:me,top:opponent,left:null,right:null};
  }

  const relative=seat=>((seat-me)+4)%4;
  const layout={bottom:me,top:null,left:null,right:null};

  for(const seat of active){
    if(seat===me) continue;
    const offset=relative(seat);
    if(offset===2) layout.top=seat;
    else if(offset===1) layout.left=seat;
    else if(offset===3) layout.right=seat;
  }

  return layout;
}
function trucoVisualPositionForSeat(seat){
  const layout=trucoVisualLayout();
  return Object.entries(layout).find(([,realSeat])=>realSeat===seat)?.[0]||'top';
}
function syncTrucoSeatsStable(){
  const layout=trucoVisualLayout();
  const used=new Set();

  for(const [pos,seat] of Object.entries(layout)){
    if(!Number.isInteger(seat)) continue;
    used.add(seat);
    updateSeatStable(seat,pos);
  }

  for(const seat of [0,1,2,3]){
    if(used.has(seat)) continue;
    const host=document.getElementById(`seat${seat}`);
    if(host?.childElementCount) host.replaceChildren();
  }
}

function animateDealReveal(){
  const order=[];
  for(let round=0; round<3; round++){
    for(const seat of truco.activeSeats) order.push(seat);
  }

  order.forEach((seat,i)=>{
    setTimeout(()=>{
      if(!truco || truco.phase!=='dealing') return;
      truco.revealCounts[seat]=Math.min(3,(truco.revealCounts[seat]||0)+1);
      playDealSound(i);
      renderTruco();
    }, 180 + i*95);
  });

  const finalDelay=180 + order.length*95 + 240;
  setTimeout(()=>{
    if(!truco) return;
    truco.phase=truco.afterDealPhase;
    renderTruco();

    if(truco.handOfEleven) maybeAutoElevenDecision();
    else if(truco.ironHand){
      setTimeout(()=>{
        truco.phase='playing';
        renderTruco();
        maybeBotTurn();
      },900);
    } else {
      maybeBotTurn();
    }
  }, finalDelay);
}



function renderTruco(){
  window.TDBPlatformUI?.hideLoading?.();
  // Mount the Truco table only once. Later plays update only the dynamic regions,
  // avoiding a full page redraw/flicker on each action.
  if(!document.getElementById('trucoRoot')){
    mountTrucoScreen();
  }
  updateTrucoScreen();
  setupTurnTimer();
  requestAnimationFrame(syncTrucoViewport);
}

function mountTrucoScreen(){
  app.innerHTML=`${topbar()}
  <section class="truco-screen fade-in" id="trucoRoot">
    <div class="truco-table-wrap">
      <div class="truco-hud">
        <div class="score-panel">
          <div class="score-title">TDB • TRUCO PAULISTA</div><div class="connection-ready">Core preparado para sincronização online</div>
          <div class="score-line"><span>NÓS</span><span class="score-num" id="trucoScoreUs">0</span></div>
          <div class="score-line"><span>ELES</span><span class="score-num" id="trucoScoreThem">0</span></div>
        </div>

        <div class="hand-panel">
          <div class="hand-chip">Mão vale <strong id="trucoHandValue">1</strong></div>
          <div class="hand-chip">Rodada <strong id="trucoRound">1/3</strong></div>
          <div class="hand-chip">Manilha <strong id="trucoManilha">—</strong></div>
          <div class="hand-chip">Parciais <div class="round-dots" id="trucoRoundDots"></div></div>
        </div>

        <div class="turn-panel">
          <div class="turn-name" id="trucoTurnName"></div>
          <div class="turn-sub" id="trucoTurnSub"></div>
          <div id="trucoTimerSlot"></div>
        </div>
      </div>

      <div class="table-shell">
        ${logoTag('class="table-logo"')}

        <div id="seat2"></div>
        <div id="seat1"></div>
        <div id="seat3"></div>
        <div id="seat0"></div>

        <div class="manilha-badge" id="trucoManilhaBadge"></div>
        <div id="trucoDeckWrap"></div>
        <div class="vira-zone" id="trucoVira"></div>
        <div class="play-zone" id="trucoPlayZone"></div>
        <div id="trucoDiscard"></div>
        <div id="trucoDealAnim"></div>
        <div id="trucoMyHand"></div>
        <div id="trucoOverlay"></div>
        <div id="trucoRoundFlash"></div><div id="trucoHandSummary"></div>
      </div>

      <div id="trucoActions"></div>
      <div class="truco-log" id="trucoLog"></div>
    </div>
  </section>`;
}


function syncTrucoViewport(){
  const root=document.getElementById('trucoRoot');
  if(!root) return;
  const table=root.querySelector('.table-shell');
  if(!table) return;

  const rect=table.getBoundingClientRect();
  table.style.setProperty('--truco-table-w',`${Math.max(1,rect.width)}px`);
  table.style.setProperty('--truco-table-h',`${Math.max(1,rect.height)}px`);
}
window.addEventListener('resize',()=>requestAnimationFrame(syncTrucoViewport),{passive:true});
window.addEventListener('orientationchange',()=>requestAnimationFrame(syncTrucoViewport),{passive:true});
window.syncTrucoViewport=syncTrucoViewport;


function updateSeatStable(seat,pos){
  const host=document.getElementById(`seat${seat}`);
  if(!host) return;

  const player=playerBySeat(seat);
  if(!player){
    if(host.childElementCount) host.replaceChildren();
    return;
  }

  let root=host.querySelector('.player-seat');
  if(!root){
    host.innerHTML=renderSeat(seat,pos);
    return;
  }

  root.className=`player-seat seat-${pos}`;

  const current=truco.current===seat && truco.phase==='playing';
  const badge=root.querySelector('.seat-badge');
  if(badge) badge.classList.toggle('current',current);

  const avatar=root.querySelector('.seat-avatar');
  if(avatar){
    const value=player.avatar||initials(player.username);
    if(avatar.textContent!==value) avatar.textContent=value;
  }

  const name=root.querySelector('.seat-name strong');
  if(name && name.textContent!==player.username) name.textContent=player.username;

  let roleText='Adversário';
  if(truco.mode==='2v2') roleText=(player.team===localTrucoTeam()?'Sua dupla':'Adversário');
  else roleText=(player.seat===localTrucoSeat()?'Você':'Adversário');

  const role=root.querySelector('.seat-name small');
  if(role && role.textContent!==roleText) role.textContent=roleText;

  const team=root.querySelector('.seat-team');
  const teamText=`T${player.team+1}`;
  if(team && team.textContent!==teamText) team.textContent=teamText;

  if(seat===localTrucoSeat()){
    root.querySelector('.side-hand,.enemy-hand')?.remove();
    return;
  }

  const wanted=Math.min(
    (truco.hands[seat]||[]).length,
    truco.revealCounts[seat]||0
  );

  let hand=root.querySelector('.side-hand,.enemy-hand');
  const wantedClass=(pos==='left'||pos==='right')?'side-hand':'enemy-hand';
  if(!hand){
    hand=document.createElement('div');
    hand.className=wantedClass;
    root.appendChild(hand);
  }else if(hand.className!==wantedClass){
    hand.className=wantedClass;
  }

  while(hand.children.length>wanted){
    hand.lastElementChild.remove();
  }
  while(hand.children.length<wanted){
    const temp=document.createElement('div');
    temp.innerHTML=cardBackMini();
    hand.appendChild(temp.firstElementChild);
  }
}

function syncMyHandStable(){
  const host=document.getElementById('trucoMyHand');
  if(truco?.onlineMode){
    if(host) host.innerHTML=renderMyHand();
    return;
  }
  if(!host) return;

  const visibleCount=truco.revealCounts[localTrucoSeat()]||0;
  const cards=(truco.hands[localTrucoSeat()]||[]).slice(0,visibleCount);

  let hand=host.querySelector('.my-hand');
  if(!hand){
    host.innerHTML=renderMyHand();
    return;
  }

  const existing=new Map(
    [...hand.children].map(el=>[el.dataset.cardKey,el])
  );

  const ordered=[];

  cards.forEach((card,index)=>{
    const key=trucoCardKey(card);
    let el=existing.get(key);

    if(!el){
      const temp=document.createElement('div');
      temp.innerHTML=renderMyHand();
      const candidate=[...temp.querySelectorAll('[data-card-key]')]
        .find(x=>x.dataset.cardKey===key);
      if(candidate){
        el=candidate;
        el.classList.add('card-enter');
      }
    }

    if(!el) return;

    el.setAttribute('onclick',`selectTrucoCard(${index})`);
    el.classList.toggle('selected',truco.selectedCard===index);

    const s=suitInfo(card);
    el.classList.toggle('red',!!s.red);
    el.classList.toggle('is-manilha',card.rank===truco.manilhaRank);
    el.classList.toggle('hidden',!!(truco.ironHand && !truco.ironRevealed));

    if(!(truco.ironHand && !truco.ironRevealed)){
      const rank=el.querySelector('.rank');
      const suit=el.querySelector('.suit');
      if(rank) rank.innerHTML=`${card.rank}<small>${s.sym}</small>`;
      if(suit) suit.textContent=s.sym;
    }

    ordered.push(el);
    existing.delete(key);
  });

  existing.forEach(el=>el.remove());

  ordered.forEach(el=>{
    if(el.parentElement!==hand || hand.lastElementChild!==el){
      hand.appendChild(el);
    }
  });
}

function syncPlayZoneStable(){
  const zone=document.getElementById('trucoPlayZone');
  if(!zone) return;

  const wanted=new Map(
    truco.trickCards.map(tc=>[
      String(tc.player),
      tc
    ])
  );

  [...zone.querySelectorAll('.play-card')].forEach(el=>{
    const key=el.dataset.player;
    if(!wanted.has(key)) el.remove();
  });

  for(const [key,tc] of wanted){
    let el=zone.querySelector(`.play-card[data-player="${key}"]`);

    const visualPos=trucoVisualPositionForSeat(Number(tc.player));
    const resolving=truco.phase==='resolving'&&!!truco.pendingTrick;
    const winnerSeat=truco.pendingTrick?.result==='tie'?null:Number(truco.pendingTrick?.winnerSeat);
    const isWinner=resolving&&winnerSeat===Number(tc.player);
    const revealLeft=Math.max(0,Number(truco.trickResolveAt||0)-Date.now());
    const discardDelay=Math.max(650,revealLeft-520);
    if(!el){
      el=document.createElement('div');
      el.className=`play-card visual-${visualPos} card-enter ${isWinner?'round-winner-card':''} ${resolving?'round-discarding':''}`;
      if(resolving)el.style.setProperty('--discard-delay',`${discardDelay}ms`);
      el.dataset.player=key;
      el.innerHTML=renderCard(tc.card,tc.hidden,false);
      zone.appendChild(el);
    }else{
      el.className=`play-card visual-${visualPos} ${isWinner?'round-winner-card':''} ${resolving?'round-discarding':''}`;
      if(resolving)el.style.setProperty('--discard-delay',`${discardDelay}ms`);
      else el.style.removeProperty('--discard-delay');
      const hiddenNow=!!tc.hidden;
      const child=el.querySelector('.truco-card');
      const isHidden=child?.classList.contains('hidden');
      if(hiddenNow!==isHidden){
        el.innerHTML=renderCard(tc.card,tc.hidden,false);
      }
    }
  }
}

function updateTrucoScreen(){
  const room=truco.room;
  const set=(id,html)=>{ const el=document.getElementById(id); if(el && el.innerHTML!==String(html)) el.innerHTML=html; };
  const text=(id,value)=>{ const el=document.getElementById(id); if(el && el.textContent!==String(value)) el.textContent=value; };

  const myTeam=localTrucoTeam();
  text('trucoScoreUs',truco.scores[myTeam]);
  text('trucoScoreThem',truco.scores[1-myTeam]);
  text('trucoHandValue',truco.handValue);
  text('trucoRound',`${Math.min(truco.round+1,3)}/3`);
  text('trucoManilha',truco.manilhaRank||'—');
  set('trucoRoundDots',renderRoundDots());
  set('trucoHandSummary',renderLastHandSummary());
  scheduleTrucoSummaryExpiry();

  const currentPlayer=playerBySeat(truco.current);
  const resolving=truco.phase==='resolving';
  text('trucoTurnName',truco.winner!==null ? 'Partida encerrada' : resolving ? 'Conferindo a rodada…' : `Vez de ${currentPlayer?.username||'Jogador'}`);
  text('trucoTurnSub',resolving?'As cartas ficam na mesa por um instante':room.turnTimer?`Tempo: ${room.turnTimer}s por jogada`:'Sem limite de tempo');
  set('trucoTimerSlot',room.turnTimer && truco.phase==='playing'
      ? `<div class="timer-ring" style="margin-left:auto;margin-top:8px">${truco.timerLeft||room.turnTimer}</div>` : '');

  syncTrucoSeatsStable();

  set('trucoManilhaBadge','');
  const deckHost=document.getElementById('trucoDeckWrap');
  if(deckHost && !deckHost.childElementCount) deckHost.innerHTML=renderDeckStack();

  const viraHost=document.getElementById('trucoVira');
  if(viraHost){
    const shouldShow=truco.phase!=='dealing';
    const key=truco.vira?trucoCardKey(truco.vira):'';
    if(!shouldShow){
      if(viraHost.childElementCount) viraHost.replaceChildren();
      viraHost.dataset.cardKey='';
    }else if(viraHost.dataset.cardKey!==key){
      viraHost.innerHTML=renderCard(truco.vira,false,false);
      viraHost.dataset.cardKey=key;
    }
  }

  syncPlayZoneStable();
  set('trucoDiscard',renderDiscardPile());
  set('trucoDealAnim',truco.phase==='dealing' ? renderDealAnimation() : '');

  syncMyHandStable();
  set('trucoOverlay',renderOverlay());
  set('trucoActions',renderTrucoActions());
  set('trucoLog',truco.logs.map(l=>`<div>• ${escapeHtml(l)}</div>`).join(''));
  if(truco.phase==='raise-response' && truco.pendingRaise?.targetTeam===localTrucoTeam()) maybeAutoFriendlyVote();
}


function localTrickPreview(){
  const visible=truco.trickCards.filter(x=>!x.hidden);
  if(!visible.length){
    return {result:'tie',winnerSeat:truco.starter,winningCard:null,hidden:true,round:truco.round+1,handValue:truco.handValue};
  }
  let best=visible[0],tied=false;
  for(const play of visible.slice(1)){
    const cmp=compareCards(play,best);
    if(cmp>0){best=play;tied=false}
    else if(cmp===0&&play.card.rank===best.card.rank)tied=true;
  }
  if(tied){
    return {result:'tie',winnerSeat:truco.starter,winningCard:null,hidden:false,round:truco.round+1,handValue:truco.handValue};
  }
  return {
    result:playerBySeat(best.player)?.team??'tie',
    winnerSeat:best.player,
    winningCard:best.card,
    hidden:!!best.hidden,
    round:truco.round+1,
    handValue:truco.handValue
  };
}
function trucoSummaryCardText(summary){
  if(!summary)return'';
  if(summary.hidden||!summary.winningCard)return'carta escondida';
  return cardText(summary.winningCard);
}
function renderLastHandSummary(){
  const summary=truco?.lastHandSummary;
  if(!summary)return'';
  if(summary.expiresAt&&Date.now()>Number(summary.expiresAt))return'';
  const mine=summary.team===localTrucoTeam();
  const who=summary.winnerName||(mine?'Você':'Adversário');
  const card=trucoSummaryCardText(summary);
  return `<div class="truco-hand-summary ${mine?'ours':'theirs'}">
    <span>${mine?'MÃO VENCIDA':'MÃO ENCERRADA'}</span>
    <strong>${escapeHtml(who)} venceu${card?` com ${escapeHtml(card)}`:''}</strong>
    <small>mão valeu ${Number(summary.points||truco.handValue||1)} ponto(s)</small>
  </div>`;
}


function scheduleTrucoSummaryExpiry(){
  clearTimeout(window.__tdbTrucoHandSummaryTimer);
  const summary=truco?.lastHandSummary;
  if(!summary?.expiresAt)return;
  const key=Number(summary.at||0);
  const delay=Math.max(0,Number(summary.expiresAt)-Date.now());
  window.__tdbTrucoHandSummaryTimer=setTimeout(()=>{
    if(truco?.lastHandSummary&&Number(truco.lastHandSummary.at||0)===key){
      truco.lastHandSummary=null;
      const slot=document.getElementById('trucoHandSummary');
      if(slot)slot.innerHTML='';
    }
  },delay+30);
}

function showRoundFlash(message){
  const slot=document.getElementById('trucoRoundFlash');
  if(!slot) return;
  slot.innerHTML=`<div class="round-flash">${escapeHtml(message)}</div>`;
  clearTimeout(window.__roundFlash);
  window.__roundFlash=setTimeout(()=>{ if(slot) slot.innerHTML=''; },900);
}

function renderDeckStack(){
  return `<div class="deck-stack">
    <div class="deck-card">${logoTag()}</div>
    <div class="deck-card">${logoTag()}</div>
    <div class="deck-card">${logoTag()}</div>
  </div>`;
}
function renderDiscardPile(){
  if(!truco.discardCount) return '';
  return `<div class="discard-pile">
    <div class="discard-count">DESCARTE</div>
    <div class="deck-card">${logoTag()}</div>
    <div class="deck-card">${logoTag()}</div>
    <div class="deck-card">${logoTag()}</div>
  </div>`;
}
function renderDealAnimation(){
  const targets=['to-bottom','to-left','to-top','to-right'];
  let html='';
  let delay=0;
  for(let round=0; round<3; round++){
    for(let t=0; t<4; t++){
      html += `<div class="deal-fly ${targets[t]}" style="--delay:${delay}ms"><div class="deck-card">${logoTag()}</div></div>`;
      delay += 95;
    }
  }
  html += `<div class="deal-fly to-vira" style="--delay:${delay+70}ms"><div class="deck-card">${logoTag()}</div></div>`;
  return html;
}
function statusLabelForVote(v){
  if(v==='accept') return 'ACEITOU';
  if(v==='run') return 'CORREU';
  if(v==='raise') return 'QUER AUMENTAR';
  return 'aguardando...';
}
function renderRoundDots(){
  const mine=localTrucoTeam();
  return [0,1,2].map(i=>{
    const w=truco.roundWinners[i];
    return `<i class="round-dot ${w===mine?'us':w===1-mine?'them':w==='tie'?'tie':''}"></i>`;
  }).join('');
}
function renderSeat(idx,pos){
  const p=truco.players.find(x=>x.seat===idx);
  if(!p) return '';
  const current=truco.current===idx && truco.phase==='playing';
  const cards=(truco.hands[idx]||[]).slice(0,truco.revealCounts[idx]||0);
  let hand='';
  if(idx!==localTrucoSeat()){
    if(pos==='left'||pos==='right') hand=`<div class="side-hand">${cards.map(()=>cardBackMini()).join('')}</div>`;
    else hand=`<div class="enemy-hand">${cards.map(()=>cardBackMini()).join('')}</div>`;
  }
  let roleText='Adversário';
  if(truco.mode==='2v2') roleText=(p.team===localTrucoTeam()?'Sua dupla':'Adversário');
  else roleText=(p.seat===localTrucoSeat()?'Você':'Adversário');

  return `<div class="player-seat seat-${pos}">
    <div class="seat-badge ${current?'current':''}">
      <div class="seat-avatar">${escapeHtml(p.avatar||initials(p.username))}</div>
      <div class="seat-name"><strong>${escapeHtml(p.username)}</strong><small>${roleText}</small></div>
      <span class="seat-team">T${p.team+1}</span>
    </div>${hand}
  </div>`;
}
function cardBackMini(){
  return `<div class="card-back-mini">${logoTag()}</div>`;
}
function renderCard(card,hidden=false,selectable=false,idx=null){
  if(hidden) return `<div class="truco-card hidden"></div>`;
  const s=suitInfo(card), sel=selectable && truco.selectedCard===idx;
  return `<div class="truco-card ${s.red?'red':''} ${selectable?'my-card':''} ${sel?'selected':''}" ${selectable?`onclick="selectTrucoCard(${idx})"`:''}>
    <span class="rank">${card.rank}<small>${s.sym}</small></span><span class="suit">${s.sym}</span>
  </div>`;
}
function trucoCardKey(card){
  return `${card.rank}-${card.suit}`;
}

function renderMyHand(){
  const seat=localTrucoSeat();
  if(truco.spectatorMode) return `<div class="my-hand"></div>`;

  const visibleCount=truco.revealCounts?.[seat] ?? (truco.hands?.[seat]?.length||0);
  const hand=(truco.hands?.[seat]||[]).slice(0,visibleCount);

  if(truco.ironHand && hand.every(c=>!c)){
    return `<div class="my-hand">${hand.map((c,i)=>`<div data-card-key="iron-${i}" class="truco-card hidden my-card ${truco.selectedCard===i?'selected':''}" onclick="selectTrucoCard(${i})"></div>`).join('')}</div>`;
  }

  return `<div class="my-hand">${hand.map((c,i)=>{
    if(!c) return `<div data-card-key="hidden-${i}" class="truco-card hidden my-card"></div>`;
    const s=suitInfo(c), sel=truco.selectedCard===i, manilha=c.rank===truco.manilhaRank;
    return `<div data-card-key="${trucoCardKey(c)}" class="truco-card ${s.red?'red':''} my-card ${sel?'selected':''} ${manilha?'is-manilha':''}" onclick="selectTrucoCard(${i})">
      <span class="rank">${c.rank}<small>${s.sym}</small></span><span class="suit">${s.sym}</span>
    </div>`;
  }).join('')}</div>`;
}

function renderOverlay(){
  if(truco.winner!==null){
    const canRematch=!truco.onlineMode || truco.room?.ownerId===state.user.id;
    return `<div class="game-message"><h2>${truco.winner===localTrucoTeam()?'VITÓRIA':'DERROTA'}</h2><p>${truco.winner===localTrucoTeam()?'Sua dupla chegou aos 12 pontos.':'A dupla adversária chegou aos 12 pontos.'}</p><div class="choices">${canRematch?`<button class="btn btn-primary" onclick="restartTrucoMatch()">Nova partida</button>`:''}<button class="btn btn-dark" onclick="returnFromTruco()">Voltar à sala</button></div>${truco.onlineMode&&!canRematch?'<small class="muted">O host pode iniciar a próxima partida.</small>':''}</div>`;
  }
  if(truco.phase==='eleven-decision'){
    const t=truco.handOfEleven.team;
    if(t===localTrucoTeam()){
      const partner=truco.players.find(p=>p.team===localTrucoTeam() && p.seat!==localTrucoSeat());
      const partnerCards=partner ? `<div style="display:flex;gap:8px;justify-content:center;margin:12px 0">${truco.hands[partner.seat].map(c=>renderCard(c,false,false)).join('')}</div>` : '';
      const myDecision=truco.handOfEleven?.responses?.[localTrucoSeat()];
      return `<div class="game-message"><h2>MÃO DE 11</h2><p>${truco.mode==='2v2'?'Sua dupla está com 11. Cada integrante decide. Se um correr, a dupla corre.':'Você está com 11. Escolha se quer jogar esta mão.'}</p>
        ${partnerCards}
        ${myDecision===undefined
          ? `<div class="choices"><button class="btn btn-primary" onclick="decideEleven(true)">JOGAR • vale 3</button><button class="btn btn-danger" onclick="decideEleven(false)">CORRER</button></div>`
          : `<div class="player-prompt">${myDecision?'Você escolheu JOGAR.':'Você escolheu CORRER.'} ${truco.mode==='2v2'?'Aguardando sua dupla…':''}</div>`}
      </div>`;
    } else {
      return `<div class="game-message"><h2>MÃO DE 11</h2><p>${truco.mode==='2v2'?'A dupla adversária está decidindo se joga esta mão.':'O adversário está decidindo se joga esta mão.'}</p></div>`;
    }
  }
  if(truco.phase==='iron-intro'){
    return `<div class="game-message"><h2>MÃO DE FERRO</h2><p>11 × 11. Ninguém vê as próprias cartas. Escolha no escuro.</p></div>`;
  }
  if(truco.phase==='raise-response' && truco.pendingRaise){
    const pr=truco.pendingRaise;
    const next=pr.to===3?6:pr.to===6?9:pr.to===9?12:null;
    const teamPlayers=truco.players.filter(p=>p.team===pr.targetTeam);
    const teamTitle=pr.to===3?'TRUCO!':pr.to===6?'SEIS!':pr.to===9?'NOVE!':'DOZE!';
    const rows=teamPlayers.map(p=>`<div class="raise-row"><strong>${escapeHtml(p.username)}</strong><span>${statusLabelForVote(pr.votes[p.seat])}</span></div>`).join('');
    if(pr.targetTeam===localTrucoTeam()){
      const myVote=pr.votes?.[localTrucoSeat()];
      return `<div class="game-message truco-call"><h2>${teamTitle}</h2><p>${escapeHtml((truco.players.find(p=>p.seat===pr.byPlayer)||{username:'Jogador'}).username)} aumentou a mão. O pedido só entra se a dupla concordar. Se um correr, a dupla corre.</p>
      <div class="raise-status">${rows}</div>
      ${myVote
        ? `<div class="player-prompt">Sua resposta: ${statusLabelForVote(myVote)}. ${truco.mode==='2v2'?'Aguardando sua dupla…':''}</div>`
        : `<div class="choices">
            <button class="btn btn-primary" onclick="respondRaise('accept')">ACEITAR</button>
            <button class="btn btn-danger" onclick="respondRaise('run')">CORRER</button>
            ${next?`<button class="btn btn-secondary" onclick="respondRaise('raise')">PEDIR ${next}</button>`:''}
          </div>`}
      </div>`;
    } else {
      return `<div class="game-message truco-call"><h2>${teamTitle}</h2><p>Aguardando resposta da dupla adversária.</p><div class="raise-status">${rows}</div></div>`;
    }
  }
  return '';
}
function renderTrucoActions(){
  if(truco.winner!==null) return '';
  const myTurn=truco.current===localTrucoSeat() && truco.phase==='playing' && !truco.spectatorMode;
  if(truco.phase==='dealing') return `<div class="truco-actions"><div class="player-prompt">Distribuindo as cartas...</div></div>`;
  const canHide=myTurn && truco.round>0 && !truco.ironHand;
  const canTruco=myTurn && !truco.handOfEleven && !truco.ironHand && truco.handValue<12 && !truco.pendingRaise;
  const nextRaise=truco.handValue===1?3:truco.handValue===3?6:truco.handValue===6?9:truco.handValue===9?12:null;
  return `<div class="truco-actions">
    ${myTurn?`<div class="player-prompt">${truco.hideNextCard?'CARTA ESCONDIDA • clique na carta que deseja jogar':'SUA VEZ • clique em uma carta para jogar'}</div>`:''}
    ${canHide?`<button class="btn ${truco.hideNextCard?'btn-danger':'btn-secondary'} action-main" onclick="toggleTrucoHideMode()">${truco.hideNextCard?'Cancelar esconder':'Esconder carta'}</button>`:''}
    ${nextRaise?`<button class="btn btn-secondary action-main" ${canTruco?'':'disabled'} onclick="requestRaise()">${nextRaise===3?'TRUCO':nextRaise}</button>`:''}
    <button class="btn btn-dark" onclick="leaveTrucoTable()">Sair da partida</button>
  </div>`;
}

function toggleTrucoHideMode(){
  const seat=localTrucoSeat();
  if(!isLocalTrucoPlayer() || truco.current!==seat || truco.phase!=='playing' || truco.round===0 || truco.ironHand) return;
  truco.hideNextCard=!truco.hideNextCard;
  truco.selectedCard=null;
  renderTruco();
}

function selectTrucoCard(idx){
  const seat=localTrucoSeat();
  if(
    truco.phase!=='playing' ||
    truco.spectatorMode ||
    truco.current!==seat ||
    !Number.isInteger(idx) ||
    idx<0 ||
    idx>=(truco.hands?.[seat]||[]).length
  ) return;

  const hidden=!!truco.ironHand || (!!truco.hideNextCard && truco.round>0);
  truco.hideNextCard=false;
  truco.selectedCard=null;
  trucoDispatch('PLAY_CARD',{playerIdx:seat,cardIdx:idx,hidden});
}
// Mantido apenas por compatibilidade com código antigo; a UI nova joga no clique.
function playSelected(hidden=false){
  const seat=localTrucoSeat();
  if(!isLocalTrucoPlayer() || truco.current!==seat || truco.selectedCard===null || truco.phase!=='playing') return;
  const idx=truco.selectedCard;
  truco.selectedCard=null;
  trucoDispatch('PLAY_CARD',{playerIdx:seat,cardIdx:idx,hidden});
}
function applyPlayCard({playerIdx,cardIdx,hidden=false}){
  clearInterval(trucoTimerInterval);
  const card=truco.hands[playerIdx].splice(cardIdx,1)[0];
  truco.trickCards.push({player:playerIdx,card,hidden});
  truco.selectedCard=null;
  truco.hideNextCard=false;
  const actingPlayer=playerBySeat(playerIdx);
  logTruco(`${actingPlayer?.username||'Jogador'} ${hidden?'jogou uma carta escondida':`jogou ${cardText(card)}`}.`);
  playCardSound(hidden);
  if(truco.trickCards.length===truco.activeSeats.length){
    truco.pendingTrick=localTrickPreview();
    truco.trickResolveAt=Date.now()+1800;
    truco.phase='resolving';
    renderTruco();
    setTimeout(resolveTrick,1800);
  } else {
    truco.current=nextActiveSeat(playerIdx);
    renderTruco();
    maybeBotTurn();
  }
}

function resolveTrick(){
  const pending=truco.pendingTrick||localTrickPreview();
  const winner=pending.result;
  const winnerSeat=pending.winnerSeat;
  const winnerPlayer=winner==='tie'?null:playerBySeat(winnerSeat);

  truco.roundWinners.push(winner);
  truco.lastTrickSummary={
    ...pending,
    winnerName:winner==='tie'?'Empate':(winnerPlayer?.username||'Jogador'),
    at:Date.now()
  };

  const localTeam=localTrucoTeam();
  logTruco(`Rodada ${truco.round+1}: ${winner==='tie'?'empate':winner===localTeam?(truco.mode==='1v1'?'você':'nossa dupla'):(truco.mode==='1v1'?'adversário':'adversários')}.`);
  showRoundFlash(winner==='tie'?'EMPATE NA RODADA':winner===localTeam?(truco.mode==='1v1'?'VOCÊ VENCEU A RODADA':'NOSSA DUPLA VENCEU A RODADA'):(truco.mode==='1v1'?'ADVERSÁRIO VENCEU A RODADA':'ELES VENCERAM A RODADA'));
  if(winner!=='tie') window.TDBSound?.play?.(winner===localTeam?'roundWin':'roundLose',{channel:'truco-round',dedupeMs:100});

  truco.discardCount += truco.activeSeats.length;
  const handWinner=evaluateHandWinner();
  if(handWinner!==null){
    truco.pendingTrick=null;
    truco.trickResolveAt=null;
    return awardHand(handWinner);
  }

  truco.round++;
  const nextStarter = winner==='tie' ? truco.starter : winnerSeat;
  truco.trickCards=[];
  truco.pendingTrick=null;
  truco.trickResolveAt=null;
  truco.starter=nextStarter;
  truco.current=truco.starter;
  truco.phase='playing';
  renderTruco();
  maybeBotTurn();
}
function firstPlayerOfWinningTeamFromLastTrick(team){
  const candidates=truco.trickCards.filter(x=>{
    const p=truco.players.find(pp=>pp.seat===x.player);
    return !x.hidden && p?.team===team;
  });
  if(!candidates.length) return truco.starter;
  let best=candidates[0];
  for(const c of candidates.slice(1)) if(compareCards(c,best)>0) best=c;
  return best.player;
}
function evaluateHandWinner(){
  const r=truco.roundWinners;
  if(r.length===1) return null;
  if(r.length===2){
    if(r[0]===0 && r[1]===0) return 0;
    if(r[0]===1 && r[1]===1) return 1;
    if(r[0]!=='tie' && r[1]==='tie') return r[0];
    if(r[0]==='tie' && r[1]!=='tie') return r[1];
    return null;
  }
  // 3 rounds
  const [a,b,c]=r;
  if(a==='tie' && b==='tie' && c==='tie') return 'none';
  if(c!=='tie') return c;
  if(a!=='tie') return a;
  if(b!=='tie') return b;
  return 'none';
}
function awardHand(team){
  clearInterval(trucoTimerInterval);
  if(team==='none'){
    logTruco('As três rodadas empataram. Ninguém pontua.');
  } else {
    const last=truco.lastTrickSummary;
    const winnerPlayer=last?.result===team?playerBySeat(last.winnerSeat):null;
    truco.lastHandSummary={
      team,
      points:truco.handValue,
      winnerSeat:winnerPlayer?.seat??null,
      winnerName:winnerPlayer?.username||(team===localTrucoTeam()?'Você':'Adversário'),
      winningCard:last?.result===team?last?.winningCard||null:null,
      hidden:last?.result===team?!!last?.hidden:false,
      at:Date.now(),
      expiresAt:Date.now()+4800
    };
    truco.scores[team]+=truco.handValue;
    logTruco(`${team===localTrucoTeam()?(truco.mode==='1v1'?'Você':'Nossa dupla'):(truco.mode==='1v1'?'Adversário':'Adversários')} ganhou ${truco.handValue} ponto(s).`);
  }
  if(truco.scores[0]>=12 || truco.scores[1]>=12){
    truco.winner=truco.scores[0]>=12?0:1;
    truco.phase='finished';
    window.TDBSound?.play?.(truco.winner===localTrucoTeam()?'victory':'defeat',{channel:'truco-result',dedupeMs:500});
    return renderTruco();
  }
  truco.phase='hand-end';
  renderTruco();
  setTimeout(dealNewHand,1100);
}

function requestRaise(){
  if(!isLocalTrucoPlayer()) return;
  trucoDispatch('REQUEST_RAISE',{playerIdx:localTrucoSeat()});
}


function applyRequestRaise({playerIdx}){
  const to=truco.handValue===1?3:truco.handValue===3?6:truco.handValue===6?9:truco.handValue===9?12:null;
  if(!to) return;

  const p=playerBySeat(playerIdx);
  if(!p) return;

  truco.raiseToken=(truco.raiseToken||0)+1;
  const token=truco.raiseToken;

  truco.pendingRaise={
    from:truco.handValue,
    to,
    byPlayer:playerIdx,
    targetTeam:1-p.team,
    votes:{0:null,1:null,2:null,3:null},
    token
  };
  truco.phase='raise-response';

  logTruco(`${p.username} pediu ${to===3?'TRUCO':to}.`);
  playTrucoSound();
  renderTruco();

  scheduleBotRaiseVotes();
  maybeAutoFriendlyVote();
  startBotRaiseWatchdog(token);
}

function teamHandHeuristic(team){
  if(!truco || !Array.isArray(truco.players)) return 0;

  let total=0;
  let count=0;

  for(const player of truco.players){
    if(player.team!==team) continue;

    const hand=truco.hands?.[player.seat] || [];
    for(const card of hand){
      try{
        total += cardStrength(card);
        count++;
      }catch(err){
        console.warn('[TDB Truco] Não foi possível avaliar uma carta do bot.',err);
      }
    }
  }

  // Preserve a useful minimum value even if a hand is temporarily unavailable
  // during animation/state transitions.
  return count ? total : 12;
}

function botRaiseChoiceForTeam(team,to){
  try{
    const strength=teamHandHeuristic(team);
    const roll=Math.random();

    // Bot ALWAYS returns one valid action.
    if(to===12){
      return strength<13 && roll<.55 ? 'run' : 'accept';
    }

    if(to===9){
      if(strength<14 && roll<.48) return 'run';
      if(strength>23 && roll<.26) return 'raise';
      return 'accept';
    }

    if(to===6){
      if(strength<11 && roll<.38) return 'run';
      if(strength>22 && roll<.24) return 'raise';
      return 'accept';
    }

    if(to===3){
      if(strength<8 && roll<.22) return 'run';
      if(strength>21 && roll<.20) return 'raise';
      return 'accept';
    }

    return 'accept';
  }catch(err){
    // Absolute fallback: a bot must never remain waiting because of AI/evaluation.
    console.error('[TDB Truco] Avaliação do bot falhou. Aceitando por segurança.',err);
    return 'accept';
  }
}

function forceBotRaiseResponse(player,token){
  const current=truco?.pendingRaise;
  if(!current || current.token!==token || !player?.bot) return false;
  if(current.votes[player.seat]!==null) return true;

  let action='accept';
  try{
    action=botRaiseChoiceForTeam(current.targetTeam,current.to);
  }catch(err){
    console.error('[TDB Truco] Falha inesperada ao escolher resposta. Fallback ACCEPT.',err);
  }

  if(!['accept','run','raise'].includes(action)) action='accept';

  applyRespondRaise({
    action,
    bot:true,
    responderIdx:player.seat
  });
  return true;
}

function scheduleBotRaiseVotes(){
  const pr=truco?.pendingRaise;
  if(!pr) return;

  const token=pr.token;
  const targetBots=truco.players.filter(
    p=>p.team===pr.targetTeam && p.bot
  );

  targetBots.forEach((player,idx)=>{
    setTimeout(()=>{
      forceBotRaiseResponse(player,token);
    },420 + idx*260);
  });
}

function startBotRaiseWatchdog(token){
  // First fallback: resolve any bot still waiting.
  setTimeout(()=>{
    const current=truco?.pendingRaise;
    if(!current || current.token!==token) return;

    const waitingBots=truco.players.filter(
      p=>p.team===current.targetTeam &&
         p.bot &&
         current.votes[p.seat]===null
    );

    waitingBots.forEach(player=>forceBotRaiseResponse(player,token));
  },1100);

  // Absolute second fallback: no bot-controlled vote may remain null.
  setTimeout(()=>{
    const current=truco?.pendingRaise;
    if(!current || current.token!==token) return;

    for(const player of truco.players){
      if(player.team!==current.targetTeam || !player.bot) continue;
      if(current.votes[player.seat]===null){
        current.votes[player.seat]='accept';
      }
    }

    evaluateRaiseVotes();
  },1800);
}
function evaluateRaiseVotes(){
  const pr=truco.pendingRaise;
  if(!pr) return;
  const seats=truco.players.filter(p=>p.team===pr.targetTeam).map(p=>p.seat);
  const votes=seats.map(seat=>pr.votes[seat]);

  if(votes.includes('run')){
    const winningTeam=1-pr.targetTeam;
    truco.pendingRaise=null;
    truco.raiseVotes=null;
    truco.phase='hand-end';
    truco.scores[winningTeam]+=pr.from;
    logTruco(`${pr.targetTeam===localTrucoTeam()?'Nossa dupla':'Adversários'} correu. ${winningTeam===0?'Nós':'Eles'} ganhamos ${pr.from}.`);
    if(truco.scores[winningTeam]>=12){ truco.winner=winningTeam; truco.phase='finished'; return renderTruco(); }
    renderTruco(); return setTimeout(dealNewHand,950);
  }

  if(votes.some(v=>v===null)) { renderTruco(); return; }

  const allRaise = votes.every(v=>v==='raise');
  const allAccept = votes.every(v=>v==='accept');
  const nonRunAgreement = votes.every(v=>v==='accept' || v==='raise');

  if(allRaise){
    const next=pr.to===3?6:pr.to===6?9:pr.to===9?12:null;
    if(next){
      const responderPlayer = seats[0];
      truco.handValue=pr.to;
      truco.raiseToken=(truco.raiseToken||0)+1;
      const token=truco.raiseToken;
      truco.pendingRaise={from:pr.to,to:next,byPlayer:responderPlayer,targetTeam:1-pr.targetTeam,votes:{0:null,1:null,2:null,3:null},token};
      truco.phase='raise-response';
      logTruco(`${pr.targetTeam===localTrucoTeam()?'Nossa dupla':'Adversários'} pediu ${next}.`);
      playTrucoSound();
      renderTruco();
      scheduleBotRaiseVotes();
      maybeAutoFriendlyVote();
      startBotRaiseWatchdog(token);
      return;
    }
  }

  if(allAccept || nonRunAgreement){
    truco.handValue=pr.to;
    truco.raiseLevel=pr.to;
    truco.pendingRaise=null;
    truco.raiseVotes=null;
    truco.phase='playing';
    logTruco(`Pedido aceito. A mão agora vale ${truco.handValue}.`);
    renderTruco(); return maybeBotTurn();
  }
}
function respondRaise(action,bot=false,responderIdx=0){
  trucoDispatch('RESPOND_RAISE',{action,bot,responderIdx});
}
function applyRespondRaise({action,bot=false,responderIdx=0}){
  const pr=truco.pendingRaise;
  if(!pr) return;
  const seat=bot?responderIdx:localTrucoSeat();
  const responder=playerBySeat(seat);

  pr.votes[seat]=action;

  if(bot && responder){
    const label=action==='accept'?'aceitou':action==='run'?'correu':'pediu aumento';
    logTruco(`${responder.username} ${label}.`);
  }

  renderTruco();
  evaluateRaiseVotes();
}
function maybeAutoFriendlyVote(){
  const pr=truco?.pendingRaise;
  if(!pr || pr.targetTeam!==localTrucoTeam()) return;

  const partner=truco.players.find(
    p=>p.team===localTrucoTeam() && p.seat!==localTrucoSeat() && p.bot
  );

  if(!partner || pr.votes[partner.seat]!==null) return;

  const token=pr.token;

  setTimeout(()=>{
    forceBotRaiseResponse(partner,token);
  },480);
}

function decideEleven(play){
  if(!truco?.handOfEleven?.pending) return;
  return trucoDispatch('ELEVEN_DECISION',{
    play:!!play,
    playerIdx:localTrucoSeat()
  });
}
function applyLocalElevenDecision({play,playerIdx=localTrucoSeat(),bot=false}={}){
  const hand11=truco?.handOfEleven;
  if(!hand11?.pending) return false;

  const player=playerBySeat(playerIdx);
  if(!player || player.team!==hand11.team) return false;

  hand11.responses=hand11.responses||{};
  hand11.responses[playerIdx]=!!play;

  if(!play){
    const other=1-hand11.team;
    truco.scores[other]+=1;
    logTruco(`${player.username} correu na Mão de 11.`);
    truco.handOfEleven=null;
    if(truco.scores[other]>=12){
      truco.winner=other;
      truco.phase='finished';
      renderTruco();
      return true;
    }
    truco.phase='hand-end';
    renderTruco();
    setTimeout(dealNewHand,900);
    return true;
  }

  const members=truco.players.filter(p=>p.team===hand11.team);

  // Local bot teammate decides automatically so bot tests cannot deadlock.
  for(const member of members){
    if(member.seat===playerIdx || hand11.responses[member.seat]!==undefined) continue;
    if(member.bot) hand11.responses[member.seat]=true;
  }

  const waiting=members.some(member=>hand11.responses[member.seat]===undefined);
  if(waiting){
    renderTruco();
    return true;
  }

  hand11.pending=false;
  truco.handValue=3;
  truco.raiseLevel=3;
  truco.phase='playing';
  logTruco('Mão de 11 aceita. A mão vale 3 pontos.');
  renderTruco();
  maybeBotTurn();
  return true;
}

function maybeAutoElevenDecision(){
  if(truco.handOfEleven?.team!==1) return;

  setTimeout(()=>{
    try{
      const strength=teamHandHeuristic(1);
      trucoDispatch('ELEVEN_DECISION',{
        play:strength>=16,
        bot:true
      });
    }catch(err){
      console.error('[TDB Truco] Bot falhou na Mão de 11. Jogando por fallback.',err);
      trucoDispatch('ELEVEN_DECISION',{
        play:true,
        bot:true
      });
    }
  },700);
}

function maybeBotTurn(){
  if(truco.phase!=='playing' || truco.winner!==null) return;
  const p=truco.players.find(pp=>pp.seat===truco.current);
  if(!p || !p.bot) return;
  setTimeout(()=>{
    if(truco.phase!=='playing' || truco.current!==p.seat) return;
    if(!truco.handOfEleven && !truco.ironHand && truco.handValue<12 && Math.random()<.10){
      botRequestRaise(p.seat);
      return;
    }
    const hand=truco.hands[p.seat]||[];
    if(!hand.length) return;
    let idx=Math.floor(Math.random()*hand.length);
    if(Math.random()<.65){
      idx=hand.map((c,i)=>({i,p:cardStrength(c)})).sort((a,b)=>b.p-a.p)[0].i;
    }
    const hide=truco.round>0 && !truco.ironHand && Math.random()<.12;
    trucoDispatch('PLAY_CARD',{playerIdx:p.seat,cardIdx:idx,hidden:hide});
  },550+Math.random()*500);
}
function botRequestRaise(playerIdx){
  const to=truco.handValue===1?3:truco.handValue===3?6:truco.handValue===6?9:9===truco.handValue?12:null;
  if(!to) return maybeBotTurn();
  trucoDispatch('REQUEST_RAISE',{playerIdx});
}
function setupTurnTimer(){
  clearInterval(trucoTimerInterval);
  const seconds=Number(truco.room?.turnTimer||truco.turnTimer||0);
  if(!seconds || truco.phase!=='playing' || truco.winner!==null) return;
  if(truco.onlineMode){
    const update=()=>{
      const left=truco.turnDeadlineAt?Math.max(0,Math.ceil((truco.turnDeadlineAt-Date.now())/1000)):seconds;
      truco.timerLeft=left;const ring=document.querySelector('.timer-ring');if(ring)ring.textContent=left;
      if(left<=0){clearInterval(trucoTimerInterval);window.TDBOnline?.syncGame?.(truco.room.code,'player')}
    };
    update();trucoTimerInterval=setInterval(update,250);return;
  }
  truco.timerLeft=seconds;
  trucoTimerInterval=setInterval(()=>{
    if(!truco || truco.phase!=='playing'){clearInterval(trucoTimerInterval);return}
    truco.timerLeft--;const ring=document.querySelector('.timer-ring');if(ring)ring.textContent=truco.timerLeft;
    if(truco.timerLeft<=0){clearInterval(trucoTimerInterval);autoPlayCurrent()}
  },1000);
}
function autoPlayCurrent(){
  if(truco.phase!=='playing') return;
  const p=truco.current, hand=truco.hands[p];
  if(!hand.length) return;
  const idx=Math.floor(Math.random()*hand.length);
  logTruco(`${playerBySeat(p)?.username||'Jogador'} ficou sem tempo. Carta aleatória jogada.`);
  trucoDispatch('PLAY_CARD',{playerIdx:p,cardIdx:idx,hidden:false});
}
async function returnFromTruco(){
  clearInterval(trucoTimerInterval);

  if(truco?.onlineMode && !truco?.room?.simulation){
    const code=truco.room?.code||state.activeRoom?.code;
    OnlineGameBridge.stop();

    const room=code?await window.TDBOnline?.returnGameToRoom?.(code):null;
    if(!room){
      toast('Não foi possível voltar à sala agora.');
      return;
    }

    state.activeRoom=room;
    Core.rooms.setActive(room);
    state.view='waiting';
    setPresence('room',{roomCode:room.code,game:'truco'});
    renderWaitingRoom();
    return;
  }

  state.view='waiting';
  renderWaitingRoom();
}

async function restartTrucoMatch(){
  clearInterval(trucoTimerInterval);

  if(truco?.onlineMode && !truco?.room?.simulation){
    const code=truco.room?.code||state.activeRoom?.code;
    if(truco.room?.ownerId!==state.user.id){
      toast('Somente o host pode iniciar a nova partida.');
      return returnFromTruco();
    }

    // Keep the bridge identity so the official new state can be applied immediately.
    OnlineGameBridge.roomCode=code;
    OnlineGameBridge.role='player';

    const result=await window.TDBOnline?.rematchGame?.(code);
    if(!result?.state){
      toast('Não foi possível iniciar a nova partida.');
      return;
    }

    if(result.room){
      state.activeRoom=result.room;
      Core.rooms.setActive(result.room);
    }
    state.view='playing-truco';
    setPresence('playing',{roomCode:code,game:'truco'});
    return;
  }

  // Bot/local match: build a completely fresh match instead of reusing terminal state.
  const room=structuredClone(truco.room);
  state.view=room.simulation?'bot-truco':'playing-truco';
  startTrucoGame(room,!!room.simulation);
}

function leaveTrucoTable(){
  if(truco?.onlineMode && truco?.phase!=='finished'){
    if(!confirm('Sair agora encerra sua participação nesta partida. Deseja continuar?')) return;
    return leaveRoom();
  }
  return returnFromTruco();
}

window.startTrucoWithBots=startTrucoWithBots;
window.startTrucoGame=startTrucoGame;
window.selectTrucoCard=selectTrucoCard;
window.toggleTrucoHideMode=toggleTrucoHideMode;
window.playSelected=playSelected;
window.requestRaise=requestRaise;
window.respondRaise=respondRaise;
window.decideEleven=decideEleven;
window.restartTrucoMatch=restartTrucoMatch;
window.returnFromTruco=returnFromTruco;
window.leaveTrucoTable=leaveTrucoTable;

function renderTrucoSpectator(room){
  const t=window.truco||null;
  app.innerHTML=`${topbar()}<section class="spectator-placeholder">${logoTag()}<h1>Truco • Modo espectador</h1><p>${t?`Placar: ${t.scores?.[0]??0} x ${t.scores?.[1]??0}`:'Partida em andamento.'}</p><p>As cartas privadas dos jogadores permanecem ocultas para espectadores.</p><button class="btn btn-secondary" onclick="leaveRoom()">Sair da transmissão</button></section>`;
}
window.renderTrucoSpectator=renderTrucoSpectator;
