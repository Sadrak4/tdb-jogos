/** Regressão da RC 8.1.3: ação responde com BOT, sem depender do próximo polling.
 * Banco em memória. Não representa latência real de Supabase/Vercel.
 */
import assert from 'node:assert/strict';
import * as Hub from '../server/hub-service.js';
const human={id:'PERF-HUMAN',username:'Pessoa'};
const {code}=await Hub.createRoom(human,{name:'Teste de jogadas rápidas',visibility:'public'});
await assert.rejects(Hub.act(code,human,{type:'table:create',game:'pool'}),/Xadrez ou Truco/);
await assert.rejects(Hub.startTraining(human,{game:'pool'}),/Jogo inválido/);
const {table:chess}=await Hub.act(code,human,{type:'table:create',game:'chess',settings:{color:'white'},bots:1,botDifficulty:'hard'});
await Hub.act(code,human,{type:'table:start',tableId:chess.id});
const before=await Hub.getSnapshot(code,human,chess.id);
assert.equal(before.game.turn,'white');
const start=performance.now();
const moved=await Hub.act(code,human,{type:'game:action',tableId:chess.id,action:{type:'MOVE',from:{r:6,c:4},to:{r:4,c:4},expectedVersion:before.game.version}});
const ms=performance.now()-start;
assert.ok(moved.game.moveHistory.length>=2,'A resposta à jogada já deve incluir o turno do BOT.');
assert.equal(moved.game.turn,'white','O jogador deve poder jogar novamente sem aguardar polling de 3,2 s');
assert.ok(moved.game.version>before.game.version,'Versão da partida incrementada corretamente');
console.log(`✔ Xadrez: jogada humana + BOT difícil na mesma resposta (${ms.toFixed(0)} ms no servidor local)`);
const {table:truco}=await Hub.act(code,human,{type:'table:create',game:'truco',settings:{seats:4},bots:3,botDifficulty:'medium'});
await Hub.act(code,human,{type:'table:start',tableId:truco.id});
let shot=await Hub.getSnapshot(code,human,truco.id);
for(let i=0;i<9&&shot.game.phase==='playing'&&shot.game.current!==shot.game.localSeat;i++)shot=await Hub.getSnapshot(code,human,truco.id);
if(shot.game.phase==='playing'&&shot.game.current===shot.game.localSeat){
 const beforeVersion=shot.game.version;
 const t0=performance.now();
 const action=await Hub.act(code,human,{type:'game:action',tableId:truco.id,action:{type:'PLAY_CARD',cardIdx:0,expectedVersion:beforeVersion}});
 const took=performance.now()-t0;
 assert.ok(action.game.version>beforeVersion,'Truco aceita jogada com estado atualizado');
 assert.ok(action.game.version>=beforeVersion+2||action.game.phase==='resolving','Quando há BOT na sequência, a resposta deve avançá-lo sem polling');
 console.log(`✔ Truco: ação + encadeamento dos BOTs (${took.toFixed(0)} ms no servidor local)`);
}else console.log('✔ Truco: mesa 2×2 iniciada e sincronizada (nenhuma jogada humana disponível neste instante)');
const snapshot=await Hub.getSnapshot(code,human);
assert.ok(snapshot.room.tables.every(x=>x.game!=='pool'),'Mesa removida da navegação');
console.log('✔ Sinuca não pode mais ser criada no servidor, nem no treinamento');
