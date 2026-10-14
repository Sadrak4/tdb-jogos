import assert from 'node:assert/strict';
import * as T from '../server/truco-engine.js';
import * as C from '../server/chess-engine.js';

const human={id:'U1',username:'Pessoa'};
const other={id:'U2',username:'BOT',bot:true,difficulty:'medium'};
const init=(num=2)=>T.createState({code:'SIM',trucoSeats:num,turnTimer:0,players:num===2?[human,other]:[human,{...other,id:'U3'},{...other,id:'U4'},{...other,id:'U5'}]});
assert.equal(T.TRICK_REVEAL_MS,1250,'janela de revelação deve ser inferior ao atraso antigo de 1,8s');

// Truco > Seis > Nove > Doze, aceites e respostas conforme o motor original.
let raise=init(2);raise.current=0;
for(const [before,offer] of [[1,3],[3,6],[6,9],[9,12]]){
  assert.equal(raise.handValue,before);
  raise=T.applyTrucoAction(raise,0,{type:'REQUEST_RAISE'});
  assert.equal(raise.phase,'raise-response');
  assert.equal(raise.pendingRaise.to,offer);
  raise=T.applyTrucoAction(raise,2,{type:'RESPOND_RAISE',answer:'accept'});
  assert.equal(raise.phase,'playing');
  assert.equal(raise.handValue,offer);
}
assert.throws(()=>T.applyTrucoAction(raise,0,{type:'REQUEST_RAISE'}),/12/);
console.log('✔ Truco, Seis, Nove e Doze: pedidos e respostas até 12 sem regressão');

let teams=init(4);teams.current=0;
teams=T.applyTrucoAction(teams,0,{type:'REQUEST_RAISE'});
teams=T.applyTrucoAction(teams,1,{type:'RESPOND_RAISE',answer:'accept'});
assert.equal(teams.phase,'raise-response','duplas exigem a resposta do outro jogador da equipe');
teams=T.applyTrucoAction(teams,3,{type:'RESPOND_RAISE',answer:'accept'});
assert.equal(teams.phase,'playing');
assert.equal(teams.handValue,3);
console.log('✔ Truco em duplas: respostas das duas pessoas da equipe preservadas');

const cards=[{rank:'4',suit:'clubs'},{rank:'5',suit:'clubs'},{rank:'3',suit:'clubs'},{rank:'A',suit:'clubs'}];
function prepared(){const t=init(4);t.current=0;t.manilhaRank='6';t.vira={rank:'5',suit:'hearts'};t.hands={0:[cards[0]],1:[cards[1]],2:[cards[2]],3:[cards[3]]};return t;}
let t=prepared();
for(let i=0;i<4;i++)t=T.applyTrucoAction(t,i,{type:'PLAY_CARD',cardIdx:0});
assert.equal(t.phase,'resolving');
assert.equal(t.pendingTrick.winnerSeat,2);
assert.ok(t.trickResolveAt>Date.now()&&t.trickResolveAt-Date.now()<=T.TRICK_REVEAL_MS+100);

const privacy=T.viewFor(t,'U1');
assert.ok(privacy.hands[1].every(x=>x===null));
assert.ok(privacy.hands[2].every(x=>x===null));
assert.ok(T.viewFor(t,'SPECTATOR','spectator').hands[0].every(x=>x===null));
const resolved=T.tick(t,t.trickResolveAt+30);
assert.equal(resolved.lastTrickSummary.result,0);
assert.equal(resolved.lastTrickSummary.winnerSeat,2);
assert.ok(resolved.lastTrickSummary.expiresAt>resolved.lastTrickSummary.at);
assert.equal(resolved.phase,'playing');
let awarded=prepared();awarded.trickResults=[0];awarded.round=1;
for(let i=0;i<4;i++)awarded=T.applyTrucoAction(awarded,i,{type:'PLAY_CARD',cardIdx:0});
awarded=T.tick(awarded,awarded.trickResolveAt+30);
assert.equal(awarded.scores[0],1);
assert.equal(awarded.round,0,'próxima mão distribuída corretamente');
assert.equal(awarded.lastHandSummary.team,0,'resumo de mão vencida não deve desaparecer após distribuição');
assert.ok(awarded.lastHandSummary.expiresAt>Date.now());
assert.equal(awarded.phase,'playing');
console.log('✔ Truco: carta vencedora, resumo da rodada/mão, privacidade e nova mão');

// Mão de 11: decisão continua no motor oficial, sem substituição visual dos dados secretos.
let eleven=init(2);eleven.scores=[10,4];
// Força uma nova mão com o placar de 11 usando o fluxo público de uma rodada encerrada.
eleven.trickResults=[0];eleven.round=1;eleven.current=0;
eleven.manilhaRank='6';eleven.hands={0:[cards[2]],2:[cards[0]]};
for(const seat of [0,2])eleven=T.applyTrucoAction(eleven,seat,{type:'PLAY_CARD',cardIdx:0});
eleven=T.tick(eleven,eleven.trickResolveAt+30);
assert.equal(eleven.phase,'eleven');
assert.equal(eleven.eleven.team,0);
eleven=T.applyTrucoAction(eleven,0,{type:'ELEVEN_DECISION',play:true});
assert.equal(eleven.phase,'playing');
assert.equal(eleven.handValue,3);
console.log('✔ Truco: mão de 11, aceitação e valor de 3 pontos preservados');

const st=C.createState({room:{code:'CHESS',chessClock:300},whitePlayer:human,blackPlayer:other});
assert.ok(C.legalMovesFrom(st,6,4).some(m=>m.to.r===4&&m.to.c===4));
const move=C.applyMove(st,{from:{r:6,c:4},to:{r:4,c:4}},'queen');
assert.equal(move.moveHistory.length,1);
assert.equal(move.moveHistory[0].from,'e2');
assert.equal(move.moveHistory[0].to,'e4');
assert.ok(Array.isArray(move.capturedWhite)&&Array.isArray(move.capturedBlack));
console.log('✔ Xadrez: relógio, movimento legal, notação e histórico mantidos');
