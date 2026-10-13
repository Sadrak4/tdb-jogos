
(function(){
'use strict';

const API_KEY_STORAGE='tdb_youtube_api_key';
const STATE_PREFIX='tdb_music_state_';
const PROFILE_CACHE_PREFIX='tdb_music_profile_cache_';

let room=null;
let musicState=null;
let player=null;
let playerReady=false;
let applyingRemote=false;
let syncTimer=null;
let roomTimer=null;
let progressTimer=null;
let channel=null;
let musicProfileData={favorites:[],presets:[]};
let musicListView='queue';
let musicRenderCache={queue:'',history:'',favorites:'',presets:'',members:''};

let lastPlayerError=null;
let lastRemoteSeekAt=0;
let requestedVideoId='';
let lastVideoLoadAt=0;
let lastPlaybackRevision=-1;
let lastSyncCheckAt=0;
let musicToolView='add';
// Central de Atividades v7.2.5: altera somente o quadro de mesas.
// O player YouTube e o WebRTC não são desmontados ao criar/entrar em mesas.
let activityState=null;
let activityTimer=null;
let activityBusy=false;
const ACTIVITY_GAMES=Object.freeze({
  chess:{name:'Xadrez',icon:'♟',capacity:2},
  pool:{name:'Sinuca',icon:'🎱',capacity:2},
  truco:{name:'Truco',icon:'🃏',capacity:4}
});

const MUSIC_SYNC_POLL_MS=2500;
const MUSIC_DRIFT_SEEK_SECONDS=2.75;
const MUSIC_DRIFT_EMERGENCY_SECONDS=7;
const MUSIC_SEEK_COOLDOWN_MS=8500;
const MUSIC_LOAD_GUARD_MS=6500;

function musicNow(){
  try{return Number(window.TDBOnline?.serverNow?.()||Date.now())}catch{return Date.now()}
}

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
  if(code===153) return 'O YouTube não recebeu a identificação do site (Referer/origin). Abra o TDB pelo servidor local incluído, não pelo arquivo index.html.';
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
    changedAt:musicNow(),
    updatedAt:musicNow(),
    updatedBy:state.user.id,
    revision:0,
    playbackRevision:0,
    controlsLocked:false,
    skipVotes:[],
    history:[],
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
function onlineMusicDisconnected(){return window.TDBCore?.mode==='online'&&!window.TDBOnline?.connected}
function requireMusicConnection(){
  if(!onlineMusicDisconnected())return true;
  updatePersistentSyncBadge('offline','Reconectando ao servidor');
  toast('A conexão com a sala está sendo restabelecida. Tente novamente em alguns segundos.');
  return false;
}
async function sendOnlineMusic(action){
  const next=await window.TDBOnline.musicAction(room.code,action);
  if(!next) return false;
  applyRemoteMusicState(next,{sync:true});
  if(action.type==='ADD_TRACK') window.TDBSound?.play?.('musicAdd',{channel:'music-action'});
  if(action.type==='REMOVE') window.TDBSound?.play?.('musicRemove',{channel:'music-action'});
  return true;
}

function saveMusicState(next){
  if(window.TDBCore?.mode==='online'&&!window.TDBOnline?.connected){
    requireMusicConnection();
    return false;
  }
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

function musicStateFingerprint(value){
  if(!value)return'';
  return [
    value.updatedAt||0,
    value.changedAt||0,
    value.revision||0,
    value.playbackRevision||0,
    value.currentIndex??-1,
    value.status||'',
    (value.queue||[]).map(x=>x.id||x.videoId).join(','),
    (value.history||[]).map(x=>`${x.videoId}:${x.playedAt||0}`).join(',')
  ].join('|');
}
function applyRemoteMusicState(value,{sync=true,force=false}={}){
  if(!value)return false;
  if(!force&&musicStateFingerprint(value)===musicStateFingerprint(musicState))return false;
  musicState=value;
  renderDynamic();
  if(sync)syncPlayer();
  return true;
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
  if(!requireMusicConnection())return false;
  const input=document.getElementById('musicLinkInput');
  const button=document.getElementById('musicAddLinkBtn');
  const hint=document.getElementById('musicLinkHint');
  const raw=input?.value?.trim()||'';
  const videoId=extractYouTubeId(raw);
  if(!videoId){
    if(hint){hint.textContent='Cole um link válido do YouTube.';hint.classList.add('error')}
    input?.focus();
    return toast('Cole um link válido do YouTube.');
  }

  if(button){button.disabled=true;button.textContent='Adicionando…'}
  if(hint){hint.textContent='Buscando informações do vídeo…';hint.classList.remove('error')}
  try{
    const meta=await getMeta(videoId);
    if(isOnlineMusic()){
      const ok=await sendOnlineMusic({type:'ADD_TRACK',track:meta});
      if(ok&&input) input.value='';
      if(ok&&hint) hint.textContent='Música adicionada à fila.';
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
    if(hint) hint.textContent='Música adicionada à fila.';
    window.TDBSound?.play?.('musicAdd',{channel:'music-action'});
    toast('Adicionado à fila.');
  }finally{
    if(button){button.disabled=false;button.textContent='+ Adicionar à fila'}
  }
}

function bindMusicComposer(){
  const input=document.getElementById('musicLinkInput');
  if(!input)return;
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      addYoutubeLink();
    }
  });
  input.addEventListener('paste',()=>setTimeout(()=>{
    const hint=document.getElementById('musicLinkHint');
    const ok=!!extractYouTubeId(input.value);
    if(hint){
      hint.textContent=ok?'Link reconhecido. Pressione Enter ou clique em Adicionar.':'Cole um link do YouTube (youtube.com ou youtu.be).';
      hint.classList.toggle('error',!ok&&!!input.value.trim());
    }
  },0));
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
    console.error('[TDB Lobby] pesquisa',err);
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
  if(!requireMusicConnection())return false;
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
  const anchor=Number(musicState.changedAt||musicNow());
  return base + Math.max(0,(musicNow()-anchor)/1000);
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
  if(!requireMusicConnection())return false;
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
    console.warn('[TDB Lobby] playVideo falhou',err);
  }
}

async function pauseMusic(){
  if(!requireMusicConnection())return false;
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
    console.warn('[TDB Lobby] pauseVideo falhou',err);
  }

  saveMusicState(next);
}

