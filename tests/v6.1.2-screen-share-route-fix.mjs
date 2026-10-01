
import fs from 'fs';

function read(rel){return fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8')}
function assert(name,condition){
  if(!condition)throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

const vercel=JSON.parse(read('vercel.json'));
const online=read('core/online-client.js');
const screen=read('games/music/screen-share.js');
const router=read('server/http-router.js');
const handler=read('server/http-handlers/platform/screen-share.js');
const health=read('server/http-handlers/health.js');

const rewrite=(vercel.rewrites||[]).find(x=>x.source==='/api/platform/screen-share');

assert('Vercel publishes /api/platform/screen-share',!!rewrite);
assert('Vercel screen-share rewrite reaches the single API router',
  rewrite?.destination==='/api/router?route=platform/screen-share');
assert('Server router registers the screen-share handler',
  router.includes("['platform/screen-share',platformScreenShare]"));
assert('Handler supports GET state and POST actions',
  handler.includes("req.method==='GET'")&&handler.includes("req.method==='POST'"));

assert('Client has a direct /api/router fallback on HTTP 404',
  online.includes('/api/router?route=platform/screen-share')&&online.includes("if(err?.status!==404)throw err"));
assert('Client rejects an invalid/empty API payload',
  online.includes("result?.ok===true&&result?.state"));
assert('Fallback also validates the response payload',
  online.includes("fallback?.ok!==true||!fallback?.state"));

const preflight=screen.indexOf('await preflightScreenShare()');
const chooser=screen.indexOf('stream=await captureDisplay()');
assert('Server preflight happens before browser screen chooser',
  preflight>=0&&chooser>=0&&preflight<chooser);
assert('Preflight calls the real screen-share state endpoint',
  screen.includes('window.TDBOnline.screenShareState(room.code)'));
assert('404 receives a clear screen-share error',
  screen.includes("status===404")&&screen.includes('rota de compartilhamento'));
assert('Capture NotReadableError has a useful message',
  screen.includes("err?.name==='NotReadableError'"));
assert('Local preview and STOP controls are shown before START confirmation',
  screen.includes("localPhase='registering'")&&screen.includes('Parar compartilhamento'));
assert('Server START must confirm the same broadcast id',
  screen.includes('r.state.broadcastId!==broadcastId'));
assert('Health reports 6.1.2',health.includes("version:'6.1.2'"));

console.log('ALL V6.1.2 SCREEN SHARE ROUTE FIX TESTS PASSED');
