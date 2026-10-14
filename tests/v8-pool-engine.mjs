import assert from 'node:assert/strict';
import {rackBalls,simulateShot,createState,applyAction,viewFor,tableSpec} from '../server/pool-engine.js';
const room={code:'TB-POOL-DEMO',game:'pool',players:[{id:'A',username:'Ana'},{id:'B',username:'Bob'}],poolTurnTimer:0};
const balls=rackBalls();assert.equal(balls.length,16);assert.equal(new Set(balls.map(b=>b.id)).size,16);
const sim=simulateShot(balls,0,.7);assert(Number.isFinite(sim.duration));assert(sim.firstHit);
const state=createState(room);assert(viewFor(state,'A','player').canShoot);assert(!viewFor(state,'C','spectator').canShoot);
const after=applyAction(state,'A',{type:'SHOOT',angle:0,power:.65},Date.now());assert(after.version>state.version);
assert.equal(tableSpec().width,2);console.log('✔ v8 pool engine: rack, simulation, turn permissions and server-shot result');
