
window.addEventListener('error',event=>{
  console.error('[TDB JOGOS] Erro de interface:',event.error||event.message);
});
window.addEventListener('unhandledrejection',event=>{
  console.error('[TDB JOGOS] Promise rejeitada:',event.reason);
});


const app = document.getElementById('app');
const Core = window.TDBCore;

if(!Core){
  throw new Error('TDBCore não foi carregado antes do app.js');
}

const DEFAULT_SETTINGS = { sound: true, friendNotifications: true };

const state = {
  user: Core.auth.currentUser(),
  users: Core.auth.users(),
  friends: Core.storage.get('tbd_friends', []),
  rooms: Core.rooms.list(),
  settings: Core.storage.get('tbd_settings', DEFAULT_SETTINGS),
  view: 'login',
  selectedGame: null,
  activeRoom: Core.rooms.active(),
  roomFilter: 'all'
};


window.addEventListener('tdb-online-sync',()=>{
  if(Core.mode!=='online') return;

  state.rooms=Core.rooms.list();

  if(state.activeRoom && !state.activeRoom.simulation){
    const latest=state.rooms.find(r=>r.code===state.activeRoom.code);
    if(latest){
      state.activeRoom=latest;
      Core.rooms.setActive(latest);
    }
  }

  // Atualiza somente telas de navegação. Não remonta sala de espera/player/partida.
  if(state.view==='lobby') renderLobby();
  else if(state.view==='game') drawGamePage();
});

window.addEventListener('tdb-online-status',()=>{
  const el=document.getElementById('onlineStatusPill');
  if(el){
    const online=window.TDBOnline?.connected;
    el.textContent=online?'ONLINE':'LOCAL';
    el.classList.toggle('online',!!online);
  }
});


const OnlineGameBridge={
  roomCode:null,
  role:'player',
  syncTimer:null,
  start(room,role='player'){
    if(Core.mode!=='online' || !window.TDBOnline?.connected) return false;
    this.roomCode=room.code;
    this.role=role;
    window.TDBOnline.joinGame(room.code,state.user.id,role);
    clearInterval(this.syncTimer);
    this.syncTimer=setInterval(()=>{
      if(this.roomCode) window.TDBOnline.syncGame(this.roomCode,state.user.id,this.role);
    },1000);
    return true;
  },
  stop(){
    clearInterval(this.syncTimer);
    this.syncTimer=null;
    this.roomCode=null;
  },
  action(action){
    if(!this.roomCode) return false;
    return window.TDBOnline.gameAction(this.roomCode,state.user.id,action);
  }
};
window.OnlineGameBridge=OnlineGameBridge;

window.addEventListener('tdb-game-state',event=>{
  const {roomCode,state:gameState}=event.detail||{};
  if(!gameState || roomCode!==OnlineGameBridge.roomCode) return;

  if(gameState.game==='chess'){
    window.applyOnlineChessState?.(gameState,state.activeRoom,OnlineGameBridge.role);
  }else if(gameState.game==='truco'){
    applyOnlineTrucoState(gameState,OnlineGameBridge.role);
  }
});

const games = {
  truco: { name: 'Truco', symbol: '🃏', subtitle: 'Blefe, parceria e resenha.', players: 4, minPlayers: 2, prefix: 'TRC' },
  blackjack: { name: 'Blackjack', symbol: '♠️', subtitle: 'Mesa casual com dealer automático.', players: 5, minPlayers: 1, prefix: 'BLJ' },
  chess: { name: 'Xadrez', symbol: '♟️', subtitle: 'Partidas rápidas 1x1 entre amigos.', players: 2, minPlayers: 2, prefix: 'XDR' },
  music: { name: 'TDB Music', symbol: '🎵', subtitle: 'Ouça YouTube em uma fila compartilhada.', players: 20, minPlayers: 1, prefix: 'MUS' }
};

Core.sound.setEnabled(state.settings.sound);


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
  return `<img ${extra} src="assets/logo-transparent.png" alt="TDB JOGOS" onerror="this.style.display='none'">`;
}
function saveUsers(){ Core.auth.saveUsers(state.users); }
function saveFriends(){ Core.storage.set('tbd_friends', state.friends); }
function saveRooms(){ Core.rooms.replace(state.rooms); }
function saveSettings(){
  Core.storage.set('tbd_settings', state.settings);
  Core.sound.setEnabled(state.settings.sound);
}
function saveSession(user){
  state.user=user;
  Core.auth.setCurrentUser(user);
  if(user) setPresence('lobby');
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
  try {
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.frequency.value=freq; gain.gain.value=.025;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);
    osc.stop(ctx.currentTime+duration);
  } catch {}
}
function currentStatus(){
  if(state.activeRoom){
    const g=games[state.activeRoom.game];
    return state.activeRoom.status==='playing' ? `Jogando ${g.name}` : `Na sala de ${g.name}`;
  }
  return 'No lobby';
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
function watchRoom(code){
  const room=getRoomByCode(code);
  if(!room) return toast('Sala não encontrada.');
  if(room.status!=='playing') return toast('Essa partida ainda não começou.');

  addSpectator(room,state.user);
  saveActiveRoom(room);
  setPresence('watching',{roomCode:room.code,game:room.game});

  if(Core.mode==='online' && window.TDBOnline?.connected && ['truco','chess'].includes(room.game)){
    OnlineGameBridge.start(room,'spectator');
    app.innerHTML=`${topbar()}<section class="spectator-placeholder">${logoTag()}<h1>Conectando à partida...</h1><p>Modo espectador online</p><button class="btn btn-secondary" onclick="leaveRoom()">Voltar</button></section>`;
    return;
  }

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
  }

  return Core.actions.dispatch('truco', action, payload);
}

