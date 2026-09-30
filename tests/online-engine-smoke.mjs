
import * as Chess from '../server/chess-engine.js';
import * as Truco from '../server/truco-engine.js';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const roomChess={
  code:'XDR-TEST',game:'chess',chessClock:600,chessColor:'white',
  players:[{id:'u1',username:'A'},{id:'u2',username:'B'}]
};
let cs=Chess.createState({room:roomChess,whitePlayer:roomChess.players[0],blackPlayer:roomChess.players[1]});
assert('chess 32 pieces',cs.board.flat().filter(Boolean).length===32);
const e2e4=Chess.legalMovesFrom(cs,6,4).find(m=>m.to.r===4&&m.to.c===4);
assert('e2-e4 legal',!!e2e4);
cs=Chess.applyMove(cs,e2e4);
assert('chess turn black',cs.turn==='black');

const roomTruco={
  code:'TRC-TEST',game:'truco',trucoSeats:4,
  players:[
    {id:'u1',username:'A'},
    {id:'u2',username:'B'},
    {id:'u3',username:'C'},
    {id:'u4',username:'D'}
  ]
};
let ts=Truco.createState(roomTruco);
assert('truco four players',ts.players.length===4);
assert('truco each hand 3',ts.activeSeats.every(s=>ts.hands[s].length===3));
const current=ts.current;
ts=Truco.applyTrucoAction(ts,current,{type:'PLAY_CARD',cardIdx:0,hidden:false});
assert('truco next turn',ts.current!==current || ts.round>0);
const spectator=Truco.viewFor(ts,'spectator','spectator');
assert('spectator sees no private cards',spectator.activeSeats.every(s=>spectator.hands[s].every(c=>c===null)));
console.log('ALL ONLINE ENGINE SMOKE TESTS PASSED');
