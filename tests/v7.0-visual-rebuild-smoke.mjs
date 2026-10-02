import fs from 'fs';
function read(rel){return fs.readFileSync(new URL(`../${rel}`,import.meta.url),'utf8')}
function assert(name,c){if(!c)throw new Error(`FAIL: ${name}`);console.log('OK',name)}
const index=read('index.html'),app=read('app.js'),tokens=read('ui/tokens.css'),shell=read('ui/shell.css'),components=read('ui/components.css'),pages=read('ui/pages.css'),games=read('ui/games.css'),responsive=read('ui/responsive.css'),icons=read('ui/icon-system.js'),health=read('server/http-handlers/health.js');
assert('v7 body scope enabled',index.includes('class="tdb-v7"'));
assert('v7 design system loads after legacy game css',index.indexOf('ui/tokens.css')>index.indexOf('games/music/music.css'));
assert('v7 icon system loads before app',index.indexOf('ui/icon-system.js')<index.indexOf('app.js'));
assert('design tokens exist',tokens.includes('--v7-gold')&&tokens.includes('--v7-radius-lg')&&tokens.includes('--v7-normal'));
assert('desktop navigation is rebuilt as fixed rail',shell.includes('width:var(--v7-nav)')&&shell.includes('flex-direction:column'));
assert('mobile navigation becomes bottom dock',responsive.includes('bottom:12px')&&responsive.includes('height:64px'));
assert('home has cinematic hero art',pages.includes("url('../assets/v7/truco.svg')")&&pages.includes('.hero-strip'));
assert('all four game cards have dedicated visual art', ['art-truco','art-blackjack','art-chess','art-music'].every(x=>pages.includes(x)));
assert('game browser uses visual room cards',pages.includes('.room-row')&&pages.includes('grid-template-columns:minmax(0,1fr)'));
assert('waiting room is visually rebuilt',pages.includes('.waiting-hero')&&pages.includes('.player-list'));
assert('profile and settings are rebuilt',pages.includes('.profile-avatar-xl')&&pages.includes('.settings-stack'));
assert('admin control center is rebuilt',pages.includes('.admin-shell')&&pages.includes('.admin-stats'));
assert('Truco has premium table treatment',games.includes('.table-shell')&&games.includes('TRUCO PAULISTA'));
assert('Chess has new premium board palette',games.includes('.chess-square.light')&&games.includes('#d4c5a4'));
assert('Blackjack has rebuilt casino table treatment',games.includes('.bj-stage')&&games.includes('#17513a'));
assert('Lounge has rebuilt social layout',games.includes('.music-screen')&&games.includes('.lounge-screen-stage.active'));
assert('SVG icon system replaces text-only navigation',icons.includes("home:")&&icons.includes("screen:")&&app.includes("uiIcon('home')"));
assert('responsive targets include compact and mobile breakpoints',responsive.includes('@media(max-width:1180px)')&&responsive.includes('@media(max-width:900px)')&&responsive.includes('@media(max-width:620px)'));
assert('current health version is 7.0.0',health.includes("version:'7.0.0'"));
console.log('ALL V7.0 VISUAL REBUILD TESTS PASSED');
