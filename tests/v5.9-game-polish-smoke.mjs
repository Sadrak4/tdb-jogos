
import fs from 'fs';
import * as Truco from '../server/truco-engine.js';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

// ------------------------------------------------------------------
// TRUCO: winner is known during 1.8s reveal and survives as hand summary.
// ------------------------------------------------------------------
const room={
  code:'TRC59',game:'truco',trucoSeats:2,turnTimer:30,
  players:[
    {id:'A',username:'Alpha'},
    {id:'B',username:'Beta'}
  ]
};
let t=Truco.createState(room);
const first=t.current;
const second=t.activeSeats.find(x=>x!==first);

// Force deterministic non-manilha cards.
t.manilhaRank='5';
t.hands[first]=[{rank:'3',suit:'clubs'}];
t.hands[second]=[{rank:'4',suit:'diamonds'}];

t=Truco.applyTrucoAction(t,first,{type:'PLAY_CARD',cardIdx:0,hidden:false});
t=Truco.applyTrucoAction(t,second,{type:'PLAY_CARD',cardIdx:0,hidden:false});

assert('Truco reveal phase exposes winning seat',t.phase==='resolving'&&t.pendingTrick?.winnerSeat===first);
assert('Truco winning card is retained during reveal',t.pendingTrick?.winningCard?.rank==='3');
assert('Truco reveal still uses 1.8 second delay',t.trickResolveAt-Date.now()>1500);

let v=Truco.viewFor(t,'B','player');
assert('Visible winning card can be shown to both players',v.pendingTrick?.winningCard?.rank==='3');

t=Truco.tick(t,t.trickResolveAt+1);
assert('First resolved trick is summarized',t.lastTrickSummary?.winnerSeat===first);

// Force a second win for same player/team to close the hand.
t.manilhaRank='5';
t.hands[first]=[{rank:'3',suit:'clubs'}];
t.hands[second]=[{rank:'4',suit:'diamonds'}];
t.current=first;
t.phase='playing';
t=Truco.applyTrucoAction(t,first,{type:'PLAY_CARD',cardIdx:0,hidden:false});
t=Truco.applyTrucoAction(t,second,{type:'PLAY_CARD',cardIdx:0,hidden:false});
t=Truco.tick(t,t.trickResolveAt+1);

assert('Truco stores previous hand summary',!!t.lastHandSummary);
assert('Truco hand summary keeps points',Number(t.lastHandSummary?.points||0)>=1);
assert('Truco hand summary has expiry',Number(t.lastHandSummary?.expiresAt||0)>Date.now());

// Hidden card identity must not leak through summaries.
let hidden=Truco.createState(room);
hidden.manilhaRank='5';
const hf=hidden.current;
const hs=hidden.activeSeats.find(x=>x!==hf);
hidden.round=1; // hidden card allowed
hidden.hands[hf]=[{rank:'3',suit:'clubs'}];
hidden.hands[hs]=[{rank:'4',suit:'diamonds'}];
hidden=Truco.applyTrucoAction(hidden,hf,{type:'PLAY_CARD',cardIdx:0,hidden:true});
hidden=Truco.applyTrucoAction(hidden,hs,{type:'PLAY_CARD',cardIdx:0,hidden:false});
const hiddenView=Truco.viewFor(hidden,hs,'player');
if(hiddenView.pendingTrick?.hidden){
  assert('Hidden winning card is redacted in pending summary',hiddenView.pendingTrick.winningCard===null);
}

// ------------------------------------------------------------------
// Static integration checks.
// ------------------------------------------------------------------
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const style=fs.readFileSync(new URL('../style.css',import.meta.url),'utf8');
const chess=fs.readFileSync(new URL('../games/chess/chess-ui.js',import.meta.url),'utf8');
const chessCss=fs.readFileSync(new URL('../games/chess/chess.css',import.meta.url),'utf8');
const bj=fs.readFileSync(new URL('../games/blackjack/blackjack.js',import.meta.url),'utf8');
const bjEngine=fs.readFileSync(new URL('../server/blackjack-engine.js',import.meta.url),'utf8');
const music=fs.readFileSync(new URL('../games/music/music.js',import.meta.url),'utf8');
const musicCss=fs.readFileSync(new URL('../games/music/music.css',import.meta.url),'utf8');
const leave=fs.readFileSync(new URL('../server/http-handlers/rooms/leave.js',import.meta.url),'utf8');
const maintenance=fs.readFileSync(new URL('../server/maintenance-service.js',import.meta.url),'utf8');

assert('Truco client marks winning card',app.includes('round-winner-card'));
assert('Truco client schedules discard motion',app.includes('round-discarding'));
assert('Truco CSS animates cards to discard',style.includes('tdbTrucoToDiscard'));
assert('Truco previous-hand summary exists',app.includes('renderLastHandSummary'));
assert('Truco summary removes itself automatically',app.includes('scheduleTrucoSummaryExpiry'));

assert('Chess has clear turn banner',chess.includes('chessTurnBanner'));
assert('Chess last move destination animates',chess.includes('piece-arrive')&&chessCss.includes('chessPieceArrive'));
assert('Chess clock warns under 30 seconds',chess.includes("classList.toggle('urgent'"));
assert('Chess clock becomes critical under 10 seconds',chess.includes("classList.toggle('critical'"));
assert('Chess result includes match statistics',chess.includes('chess-result-stats'));

assert('Blackjack dealer uses slower readable cadence',bjEngine.includes('dealerNextAt=now+820'));
assert('Blackjack emits dealer stand/bust events',bjEngine.includes("'dealer-bust':'dealer-stand'"));
assert('Blackjack has round summary overlay',bj.includes('roundSummaryHtml'));
assert('Blackjack displays dealer action state',bj.includes('dealerActionText'));
assert('Blackjack split has visual animation',bj.includes('split-arrive'));

assert('Music now playing has artwork',music.includes('musicNowArt'));
assert('Music displays host and control mode',music.includes('musicHostBadge')&&music.includes('musicControlBadge'));
assert('Music has shared progress bar',music.includes('musicProgressFill'));
assert('Music skip-vote progress is visible',music.includes('musicVoteProgress'));
assert('Music reports drift correction',music.includes("showMusicSyncState('Sincronizando…'"));
assert('Music queue transition CSS exists',musicCss.includes('musicQueueItemIn'));

// Five-minute empty-room lifecycle is game-agnostic.
// Competitive games get abandonment handling first, but the empty-room TTL
// branch itself applies to every room, including Music.
assert('Server empty-room TTL remains exactly five minutes',leave.includes('room.emptyExpiresAt=now+5*60*1000'));
assert('Empty-room branch is based on player count, not game type',leave.includes('if(!room.players.length)'));
assert('Maintenance uses generic five-minute room TTL',maintenance.includes('EMPTY_ROOM_TTL_MS=5*60*1000'));
assert('Maintenance expiration branch is generic',maintenance.includes('if(!room.players.length)')&&maintenance.includes("now>=Number(room.emptyExpiresAt||0)"));

console.log('ALL V5.9 GAME POLISH TESTS PASSED');
