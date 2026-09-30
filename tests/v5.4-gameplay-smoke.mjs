
import * as Truco from '../server/truco-engine.js';
import * as Chess from '../server/chess-engine.js';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

// ---------------------------------------------------------
// TRUCO 1x1: opposite visual seats, different scoring teams.
// ---------------------------------------------------------
const room1v1={
  code:'TRC-V54-1',
  game:'truco',
  trucoSeats:2,
  turnTimer:0,
  players:[
    {id:'TDB-HOST0001',username:'Host'},
    {id:'TDB-GUEST002',username:'Guest'}
  ]
};

let t=Truco.createState(room1v1);
const host=t.players.find(p=>p.id==='TDB-HOST0001');
const guest=t.players.find(p=>p.id==='TDB-GUEST002');

assert('Truco 1x1 host uses seat 0',host.seat===0);
assert('Truco 1x1 guest uses opposite seat 2',guest.seat===2);
assert('Truco 1x1 players belong to different teams',host.team!==guest.team);

const hostView=Truco.viewFor(t,host.id,'player');
const guestView=Truco.viewFor(t,guest.id,'player');

assert('Host view localSeat is host seat',hostView.localSeat===host.seat);
assert('Guest view localSeat is guest seat',guestView.localSeat===guest.seat);
assert('Host sees exactly own 3 cards',hostView.hands[host.seat].filter(Boolean).length===3);
assert('Guest sees exactly own 3 cards',guestView.hands[guest.seat].filter(Boolean).length===3);
assert('Host cannot see guest cards',hostView.hands[guest.seat].every(x=>x===null));
assert('Guest cannot see host cards',guestView.hands[host.seat].every(x=>x===null));

// Current seat can be either player depending on dealer. Verify non-host can act
// when it is actually the guest's turn.
if(t.current!==guest.seat){
  // Host plays first to hand turn to guest.
  t=Truco.applyTrucoAction(t,host.seat,{type:'PLAY_CARD',cardIdx:0,hidden:false});
}
assert('Turn reaches guest seat',t.current===guest.seat);
const guestCardsBefore=t.hands[guest.seat].length;
t=Truco.applyTrucoAction(t,guest.seat,{type:'PLAY_CARD',cardIdx:0,hidden:false});
assert('Non-host guest can play a card',t.hands[guest.seat].length===guestCardsBefore-1);


// Hidden played cards must not leak their face through the client view.
let hiddenState=Truco.createState(room1v1);
hiddenState.round=1;
const hiddenSeat=hiddenState.current;
hiddenState=Truco.applyTrucoAction(hiddenState,hiddenSeat,{type:'PLAY_CARD',cardIdx:0,hidden:true});
const hiddenViewer=Truco.viewFor(hiddenState,hiddenSeat,'player');
assert('Hidden table card face is redacted by server',hiddenViewer.trickCards[0].hidden===true && hiddenViewer.trickCards[0].card===null);

// ---------------------------------------------------------
// TRUCO 2x2: each player sees only own private hand normally.
// ---------------------------------------------------------
const room2v2={
  code:'TRC-V54-2',
  game:'truco',
  trucoSeats:4,
  turnTimer:0,
  players:[
    {id:'TDB-A0000001',username:'A'},
    {id:'TDB-B0000002',username:'B'},
    {id:'TDB-C0000003',username:'C'},
    {id:'TDB-D0000004',username:'D'}
  ]
};

let t4=Truco.createState(room2v2);
for(const player of t4.players){
  const view=Truco.viewFor(t4,player.id,'player');
  for(const seat of t4.activeSeats){
    if(seat===player.seat){
      assert(`2x2 ${player.username} sees own hand`,view.hands[seat].filter(Boolean).length===3);
    }else{
      assert(`2x2 ${player.username} does not see seat ${seat}`,view.hands[seat].every(x=>x===null));
    }
  }
}

// ---------------------------------------------------------
// Mão de 11: partners can see each other's hands only then.
// ---------------------------------------------------------
t4.scores=[11,7];
t4.eleven={team:0,pending:true,responses:{}};
t4.phase='eleven';
const teamZero=t4.players.filter(p=>p.team===0);
const elevenView=Truco.viewFor(t4,teamZero[0].id,'player');
assert('Mão de 11 reveals partner hand',elevenView.hands[teamZero[1].seat].filter(Boolean).length===3);

// ---------------------------------------------------------
// Chess engine baseline still accepts legal moves.
// ---------------------------------------------------------
const chessRoom={
  code:'XDR-V54',
  chessClock:0,
  players:[
    {id:'TDB-WHITE001',username:'White'},
    {id:'TDB-BLACK002',username:'Black'}
  ]
};
let chess=Chess.createState({
  room:chessRoom,
  whitePlayer:chessRoom.players[0],
  blackPlayer:chessRoom.players[1]
});
const e2e4=Chess.legalMovesFrom(chess,6,4).find(m=>m.to.r===4&&m.to.c===4);
assert('Chess e2-e4 remains legal',!!e2e4);
chess=Chess.applyMove(chess,e2e4,'queen');
assert('Chess turn changes after legal move',chess.turn==='black');

console.log('ALL V5.4 GAMEPLAY TESTS PASSED');
