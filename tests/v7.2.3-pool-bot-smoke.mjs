import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as Pool from '../server/pool-engine.js';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
assert.equal(pkg.version,'7.2.3');

const app=read('app.js');
assert.match(app,/startPoolWithBot/,'Sinuca precisa expor um botão/fluxo para jogar contra BOT');
assert.match(app,/Jogar contra BOT/,'Sala de Sinuca deve mostrar o botão Jogar contra BOT');
assert.match(app,/withPoolBot:true/,'UI deve sinalizar início da Sinuca com BOT');

const client=read('core/online-client.js');
assert.match(client,/withBot:options\?\.withBot===true/,'cliente online deve enviar withBot ao servidor');

const start=read('server/http-handlers/games/start.js');
assert.match(start,/BOT-POOL-/,'servidor deve criar o jogador BOT da Sinuca');
assert.match(start,/poolBotEnabled=true/,'sala deve registrar que o BOT foi ativado');

const join=read('server/http-handlers/rooms/join.js');
assert.match(join,/BOT da Sinuca funciona como adversário de teste/,'jogador real deve poder substituir o BOT numa sala aberta');

const room={
  code:'BOTTEST',game:'pool',poolTurnTimer:45,
  players:[
    {id:'TDB-HOST',username:'Host'},
    {id:'BOT-POOL-BOTTEST',username:'Bot TDB',avatar:'BOT',bot:true}
  ]
};
let state=Pool.createState(room);
assert.equal(state.players[1].bot,true);

// Força a vez do BOT para testar o motor sem depender da tacada inicial humana.
const base=Date.now()+50;
state.turnIndex=1;
state.turnPlayerId=state.players[1].id;
state.readyAt=base;
state.turnDeadlineAt=base+60000;
state.botThinkUntil=null;
const v0=state.version;
state=Pool.runBotTurn(state,base);
assert.ok(state.botThinkUntil>base,'BOT deve ter um pequeno tempo de pensamento antes de jogar');
assert.ok(state.version>v0,'agendamento do BOT deve ser persistível');
const thinkUntil=state.botThinkUntil;
state=Pool.runBotTurn(state,thinkUntil+20);
assert.equal(state.lastShot?.playerId,'BOT-POOL-BOTTEST','BOT deve produzir uma tacada oficial pelo motor do servidor');
assert.ok(state.lastShot?.shotId,'tacada do BOT deve receber shotId oficial');
assert.ok(state.lastShot?.duration>0,'tacada do BOT deve passar pela física oficial');

// Bola na mão: BOT posiciona a branca antes de tentar a próxima tacada.
let hand=Pool.createState(room);
hand.turnIndex=1;hand.turnPlayerId=hand.players[1].id;hand.ballInHand=true;
const cue=hand.balls.find(b=>b.id===0);cue.pocketed=true;
hand.readyAt=base;hand.turnDeadlineAt=base+60000;hand.botThinkUntil=base;
hand=Pool.runBotTurn(hand,base+10);
assert.equal(hand.ballInHand,false,'BOT deve posicionar a branca quando recebe bola na mão');
assert.equal(hand.balls.find(b=>b.id===0).pocketed,false,'branca deve voltar para a mesa');

console.log('v7.2.3 pool bot smoke: OK');
