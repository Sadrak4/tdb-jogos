// Testes sem Supabase: mesmos módulos oficiais consumidos pelo servidor.
import assert from 'node:assert/strict';
import * as C from '../server/chess-engine.js';
import * as T from '../server/truco-engine.js';

const white={id:'U1',username:'Pessoa'};
const black={id:'B1',username:'BOT',bot:true,difficulty:'hard'};
for(const difficulty of ['easy','medium','hard']){
 const st=C.createState({room:{code:'CHESS',chessClock:300},whitePlayer:white,blackPlayer:black});
 const initial=structuredClone(st);
 const move=C.chooseBotMove(st,'white',difficulty,{timeBudgetMs:155});
 const legal=C.legalMovesFrom(st,move.from.r,move.from.c).find(m=>m.to.r===move.to.r&&m.to.c===move.to.c);
 assert.ok(legal,`Xadrez BOT ${difficulty} deve escolher movimento legal`);
 const moved=C.applyMove(st,move,'queen');
 assert.equal(moved.moveHistory.length,1);
 assert.deepEqual(st,initial,'O BOT não pode alterar o estado antes de jogada validada');
 console.log(`✔ Motor de Xadrez original, BOT ${difficulty}: análise e movimento legal`);
}
const players=[{id:'HUMAN',username:'Humano'},...Array.from({length:3},(_,i)=>({id:`BOT${i+1}`,username:`Bot ${i+1}`,bot:true,difficulty:['easy','medium','hard'][i]}))];
const st=T.createState({code:'T4',game:'truco',trucoSeats:4,players,turnTimer:0});
assert.equal(st.players.length,4);
let x=T.viewFor(st,'HUMAN');
for(const seat of [1,2,3])assert.ok((x.hands[seat]||[]).every(c=>c===null),'Cartas privadas não podem aparecer para outras pessoas');
const guest=T.viewFor(st,'VISITOR','spectator');
for(const seat of [0,1,2,3])assert.ok((guest.hands[seat]||[]).every(c=>c===null),'Espectadores nunca veem cartas privadas');

// Exercita partidas reais com BOTs e regras de cartas, raises e resolução.
for(let round=0;round<3;round++){
 let state=T.createState({code:'SIM'+round,game:'truco',trucoSeats:4,players,turnTimer:0});
 let steps=0;
 while(state.phase!=='finished'&&steps++<2600){
  const before=state.version;
  if(state.phase==='resolving')state=T.tick(state,Number(state.trickResolveAt||Date.now())+3000);
  else if(state.phase==='playing'){
   const p=state.players.find(p=>p.seat===state.current);
   if(p?.bot)state=T.runBotTurn(state);
   else state=T.applyTrucoAction(state,p.seat,{type:'PLAY_CARD',cardIdx:0});
  }else if(state.phase==='raise-response'){
   const candidate=state.players.find(p=>p.team===state.pendingRaise.targetTeam&&state.pendingRaise.responses?.[p.seat]===undefined);
   assert.ok(candidate,'Pedido de Truco não pode ficar sem participante com voto pendente');
   if(candidate.bot)state=T.runBotTurn(state);else state=T.applyTrucoAction(state,candidate.seat,{type:'RESPOND_RAISE',answer:'accept'});
  }else if(state.phase==='eleven'){
   const candidate=state.players.find(p=>p.team===state.eleven.team&&state.eleven.responses?.[p.seat]===undefined);
   assert.ok(candidate,'Mão de 11 precisa ter jogador para decidir');
   if(candidate.bot)state=T.runBotTurn(state);else state=T.applyTrucoAction(state,candidate.seat,{type:'ELEVEN_DECISION',play:true});
  }
  assert.notEqual(state.version,before,`Truco deve avançar sem travar em ${state.phase}`);
 }
 assert.equal(state.phase,'finished',`Truco 2x2 deve encerrar sem travamento (ações ${steps})`);
 assert.ok(state.scores.some(s=>s>=12));
 console.log(`✔ Truco 2×2: partida completa com 3 BOTs e ações válidas (${steps} transições)`);
}
const one=T.createState({code:'T2',game:'truco',trucoSeats:2,players:players.slice(0,2)});
assert.equal(one.players.length,2);
assert.deepEqual(one.players.map(p=>p.seat),[0,2]);
console.log('✔ Truco 1×1, privacidade de cartas e partida 2×2 com BOTs sem dependências externas');
