
import fs from 'fs';

function read(rel){return fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8')}
function assert(name,condition){
  if(!condition)throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const app=read('app.js');
const online=read('core/online-client.js');
const sound=read('core/sound-manager.js');
const adminPanel=read('admin-panel.js');
const adminService=read('server/admin-service.js');
const router=read('server/http-router.js');
const music=read('games/music/music.js');
const musicCss=read('games/music/music.css');
const platform=read('server/platform-service.js');
const health=read('server/http-handlers/health.js');
const style=read('style.css');

// Party/group removal.
assert('Party backend is absent',!platform.includes('PARTY_MAX')&&!platform.includes('partyAction'));
assert('Party UI is absent',!app.includes('partyPanelHtml')&&!app.includes('Convidar para grupo'));
assert('Party route is absent',!router.includes('platform/party'));
assert('Legacy Party styling is removed',!style.includes('.party-panel')&&!style.includes('.party-member'));

// Explicit logout must not look like session expiration.
assert('Explicit logout flag is set before remote logout',app.includes("window.__TDB_EXPLICIT_LOGOUT__=true"));
assert('Background online sync is ignored during explicit logout',
  app.includes("Core.mode!=='online'||window.__TDB_EXPLICIT_LOGOUT__===true"));
assert('Game state updates are ignored during explicit logout',
  app.includes("if(window.__TDB_EXPLICIT_LOGOUT__===true)return"));
assert('Session-expired listener ignores explicit logout',
  app.includes("window.__TDB_EXPLICIT_LOGOUT__===true) return"));
assert('Online client suppresses 401 session event during explicit logout',
  online.includes("window.__TDB_EXPLICIT_LOGOUT__!==true"));
assert('Online client can be suspended before token removal',
  app.includes('window.TDBOnline?.suspend?.()'));

// Maintenance / operations.
assert('Admin operation tab stays available',adminPanel.includes("openTab('operations')"));
assert('Maintenance button has loading state',adminPanel.includes('maintenanceToggleBtn')&&adminPanel.includes('Ativando…'));
assert('Operations endpoint is maintenance-exempt',router.includes("route.startsWith('admin/')"));
assert('Maintenance state uses shared persistent key',adminService.includes("setSharedValue('app:maintenance'"));
assert('Maintenance confirmation retries',adminService.includes('for(let attempt=0;attempt<3;attempt++)'));
assert('Maintenance does not falsely succeed in Vercel without Supabase',
  adminService.includes("process.env.VERCEL&&!isSupabaseReady()"));
assert('Operations panel tolerates room/log query failures',
  adminService.includes('const warnings=[]')&&adminService.includes('roomsRes.error?[]'));

// Music anti-flicker / layout.
assert('Music has render cache for queue/history/favorites',music.includes('musicRenderCache'));
assert('Queue render skips unchanged DOM',music.includes('musicRenderCache.queue===key'));
assert('History render skips unchanged DOM',music.includes('musicRenderCache.history===key'));
assert('Queue row animation is disabled to stop flicker',musicCss.includes('.music-queue-item')&&musicCss.includes('animation:none!important'));
assert('Music library exposes Queue tab',music.includes("setMusicListView('queue')"));
assert('Music library exposes History tab',music.includes("setMusicListView('history')"));
assert('Music library exposes Favorites tab',music.includes("setMusicListView('favorites')"));
assert('Queue/history/favorites panels share internal scrolling',musicCss.includes('.music-library-panel>.music-queue')&&musicCss.includes('overflow-y:auto!important'));

// Account favorites.
assert('Favorite storage key is account-scoped',platform.includes('function musicFavoritesKey(userId)'));
assert('Server stores canonical YouTube URL',platform.includes('https://www.youtube.com/watch?v=${videoId}'));
assert('Server favorite record stores owner id',platform.includes('ownerId:user.id'));
assert('Client has account-scoped profile cache',music.includes('PROFILE_CACHE_PREFIX')&&music.includes('state.user?.id'));
assert('Favorite action has optimistic UI and server confirmation',
  music.includes("type:'TOGGLE_FAVORITE'")&&music.includes('writeMusicProfileCache()'));
assert('Favorite from history exists',music.includes("onclick=\"toggleFavoriteTrack('${t.videoId}')\""));
assert('Favorites are re-addable to queue',music.includes('addFavoriteToQueue'));

// Audio.
assert('Sound manager queues sounds until browser audio unlocks',sound.includes('pendingSounds'));
assert('Audio unlock listens to pointerdown and pointerup',
  sound.includes("addEventListener('pointerdown'")&&sound.includes("addEventListener('pointerup'"));
assert('Audio is resumed when returning to the tab',
  sound.includes("visibilitychange")&&sound.includes('unlockAudio()'));
assert('Audio remains capped and subtle',sound.includes('Math.min(.09'));

// Version.
assert('Health reports current stable version',health.includes("version:'7.0.1'"));
assert('Client reports 6.0.2',app.includes("version:'7.0.1'")&&online.includes("version:'7.0.1'"));

console.log('ALL V6.0.2 STABILITY TESTS PASSED');
