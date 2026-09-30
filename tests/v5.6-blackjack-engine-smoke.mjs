import * as BJ from '../server/blackjack-engine.js';
function assert(name,condition){if(!condition)throw new Error(`FAIL: ${name}`);console.log('OK',name)}

const host={id:'TDB-BJHOST01',username:'Host',avatar:'H',connection:'online'};
const guest={id:'TDB-BJGUEST2',username:'Guest',avatar:'G',connection:'online'};
const late={id:'TDB-BJLATE03',username:'Late',avatar:'L',connection:'online'};
const room={code:'BLJ-TEST',game:'blackjack',ownerId:host.id,owner:host.username,status:'playing',blackjackTurnTimer:20,blackjackMinBet:25,blackjackStartingChips:1000,blackjackDecks:1,players:[host]};

let s=BJ.createState(room);
assert('blackjack starts in betting phase',s.phase==='betting');
assert('one real player can start table',s.players.length===1&&s.players[0].id===host.id);
assert('starting bankroll is configured',s.players[0].bankroll===1000);
assert('soft 17 is detected',BJ.handValue([{rank:'A',suit:'spades'},{rank:'6',suit:'hearts'}]).total===17&&BJ.handValue([{rank:'A',suit:'spades'},{rank:'6',suit:'hearts'}]).soft===true);
assert('ace drops to one when needed',BJ.handValue([{rank:'A',suit:'spades'},{rank:'7',suit:'hearts'},{rank:'9',suit:'clubs'}]).total===17);

s=BJ.applyAction(s,host.id,{type:'PLACE_BET',amount:25},room);
assert('single ready player automatically receives cards',s.phase==='playerTurns'||s.phase==='dealerTurn');
assert('bet is reserved from bankroll',s.players[0].bankroll===975);
assert('player receives two initial cards',s.players[0].hands[0].cards.length===2);
assert('dealer receives two initial cards',s.dealer.cards.length===2);

let v=BJ.viewFor(s,host.id,'player');
if(s.phase==='playerTurns'){
  assert('dealer hole card is hidden from player',v.dealer.cards[1]===null);
  assert('local player identity is included',v.localPlayerId===host.id);
}


// Three players take turns sequentially against the same dealer.
const room3={...room,code:'BLJ-3PLY',players:[host,guest,late]};
let three=BJ.createState(room3);
three=BJ.applyAction(three,host.id,{type:'PLACE_BET',amount:25},room3);
three=BJ.applyAction(three,guest.id,{type:'PLACE_BET',amount:25},room3);
const filler=Array.from({length:44},(_,i)=>({rank:'2',suit:['clubs','diamonds','hearts','spades'][i%4]}));
three.deck=[...filler,
  {rank:'6',suit:'hearts'},      // dealer second
  {rank:'7',suit:'clubs'},      // late second
  {rank:'8',suit:'diamonds'},   // guest second
  {rank:'6',suit:'spades'},     // host second
  {rank:'10',suit:'clubs'},     // dealer first
  {rank:'9',suit:'hearts'},     // late first
  {rank:'7',suit:'spades'},     // guest first
  {rank:'5',suit:'clubs'}       // host first (top of shoe / popped first)
];
three=BJ.applyAction(three,late.id,{type:'PLACE_BET',amount:25},room3);
assert('three-player round begins with first seat',three.currentPlayerId===host.id);
three=BJ.applyAction(three,host.id,{type:'STAND'},room3);
assert('turn advances to second player',three.currentPlayerId===guest.id);
three=BJ.applyAction(three,guest.id,{type:'STAND'},room3);
assert('turn advances to third player',three.currentPlayerId===late.id);
three=BJ.applyAction(three,late.id,{type:'STAND'},room3);
assert('dealer acts only after all three players finish',three.phase==='dealerTurn');

// New player entering during a live hand waits for next round.
const liveRoom={...room,players:[host,guest]};
let synced=structuredClone(s);
BJ.syncRoomPlayers(synced,liveRoom,{duringRound:true});
const joined=synced.players.find(p=>p.id===guest.id);
assert('mid-round joiner is added safely',!!joined);
assert('mid-round joiner waits next round',joined.waitingNextRound===true);

// Split same-value cards (10-value faces count as same value too).
let splitState=BJ.createState({...room,players:[host]});
splitState.phase='playerTurns';splitState.currentPlayerId=host.id;splitState.turnOrder=[host.id];splitState.turnIndex=0;
const sp=splitState.players[0];sp.bankroll=950;sp.bet=25;sp.hands=[{id:'H1',cards:[{rank:'8',suit:'clubs'},{rank:'8',suit:'hearts'}],bet:25,status:'playing',fromSplit:false,splitAces:false,doubled:false,actions:0,result:null,payout:0}];sp.activeHand=0;
splitState.deck=[{rank:'2',suit:'clubs'},{rank:'3',suit:'hearts'},{rank:'4',suit:'spades'}];
splitState=BJ.applyAction(splitState,host.id,{type:'SPLIT'},room);
assert('split creates two independent hands',splitState.players[0].hands.length===2);
assert('split reserves a second equal bet',splitState.players[0].bankroll===925);
assert('split deals one new card to each hand',splitState.players[0].hands.every(h=>h.cards.length===2));

