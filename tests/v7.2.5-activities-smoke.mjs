import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const vercel=JSON.parse(read('vercel.json'));
const music=read('games/music/music.js');
const css=read('games/music/music.css');
const online=read('core/online-client.js');
const backend=read('server/activity-service.js');
const router=read('server/http-router.js');
const musicOriginalSmokes=['games/music/music.js','games/music/screen-share.js','server/music-service.js'];

assert.equal(pkg.version,'7.2.5');
assert.match(read('server/http-handlers/health.js'),/version:'7\.2\.5'/);
assert.equal(pkg.scripts['test:audit'],'node tests/v7.2.5-activities-smoke.mjs');
assert.ok(vercel.rewrites.some(x=>x.source==='/api/platform/activities'&&x.destination.includes('platform/activities')));
assert.ok(vercel.rewrites.some(x=>x.source==='/api/profile/public'));
assert.match(router,/platform\/activities/);
assert.match(online,/async function getActivities/);
assert.match(online,/async function activityAction/);
assert.match(music,/loungeActivityHub/);
assert.match(music,/activity-stage-note/);
assert.match(music,/function refreshActivities/);
assert.match(music,/function updateActivity/);
assert.match(music,/setInterval\(refreshActivities,4000\)/);
assert.match(music,/window\.TDBScreenShare\?\.mount\?\.\(room\)/);
assert.match(music,/createPlayer\(\)/);
assert.match(music,/syncPlayer\(false,'remote-state'\)/);
assert.match(css,/\.activity-game-choices/);
assert.match(css,/@media\(max-width:650px\)/);
assert.match(read('server/http-handlers/platform/activities.js'),/requireApiUser/);
assert.ok(musicOriginalSmokes.every(f=>read(f).length>1000));

// Execução das regras do backend com um store simulado (sem Supabase).
const rooms=new Map();const shared=new Map();const events=[];
const host={id:'u1',username:'Anfitrião'};
const friend={id:'u2',username:'Amiga'};
const other={id:'u3',username:'Outro'};
const stranger={id:'evil',username:'Intruso'};
const room={code:'MUS-ABC',game:'music',ownerId:host.id,players:[host,friend,other],spectators:[]};
rooms.set(room.code,room);
const serviceCode=backend.replace(/^import\s+\{[^}]+\}\s+from\s+['"]\.\/realtime-store\.js['"];?/m,'')
  .replace(/export async function /g,'async function ')
  +'\nthis.TEST_SERVICE={getActivities,applyActivityAction};';
const scope={
  structuredClone,
  getRoomPrivate:async code=>rooms.get(code)||null,
  getSharedValue:async (key,fallback)=>structuredClone(shared.get(key)??fallback),
  setSharedValue:async (key,val)=>{shared.set(key,structuredClone(val));return val},
  emitEvent:async (...args)=>{events.push(args)}
};
vm.runInNewContext(serviceCode,scope);
const {getActivities,applyActivityAction}=scope.TEST_SERVICE;
const act=(user,action)=>applyActivityAction(room.code,user,action);
await assert.rejects(()=>getActivities(room.code,stranger),/não participa/i);
await assert.rejects(()=>applyActivityAction(room.code,stranger,{type:'CREATE',game:'chess'}),/não participa/i);
await assert.rejects(()=>act(host,{type:'CREATE',game:'blackjack'}),/Escolha/);
let s=await act(host,{type:'CREATE',game:'chess'});
assert.equal(s.tables.length,1);
assert.equal(s.tables[0].capacity,2);
assert.equal(s.tables[0].players[0].id,host.id);
await assert.rejects(()=>act(friend,{type:'CREATE',game:'pool'}),/Já existe/);
const id=s.tables[0].id;
s=await act(friend,{type:'JOIN',tableId:id});
assert.equal(s.tables[0].players.length,2);
await assert.rejects(()=>act(other,{type:'JOIN',tableId:id}),/cheia/);
s=await act(other,{type:'WATCH',tableId:id});
assert.equal(s.tables[0].spectators.length,1);
await assert.rejects(()=>act(friend,{type:'CLOSE',tableId:id}),/Somente/);
s=await act(friend,{type:'WATCH',tableId:id});
assert.equal(s.tables[0].players.length,1);
assert.equal(s.tables[0].spectators.length,2);
s=await act(friend,{type:'JOIN',tableId:id});
assert.equal(s.tables[0].players.length,2);
assert.equal(s.tables[0].spectators.length,1);
s=await act(other,{type:'LEAVE',tableId:id});
assert.equal(s.tables[0].spectators.length,0);
s=await act(host,{type:'CLOSE',tableId:id});
assert.equal(s.tables.length,0);
assert.match(read('server/realtime-store.js'),/startsWith\('activities:'\)/);
assert.ok(shared.has(`activities:${room.code}`));
assert.equal((await getActivities(room.code,host)).tables.length,0);

console.log('v7.2.5 Central de Atividades — regras, UI, API e Vercel: OK');
