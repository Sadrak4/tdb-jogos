import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as Pool from '../server/pool-engine.js';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
assert.match(pkg.version,/^7\.2\.[23]$/,'package version must remain on the 7.2.x stability line');

const client=read('core/online-client.js');
assert.match(client,/REQUEST_TIMEOUT/,'online client must surface request timeout');
assert.match(client,/timeoutMs:15000/,'game start must have a bounded timeout');
assert.match(client,/timeoutMs:9000/,'online sync/reconnect must have a bounded timeout');

const auth=read('core/online-auth.js');
assert.match(auth,/AbortController/,'auth requests must be abortable');
assert.match(auth,/__TDB_AUTH_TRANSIENT_ERROR__/,'transient auth errors must preserve the local session');
assert.match(auth,/if\(err\?\.status===401\)\{localStorage\.removeItem\(TOKEN_KEY\)/,'token must only be cleared for an invalid server session');

const realtime=read('server/realtime-store.js');
assert.match(realtime,/SUPABASE_INIT_TIMEOUT_MS\s*=\s*4500/,'Supabase init needs a fail-fast timeout');
assert.match(realtime,/SUPABASE_QUERY_TIMEOUT_MS\s*=\s*6500/,'Supabase room/game queries need a bounded timeout');
assert.match(realtime,/runSupabaseQuery/,'critical Supabase reads/writes must be abortable');

const start=read('server/http-handlers/games/start.js');
const startCall=start.indexOf('Games.startGame(room)');
assert.ok(startCall>0,'start handler must delegate to transactional game service');
const beforeStart=start.slice(0,startCall);
assert.doesNotMatch(beforeStart,/room\.status\s*=\s*['"]playing['"]/,'HTTP start handler cannot mark room playing before game state exists');

const join=read('server/http-handlers/rooms/join.js');
assert.match(join,/recoverPhantomPlayingRoom/,'join must recover phantom playing rooms');
assert.match(join,/heartbeat\([\s\S]*?\.catch\(/,'join presence update must be best effort');

const maintenance=read('server/maintenance-service.js');
assert.match(maintenance,/reconnect recovery/,'reconnect must recover a room whose game state disappeared');
assert.match(maintenance,/reconnect cleanup/,'reconnect housekeeping must run without blocking the reconnect response');
assert.match(maintenance,/heartbeat\([\s\S]*?\.catch\(/,'reconnect heartbeat must not block recovery');

const snapshotHandler=read('server/http-handlers/state/snapshot.js');
assert.match(snapshotHandler,/cleanupStale\(\)\.catch/,'snapshot housekeeping must not block the app state response');


const gameService=read('server/game-service.js');
const rematchBlock=gameService.slice(gameService.indexOf('export async function rematchGame'));
const rematchStart=rematchBlock.indexOf('return await startGame(room)');
assert.ok(rematchStart>0,'rematch must delegate to transactional startGame');
assert.doesNotMatch(rematchBlock.slice(0,rematchStart),/room\.status\s*=\s*['"]playing['"]/,'rematch cannot pre-mark a room as playing');

const watch=read('server/http-handlers/rooms/watch.js');
assert.match(watch,/const live=!!\(gameState && !isTerminal\(gameState\)\)/,'spectator live state must come from an actual active game');
assert.match(watch,/room\.status='open'/,'watch route must recover a phantom playing room');

const rateLimit=read('server/rate-limit.js');
assert.match(rateLimit,/runSupabaseQuery/,'rate-limit database checks must be bounded');
assert.match(rateLimit,/return\{ok:true\}/,'rate limiting must fail open if its auxiliary storage is unavailable');

const poolUi=read('games/pool/pool.js');
assert.match(poolUi,/renderPoolRecovery/,'pool UI must have an explicit recovery screen');
assert.match(poolUi,/cleanupPoolUi/,'pool animation resources must be cleanable');

const app=read('app.js');
assert.match(app,/finally\{\s*window\.TDBPlatformUI\?\.hideLoading\?\.\(\);\s*\}/,'game start loading overlay must always be released');
assert.match(app,/window\.cleanupPoolUi\?\.\(\)/,'navigation must stop the pool render loop');

// Pool engine regression: two real players can create a state and make a server-authoritative shot.
const room={
  code:'SNKTEST',game:'pool',poolTurnTimer:45,
  players:[{id:'U1',username:'Host'},{id:'U2',username:'Friend'}]
};
let state=Pool.createState(room);
assert.equal(state.players.length,2);
assert.equal(state.status,'playing');
const beforeVersion=state.version;
state=Pool.applyAction(state,'U1',{type:'SHOOT',angle:0,power:.45,actionId:'smoke-shot'});
assert.ok(state.version>beforeVersion,'valid pool shot should advance the state version');
assert.ok(state.lastShot?.shotId,'server must persist an official shot id');
assert.equal(state.balls.length,16,'8-ball state keeps cue + 15 object balls');

console.log('v7.2.2 online stability smoke: OK');
