
import fs from 'fs';

function read(rel){return fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8')}
function assert(name,condition){
  if(!condition)throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const app=read('app.js');
const start=read('server/http-handlers/games/start.js');
const router=read('server/http-router.js');
const online=read('core/online-client.js');
const chess=read('games/chess/chess-ui.js');
const music=read('games/music/music.js');
const musicCss=read('games/music/music.css');
const platform=read('server/platform-service.js');
const health=read('server/http-handlers/health.js');

assert('Truco card click dispatches PLAY_CARD directly',
  app.includes("trucoDispatch('PLAY_CARD',{playerIdx:seat,cardIdx:idx,hidden})"));
assert('Truco no longer shows normal Play Card button',
  !app.includes('>Jogar carta</button>'));
assert('Truco hidden-card mode remains available',
  app.includes('toggleTrucoHideMode')&&app.includes('Esconder carta'));

assert('Ready button is removed from waiting rooms',
  !app.includes('MARCAR PRONTO')&&!app.includes('toggleRoomReady'));
assert('Backend no longer blocks game start by ready flag',
  !start.includes('p.ready'));
assert('Ready HTTP route is not registered',
  !router.includes("['rooms/ready',roomReady]"));
assert('Online client no longer exposes setRoomReady',
  !online.includes('setRoomReady'));

assert('Chess tracks the last animated move',
  chess.includes('lastAnimatedMoveKey'));
assert('Chess only applies piece-arrive when move is new',
  chess.includes("isLastDestination&&animateLastMove?'piece-arrive'"));
assert('Chess records animation after rendering',
  chess.includes('lastAnimatedMoveKey=lastMoveKey'));

assert('Music has dedicated 6.0.1 responsive fix',
  musicCss.includes('v6.0.1 — Music responsive stability'));
assert('Music v6.0.2 uses player plus always-visible library',
  musicCss.includes('v6.0.2 — Music anti-flicker')&&musicCss.includes('grid-template-rows:minmax(0,auto) minmax(150px,1fr)'));
assert('Music queue and history scroll inside their cards',
  musicCss.includes('#musicHistory')&&musicCss.includes('overflow-y:auto'));
assert('Music controls wrap instead of disappearing',
  musicCss.includes('flex-wrap:wrap !important'));

assert('Favorite key is based on user id, not room',
  platform.includes('function musicFavoritesKey(userId)'));
assert('Favorite server stores canonical YouTube URL',
  platform.includes('const canonicalUrl=`https://www.youtube.com/watch?v=${videoId}`'));
assert('Favorite record is tied to account owner',
  platform.includes('ownerId:user.id'));
assert('Music can favorite from queue/history',
  music.includes('toggleFavoriteTrack')&&music.includes('addTrackFromHistory'));
assert('Music favorite list says saved to account',
  music.includes('salvo na sua conta'));

assert('Health reports current stable version',health.includes("version:'6.1.2'"));

console.log('ALL V6.0.1 UX FIX TESTS PASSED');
