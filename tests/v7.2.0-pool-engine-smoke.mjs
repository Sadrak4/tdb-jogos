import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  rackBalls, simulateShot, createState, applyAction, tick, viewFor, tableSpec
} from '../server/pool-engine.js';

const room={
  code:'SNK-TEST', game:'pool', poolTurnTimer:45, poolAimAssist:'short', poolAllowSpectators:true,
  players:[
    {id:'TDB-A',username:'Alice'},
    {id:'TDB-B',username:'Bob'}
  ]
};

const balls=rackBalls();
assert.equal(balls.length,16,'8-ball rack must contain cue + 15 object balls');
assert.equal(new Set(balls.map(b=>b.id)).size,16,'ball IDs must be unique');
assert.ok(balls.some(b=>b.id===8),'rack must contain the 8 ball');
const rear=balls.filter(b=>b.id!==0).sort((a,b)=>b.x-a.x).slice(0,5).sort((a,b)=>a.y-b.y);
const group=id=>id>=1&&id<=7?'solid':id>=9&&id<=15?'stripe':id===8?'eight':'cue';
assert.notEqual(group(rear[0].id),group(rear[rear.length-1].id),'rear rack corners must contain opposite groups');
assert.equal(tableSpec().width,2);
assert.equal(tableSpec().height,1);

const simA=simulateShot(balls,0,0.72);
const simB=simulateShot(balls,0,0.72);
assert.ok(simA.duration>0 && simA.duration<=14,'shot must settle in bounded time');
assert.ok(Number.isInteger(simA.firstHit),'break shot should hit an object ball');
for(const b of simA.balls){
  assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y),'physics cannot create NaN positions');
}
assert.deepEqual(
  simA.balls.map(b=>[b.id,Number(b.x.toFixed(7)),Number(b.y.toFixed(7)),b.pocketed]),
  simB.balls.map(b=>[b.id,Number(b.x.toFixed(7)),Number(b.y.toFixed(7)),b.pocketed]),
  'same shot input should settle to the same authoritative result'
);

const state=createState(room);
assert.equal(state.game,'pool');
assert.equal(state.players.length,2);
assert.equal(state.turnPlayerId,'TDB-A');
assert.equal(state.turnTimer,45);
assert.equal(viewFor(state,'TDB-A','player').canShoot,true);
assert.equal(viewFor(state,'TDB-X','spectator').canShoot,false);

const after=applyAction(state,'TDB-A',{type:'SHOOT',angle:0,power:.72},state.startedAt+20);
assert.ok(after.version>state.version,'a shot must advance state version');
assert.ok(after.lastShot?.shotId,'shot metadata must be stored for replay');
assert.ok(Array.isArray(after.lastShot.soundEvents),'shot must expose bounded sound events for synchronized animation');
assert.ok(after.readyAt>=after.lastShot.startedAt,'next action gate must cover the shot animation');
assert.throws(()=>applyAction(after,after.turnPlayerId,{type:'SHOOT',angle:0,power:.4},after.lastShot.startedAt+10),/Aguarde as bolas pararem/);

// A legal called 8-ball must end the match for the shooter.
let winState=createState({...room,poolTurnTimer:0});
winState.breakShot=false;winState.tableOpen=false;winState.players[0].group='solid';winState.players[1].group='stripe';
for(const b of winState.balls){if((b.id>=1&&b.id<=7)||(b.id>=9&&b.id<=15))b.pocketed=true}
Object.assign(winState.balls.find(b=>b.id===0),{x:1,y:.8,pocketed:false});
Object.assign(winState.balls.find(b=>b.id===8),{x:1,y:.48,pocketed:false});
winState.readyAt=0;
winState=applyAction(winState,'TDB-A',{type:'CALL_POCKET',pocket:1},Date.now());
winState.readyAt=0;
winState=applyAction(winState,'TDB-A',{type:'SHOOT',angle:-Math.PI/2,power:.35},Date.now()+1);
assert.equal(winState.status,'finished');
assert.equal(winState.winnerId,'TDB-A');
assert.equal(winState.finishReason,'eight-ball');

const timed=createState(room);
timed.turnDeadlineAt=timed.startedAt-1;
const timedOut=tick(timed,timed.startedAt+1);
assert.equal(timedOut.turnPlayerId,'TDB-B','timeout must pass the turn');
assert.equal(timedOut.ballInHand,true,'timeout must award ball in hand');

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const upsert=fs.readFileSync(new URL('../server/http-handlers/rooms/upsert.js',import.meta.url),'utf8');
const leave=fs.readFileSync(new URL('../server/http-handlers/rooms/leave.js',import.meta.url),'utf8');
assert.match(index,/games\/pool\/pool\.css/);
assert.match(index,/games\/pool\/pool-physics\.js/);
assert.match(index,/games\/pool\/pool\.js/);
assert.match(app,/gameCard\('truco'\).*gameCard\('pool'\).*gameCard\('chess'\).*gameCard\('music'\).*gameCard\('blackjack'\)/s,'home order should put Sinuca second and Blackjack last');
assert.match(app,/FEATURE_FLAGS=Object\.freeze\(\{blackjack:false\}\)/,'Blackjack remains disabled');
assert.match(upsert,/poolTurnTimer/);
assert.match(upsert,/poolAllowSpectators/);
assert.match(leave,/\['chess','truco','pool','blackjack'\]/,'leaving a live pool game must abandon it safely');

console.log('v7.2.0 pool engine smoke: OK');
