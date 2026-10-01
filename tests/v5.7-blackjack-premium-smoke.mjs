
import fs from 'fs';
import * as BJ from '../server/blackjack-engine.js';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const ui=fs.readFileSync(new URL('../games/blackjack/blackjack.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../games/blackjack/blackjack.css',import.meta.url),'utf8');
const engine=fs.readFileSync(new URL('../server/blackjack-engine.js',import.meta.url),'utf8');

assert('premium blackjack keeps desktop page inside viewport',css.includes('overflow:hidden')&&css.includes('100dvh'));
assert('premium layout has fixed compact action dock',css.includes('grid-template-rows:minmax(0,1fr) 86px'));
assert('colleague cards are not rendered with mini flag',ui.includes("cardHtml(c,{mini:false})"));
assert('player chip bank exists',ui.includes('bj-player-chip-bank'));
assert('table wager spots exist',ui.includes('bj-wager-spot'));
assert('chip flight animation exists',ui.includes('animateChipFlight'));
assert('bet event queues chip animation',ui.includes("['bet','double','split'].includes(e.type)"));
assert('payout event queues chip return',ui.includes("e.type==='payout'"));
assert('premium chip selector exists',ui.includes('bj-chip-choice'));
assert('dealer shoe exists',ui.includes('bj-shoe'));
assert('server bet event includes amount',engine.includes('{playerId:p.id,amount}'));
assert('server double event includes added amount',engine.includes('amount:addedBet'));
assert('server split event includes added amount',engine.includes('amount:bet,totalBet:bet*2'));
assert('server payout event exists',engine.includes("log(state,'payout'"));

const room={
  code:'BJ57',
  game:'blackjack',
  ownerId:'A',
  players:[
    {id:'A',username:'Alpha'},
    {id:'B',username:'Beta'}
  ],
  blackjackStartingChips:1000,
  blackjackMinBet:25,
  blackjackTurnTimer:20,
  blackjackDecks:1
};

let state=BJ.createState(room);
state=BJ.applyAction(state,'A',{type:'PLACE_BET',amount:25},room,1);
state=BJ.applyAction(state,'B',{type:'PLACE_BET',amount:25},room,2);

const viewA=BJ.viewFor(state,'A','player');
const beta=viewA.players.find(p=>p.id==='B');
assert('other player hand is publicly visible in blackjack',beta.hands.length===1&&beta.hands[0].cards.filter(Boolean).length===2);

const privacyState=structuredClone(state);
privacyState.phase='playerTurns';
privacyState.dealer.revealed=false;
privacyState.dealer.cards=[
  {id:'dealer-open',rank:'9',suit:'spades'},
  {id:'dealer-hole',rank:'K',suit:'hearts'}
];
const privacyView=BJ.viewFor(privacyState,'A','player');
assert('dealer hole card is still hidden',privacyView.dealer.cards.length===2&&privacyView.dealer.cards[1]===null);

console.log('ALL V5.7 BLACKJACK PREMIUM TESTS PASSED');
