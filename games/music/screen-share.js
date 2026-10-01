(function(){
'use strict';

let room=null;
let shareState=null;
let iceServers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
let pollTimer=null;
let heartbeatTimer=null;
let localStream=null;
let broadcastId=null;
let broadcasterPeers=new Map();
let viewerPeer=null;
let viewerWatching=false;
let viewerOfferSdp='';
let renderKey='';
let pollBusy=false;
let lastConnectionText='';

function user(){return state?.user||null}
function esc(v){return typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function notify(msg){if(typeof toast==='function')toast(msg)}
function online(){return !!window.TDBOnline?.screenShareState&&!!window.TDBOnline?.screenShareAction}
function secureEnough(){return window.isSecureContext||['localhost','127.0.0.1'].includes(location.hostname)}
function randomId(){return `SCR-${Date.now()}-${Math.random().toString(36).slice(2,10)}`}
function panel(){return document.getElementById('loungeScreenSharePanel')}
function videoTrack(){return localStream?.getVideoTracks?.()[0]||null}
function audioTrack(){return localStream?.getAudioTracks?.()[0]||null}
function isBroadcaster(){return !!shareState?.active&&shareState?.broadcaster?.id===user()?.id}

async function apiAction(action){
  if(!room||!online())throw new Error('Compartilhamento de tela exige a sala online.');
  const r=await window.TDBOnline.screenShareAction(room.code,action);
  if(r?.iceServers?.length)iceServers=r.iceServers;
  if(r?.state)shareState=r.state;
  render();
  return r;
}

async function poll(force=false){
  if(room&&!panel()){leaveRoom({silent:true});return}
  if(!room||!online()||pollBusy||document.hidden&&!force)return;
  pollBusy=true;
  try{
    const r=await window.TDBOnline.screenShareState(room.code);
    if(r?.iceServers?.length)iceServers=r.iceServers;
    if(r?.state)shareState=r.state;
    render();
    if(localStream&&isBroadcaster())await processBroadcaster();
    if(viewerWatching&&!isBroadcaster())await processViewer();
  }catch(err){
    if(force)console.warn('[TDB Lounge Screen]',err);
  }finally{pollBusy=false}
}

function stopTracks(stream){
  for(const track of stream?.getTracks?.()||[]){try{track.stop()}catch{}}
}
function closePeer(pc){try{pc?.close?.()}catch{}}
function closeAllBroadcasterPeers(){for(const entry of broadcasterPeers.values())closePeer(entry.pc);broadcasterPeers.clear()}
function closeViewerPeer(){closePeer(viewerPeer);viewerPeer=null;viewerOfferSdp='';setRemoteStatus('')}

function rtc(){
  return new RTCPeerConnection({iceServers,iceCandidatePoolSize:2});
}

function waitIce(pc,timeout=4200){
  if(pc.iceGatheringState==='complete')return Promise.resolve();
  return new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve()};
    const check=()=>{if(pc.iceGatheringState==='complete')finish()};
    const timer=setTimeout(finish,timeout);
    pc.addEventListener('icegatheringstatechange',check);
  });
}

async function startShare(){
  if(!room)return;
  if(!secureEnough())return notify('Compartilhar tela exige HTTPS ou localhost.');
  if(!navigator.mediaDevices?.getDisplayMedia)return notify('Seu navegador não oferece compartilhamento de tela.');
  if(!online())return notify('Compartilhamento de tela funciona na sala online.');
  if(shareState?.active&&!isBroadcaster())return notify(`${shareState.broadcaster?.username||'Outra pessoa'} já está transmitindo.`);

  if(isBroadcaster()&&!localStream){
    try{await apiAction({type:'STOP'})}catch{}
  }

  let stream;
  try{
    stream=await navigator.mediaDevices.getDisplayMedia({
      video:{frameRate:{ideal:30,max:30},width:{ideal:1280},height:{ideal:720}},
      audio:true
    });
  }catch(err){
    if(err?.name!=='NotAllowedError')notify(err?.message||'Não foi possível iniciar o compartilhamento.');
    return;
  }

  localStream=stream;
  broadcastId=randomId();
  const v=videoTrack();
  if(v){try{v.contentHint='detail'}catch{};v.addEventListener('ended',()=>stopShare())}
  for(const t of stream.getAudioTracks())t.addEventListener('ended',()=>render());

  try{
    await apiAction({type:'START',broadcastId});
    startHeartbeat();
    render(true);
    notify('Compartilhamento de tela iniciado.');
  }catch(err){
    stopTracks(stream);localStream=null;broadcastId=null;
    notify(err?.message||'Não foi possível iniciar a transmissão.');
  }
}