// Double down: doubles wager, exactly one card, then ends hand.
let doubleState=BJ.createState({...room,players:[host]});
doubleState.phase='playerTurns';doubleState.currentPlayerId=host.id;doubleState.turnOrder=[host.id];doubleState.turnIndex=0;
const dp=doubleState.players[0];dp.bankroll=950;dp.bet=25;dp.hands=[{id:'D1',cards:[{rank:'5',suit:'clubs'},{rank:'6',suit:'hearts'}],bet:25,status:'playing',fromSplit:false,splitAces:false,doubled:false,actions:0,result:null,payout:0}];dp.activeHand=0;
doubleState.deck=[{rank:'10',suit:'spades'}];
doubleState=BJ.applyAction(doubleState,host.id,{type:'DOUBLE'},room);
assert('double doubles hand wager',doubleState.players[0].hands[0].bet===50);
assert('double takes exactly one extra card',doubleState.players[0].hands[0].cards.length===3);
assert('double reserves extra wager',doubleState.players[0].bankroll===925);
assert('double automatically ends player hand',doubleState.players[0].hands[0].status!=='playing');

// Split aces receive only one extra card per hand and auto-stand.
let aceState=BJ.createState({...room,players:[host]});
aceState.phase='playerTurns';aceState.currentPlayerId=host.id;aceState.turnOrder=[host.id];aceState.turnIndex=0;
const ap=aceState.players[0];ap.bankroll=950;ap.bet=25;ap.hands=[{id:'A1',cards:[{rank:'A',suit:'clubs'},{rank:'A',suit:'hearts'}],bet:25,status:'playing',fromSplit:false,splitAces:false,doubled:false,actions:0,result:null,payout:0}];ap.activeHand=0;
aceState.deck=[{rank:'9',suit:'spades'},{rank:'K',suit:'diamonds'}];
aceState=BJ.applyAction(aceState,host.id,{type:'SPLIT'},room);
assert('split aces create two hands',aceState.players[0].hands.length===2);
assert('split aces auto-stand after one card',aceState.players[0].hands.every(h=>h.status==='stand'));

// Dealer must stand on soft 17 (A+6), so no extra card is consumed.
let dealerState=BJ.createState({...room,players:[host]});
dealerState.phase='dealerTurn';dealerState.dealer={cards:[{rank:'A',suit:'spades'},{rank:'6',suit:'hearts'}],revealed:true,value:null,bust:false};dealerState.dealerNextAt=Date.now()-1;
const hp=dealerState.players[0];hp.bankroll=975;hp.bet=25;hp.hands=[{id:'P1',cards:[{rank:'10',suit:'clubs'},{rank:'8',suit:'diamonds'}],bet:25,status:'stand',fromSplit:false,splitAces:false,doubled:false,actions:0,result:null,payout:0}];
dealerState.deck=[{rank:'K',suit:'clubs'}];
const deckBefore=dealerState.deck.length;
let tick=BJ.tick(dealerState,room,Date.now());dealerState=tick.state;
assert('dealer stands on soft 17',dealerState.deck.length===deckBefore);
assert('soft 17 proceeds to round result',dealerState.phase==='roundEnd');

// Natural blackjack pays 3:2 profit (2.5x total return after wager was reserved).
let natural=BJ.createState({...room,players:[host]});
natural.phase='dealerTurn';natural.dealer={cards:[{rank:'10',suit:'spades'},{rank:'7',suit:'hearts'}],revealed:true,value:null,bust:false};natural.dealerNextAt=Date.now()-1;
const np=natural.players[0];np.bankroll=975;np.bet=25;np.hands=[{id:'N1',cards:[{rank:'A',suit:'clubs'},{rank:'K',suit:'diamonds'}],bet:25,status:'blackjack',fromSplit:false,splitAces:false,doubled:false,actions:0,result:null,payout:0}];
natural=BJ.tick(natural,room,Date.now()).state;
assert('natural blackjack is paid 3 to 2',natural.players[0].hands[0].payout===62.5);
assert('natural blackjack profit updates bankroll',natural.players[0].bankroll===1037.5);

// Late joiner becomes active once round-end countdown moves to betting.
let next=structuredClone(natural);next.nextRoundAt=Date.now()-1;
const nextRoom={...room,players:[host,late]};
next=BJ.tick(next,nextRoom,Date.now()).state;
const lateNext=next.players.find(p=>p.id===late.id);
assert('late joiner exists next round',!!lateNext);
assert('late joiner becomes eligible next betting phase',lateNext.waitingNextRound===false&&next.phase==='betting');

console.log('ALL V5.6 BLACKJACK ENGINE TESTS PASSED');
