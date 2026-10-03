(function(){
'use strict';

let room=null;
let shareState=null;
let iceServers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
let pollTimer=null;
let heartbeatTimer=null;
let localStream=null;
let remoteStream=null;
let broadcastId=null;
let broadcasterPeers=new Map();
let viewerPeer=null;
let viewerWatching=false;
let viewerOfferSdp='';
let pollBusy=false;
let sideRenderKey='';
let lastConnectionText='';
let localPhase='idle';
let viewerRetryTimer=null;
let viewerRetryCount=0;
let heartbeatFailures=0;

function user(){return state?.user||null}
function esc(v){return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function notify(msg){if(typeof toast==='function')toast(msg)}
function online(){return !!window.TDBOnline?.screenShareState&&!!window.TDBOnline?.screenShareAction}
function secureEnough(){return window.isSecureContext||['localhost','127.0.0.1'].includes(location.hostname)}
function randomId(){return `SCR-${Date.now()}-${Math.random().toString(36).slice(2,10)}`}
function panel(){return document.getElementById('loungeScreenSharePanel')}
function stage(){return document.getElementById('loungeScreenStage')}
function videoTrack(){return localStream?.getVideoTracks?.()[0]||null}
function audioTrack(){return localStream?.getAudioTracks?.()[0]||null}
function isBroadcaster(){return !!shareState?.active&&shareState?.broadcaster?.id===user()?.id}
function hasTurn(){return iceServers.some(s=>[].concat(s.urls||[]).some(u=>String(u).startsWith('turn:')||String(u).startsWith('turns:')))}

function friendlyScreenError(err,phase=''){
  const status=Number(err?.status||0);
  if(status===404)return 'A rota de compartilhamento não foi publicada no servidor. Atualize o TDB para a versão mais recente.';
  if(status===401)return 'Sua sessão online não está válida. Entre novamente na conta.';
  if(status===503)return err?.message||'O TDB está em manutenção.';
  if(status===429)return 'Muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.';
  if(err?.name==='NotAllowedError')return 'O compartilhamento foi cancelado ou o navegador não recebeu permissão.';
  if(err?.name==='AbortError')return 'A seleção da tela foi cancelada.';
  if(err?.name==='NotReadableError')return 'O navegador não conseguiu capturar essa tela/janela. Tente outra janela ou desative fullscreen exclusivo.';
  if(err?.name==='InvalidStateError')return 'O navegador bloqueou a captura porque a página não estava ativa. Clique no botão novamente.';
  const message=String(err?.message||'').trim();
  return message||(`Falha no compartilhamento${phase?` (${phase})`:''}.`);
}

async function preflightScreenShare(){
  if(!room||!online())throw new Error('Compartilhamento de tela exige a sala online.');
  const r=await window.TDBOnline.screenShareState(room.code);
  if(r?.iceServers?.length)iceServers=r.iceServers;
  if(r?.state)shareState=r.state;
  render(true);
  return r;
}


async function apiAction(action){
  if(!room||!online())throw new Error('Compartilhamento de tela exige a sala online.');
  try{
    const r=await window.TDBOnline.screenShareAction(room.code,action);
    if(r?.iceServers?.length)iceServers=r.iceServers;
    if(r?.state)shareState=r.state;
    render();
    return r;
  }catch(err){
    console.warn('[TDB Screen Share API]',action?.type||'STATE',err);
    throw err;
  }
}

async function poll(force=false){
  if(room&&!panel()){leaveRoom({silent:true});return}
  // Keep signaling alive while broadcasting/watching even if the Lounge tab is in the background.
  if(!room||!online()||pollBusy||(document.hidden&&!force&&!localStream&&!viewerWatching))return;
  pollBusy=true;
  try{
    const r=await window.TDBOnline.screenShareState(room.code);
    if(r?.iceServers?.length)iceServers=r.iceServers;
    if(r?.state)shareState=r.state;

    // If another client/server says our broadcast is gone, do not keep a ghost capture.
    if(localStream&&!isBroadcaster()&&localPhase==='live'){
      stopTracks(localStream);localStream=null;broadcastId=null;localPhase='idle';closeAllBroadcasterPeers();
      notify('A transmissão foi encerrada no servidor.');
    }

    render();
    if(localStream&&isBroadcaster())await processBroadcaster();
    if(viewerWatching&&!isBroadcaster())await processViewer();
  }catch(err){
    if(force)console.warn('[TDB Screen Share poll]',err);
    if(viewerWatching)setRemoteStatus('Reconectando ao servidor…');
  }finally{pollBusy=false}
}

function stopTracks(stream){for(const track of stream?.getTracks?.()||[]){try{track.stop()}catch{}}}
function closePeer(pc){try{pc?.close?.()}catch{}}
function closeAllBroadcasterPeers(){for(const entry of broadcasterPeers.values()){clearTimeout(entry.retryTimer);closePeer(entry.pc)}broadcasterPeers.clear()}
function closeViewerPeer(){clearTimeout(viewerRetryTimer);viewerRetryTimer=null;closePeer(viewerPeer);viewerPeer=null;viewerOfferSdp='';remoteStream=null;attachRemoteStream();}

function rtc(){
  if(typeof RTCPeerConnection!=='function')throw new Error('Seu navegador não oferece WebRTC.');
  return new RTCPeerConnection({iceServers,iceCandidatePoolSize:4,bundlePolicy:'max-bundle',iceTransportPolicy:'all'});
}

function waitIce(pc,timeout=10_000){
  if(pc.iceGatheringState==='complete')return Promise.resolve('complete');
  return new Promise(resolve=>{
    let done=false;
    const finish=(why)=>{if(done)return;done=true;clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve(why)};
    const check=()=>{if(pc.iceGatheringState==='complete')finish('complete')};
    const timer=setTimeout(()=>finish('timeout'),timeout);
    pc.addEventListener('icegatheringstatechange',check);
  });
}

async function captureDisplay(){
  const video={frameRate:{ideal:30,max:30},width:{ideal:1920,max:1920},height:{ideal:1080,max:1080}};
  try{return await navigator.mediaDevices.getDisplayMedia({video,audio:true})}
  catch(err){
    // Some browsers reject the audio constraint before opening the chooser.
    if(['TypeError','OverconstrainedError','NotSupportedError'].includes(err?.name))return await navigator.mediaDevices.getDisplayMedia({video,audio:false});
    throw err;
  }
}

async function startShare(){
  if(!room)return;
  if(!secureEnough())return notify('Compartilhar tela exige HTTPS ou localhost.');
  if(!navigator.mediaDevices?.getDisplayMedia)return notify('Seu navegador não oferece compartilhamento de tela.');
  if(!online())return notify('Compartilhamento de tela funciona somente na sala online.');
  if(localStream)return notify('Sua tela já está sendo compartilhada.');

  // Valida a rota/servidor ANTES de abrir o seletor do navegador.
  // Isso evita o comportamento da v6.1.1: escolher uma tela e só depois
  // descobrir que a rota da Vercel não estava publicada.
  localPhase='preflight';
  render(true);
  try{
    await preflightScreenShare();
    if(shareState?.active&&!isBroadcaster()){
      localPhase='idle';render(true);
      return notify(`${shareState.broadcaster?.username||'Outra pessoa'} já está transmitindo.`);
    }
    if(shareState?.active&&isBroadcaster()){
      localPhase='idle';render(true);
      return notify('Sua conta já possui uma transmissão ativa nesta sala. Encerre-a antes de iniciar outra.');
    }
  }catch(err){
    localPhase='idle';render(true);
    return notify(friendlyScreenError(err,'verificação do servidor'));
  }

  let stream;
  try{stream=await captureDisplay()}
  catch(err){
    localPhase='idle';render(true);
    if(!['NotAllowedError','AbortError'].includes(err?.name))notify(friendlyScreenError(err,'captura da tela'));
    return;
  }

  if(!stream?.getVideoTracks?.().length){
    stopTracks(stream);localPhase='idle';render(true);
    return notify('Nenhuma tela foi selecionada.');
  }

  localStream=stream;
  broadcastId=randomId();
  localPhase='registering';
  heartbeatFailures=0;
  const v=videoTrack();
  if(v){
    try{v.contentHint='detail'}catch{}
    v.addEventListener('ended',()=>{if(localStream===stream)stopShare({reason:'browser'})},{once:true});
  }
  for(const t of stream.getAudioTracks())t.addEventListener('ended',()=>render(true));

  // A prévia e o botão PARAR aparecem imediatamente.
  render(true);

  try{
    const r=await apiAction({type:'START',broadcastId});
    if(!r?.state?.active||r.state?.broadcaster?.id!==user()?.id)throw new Error('O servidor não confirmou a transmissão.');
    if(r.state.broadcastId!==broadcastId)throw new Error('O servidor confirmou uma sessão de transmissão diferente da atual.');
    localPhase='live';
    startHeartbeat();
    render(true);
    notify('Compartilhamento de tela iniciado.');
  }catch(err){
    stopTracks(stream);
    localStream=null;
    broadcastId=null;
    localPhase='idle';
    closeAllBroadcasterPeers();
    render(true);
    notify(friendlyScreenError(err,'registro da transmissão'));
  }
}
async function switchShareSource(){
  if(!localStream||!isBroadcaster()) return notify('Inicie um compartilhamento antes de trocar a origem.');
  if(!navigator.mediaDevices?.getDisplayMedia) return notify('Seu navegador não oferece troca de compartilhamento.');
  let stream;
  try{stream=await captureDisplay()}
  catch(err){
    if(!['NotAllowedError','AbortError'].includes(err?.name))notify(friendlyScreenError(err,'troca da tela'));
    return;
  }
  if(!stream?.getVideoTracks?.().length){stopTracks(stream);return notify('Nenhuma tela ou janela foi selecionada.')}
  const oldStream=localStream;
  localStream=stream;
  const v=videoTrack();
  if(v){
    try{v.contentHint='detail'}catch{}
    v.addEventListener('ended',()=>{if(localStream===stream)stopShare({reason:'browser'})},{once:true});
  }
  for(const t of stream.getAudioTracks())t.addEventListener('ended',()=>render(true));
  // A origem mudou: refaz as ofertas para os espectadores existentes sem
  // encerrar a transmissão da sala nem mudar o broadcastId.
  closeAllBroadcasterPeers();
  stopTracks(oldStream);
  render(true);
  try{await processBroadcaster()}catch(err){console.warn('[TDB Screen Share source switch]',err)}
  notify('Origem alterada. Os espectadores serão reconectados automaticamente.');
}

async function stopShare({silent=false,reason='user'}={}){
  const hadCapture=!!localStream;
  const wasBroadcaster=isBroadcaster()||hadCapture||localPhase==='registering';
  const id=broadcastId;
  localPhase='stopping';render(true);
  stopTracks(localStream);localStream=null;broadcastId=null;closeAllBroadcasterPeers();
  clearInterval(heartbeatTimer);heartbeatTimer=null;
  if(wasBroadcaster&&room&&online()){
    try{await apiAction({type:'STOP',broadcastId:id})}catch(err){if(!silent)console.warn('[TDB Screen Share stop]',err)}
  }
  localPhase='idle';render(true);
  if(wasBroadcaster&&!silent)notify(reason==='browser'?'Compartilhamento encerrado pelo navegador.':'Compartilhamento encerrado.');
}

function startHeartbeat(){
  clearInterval(heartbeatTimer);
  heartbeatTimer=setInterval(async()=>{
    if(!room||!online())return;
    try{
      if(localStream&&broadcastId){await apiAction({type:'HEARTBEAT',broadcastId});heartbeatFailures=0;}
      else if(viewerWatching)await apiAction({type:'VIEW_HEARTBEAT',broadcastId:shareState?.broadcastId||null});
    }catch(err){
      heartbeatFailures++;
      if(localStream&&heartbeatFailures>=3)console.warn('[TDB Screen Share] heartbeat falhando',err);
    }
  },4500);
}

function peerStatus(pc){return pc?.connectionState||pc?.iceConnectionState||'new'}
function scheduleBroadcasterRetry(viewerId,entry){
  if(entry.retryTimer)return;
  entry.retryTimer=setTimeout(async()=>{
    broadcasterPeers.delete(viewerId);closePeer(entry.pc);
    try{await apiAction({type:'RESET_VIEWER',broadcastId:entry.broadcastId,viewerId});await poll(true)}catch{}
  },1800);
}

async function createOfferFor(viewer){
  if(!localStream||!viewer?.id||broadcasterPeers.has(viewer.id))return;
  let pc;
  try{pc=rtc()}catch(err){notify(err.message);return}
  const entry={pc,answerSdp:'',retryTimer:null,broadcastId:broadcastId||shareState?.broadcastId||null};
  broadcasterPeers.set(viewer.id,entry);

  for(const track of localStream.getTracks()){
    const sender=pc.addTrack(track,localStream);
    if(track.kind==='video'){
      try{
        const params=sender.getParameters();
        params.encodings=params.encodings?.length?params.encodings:[{}];
        params.encodings[0].maxBitrate=5_000_000;
        params.encodings[0].maxFramerate=30;
        await sender.setParameters(params);
      }catch{}
    }
  }

  const connectionChanged=()=>{
    const st=pc.connectionState;
    const ice=pc.iceConnectionState;
    render();
    if(st==='failed'||ice==='failed')scheduleBroadcasterRetry(viewer.id,entry);
    if(st==='closed')broadcasterPeers.delete(viewer.id);
    if(st==='connected'||ice==='connected'||ice==='completed')clearTimeout(entry.retryTimer);
  };
  pc.onconnectionstatechange=connectionChanged;
  pc.oniceconnectionstatechange=connectionChanged;
  pc.onicecandidateerror=e=>console.warn('[TDB Screen Share ICE broadcaster]',e?.errorText||e);

  try{
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);
    if(!pc.localDescription?.sdp)throw new Error('Oferta WebRTC vazia.');
    await apiAction({type:'OFFER',broadcastId:entry.broadcastId,viewerId:viewer.id,description:{type:'offer',sdp:pc.localDescription.sdp}});
  }catch(err){
    closePeer(pc);broadcasterPeers.delete(viewer.id);
    console.warn('[TDB Screen Share offer]',err);
  }
}

async function processBroadcaster(){
  if(!shareState?.active||!isBroadcaster()||!localStream)return;
  const viewers=shareState.viewers||[];
  const activeIds=new Set(viewers.map(v=>v.id));
  for(const [id,entry] of broadcasterPeers){if(!activeIds.has(id)){clearTimeout(entry.retryTimer);closePeer(entry.pc);broadcasterPeers.delete(id)}}

  for(const viewer of viewers){
    if(!broadcasterPeers.has(viewer.id))await createOfferFor(viewer);
    const entry=broadcasterPeers.get(viewer.id);
    if(entry&&viewer.answer?.sdp&&viewer.answer.sdp!==entry.answerSdp&&entry.pc.signalingState==='have-local-offer'){
      try{
        await entry.pc.setRemoteDescription(viewer.answer);
        entry.answerSdp=viewer.answer.sdp;
      }catch(err){
        console.warn('[TDB Screen Share answer]',err);
        scheduleBroadcasterRetry(viewer.id,entry);
      }
    }
  }
}

async function watchShare(){
  if(!shareState?.active)return notify('Nenhuma transmissão ativa.');
  if(isBroadcaster())return notify('Você já está transmitindo.');
  viewerWatching=true;viewerRetryCount=0;viewerOfferSdp='';
  render(true);setRemoteStatus('Solicitando transmissão…');
  try{
    await apiAction({type:'WATCH',broadcastId:shareState?.broadcastId||null});
    startHeartbeat();
    await poll(true);
  }catch(err){
    viewerWatching=false;closeViewerPeer();render(true);notify(err?.message||'Não foi possível assistir.');
  }
}

function remoteVideo(){return document.getElementById('loungeScreenRemoteVideo')}
function attachRemoteStream(){
  const video=remoteVideo();
  if(video&&remoteStream&&video.srcObject!==remoteStream){
    video.srcObject=remoteStream;
    video.playsInline=true;
    video.autoplay=true;
    video.play().then(()=>setRemoteStatus('AO VIVO')).catch(async()=>{
      // Autoplay with shared system audio can be blocked. Start muted, then let the user enable audio.
      try{video.muted=true;await video.play();setRemoteStatus('AO VIVO • clique no vídeo para ativar o áudio')}catch{setRemoteStatus('Clique no vídeo para iniciar')}
    });
  }
}
async function enableRemoteAudio(){
  const video=remoteVideo();if(!video)return;
  try{video.muted=false;await video.play();setRemoteStatus('AO VIVO')}catch{}
}

function scheduleViewerRetry(message='Reconectando…'){
  if(!viewerWatching||viewerRetryTimer)return;
  setRemoteStatus(message);
  viewerRetryTimer=setTimeout(async()=>{
    viewerRetryTimer=null;
    if(!viewerWatching||!shareState?.active)return;
    viewerRetryCount++;
    closePeer(viewerPeer);viewerPeer=null;remoteStream=null;viewerOfferSdp='';
    if(viewerRetryCount>3){
      setRemoteStatus(hasTurn()?'Não foi possível conectar. Clique em Tentar novamente.':'Conexão P2P bloqueada pela rede. Um servidor TURN pode ser necessário.');
      render(true);return;
    }
    try{await apiAction({type:'WATCH',broadcastId:shareState?.broadcastId||null});await poll(true)}catch{}
  },1600);
}

async function processViewer(){
  if(!viewerWatching)return;
  if(!shareState?.active){await stopWatching({silent:true});notify('A transmissão foi encerrada.');return}
  const self=shareState.selfViewer;
  if(!self){
    try{await apiAction({type:'WATCH',broadcastId:shareState?.broadcastId||null})}catch{}
    return;
  }
  if(!self.offer?.sdp||self.offer.sdp===viewerOfferSdp)return;

  viewerOfferSdp=self.offer.sdp;
  closePeer(viewerPeer);viewerPeer=null;remoteStream=new MediaStream();
  let pc;
  try{pc=rtc()}catch(err){setRemoteStatus(err.message);return}
  viewerPeer=pc;

  pc.ontrack=event=>{
    if(event.streams?.[0])remoteStream=event.streams[0];
    else if(event.track&&!remoteStream.getTracks().some(t=>t.id===event.track.id))remoteStream.addTrack(event.track);
    attachRemoteStream();
  };
  const connectionChanged=()=>{
    const st=pc.connectionState,ice=pc.iceConnectionState;
    if(st==='connected'||ice==='connected'||ice==='completed'){
      viewerRetryCount=0;clearTimeout(viewerRetryTimer);viewerRetryTimer=null;
      setRemoteStatus('AO VIVO');apiAction({type:'CONNECTED',broadcastId:shareState?.broadcastId||null}).catch(()=>{});attachRemoteStream();
    }else if(st==='connecting'||ice==='checking')setRemoteStatus('Estabelecendo vídeo…');
    else if(st==='failed'||ice==='failed')scheduleViewerRetry();
    else if(st==='disconnected')scheduleViewerRetry('Conexão interrompida. Tentando novamente…');
  };
  pc.onconnectionstatechange=connectionChanged;
  pc.oniceconnectionstatechange=connectionChanged;
  pc.onicecandidateerror=e=>console.warn('[TDB Screen Share ICE viewer]',e?.errorText||e);

  try{
    setRemoteStatus('Negociando conexão…');
    await pc.setRemoteDescription(self.offer);
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIce(pc);
    if(!pc.localDescription?.sdp)throw new Error('Resposta WebRTC vazia.');
    await apiAction({type:'ANSWER',broadcastId:shareState?.broadcastId||null,description:{type:'answer',sdp:pc.localDescription.sdp}});
    setRemoteStatus('Estabelecendo vídeo…');
  }catch(err){
    console.warn('[TDB Screen Share viewer]',err);
    scheduleViewerRetry('Falha na negociação. Tentando novamente…');
  }
}

async function retryViewer(){
  if(!viewerWatching){return watchShare()}
  viewerRetryCount=0;clearTimeout(viewerRetryTimer);viewerRetryTimer=null;
  closePeer(viewerPeer);viewerPeer=null;remoteStream=null;viewerOfferSdp='';
  setRemoteStatus('Tentando novamente…');
  try{await apiAction({type:'WATCH',broadcastId:shareState?.broadcastId||null});await poll(true)}catch(err){setRemoteStatus(err?.message||'Falha ao tentar novamente')}
}

async function stopWatching({silent=false}={}){
  if(!viewerWatching&&!viewerPeer){render(true);return}
  viewerWatching=false;clearTimeout(viewerRetryTimer);viewerRetryTimer=null;viewerRetryCount=0;closeViewerPeer();
  clearInterval(heartbeatTimer);heartbeatTimer=null;
  if(room&&online()){try{await apiAction({type:'LEAVE_VIEW',broadcastId:shareState?.broadcastId||null})}catch{}}
  render(true);
  if(!silent)notify('Você parou de assistir.');
}

function setRemoteStatus(text){
  lastConnectionText=text||'';
  const el=document.getElementById('loungeScreenRemoteStatus');
  if(el){el.textContent=lastConnectionText;el.classList.toggle('hidden',lastConnectionText==='AO VIVO')}
  const retry=document.getElementById('loungeScreenRetryBtn');
  if(retry)retry.hidden=!/não foi possível|bloqueada|falha/i.test(lastConnectionText);
}

async function fullscreen(){
  const target=document.querySelector('#loungeScreenStage .lounge-stage-video-wrap')||remoteVideo()||document.getElementById('loungeScreenLocalStageVideo');
  try{if(target?.requestFullscreen)await target.requestFullscreen()}catch{}
}

function attachLocalPreviews(){
  if(!localStream)return;
  for(const id of ['loungeScreenLocalPreview','loungeScreenLocalStageVideo']){
    const v=document.getElementById(id);
    if(v&&v.srcObject!==localStream){v.srcObject=localStream;v.muted=true;v.play().catch(()=>{})}
  }
}

function connectionSummary(){
  if(!localStream)return'';
  const connected=[...broadcasterPeers.values()].filter(x=>['connected','completed'].includes(x.pc?.connectionState)||['connected','completed'].includes(x.pc?.iceConnectionState)).length;
  return `${connected}/${shareState?.viewerCount||0} conectado(s)`;
}

function renderStage(force=false){
  const root=stage();if(!root)return;
  const screen=document.getElementById('musicScreen')||root.closest('.music-screen');
  let mode='idle';
  if(localStream)mode='local';
  else if(shareState?.active&&isBroadcaster())mode='orphan';
  else if(shareState?.active&&viewerWatching)mode='remote';
  else if(shareState?.active)mode='available';
  root.classList.toggle('active',mode!=='idle');
  screen?.classList.toggle('lounge-has-screen-share',mode!=='idle');

  if(root.dataset.mode===mode&&!force){
    attachLocalPreviews();attachRemoteStream();setRemoteStatus(lastConnectionText);return;
  }
  root.dataset.mode=mode;

  if(mode==='idle'){
    if(localPhase==='preflight'){
      root.classList.add('active');
      screen?.classList.add('lounge-has-screen-share');
      root.innerHTML=`<div class="lounge-stage-available"><span class="eyebrow">COMPARTILHAMENTO</span><h2>Verificando transmissão…</h2><p>Confirmando conexão com o servidor antes de abrir o seletor de tela.</p></div>`;
    }else root.innerHTML='';
    return;
  }
  if(mode==='local'){
    root.innerHTML=`<div class="lounge-stage-head"><div><span class="lounge-live-dot"></span><div><strong>VOCÊ ESTÁ COMPARTILHANDO</strong><small>${localPhase==='registering'?'Publicando transmissão na sala…':`${shareState?.viewerCount||0} espectador(es) • ${esc(connectionSummary())}`}</small></div></div><div class="lounge-stage-actions"><button class="btn btn-secondary btn-sm" onclick="TDBScreenShare.switchShareSource()">Trocar tela/janela</button><button class="btn btn-secondary btn-sm" onclick="TDBScreenShare.fullscreen()">Tela cheia</button><button class="btn btn-danger btn-sm" onclick="TDBScreenShare.stopShare()">Parar compartilhamento</button></div></div><div class="lounge-stage-video-wrap"><video id="loungeScreenLocalStageVideo" autoplay muted playsinline></video></div>`;
    attachLocalPreviews();return;
  }
  if(mode==='orphan'){
    root.innerHTML=`<div class="lounge-stage-available"><span class="lounge-live-dot"></span><span class="eyebrow">TRANSMISSÃO DA SUA CONTA</span><h2>Existe uma transmissão ativa sem captura nesta aba</h2><p>Ela pode estar aberta em outra aba/dispositivo. Encerre-a aqui antes de iniciar outra.</p><button class="btn btn-danger" onclick="TDBScreenShare.stopShare()">Encerrar transmissão</button></div>`;
    return;
  }
  if(mode==='available'){
    root.innerHTML=`<div class="lounge-stage-available"><span class="lounge-live-dot"></span><span class="eyebrow">TRANSMISSÃO AO VIVO</span><h2>${esc(shareState.broadcaster?.username||'Alguém')} está compartilhando a tela</h2><p>O vídeo só será recebido quando você clicar em visualizar.</p><button class="btn btn-primary" onclick="TDBScreenShare.watchShare()">Visualizar transmissão</button></div>`;
    return;
  }
  root.innerHTML=`<div class="lounge-stage-head"><div><span class="lounge-live-dot"></span><div><strong>${esc(shareState?.broadcaster?.username||'Usuário')} • AO VIVO</strong><small id="loungeScreenStageStatus">${esc(lastConnectionText||'Conectando…')}</small></div></div><div class="lounge-stage-actions"><button class="btn btn-secondary btn-sm" onclick="TDBScreenShare.fullscreen()">Tela cheia</button><button class="btn btn-dark btn-sm" onclick="TDBScreenShare.stopWatching()">Fechar</button></div></div><div class="lounge-stage-video-wrap" onclick="TDBScreenShare.enableRemoteAudio()"><video id="loungeScreenRemoteVideo" autoplay playsinline controls></video><div id="loungeScreenRemoteStatus" class="lounge-screen-remote-status">${esc(lastConnectionText||'Conectando…')}</div><button id="loungeScreenRetryBtn" class="btn btn-primary lounge-screen-retry" hidden onclick="event.stopPropagation();TDBScreenShare.retryViewer()">Tentar novamente</button></div>`;
  attachRemoteStream();setRemoteStatus(lastConnectionText||'Conectando…');
}

function renderFloatingStop(){
  let bar=document.getElementById('loungeScreenFloatingStop');
  if(localStream){
    if(!bar){bar=document.createElement('div');bar.id='loungeScreenFloatingStop';bar.className='lounge-screen-floating-stop';document.body.appendChild(bar)}
    bar.innerHTML=`<span><i></i><strong>Compartilhando tela</strong></span><button onclick="TDBScreenShare.stopShare()">Parar</button>`;
    bar.classList.add('visible');
  }else bar?.remove();
}

function render(force=false){
  const root=panel();if(!root)return;
  renderStage(force);renderFloatingStop();
  const active=!!shareState?.active;
  const mine=isBroadcaster()||!!localStream;
  const key=JSON.stringify([active,mine,shareState?.broadcaster?.id||'',shareState?.broadcaster?.username||'',!!localStream,localPhase,viewerWatching,shareState?.viewerCount||0,audioTrack()?1:0,connectionSummary(),lastConnectionText]);
  if(!force&&sideRenderKey===key){attachLocalPreviews();attachRemoteStream();return}
  sideRenderKey=key;

  if(!secureEnough()){
    root.innerHTML=`<div class="lounge-share-state unavailable"><strong>Compartilhamento indisponível</strong><span>Abra o TDB por HTTPS ou localhost.</span></div>`;return;
  }
  if(!online()){
    root.innerHTML=`<div class="lounge-share-state unavailable"><strong>Compartilhamento online</strong><span>Entre na versão hospedada para transmitir a tela.</span></div>`;return;
  }

  if(localStream){
    root.innerHTML=`<div class="lounge-share-live-head"><span class="lounge-live-dot"></span><div><strong>${localPhase==='registering'?'INICIANDO TRANSMISSÃO…':'VOCÊ ESTÁ TRANSMITINDO'}</strong><small>${shareState?.viewerCount||0} espectador(es) • ${esc(connectionSummary())}${audioTrack()?' • áudio da tela incluído':''}</small></div></div><video id="loungeScreenLocalPreview" class="lounge-screen-preview" autoplay muted playsinline></video><div class="lounge-share-buttons"><button class="btn btn-secondary full" onclick="TDBScreenShare.switchShareSource()">Trocar tela / janela / aba</button><button class="btn btn-danger full" onclick="TDBScreenShare.stopShare()">Parar compartilhamento</button></div>`;
    attachLocalPreviews();return;
  }

  if(active&&isBroadcaster()){
    root.innerHTML=`<div class="lounge-share-live-head"><span class="lounge-live-dot"></span><div><strong>TRANSMISSÃO DA SUA CONTA</strong><small>A captura não está disponível nesta aba.</small></div></div><div class="lounge-share-state warning"><strong>Pode estar aberta em outra aba/dispositivo</strong><span>Se não estiver, encerre o estado antigo e compartilhe novamente.</span></div><button class="btn btn-danger full" onclick="TDBScreenShare.stopShare()">Encerrar transmissão</button>`;
    return;
  }
  if(active){
    root.innerHTML=`<div class="lounge-share-live-head"><span class="lounge-live-dot"></span><div><strong>${esc(shareState.broadcaster?.username||'Alguém')} está compartilhando</strong><small>${shareState.viewerCount||0} espectador(es)</small></div></div><div class="lounge-share-state"><span class="lounge-screen-icon">▣</span><strong>${viewerWatching?'Transmissão aberta':'Transmissão disponível'}</strong><span>${viewerWatching?(lastConnectionText||'Conectando…'):'Você decide se quer receber o vídeo.'}</span></div><button class="btn ${viewerWatching?'btn-secondary':'btn-primary'} full" onclick="${viewerWatching?'TDBScreenShare.stopWatching()':'TDBScreenShare.watchShare()'}">${viewerWatching?'Fechar transmissão':'Visualizar transmissão'}</button>`;
    return;
  }

  root.innerHTML=`<div class="lounge-share-state"><span class="lounge-screen-icon">▣</span><strong>${localPhase==='preflight'?'Verificando servidor…':'Compartilhe sua tela'}</strong><span>${localPhase==='preflight'?'Confirmando se a transmissão está disponível.':'Escolha monitor, janela ou aba. O navegador sempre pede sua confirmação.'}</span></div><button class="btn btn-primary full" ${localPhase==='preflight'?'disabled':''} onclick="TDBScreenShare.startShare()">${localPhase==='preflight'?'Verificando…':'Compartilhar tela'}</button>`;
}

function mount(activeRoom){
  if(!activeRoom)return;
  if(room?.code&&room.code!==activeRoom.code)leaveRoom({silent:true});
  room=structuredClone(activeRoom);shareState=null;sideRenderKey='';render(true);
  clearInterval(pollTimer);pollTimer=setInterval(()=>poll(false),1300);
  poll(true);
}

async function leaveRoom({silent=true}={}){
  clearInterval(pollTimer);pollTimer=null;clearInterval(heartbeatTimer);heartbeatTimer=null;clearTimeout(viewerRetryTimer);viewerRetryTimer=null;
  if(localStream||isBroadcaster())await stopShare({silent:true});
  if(viewerWatching||viewerPeer)await stopWatching({silent:true});
  closeAllBroadcasterPeers();closeViewerPeer();room=null;shareState=null;sideRenderKey='';localPhase='idle';
  document.getElementById('loungeScreenFloatingStop')?.remove();
  const st=stage();if(st){st.innerHTML='';st.classList.remove('active');delete st.dataset.mode}
  document.getElementById('musicScreen')?.classList.remove('lounge-has-screen-share');
  if(!silent)notify('Compartilhamento encerrado.');
}

window.addEventListener('tdb-screen-share-update',e=>{if(room&&e.detail?.roomCode===room.code)poll(true)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&room)poll(true)});
window.addEventListener('pagehide',()=>{stopTracks(localStream);localStream=null;closeAllBroadcasterPeers();closeViewerPeer()});

window.TDBScreenShare={mount,leaveRoom,startShare,switchShareSource,stopShare,watchShare,stopWatching,fullscreen,poll,retryViewer,enableRemoteAudio};
})();
