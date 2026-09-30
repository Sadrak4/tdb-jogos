(function(){
'use strict';

let blackjack=null;
let betDraft=null;
let ticker=null;
let pendingAction=false;
let lastEventId=null;

const SUIT_SYMBOL={clubs:'♣',diamonds:'♦',hearts:'♥',spades:'♠'};
const SUIT_RED=new Set(['diamonds','hearts']);

function esc(v=''){return typeof escapeHtml==='function'?escapeHtml(v):String(v)}
function chips(v=0){return Number(v||0).toLocaleString('pt-BR')}
function localPlayer(){return blackjack?.players?.find(p=>p.id===blackjack.localPlayerId)||null}
function room(){return state?.activeRoom||blackjack?.room||null}
function isHost(){return room()?.ownerId===state?.user?.id}
function cardLabel(card){return card?`${card.rank}${SUIT_SYMBOL[card.suit]||''}`:'Carta fechada'}
function cardHtml(card,{mini=false}={}){
  if(!card)return `<div class="bj-card bj-card-back ${mini?'mini':''}" aria-label="Carta fechada"><span class="bj-back-mark">TDB</span></div>`;
  const red=SUIT_RED.has(card.suit);
  return `<div class="bj-card ${red?'red':''} ${mini?'mini':''}" title="${esc(cardLabel(card))}">
    <div class="bj-card-corner"><b>${esc(card.rank)}</b><span>${SUIT_SYMBOL[card.suit]||''}</span></div>
    <div class="bj-card-suit">${SUIT_SYMBOL[card.suit]||''}</div>
    <div class="bj-card-corner bottom"><b>${esc(card.rank)}</b><span>${SUIT_SYMBOL[card.suit]||''}</span></div>
  </div>`;
}
function handValueLabel(hand){
  if(!hand)return'';
  if(hand.natural)return'BLACKJACK';
  if(hand.bust)return`${hand.value} • ESTOUROU`;
  return String(hand.value??'');
}
function resultLabel(result){return({win:'VITÓRIA',loss:'DERROTA',push:'EMPATE',blackjack:'BLACKJACK'})[result]||''}
function resultClass(result){return result==='loss'?'lose':result==='push'?'push':'win'}
function phaseLabel(){
  if(!blackjack)return'';
  if(blackjack.phase==='betting')return'APOSTAS ABERTAS';
  if(blackjack.phase==='playerTurns')return blackjack.currentPlayerId===blackjack.localPlayerId?'SUA VEZ':`VEZ DE ${esc(blackjack.players.find(p=>p.id===blackjack.currentPlayerId)?.username||'JOGADOR')}`;
  if(blackjack.phase==='dealerTurn')return'DEALER JOGANDO';
  if(blackjack.phase==='roundEnd')return'RODADA ENCERRADA';
  return String(blackjack.phase||'').toUpperCase();
}
function localAvailable(){
  const p=localPlayer();
  return p?.availableActions||{hit:false,stand:false,double:false,split:false};
}
function relativePlayers(){
  const players=(blackjack?.players||[]).filter(p=>!p.left);
  const me=localPlayer();
  if(!me){
    return players.map((p,i)=>({player:p,pos:['left','bottom','right'][i]||'right'}));
  }
  const others=players.filter(p=>p.id!==me.id);
  const out=[{player:me,pos:'bottom'}];
  if(others.length===1)out.push({player:others[0],pos:'left'});
  if(others.length>=2){out.push({player:others[0],pos:'left'});out.push({player:others[1],pos:'right'})}
  return out;
}
function handHtml(hand,index,p,isLocal){
  const active=blackjack.phase==='playerTurns'&&blackjack.currentPlayerId===p.id&&p.activeHand===index&&hand.status==='playing';
  const cards=(hand.cards||[]).map(c=>cardHtml(c,{mini:!isLocal})).join('');
  const result=hand.result?`<span class="bj-hand-result ${resultClass(hand.result)}">${resultLabel(hand.result)}</span>`:'';
  return `<div class="bj-hand ${active?'active':''} ${hand.status==='bust'?'bust':''}">
    ${p.hands.length>1?`<div class="bj-hand-title">MÃO ${index+1}${hand.doubled?' • DOBRADA':''}</div>`:''}
    <div class="bj-hand-cards">${cards}</div>
    <div class="bj-hand-meta"><strong>${handValueLabel(hand)}</strong><span>● ${chips(hand.bet)} fichas</span>${result}</div>
  </div>`;
}
function playerPanel(p,pos){
  const isLocal=p.id===blackjack.localPlayerId;
  const current=blackjack.currentPlayerId===p.id&&blackjack.phase==='playerTurns';
  const waiting=p.waitingNextRound;
  const disconnected=p.connection==='reconnecting';
  return `<article class="bj-player bj-player-${pos} ${isLocal?'local':''} ${current?'current':''} ${waiting?'waiting':''}">
    <header class="bj-player-head">
      <div class="bj-avatar">${esc(p.avatar||String(p.username||'?').slice(0,2).toUpperCase())}</div>
      <div><strong>${esc(isLocal?'VOCÊ':p.username)}</strong><small>${waiting?'Aguardando próxima rodada':disconnected?'Reconectando…':p.sittingOut?'Sem fichas suficientes':'● '+chips(p.bankroll)+' fichas'}</small></div>
      ${current?'<span class="bj-turn-chip">JOGANDO</span>':''}
    </header>
    <div class="bj-player-hands">${(p.hands||[]).length?p.hands.map((h,i)=>handHtml(h,i,p,isLocal)).join(''):`<div class="bj-empty-hand">${waiting?'ENTRA NA PRÓXIMA':'AGUARDANDO APOSTA'}</div>`}</div>
  </article>`;
}
function dealerHtml(){
  const d=blackjack.dealer||{cards:[]};
  const cards=(d.cards||[]).map(c=>cardHtml(c)).join('');
  const showValue=(d.cards||[]).length?`<span class="bj-dealer-value">${d.value??''}</span>`:'';
  return `<section class="bj-dealer ${blackjack.phase==='dealerTurn'?'active':''}">
    <div class="bj-dealer-title"><span>DEALER</span>${showValue}<small>PARA EM 17</small></div>
    <div class="bj-dealer-cards">${cards||'<div class="bj-card-placeholder"></div><div class="bj-card-placeholder"></div>'}</div>
  </section>`;
}
function timerSeconds(){
  const target=blackjack?.phase==='roundEnd'?blackjack.nextRoundAt:blackjack?.turnDeadlineAt;
  if(!target)return null;
  return Math.max(0,Math.ceil((Number(target)-Date.now())/1000));
}
function timerHtml(){
  const sec=timerSeconds();
  if(sec===null)return'';
  return `<span class="bj-clock" id="bjClock">${sec}s</span>`;
}
function bettingControls(p){
  if(!p)return `<div class="bj-control-message">Você está assistindo esta mesa.</div>`;
  if(p.waitingNextRound)return `<div class="bj-control-message waiting"><b>Você entrou durante a rodada.</b><span>Suas cartas chegam automaticamente na próxima.</span></div>`;
  if(p.bankroll<blackjack.rules.minBet||p.sittingOut){
    return `<div class="bj-control-message"><b>Suas fichas acabaram.</b><span>Como são fichas virtuais da mesa, você pode recarregar gratuitamente.</span><button class="bj-action primary" onclick="bjRebuy()">RECARREGAR ${chips(blackjack.rules.startingChips)}</button></div>`;
  }
  if(p.ready)return `<div class="bj-control-message ready"><b>APOSTA CONFIRMADA</b><span>${chips(p.bet)} fichas • aguardando os outros jogadores</span></div>`;
  if(betDraft===null)betDraft=Math.min(Math.max(p.bet||blackjack.rules.minBet,blackjack.rules.minBet),p.bankroll);
  betDraft=Math.max(blackjack.rules.minBet,Math.min(betDraft,p.bankroll));
  const step=blackjack.rules.minBet;
  return `<div class="bj-bet-panel">
    <div class="bj-bet-copy"><span>SUA APOSTA</span><strong id="bjBetValue">${chips(betDraft)}</strong><small>Saldo: ${chips(p.bankroll)} • mínima ${chips(step)}</small></div>
    <div class="bj-bet-adjust"><button onclick="bjAdjustBet(-${step})">−</button><button onclick="bjSetBet(${step})">${chips(step)}</button><button onclick="bjSetBet(${step*2})">${chips(step*2)}</button><button onclick="bjSetBet(${step*4})">${chips(step*4)}</button><button onclick="bjAdjustBet(${step})">+</button></div>
    <button class="bj-action primary wide" onclick="bjConfirmBet()" ${pendingAction?'disabled':''}>CONFIRMAR APOSTA</button>
  </div>`;
}
function playingControls(p){
  if(!p)return `<div class="bj-control-message">Você está assistindo a rodada.</div>`;
  if(p.waitingNextRound)return `<div class="bj-control-message waiting"><b>AGUARDANDO PRÓXIMA RODADA</b><span>Você pode acompanhar as cartas enquanto espera.</span></div>`;
  if(blackjack.currentPlayerId!==p.id)return `<div class="bj-control-message"><b>${phaseLabel()}</b><span>Suas decisões aparecem quando chegar sua vez.</span></div>`;
  const a=localAvailable();
  return `<div class="bj-actions">
    <button class="bj-action hit" onclick="bjAction('HIT')" ${!a.hit||pendingAction?'disabled':''}><span>＋</span>PEDIR</button>
    <button class="bj-action stand" onclick="bjAction('STAND')" ${!a.stand||pendingAction?'disabled':''}><span>■</span>PARAR</button>
    ${a.double?`<button class="bj-action double" onclick="bjAction('DOUBLE')" ${pendingAction?'disabled':''}><span>×2</span>DOBRAR</button>`:''}
    ${a.split?`<button class="bj-action split" onclick="bjAction('SPLIT')" ${pendingAction?'disabled':''}><span>↔</span>SEPARAR</button>`:''}
  </div>`;
}
function roundEndControls(p){
  const sec=timerSeconds()??0;
  if(p?.waitingNextRound)return `<div class="bj-control-message waiting"><b>AGUARDANDO PRÓXIMA RODADA</b><span>Você entrou com a rodada em andamento e começa quando as apostas abrirem.</span><small>Próxima rodada em <strong id="bjNextRound">${sec}s</strong></small></div>`;
  const hands=p?.hands||[];
  const summary=hands.map((h,i)=>`${hands.length>1?`Mão ${i+1}: `:''}${resultLabel(h.result)} ${h.payout?`• retorno ${chips(h.payout)}`:''}`).join(' · ');
  return `<div class="bj-control-message result ${p?.roundResult||''}">
    <b>${p?((p.roundNet||0)>0?`+${chips(p.roundNet)} FICHAS`:(p.roundNet||0)<0?`-${chips(Math.abs(p.roundNet))} FICHAS`:'EMPATE'):'RODADA ENCERRADA'}</b>
    <span>${esc(summary||'O dealer encerrou a rodada.')}</span>
    <small>Próxima rodada em <strong id="bjNextRound">${sec}s</strong></small>
    ${isHost()?'<button class="bj-action subtle" onclick="bjNextRound()">ADIANTAR PRÓXIMA RODADA</button>':''}
  </div>`;
}
function controlsHtml(){
  const p=localPlayer();
  if(blackjack.phase==='betting')return bettingControls(p);
  if(blackjack.phase==='playerTurns')return playingControls(p);
  if(blackjack.phase==='dealerTurn')return `<div class="bj-control-message dealer"><b>DEALER JOGANDO</b><span>A carta fechada foi revelada. O dealer compra até chegar a 17.</span></div>`;
  if(blackjack.phase==='roundEnd')return roundEndControls(p);
  return'';
}
function activityHtml(){
  const events=(blackjack.events||[]).slice(-4).reverse();
  return events.map(e=>`<div class="bj-event"><i></i><span>${esc(e.message)}</span></div>`).join('');
}
function tableBody(){
  const layouts=relativePlayers();
  const left=layouts.find(x=>x.pos==='left');
  const right=layouts.find(x=>x.pos==='right');
  const bottom=layouts.find(x=>x.pos==='bottom');
  return `<div class="bj-stage">
    <div class="bj-table-glow"></div>
    <div class="bj-felt-mark"><b>TDB</b><span>BLACKJACK</span><small>BLACKJACK PAYS 3:2 • DEALER STANDS ON 17</small></div>
    ${dealerHtml()}
    ${left?playerPanel(left.player,'left'):''}
    ${right?playerPanel(right.player,'right'):''}
    ${bottom?playerPanel(bottom.player,'bottom'):''}
    <div class="bj-center-status"><span>${phaseLabel()}</span>${timerHtml()}<small>RODADA ${blackjack.round} • SHOE ${blackjack.shoeNumber} • ${blackjack.shoeRemaining} cartas</small></div>
  </div>`;
}
function renderBody(){
  const root=document.getElementById('blackjackRoot');
  if(!root||!blackjack)return;
  root.innerHTML=`<div class="bj-toolbar">
      <div><span class="bj-eyebrow">BLACKJACK TDB</span><h1>${esc(room()?.name||'Mesa Blackjack')}</h1><p>${esc(room()?.code||'')} • até 3 jogadores contra o dealer</p></div>
      <div class="bj-toolbar-actions"><button class="btn btn-secondary" onclick="copyCode('${esc(room()?.code||'')}')">Copiar código</button><button class="btn btn-dark" onclick="bjLeaveTable()">Sair da mesa</button></div>
    </div>
    <div class="bj-layout">
      <main class="bj-table-wrap">${tableBody()}<section class="bj-controls">${controlsHtml()}</section></main>
      <aside class="bj-sidebar">
        <div class="bj-side-card"><span>REGRAS DA MESA</span><dl><div><dt>Aposta mínima</dt><dd>${chips(blackjack.rules.minBet)}</dd></div><div><dt>Fichas iniciais</dt><dd>${chips(blackjack.rules.startingChips)}</dd></div><div><dt>Baralhos</dt><dd>${blackjack.rules.decks}</dd></div><div><dt>Turno</dt><dd>${blackjack.rules.turnTimer?blackjack.rules.turnTimer+'s':'∞'}</dd></div><div><dt>Split máximo</dt><dd>${blackjack.rules.maxHands} mãos</dd></div></dl></div>
        <div class="bj-side-card"><span>ATIVIDADE</span><div class="bj-events">${activityHtml()}</div></div>
      </aside>
    </div>`;
  updateTicker();
}
function mount(){
  app.innerHTML=`${topbar()}<section class="blackjack-page"><div id="blackjackRoot"></div></section>`;
  renderBody();
}
function playNewEvents(previous,incoming){
  const events=incoming.events||[];
  const prevIds=new Set((previous?.events||[]).map(e=>e.id));
  for(const e of events.filter(e=>!prevIds.has(e.id)).slice(-5)){
    if(e.type==='deal')window.TDBSound?.play?.('blackjackDeal',{channel:e.id,dedupeMs:0});
    if(e.type==='hit'||e.type==='dealer-hit')window.TDBSound?.play?.('blackjackCard',{channel:e.id,dedupeMs:0});
    if(e.type==='stand')window.TDBSound?.play?.('blackjackStand',{channel:e.id,dedupeMs:0});
    if(e.type==='double')window.TDBSound?.play?.('blackjackDouble',{channel:e.id,dedupeMs:0});
    if(e.type==='split')window.TDBSound?.play?.('blackjackSplit',{channel:e.id,dedupeMs:0});
    if(e.type==='dealer')window.TDBSound?.play?.('dealerFlip',{channel:e.id,dedupeMs:0});
    if(e.type==='bust'&&e.playerId===incoming.localPlayerId)window.TDBSound?.play?.('blackjackBust',{channel:e.id,dedupeMs:0});
  }
  if(previous?.phase!=='roundEnd'&&incoming.phase==='roundEnd'){
    const me=incoming.players?.find(p=>p.id===incoming.localPlayerId);
    if((me?.roundNet||0)>0)window.TDBSound?.play?.('blackjackWin',{channel:`round-${incoming.round}`,dedupeMs:0});
    else if((me?.roundNet||0)<0)window.TDBSound?.play?.('blackjackLose',{channel:`round-${incoming.round}`,dedupeMs:0});
  }
}
function updateTicker(){
  clearInterval(ticker);
  ticker=setInterval(()=>{
    if(!blackjack)return;
    const sec=timerSeconds();
    const clock=document.getElementById('bjClock');if(clock&&sec!==null)clock.textContent=`${sec}s`;
    const next=document.getElementById('bjNextRound');if(next&&sec!==null)next.textContent=`${sec}s`;
  },250);
}

window.applyOnlineBlackjackState=function(serverState,activeRoom,role='player'){
  const previous=blackjack;
  const incoming=structuredClone(serverState);
  incoming.role=role;
  incoming.room=activeRoom?structuredClone(activeRoom):room();
  playNewEvents(previous,incoming);
  blackjack=incoming;
  state.view='playing-blackjack';
  if(activeRoom){state.activeRoom=activeRoom;Core.rooms.setActive(activeRoom)}
  const me=localPlayer();
  if(me&&betDraft===null)betDraft=Math.max(blackjack.rules.minBet,Math.min(me.bet||blackjack.rules.minBet,me.bankroll||blackjack.rules.minBet));
  if(previous&&Number(previous.version||0)===Number(incoming.version||0)&&document.getElementById('blackjackRoot'))return;
  pendingAction=false;
  if(!document.getElementById('blackjackRoot'))mount();else renderBody();
};
window.renderBlackjackSpectator=function(roomData){state.view='playing-blackjack';OnlineGameBridge.start(roomData,'spectator')};
window.bjAdjustBet=function(delta){const p=localPlayer();if(!p||p.ready)return;betDraft=Math.max(blackjack.rules.minBet,Math.min((betDraft??p.bet??blackjack.rules.minBet)+Number(delta||0),p.bankroll));renderBody()};
window.bjSetBet=function(amount){const p=localPlayer();if(!p||p.ready)return;betDraft=Math.max(blackjack.rules.minBet,Math.min(Number(amount||0),p.bankroll));renderBody()};
window.bjConfirmBet=async function(){if(pendingAction)return;pendingAction=true;renderBody();const ok=await OnlineGameBridge.action({type:'PLACE_BET',amount:betDraft});if(!ok){pendingAction=false;renderBody()}};
window.bjRebuy=async function(){if(pendingAction)return;pendingAction=true;const ok=await OnlineGameBridge.action({type:'REBUY'});if(!ok)pendingAction=false};
window.bjAction=async function(type){if(pendingAction)return;pendingAction=true;renderBody();const ok=await OnlineGameBridge.action({type});if(!ok){pendingAction=false;renderBody()}};
window.bjNextRound=async function(){if(pendingAction)return;pendingAction=true;const ok=await OnlineGameBridge.action({type:'NEXT_ROUND'});if(!ok)pendingAction=false};
window.bjLeaveTable=function(){clearInterval(ticker);blackjack=null;betDraft=null;pendingAction=false;OnlineGameBridge.stop();leaveRoom()};
window.__getBlackjackState=()=>blackjack;
})();
