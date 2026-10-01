import { applyMutation } from '../server/realtime-store.js';
import * as Screen from '../server/screen-share-service.js';

function assert(name,condition){if(!condition)throw new Error(`FAIL: ${name}`);console.log('OK',name)}

const room={
  code:'SCR611',game:'music',name:'Screen Test',ownerId:'U1',owner:'Alpha',status:'open',privacy:'public',
  players:[{id:'U1',username:'Alpha'},{id:'U2',username:'Beta'}],spectators:[]
};
const u1={id:'U1',username:'Alpha'};
const u2={id:'U2',username:'Beta'};
await applyMutation({type:'room:upsert',room});

const bid='SCR-TEST-611';
let s=await Screen.action(room.code,u1,{type:'START',broadcastId:bid});
assert('Broadcaster START becomes active',s.active&&s.broadcastId===bid&&s.isBroadcaster);

s=await Screen.state(room.code,u2);
assert('Other room member sees active broadcast',s.active&&s.broadcaster.id==='U1'&&!s.selfViewer);

s=await Screen.action(room.code,u2,{type:'WATCH'});
assert('Viewer request is persisted independently',s.selfViewer?.status==='requested');

let host=await Screen.state(room.code,u1);
assert('Broadcaster sees requested viewer',host.viewers.length===1&&host.viewers[0].id==='U2');

const offer={type:'offer',sdp:'v=0\r\na=ice-ufrag:testoffer\r\n'};
await Screen.action(room.code,u1,{type:'OFFER',viewerId:'U2',description:offer});
s=await Screen.state(room.code,u2);
assert('Viewer receives only its offer',s.selfViewer?.offer?.sdp===offer.sdp);

const answer={type:'answer',sdp:'v=0\r\na=ice-ufrag:testanswer\r\n'};
await Screen.action(room.code,u2,{type:'ANSWER',description:answer});
host=await Screen.state(room.code,u1);
assert('Broadcaster receives viewer answer',host.viewers[0]?.answer?.sdp===answer.sdp);

// Simulate overlapping heartbeats that used to overwrite negotiation state in v6.1.
await Promise.all([
  Screen.action(room.code,u1,{type:'HEARTBEAT',broadcastId:bid}),
  Screen.action(room.code,u2,{type:'VIEW_HEARTBEAT'}),
]);
s=await Screen.state(room.code,u2);
host=await Screen.state(room.code,u1);
assert('Broadcaster heartbeat does not delete offer',s.selfViewer?.offer?.sdp===offer.sdp);
assert('Viewer heartbeat does not delete answer',host.viewers[0]?.answer?.sdp===answer.sdp);

await Screen.action(room.code,u2,{type:'CONNECTED'});
host=await Screen.state(room.code,u1);
assert('Connected viewer status is visible to broadcaster',host.viewers[0]?.status==='connected');

// A retry clears only negotiation rows, not viewer presence.
await Screen.action(room.code,u1,{type:'RESET_VIEWER',viewerId:'U2'});
host=await Screen.state(room.code,u1);
assert('RESET_VIEWER preserves viewer request',host.viewers.length===1&&host.viewers[0].status==='requested');

await Screen.action(room.code,u1,{type:'STOP',broadcastId:bid});
s=await Screen.state(room.code,u2);
assert('STOP is visible to the room',!s.active);

// STOP must win over any old heartbeat; an old broadcaster heartbeat cannot resurrect the stream.
let heartbeatRejected=false;
try{await Screen.action(room.code,u1,{type:'HEARTBEAT',broadcastId:bid})}catch{heartbeatRejected=true}
assert('Old broadcaster heartbeat is rejected after STOP',heartbeatRejected);
s=await Screen.state(room.code,u2);
assert('STOP remains inactive after rejected heartbeat',!s.active);

console.log('ALL V6.1.1 SCREEN SHARE SERVICE TESTS PASSED');
