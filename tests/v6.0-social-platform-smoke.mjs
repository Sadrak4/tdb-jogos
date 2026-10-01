
import fs from 'fs';

function read(rel){return fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8')}
function assert(name,condition){
  if(!condition)throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const app=read('app.js');
const style=read('style.css');
const online=read('core/online-client.js');
const platformUI=read('core/platform-ui.js');
const index=read('index.html');
const router=read('server/http-router.js');
const platform=read('server/platform-service.js');
const start=read('server/http-handlers/games/start.js');
const join=read('server/http-handlers/rooms/join.js');
const watch=read('server/http-handlers/rooms/watch.js');
const upsert=read('server/http-handlers/rooms/upsert.js');
const social=read('server/social-service.js');
const musicServer=read('server/music-service.js');
const musicUI=read('games/music/music.js');
const admin=read('server/admin-service.js');
const adminUI=read('admin-panel.js');
const adminClient=read('core/admin-client.js');
const realtime=read('server/realtime-store.js');
const health=read('server/http-handlers/health.js');
const maintenance=read('server/maintenance-service.js');
const gameService=read('server/game-service.js');
const roomLeave=read('server/http-handlers/rooms/leave.js');

// v6.0.1 removed the READY system after UX testing.
assert('Ready route is removed',!router.includes("['rooms/ready',roomReady]"));
assert('Server no longer stores room ready state',!platform.includes('player.ready=!!ready'));
assert('Game start no longer blocks on ready flags',!start.includes("some(p=>!p.ready)"));
assert('Waiting room no longer exposes ready controls',!app.includes('toggleRoomReady')&&!app.includes('MARCAR PRONTO'));

// Reconnection visual.
assert('Visual reconnect countdown exists',platformUI.includes('reconnectUntil')&&platformUI.includes('Reconectando'));
assert('Client surfaces disconnect/reconnect transitions',app.includes('desconectou')&&app.includes('reconectou'));

// Live lobby and detailed friends.
assert('Lobby has live pulse summary',app.includes('lobbyPulseHtml'));
assert('Friend status distinguishes games',social.includes('Jogando ${labels[data.game]'));
assert('Music friend status says listening',social.includes('No TDB Lounge'));
assert('Away status exists',social.includes("status='Ausente'"));
assert('Friend quick profile supports room invite',app.includes('openFriendQuickProfile')&&app.includes('Convidar para minha sala'));

// Party was intentionally removed in v6.0.2.
assert('Party backend is removed',!platform.includes('PARTY_MAX')&&!platform.includes('partyAction'));
assert('Party UI is removed',!app.includes('partyPanelHtml')&&!app.includes('Convidar para grupo'));
assert('Party data is removed from social summary',!social.includes('partySummaryForUser'));
assert('Party route is removed',!router.includes('platform/party'));

// Music.
assert('Music keeps last ten played tracks',musicServer.includes('.slice(0,10)')&&musicServer.includes('history'));
assert('Music profile supports favorites',platform.includes("type==='TOGGLE_FAVORITE'"));
assert('Music profile supports saved playlists',platform.includes("type==='SAVE_PRESET'")&&platform.includes("type==='APPLY_PRESET'"));
assert('Music UI renders history',musicUI.includes("setMusicListView('history')")&&musicUI.includes('musicHistoryPanel'));
assert('Music UI renders favorites',musicUI.includes("setMusicListView('favorites')")&&musicUI.includes('musicFavoritesPanel'));
assert('Music UI renders playlists',musicUI.includes('Playlists salvas'));

// Room chat/reactions/spectators.
assert('Room chat persists a limited feed',platform.includes('ROOM_CHAT_MAX=50'));
assert('Quick reactions are restricted to supported emojis',platform.includes('ALLOWED_REACTIONS'));
assert('Room feed includes spectator count',platform.includes('spectatorCount'));
assert('Social drawer exists',platformUI.includes('Chat da sala')&&platformUI.includes('tdb-reaction-bar'));
assert('Spectators can be listed without becoming players',watch.includes('spectators'));

// Privacy.
assert('Room privacy offers public friends invite password',app.includes('Somente amigos')&&app.includes('Somente convite')&&app.includes('Com senha'));
assert('Server accepts friends and invite privacy',upsert.includes("'friends'")&&upsert.includes("'invite'"));
assert('Friends-only rooms enforce friendship',join.includes("room.privacy==='friends'"));
assert('Invite-only rooms enforce invite',join.includes("room.privacy==='invite'"));
assert('Spectator privacy uses same room restrictions',watch.includes("room.privacy==='friends'")&&watch.includes("room.privacy==='invite'"));
assert('Easy invite button exists',app.includes('COPIAR CONVITE')&&app.includes('copyRoomInvite'));

// Loading/fullscreen/graphics.
assert('Loading sync overlay exists',platformUI.includes('showLoading')&&platformUI.includes('hideLoading'));
assert('Game fullscreen focus exists',platformUI.includes('tdb-game-focus')&&style.includes('.tdb-game-focus'));
assert('Graphics settings include animations',app.includes("animations: true")&&app.includes('Animações completas'));
assert('Graphics settings include particles',app.includes("particles: true")&&app.includes('Efeitos de partículas'));
assert('Player entry animation exists',style.includes('player-entry'));

// Admin.
assert('Admin operational dashboard counts online users',admin.includes('onlineUsers'));
assert('Admin operational dashboard counts open rooms',admin.includes('openRooms'));
assert('Admin operational dashboard counts matches',admin.includes('activeMatches'));
assert('Admin users include active sessions and client version',admin.includes('active_sessions')&&admin.includes('client_version'));
assert('Admin operations groups errors by version',admin.includes('errorVersions'));
assert('Admin can toggle maintenance',admin.includes('setMaintenance'));
assert('Admin UI has operation tab',adminUI.includes("openTab('operations')")||adminUI.includes("data-tab=\"operations\"")||adminUI.includes("operations"));
assert('Admin UI filters account state',adminUI.includes('applyUserFilters'));
assert('Admin UI filters reports',adminUI.includes('applyReportFilters'));
assert('Admin UI filters logs by version/date',adminUI.includes('applyLogFilters'));
assert('Admin client exposes operations',adminClient.includes('operations')&&adminClient.includes('setMaintenance'));

// Maintenance/version/presence.
assert('Maintenance is enforced centrally',router.includes("code:'MAINTENANCE'"));
assert('Admin endpoints are exempt from maintenance',router.includes("route.startsWith('admin/')"));
assert('Health returns maintenance state',health.includes('maintenance:status.maintenance'));
assert('Realtime backend status reads maintenance state',realtime.includes("getSharedValue('app:maintenance'"));
assert('Presence stores app version',maintenance.includes("version:String(version||'6.1.1')"));
assert('Client logs carry v6 version',online.includes("context:{version:'6.1.1'"));

// Existing generic 5-minute cleanup is preserved for every game.
assert('Room empty TTL remains exactly five minutes',roomLeave.includes('5*60*1000'));
assert('Empty TTL is player-count based, not tied to a game',roomLeave.includes('if(!room.players.length)'));

// Platform UI is actually loaded.
assert('Platform UI script is loaded',index.includes('core/platform-ui.js'));

// Ranking must remain absent.
assert('Global ranking is not reintroduced',!app.includes('renderRanking(')&&!app.includes('TOP 3'));

console.log('ALL V6.0 SOCIAL PLATFORM TESTS PASSED');
