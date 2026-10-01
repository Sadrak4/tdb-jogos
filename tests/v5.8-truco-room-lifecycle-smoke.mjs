import fs from 'fs';
import * as Truco from '../server/truco-engine.js';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const room={
  code:'TRC58',game:'truco',trucoSeats:2,turnTimer:30,
  players:[
    {id:'A',username:'Alpha'},
    {id:'B',username:'Beta'}
  ]
};

let state=Truco.createState(room);
const first=state.current;
const second=state.activeSeats.find(seat=>seat!==first);
state=Truco.applyTrucoAction(state,first,{type:'PLAY_CARD',cardIdx:0,hidden:false});
state=Truco.applyTrucoAction(state,second,{type:'PLAY_CARD',cardIdx:0,hidden:false});

assert('full trick enters resolving phase',state.phase==='resolving');
assert('both played cards remain on table during reveal delay',state.trickCards.length===2);
assert('round result is already known while cards remain visible',state.trickResults.length===1);
assert('turn timer is paused during trick reveal',state.turnDeadlineAt===null);
assert('reveal delay is close to 1.8 seconds',state.trickResolveAt-Date.now()>1500);

const before=Truco.tick(state,state.trickResolveAt-1);
assert('cards are still visible just before delay ends',before.phase==='resolving'&&before.trickCards.length===2);

const after=Truco.tick(state,state.trickResolveAt+1);
assert('cards clear only after reveal delay',after.trickCards.length===0);
assert('game resumes after reveal delay',after.phase==='playing'||after.phase==='eleven'||after.phase==='finished');

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const leave=fs.readFileSync(new URL('../server/http-handlers/rooms/leave.js',import.meta.url),'utf8');
const join=fs.readFileSync(new URL('../server/http-handlers/rooms/join.js',import.meta.url),'utf8');
const maintenance=fs.readFileSync(new URL('../server/maintenance-service.js',import.meta.url),'utf8');
const store=fs.readFileSync(new URL('../server/realtime-store.js',import.meta.url),'utf8');

assert('local Truco also keeps final trick for 1.8s',app.includes('setTimeout(resolveTrick,1800)'));
assert('online Truco shows resolving message',app.includes('As cartas ficam na mesa por um instante'));
assert('empty local rooms use five minute TTL',app.includes('EMPTY_ROOM_TTL_MS=5*60*1000'));
assert('server leaves empty room instead of deleting immediately',leave.includes('room.emptyExpiresAt=now+5*60*1000'));
assert('empty room is reopened and owner cleared',leave.includes("room.status='open'")&&leave.includes('room.ownerId=null'));
assert('joining an empty room makes new player host',join.includes('room.ownerId=user.id')&&join.includes('delete room.emptyExpiresAt'));
assert('expired room cannot be joined',join.includes("error:'Essa sala expirou.'"));
assert('maintenance TTL is five minutes',maintenance.includes('EMPTY_ROOM_TTL_MS=5*60*1000'));
assert('maintenance deletes only after expiry',maintenance.includes("now>=Number(room.emptyExpiresAt||0)"));
assert('snapshots hide expired empty rooms',store.includes('Number(room.emptyExpiresAt)>now'));

console.log('ALL V5.8 TRUCO/ROOM LIFECYCLE TESTS PASSED');