async function nextMusic(){
  if(!requireMusicConnection())return false;
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
  if(!requireMusicConnection())return false;
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
  if(!requireMusicConnection())return false;
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
  if(!requireMusicConnection())return false;
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
  if(!requireMusicConnection())return false;
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
  if(!requireMusicConnection())return false;
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
        if(event.data===YT.PlayerState.ENDED){
          if(isOnlineMusic()){
            if(room?.ownerId===state.user.id){
              sendOnlineMusic({type:'ENDED',trackId:currentTrack()?.id||null});
            }
          }else if(canSkip()){
            nextMusic();
          }
        }
      },
      onError(event){
        console.error('[TDB Lobby] YouTube Player error:',event.data);
        showPlayerError(Number(event.data));
      },
      onAutoplayBlocked(){
        toast('O navegador bloqueou o autoplay. Clique em Tocar.');
      }
    }
  });
}


function formatMusicTime(sec){
  sec=Math.max(0,Math.floor(Number(sec||0)));
  const m=Math.floor(sec/60),s=sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function showMusicSyncState(text='',duration=1100){
  const badge=document.getElementById('musicSyncBadge');
  if(!badge)return;
  badge.textContent=text;
  badge.classList.toggle('visible',!!text);
  clearTimeout(window.__tdbMusicSyncBadgeTimer);
  if(text&&duration>0){
    window.__tdbMusicSyncBadgeTimer=setTimeout(()=>{
      const current=document.getElementById('musicSyncBadge');
      if(current){current.textContent='';current.classList.remove('visible')}
    },duration);
  }
}
function updateMusicProgressUI(){
  const track=currentTrack();
  const fill=document.getElementById('musicProgressFill');
  const current=document.getElementById('musicProgressCurrent');
  const durationEl=document.getElementById('musicProgressDuration');
  if(!fill||!current||!durationEl)return;

  let position=expectedPosition();
  let duration=0;
  try{
    if(playerReady){
      const live=Number(player.getCurrentTime?.()||0);
      if(Number.isFinite(live)&&live>=0)position=live;
      duration=Number(player.getDuration?.()||0);
    }
  }catch{}

  current.textContent=formatMusicTime(position);
  durationEl.textContent=duration>0?formatMusicTime(duration):'--:--';
  fill.style.width=duration>0?`${Math.max(0,Math.min(100,position/duration*100))}%`:'0%';
}
function musicVoteInfo(){
  if(room?.musicSkipMode!=='vote')return null;
  const votes=Array.isArray(musicState?.skipVotes)?musicState.skipVotes.length:0;
  const needed=Math.max(2,Math.floor((room?.players||[]).length/2)+1);
  return {votes,needed,percent:Math.max(0,Math.min(100,votes/needed*100))};
}

function updatePersistentSyncBadge(mode='ok',detail=''){
  const badge=document.getElementById('musicSyncHealth');
  if(!badge)return;
  const labels={ok:'Sincronizado',adjust:'Ajustando',loading:'Carregando',offline:'Reconectando'};
  badge.dataset.state=mode;
  badge.textContent=detail||labels[mode]||'Sincronizado';
}

function syncPlayer(force=false,reason='state'){
  if(!playerReady || !player) return;
  const track=currentTrack();
  if(!track){
    requestedVideoId='';
    updatePersistentSyncBadge('ok','Aguardando música');
    return;
  }

  const now=Date.now();
  const expected=Math.max(0,expectedPosition());
  const playbackRevision=Number(musicState?.playbackRevision||0);
  const revisionChanged=playbackRevision!==lastPlaybackRevision;
  lastPlaybackRevision=playbackRevision;
  applyingRemote=true;

  try{
    const loaded=player.getVideoData?.().video_id||'';
    if(loaded===track.videoId)requestedVideoId=track.videoId;

    const targetChanged=requestedVideoId!==track.videoId && loaded!==track.videoId;
    const loadGuardExpired=now-lastVideoLoadAt>MUSIC_LOAD_GUARD_MS;
    const shouldLoad=targetChanged;

    if(shouldLoad){
      hidePlayerError();
      requestedVideoId=track.videoId;
      lastVideoLoadAt=now;
      lastRemoteSeekAt=now;
      updatePersistentSyncBadge('loading','Carregando música');
      showMusicSyncState('Carregando faixa…',1200);
      if(musicState.status==='playing')player.loadVideoById({videoId:track.videoId,startSeconds:expected});
      else player.cueVideoById({videoId:track.videoId,startSeconds:expected});
      return;
    }

    // Enquanto o iframe ainda informa video_id vazio, não carregamos de novo.
    // Repetir loadVideoById durante BUFFERING era uma das causas de a música
    // voltar ao começo em alguns computadores.
    if(!loaded && requestedVideoId===track.videoId && now-lastVideoLoadAt<MUSIC_LOAD_GUARD_MS){
      updatePersistentSyncBadge('loading','Carregando música');
      return;
    }

    if(loaded && loaded!==track.videoId){
      if(loadGuardExpired){
        requestedVideoId='';
        syncPlayer(true,'track-mismatch');
      }
      return;
    }

    const actual=Number(player.getCurrentTime?.()||0);
    const stateCode=player.getPlayerState?.();
    const drift=Number.isFinite(actual)?actual-expected:0;
    const absDrift=Math.abs(drift);

    if(musicState.status==='playing'){
      if(stateCode!==YT.PlayerState.PLAYING && stateCode!==YT.PlayerState.BUFFERING){
        player.playVideo();
      }

      const recentCommand=Math.max(0,musicNow()-Number(musicState.changedAt||musicNow()))<5500;
      const seekAllowed=now-lastRemoteSeekAt>MUSIC_SEEK_COOLDOWN_MS;
      const meaningfulDrift=absDrift>MUSIC_DRIFT_SEEK_SECONDS;
      const emergencyDrift=absDrift>MUSIC_DRIFT_EMERGENCY_SECONDS;
      // Nunca fazemos um salto brusco de volta para ~0 por causa de um relógio
      // local atrasado. Uma volta real ao início vem de PREVIOUS/JUMP e chega
      // como revisão nova do servidor.
      const suspiciousRestart=expected<2.2 && actual>5 && !recentCommand && !revisionChanged;

      if(seekAllowed && meaningfulDrift && !suspiciousRestart && (revisionChanged || emergencyDrift || now-lastSyncCheckAt>9000)){
        showMusicSyncState('Sincronizando…',1000);
        updatePersistentSyncBadge('adjust',`Ajustando ${absDrift.toFixed(1)}s`);
        player.seekTo(expected,true);
        lastRemoteSeekAt=now;
      }else{
        updatePersistentSyncBadge('ok',absDrift<1.2?'Sincronizado':`Sincronizado • ${absDrift.toFixed(1)}s`);
      }
    }else{
      if(stateCode===YT.PlayerState.PLAYING || stateCode===YT.PlayerState.BUFFERING)player.pauseVideo();
      if((revisionChanged||force) && absDrift>1.25 && now-lastRemoteSeekAt>1200){
        player.seekTo(expected,true);
        lastRemoteSeekAt=now;
      }
      updatePersistentSyncBadge('ok','Pausado e sincronizado');
    }
    lastSyncCheckAt=now;
  }catch(err){
    console.warn('[TDB Lobby] sync',err);
    updatePersistentSyncBadge('offline','Reconectando');
  }finally{
    setTimeout(()=>{ applyingRemote=false; },120);
  }
}

function forceMusicResync(){
  if(!playerReady||!currentTrack())return toast('O player ainda não está pronto.');
  try{
    const loaded=player.getVideoData?.().video_id||'';
    const expected=Math.max(0,expectedPosition());
    if(loaded!==currentTrack().videoId){
      requestedVideoId='';
      syncPlayer(true,'manual');
    }else{
      player.seekTo(expected,true);
      if(musicState.status==='playing')player.playVideo();else player.pauseVideo();
      lastRemoteSeekAt=Date.now();
      updatePersistentSyncBadge('ok','Sincronizado agora');
      showMusicSyncState('Sincronizado agora',1200);
    }
  }catch(err){console.warn(err)}
}

function refreshRoomMembers(){
  const latest=Core.rooms.list().find(x=>x.code===room.code);
  if(latest){
    room=latest;
    state.activeRoom=latest;
  }

  const box=document.getElementById('musicMembers');
  if(!box) return;

  const key=musicSignature((room.players||[]).map(p=>[p.id,p.username,p.avatar,p.avatarImage,p.connection,room.ownerId===p.id]));
  if(musicRenderCache.members===key)return;
  musicRenderCache.members=key;
  box.innerHTML=(room.players||[]).map(p=>`
    <div class="music-member">
      ${typeof avatarHtml==='function'?avatarHtml(p,'avatar'):`<div class="avatar">${escapeHtml(p.avatar||initials(p.username))}</div>`}
      <span><strong>${escapeHtml(p.username)}</strong><small>${p.id===room.ownerId?'HOST':'OUVINTE'}</small></span>
    </div>`).join('');
}




function musicProfileCacheKey(){
  return `${PROFILE_CACHE_PREFIX}${state.user?.id||'guest'}`;
}
function readMusicProfileCache(){
  try{
    const value=JSON.parse(localStorage.getItem(musicProfileCacheKey())||'null');
    return value&&typeof value==='object'?value:{favorites:[],presets:[]};
  }catch{return{favorites:[],presets:[]}}
}
function writeMusicProfileCache(profile=musicProfileData){
  try{
    localStorage.setItem(musicProfileCacheKey(),JSON.stringify({
      favorites:Array.isArray(profile?.favorites)?profile.favorites:[],
      presets:Array.isArray(profile?.presets)?profile.presets:[]
    }));
  }catch{}
}

function canonicalMusicUrl(trackOrId){
  const videoId=typeof trackOrId==='string'?trackOrId:trackOrId?.videoId;
  return /^[A-Za-z0-9_-]{11}$/.test(String(videoId||''))
    ? `https://www.youtube.com/watch?v=${videoId}`
    : String(trackOrId?.url||'');
}

function musicSignature(value){
  try{return JSON.stringify(value)}catch{return String(Date.now())}
}
function favoriteIdSet(){
  return new Set((musicProfileData.favorites||[]).map(f=>f.videoId));
}
function renderQueueList(force=false){
  const box=document.getElementById('musicQueue');
  if(!box)return;
  const favs=favoriteIdSet();
  const key=musicSignature({
    currentIndex:musicState?.currentIndex??-1,
    favorites:[...favs].sort(),
    queue:(musicState?.queue||[]).map(i=>[i.id,i.videoId,i.title,i.addedBy,i.thumbnail])
  });
  if(!force&&musicRenderCache.queue===key)return;
  musicRenderCache.queue=key;
  const queue=musicState?.queue||[];
  box.innerHTML=queue.length?queue.map((item,index)=>`
    <div class="music-queue-item ${index===musicState.currentIndex?'active':''}" data-track-id="${escapeHtml(item.id||item.videoId)}">
      <span class="music-queue-number">${index===musicState.currentIndex?'▶':index+1}</span>
      <button class="music-queue-main" onclick="jumpToMusic(${index})">
        <img src="${escapeHtml(item.thumbnail||`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`)}" alt="">
        <span><strong>${escapeHtml(item.title)}</strong><small>por ${escapeHtml(item.addedBy)}${index===musicState.currentIndex?' • TOCANDO AGORA':''}</small></span>
      </button>
      <div class="music-queue-actions">
        <button class="icon-btn music-favorite-row ${favs.has(item.videoId)?'is-favorite':''}" title="${favs.has(item.videoId)?'Remover dos meus favoritos':'Salvar nos meus favoritos'}" onclick="toggleFavoriteTrack('${item.videoId}')">${favs.has(item.videoId)?'★':'☆'}</button>
        <button class="icon-btn" title="Subir" onclick="moveMusic(${index},-1)">↑</button>
        <button class="icon-btn" title="Descer" onclick="moveMusic(${index},1)">↓</button>
        <button class="icon-btn" title="Remover" onclick="removeMusic(${index})">×</button>
      </div>
    </div>`).join(''):'<div class="music-message">A fila está vazia.</div>';
}
function renderHistoryList(force=false){
  const box=document.getElementById('musicHistory');
  if(!box)return;
  const favs=favoriteIdSet();
  const history=(musicState?.history||[]).slice(0,10);
  const key=musicSignature({favorites:[...favs].sort(),history:history.map(t=>[t.videoId,t.title,t.playedAt,t.thumbnail])});
  if(!force&&musicRenderCache.history===key)return;
  musicRenderCache.history=key;
  box.innerHTML=history.length?history.map(t=>`
    <div class="music-mini-track">
      <img src="${escapeHtml(t.thumbnail||`https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`)}">
      <span><strong>${escapeHtml(t.title||'YouTube')}</strong><small>${new Date(t.playedAt||Date.now()).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></span>
      <div class="music-mini-actions">
        <button class="icon-btn ${favs.has(t.videoId)?'is-favorite':''}" title="${favs.has(t.videoId)?'Remover dos favoritos':'Favoritar na minha conta'}" onclick="toggleFavoriteTrack('${t.videoId}')">${favs.has(t.videoId)?'★':'☆'}</button>
        <button class="icon-btn" title="Adicionar novamente" onclick="addTrackFromHistory('${t.videoId}')">+</button>
      </div>
    </div>`).join(''):'<div class="music-message">O histórico aparecerá aqui quando uma música terminar, for pulada ou quando você trocar de faixa.</div>';
}
function renderFavoriteList(force=false){
  const box=document.getElementById('musicFavorites');
  if(!box)return;
  const favorites=musicProfileData.favorites||[];
  const key=musicSignature(favorites.map(t=>[t.videoId,t.title,t.savedAt,t.url]));
  if(!force&&musicRenderCache.favorites===key)return;
  musicRenderCache.favorites=key;
  box.innerHTML=favorites.length?favorites.map(t=>`
    <div class="music-mini-track">
      <img src="${escapeHtml(t.thumbnail||`https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`)}">
      <span><strong>${escapeHtml(t.title||'YouTube')}</strong><small>${escapeHtml(t.channel||'YouTube')} • salvo na sua conta</small></span>
      <div class="music-mini-actions">
        <button class="icon-btn" title="Adicionar à fila" onclick="addFavoriteToQueue('${t.videoId}')">+</button>
        <button class="icon-btn is-favorite" title="Remover dos favoritos" onclick="toggleFavoriteTrack('${t.videoId}')">★</button>
      </div>
    </div>`).join(''):'<div class="music-message">Você ainda não favoritou músicas.</div>';
}
function renderPresetList(force=false){
  const box=document.getElementById('musicPresets');
  if(!box)return;
  const presets=musicProfileData.presets||[];
  const key=musicSignature(presets.map(pl=>[pl.id,pl.name,pl.tracks?.length||0]));
  if(!force&&musicRenderCache.presets===key)return;
  musicRenderCache.presets=key;
  box.innerHTML=presets.length?presets.map(pl=>`<div class="music-preset-row"><span><strong>${escapeHtml(pl.name)}</strong><small>${pl.tracks?.length||0} músicas</small></span>${room.ownerId===state.user.id?`<button class="btn btn-secondary btn-sm" onclick="applyRoomPlaylist('${pl.id}')">Carregar</button>`:''}<button class="icon-btn" onclick="deleteRoomPlaylist('${pl.id}')">×</button></div>`).join(''):'<div class="music-message">Nenhuma playlist salva.</div>';
}
function setMusicListView(view='queue'){
  musicListView=['history','favorites'].includes(view)?view:'queue';
  document.getElementById('musicQueuePanel')?.classList.toggle('active',musicListView==='queue');
  document.getElementById('musicHistoryPanel')?.classList.toggle('active',musicListView==='history');
  document.getElementById('musicFavoritesPanel')?.classList.toggle('active',musicListView==='favorites');
  document.getElementById('musicQueueTab')?.classList.toggle('active',musicListView==='queue');
  document.getElementById('musicHistoryTab')?.classList.toggle('active',musicListView==='history');
  document.getElementById('musicFavoritesTab')?.classList.toggle('active',musicListView==='favorites');
  if(musicListView==='history')renderHistoryList(true);
  else if(musicListView==='favorites')renderFavoriteList(true);
  else renderQueueList(true);
}

function isFavoriteTrack(track){
  if(!track)return false;
  const url=canonicalMusicUrl(track);
  return (musicProfileData.favorites||[]).some(f=>f.videoId===track.videoId||canonicalMusicUrl(f)===url);
}
function findKnownTrack(videoId){
  return (musicState?.queue||[]).find(t=>t.videoId===videoId)
    || (musicState?.history||[]).find(t=>t.videoId===videoId)
    || (musicProfileData.favorites||[]).find(t=>t.videoId===videoId)
    || null;
}
async function toggleFavoriteTrack(videoId){
  const track=findKnownTrack(videoId);
  if(!track)return toast('Música não encontrada.');
  if(!window.TDBOnline?.musicProfileAction)return toast('Favoritos da conta exigem conexão online.');

  const normalized={...track,url:canonicalMusicUrl(track)};
  const before=structuredClone(musicProfileData.favorites||[]);
  const already=isFavoriteTrack(normalized);
  if(already){
    musicProfileData.favorites=before.filter(f=>f.videoId!==videoId&&canonicalMusicUrl(f)!==canonicalMusicUrl(normalized));
  }else{
    musicProfileData.favorites=[{
      videoId:normalized.videoId,
      title:normalized.title||'YouTube',
      channel:normalized.channel||'',
      thumbnail:normalized.thumbnail||'',
      url:canonicalMusicUrl(normalized),
      savedAt:Date.now(),
      ownerId:state.user?.id||null
    },...before].slice(0,100);
  }
  // Resposta visual imediata; o servidor confirma em seguida.
  writeMusicProfileCache();
  renderMusicExtras(true);
  renderQueueList(true);
  renderHistoryList(true);

  try{
    const r=await window.TDBOnline.musicProfileAction({type:'TOGGLE_FAVORITE',track:normalized});
    musicProfileData.favorites=r.favorites||[];
    writeMusicProfileCache();
    renderMusicExtras(true);
    renderQueueList(true);
    renderHistoryList(true);
    toast(r.favorited?'Música salva nos seus favoritos.':'Música removida dos seus favoritos.');
  }catch(err){
    musicProfileData.favorites=before;
    writeMusicProfileCache();
    renderMusicExtras(true);
    renderQueueList(true);
    renderHistoryList(true);
    toast(err.message||'Não foi possível atualizar seus favoritos.');
  }
}

async function loadMusicProfile(){
  // Cache é somente para abrir rápido; o servidor continua sendo a fonte oficial da conta.
  musicProfileData=readMusicProfileCache();
  renderMusicExtras(true);
  renderQueueList(true);
  renderHistoryList(true);

  if(!window.TDBOnline?.musicProfile)return;
  try{
    musicProfileData=await window.TDBOnline.musicProfile()||{favorites:[],presets:[]};
    writeMusicProfileCache();
    renderMusicExtras(true);
    renderQueueList(true);
    renderHistoryList(true);
  }catch(err){
    console.warn('[Music profile]',err);
    toast('Não foi possível sincronizar os favoritos da conta agora.');
  }
}
function currentFavorite(){return isFavoriteTrack(currentTrack())}
async function toggleCurrentFavorite(){
  const t=currentTrack();if(!t)return toast('Nenhuma música tocando.');
  return toggleFavoriteTrack(t.videoId);
}
async function addFavoriteToQueue(videoId){
  if(!requireMusicConnection())return false;
  const t=musicProfileData.favorites?.find(x=>x.videoId===videoId);if(!t)return;
  const track={...t,url:canonicalMusicUrl(t)};
  if(isOnlineMusic())return sendOnlineMusic({type:'ADD_TRACK',track});
  const next=structuredClone(musicState);
  next.queue.push({...track,id:`Q-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,addedBy:state.user.username,addedById:state.user.id,addedAt:Date.now()});
  if(next.currentIndex<0){next.currentIndex=0;next.position=0;next.status='paused';next.changedAt=Date.now()}
  saveMusicState(next);
}

async function addTrackFromHistory(videoId){
  if(!requireMusicConnection())return false;
  const t=(musicState?.history||[]).find(x=>x.videoId===videoId);
  if(!t)return toast('Música não encontrada no histórico.');
  const track={...t,url:canonicalMusicUrl(t)};
  if(isOnlineMusic())return sendOnlineMusic({type:'ADD_TRACK',track});
  const next=structuredClone(musicState);
  next.queue.push({...track,id:`Q-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,addedBy:state.user.username,addedById:state.user.id,addedAt:Date.now()});
  if(next.currentIndex<0){next.currentIndex=0;next.position=0;next.status='paused';next.changedAt=Date.now()}
  saveMusicState(next);
}

async function saveRoomPlaylist(){
  if(room.ownerId!==state.user.id)return toast('Somente o host pode salvar a playlist.');
  const name=prompt('Nome da playlist:','Noite TDB');if(!name)return;
  try{const r=await window.TDBOnline.musicProfileAction({type:'SAVE_PRESET',roomCode:room.code,name});musicProfileData.presets=r.presets||[];writeMusicProfileCache();renderMusicExtras();toast('Playlist salva.')}catch(err){toast(err.message||'Não foi possível salvar a playlist.')}
}
async function applyRoomPlaylist(id){try{const r=await window.TDBOnline.musicProfileAction({type:'APPLY_PRESET',roomCode:room.code,presetId:id});musicProfileData.presets=r.presets||musicProfileData.presets;writeMusicProfileCache();if(r.state){musicState=r.state;renderDynamic();syncPlayer(true)}toast('Playlist carregada na sala.')}catch(err){toast(err.message||'Não foi possível carregar a playlist.')}}
async function deleteRoomPlaylist(id){if(!confirm('Excluir esta playlist salva?'))return;try{const r=await window.TDBOnline.musicProfileAction({type:'DELETE_PRESET',presetId:id});musicProfileData.presets=r.presets||[];writeMusicProfileCache();renderMusicExtras()}catch(err){toast(err.message||'Não foi possível excluir.')}}
function renderMusicExtras(force=false){
  const favoriteBtn=document.getElementById('musicFavoriteBtn');
  if(favoriteBtn){
    const favorite=currentFavorite();
    favoriteBtn.textContent=favorite?'★ Favoritada':'Favoritar';
    favoriteBtn.classList.toggle('is-favorite',favorite);
  }
  renderHistoryList(force);
  renderFavoriteList(force);
  renderPresetList(force);
  const queueCount=document.getElementById('musicQueueCount');
  const historyCount=document.getElementById('musicHistoryCount');
  const favoritesCount=document.getElementById('musicFavoritesCount');
  if(queueCount)queueCount.textContent=String((musicState?.queue||[]).length);
  if(historyCount)historyCount.textContent=String((musicState?.history||[]).slice(0,10).length);
  if(favoritesCount)favoritesCount.textContent=String((musicProfileData.favorites||[]).length);
}

function renderDynamic(){
  const track=currentTrack();

  const title=document.getElementById('musicNowTitle');
  const meta=document.getElementById('musicNowMeta');
  const playButton=document.getElementById('musicPlayBtn');
  const empty=document.getElementById('musicEmptyPlayer');

  if(title) title.textContent=track?.title||'Nenhuma música na fila';
  if(meta) meta.textContent=track?`${track.channel||'YouTube'} • adicionado por ${track.addedBy}`:'Cole um link ou use a pesquisa.';
  if(playButton) playButton.textContent=musicState.status==='playing'?'⏸ Pausar':'▶ Tocar';

  const art=document.getElementById('musicNowArt');
  if(art){
    art.src=track?.thumbnail||(`https://i.ytimg.com/vi/${track?.videoId||''}/hqdefault.jpg`);
    art.style.visibility=track?'visible':'hidden';
  }
  const hostBadge=document.getElementById('musicHostBadge');
  if(hostBadge){
    const host=(room.players||[]).find(p=>p.id===room.ownerId);
    hostBadge.textContent=`HOST • ${host?.username||room.owner||'—'}`;
  }
  const controlBadge=document.getElementById('musicControlBadge');
  if(controlBadge){
    controlBadge.textContent=musicState.controlsLocked?'CONTROLE • HOST':room.musicControl==='host'?'CONTROLE • HOST':'CONTROLE • TODOS';
  }
  const vote=musicVoteInfo();
  const voteBox=document.getElementById('musicVoteProgress');
  if(voteBox){
    voteBox.style.display=vote?'grid':'none';
    if(vote){
      voteBox.querySelector('strong').textContent=`${vote.votes} / ${vote.needed} votos`;
      voteBox.querySelector('i').style.width=`${vote.percent}%`;
    }
  }
  const actionBox=document.getElementById('musicLastAction');
  if(actionBox){
    const a=musicState.lastAction;
    const labels={play:'tocou',pause:'pausou',next:'pulou',previous:'voltou',add:'adicionou música',remove:'removeu música',reorder:'reorganizou a fila',lock:'bloqueou controles',unlock:'liberou controles','skip-vote':'votou para pular',jump:'escolheu uma música',ended:'deixou a próxima música tocar'};
    actionBox.textContent=a?`${a.by||'Alguém'} • ${labels[a.type]||a.type}${a.type==='skip-vote'&&a.needed?` (${a.votes}/${a.needed})`:''}`:'';
  }
  if(empty) empty.style.display=track?'none':'grid';

  renderQueueList();

  const keyInput=document.getElementById('musicApiKey');
  if(keyInput && document.activeElement!==keyInput){
    keyInput.value=localStorage.getItem(API_KEY_STORAGE)||'';
  }

  refreshRoomMembers();
  renderMusicExtras();
}


function setMusicToolView(view='add'){
  musicToolView=['screen','playlists'].includes(view)?view:'add';
  ['add','screen','playlists'].forEach(name=>{
    document.getElementById(`musicTool${name[0].toUpperCase()+name.slice(1)}`)?.classList.toggle('active',musicToolView===name);
    document.getElementById(`musicToolTab${name[0].toUpperCase()+name.slice(1)}`)?.classList.toggle('active',musicToolView===name);
  });
}


function activityStoreKey(){return `tdb_activities_${room.code}`}
function emptyActivities(){return {roomCode:room.code,tables:[],revision:0,updatedAt:Date.now()}}
function isActivityOnline(){return window.TDBCore?.mode==='online'}
function readLocalActivities(){
  try{return JSON.parse(localStorage.getItem(activityStoreKey()))||emptyActivities()}
  catch{return emptyActivities()}
}
function writeLocalActivities(next){
  localStorage.setItem(activityStoreKey(),JSON.stringify(next));
  channel?.postMessage({type:'activities',roomCode:room.code,activities:next});
}
function activityParticipants(entries){
  return (entries||[]).map(p=>`<span class="activity-person">${escapeHtml(p.username||'Jogador')}</span>`).join('')||'<span class="activity-nobody">Ninguém ainda</span>';
}
function activityButton(label,action,variant='btn-dark'){
  return `<button class="btn ${variant} btn-sm" onclick="${action}" ${activityBusy?'disabled':''}>${label}</button>`;
}
function renderActivityHub(){
  const root=document.getElementById('loungeActivityHub');
  if(!root||!room)return;
  const activities=activityState||emptyActivities();
  const table=activities.tables?.[0]||null;
  const me=state.user?.id;
  const ownTable=!!table&&(table.hostId===me||room.ownerId===me);
  const asPlayer=!!table?.players?.some(p=>p.id===me);
  const asSpectator=!!table?.spectators?.some(p=>p.id===me);
  const connectionMissing=isActivityOnline()&&!window.TDBOnline?.connected;
  const game=table?ACTIVITY_GAMES[table.game]:null;
  let body='';
  if(connectionMissing){
    body='<div class="activity-empty">Reconectando à sala… A criação e entrada nas mesas ficam indisponíveis até a conexão voltar.</div>';
  }else if(!table){
    body=`<div class="activity-game-choices">${Object.entries(ACTIVITY_GAMES).map(([key,info])=>`
      <div class="activity-choice">
        <span class="activity-choice-icon" aria-hidden="true">${info.icon}</span>
        <span class="activity-choice-name">${info.name}</span>
        <span class="activity-choice-meta">${info.capacity} jogadores</span>
        ${activityButton('Criar mesa',`createActivityTable('${key}')`,'btn-secondary')}
      </div>`).join('')}</div>`;
  }else{
    body=`<div class="activity-table">
      <div class="activity-table-title"><span class="activity-table-icon">${game?.icon||'🎮'}</span><div><strong>Mesa de ${escapeHtml(game?.name||table.game)}</strong><small>Organizada por ${escapeHtml(table.hostName||'Participante')} · aguardando integração do jogo</small></div><span class="activity-status">Organizando</span></div>
      <div class="activity-table-people"><div><b>Jogadores (${(table.players||[]).length}/${game?.capacity||table.capacity})</b><div class="activity-person-list">${activityParticipants(table.players)}</div></div><div><b>Espectadores (${(table.spectators||[]).length})</b><div class="activity-person-list">${activityParticipants(table.spectators)}</div></div></div>
      <div class="activity-table-actions">
        ${asPlayer||asSpectator?activityButton('Sair da mesa',`activityAction('LEAVE')`):`<span class="activity-join-actions">${activityButton('Entrar como jogador',`activityAction('JOIN')`,'btn-primary')}${activityButton('Assistir',`activityAction('WATCH')`)}</span>`}
        ${ownTable?activityButton('Encerrar mesa',`activityAction('CLOSE')`,'btn-danger'):''}
      </div>
    </div>`;
  }
  root.innerHTML=`<div class="activity-head"><div><span class="eyebrow">NOVIDADE • v7.2.5</span><h2>Central de Atividades</h2><p>Organize uma mesa com seus amigos sem sair da sala e sem interromper a música.</p></div><span class="activity-room-pill">Sala: ${escapeHtml(room.code)}</span></div>
    ${body}
    <p class="activity-stage-note">Etapa 1: mesas para organizar jogadores e espectadores. <strong>Os jogos ainda não abrem dentro desta sala.</strong> A integração real vem nas próximas versões.</p>`;
}
async function refreshActivities(){
  if(!room||!document.getElementById('loungeActivityHub')||activityBusy)return;
  const code=room.code;
  if(isActivityOnline()){
    if(!window.TDBOnline?.connected){renderActivityHub();return}
    try{
      const next=await window.TDBOnline.getActivities(code);
      if(room?.code!==code)return;
      if(!activityState||Number(next.revision)>=Number(activityState.revision)&&next.revision!==activityState.revision){activityState=next;renderActivityHub()}
    }catch(err){console.warn('[TDB Atividades] Atualização de mesas:',err.message)}
  }else{
    const next=readLocalActivities();
    if(!activityState||Number(next.revision)>=Number(activityState.revision)&&next.revision!==activityState.revision){activityState=next;renderActivityHub()}
  }
}
async function createActivityTable(game){
  if(!ACTIVITY_GAMES[game])return toast('Jogo indisponível.');
  return updateActivity({type:'CREATE',game});
}
async function activityAction(type){
  const table=activityState?.tables?.[0];
  if(!table)return toast('Nenhuma mesa está aberta.');
  if(type==='CLOSE'&&!confirm('Encerrar esta mesa? A sala e a música continuarão abertas.'))return;
  return updateActivity({type,tableId:table.id});
}
async function updateActivity(action){
  if(activityBusy||!room)return;
  if(isActivityOnline()&&!window.TDBOnline?.connected)return toast('Reconectando ao servidor. Tente novamente.');
  const code=room.code;
  activityBusy=true;renderActivityHub();
  try{
    let next;
    if(isActivityOnline()){
      next=await window.TDBOnline.activityAction(code,action);
    }else{
      next=readLocalActivities();
      const table=next.tables?.[0];
      const self={id:state.user.id,username:state.user.username};
      if(action.type==='CREATE'){
        if(table)throw new Error('Já existe uma mesa.');
        next.tables=[{id:`ACT-${Date.now()}`,game:action.game,capacity:ACTIVITY_GAMES[action.game].capacity,hostId:self.id,hostName:self.username,players:[self],spectators:[],status:'organizing',createdAt:Date.now()}];
      }else{
        if(!table||table.id!==action.tableId)throw new Error('Mesa não encontrada.');
        if(action.type==='CLOSE'){
          if(table.hostId!==self.id&&room.ownerId!==self.id)throw new Error('Somente o organizador ou host pode encerrar.');
          next.tables=[];
        }else{
          table.players=table.players.filter(p=>p.id!==self.id);
          table.spectators=table.spectators.filter(p=>p.id!==self.id);
          if(action.type==='JOIN'){
            if(table.players.length>=table.capacity)throw new Error('Mesa cheia.');
            table.players.push(self);
          }else if(action.type==='WATCH')table.spectators.push(self);
        }
      }
      next.revision=(next.revision||0)+1;
      next.updatedAt=Date.now();
      writeLocalActivities(next);
    }
    if(room?.code===code){activityState=next;toast(action.type==='CREATE'?'Mesa criada. Convide os amigos!':action.type==='CLOSE'?'Mesa encerrada.':'Participação atualizada.');}
  }catch(err){toast(err.message||'Não foi possível atualizar a mesa.')}
  finally{activityBusy=false;if(room?.code===code)renderActivityHub()}
}
window.createActivityTable=createActivityTable;
window.activityAction=activityAction;
window.addEventListener('tdb-activities-update',event=>{
  if(room?.code===event.detail?.roomCode)refreshActivities();
});

async function leaveMusicRoom(){
  await window.TDBScreenShare?.leaveRoom?.({silent:true});
  musicRenderCache={queue:'',history:'',favorites:'',presets:'',members:''};
  window.__tdbMusicUnsubscribe?.();
  window.__tdbMusicUnsubscribe=null;
  clearInterval(syncTimer);
  clearInterval(roomTimer);
  clearInterval(progressTimer);
  clearInterval(activityTimer);activityTimer=null;activityState=null;activityBusy=false;
  channel?.close();
  channel=null;
  try{player?.destroy?.()}catch{}
  player=null;
  playerReady=false;
  requestedVideoId='';
  lastVideoLoadAt=0;
  lastPlaybackRevision=-1;
  leaveRoom();
}

function renderMusic(){
  window.TDBPlatformUI?.hideLoading?.();
  app.innerHTML=`${topbar()}
  <section id="musicScreen" class="music-screen music-v724 fade-in">
    <aside class="music-sidebar">
      <div class="music-brand">${logoTag()}<div><strong>TDB LOBBY</strong><span>OUÇA JUNTO • EM TEMPO REAL</span></div></div>
      <div class="music-room-info">
        <span class="eyebrow">SALA ATUAL</span>
        <h2>${escapeHtml(room.name)}</h2>
        <div class="music-room-code"><span>${escapeHtml(room.code)}</span><button onclick="copyCode('${room.code}')">Copiar</button></div>
      </div>
      <div class="music-sidebar-title"><span>Pessoas na sala</span><b>${(room.players||[]).length}</b></div>
      <div class="music-members" id="musicMembers"></div>
      <div class="music-permissions music-permissions-v724">
        <span>Quem controla</span><strong>${musicState.controlsLocked?'Somente host':room.musicControl==='host'?'Host':'Todos'}</strong>
        <span>Pular música</span><strong>${room.musicSkipMode==='host'?'Host':room.musicSkipMode==='vote'?'Votação':'Todos'}</strong>
        <span>Fila</span><strong>∞ Sem limite</strong>
      </div>
      ${room.ownerId===state.user.id?`<button class="btn btn-dark full" onclick="toggleMusicLock()">${musicState.controlsLocked?'Liberar controles':'Bloquear controles'}</button>`:''}
      <button class="btn btn-dark full music-leave-room" onclick="leaveMusicRoom()">Sair da sala</button>
    </aside>

    <main class="music-main">
      <section id="loungeActivityHub" class="lounge-activity-hub" aria-label="Central de Atividades"></section>
      <section id="loungeScreenStage" class="lounge-screen-stage"></section>

      <section class="music-quick-add">
        <div class="music-quick-add-copy"><span>ADICIONAR MÚSICA</span><strong>Cole o link do YouTube aqui</strong><small>youtube.com, youtu.be, Shorts ou embed</small></div>
        <div class="music-quick-add-form">
          <div class="music-link-shell"><span>🔗</span><input id="musicLinkInput" autocomplete="off" inputmode="url" placeholder="Cole o link da música…"></div>
          <button id="musicAddLinkBtn" class="btn btn-primary" onclick="addYoutubeLink()">+ Adicionar à fila</button>
        </div>
        <small id="musicLinkHint" class="music-link-hint">Dica: cole o link e pressione Enter.</small>
      </section>

      <section class="music-player-card">
        <div class="music-now-header">
          <img id="musicNowArt" class="music-now-art" alt="">
          <div class="music-now-copy">
            <span class="eyebrow">TOCANDO AGORA</span>
            <h1 id="musicNowTitle"></h1>
            <p id="musicNowMeta"></p>
            <div class="music-now-badges">
              <span id="musicHostBadge"></span>
              <span id="musicControlBadge"></span>
              <span id="musicSyncHealth" class="music-sync-health" data-state="ok">Sincronizado</span>
              <span id="musicSyncBadge" class="music-sync-badge"></span>
            </div>
            <small id="musicLastAction" class="music-last-action"></small>
          </div>
        </div>

        <div id="musicEnvironmentWarning" class="music-env-warning">Você abriu o projeto como arquivo local. Use o servidor local para o YouTube funcionar corretamente.</div>
        <div class="music-player-wrap">
          <div id="musicYoutubePlayer"></div>
          <div class="music-player-error" id="musicPlayerError"><strong>Não foi possível carregar este vídeo</strong><span data-error-text></span><small>Alguns vídeos não permitem reprodução incorporada.</small></div>
          <div class="music-empty-player" id="musicEmptyPlayer"><span>♫</span><strong>Escolha a primeira música</strong><small>Cole o link no campo destacado acima.</small></div>
        </div>

        <div class="music-progress"><span id="musicProgressCurrent">00:00</span><div class="music-progress-track"><i id="musicProgressFill"></i></div><span id="musicProgressDuration">--:--</span></div>
        <div class="music-vote-progress" id="musicVoteProgress"><span>VOTOS PARA PULAR</span><strong>0 / 2 votos</strong><div><i></i></div></div>
        <div class="music-controls music-controls-v724">
          <button class="music-round-btn" onclick="previousMusic()" title="Anterior">⏮</button>
          <button class="music-play-main" id="musicPlayBtn" onclick="toggleMusicPlayback()">▶ Tocar</button>
          <button class="music-round-btn" onclick="nextMusic()" title="Próxima">⏭</button>
          <button class="music-action-pill" id="musicFavoriteBtn" onclick="toggleCurrentFavorite()">☆ Favoritar</button>
          <button class="music-action-pill" onclick="forceMusicResync()">↻ Sincronizar</button>
        </div>
      </section>

      <section class="music-queue-card music-library-card">
        <div class="music-library-head"><div><span class="eyebrow">SALA</span><h2>Fila compartilhada</h2><p>Todo mundo vê a mesma ordem e a mesma música.</p></div><div class="music-library-tabs"><button id="musicQueueTab" class="active" onclick="setMusicListView('queue')">Fila <b id="musicQueueCount">0</b></button><button id="musicHistoryTab" onclick="setMusicListView('history')">Histórico <b id="musicHistoryCount">0</b></button><button id="musicFavoritesTab" onclick="setMusicListView('favorites')">Favoritas <b id="musicFavoritesCount">0</b></button></div></div>
        <div id="musicQueuePanel" class="music-library-panel active"><div class="music-queue" id="musicQueue"></div></div>
        <div id="musicHistoryPanel" class="music-library-panel"><div class="music-mini-list" id="musicHistory"></div></div>
        <div id="musicFavoritesPanel" class="music-library-panel"><div class="music-mini-list" id="musicFavorites"></div></div>
      </section>
    </main>

    <aside class="music-add-panel music-tools-panel">
      <div class="music-tools-head"><span class="eyebrow">FERRAMENTAS</span><h2>O que você quer fazer?</h2></div>
      <div class="music-tool-tabs">
        <button id="musicToolTabAdd" class="active" onclick="setMusicToolView('add')">Música</button>
        <button id="musicToolTabScreen" onclick="setMusicToolView('screen')">Tela</button>
        <button id="musicToolTabPlaylists" onclick="setMusicToolView('playlists')">Playlists</button>
      </div>

      <section id="musicToolAdd" class="music-tool-page active">
        <div class="music-tool-callout"><strong>Adicionar música</strong><p>O jeito mais fácil é colar o link no campo dourado acima do player.</p><button class="btn btn-primary full" onclick="document.getElementById('musicLinkInput')?.focus()">Colar link agora</button></div>
        <div class="music-tool-divider"><span>OU PESQUISE</span></div>
        <div class="music-search-row"><input id="musicSearchInput" placeholder="Ex.: Linkin Park Numb"><button class="btn btn-secondary" onclick="searchYoutube()">Buscar</button></div>
        <div class="music-search-results" id="musicSearchResults"></div>
        <details class="music-api"><summary>Configurar busca do YouTube</summary><p>A pesquisa exige uma YouTube Data API key. Adicionar por link não exige chave.</p><div class="field"><label>YouTube Data API key</label><input id="musicApiKey" type="password" placeholder="AIza..."></div><button class="btn btn-dark full" onclick="saveMusicApiKey()">Salvar neste navegador</button></details>
      </section>

      <section id="musicToolScreen" class="music-tool-page">
        <div class="music-tool-callout"><strong>Compartilhar tela</strong><p>Transmita monitor, janela ou aba para quem estiver na sala.</p></div>
        <div id="loungeScreenSharePanel" class="lounge-screen-share-panel"></div>
      </section>

      <section id="musicToolPlaylists" class="music-tool-page">
        <div class="section-title"><div><h2>Playlists salvas</h2><p>Salve a fila atual e reutilize depois.</p></div>${room.ownerId===state.user.id?'<button class="btn btn-secondary btn-sm" onclick="saveRoomPlaylist()">Salvar fila</button>':''}</div>
        <div class="music-mini-list" id="musicPresets"></div>
      </section>
    </aside>
  </section>`;

  renderDynamic();
  renderActivityHub();
  refreshActivities();
  clearInterval(activityTimer);
  activityTimer=setInterval(refreshActivities,4000);
  setMusicListView(musicListView);
  setMusicToolView(musicToolView);
  bindMusicComposer();
  showPlayerEnvironmentWarning();
  createPlayer();
  loadMusicProfile();
  window.TDBScreenShare?.mount?.(room);

  clearInterval(syncTimer);
  syncTimer=setInterval(async()=>{
    if(window.TDBCore?.mode==='online'){
      const before=musicStateFingerprint(musicState);
      const latest=await window.TDBOnline?.refreshShared?.(sharedMusicKey());
      if(!latest){
        updatePersistentSyncBadge('offline','Reconectando ao servidor');
        return;
      }
      const changed=applyRemoteMusicState(latest,{sync:false});
      // Estado novo: sincroniza imediatamente. Estado igual: apenas uma
      // checagem suave de drift, sem recarregar o iframe.
      if(changed || before!==musicStateFingerprint(musicState)) syncPlayer(false,'remote-state');
      else if(musicState?.status==='playing' && Date.now()-lastSyncCheckAt>5000) syncPlayer(false,'health');
      return;
    }

    const latest=readMusicState();
    if(latest.updatedAt!==musicState.updatedAt){
      musicState=latest;
      renderDynamic();
      syncPlayer(false,'local-state');
    }else if(musicState.status==='playing' && Date.now()-lastSyncCheckAt>5000){
      syncPlayer(false,'local-health');
    }
  },MUSIC_SYNC_POLL_MS);

  clearInterval(roomTimer);
  roomTimer=setInterval(refreshRoomMembers,1500);

  clearInterval(progressTimer);
  progressTimer=setInterval(updateMusicProgressUI,500);
  updateMusicProgressUI();
}

function startMusicRoom(activeRoom){
  clearInterval(activityTimer);activityTimer=null;activityState=null;activityBusy=false;
  musicRenderCache={queue:'',history:'',favorites:'',presets:'',members:''};
  musicListView='queue';
  musicToolView='add';
  requestedVideoId='';
  lastVideoLoadAt=0;
  lastPlaybackRevision=-1;
  lastRemoteSeekAt=0;
  lastSyncCheckAt=0;
  room=structuredClone(activeRoom);
  musicState=readMusicState();

  if(window.TDBCore?.mode==='online' && window.TDBCore.sharedState){
    window.TDBOnline?.refreshShared?.(sharedMusicKey()).then(value=>{
      applyRemoteMusicState(value,{sync:true});
    });
    window.__tdbMusicUnsubscribe?.();
    window.__tdbMusicUnsubscribe=window.TDBCore.sharedState.subscribe(sharedMusicKey(),value=>{
      applyRemoteMusicState(value,{sync:true});
    });
  }

  if(window.TDBCore?.mode!=='online' && 'BroadcastChannel' in window){
    channel?.close();
    channel=new BroadcastChannel(`tdb-music-${room.code}`);
    channel.onmessage=event=>{
      const data=event.data;
      if(data?.type==='state' && data.roomCode===room.code){
        applyRemoteMusicState(data.state,{sync:true});
      }
      if(data?.type==='activities' && data.roomCode===room.code){
        if(!activityState||Number(data.activities?.revision||0)>=Number(activityState.revision||0)){activityState=data.activities;renderActivityHub();}
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
window.toggleCurrentFavorite=toggleCurrentFavorite;
window.toggleFavoriteTrack=toggleFavoriteTrack;
window.addTrackFromHistory=addTrackFromHistory;
window.addFavoriteToQueue=addFavoriteToQueue;
window.setMusicListView=setMusicListView;
window.saveRoomPlaylist=saveRoomPlaylist;
window.applyRoomPlaylist=applyRoomPlaylist;
window.deleteRoomPlaylist=deleteRoomPlaylist;
window.setMusicToolView=setMusicToolView;
window.forceMusicResync=forceMusicResync;
})();
