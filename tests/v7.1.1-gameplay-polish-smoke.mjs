import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ok=(n,v)=>{if(!v)throw new Error(n);console.log('✓',n)};
ok('version in v7.1 line',JSON.parse(read('package.json')).version.startsWith('7.1.'));
ok('truco opponent offset',read('ui/gameplay-fixes.css').includes('.tdb-v7 .play-card.p2'));
ok('chess anti-loop',read('games/chess/chess-ui.js').includes('Anti-loop'));
ok('blackjack rebuild',read('games/blackjack/blackjack.css').includes('BLACKJACK CASINO REBUILD'));
ok('music viewport safety',read('ui/gameplay-fixes.css').includes('TDB v7.1.4 — FINAL AUTHORITATIVE LAYOUT'));
