
import fs from 'fs';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const chess=fs.readFileSync(new URL('../games/chess/chess-ui.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../core/online-client.js',import.meta.url),'utf8');

const syncStart=app.indexOf("window.addEventListener('tdb-online-sync'");
const syncEnd=app.indexOf("window.addEventListener('tdb-online-status'",syncStart);
const sync=app.slice(syncStart,syncEnd);

// Remove comments before checking forbidden background renders.
const syncNoComments=sync
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .replace(/\/\/.*$/gm,'');

assert('background sync does not render lobby',!/renderLobby\s*\(/.test(syncNoComments));
assert('background sync does not redraw game page',!/drawGamePage\s*\(/.test(syncNoComments));
assert('background sync does not render waiting room',!/renderWaitingRoom\s*\(/.test(syncNoComments));
assert('background sync patches lobby incrementally',/patchLobbyDynamic\s*\(/.test(syncNoComments));
assert('background sync patches room list incrementally',/patchGameRooms\s*\(/.test(syncNoComments));

assert('online chess has explicit playing view',app.includes("state.view='playing-chess'"));
assert('online truco has explicit playing view',app.includes("state.view='playing-truco'"));
assert('bot chess is isolated',app.includes("state.view='bot-chess'"));
assert('bot truco is isolated',app.includes("state.view='bot-truco'"));
assert('bot test stops online bridge',app.includes("OnlineGameBridge.stop();"));

assert('waiting invite button opens modal',app.includes('onclick="openInviteFriendsModal()">Convidar amigos'));
assert('invite modal keeps room open',app.includes('Você continua na sala enquanto envia os convites.'));
assert('incoming invitation toast exists',app.includes('function showRoomInviteToast(invite)'));
assert('invitation toast lasts 10 seconds',app.includes('setTimeout(()=>dismissRoomInviteToast(),10000)'));

assert('chess polling does not force remount',chess.includes("renderChessScreen(!document.getElementById('chessRoot'))"));
assert('recovery snapshot polling slowed down',client.includes("document.hidden?12000:5000"));

console.log('ALL V5.3 UI STATIC TESTS PASSED');
