import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

const pkg=JSON.parse(read('package.json'));
const app=read('app.js');
const online=read('core/online-client.js');
const css=read('ui/gameplay-fixes.css');
const chess=read('games/chess/chess-ui.js');
const share=read('games/music/screen-share.js');
const watch=read('server/http-handlers/rooms/watch.js');
const remove=read('server/http-handlers/rooms/remove.js');
const join=read('server/http-handlers/rooms/join.js');
const upsert=read('server/http-handlers/rooms/upsert.js');
const start=read('server/http-handlers/games/start.js');
const health=read('server/http-handlers/health.js');
const social=read('server/social-service.js');

assert.equal(pkg.version,'7.1.6');
assert.match(health,/version:'7\.1\.6'/);
assert.match(app,/version:'7\.1\.6'/);
assert.match(online,/version:'7\.1\.6'/);

// Sala de espera / host.
assert.match(app,/function deleteCurrentRoom\(/);
assert.match(app,/Apagar sala agora/);
assert.match(app,/function backToGameLobby\(/);
assert.match(app,/waiting-back-button/);
assert.match(online,/async function removeRoom\(code\)/);
assert.match(remove,/Somente o host pode encerrar a sala/);

// Ao vivo / espectador: a partida também é reconhecida pelo estado do jogo.
assert.match(app,/function isRoomLive\(room\)/);
assert.match(app,/Ao vivo agora/);
assert.match(app,/onclick="watchRoom\('\$\{room\.code\}'\)"/);
assert.match(watch,/getGame\(code\)/);
assert.match(watch,/gameState && !isTerminal\(gameState\)/);

// Truco: resposta do bot legível e avisos fora do centro.
assert.match(app,/ANALISANDO\.\.\./);
assert.match(app,/ASSISTINDO AO VIVO • modo espectador/);
assert.match(app,/1650 \+ idx\*650/);
assert.match(app,/showTrucoCallFeedback\(`\$\{responder\.username\} • \$\{label\}`,2400\)/);
assert.match(css,/Truco call prompts never cover the vira/);
assert.match(css,/\.game-message\.truco-call[\s\S]*right:16px!important;top:16px!important/);

// Xadrez: click continua existindo + drag/drop em destinos legais.
assert.match(chess,/onclick="clickChessSquare/);
assert.match(chess,/draggable="true" ondragstart="startChessDrag/);
assert.match(chess,/function dropChessPiece/);
assert.match(chess,/ASSISTINDO AO VIVO/);
assert.match(chess,/chess\.localColor\|\|\(chess\.spectatorMode\?'white':null\)/);
assert.match(chess,/chess\?\.legalMoves\?\.some/);
assert.match(css,/Chess: larger board/);
assert.match(css,/calc\(100dvh - 94px\)/);

// Lobby/música responsivo e troca de origem do compartilhamento.
assert.match(css,/Lobby\/Music: keep useful proportions/);
assert.match(css,/@media \(min-width:901px\) and \(max-width:1059px\)/);
assert.match(share,/async function switchShareSource\(/);
assert.match(share,/Trocar tela \/ janela \/ aba/);
assert.match(share,/getDisplayMedia/);

// Blackjack desativado no cliente e protegido no backend.
assert.match(app,/FEATURE_FLAGS=Object\.freeze\(\{blackjack:false\}\)/);
assert.match(app,/Blackjack está em manutenção/);
for(const source of [join,upsert,start]) assert.match(source,/Blackjack está em manutenção temporária/);
assert.match(app,/function rejectDisabledRoom\(/);
assert.match(app,/rejectDisabledRoom\(reconnect\.room,\{leaveOnline:true\}\)/);
assert.match(social,/if\(room\.game==='blackjack'\) throw new Error\('Blackjack está em manutenção temporária\.'\)/);
assert.doesNotMatch(app,/\['chess','truco','blackjack'\]\.includes\(reconnect\.room\.game\)/);

// Barra lateral recolhível e perfil único no rodapé da barra.
assert.match(app,/SIDEBAR_COLLAPSE_KEY/);
assert.match(app,/function toggleSidebar\(/);
assert.match(css,/tdb-sidebar-collapsed/);
assert.doesNotMatch(app,/data-label="Perfil"/);
assert.match(app,/profile-mini/);

console.log('v7.1.6 lobby/live/UX smoke: OK');
