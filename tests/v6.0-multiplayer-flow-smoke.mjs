
import fs from 'fs';
import * as Chess from '../server/chess-engine.js';
import * as Truco from '../server/truco-engine.js';
import * as Blackjack from '../server/blackjack-engine.js';

function assert(name,condition){
  if(!condition)throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}
function read(rel){return fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8')}

// ---------------------------------------------------------
// 4-client Truco simulation: independent private views.
// ---------------------------------------------------------
const trucoPlayers=[
  {id:'U1',username:'Alpha',ready:true,connection:'online'},
  {id:'U2',username:'Beta',ready:true,connection:'online'},
  {id:'U3',username:'Gamma',ready:true,connection:'online'},
  {id:'U4',username:'Delta',ready:true,connection:'online'}
];
const trRoom={code:'TR6',game:'truco',trucoSeats:4,turnTimer:30,players:trucoPlayers};
let ts=Truco.createState(trRoom);
assert('Truco simulates four connected clients',ts.players.length===4);

for(const u of trucoPlayers){
  const view=Truco.viewFor(ts,u.id,'player');
  const ownSeat=Truco.seatForUser(ts,u.id);
  assert(`Truco ${u.username} sees own three cards`,view.hands[ownSeat].filter(Boolean).length===3);
  const others=view.activeSeats.filter(s=>s!==ownSeat);
  assert(`Truco ${u.username} cannot see rival private hands`,others.every(seat=>view.hands[seat].every(c=>c===null)));
}

const firstSeat=ts.current;
const firstUser=ts.players.find(p=>p.seat===firstSeat);
ts=Truco.applyTrucoAction(ts,firstSeat,{type:'PLAY_CARD',cardIdx:0,hidden:false});
assert('Truco action advances authoritative turn',ts.current!==firstSeat);
assert('Truco first played card is public to another client',
  Truco.viewFor(ts,trucoPlayers.find(u=>u.id!==firstUser.id).id,'player').trickCards.length===1);

// ---------------------------------------------------------
// 2-client Chess simulation: legal move shared by both.
// ---------------------------------------------------------
const chessRoom={code:'CH6',game:'chess',chessClock:300,players:[
  {id:'C1',username:'White',ready:true,connection:'online'},
  {id:'C2',username:'Black',ready:true,connection:'online'}
]};
let cs=Chess.createState({room:chessRoom,whitePlayer:chessRoom.players[0],blackPlayer:chessRoom.players[1]});
const e2e4=Chess.legalMovesFrom(cs,6,4).find(m=>m.to.r===4&&m.to.c===4);
assert('Chess client 1 has legal e2-e4',!!e2e4);
cs=Chess.applyMove(cs,e2e4);
assert('Chess authoritative state reaches client 2 turn',cs.turn==='black');
assert('Chess moved piece is visible in shared board',cs.board[4][4]?.type==='pawn');

// ---------------------------------------------------------
// 3-client Blackjack simulation: all against one dealer.
// ---------------------------------------------------------
const bPlayers=[
  {id:'B1',username:'One',ready:true,connection:'online'},
  {id:'B2',username:'Two',ready:true,connection:'online'},
  {id:'B3',username:'Three',ready:true,connection:'online'}
];
const bRoom={
  code:'BJ6',game:'blackjack',ownerId:'B1',status:'playing',
  blackjackTurnTimer:20,blackjackMinBet:25,blackjackStartingChips:1000,
  blackjackDecks:1,players:bPlayers
};
let bs=Blackjack.createState(bRoom);
bs=Blackjack.applyAction(bs,'B1',{type:'PLACE_BET',amount:25},bRoom);
bs=Blackjack.applyAction(bs,'B2',{type:'PLACE_BET',amount:25},bRoom);
bs=Blackjack.applyAction(bs,'B3',{type:'PLACE_BET',amount:25},bRoom);
assert('Blackjack starts a three-client round',bs.players.every(p=>p.hands.length===1));
assert('Blackjack dealer has one private hole card for every client',
  bPlayers.every(u=>{
    const v=Blackjack.viewFor(bs,u.id,'player');
    return v.dealer.cards.length===2&&(v.phase==='dealerTurn'||v.phase==='roundEnd'||v.dealer.cards[1]===null);
  }));
assert('Blackjack each client sees colleagues public cards',
  bPlayers.every(u=>{
    const v=Blackjack.viewFor(bs,u.id,'player');
    return v.players.filter(p=>p.id!==u.id).every(p=>p.hands[0]?.cards?.filter(Boolean).length===2);
  }));

// ---------------------------------------------------------
// Flow-level static checks: reconnect -> return -> rematch.
// ---------------------------------------------------------
const leave=read('server/http-handlers/rooms/leave.js');
const maintenance=read('server/maintenance-service.js');
const reconnect=read('server/http-handlers/reconnect/index.js');
const gameService=read('server/game-service.js');
const start=read('server/http-handlers/games/start.js');
const platform=read('server/platform-service.js');

assert('Disconnect flow keeps 90-second reconnect window',maintenance.includes('RECONNECT_GRACE_MS=90_000'));
assert('Reconnect service restores the player as online',maintenance.includes("p.connection='online'")&&maintenance.includes('delete p.reconnectUntil'));
assert('Return-to-room lifecycle resets ready state',gameService.includes("ready:room.game==='music'"));
assert('Fresh game waits for all players ready',start.includes("some(p=>!p.ready)"));
assert('Party caps coordinated clients at four',platform.includes('PARTY_MAX=4'));

console.log('ALL V6.0 MULTI-CLIENT FLOW TESTS PASSED');
