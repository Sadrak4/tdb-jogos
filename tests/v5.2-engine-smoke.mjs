
import * as Chess from '../server/chess-engine.js';
import * as Truco from '../server/truco-engine.js';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}
function moveByCoords(state,fr,fc,tr,tc,promotion='queen'){
  const m=Chess.legalMovesFrom(state,fr,fc).find(x=>x.to.r===tr&&x.to.c===tc);
  if(!m) throw new Error(`Movimento não encontrado: ${fr},${fc} -> ${tr},${tc}`);
  return Chess.applyMove(state,m,promotion);
}

// ---------------------------------------------------------
// Chess: no automatic draw by repetition
// ---------------------------------------------------------
const chessRoom={
  code:'XDR-V52',
  game:'chess',
  chessClock:0,
  players:[{id:'TDB-A0000001',username:'Alice'},{id:'TDB-B0000002',username:'Bruno'}]
};
let cs=Chess.createState({
  room:chessRoom,
  whitePlayer:chessRoom.players[0],
  blackPlayer:chessRoom.players[1]
});

// Repeat initial position several times with knights.
for(let cycle=0;cycle<3;cycle++){
  cs=moveByCoords(cs,7,6,5,5); // Ng1-f3
  cs=moveByCoords(cs,0,6,2,5); // Ng8-f6
  cs=moveByCoords(cs,5,5,7,6); // Nf3-g1
  cs=moveByCoords(cs,2,5,0,6); // Nf6-g8
}
assert('chess repetition does not auto-draw',cs.status==='playing');

// ---------------------------------------------------------
// Chess: promotion choice
// ---------------------------------------------------------
let ps=Chess.createState({
  room:chessRoom,
  whitePlayer:chessRoom.players[0],
  blackPlayer:chessRoom.players[1]
});
ps.board=Array.from({length:8},()=>Array(8).fill(null));
ps.board[7][4]={type:'king',color:'white',moved:false};
ps.board[0][4]={type:'king',color:'black',moved:false};
ps.board[1][0]={type:'pawn',color:'white',moved:true};
ps.turn='white';
ps.status='playing';
ps.enPassant=null;
ps.castling={white:{king:false,queen:false},black:{king:false,queen:false}};
ps.selectedSquare=null;
ps.legalMoves=[];
const promo=Chess.legalMovesFrom(ps,1,0).find(m=>m.to.r===0&&m.to.c===0&&m.promotion);
assert('promotion move exists',!!promo);
ps=Chess.applyMove(ps,promo,'knight');
assert('promotion can choose knight',ps.board[0][0]?.type==='knight');
assert('promotion notation records knight',String(ps.moveHistory.at(-1)?.notation||'').includes('=C'));

// ---------------------------------------------------------
// Truco: Mão de 11 partnership visibility + team decision
// ---------------------------------------------------------
const trucoRoom={
  code:'TRC-V52',
  game:'truco',
  trucoSeats:4,
  turnTimer:1,
  players:[
    {id:'TDB-A0000001',username:'Alice'},
    {id:'TDB-B0000002',username:'Bruno'},
    {id:'TDB-C0000003',username:'Carla'},
    {id:'TDB-D0000004',username:'Diego'}
  ]
};
let ts=Truco.createState(trucoRoom);

// Force a Mão de 11 for team 0 while preserving the dealt hand.
ts.scores=[11,7];
ts.eleven={team:0,pending:true,responses:{}};
ts.ironHand=false;
ts.phase='eleven';
let view=Truco.viewFor(ts,'TDB-A0000001','player');
assert('Mão 11 player sees own cards',view.hands[0].every(Boolean));
assert('Mão 11 player sees partner cards',view.hands[2].every(Boolean));
assert('Mão 11 player does not see rivals',view.hands[1].every(x=>x===null)&&view.hands[3].every(x=>x===null));

let eleven=Truco.applyTrucoAction(ts,0,{type:'ELEVEN_DECISION',play:true});
assert('Mão 11 waits for teammate vote',eleven.phase==='eleven'&&eleven.eleven?.pending===true);
eleven=Truco.applyTrucoAction(eleven,2,{type:'ELEVEN_DECISION',play:true});
assert('Mão 11 both accepting starts hand at 3',eleven.phase==='playing'&&eleven.handValue===3&&eleven.eleven?.pending===false);

// ---------------------------------------------------------
// Truco: Mão de Ferro hides every private card
// ---------------------------------------------------------
let iron=structuredClone(ts);
iron.scores=[11,11];
iron.eleven=null;
iron.ironHand=true;
iron.phase='playing';
view=Truco.viewFor(iron,'TDB-A0000001','player');
assert('Mão de Ferro hides own and partner cards',iron.activeSeats.every(seat=>view.hands[seat].every(x=>x===null)));

// ---------------------------------------------------------
// Truco: server-side timeout auto-plays an open card
// ---------------------------------------------------------
let timed=Truco.createState(trucoRoom);
timed.turnDeadlineAt=Date.now()-50;
const current=timed.current;
const before=(timed.hands[current]||[]).length;
timed=Truco.tick(timed,Date.now());
const after=(timed.hands[current]||[]).length;
assert('Truco server timer auto-plays card',after===before-1);
assert('Truco timeout action recorded',timed.lastAutoAction?.type==='timeout-card');

// ---------------------------------------------------------
// Truco: spectator never receives hands
// ---------------------------------------------------------
const spectator=Truco.viewFor(timed,'spectator','spectator');
assert('Truco spectator sees no private cards',spectator.activeSeats.every(seat=>spectator.hands[seat].every(x=>x===null)));

console.log('ALL V5.2 ENGINE TESTS PASSED');
