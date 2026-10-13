import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const music=read('games/music/music.js');
const css=read('games/music/music.css');
const online=read('core/online-client.js');
const service=read('server/music-service.js');
const health=read('server/http-handlers/health.js');
const fixes=read('ui/gameplay-fixes.css');
const platform=read('server/platform-service.js');

assert.equal(pkg.version,'7.2.4');
assert.match(health,/version:'7\.2\.4'/);
assert.match(health,/serverTime:Date\.now\(\)/);

// UI rebuild
assert.match(music,/Cole o link do YouTube aqui/);
assert.match(music,/musicAddLinkBtn/);
assert.match(music,/bindMusicComposer/);
assert.match(music,/setMusicToolView/);
assert.match(music,/musicToolTabScreen/);
assert.match(music,/forceMusicResync/);
assert.match(css,/v7\.2\.4 — TDB Lobby Music rebuild/);
assert.match(css,/\.music-quick-add/);
assert.match(css,/\.music-tool-tabs/);
assert.match(fixes,/TDB v7\.2\.4 — authoritative Music rebuild geometry/);
assert.match(fixes,/music-screen\.music-v724:not\(\.lounge-has-screen-share\)/);

// Clock synchronization and anti-restart guard
assert.match(online,/serverClockOffsetMs/);
assert.match(online,/function serverNow\(\)/);
assert.match(online,/noteServerClock\(data\?\.serverTime/);
assert.match(music,/window\.TDBOnline\?\.serverNow/);
assert.match(music,/requestedVideoId/);
assert.match(music,/MUSIC_LOAD_GUARD_MS/);
assert.match(music,/MUSIC_DRIFT_SEEK_SECONDS/);
assert.match(music,/suspiciousRestart/);
assert.match(music,/onlineMusicDisconnected/);
assert.match(music,/requireMusicConnection/);
assert.match(music,/não carregamos de novo/i);
assert.doesNotMatch(music,/setInterval\(async\(\)=>\{[\s\S]{0,800}\},1500\);/);

// Backend playback timeline is revisioned and zero position is valid.
assert.match(service,/playbackRevision/);
assert.match(service,/Number\.isFinite\(supplied\)/);
assert.match(service,/case 'ENDED'/);
assert.match(service,/if\(!host\(room,user\.id\)\)return s/);
assert.match(service,/lastActionId/);
assert.match(platform,/playbackRevision=Number\(state\.playbackRevision\|\|0\)\+1/);

console.log('v7.2.4 music rebuild smoke: OK');
