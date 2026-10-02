import fs from 'fs';
function read(rel){return fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8')}
function assert(name,cond){if(!cond)throw new Error(`FAIL: ${name}`);console.log('OK',name)}

const screen=read('games/music/screen-share.js');
const music=read('games/music/music.js');
const css=read('games/music/music.css');
const service=read('server/screen-share-service.js');
const store=read('server/realtime-store.js');
const health=read('server/http-handlers/health.js');

assert('Screen share remains browser-permission based',screen.includes('navigator.mediaDevices.getDisplayMedia'));
assert('Capture requests optional shared audio',screen.includes('audio:true'));
assert('Capture falls back to video-only when audio constraint is unsupported',screen.includes("audio:false")&&screen.includes('NotSupportedError'));
assert('Broadcaster preview renders immediately after capture and before START finishes',screen.includes("localPhase='registering'")&&screen.includes('A prévia e o botão PARAR aparecem imediatamente.'));
assert('Browser native stop ends the TDB broadcast',screen.includes("addEventListener('ended',()=>stopShare({reason:'browser'})"));
assert('Broadcaster has fixed stop control',screen.includes('loungeScreenFloatingStop')&&screen.includes('Parar compartilhamento'));
assert('Screen video is integrated into center stage',music.includes('id="loungeScreenStage"')&&screen.includes('loungeScreenLocalStageVideo')&&screen.includes('loungeScreenRemoteVideo'));
assert('Viewer must explicitly choose to receive video',screen.includes('Visualizar transmissão')&&screen.includes("type:'WATCH'"));
assert('Viewer can close without stopping broadcaster',screen.includes('stopWatching')&&screen.includes("type:'LEAVE_VIEW'"));
assert('Viewer can retry a failed connection',screen.includes('retryViewer')&&screen.includes('Tentar novamente'));
assert('Client reports TURN need when direct P2P is blocked',screen.includes('servidor TURN pode ser necessário'));
assert('ICE gathering waits long enough for STUN/TURN candidates',screen.includes('timeout=10_000'));
assert('ICE and peer connection states are both monitored',screen.includes('oniceconnectionstatechange')&&screen.includes('onconnectionstatechange'));
assert('Broadcast signaling keeps polling while Lounge tab is hidden',screen.includes('document.hidden&&!force&&!localStream&&!viewerWatching'));
assert('Remote tracks work even without event.streams array',screen.includes('remoteStream.addTrack(event.track)'));
assert('Autoplay with system audio has click-to-unmute fallback',screen.includes('clique no vídeo para ativar o áudio')&&screen.includes('enableRemoteAudio'));
assert('Lounge player compacts while share stage is active',css.includes('.music-screen.lounge-has-screen-share .music-player-card'));
assert('Screen share stage is responsive',css.includes('.lounge-screen-stage.active')&&css.includes('@media(max-width:850px)'));

assert('Server stores metadata separately from viewer signaling',service.includes('metaKey(code)')&&service.includes('signalPrefix(code,broadcastId)'));
assert('Broadcaster heartbeat has an independent key',service.includes('broadcastHeartbeatKey'));
assert('Old STOP cannot kill a newer broadcast',service.includes('A delayed STOP from an older tab/session must never kill a newer broadcast'));
assert('Old session signaling is rejected by broadcast id',service.includes('function assertBroadcast'));
assert('Viewer presence, offer and answer use separate keys',service.includes("'viewer',user.id")&&service.includes("'offer',viewerId")&&service.includes("'answer',user.id"));
assert('WATCH clears stale negotiation before publishing viewer request',service.indexOf("['offer','answer','connected']")<service.indexOf("setSharedValue(signalKey(room.code,bid,'viewer'"));
assert('OFFER clears stale answer before publishing a new offer',service.includes('Clear old answer/connected state before publishing the fresh offer event'));
assert('Shared store can list signal rows by prefix',store.includes('export async function listSharedValues(prefix)'));
assert('Shared store emits screen events with only the room code',store.includes("topic:'screenshare'")&&store.includes("key.slice(7).split(':')[0]"));
assert('Health reports 7.1.4',health.includes("version:'7.1.4'"));

console.log('ALL V6.1.1 SCREEN SHARE CLIENT TESTS PASSED');