async function stopShare({silent=false}={}){
  const wasBroadcaster=isBroadcaster()||!!localStream;
  const id=broadcastId;
  stopTracks(localStream);localStream=null;broadcastId=null;closeAllBroadcasterPeers();
  if(wasBroadcaster&&room&&online()){
    try{await apiAction({type:'STOP',broadcastId:id})}catch(err){if(!silent)console.warn(err)}
  }
  render(true);
  if(wasBroadcaster&&!silent)notify('Compartilhamento encerrado.');
}

function startHeartbeat(){
  clearInterval(heartbeatTimer);
  heartbeatTimer=setInterval(async()=>{
    if(!room||!online())return;
    try{
      if(localStream&&broadcastId)await apiAction({type:'HEARTBEAT',broadcastId});
      else if(viewerWatching)await apiAction({type:'VIEW_HEARTBEAT'});
    }catch{}
  },5200);
}

async function createOfferFor(viewer){
  if(!localStream||!viewer?.id||broadcasterPeers.has(viewer.id))return;
  const pc=rtc();
  const entry={pc,answerSdp:''};
  broadcasterPeers.set(viewer.id,entry);
  for(const track of localStream.getTracks()){
    const sender=pc.addTrack(track,localStream);
    if(track.kind==='video'){
      try{
        const params=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];params.encodings[0].maxBitrate=4_500_000;sender.setParameters(params).catch(()=>{});
      }catch{}
    }
  }
  pc.onconnectionstatechange=()=>{
    const st=pc.connectionState;
    render();
    if(['failed','closed'].includes(st)){
      closePeer(pc);broadcasterPeers.delete(viewer.id);
      apiAction({type:'RESET_VIEWER',viewerId:viewer.id}).catch(()=>{});
    }
  };
  try{
    await pc.setLocalDescription(await pc.createOffer({offerToReceiveAudio:false,offerToReceiveVideo:false}));
    await waitIce(pc);
    await apiAction({type:'OFFER',viewerId:viewer.id,description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
  }catch(err){
    closePeer(pc);broadcasterPeers.delete(viewer.id);
    console.warn('[TDB Lounge] oferta WebRTC',err);
  }
}

async function processBroadcaster(){
  if(!shareState?.active||!isBroadcaster()||!localStream)return;
  const activeIds=new Set((shareState.viewers||[]).map(v=>v.id));
  for(const [id,entry] of broadcasterPeers){if(!activeIds.has(id)){closePeer(entry.pc);broadcasterPeers.delete(id)}}
  for(const viewer of shareState.viewers||[]){
    if(viewer.status==='requested'&&!broadcasterPeers.has(viewer.id))await createOfferFor(viewer);
    const entry=broadcasterPeers.get(viewer.id);
    if(entry&&viewer.answer?.sdp&&viewer.answer.sdp!==entry.answerSdp){
      try{
        await entry.pc.setRemoteDescription(viewer.answer);
        entry.answerSdp=viewer.answer.sdp;
      }catch(err){console.warn('[TDB Lounge] resposta WebRTC',err)}
    }
  }
}

async function watchShare(){
  if(!shareState?.active)return notify('Nenhuma transmissão ativa.');
  if(isBroadcaster())return notify('Você já está transmitindo.');
  viewerWatching=true;
  showViewerModal();
  setRemoteStatus('Solicitando transmissão…');
  try{
    await apiAction({type:'WATCH'});
    startHeartbeat();
    await poll(true);
  }catch(err){
    viewerWatching=false;hideViewerModal();notify(err?.message||'Não foi possível assistir.');
  }
}

async function processViewer(){
  if(!viewerWatching)return;
  if(!shareState?.active){await stopWatching({silent:true});notify('A transmissão foi encerrada.');return}
  const self=shareState.selfViewer;
  if(!self){
    try{await apiAction({type:'WATCH'})}catch{}
    return;
  }
  if(!self.offer?.sdp||self.offer.sdp===viewerOfferSdp)return;
  viewerOfferSdp=self.offer.sdp;
  closeViewerPeer();
  viewerOfferSdp=self.offer.sdp;
  const pc=rtc();viewerPeer=pc;
  pc.ontrack=event=>{
    const stream=event.streams?.[0];
    const video=document.getElementById('loungeScreenRemoteVideo');
    if(video&&stream){video.srcObject=stream;video.play().catch(()=>{});setRemoteStatus('AO VIVO')}
  };
  pc.onconnectionstatechange=()=>{
    const st=pc.connectionState;
    if(st==='connected'){
      setRemoteStatus('AO VIVO');apiAction({type:'CONNECTED'}).catch(()=>{});
    }else if(st==='connecting')setRemoteStatus('Conectando…');
    else if(['failed','disconnected'].includes(st)){
      setRemoteStatus('Reconectando…');
      setTimeout(()=>retryViewer(),1200);
    }
  };
  try{
    setRemoteStatus('Conectando…');
    await pc.setRemoteDescription(self.offer);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    await apiAction({type:'ANSWER',description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
  }catch(err){
    console.warn('[TDB Lounge] viewer WebRTC',err);setRemoteStatus('Falha ao conectar');
  }
}

async function retryViewer(){
  if(!viewerWatching||!shareState?.active)return;
  closeViewerPeer();
  try{await apiAction({type:'WATCH'});await poll(true)}catch{}
}

async function stopWatching({silent=false}={}){
  if(!viewerWatching&&!viewerPeer){hideViewerModal();return}
  viewerWatching=false;closeViewerPeer();hideViewerModal();
  if(room&&online()){try{await apiAction({type:'LEAVE_VIEW'})}catch{}}
  render(true);
  if(!silent)notify('Você parou de assistir.');
}

function showViewerModal(){
  let modal=document.getElementById('loungeScreenViewerModal');
  if(!modal){
    modal=document.createElement('div');modal.id='loungeScreenViewerModal';modal.className='lounge-screen-modal';
    modal.innerHTML=`<div class="lounge-screen-window">
      <div class="lounge-screen-window-head"><div><span>TRANSMISSÃO AO VIVO</span><strong id="loungeScreenViewerTitle">Tela compartilhada</strong></div><div class="lounge-screen-window-actions"><button class="btn btn-secondary btn-sm" onclick="TDBScreenShare.fullscreen()">Tela cheia</button><button class="btn btn-dark btn-sm" onclick="TDBScreenShare.stopWatching()">Fechar</button></div></div>
      <div class="lounge-screen-video-wrap"><video id="loungeScreenRemoteVideo" autoplay playsinline controls></video><div id="loungeScreenRemoteStatus" class="lounge-screen-remote-status">Conectando…</div></div>
    </div>`;
    document.body.appendChild(modal);
  }
  const title=document.getElementById('loungeScreenViewerTitle');if(title)title.textContent=`${shareState?.broadcaster?.username||'Usuário'} está compartilhando`;
  modal.classList.add('visible');
}
function hideViewerModal(){document.getElementById('loungeScreenViewerModal')?.classList.remove('visible')}
function setRemoteStatus(text){
  lastConnectionText=text||'';
  const el=document.getElementById('loungeScreenRemoteStatus');if(el){el.textContent=text;el.style.display=text==='AO VIVO'?'none':'grid'}
}
async function fullscreen(){
  const wrap=document.querySelector('#loungeScreenViewerModal .lounge-screen-video-wrap');
  try{if(wrap?.requestFullscreen)await wrap.requestFullscreen()}catch{}
}

function attachPreview(){
  const v=document.getElementById('loungeScreenLocalPreview');
  if(v&&localStream&&v.srcObject!==localStream){v.srcObject=localStream;v.muted=true;v.play().catch(()=>{})}
}
function connectionSummary(){
  if(!isBroadcaster())return'';
  const connected=[...broadcasterPeers.values()].filter(x=>x.pc?.connectionState==='connected').length;
  return `${connected}/${shareState?.viewerCount||0} conectado(s)`;
}
function render(force=false){
  const root=panel();if(!root)return;
  const active=!!shareState?.active;
  const mine=isBroadcaster();
  const key=JSON.stringify([active,mine,shareState?.broadcaster?.id||'',shareState?.broadcaster?.username||'',!!localStream,viewerWatching,shareState?.viewerCount||0,audioTrack()?1:0,connectionSummary()]);
  if(!force&&renderKey===key){attachPreview();return}
  renderKey=key;

  if(!secureEnough()){
    root.innerHTML=`<div class="lounge-share-state unavailable"><strong>Compartilhamento indisponível</strong><span>Abra o TDB por HTTPS ou localhost.</span></div>`;return;
  }
  if(!online()){
    root.innerHTML=`<div class="lounge-share-state unavailable"><strong>Compartilhamento online</strong><span>Entre na versão hospedada para transmitir a tela.</span></div>`;return;
  }

  if(active&&mine){
    root.innerHTML=`<div class="lounge-share-live-head"><span class="lounge-live-dot"></span><div><strong>VOCÊ ESTÁ TRANSMITINDO</strong><small>${shareState.viewerCount||0} assistindo/solicitando • ${esc(connectionSummary())}${audioTrack()?' • áudio incluído':''}</small></div></div>
      ${localStream?`<video id="loungeScreenLocalPreview" class="lounge-screen-preview" autoplay muted playsinline></video>`:`<div class="lounge-share-state warning"><strong>A captura desta aba foi perdida</strong><span>Reinicie o compartilhamento.</span></div>`}
      <div class="lounge-share-buttons"><button class="btn btn-danger full" onclick="TDBScreenShare.stopShare()">Parar transmissão</button>${!localStream?'<button class="btn btn-primary full" onclick="TDBScreenShare.startShare()">Compartilhar novamente</button>':''}</div>`;
    attachPreview();return;
  }

  if(active){
    root.innerHTML=`<div class="lounge-share-live-head"><span class="lounge-live-dot"></span><div><strong>${esc(shareState.broadcaster?.username||'Alguém')} está compartilhando</strong><small>${shareState.viewerCount||0} pessoa(s) assistindo/solicitando</small></div></div>
      <div class="lounge-share-state"><span class="lounge-screen-icon">▣</span><strong>Transmissão disponível</strong><span>O vídeo só é recebido se você escolher assistir.</span></div>
      <button class="btn ${viewerWatching?'btn-secondary':'btn-primary'} full" onclick="${viewerWatching?'TDBScreenShare.stopWatching()':'TDBScreenShare.watchShare()'}">${viewerWatching?'Fechar transmissão':'Visualizar transmissão'}</button>`;
    return;
  }

  root.innerHTML=`<div class="lounge-share-state"><span class="lounge-screen-icon">▣</span><strong>Compartilhe sua tela</strong><span>Escolha monitor, janela ou aba. O navegador sempre pede sua confirmação.</span></div>
    <button class="btn btn-primary full" onclick="TDBScreenShare.startShare()">Compartilhar tela</button>`;
}

function mount(activeRoom){
  if(!activeRoom)return;
  if(room?.code&&room.code!==activeRoom.code)leaveRoom({silent:true});
  room=structuredClone(activeRoom);shareState=null;renderKey='';render(true);
  clearInterval(pollTimer);pollTimer=setInterval(()=>poll(false),2500);
  poll(true);
}

async function leaveRoom({silent=true}={}){
  clearInterval(pollTimer);pollTimer=null;clearInterval(heartbeatTimer);heartbeatTimer=null;
  if(localStream||isBroadcaster())await stopShare({silent:true});
  if(viewerWatching||viewerPeer)await stopWatching({silent:true});
  closeAllBroadcasterPeers();closeViewerPeer();room=null;shareState=null;renderKey='';
  if(!silent)notify('Compartilhamento encerrado.');
}

window.addEventListener('tdb-screen-share-update',e=>{if(room&&e.detail?.roomCode===room.code)poll(true)});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&room)poll(true)});
window.addEventListener('pagehide',()=>{stopTracks(localStream);localStream=null;closeAllBroadcasterPeers();closeViewerPeer()});

window.TDBScreenShare={mount,leaveRoom,startShare,stopShare,watchShare,stopWatching,fullscreen,poll};
})();
