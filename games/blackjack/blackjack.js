(function(){
'use strict';

let blackjack=null;
let betDraft=null;
let ticker=null;
let pendingAction=false;
let lastEventId=null;
let pendingVisualEffects=[];

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

function chipTone(amount=0){
  const n=Number(amount||0);
  if(n<=25)return'charcoal';
  if(n<=50)return'red';
  if(n<=100)return'green';
  if(n<=250)return'blue';
  if(n<=500)return'violet';
  return'gold';
}
function chipStackHtml(amount,{compact=false,label=true}={}){
  const n=Math.max(0,Math.floor(Number(amount||0)));
  if(!n)return'';
  const layers=compact?3:Math.min(5,Math.max(3,Math.ceil(String(n).length/2)+1));
  return `<span class="bj-chip-stack ${compact?'compact':''} tone-${chipTone(n)}" aria-label="${chips(n)} fichas">
    <span class="bj-chip-pile">${Array.from({length:layers},(_,i)=>`<i style="--chip-i:${i}"></i>`).join('')}</span>
    ${label?`<b>${chips(n)}</b>`:''}
  </span>`;
}
function totalWager(p){
  if(!p)return 0;
  if((p.hands||[]).length)return p.hands.reduce((sum,h)=>sum+Number(h.bet||0),0);
  return p.ready?Number(p.bet||0):0;
}
function chipChoice(amount){
  return `<button class="bj-chip-choice tone-${chipTone(amount)}" onclick="bjSetBet(${amount})" title="Apostar ${chips(amount)} fichas"><i></i><b>${chips(amount)}</b></button>`;
}
function findPlayerDom(playerId,selector=''){
  return Array.from(document.querySelectorAll('[data-bj-player-id]')).find(el=>el.dataset.bjPlayerId===String(playerId))?.querySelector(selector)||null;
}
function findWagerDom(playerId){
  return Array.from(document.querySelectorAll('[data-bj-wager-player]')).find(el=>el.dataset.bjWagerPlayer===String(playerId))||null;
}
function animateChipFlight(effect){
  const toTable=effect.kind!=='chips-return';
  const source=toTable?findPlayerDom(effect.playerId,'.bj-player-chip-bank'):findWagerDom(effect.playerId);
  const target=toTable?findWagerDom(effect.playerId):findPlayerDom(effect.playerId,'.bj-player-chip-bank');
  if(!source||!target)return;

  const a=source.getBoundingClientRect();
  const b=target.getBoundingClientRect();
  if(!a.width||!b.width)return;

  const flight=document.createElement('div');
  flight.className=`bj-chip-flight tone-${chipTone(effect.amount||50)}`;
  flight.innerHTML='<i></i><i></i><i></i>';
  flight.style.left=`${a.left+a.width/2-18}px`;
  flight.style.top=`${a.top+a.height/2-18}px`;
  document.body.appendChild(flight);

  const dx=(b.left+b.width/2)-(a.left+a.width/2);
  const dy=(b.top+b.height/2)-(a.top+a.height/2);
  const anim=flight.animate([
    {transform:'translate3d(0,0,0) scale(.82) rotate(0deg)',opacity:.15},
    {transform:`translate3d(${dx*.55}px,${dy*.55-34}px,0) scale(1.08) rotate(170deg)`,opacity:1,offset:.58},
    {transform:`translate3d(${dx}px,${dy}px,0) scale(.9) rotate(310deg)`,opacity:.9}
  ],{duration:620,easing:'cubic-bezier(.2,.76,.2,1)',fill:'forwards'});
  anim.onfinish=()=>flight.remove();
}
function flushVisualEffects(){
  if(!pendingVisualEffects.length)return;
  const effects=pendingVisualEffects.splice(0);
  requestAnimationFrame(()=>{
    effects.forEach((effect,index)=>setTimeout(()=>animateChipFlight(effect),index*110));
  });
}
function wagersHtml(layouts){
  return `<div class="bj-table-wagers" aria-label="Apostas na mesa">
    <div class="bj-wagers-title">APOSTAS NA MESA</div>
    ${layouts.map(({player,pos})=>{
      const amount=totalWager(player);
      if(!amount)return'';
      return `<div class="bj-wager-spot wager-${pos}" data-bj-wager-player="${esc(player.id)}">
        ${chipStackHtml(amount,{compact:true})}
        <span>${esc(player.id===blackjack.localPlayerId?'VOCÊ':player.username)}</span>
      </div>`;
    }).join('')}
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

function recentBlackjackEvent(type,playerId=null,windowMs=1400){
  const now=Date.now();
  return [...(blackjack?.events||[])].reverse().find(e=>
    e.type===type &&
    (playerId===null||e.playerId===playerId) &&
    now-Number(e.at||0)<=windowMs
  )||null;
}
function dealerActionText(){
  if(blackjack.phase==='dealerTurn'){
    const last=[...(blackjack.events||[])].reverse().find(e=>['dealer','dealer-hit','dealer-stand','dealer-bust'].includes(e.type));
    if(last?.type==='dealer')return'DEALER REVELA A CARTA';
    if(last?.type==='dealer-hit')return'DEALER COMPRA';
    if(last?.type==='dealer-bust')return'DEALER ESTOUROU';
    if(last?.type==='dealer-stand')return'DEALER PAROU';
    return'DEALER JOGANDO';
  }
  return'';
}
function roundSummaryHtml(){
  if(blackjack.phase!=='roundEnd')return'';
  const dealer=blackjack.dealer||{};
  const rows=(blackjack.players||[]).filter(p=>p.hands?.length&&!p.left).map(p=>{
    const net=Number(p.roundNet||0);
    const result=net>0?'win':net<0?'lose':'push';
    const handText=p.hands.map((h,i)=>`${p.hands.length>1?`M${i+1} `:''}${resultLabel(h.result)} ${handValueLabel(h)}`).join(' • ');
    return `<div class="bj-round-summary-row ${result}">
      <span>${esc(p.id===blackjack.localPlayerId?'VOCÊ':p.username)}</span>
      <strong>${esc(handText)}</strong>
      <b>${net>0?'+':''}${chips(net)}</b>
    </div>`;
  }).join('');
  return `<div class="bj-round-summary">
    <div class="bj-round-summary-head">
      <span>RESUMO DA RODADA ${blackjack.round}</span>
      <strong>Dealer ${dealer.bust?'estourou em ':''}${dealer.value??'—'}</strong>
    </div>
    <div class="bj-round-summary-list">${rows}</div>
  </div>`;
}

function handHtml(hand,index,p,isLocal){
  const active=blackjack.phase==='playerTurns'&&blackjack.currentPlayerId===p.id&&p.activeHand===index&&hand.status==='playing';
  const cards=(hand.cards||[]).map(c=>cardHtml(c,{mini:false})).join('');
  const result=hand.result?`<span class="bj-hand-result ${resultClass(hand.result)}">${resultLabel(hand.result)}</span>`:'';
  const splitAnimated=p.hands.length>1&&!!recentBlackjackEvent('split',p.id);
  return `<div class="bj-hand ${active?'active':''} ${hand.status==='bust'?'bust':''} ${splitAnimated?'split-arrive':''}">
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
  const wager=totalWager(p);

  return `<article class="bj-player bj-player-${pos} ${isLocal?'local':''} ${current?'current':''} ${waiting?'waiting':''}" data-bj-player-id="${esc(p.id)}">
    <header class="bj-player-head">
      <div class="bj-avatar">${esc(p.avatar||String(p.username||'?').slice(0,2).toUpperCase())}</div>
      <div class="bj-player-identity">
        <strong>${esc(isLocal?'VOCÊ':p.username)}</strong>
        <small>${waiting?'Aguardando próxima rodada':disconnected?'Reconectando…':p.sittingOut?'Sem fichas suficientes':`${chips(p.bankroll)} fichas disponíveis`}</small>
      </div>
      ${current?'<span class="bj-turn-chip">SUA VEZ</span>':''}
    </header>
    <div class="bj-player-hands">${(p.hands||[]).length?p.hands.map((h,i)=>handHtml(h,i,p,isLocal)).join(''):`<div class="bj-empty-hand">${waiting?'ENTRA NA PRÓXIMA':'AGUARDANDO APOSTA'}</div>`}</div>
    <div class="bj-player-chip-bank" data-bj-chip-source="${esc(p.id)}">
      ${chipStackHtml(p.bankroll||0,{compact:true})||'<span class="bj-no-chips">0</span>'}
      <span>${wager?`Na mesa: ${chips(wager)}`:'Fichas'}</span>
    </div>
  </article>`;
}
function dealerHtml(){
  const d=blackjack.dealer||{cards:[]};
  const cards=(d.cards||[]).map(c=>cardHtml(c)).join('');
  const showValue=(d.cards||[]).length?`<span class="bj-dealer-value">${d.value??''}</span>`:'';

  const action=dealerActionText();
  return `<section class="bj-dealer ${blackjack.phase==='dealerTurn'?'active':''}">
    <div class="bj-dealer-title"><span>DEALER</span>${showValue}<small>PARA EM 17</small></div>
    ${action?`<div class="bj-dealer-action">${esc(action)}</div>`:''}
    <div class="bj-dealer-cards">${cards||'<div class="bj-card-placeholder"></div><div class="bj-card-placeholder"></div>'}</div>
    <div class="bj-shoe" aria-hidden="true"><span>TDB</span><i></i><i></i><i></i></div>
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
    return `<div class="bj-control-message"><b>Suas fichas acabaram.</b><span>Recarregue as fichas virtuais da mesa para continuar.</span><button class="bj-action primary" onclick="bjRebuy()">RECARREGAR ${chips(blackjack.rules.startingChips)}</button></div>`;
  }
  if(p.ready)return `<div class="bj-control-message ready"><b>APOSTA NA MESA</b><span>${chipStackHtml(p.bet,{compact:true})} aguardando os outros jogadores</span></div>`;

  if(betDraft===null)betDraft=Math.min(Math.max(p.bet||blackjack.rules.minBet,blackjack.rules.minBet),p.bankroll);
  betDraft=Math.max(blackjack.rules.minBet,Math.min(betDraft,p.bankroll));
  const step=blackjack.rules.minBet;
  const options=[step,step*2,step*4,step*8].filter((v,i,a)=>v<=p.bankroll&&a.indexOf(v)===i).slice(0,4);

  return `<div class="bj-bet-panel">
    <div class="bj-bet-copy">
      <span>SUA APOSTA</span>
      <strong id="bjBetValue">${chips(betDraft)}</strong>
      <small>Saldo ${chips(p.bankroll)} • mínima ${chips(step)}</small>
    </div>
    <div class="bj-chip-choices">
      <button class="bj-bet-nudge" onclick="bjAdjustBet(-${step})">−</button>
      ${options.map(chipChoice).join('')}
      <button class="bj-bet-nudge" onclick="bjAdjustBet(${step})">+</button>
    </div>
    <button class="bj-action primary bj-confirm-bet" onclick="bjConfirmBet()" ${pendingAction?'disabled':''}>JOGAR FICHAS NA MESA</button>
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
    <div class="bj-rail bj-rail-top"></div>
    <div class="bj-rail bj-rail-bottom"></div>
    <div class="bj-felt-mark"><b>TDB</b><span>BLACKJACK</span><small>BLACKJACK PAYS 3 TO 2</small><small>DEALER MUST STAND ON 17</small></div>
    ${dealerHtml()}
    ${wagersHtml(layouts)}
    ${left?playerPanel(left.player,'left'):''}
    ${right?playerPanel(right.player,'right'):''}
    ${bottom?playerPanel(bottom.player,'bottom'):''}
    <div class="bj-center-status"><span>${phaseLabel()}</span>${timerHtml()}<small>RODADA ${blackjack.round} • ${blackjack.shoeRemaining} CARTAS</small></div>
    ${roundSummaryHtml()}
  </div>`;
}
function renderBody(){
  const root=document.getElementById('blackjackRoot');
  if(!root||!blackjack)return;

  root.innerHTML=`<div class="bj-toolbar">
      <div class="bj-toolbar-title">
        <span class="bj-eyebrow">BLACKJACK TDB</span>
        <strong>${esc(room()?.name||'Mesa Blackjack')}</strong>
        <small>${esc(room()?.code||'')} • 1–3 jogadores contra o dealer</small>
      </div>
      <div class="bj-toolbar-actions">
        <span class="bj-round-pill">Rodada ${blackjack.round}</span>
        <button class="btn btn-secondary" onclick="copyCode('${esc(room()?.code||'')}')">Copiar código</button>
        <button class="btn btn-dark" onclick="bjLeaveTable()">Sair</button>
      </div>
    </div>
    <div class="bj-layout">
      <main class="bj-table-wrap">
        ${tableBody()}
        <section class="bj-controls">${controlsHtml()}</section>
      </main>
      <aside class="bj-sidebar">
        <div class="bj-side-card rules">
          <span>REGRAS</span>
          <dl>
            <div><dt>Blackjack</dt><dd>3:2</dd></div>
            <div><dt>Dealer</dt><dd>para em 17</dd></div>
            <div><dt>Mínima</dt><dd>${chips(blackjack.rules.minBet)}</dd></div>
            <div><dt>Baralhos</dt><dd>${blackjack.rules.decks}</dd></div>
            <div><dt>Turno</dt><dd>${blackjack.rules.turnTimer?blackjack.rules.turnTimer+'s':'∞'}</dd></div>
            <div><dt>Split</dt><dd>${blackjack.rules.maxHands} mãos</dd></div>
          </dl>
        </div>
        <div class="bj-side-card activity">
          <span>ATIVIDADE DA MESA</span>
          <div class="bj-events">${activityHtml()}</div>
        </div>
      </aside>
    </div>`;

  updateTicker();
  flushVisualEffects();
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
    if(e.type==='dealer-stand')window.TDBSound?.play?.('blackjackStand',{channel:e.id,dedupeMs:0});
    if(e.type==='dealer-bust')window.TDBSound?.play?.('blackjackBust',{channel:e.id,dedupeMs:0});
    if(e.type==='bust'&&e.playerId===incoming.localPlayerId)window.TDBSound?.play?.('blackjackBust',{channel:e.id,dedupeMs:0});

    if(['bet','double','split'].includes(e.type)&&e.playerId){
      pendingVisualEffects.push({kind:'chips-to-table',playerId:e.playerId,amount:Number(e.amount||50)});
    }
    if(e.type==='payout'&&e.playerId&&Number(e.amount||0)>0){
      pendingVisualEffects.push({kind:'chips-return',playerId:e.playerId,amount:Number(e.amount||50)});
    }
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
