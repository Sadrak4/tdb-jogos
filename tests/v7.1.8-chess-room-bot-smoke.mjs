import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('app.js');
const chessUi=read('games/chess/chess-ui.js');
const roomUpsert=read('server/http-handlers/rooms/upsert.js');
const gameService=read('server/game-service.js');
const css=read('ui/gameplay-fixes.css');
const health=read('server/http-handlers/health.js');

assert.equal(pkg.version,'7.1.8');
assert.match(health,/version:'7\.1\.8'/);

assert.match(app,/function openEditRoomRules\(\)/);
assert.match(app,/function saveRoomRules\(\)/);
assert.match(app,/id="chessBotDifficulty"/);
assert.match(app,/easy:\{label:'Fácil'/);
assert.match(app,/medium:\{label:'Médio'/);
assert.match(app,/hard:\{label:'Difícil'/);
assert.match(app,/Editar regras/);

assert.match(roomUpsert,/chessBotDifficulty/);
assert.match(roomUpsert,/Não é possível alterar as regras durante uma partida/);
assert.match(roomUpsert,/\[0,60,180,300,600,900\]/);

assert.match(chessUi,/BOT_VISUAL_THINK_MS=1800/);
assert.match(chessUi,/settleLocalClockBeforeMove/);
assert.match(chessUi,/E\.chooseBotMove/);
assert.match(gameService,/state\.serverClockAt=Date\.now\(\)/);

assert.match(css,/TDB v7\.1\.8 — Chess room \/ BOT AI \/ reliable sidebar toggle/);
assert.match(css,/width:44px!important/);
assert.match(css,/pointer-events:auto!important/);

// Functional smoke for the three bot levels: every returned move must be legal.
globalThis.window={};
await import('../games/chess/chess-engine.js');
const E=globalThis.window.TDBChessEngine;
assert.equal(typeof E.chooseBotMove,'function');
const state=E.createState({
  room:{code:'TEST-718',chessClock:600,chessBotDifficulty:'easy'},
  whitePlayer:{id:'A',username:'A'},
  blackPlayer:{id:'B',username:'B'}
});
const legal=E.allLegalMoves(state,'white');
const key=(m)=>`${m.from.r},${m.from.c}>${m.to.r},${m.to.c}`;
const legalKeys=new Set(legal.map(key));
for(const [difficulty,budget] of [['easy',80],['medium',220],['hard',420]]){
  const move=E.chooseBotMove(state,'white',difficulty,{timeBudgetMs:budget});
  assert.ok(move,`BOT ${difficulty} precisa escolher uma jogada`);
  assert.ok(legalKeys.has(key(move)),`BOT ${difficulty} precisa escolher uma jogada legal`);
}

console.log('v7.1.8 chess room/bot smoke: OK');
