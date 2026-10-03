import fs from 'fs';

function read(rel){return fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8')}
function assert(name,condition){
  if(!condition)throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const index=read('index.html');
const fixes=read('ui/gameplay-fixes.css');
const platform=read('core/platform-ui.js');
const app=read('app.js');
const chess=read('games/chess/chess-ui.js');
const music=read('games/music/music.js');
const blackjack=read('games/blackjack/blackjack.js');
const registry=read('core/game-registry.js');
const health=read('server/http-handlers/health.js');
const maintenance=read('server/maintenance-service.js');
const packageJson=JSON.parse(read('package.json'));

assert('Gameplay safety stylesheet loads after v7 responsive layer',
  index.indexOf('ui/gameplay-fixes.css')>index.indexOf('ui/responsive.css'));
assert('Old full-screen sync veil is neutralized for v7 games',
  fixes.includes('.tdb-v7 .tdb-sync-overlay')&&fixes.includes('background:transparent!important')&&fixes.includes('bottom:auto!important'));
assert('Truco table restores a real 100% play surface',
  fixes.includes('.tdb-v7 .table-shell')&&fixes.includes('height:100%!important'));
assert('Truco live zones are forced visible',
  fixes.includes('#trucoPlayZone')&&fixes.includes('#trucoMyHand')&&fixes.includes('visibility:visible!important'));
assert('Chess center restores grid geometry',
  fixes.includes('.tdb-v7 .chess-center')&&fixes.includes('display:grid!important')&&fixes.includes('grid-template-rows:auto auto minmax(0,1fr) auto!important'));
assert('Chess board is explicitly visible and remains 8x8',
  fixes.includes('.tdb-v7 .chess-board')&&fixes.includes('grid-template-columns:repeat(8,minmax(0,1fr))!important')&&fixes.includes('aspect-ratio:1/1!important'));
assert('Inactive screen-share stage cannot occupy the TDB Lobby player area',
  fixes.includes('.lounge-screen-stage:not(.active){display:none!important}'));
assert('TDB Lobby restores the proven two-row player/library layout without screen share',
  fixes.includes('.music-screen:not(.lounge-has-screen-share) .music-main')&&fixes.includes('grid-template-rows:minmax(0,auto) minmax(170px,1fr)!important'));
assert('Blackjack cards no longer use negative overlap margins',
  fixes.includes('.bj-hand-cards .bj-card+.bj-card')&&fixes.includes('margin-left:0!important'));
assert('Blackjack hand can wrap instead of crossing adjacent UI',
  fixes.includes('flex-wrap:wrap!important')&&fixes.includes('row-gap:4px!important'));

assert('Platform auto-removes sync loading when a playable screen mounts',
  platform.includes("document.querySelector('.truco-screen,.chess-screen,.blackjack-page,.music-screen')")&&platform.includes('hideLoading()'));
assert('Truco render clears stale loading veil',app.includes('function renderTruco')&&app.includes('TDBPlatformUI?.hideLoading'));
assert('Chess render clears stale loading veil',chess.includes('function renderChessScreen')&&chess.includes('TDBPlatformUI?.hideLoading'));
assert('Music render clears stale loading veil',music.includes('function renderMusic')&&music.includes('TDBPlatformUI?.hideLoading'));
assert('Blackjack render clears stale loading veil',blackjack.includes('TDBPlatformUI?.hideLoading'));

assert('Product is branded simply TDB',index.includes('<title>TDB</title>')&&health.includes("app:'TDB'"));
assert('Social room is branded TDB Lobby',app.includes("name: 'TDB Lobby'")&&registry.includes("name: 'TDB Lobby'")&&music.includes('TDB LOBBY'));
assert('Package is v7.1.4',packageJson.version==='7.1.4'&&packageJson.name==='tdb');
assert('Health reports v7.1.4',health.includes("version:'7.1.4'"));
assert('Presence fallback reports v7.1.4',maintenance.includes("version:String(version||'7.1.4')"));

console.log('ALL V7.0.1 GAMEPLAY VISIBILITY TESTS PASSED');
