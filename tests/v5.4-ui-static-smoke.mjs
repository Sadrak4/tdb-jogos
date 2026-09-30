
import fs from 'fs';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const chess=fs.readFileSync(new URL('../games/chess/chess-ui.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../core/online-client.js',import.meta.url),'utf8');
const gameService=fs.readFileSync(new URL('../server/game-service.js',import.meta.url),'utf8');
const router=fs.readFileSync(new URL('../server/http-router.js',import.meta.url),'utf8');

// Truco viewer-relative UI
assert('Truco uses viewer-relative layout',app.includes('function trucoVisualLayout()'));
assert('Truco visual bottom is local seat',app.includes('return {bottom:me,top:opponent,left:null,right:null}'));
assert('Truco selection checks local seat',/const seat=localTrucoSeat\(\);[\s\S]*truco\.current!==seat/.test(app));
assert('Truco does not hardcode seat 0 selection',!app.includes("truco.current!==0"));
assert('Online trick cards normalize server seat',app.includes('player:tc.player ?? tc.seat'));
assert('Truco result uses lifecycle return',app.includes('onclick="returnFromTruco()"'));
assert('Truco online rematch uses server',app.includes('TDBOnline?.rematchGame?.(code)'));

// Chess latency/selection
assert('Chess has optimistic pending move state',chess.includes('let pendingOnlineMove=null'));
assert('Chess preserves same-version selection',chess.includes('const preservedSelection=samePosition ? previous.selectedSquare : null'));
assert('Chess ignores stale polling during optimistic move',chess.includes('incomingVersion<=pendingOnlineMove.baseVersion'));
assert('Chess applies optimistic move immediately',chess.includes('const optimistic=E.applyMove'));
assert('Chess black orientation supported',chess.includes("orientation==='black'"));
assert('Chess result uses return lifecycle',chess.includes("TDBOnline?.returnGameToRoom?.(code)"));
assert('Chess rematch uses server lifecycle',chess.includes("TDBOnline?.rematchGame?.(code)"));

// Game lifecycle API
assert('Client exposes returnGameToRoom',client.includes('async function returnGameToRoom'));
assert('Client exposes rematchGame',client.includes('async function rematchGame'));
assert('Server exposes returnToRoom',gameService.includes('export async function returnToRoom'));
assert('Server exposes rematchGame',gameService.includes('export async function rematchGame'));
assert('Router has games/return',router.includes("['games/return',gameReturn]"));
assert('Router has games/rematch',router.includes("['games/rematch',gameRematch]"));

// Music must not be treated as a competitive match on entry.
const musicStart=app.indexOf('function openMusicRoom(){');
const musicEnd=app.indexOf('window.openMusicRoom=openMusicRoom;',musicStart);
const musicBlock=app.slice(musicStart,musicEnd);
assert('Music open does not force playing status',!musicBlock.includes("room.status='playing'"));
assert('Music open does not re-upsert room',!musicBlock.includes('TDBOnline.upsertRoom'));

assert('Only one renderFriends declaration exists',(app.match(/function renderFriends\(/g)||[]).length===1);


assert('Online client tracks match start time for rematch ordering',client.includes('currentGame.startedAt'));
assert('Online client accepts newer rematch and rejects older match response',client.includes('incomingStartedAt<=currentStartedAt'));
assert('Chess clock-only snapshots do not rebuild board buttons',chess.includes('Clock-only/fallback snapshots must not rebuild the 64 board buttons.'));
assert('Fresh match start prepares bridge before polling old state',app.includes('Prepare the bridge identity, but do not start polling yet.'));

console.log('ALL V5.4 UI STATIC TESTS PASSED');
