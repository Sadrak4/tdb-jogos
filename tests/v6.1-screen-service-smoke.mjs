import { applyMutation } from '../server/realtime-store.js';
import * as Screen from '../server/screen-share-service.js';

function assert(name,cond){if(!cond)throw new Error(`FAIL: ${name}`);console.log('OK',name)}
const A={id:'A',username:'Alpha',avatar:'A'};
const B={id:'B',username:'Beta',avatar:'B'};
const room={code:'LNG61',game:'music',name:'Lounge',owner:'Alpha',ownerId:'A',status:'open',privacy:'public',players:[A,B],spectators:[]};
await applyMutation({type:'room:upsert',room});

let a=await Screen.action(room.code,A,{type:'START',broadcastId:'SCR-12345678'});
assert('Broadcaster starts',a.active&&a.isBroadcaster&&a.viewerCount===0);
let b=await Screen.state(room.code,B);
assert('Other member sees available broadcast',b.active&&b.broadcaster.id==='A'&&!b.isBroadcaster);

b=await Screen.action(room.code,B,{type:'WATCH'});
assert('Viewer requests stream only after WATCH',b.selfViewer?.status==='requested');
a=await Screen.state(room.code,A);
assert('Broadcaster sees requested viewer',a.viewers.length===1&&a.viewers[0].id==='B');

const offer={type:'offer',sdp:'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n'};
a=await Screen.action(room.code,A,{type:'OFFER',viewerId:'B',description:offer});
b=await Screen.state(room.code,B);
assert('Viewer receives its offer',b.selfViewer?.offer?.type==='offer');

const answer={type:'answer',sdp:'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n'};
b=await Screen.action(room.code,B,{type:'ANSWER',description:answer});
a=await Screen.state(room.code,A);
assert('Broadcaster receives viewer answer',a.viewers[0].answer?.type==='answer');

await Screen.action(room.code,B,{type:'CONNECTED'});
b=await Screen.state(room.code,B);
assert('Viewer connection status is retained',b.selfViewer?.status==='connected');

await Screen.action(room.code,B,{type:'LEAVE_VIEW'});
a=await Screen.state(room.code,A);
assert('Viewer can leave without stopping broadcast',a.active&&a.viewerCount===0);

await Screen.action(room.code,A,{type:'STOP'});
b=await Screen.state(room.code,B);
assert('Broadcaster stop ends stream for everyone',!b.active);

console.log('ALL V6.1 SCREEN SERVICE TESTS PASSED');
