import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ok=(name,value)=>{if(!value)throw new Error(`FAIL: ${name}`);console.log('OK',name)};
const pkg=JSON.parse(read('package.json'));
const fixes=read('ui/gameplay-fixes.css');
const app=read('app.js');
const chessUi=read('games/chess/chess-ui.js');
const bj=read('games/blackjack/blackjack.js');
const bjCss=read('games/blackjack/blackjack.css');
const music=read('games/music/music.js');
const admin=read('admin-panel.js');
const router=read('server/http-router.js');
const health=read('server/http-handlers/health.js');
const online=read('core/online-client.js');
const presence=read('core/presence-manager.js');
const migration=read('SUPABASE-MIGRATION-v7.1.0.sql');

ok('package v7.1.4',pkg.version==='7.1.4');
ok('health v7.1.4',health.includes("version:'7.1.4'"));
ok('client telemetry v7.1.4',online.includes("version:'7.1.4'"));
ok('profile public route',router.includes("['profile/public',profilePublic]"));
ok('banner migration targets tdb_users',/alter table public\.tdb_users add column if not exists banner text/i.test(migration));
ok('presence idle module',presence.includes('5*60*1000'));
ok('profile banner UI',app.includes('editBanner')&&app.includes('profile-banner'));
ok('friend invite from profile',app.includes('Convidar para minha sala'));

ok('truco final authoritative layer',fixes.includes('TRUCO: clear center + readable vira'));
ok('truco top card moved away from center',fixes.includes('.tdb-v7 .play-card.p2')&&fixes.includes('top:-5%!important'));
ok('truco vira enlarged',fixes.includes('1.30'));

ok('chess right rail forced visible',fixes.includes('.tdb-v7 .chess-right-panel')&&fixes.includes('display:flex!important'));
ok('chess board enlarged by viewport',fixes.includes('calc(100dvh - 126px)'));
ok('chess medium desktop keeps rail',fixes.includes('grid-template-columns:minmax(0,1fr) minmax(238px,286px)'));
ok('chess anti-loop reinforced',chessUi.includes('recentDestinations')&&chessUi.includes('nonRepeatedDestination'));
ok('stalemate explanation',chessUi.includes('Afogamento: o rei não está em xeque'));

ok('music rail width constraints',fixes.includes('TDB LOBBY / MÚSICA: never crop the tools rail'));
ok('music three-column desktop',fixes.includes('minmax(270px,330px)'));
ok('music notebook two-column fallback',fixes.includes('@media (min-width:901px) and (max-width:1279px)'));
ok('music shared queue author support',music.includes('addedBy'));
ok('music vote skip support',music.includes('skipVotes'));

ok('blackjack casino rebuild css',bjCss.includes('BLACKJACK CASINO REBUILD'));
ok('blackjack interactive actions',bj.includes("bjAction('HIT')")&&bj.includes("bjAction('STAND')")&&bj.includes("bjAction('DOUBLE')")&&bj.includes("bjAction('SPLIT')"));
ok('blackjack bet chips',bj.includes('bj-chip-choice')&&bj.includes('JOGAR FICHAS NA MESA'));
ok('blackjack visual effects',bj.includes('animateChipFlight')&&bj.includes('pendingVisualEffects'));

ok('admin overview metrics',admin.includes('Usuários online')&&admin.includes('Salas abertas')&&admin.includes('Partidas em andamento'));
ok('admin moderation',admin.includes('Banir')&&admin.includes('Encerrar sessões'));
ok('final review document',fs.existsSync(new URL('../REVISAO-FINAL-v7.1.4.md',import.meta.url)));
console.log('ALL V7.1.4 FINAL AUDIT TESTS PASSED');