function cleanupEmptyLocalRooms(){
  if(Core.mode==='online') return;
  const before=state.rooms.length;
  const activeCode=state.activeRoom?.code || null;

  state.rooms=state.rooms.filter(room=>{
    const humans=humanPlayers(room);

    if(room.simulation) return false;

    // Any local room with no real player is garbage/simulation.
    if(humans.length===0) return false;

    // A local room left "playing" from an old test should disappear
    // unless it is the match this browser is currently inside.
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
        <div><div class="brand-name">TDB JOGOS</div><div class="brand-sub">JOGOS ENTRE AMIGOS</div></div>
      </div>
      <div class="auth-copy">
        <h1>A espera ficou<br>mais divertida.</h1>
        <p>Truco, Xadrez, Blackjack e música em um só lugar. Entre com a galera e transforme aqueles minutos de fila em uma partida.</p>
        <div class="pill-row"><span class="pill">Truco</span><span class="pill">Blackjack</span><span class="pill">Xadrez</span><span class="pill">TDB Music</span></div>
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
      </div>
    </section>
  </section>`;
  document.getElementById('switchAuth').onclick=()=>renderAuth(isRegister?'login':'register');
  document.getElementById('authForm').onsubmit=e=>{
    e.preventDefault();
    const username=document.getElementById('username').value.trim();
    const password=document.getElementById('password').value;
    if(isRegister){
      const p2=document.getElementById('password2').value;
      if(username.length<3) return toast('Use pelo menos 3 caracteres no nome.');
      if(password!==p2) return toast('As senhas não coincidem.');
      if(state.users.some(u=>(u.username||'').toLowerCase()===username.toLowerCase())) return toast('Esse nome de usuário já está em uso.');
      const user={id:genPlayerId(),username,password,avatar:initials(username),status:'No lobby',createdAt:new Date().toISOString()};
      state.users.push(user); saveUsers(); saveSession(user); playUiSound(620); setTimeout(renderLobby,180);
    }else{
      const user=state.users.find(u=>(u.username||'').toLowerCase()===username.toLowerCase()&&u.password===password);
      if(!user) return toast('Nome de usuário ou senha incorretos.');
      saveSession(user); playUiSound(620); setTimeout(()=>{
        if(state.activeRoom && state.activeRoom.players?.some(p=>p.id===user.id)) renderWaitingRoom();
        else renderLobby();
      },180);
    }
  };
}

function topbar(active='home'){
  return `<header class="topbar">
    <div class="topbar-left">
      <div class="top-brand" onclick="goHome()" style="cursor:pointer">${logoTag()}<strong>TDB JOGOS</strong></div>
      <nav class="nav-links">
        <button class="nav-link ${active==='home'?'active':''}" onclick="goHome()">Início</button>
        <button class="nav-link ${active==='friends'?'active':''}" onclick="renderFriends()">Amigos</button>
        <button class="nav-link ${active==='profile'?'active':''}" onclick="renderProfile()">Perfil</button>
        <button class="nav-link ${active==='settings'?'active':''}" onclick="renderSettings()">Configurações</button>
      </nav>
    </div>
    <div class="topbar-right">
      <span id="onlineStatusPill" class="online-status-pill ${window.TDBOnline?.connected?'online':''}">${window.TDBOnline?.connected?'ONLINE':'LOCAL'}</span>
      <div class="profile-mini" onclick="renderProfile()" style="cursor:pointer">
        <div class="avatar">${escapeHtml(state.user?.avatar||initials(state.user?.username))}</div>
        <div class="profile-lines"><strong>${escapeHtml(state.user?.username||'Jogador')}</strong><small>${escapeHtml(state.user?.id||'')}</small></div>
      </div>
      <button class="btn btn-dark" onclick="logout()">Sair</button>
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

    // Any bot-only room dies immediately when the last real player leaves.
    if(humans.length===0){
      destroyRoomAndMatch(room.code,reason);
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
    console.error('[TDB JOGOS] Falha ao voltar ao início:',err);
    saveActiveRoom(null);
    renderLobby();
  }
}
window.goHome=goHome;

function renderLobby(){
  if(!state.user) return renderAuth('login');
  state.view='lobby';
  app.innerHTML=`${topbar('home')}
  <section class="dashboard fade-in">
    <div class="hero-strip">
      <span class="eyebrow">TDB JOGOS</span>
      <h1>A espera ficou mais divertida.</h1>
      <p>Escolha um jogo, encontre uma sala ou crie a sua. Sem torneios, sem moedas: só uma mesa rápida para jogar com os amigos.</p>
    </div>
    <div class="section-title"><div><h2>Partidas ao vivo</h2><p>Assista sem interferir na partida.</p></div></div>
    <div class="live-grid">${renderLiveMatches()}</div>
    <div class="section-title"><div><h2>Escolha um jogo</h2><p>As salas ficam dentro de cada jogo.</p></div></div>
    <div class="game-grid">${gameCard('truco')}${gameCard('blackjack')}${gameCard('chess')}${gameCard('music')}</div>
    <div class="section-title"><div><h2>Amigos online</h2><p>Convide alguém para entrar na sua próxima mesa.</p></div><button class="link-btn" onclick="renderFriends()">Ver todos →</button></div>
    <div class="friends-grid">${state.friends.slice(0,3).map(friendCard).join('')}</div>
  </section>`;
}

function gameCard(key){
  const g=games[key], art=key==='truco'?'art-truco':key==='blackjack'?'art-blackjack':key==='chess'?'art-chess':'art-music';
  const open=getAllRooms(key).filter(r=>r.status==='open').length;
  return `<article class="game-card" onclick="renderGame('${key}')">
    <div class="game-art ${art}"></div><div class="game-symbol">${g.symbol}</div>
    <div class="game-content"><span class="game-count">${open} sala${open===1?'':'s'} aberta${open===1?'':'s'}</span><h3>${g.name}</h3><p>${g.subtitle}</p><button class="btn btn-primary">Ver salas</button></div>
  </article>`;
}
function friendCard(f){
  const busy=f.status.startsWith('Jogando');
  return `<div class="friend-card">
    <div class="avatar">${escapeHtml(f.avatar||initials(f.username))}</div>
    <div class="friend-meta"><strong>${escapeHtml(f.username)}</strong><span><i class="dot ${busy?'busy':'online'}"></i>${escapeHtml(f.status)}</span><small>${escapeHtml(f.id)}</small></div>
    <button class="btn btn-dark" onclick="inviteFriend('${f.id}')">Convidar</button>
  </div>`;
}
function inviteFriend(id){
  const f=state.friends.find(x=>x.id===id);
  if(!state.activeRoom) return toast(`Entre ou crie uma sala antes de convidar ${f?.username||'o amigo'}.`);
  playUiSound(); toast(`Convite enviado para ${f?.username||'amigo'} • Sala ${state.activeRoom.code}`);
}

function renderGame(key){
  state.selectedGame=key; state.view='game'; state.roomFilter='all';
  drawGamePage();
}
function drawGamePage(){
  const key=state.selectedGame, g=games[key];
  let rooms=getAllRooms(key);
  if(state.roomFilter==='open') rooms=rooms.filter(r=>r.status==='open');
  if(state.roomFilter==='playing') rooms=rooms.filter(r=>r.status==='playing');
  app.innerHTML=`${topbar()}
  <section class="game-page fade-in">
    <div class="back-row">
      <div class="game-head"><div class="big-symbol">${g.symbol}</div><div><h1>${g.name}</h1><p>${g.subtitle} • até ${g.players} jogadores</p></div></div>
      <div class="room-actions"><button class="btn btn-primary" onclick="openCreateRoom()">+ Criar jogo</button><button class="btn btn-secondary" onclick="openJoinCode()">Entrar com código</button><button class="btn btn-dark" onclick="goHome()">Voltar</button></div>
    </div>
    <div class="filter-row">
      <button class="filter-chip ${state.roomFilter==='all'?'active':''}" onclick="setRoomFilter('all')">Todas</button>
      <button class="filter-chip ${state.roomFilter==='open'?'active':''}" onclick="setRoomFilter('open')">Abertas</button>
      <button class="filter-chip ${state.roomFilter==='playing'?'active':''}" onclick="setRoomFilter('playing')">Em andamento</button>
    </div>
    <div class="rooms-layout">
      <div class="panel">
        <div class="panel-header"><h2>Salas de ${g.name}</h2><span class="muted">${rooms.length} encontrada${rooms.length===1?'':'s'}</span></div>
        <div class="panel-body"><div class="room-list">${rooms.length?rooms.map(roomRow).join(''):`<div class="empty-state">Nenhuma sala nesse filtro.</div>`}</div></div>
      </div>
      <aside class="panel side-info"><div class="panel-header"><h2>Como funciona</h2></div><div class="panel-body">
        <h3>Salas abertas</h3><p>Você pode entrar enquanto houver vaga. Sala privada pode pedir senha.</p>
        <h3 style="margin-top:22px;">${key==='chess'?'Xadrez Tradicional':key==='music'?'Sala compartilhada':'Em andamento'}</h3><p>${key==='chess'?'Partidas 1x1 com movimentos legais, xeque, mate, roque, en passant e promoção.':key==='music'?'Todos adicionam vídeos do YouTube na fila e compartilham os controles da sala.':'Continuam visíveis para mostrar onde a galera está jogando.'}</p>
        <h3 style="margin-top:22px;">Seu jogo</h3><ul><li>Crie uma sala.</li><li>Compartilhe o código.</li><li>Convide amigos.</li></ul>
      </div></aside>
    </div>
  </section>`;
}
function setRoomFilter(filter){ state.roomFilter=filter; drawGamePage(); }
function roomRow(room){
  const g=games[room.game], cap=roomCapacity(room), open=room.status==='open', full=(room.players?.length||0)>=cap;
  const joinable=room.game==='music' ? !full : (open&&!full);
  return `<div class="room-row">
    <div class="room-name"><strong>${escapeHtml(room.name)}</strong><span>${room.code} • Host: ${escapeHtml(room.owner)} ${room.privacy==='private'?'🔒':''}${room.game==='truco'?` • ${cap===2?'1x1':'2x2'}`:''}${room.game==='music'?' • 🎵 compartilhada':''}</span></div>
    <div class="room-stat"><strong>${room.players?.length||0}/${cap}</strong><span>${room.game==='music'?'Ouvintes':'Jogadores'}</span></div>
    <div><span class="badge ${open?'open':'playing'}">${room.game==='music'?(open?'Aberta':'Tocando'):open?'Aberta':'Em andamento'}</span></div>
    <button class="btn ${joinable?'btn-primary':'btn-dark'}" ${joinable?`onclick="requestJoinRoom('${room.code}')"`:'disabled'}>${joinable?'Entrar':full?'Cheia':'Jogando'}</button>
  </div>`;
}

function openCreateRoom(){
  const g=games[state.selectedGame];
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="modalBackdrop"><div class="modal">
    <div class="modal-head"><h3>Criar jogo de ${g.name}</h3><button class="icon-btn" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field"><label>Nome da sala</label><input id="roomName" maxlength="30" value="Sala de ${escapeHtml(state.user.username)}"></div>
      <div class="field"><label>Privacidade</label><select id="roomPrivacy" class="select"><option value="public">Pública</option><option value="private">Privada</option></select></div>
      <div class="field"><label>Senha opcional</label><input id="roomPassword" maxlength="16" placeholder="Deixe vazio se não quiser senha"></div>
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
      ${state.selectedGame==='music'?`
        <div class="field"><label>Quem controla o player</label>
          <select id="musicControl" class="select">
            <option value="everyone" selected>Todos na sala</option>
            <option value="host">Somente host</option>
          </select>
        </div>
        <div class="field"><label>Quem pode pular</label>
          <select id="musicSkipMode" class="select">
            <option value="everyone" selected>Todos na sala</option>
            <option value="host">Somente host</option>
          </select>
        </div>`:''}
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
function createRoom(){
  const name=document.getElementById('roomName').value.trim()||`Sala de ${state.user.username}`;
  const privacy=document.getElementById('roomPrivacy').value;
  const password=document.getElementById('roomPassword').value.trim();
  const turnTimer=state.selectedGame==='truco' ? Number(document.getElementById('turnTimer')?.value||0) : 0;
  const trucoSeats=state.selectedGame==='truco' ? Number(document.getElementById('trucoSeats')?.value||4) : null;
  const chessClock=state.selectedGame==='chess' ? Number(document.getElementById('chessClock')?.value||0) : null;
  const chessColor=state.selectedGame==='chess' ? (document.getElementById('chessColor')?.value||'random') : null;
  const musicControl=state.selectedGame==='music' ? (document.getElementById('musicControl')?.value||'everyone') : null;
  const musicSkipMode=state.selectedGame==='music' ? (document.getElementById('musicSkipMode')?.value||'everyone') : null;

  const room={
    code:genRoomCode(state.selectedGame),
    game:state.selectedGame,
    name,
    owner:state.user.username,
    ownerId:state.user.id,
    privacy,
    password,
    status:'open',
    turnTimer,
    trucoSeats,
    chessClock,
    chessColor,
    musicControl,
    musicSkipMode,
    players:[{username:state.user.username,id:state.user.id,avatar:state.user.avatar}],
    spectators:[],
    createdAt:Date.now()
  };

  const existing=state.rooms.findIndex(r=>r.code===room.code);
  if(existing>=0) state.rooms[existing]=room;
  else state.rooms.push(room);

  // IMPORTANT: room creator is inside immediately, before any realtime redraw.
  saveActiveRoom(room);
  state.view='waiting';

  if(Core.mode==='online' && window.TDBOnline?.connected){
    Core.rooms.upsert(room);
  }else{
    saveRooms();
  }

  closeModal();
  playUiSound(560);

  // Music has no "start match" gate: creator goes straight into the shared player.
  if(room.game==='music') return openMusicRoom();

  renderWaitingRoom();
}

window.addEventListener('tdb-room-join-result',event=>{
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
  state.view=room.game==='music'?'music':'waiting';

  if(room.game==='music') return openMusicRoom();
  renderWaitingRoom();
});

function requestJoinRoom(code){
  const room=getRoomByCode(code);
  if(!room) return toast('Sala não encontrada.');

  if(Core.mode==='online' && window.TDBOnline?.connected){
    let password='';
    if(room.privacy==='private' || room.hasPassword){
      password=prompt('Senha da sala:')||'';
      if(!password) return;
    }

    state.view='joining';
    const sent=window.TDBOnline.joinRoom(code,password,{
      id:state.user.id,
      username:state.user.username,
      avatar:state.user.avatar
    });

    if(!sent){
      state.view='game';
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
  if(room.status!=='open' && room.game!=='music') return toast('Essa partida já está em andamento.');
  if(room.password && room.password!==password) return toast('Senha incorreta.');

  if(!room.players.some(p=>p.id===state.user.id)){
    if(room.players.length>=roomCapacity(room)) return toast('A sala está cheia.');
    room.players.push({username:state.user.username,id:state.user.id,avatar:state.user.avatar});
    updateStoredRoom(room);
  }else{
    saveActiveRoom(room);
  }

  state.selectedGame=room.game;
  closeModal();
  playUiSound(520);

  if(room.game==='music'){
    state.view='music';
    return openMusicRoom();
  }

  state.view='waiting';
  renderWaitingRoom();
}
function joinByCode(){
  const code=document.getElementById('joinCode').value.trim().toUpperCase();
  const pass=document.getElementById('joinPassword').value;
  if(!code) return toast('Digite o código da sala.');

  const room=getRoomByCode(code);
  if(!room) return toast('Sala não encontrada.');
  state.selectedGame=room.game;

  if(Core.mode==='online' && window.TDBOnline?.connected){
    state.view='joining';
    const sent=window.TDBOnline.joinRoom(code,pass,{
      id:state.user.id,
      username:state.user.username,
      avatar:state.user.avatar
    });
    if(!sent){
      state.view='game';
      return toast('Conexão online indisponível. Tente novamente.');
    }
    return;
  }

  joinRoom(code,pass);
}


function launchChessBot(){
  try{
    if(!state.activeRoom || state.activeRoom.game!=='chess'){
      return toast('Entre em uma sala de Xadrez primeiro.');
    }
    if(typeof window.startChessWithBot!=='function'){
      console.error('[TDB JOGOS] Módulo do Xadrez não carregado.');
      return toast('O módulo do Xadrez não carregou. Recarregue a página.');
    }
    window.startChessWithBot();
  }catch(err){
    console.error('[TDB JOGOS] Erro ao iniciar partida com bot:',err);
    toast('Não foi possível iniciar a partida com o bot.');
  }
}
window.launchChessBot=launchChessBot;

function renderWaitingRoom(){
  if(!state.activeRoom) return renderLobby();
  state.view='waiting';

  if(Core.mode==='online' && window.TDBOnline?.connected && ['truco','chess'].includes(state.activeRoom.game)){
    OnlineGameBridge.start(state.activeRoom,'player');
  }

  const room=state.activeRoom;
  const g=games[room.game];
  const isHost=room.ownerId===state.user.id;
  const cap=roomCapacity(room);

  const meta=
    room.game==='truco' ? ` • ${cap===2?'1x1':'2x2'}` :
    room.game==='chess' ? ` • 1x1 • ${room.chessClock?Math.floor(room.chessClock/60)+' min':'Sem relógio'}` :
    room.game==='music' ? ` • fila compartilhada` : '';

  let hostActions='';
  if(room.game==='truco'){
    hostActions=`<button class="btn btn-secondary" onclick="startTrucoWithBots()">Testar com ${cap===2?'1 bot':'3 bots'}</button>
      <button class="btn btn-primary" onclick="startGame()">Iniciar partida</button>`;
  }else if(room.game==='chess'){
    hostActions=`<button class="btn btn-secondary" onclick="launchChessBot()">Testar com bot</button>
      <button class="btn btn-primary" onclick="startGame()">Iniciar partida</button>`;
  }else if(room.game==='music'){
    hostActions=`<button class="btn btn-primary" onclick="openMusicRoom()">Abrir TDB Music</button>`;
  }else{
    hostActions=`<button class="btn btn-primary" onclick="startGame()">Iniciar partida</button>`;
  }

  const nonHostAction=room.game==='music'
    ? `<button class="btn btn-primary" onclick="openMusicRoom()">Entrar no player</button>`
    : `<span class="muted">Aguardando o host iniciar.</span>`;

  app.innerHTML=`${topbar()}
  <section class="waiting-room fade-in"><div class="waiting-card">
    <div class="waiting-hero"><div class="game-head"><div class="big-symbol">${g.symbol}</div><div>
      <h1>${escapeHtml(room.name)}</h1>
      <p>${g.name}${meta} • ${room.privacy==='private'?'Sala privada':'Sala pública'} • Host: ${escapeHtml(room.owner)}</p>
      <div class="code-box">Código: <strong>${room.code}</strong><button class="link-btn" onclick="copyCode('${room.code}')">Copiar</button></div>
    </div></div></div>

    <div class="room-tools">
      <button class="btn btn-secondary" onclick="renderFriends()">Convidar amigos</button>
      <button class="btn btn-dark" onclick="toggleFullscreen()">Tela cheia</button>
    </div>

    <div class="player-list">
      ${(room.players||[]).map(p=>playerSlot(p,isHost)).join('')}
      ${Array.from({length:Math.max(0,Math.min(cap,6)-(room.players?.length||0))}).map(()=>`<div class="player-slot empty">Aguardando jogador...</div>`).join('')}
      ${cap>6?`<div class="player-slot empty">Capacidade da sala: ${cap}</div>`:''}
    </div>

    <div class="waiting-actions">
      <button class="btn btn-dark" onclick="leaveRoom()">Sair da sala</button>
      ${isHost?hostActions:nonHostAction}
    </div>
  </div></section>`;
}
function playerSlot(p,isHost){
  const canKick=isHost && p.id!==state.user.id;
  return `<div class="player-slot"><div class="avatar">${escapeHtml(p.avatar||initials(p.username))}</div><div class="slot-main"><strong>${escapeHtml(p.username)} ${p.id===state.activeRoom.ownerId?'<span class="host-tag">HOST</span>':''}</strong><div class="muted small">${escapeHtml(p.id||'Jogador')}</div></div>${canKick?`<button class="btn btn-danger btn-sm" onclick="kickPlayer('${p.id}')">Expulsar</button>`:''}</div>`;
}
function kickPlayer(id){
  let room=state.activeRoom;
  room.players=room.players.filter(p=>p.id!==id);
  updateStoredRoom(room); toast('Jogador removido da sala.'); renderWaitingRoom();
}
function leaveRoom(){
  try{
    exitActiveContext('leave-room');
    setPresence('lobby');
    renderLobby();
  }catch(err){
    console.error('[TDB JOGOS] Falha ao sair da sala:',err);
    saveActiveRoom(null);
    renderLobby();
  }
}

function openMusicRoom(){
  const room=state.activeRoom;
  state.view='music';
  if(!room || room.game!=='music') return toast('Entre em uma sala TDB Music primeiro.');
  room.status='playing';
  updateStoredRoom(room);
  setPresence('listening',{roomCode:room.code,game:'music'});
  if(typeof window.startMusicRoom!=='function') return toast('Módulo TDB Music não carregou.');
  window.startMusicRoom(room);
}
window.openMusicRoom=openMusicRoom;

function startGame(){
  let room=state.activeRoom, g=games[room.game];
  if(room.game==='truco'){
    const cap=roomCapacity(room);
    if((room.players?.length||0)<cap) return toast(`Truco precisa de ${cap} jogador${cap>1?'es':''}. Use “Testar com bots” nesta versão local.`);
    room.status='playing'; updateStoredRoom(room); upsertMatch({matchId:`TRUCO-${Date.now()}`,roomCode:room.code,game:'truco',status:'playing',players:structuredClone(room.players),createdAt:Date.now()}); setPresence('playing',{roomCode:room.code,game:'truco'}); playUiSound(700,.09); return startTrucoGame(room,false);
  }
  if(room.game==='chess'){
    if((room.players?.length||0)<2) return toast('Xadrez precisa de 2 jogadores. Use “Testar com bot” nesta versão local.');
    room.status='playing'; updateStoredRoom(room); upsertMatch({matchId:`CHESS-${Date.now()}`,roomCode:room.code,game:'chess',status:'playing',players:structuredClone(room.players),createdAt:Date.now()}); setPresence('playing',{roomCode:room.code,game:'chess'}); playUiSound(700,.09); return window.startChessGame?.(room,false);
  }
  if(room.game==='music') return openMusicRoom();
  if((room.players?.length||0)<g.minPlayers) return toast(`Aguarde pelo menos ${g.minPlayers} jogador${g.minPlayers>1?'es':''}.`);
  room.status='playing'; updateStoredRoom(room); playUiSound(700,.09);
  toast(`Partida de ${g.name} iniciada. Motor do jogo entra na próxima etapa.`);
  renderWaitingRoom();
}
function copyCode(code){
  if(navigator.clipboard) navigator.clipboard.writeText(code).then(()=>toast('Código copiado.'));
  else toast(`Código: ${code}`);
}
function toggleFullscreen(){
  if(!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

function renderFriends(){
  if(!state.user) return renderAuth('login');
  app.innerHTML=`${topbar('friends')}<section class="dashboard fade-in">
    <div class="page-head"><div><h1 class="page-title">Amigos</h1><p class="muted">Adicione pelo ID público e convide para suas salas.</p></div></div>
    <div class="two-col">
      <div class="panel"><div class="panel-header"><h2>Seus amigos</h2><span class="muted">${state.friends.length}</span></div><div class="panel-body"><div class="friend-list">${state.friends.map(friendCard).join('')}</div></div></div>
      <div class="panel"><div class="panel-header"><h2>Adicionar por ID</h2></div><div class="panel-body">
        <div class="field"><label>ID do jogador</label><input id="friendId" placeholder="TBD-7X4K92" style="text-transform:uppercase"></div>
        <button class="btn btn-primary full" style="margin-top:12px" onclick="addFriendById()">Adicionar amigo</button>
        <div class="mini-note">Nesta v0.2 local, contas criadas neste mesmo navegador podem ser encontradas por ID. O multiplayer real virá com o backend.</div>
      </div></div>
    </div>
  </section>`;
}
function addFriendById(){
  const id=document.getElementById('friendId').value.trim().toUpperCase();
  if(id===state.user.id) return toast('Esse é o seu próprio ID.');
  if(state.friends.some(f=>f.id===id)) return toast('Esse jogador já está nos seus amigos.');
  const u=state.users.find(u=>u.id===id);
  if(!u) return toast('ID não encontrado entre as contas locais.');
  state.friends.push({id:u.id,username:u.username,avatar:u.avatar,status:u.status||'Offline'});
  saveFriends(); toast(`${u.username} foi adicionado.`); renderFriends();
}

function renderProfile(){
  app.innerHTML=`${topbar('profile')}<section class="dashboard fade-in">
    <div class="page-head"><div><h1 class="page-title">Seu perfil</h1><p class="muted">Seu ID é permanente para esta conta.</p></div></div>
    <div class="profile-grid">
      <div class="panel profile-card"><div class="profile-avatar-xl">${escapeHtml(state.user.avatar||initials(state.user.username))}</div><h2>${escapeHtml(state.user.username)}</h2><div class="code-box">${escapeHtml(state.user.id)} <button class="link-btn" onclick="copyCode('${state.user.id}')">Copiar</button></div><p class="muted">${currentStatus()}</p></div>
      <div class="panel"><div class="panel-header"><h2>Editar perfil</h2></div><div class="panel-body"><div class="form-grid">
        <div class="field"><label>Nome de usuário</label><input id="editUsername" maxlength="24" value="${escapeHtml(state.user.username)}"></div>
        <div class="field"><label>Avatar curto (até 2 caracteres/emoji)</label><input id="editAvatar" maxlength="2" value="${escapeHtml(state.user.avatar||initials(state.user.username))}"></div>
        <button class="btn btn-primary" onclick="saveProfile()">Salvar alterações</button>
      </div></div></div>
    </div>
  </section>`;
}
function saveProfile(){
  const username=document.getElementById('editUsername').value.trim();
  const avatar=document.getElementById('editAvatar').value.trim()||initials(username);
  if(username.length<3) return toast('Use pelo menos 3 caracteres.');
  if(state.users.some(u=>u.id!==state.user.id&&(u.username||'').toLowerCase()===username.toLowerCase())) return toast('Esse nome já está em uso.');
  const idx=state.users.findIndex(u=>u.id===state.user.id);
  state.user.username=username; state.user.avatar=avatar;
  if(idx>=0) state.users[idx]={...state.users[idx],username,avatar};
  saveUsers(); saveSession(state.user);
  toast('Perfil atualizado.'); renderProfile();
}

function renderSettings(){
  app.innerHTML=`${topbar('settings')}<section class="dashboard fade-in">
    <div class="page-head"><div><h1 class="page-title">Configurações</h1><p class="muted">Ajustes básicos do TDB JOGOS.</p></div></div>
    <div class="settings-stack">
      ${settingRow('Sons da interface','Cliques e sons leves ao entrar em uma sala.','sound',state.settings.sound)}
      ${settingRow('Avisos de amigos','Preparado para avisar quando amigos ficarem online.','friendNotifications',state.settings.friendNotifications)}
      <div class="panel setting-row"><div><h3>Tela cheia</h3><p>Use o navegador em modo imersivo.</p></div><button class="btn btn-secondary" onclick="toggleFullscreen()">Alternar tela cheia</button></div>
    </div>
  </section>`;
}
function settingRow(title,desc,key,value){
  return `<div class="panel setting-row"><div><h3>${title}</h3><p>${desc}</p></div><label class="switch"><input type="checkbox" ${value?'checked':''} onchange="toggleSetting('${key}',this.checked)"><span class="slider"></span></label></div>`;
}
function toggleSetting(key,val){ state.settings[key]=val; saveSettings(); if(key==='sound'&&val) playUiSound(); toast('Configuração salva.'); }

function logout(){
  try{
    exitActiveContext('logout');
    if(state.user?.id) Core.presence.set(state.user.id,'offline');
    if(Core.mode==='online' && window.TDBAuthOnline) window.TDBAuthOnline.logout();
    Core.auth.setCurrentUser(null);
    state.user=null;
    saveActiveRoom(null);
    renderAuth('login');
  }catch(err){
    console.error('[TDB JOGOS] Falha no logout:',err);
    if(Core.mode==='online' && window.TDBAuthOnline) window.TDBAuthOnline.logout();
    Core.auth.setCurrentUser(null);
    state.user=null;
    saveActiveRoom(null);
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
window.saveProfile=saveProfile;
window.renderSettings=renderSettings;
window.toggleSetting=toggleSetting;
window.inviteFriend=inviteFriend;
window.logout=logout;
window.toast=toast;

if(state.user){
  if(state.activeRoom && state.activeRoom.players?.some(p=>p.id===state.user.id)) renderWaitingRoom();
  else renderLobby();
}else renderAuth('login');


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



function playDealSound(step=0){
  if(!state.settings.sound) return;
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();
    osc.type='triangle';
    osc.frequency.value=190 + (step%4)*12;
    gain.gain.setValueAtTime(.018,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime+.045);
  }catch{}
}
function playCardSound(){
  if(!state.settings.sound) return;
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type='triangle'; osc.frequency.value=150;
    gain.gain.setValueAtTime(.035,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.07);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime+.07);
  }catch{}
}
function playTrucoSound(){
  if(!state.settings.sound) return;
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    [260,390].forEach((f,i)=>{
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.type='square'; osc.frequency.value=f;
      gain.gain.setValueAtTime(.025,ctx.currentTime+i*.045);
      gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.18+i*.045);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime+i*.045); osc.stop(ctx.currentTime+.18+i*.045);
    });
  }catch{}
}
function startTrucoWithBots(){
  if(!state.activeRoom || state.activeRoom.game!=='truco') return;
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
  truco=structuredClone(serverState);
  truco.onlineMode=true;
  truco.spectatorMode=role==='spectator';
  truco.selectedCard=previousSelected;
  truco.room=state.activeRoom||{};
  truco.roundWinners=truco.trickResults||[];
  truco.handOfEleven=truco.eleven?{team:truco.eleven.team,pending:truco.eleven.pending}:null;
  truco.ironRevealed=false;
  truco.discardCount=0;
  truco.timerLeft=0;
  truco.raiseLevel=truco.handValue;
  truco.starter=truco.activeSeats?.[0]??0;

  // Server state already represents fully dealt hands; no fake deal animation.
  truco.revealCounts=truco.revealCounts||{};
  for(const seat of truco.activeSeats||[]){
    truco.revealCounts[seat]=(truco.hands?.[seat]||[]).length;
  }

  // Server uses bySeat; local UI historically used byPlayer.
  if(truco.pendingRaise && truco.pendingRaise.bySeat!==undefined){
    truco.pendingRaise.byPlayer=truco.pendingRaise.bySeat;
    truco.pendingRaise.votes=truco.pendingRaise.responses||{};
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
  truco.handValue=1;
  truco.raiseLevel=1;
  truco.pendingRaise=null;
  truco.raiseVotes=null;
  truco.selectedCard=null;
  truco.discardCount=0;
  truco.ironHand = truco.scores[0]===11 && truco.scores[1]===11;
  truco.ironRevealed=false;

  const elevenTeam = truco.scores[0]===11 ? 0 : truco.scores[1]===11 ? 1 : null;
  truco.handOfEleven = elevenTeam!==null && !truco.ironHand ? {team:elevenTeam,decision:null} : null;

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
          <div class="score-title">TDB JOGOS • TRUCO PAULISTA</div><div class="connection-ready">Core preparado para sincronização online</div>
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
        <div id="trucoRoundFlash"></div>
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

  if(seat===localTrucoSeat()) return;

  const wanted=Math.min(
    (truco.hands[seat]||[]).length,
    truco.revealCounts[seat]||0
  );

  let hand=root.querySelector('.side-hand,.enemy-hand');
  if(!hand){
    hand=document.createElement('div');
    hand.className=(pos==='left'||pos==='right')?'side-hand':'enemy-hand';
    root.appendChild(hand);
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

    if(!el){
      el=document.createElement('div');
      el.className=`play-card p${tc.player} card-enter`;
      el.dataset.player=key;
      el.innerHTML=renderCard(tc.card,tc.hidden,false);
      zone.appendChild(el);
    }else{
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

  const currentPlayer=playerBySeat(truco.current);
  text('trucoTurnName',truco.winner!==null ? 'Partida encerrada' : `Vez de ${currentPlayer?.username||'Jogador'}`);
  text('trucoTurnSub',room.turnTimer?`Tempo: ${room.turnTimer}s por jogada`:'Sem limite de tempo');
  set('trucoTimerSlot',room.turnTimer && truco.phase==='playing'
      ? `<div class="timer-ring" style="margin-left:auto;margin-top:8px">${truco.timerLeft||room.turnTimer}</div>` : '');

  updateSeatStable(2,'top');
  if(truco.activeSeats.includes(1)) updateSeatStable(1,'left');
  else set('seat1','');
  if(truco.activeSeats.includes(3)) updateSeatStable(3,'right');
  else set('seat3','');
  updateSeatStable(0,'bottom');

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
  set('trucoDiscard','');
  set('trucoDealAnim',truco.phase==='dealing' ? renderDealAnimation() : '');

  syncMyHandStable();
  set('trucoOverlay',renderOverlay());
  set('trucoActions',renderTrucoActions());
  set('trucoLog',truco.logs.map(l=>`<div>• ${escapeHtml(l)}</div>`).join(''));
  if(truco.phase==='raise-response' && truco.pendingRaise?.targetTeam===localTrucoTeam()) maybeAutoFriendlyVote();
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
  return [0,1,2].map(i=>{
    const w=truco.roundWinners[i];
    return `<i class="round-dot ${w===0?'us':w===1?'them':w==='tie'?'tie':''}"></i>`;
  }).join('');
}
function renderSeat(idx,pos){
  const p=truco.players.find(x=>x.seat===idx);
  if(!p) return '';
  const current=truco.current===idx && truco.phase==='playing';
  const cards=(truco.hands[idx]||[]).slice(0,truco.revealCounts[idx]||0);
  let hand='';
  if(idx!==0){
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
    return `<div class="game-message"><h2>${truco.winner===localTrucoTeam()?'VITÓRIA':'DERROTA'}</h2><p>${truco.winner===localTrucoTeam()?'Sua dupla chegou aos 12 pontos.':'A dupla adversária chegou aos 12 pontos.'}</p><div class="choices"><button class="btn btn-primary" onclick="restartTrucoMatch()">Jogar novamente</button><button class="btn btn-dark" onclick="renderWaitingRoom()">Voltar à sala</button></div></div>`;
  }
  if(truco.phase==='eleven-decision'){
    const t=truco.handOfEleven.team;
    if(t===0){
      const partner=truco.players.find(p=>p.team===localTrucoTeam() && p.seat!==localTrucoSeat());
      const partnerCards=partner ? `<div style="display:flex;gap:8px;justify-content:center;margin:12px 0">${truco.hands[partner.seat].map(c=>renderCard(c,false,false)).join('')}</div>` : '';
      return `<div class="game-message"><h2>MÃO DE 11</h2><p>${truco.mode==='2v2'?'Sua dupla está com 11. A primeira decisão da dupla vale para os dois.':'Você está com 11. Escolha se quer jogar esta mão.'}</p>
        ${partnerCards}
        <div class="choices"><button class="btn btn-primary" onclick="decideEleven(true)">JOGAR • vale 3</button><button class="btn btn-danger" onclick="decideEleven(false)">CORRER</button></div></div>`;
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
      return `<div class="game-message truco-call"><h2>${teamTitle}</h2><p>${escapeHtml((truco.players.find(p=>p.seat===pr.byPlayer)||{username:'Jogador'}).username)} aumentou a mão. O pedido só entra se a dupla concordar. Se um correr, a dupla corre.</p>
      <div class="raise-status">${rows}</div>
      <div class="choices">
        <button class="btn btn-primary" onclick="respondRaise('accept')">ACEITAR</button>
        <button class="btn btn-danger" onclick="respondRaise('run')">CORRER</button>
        ${next?`<button class="btn btn-secondary" onclick="respondRaise('raise')">PEDIR ${next}</button>`:''}
      </div></div>`;
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
    ${myTurn?`<div class="player-prompt">SUA VEZ • escolha uma carta</div>`:''}
    <button class="btn btn-primary action-main" ${myTurn&&truco.selectedCard!==null?'':'disabled'} onclick="playSelected(false)">Jogar carta</button>
    <button class="btn btn-secondary action-main" title="${truco.round===0?'Disponível a partir da segunda rodada':'Jogar a carta virada para baixo'}" ${canHide&&truco.selectedCard!==null?'':'disabled'} onclick="playSelected(true)">Esconder</button>
    ${nextRaise?`<button class="btn btn-secondary action-main" ${canTruco?'':'disabled'} onclick="requestRaise()">${nextRaise===3?'TRUCO':nextRaise}</button>`:''}
    <button class="btn btn-dark" onclick="renderWaitingRoom()">Sair da mesa</button>
  </div>`;
}

function selectTrucoCard(idx){
  if(truco.phase!=='playing' || truco.current!==0) return;
  truco.selectedCard=idx;
  renderTruco();
}
function playSelected(hidden=false){
  const seat=localTrucoSeat();
  if(!isLocalTrucoPlayer() || truco.current!==seat || truco.selectedCard===null || truco.phase!=='playing') return;
  trucoDispatch('PLAY_CARD',{playerIdx:seat,cardIdx:truco.selectedCard,hidden});
}
function applyPlayCard({playerIdx,cardIdx,hidden=false}){
  clearInterval(trucoTimerInterval);
  const card=truco.hands[playerIdx].splice(cardIdx,1)[0];
  truco.trickCards.push({player:playerIdx,card,hidden});
  truco.selectedCard=null;
  const actingPlayer=playerBySeat(playerIdx);
  logTruco(`${actingPlayer?.username||'Jogador'} ${hidden?'jogou uma carta escondida':`jogou ${cardText(card)}`}.`);
  playCardSound();
  if(truco.trickCards.length===truco.activeSeats.length){
    truco.phase='resolving';
    renderTruco();
    setTimeout(resolveTrick,650);
  } else {
    truco.current=nextActiveSeat(playerIdx);
    renderTruco();
    maybeBotTurn();
  }
}

function resolveTrick(){
  const visible=truco.trickCards.filter(x=>!x.hidden);
  let winner='tie';
  if(visible.length){
    let best=visible[0], tied=false;
    for(let i=1;i<visible.length;i++){
      const cmp=compareCards(visible[i],best);
      if(cmp>0){ best=visible[i]; tied=false; }
      else if(cmp===0 && visible[i].card.rank===best.card.rank) tied=true;
    }
    winner=tied?'tie':(playerBySeat(best.player)?.team ?? 'tie');
  }
  truco.roundWinners.push(winner);
  logTruco(`Rodada ${truco.round+1}: ${winner==='tie'?'empate':winner===0?(truco.mode==='1v1'?'você':'nossa dupla'):(truco.mode==='1v1'?'adversário':'adversários')}.`);
  showRoundFlash(winner==='tie'?'EMPATE NA RODADA':winner===0?(truco.mode==='1v1'?'VOCÊ VENCEU A RODADA':'NOSSA DUPLA VENCEU A RODADA'):(truco.mode==='1v1'?'ADVERSÁRIO VENCEU A RODADA':'ELES VENCERAM A RODADA'));
  truco.discardCount += truco.activeSeats.length;
  const handWinner=evaluateHandWinner();
  if(handWinner!==null) return awardHand(handWinner);
  truco.round++;
  truco.trickCards=[];
  truco.starter = winner==='tie' ? truco.starter : firstPlayerOfWinningTeamFromLastTrick(winner);
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
    truco.scores[team]+=truco.handValue;
    logTruco(`${team===0?'Nossa dupla':'Adversários'} ganhou ${truco.handValue} ponto(s).`);
  }
  if(truco.scores[0]>=12 || truco.scores[1]>=12){
    truco.winner=truco.scores[0]>=12?0:1;
    truco.phase='finished';
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
  if(!pr || pr.targetTeam!==0) return;

  const partner=truco.players.find(
    p=>p.team===localTrucoTeam() && p.seat!==localTrucoSeat() && p.bot
  );

  if(!partner || pr.votes[partner.seat]!==null) return;

  const token=pr.token;

  setTimeout(()=>{
    forceBotRaiseResponse(partner,token);
  },480);
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
  const seconds=Number(truco.room.turnTimer||0);
  if(!seconds || truco.phase!=='playing' || truco.winner!==null) return;
  truco.timerLeft=seconds;
  trucoTimerInterval=setInterval(()=>{
    if(!truco || truco.phase!=='playing'){ clearInterval(trucoTimerInterval); return; }
    truco.timerLeft--;
    const ring=document.querySelector('.timer-ring');
    if(ring) ring.textContent=truco.timerLeft;
    if(truco.timerLeft<=0){
      clearInterval(trucoTimerInterval);
      autoPlayCurrent();
    }
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
function restartTrucoMatch(){
  truco.scores=[0,0];
  truco.winner=null;
  truco.dealerIndex=(truco.activeSeats?.length||1)-1;
  truco.dealer=truco.activeSeats?.[truco.dealerIndex] ?? 0;
  dealNewHand();
}

window.startTrucoWithBots=startTrucoWithBots;
window.startTrucoGame=startTrucoGame;
window.selectTrucoCard=selectTrucoCard;
window.playSelected=playSelected;
window.requestRaise=requestRaise;
window.respondRaise=respondRaise;
window.decideEleven=decideEleven;
window.restartTrucoMatch=restartTrucoMatch;

function renderTrucoSpectator(room){
  const t=window.truco||null;
  app.innerHTML=`${topbar()}<section class="spectator-placeholder">${logoTag()}<h1>Truco • Modo espectador</h1><p>${t?`Placar: ${t.scores?.[0]??0} x ${t.scores?.[1]??0}`:'Partida em andamento.'}</p><p>As cartas privadas dos jogadores permanecem ocultas para espectadores.</p><button class="btn btn-secondary" onclick="leaveRoom()">Sair da transmissão</button></section>`;
}
window.renderTrucoSpectator=renderTrucoSpectator;
