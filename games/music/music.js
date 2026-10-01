
(function(){
'use strict';

const API_KEY_STORAGE='tdb_youtube_api_key';
const STATE_PREFIX='tdb_music_state_';

let room=null;
let musicState=null;
let player=null;
let playerReady=false;
let applyingRemote=false;
let syncTimer=null;
let roomTimer=null;
let channel=null;

let lastPlayerError=null;
let lastRemoteSeekAt=0;

function isHttpEnvironment(){
  return location.protocol==='http:' || location.protocol==='https:';
}

function currentOrigin(){
  return isHttpEnvironment() ? location.origin : '';
}

function localFileWarning(){
  return !isHttpEnvironment();
}

function showPlayerEnvironmentWarning(){
  const box=document.getElementById('musicEnvironmentWarning');
  if(!box) return;
  box.style.display=localFileWarning()?'block':'none';
}

function playerErrorMessage(code){
  if(code===2) return 'Link ou ID de vídeo inválido.';
  if(code===5) return 'Este vídeo não pôde ser reproduzido no player HTML5.';
  if(code===100) return 'O vídeo foi removido ou está privado.';
  if(code===101 || code===150) return 'O proprietário deste vídeo não permite reprodução incorporada.';
  if(code===153) return 'O YouTube não recebeu a identificação do site (Referer/origin). Abra o TDB JOGOS pelo servidor local incluído, não pelo arquivo index.html.';
  return `Erro do player do YouTube (${code}).`;
}

function showPlayerError(code){
  lastPlayerError=code;
  const box=document.getElementById('musicPlayerError');
  if(!box) return;
  box.style.display='flex';
  const text=box.querySelector('[data-error-text]');
  if(text) text.textContent=playerErrorMessage(code);
}

function hidePlayerError(){
  lastPlayerError=null;
  const box=document.getElementById('musicPlayerError');
  if(box) box.style.display='none';
}

function keyForRoom(){ return `${STATE_PREFIX}${room.code}`; }
function sharedMusicKey(){ return `music:${room.code}`; }

function makeDefaultState(){
  return {
    roomCode:room.code,
    queue:[],
    currentIndex:-1,
    status:'paused',
    position:0,
    changedAt:Date.now(),
    updatedAt:Date.now(),
    updatedBy:state.user.id,
    controlsLocked:false,
    skipVotes:[],
    lastAction:null
  };
}

function readMusicState(){
  if(window.TDBCore?.mode==='online' && window.TDBCore.sharedState){
    return window.TDBCore.sharedState.get(sharedMusicKey(),makeDefaultState()) || makeDefaultState();
  }

  try{
    return JSON.parse(localStorage.getItem(keyForRoom())) || makeDefaultState();
  }catch{
    return makeDefaultState();
  }
}


function isOnlineMusic(){return window.TDBCore?.mode==='online'&&window.TDBOnline?.connected}
async function sendOnlineMusic(action){
  const next=await window.TDBOnline.musicAction(room.code,action);
  if(!next) return false;
  musicState=next;
  renderDynamic();
  syncPlayer();
  if(action.type==='ADD_TRACK') window.TDBSound?.play?.('musicAdd',{channel:'music-action'});
  if(action.type==='REMOVE') window.TDBSound?.play?.('musicRemove',{channel:'music-action'});
  return true;
}

function saveMusicState(next){
  musicState={...next,updatedAt:Date.now(),updatedBy:state.user.id};

  if(window.TDBCore?.mode==='online' && window.TDBCore.sharedState){
    window.TDBCore.sharedState.set(sharedMusicKey(),musicState);
  }else{
    localStorage.setItem(keyForRoom(),JSON.stringify(musicState));
    channel?.postMessage({type:'state',roomCode:room.code,state:musicState});
  }

  renderDynamic();
  syncPlayer();
}

function currentTrack(){
  return musicState?.queue?.[musicState.currentIndex]||null;
}

function canControl(){
  if(musicState?.controlsLocked && room.ownerId!==state.user.id) return false;
  return room.musicControl!=='host' || room.ownerId===state.user.id;
}
function canSkip(){
  return room.musicSkipMode!=='host' || room.ownerId===state.user.id;
}

function extractYouTubeId(value){
  const text=String(value||'').trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  try{
    const url=new URL(text);
    if(url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0]||null;
    if(url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2]||null;
    if(url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2]||null;
    return url.searchParams.get('v');
  }catch{
    return null;
  }
}

async function getMeta(videoId){
  const url=`https://www.youtube.com/watch?v=${videoId}`;
  const fallback={
    videoId,
    title:`YouTube • ${videoId}`,
    channel:'',
    thumbnail:`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url
  };

  try{
    const res=await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if(!res.ok) return fallback;
    const data=await res.json();
    return {
      ...fallback,
      title:data.title||fallback.title,
      channel:data.author_name||'',
      thumbnail:data.thumbnail_url||fallback.thumbnail
    };
  }catch{
    return fallback;
  }
}

async function addYoutubeLink(){
  const input=document.getElementById('musicLinkInput');
  const videoId=extractYouTubeId(input?.value);
  if(!videoId) return toast('Cole um link válido do YouTube.');

  const meta=await getMeta(videoId);
  if(isOnlineMusic()){
    const ok=await sendOnlineMusic({type:'ADD_TRACK',track:meta});
    if(ok&&input) input.value='';
    return;
  }
  const next=structuredClone(musicState);

  next.queue.push({
    id:`Q-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    ...meta,
    addedBy:state.user.username,
    addedById:state.user.id,
    addedAt:Date.now()
  });

  if(next.currentIndex<0){
    next.currentIndex=0;
    next.position=0;
    next.status='paused';
    next.changedAt=Date.now();
  }

  saveMusicState(next);
  if(input) input.value='';
  window.TDBSound?.play?.('musicAdd',{channel:'music-action'});
  toast('Adicionado à fila.');
}

function saveApiKey(){
  const value=document.getElementById('musicApiKey')?.value.trim()||'';
  if(value) localStorage.setItem(API_KEY_STORAGE,value);
  else localStorage.removeItem(API_KEY_STORAGE);
  toast(value?'Chave salva neste navegador.':'Chave removida.');
}

async function searchYoutube(){
  const query=document.getElementById('musicSearchInput')?.value.trim()||'';
  const apiKey=localStorage.getItem(API_KEY_STORAGE)||'';

  if(!query) return toast('Digite uma música ou artista.');
  if(!apiKey) return toast('Configure uma chave da YouTube Data API para pesquisar.');

  const box=document.getElementById('musicSearchResults');
  if(box) box.innerHTML='<div class="music-message">Pesquisando…</div>';

  try{
    const url=new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part','snippet');
    url.searchParams.set('type','video');
    url.searchParams.set('maxResults','8');
    url.searchParams.set('q',query);
    url.searchParams.set('key',apiKey);

    const res=await fetch(url);
    const data=await res.json();

    if(!res.ok) throw new Error(data?.error?.message||'Erro na busca do YouTube.');

    const items=(data.items||[]).map(x=>({
      videoId:x.id?.videoId,
      title:x.snippet?.title||'Vídeo',
      channel:x.snippet?.channelTitle||'',
      thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||''
    })).filter(x=>x.videoId);

    window.__TDB_MUSIC_RESULTS__=items;
    renderSearchResults(items);
  }catch(err){
    console.error('[TDB Music] pesquisa',err);
    if(box) box.innerHTML=`<div class="music-message error">${escapeHtml(err.message||'Falha na pesquisa.')}</div>`;
  }
}

function renderSearchResults(items){
  const box=document.getElementById('musicSearchResults');
  if(!box) return;

  if(!items.length){
    box.innerHTML='<div class="music-message">Nenhum resultado.</div>';
    return;
  }

  box.innerHTML=items.map((item,index)=>`
    <button class="music-search-result" onclick="addSearchResult(${index})">
      <img src="${escapeHtml(item.thumbnail)}" alt="">
      <span><strong>${escapeHtml(decodeEntities(item.title))}</strong><small>${escapeHtml(item.channel)}</small></span>
      <b>+ Adicionar</b>
    </button>`).join('');
}

function decodeEntities(text){
  const el=document.createElement('textarea');
  el.innerHTML=text||'';
  return el.value;
}

async function addSearchResult(index){
  const item=window.__TDB_MUSIC_RESULTS__?.[index];
  if(!item) return;
  if(isOnlineMusic()){
    return sendOnlineMusic({type:'ADD_TRACK',track:{
      videoId:item.videoId,
      title:decodeEntities(item.title),
      channel:item.channel,
      thumbnail:item.thumbnail,
      url:`https://www.youtube.com/watch?v=${item.videoId}`
    }});
  }

  const next=structuredClone(musicState);
  next.queue.push({
    id:`Q-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    videoId:item.videoId,
    title:decodeEntities(item.title),
    channel:item.channel,
    thumbnail:item.thumbnail,
    url:`https://www.youtube.com/watch?v=${item.videoId}`,
    addedBy:state.user.username,
    addedById:state.user.id,
    addedAt:Date.now()
  });

  if(next.currentIndex<0){
    next.currentIndex=0;
    next.position=0;
    next.status='paused';
    next.changedAt=Date.now();
  }

  saveMusicState(next);
  toast('Adicionado à fila.');
}

function expectedPosition(){
  const base=Number(musicState?.position||0);
  if(musicState?.status!=='playing') return base;
  return base + Math.max(0,(Date.now()-Number(musicState.changedAt||Date.now()))/1000);
}

function currentPlayerPosition(){
  try{
    if(playerReady) return Number(player.getCurrentTime?.()||0);
  }catch{}
  return expectedPosition();
}


function toggleMusicPlayback(){
  if(!musicState) return;
  if(musicState.status==='playing') pauseMusic();
  else playMusic();
}

async function playMusic(){
  if(isOnlineMusic()) return sendOnlineMusic({type:'PLAY',position:currentPlayerPosition()});
  if(!canControl()) return toast('Somente o host pode controlar o player.');
  if(!currentTrack()) return toast('Adicione uma música primeiro.');

  const next=structuredClone(musicState);
  next.position=currentPlayerPosition();
  next.status='playing';
  next.changedAt=Date.now();
  saveMusicState(next);

  // Direct command after a user click helps browsers allow playback.
  try{
    if(playerReady && player?.playVideo) player.playVideo();
  }catch(err){
    console.warn('[TDB Music] playVideo falhou',err);
  }
}

async function pauseMusic(){
  if(isOnlineMusic()){
    try{if(playerReady&&player?.pauseVideo)player.pauseVideo()}catch{}
    return sendOnlineMusic({type:'PAUSE',position:currentPlayerPosition()});
  }
  if(!canControl()) return toast('Somente o host pode controlar o player.');

  const next=structuredClone(musicState);
  next.position=currentPlayerPosition();
  next.status='paused';
  next.changedAt=Date.now();

  // Pause immediately before broadcasting the shared state.
  try{
    if(playerReady && player?.pauseVideo) player.pauseVideo();
  }catch(err){
    console.warn('[TDB Music] pauseVideo falhou',err);
  }

  saveMusicState(next);
}

async function nextMusic(){
  if(isOnlineMusic()) return sendOnlineMusic({type:'NEXT',position:currentPlayerPosition(),trackId:currentTrack()?.id||null});
  if(!canSkip()) return toast('Somente o host pode pular nesta sala.');
  if(!musicState.queue.length) return;

  const next=structuredClone(musicState);
  if(next.currentIndex+1>=next.queue.length){
    next.status='paused';
    next.position=0;
    next.changedAt=Date.now();
  }else{
    next.currentIndex++;
    next.position=0;
    next.status='playing';
    next.changedAt=Date.now();
  }
  saveMusicState(next);
}

async function previousMusic(){
  if(isOnlineMusic()) return sendOnlineMusic({type:'PREVIOUS',position:currentPlayerPosition()});
  if(!canSkip()) return toast('Somente o host pode voltar nesta sala.');
  const next=structuredClone(musicState);
  if(currentPlayerPosition()>5){
    next.position=0;
  }else if(next.currentIndex>0){
    next.currentIndex--;
    next.position=0;
  }else{
    next.position=0;
  }
  next.status='playing';
  next.changedAt=Date.now();
  saveMusicState(next);
}

async function jumpToMusic(index){
  if(isOnlineMusic()) return sendOnlineMusic({type:'JUMP',index});
  if(!canControl()) return toast('Somente o host pode escolher uma faixa diretamente.');
  if(index<0 || index>=musicState.queue.length) return;
  const next=structuredClone(musicState);
  next.currentIndex=index;
  next.position=0;
  next.status='playing';
  next.changedAt=Date.now();
  saveMusicState(next);
}

async function removeMusic(index){
  const item=musicState.queue[index];
  if(!item) return;
  if(isOnlineMusic()) return sendOnlineMusic({type:'REMOVE',itemId:item.id});
  if(room.ownerId!==state.user.id && item.addedById!==state.user.id){
    return toast('Só o host ou quem adicionou pode remover.');
  }

  const next=structuredClone(musicState);
  next.queue.splice(index,1);

  if(!next.queue.length){
    next.currentIndex=-1;
    next.position=0;
    next.status='paused';
  }else if(index<next.currentIndex){
    next.currentIndex--;
  }else if(index===next.currentIndex){
    next.currentIndex=Math.min(next.currentIndex,next.queue.length-1);
    next.position=0;
    next.status='paused';
  }

  next.changedAt=Date.now();
  saveMusicState(next);
  window.TDBSound?.play?.('musicRemove',{channel:'music-action'});
}


async function moveMusic(index,direction){
  const item=musicState.queue[index];
  if(!item) return;
  if(isOnlineMusic()) return sendOnlineMusic({type:'MOVE',itemId:item.id,direction});
  const next=structuredClone(musicState);
  const to=Math.max(0,Math.min(next.queue.length-1,index+direction));
  if(to===index) return;
  const [row]=next.queue.splice(index,1);
  next.queue.splice(to,0,row);
  saveMusicState(next);
}
async function toggleMusicLock(){
  if(room.ownerId!==state.user.id) return toast('Somente o host pode bloquear os controles.');
  if(isOnlineMusic()) return sendOnlineMusic({type:'TOGGLE_LOCK'});
  const next=structuredClone(musicState);
  next.controlsLocked=!next.controlsLocked;
  saveMusicState(next);
}

function loadYoutubeApi(){
  if(window.YT?.Player) return Promise.resolve();

  return new Promise(resolve=>{
    const prior=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{
      try{ prior?.(); }catch{}
      resolve();
    };

    if(!document.querySelector('script[data-tdb-yt]')){
      const script=document.createElement('script');
      script.src='https://www.youtube.com/iframe_api';
      script.async=true;
      script.dataset.tdbYt='1';
      document.head.appendChild(script);
    }
  });
}

async function createPlayer(){
  await loadYoutubeApi();
  const mount=document.getElementById('musicYoutubePlayer');
  if(!mount) return;

  const vars={
    playsinline:1,
    rel:0,
    enablejsapi:1
  };

  if(currentOrigin()){
    vars.origin=currentOrigin();
    vars.widget_referrer=location.href;
  }

  player=new YT.Player('musicYoutubePlayer',{
    width:'100%',
    height:'100%',
    videoId:currentTrack()?.videoId||'',
    host:'https://www.youtube.com',
    playerVars:vars,
    events:{
      onReady(){
        playerReady=true;
        hidePlayerError();
        showPlayerEnvironmentWarning();
        syncPlayer(true);
      },
      onStateChange(event){
        if(applyingRemote) return;
        if(event.data===YT.PlayerState.ENDED && canSkip()) nextMusic();
      },
      onError(event){
        console.error('[TDB Music] YouTube Player error:',event.data);
        showPlayerError(Number(event.data));
      },
      onAutoplayBlocked(){
        toast('O navegador bloqueou o autoplay. Clique em Tocar.');
      }
    }
  });
}

function syncPlayer(force=false){
  if(!playerReady || !player) return;
  const track=currentTrack();
  if(!track) return;

  const expected=Math.max(0,expectedPosition());

  applyingRemote=true;
  try{
    const loaded=player.getVideoData?.().video_id||'';

    if(force || loaded!==track.videoId){
      hidePlayerError();
      if(musicState.status==='playing'){
        player.loadVideoById({videoId:track.videoId,startSeconds:expected});
      }else{
        player.cueVideoById({videoId:track.videoId,startSeconds:expected});
      }
    }else{
      const actual=Number(player.getCurrentTime?.()||0);
      if(Math.abs(actual-expected)>3.5 && Date.now()-lastRemoteSeekAt>7000){player.seekTo(expected,true);lastRemoteSeekAt=Date.now();}

      const stateCode=player.getPlayerState?.();
      if(musicState.status==='playing'){
        if(stateCode!==YT.PlayerState.PLAYING && stateCode!==YT.PlayerState.BUFFERING) player.playVideo();
      }else if(stateCode===YT.PlayerState.PLAYING || stateCode===YT.PlayerState.BUFFERING){
        player.pauseVideo();
      }
    }
  }catch(err){
    console.warn('[TDB Music] sync',err);
  }finally{
    setTimeout(()=>{ applyingRemote=false; },80);
  }
}

function refreshRoomMembers(){
  const latest=Core.rooms.list().find(x=>x.code===room.code);
  if(latest){
    room=latest;
    state.activeRoom=latest;
  }

  const box=document.getElementById('musicMembers');
  if(!box) return;

  box.innerHTML=(room.players||[]).map(p=>`
    <div class="music-member">
      <div class="avatar">${escapeHtml(p.avatar||initials(p.username))}</div>
      <span><strong>${escapeHtml(p.username)}</strong><small>${p.id===room.ownerId?'HOST':'OUVINTE'}</small></span>
    </div>`).join('');
}

function renderDynamic(){
  const track=currentTrack();

  const title=document.getElementById('musicNowTitle');
  const meta=document.getElementById('musicNowMeta');
  const playButton=document.getElementById('musicPlayBtn');
  const queue=document.getElementById('musicQueue');
  const empty=document.getElementById('musicEmptyPlayer');

  if(title) title.textContent=track?.title||'Nenhuma música na fila';
  if(meta) meta.textContent=track?`${track.channel||'YouTube'} • adicionado por ${track.addedBy}`:'Cole um link ou use a pesquisa.';
  if(playButton) playButton.textContent=musicState.status==='playing'?'⏸ Pausar':'▶ Tocar';
  const actionBox=document.getElementById('musicLastAction');
  if(actionBox){
    const a=musicState.lastAction;
    const labels={play:'tocou',pause:'pausou',next:'pulou',previous:'voltou',add:'adicionou música',remove:'removeu música',reorder:'reorganizou a fila',lock:'bloqueou controles',unlock:'liberou controles','skip-vote':'votou para pular',jump:'escolheu uma música'};
    actionBox.textContent=a?`${a.by||'Alguém'} • ${labels[a.type]||a.type}${a.type==='skip-vote'&&a.needed?` (${a.votes}/${a.needed})`:''}`:'';
  }
  if(empty) empty.style.display=track?'none':'grid';

  if(queue){
    queue.innerHTML=musicState.queue.length?musicState.queue.map((item,index)=>`
      <div class="music-queue-item ${index===musicState.currentIndex?'active':''}">
        <button class="music-queue-main" onclick="jumpToMusic(${index})">
          <img src="${escapeHtml(item.thumbnail||`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`)}" alt="">
          <span><strong>${escapeHtml(item.title)}</strong><small>por ${escapeHtml(item.addedBy)}${index===musicState.currentIndex?' • TOCANDO AGORA':''}</small></span>
        </button>
        <div class="music-queue-actions">
          <button class="icon-btn" title="Subir" onclick="moveMusic(${index},-1)">↑</button>
          <button class="icon-btn" title="Descer" onclick="moveMusic(${index},1)">↓</button>
          <button class="icon-btn" title="Remover" onclick="removeMusic(${index})">×</button>
        </div>
      </div>`).join(''):'<div class="music-message">A fila está vazia.</div>';
  }

  const keyInput=document.getElementById('musicApiKey');
  if(keyInput && document.activeElement!==keyInput){
    keyInput.value=localStorage.getItem(API_KEY_STORAGE)||'';
  }

  refreshRoomMembers();
}

function leaveMusicRoom(){
  window.__tdbMusicUnsubscribe?.();
  window.__tdbMusicUnsubscribe=null;
  clearInterval(syncTimer);
  clearInterval(roomTimer);
  channel?.close();
  channel=null;
  try{player?.destroy?.()}catch{}
  player=null;
  playerReady=false;
  leaveRoom();
}

function renderMusic(){
  app.innerHTML=`${topbar()}
  <section class="music-screen fade-in">
    <aside class="music-sidebar">
      <div class="music-brand">${logoTag()}<div><strong>TDB MUSIC</strong><span>SALA COMPARTILHADA</span></div></div>
      <div class="music-room-info">
        <h2>${escapeHtml(room.name)}</h2>
        <p>Código <strong>${escapeHtml(room.code)}</strong></p>
        <button class="btn btn-secondary full" onclick="copyCode('${room.code}')">Copiar código</button>
      </div>

      <h3>Pessoas na sala</h3>
      <div class="music-members" id="musicMembers"></div>

      <div class="music-permissions">
        <span>Controle</span><strong>${musicState.controlsLocked?'Bloqueado pelo host':room.musicControl==='host'?'Host':'Todos'}</strong>
        <span>Pular</span><strong>${room.musicSkipMode==='host'?'Host':room.musicSkipMode==='vote'?'Votação':'Todos'}</strong>
        <span>Fila/pessoa</span><strong>${Number(room.musicQueueLimit||5)===0?'∞':Number(room.musicQueueLimit||5)}</strong>
        ${room.ownerId===state.user.id?`<button class="btn btn-dark full" onclick="toggleMusicLock()">${musicState.controlsLocked?'🔒 Liberar controles':'🔓 Bloquear controles'}</button>`:''}
      </div>

      <button class="btn btn-dark full" onclick="leaveMusicRoom()">Sair da sala</button>
    </aside>

    <main class="music-main">
      <section class="music-player-card">
        <span class="eyebrow">TOCANDO AGORA</span>
        <h1 id="musicNowTitle"></h1>
        <p id="musicNowMeta"></p>
        <small id="musicLastAction" class="music-last-action"></small>

        <div id="musicEnvironmentWarning" class="music-env-warning">
          Você abriu o projeto como arquivo local. O YouTube pode retornar erro 153.
          Use <strong>INICIAR-TDB-JOGOS.bat</strong> e abra pelo endereço <strong>http://localhost:8080</strong>.
        </div>

        <div class="music-player-wrap">
          <div id="musicYoutubePlayer"></div>

          <div class="music-player-error" id="musicPlayerError">
            <strong>Não foi possível carregar este vídeo</strong>
            <span data-error-text></span>
            <small>Se aparecer erro 153, abra o projeto pelo servidor local incluído.</small>
          </div>

          <div class="music-empty-player" id="musicEmptyPlayer">
            <span>🎵</span><strong>Fila vazia</strong><small>Adicione um link do YouTube para começar.</small>
          </div>
        </div>

        <div class="music-controls">
          <button class="btn btn-dark" onclick="previousMusic()">⏮ Anterior</button>
          <button class="btn btn-primary" id="musicPlayBtn" onclick="toggleMusicPlayback()">▶ Tocar</button>
          <button class="btn btn-dark" onclick="nextMusic()">Próxima ⏭</button>
        </div>
      </section>

      <section class="music-queue-card">
        <div class="section-title"><div><h2>Fila</h2><p>As músicas entram na ordem em que forem adicionadas.</p></div></div>
        <div class="music-queue" id="musicQueue"></div>
      </section>
    </main>

    <aside class="music-add-panel">
      <section class="music-block">
        <span class="eyebrow">SEM CHAVE DE API</span>
        <h2>Adicionar por link</h2>
        <p>Funciona com link normal, youtu.be, Shorts e embed.</p>
        <div class="field"><label>Link do YouTube</label><input id="musicLinkInput" placeholder="https://youtube.com/watch?v=..."></div>
        <button class="btn btn-primary full" onclick="addYoutubeLink()">+ Adicionar à fila</button>
      </section>

      <section class="music-block">
        <span class="eyebrow">PESQUISA OPCIONAL</span>
        <h2>Pesquisar</h2>
        <p>Use sua própria chave da YouTube Data API. Se não configurar, o método por link continua funcionando normalmente.</p>

        <details class="music-api">
          <summary>Configurar API key</summary>
          <div class="field"><label>YouTube Data API key</label><input id="musicApiKey" type="password" placeholder="AIza..."></div>
          <button class="btn btn-dark full" onclick="saveMusicApiKey()">Salvar neste navegador</button>
          <small>Em produção, restrinja a chave ao seu domínio ou mova a pesquisa para o backend.</small>
        </details>

        <div class="music-search-row">
          <input id="musicSearchInput" placeholder="Ex.: Linkin Park Numb">
          <button class="btn btn-secondary" onclick="searchYoutube()">Pesquisar</button>
        </div>
        <div class="music-search-results" id="musicSearchResults"></div>
      </section>
    </aside>
  </section>`;

  renderDynamic();
  showPlayerEnvironmentWarning();
  createPlayer();

  clearInterval(syncTimer);
  syncTimer=setInterval(async()=>{
    if(window.TDBCore?.mode==='online'){
      const latest=await window.TDBOnline?.refreshShared?.(sharedMusicKey());
      if(latest && latest.updatedAt!==musicState.updatedAt){
        musicState=latest;
        renderDynamic();
      }
      if(musicState.status==='playing') syncPlayer();
      return;
    }

    const latest=readMusicState();

    if(latest.updatedAt!==musicState.updatedAt){
      musicState=latest;
      renderDynamic();
      syncPlayer();
    }else if(musicState.status==='playing'){
      syncPlayer();
    }
  },1500);

  clearInterval(roomTimer);
  roomTimer=setInterval(refreshRoomMembers,1500);
}

function startMusicRoom(activeRoom){
  room=structuredClone(activeRoom);
  musicState=readMusicState();

  if(window.TDBCore?.mode==='online' && window.TDBCore.sharedState){
    window.TDBOnline?.refreshShared?.(sharedMusicKey()).then(value=>{
      if(!value) return;
      musicState=value;
      renderDynamic();
      syncPlayer();
    });
    window.__tdbMusicUnsubscribe?.();
    window.__tdbMusicUnsubscribe=window.TDBCore.sharedState.subscribe(sharedMusicKey(),value=>{
      if(!value) return;
      musicState=value;
      renderDynamic();
      syncPlayer();
    });
  }

  if(window.TDBCore?.mode!=='online' && 'BroadcastChannel' in window){
    channel?.close();
    channel=new BroadcastChannel(`tdb-music-${room.code}`);
    channel.onmessage=event=>{
      const data=event.data;
      if(data?.type==='state' && data.roomCode===room.code){
        musicState=data.state;
        renderDynamic();
        syncPlayer();
      }
    };
  }

  renderMusic();
}

window.startMusicRoom=startMusicRoom;
window.addYoutubeLink=addYoutubeLink;
window.saveMusicApiKey=saveApiKey;
window.searchYoutube=searchYoutube;
window.addSearchResult=addSearchResult;
window.playMusic=playMusic;
window.pauseMusic=pauseMusic;
window.toggleMusicPlayback=toggleMusicPlayback;
window.nextMusic=nextMusic;
window.previousMusic=previousMusic;
window.jumpToMusic=jumpToMusic;
window.removeMusic=removeMusic;
window.moveMusic=moveMusic;
window.toggleMusicLock=toggleMusicLock;
window.leaveMusicRoom=leaveMusicRoom;
})();
