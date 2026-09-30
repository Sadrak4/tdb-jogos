
(function(){
'use strict';

const E=window.TDBChessEngine;
if(!E){
  console.error('[TDB JOGOS] A engine do Xadrez não foi carregada.');
}
let chess=null;
let chessClockTimer=null;
let lastClockTick=0;

function byColor(color){ return chess.players[color]; }
function localColor(){
  if(!chess || !state.user) return null;
  if(chess.onlineMode) return chess.localColor||null;
  if(chess.players.white.id===state.user.id) return 'white';
  if(chess.players.black.id===state.user.id) return 'black';
  return chess.spectatorMode ? 'white' : null;
}
function botColor(){
  const lc=localColor();
  return E.other(lc);
}
function chessMoveSound(){
  try{
    if(window.TDBCore?.sound?.tone){
      window.TDBCore.sound.tone({frequency:250,duration:.055,volume:.022,type:'triangle'});
    }else if(typeof playUiSound==='function'){
      playUiSound(250,.055);
    }
  }catch{}
}

function formatClock(sec){
  sec=Math.max(0,Math.ceil(sec));
  const m=Math.floor(sec/60),s=sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function chooseColors(room,players){
  const pref=room.chessColor||'random';
  if(pref==='white') return {white:players[0],black:players[1]};
  if(pref==='black') return {white:players[1],black:players[0]};
  return Math.random()<.5
    ? {white:players[0],black:players[1]}
    : {white:players[1],black:players[0]};
}

function startChessWithBot(){
  try{
    const active=state?.activeRoom;
    if(!active || active.game!=='chess'){
      if(typeof toast==='function') toast('Nenhuma sala de Xadrez ativa.');
      return;
    }
    if(!E || typeof E.createState!=='function'){
      if(typeof toast==='function') toast('A engine do Xadrez não foi carregada.');
      return;
    }

    const human={
      username:state.user.username,
      id:state.user.id,
      avatar:state.user.avatar || initials(state.user.username),
      bot:false
    };
    const bot={
      username:'Bot Xadrez',
      id:'BOT-CHESS',
      avatar:'♞',
      bot:true
    };

    const room={
      ...active,
      players:[human,bot],
      status:'playing',
      simulation:true
    };

    state.activeRoom=room;
    if(typeof saveActiveRoom==='function') saveActiveRoom(room);
    startChessGame(room,true);
  }catch(err){
    console.error('[TDB Xadrez] Falha ao iniciar teste com bot:',err);
    if(typeof toast==='function') toast('Não foi possível iniciar a partida com o bot.');
  }
}


function applyOnlineChessState(serverState,activeRoom,role='player'){
  clearInterval(chessClockTimer);
  chess=structuredClone(serverState);
  chess.onlineMode=true;
  chess.spectatorMode=role==='spectator';
  if(activeRoom) chess.room=structuredClone(activeRoom);
  window.__TDB_CHESS_STATE__=chess;
  renderChessScreen(true);
}
window.applyOnlineChessState=applyOnlineChessState;

function startChessGame(room,localBot=false){
  clearInterval(chessClockTimer);
  const players=room.players.slice(0,2);
  const colors=chooseColors(room,players);
  chess=E.createState({
    room,
    whitePlayer:colors.white,
    blackPlayer:colors.black
  });
  chess.localBot=localBot;
  chess.selectedSquare=null;
  state.activeRoom=room;
  window.__TDB_CHESS_STATE__=chess;
  renderChessScreen(true);
  startClock();
  maybeBotMove();
}

function startClock(){
  clearInterval(chessClockTimer);
  if(!chess?.clockEnabled) return;
  lastClockTick=performance.now();
  chessClockTimer=setInterval(()=>{
    if(!chess || chess.status!=='playing') return;
    const now=performance.now();
    const delta=(now-lastClockTick)/1000;
    lastClockTick=now;
    chess.clocks[chess.turn]-=delta;
    if(chess.clocks[chess.turn]<=0){
      chess.clocks[chess.turn]=0;
      chess.status='timeout';
      chess.winner=E.other(chess.turn);
      renderChessScreen(false);
      clearInterval(chessClockTimer);
      return;
    }
    updateClockDisplays();
  },250);
}

function updateClockDisplays(){
  for(const color of ['white','black']){
    const el=document.getElementById(`chessClock-${color}`);
    if(el) el.textContent=chess.clockEnabled?formatClock(chess.clocks[color]):'SEM RELÓGIO';
  }
}

function playerBar(color,position){
  const p=byColor(color);
  const turn=chess.turn===color && chess.status==='playing';
  return `<div class="chess-player-bar ${position} ${turn?'thinking':''}">
    <div class="chess-player-avatar">${escapeHtml(p.avatar||initials(p.username))}</div>
    <div class="chess-player-info">
      <strong>${escapeHtml(p.username)}</strong>
      <small>${color==='white'?'Brancas':'Pretas'} ${p.bot?'• BOT':''}</small>
    </div>
    <div class="chess-mini-captured">${capturedFor(color)}</div>
    <div class="chess-clock ${turn?'active':''}" id="chessClock-${color}">${chess.clockEnabled?formatClock(chess.clocks[color]):'SEM RELÓGIO'}</div>
  </div>`;
}

function capturedFor(color){
  const arr=color==='white'?chess.capturedWhite:chess.capturedBlack;
  return arr.map(p=>`<span>${E.displayPiece(p)}</span>`).join('');
}

function renderChessScreen(first=false){
  const root=document.getElementById('chessRoot');
  if(!root || first){
    app.innerHTML=`${topbar()}
    <section class="chess-screen" id="chessRoot">
      <aside class="chess-left-panel">
        <div class="chess-panel-brand">${logoTag()}<div><strong>TDB JOGOS</strong><span>XADREZ TRADICIONAL</span></div></div>
        <div class="chess-info-line"><span>Modo</span><strong>1x1 Tradicional</strong></div>
        <div class="chess-info-line"><span>Tempo</span><strong>${chess.clockEnabled?Math.floor(chess.room.chessClock/60)+' min':'Sem relógio'}</strong></div>
        <div class="chess-info-line"><span>Sala</span><strong>${escapeHtml(chess.room.code)}</strong></div>
        <div class="chess-info-line"><span>Status</span><strong id="chessStatusLabel">Em andamento</strong></div>
        <div class="chess-brand-watermark">${logoTag()}</div>
      </aside>

      <main class="chess-center">
        <div id="chessTopPlayer"></div>
        <div class="chess-board-shell">
          <div class="chess-board" id="chessBoard"></div>
        </div>
        <div id="chessBottomPlayer"></div>
      </main>

      <aside class="chess-right-panel">
        <div class="chess-side-section">
          <h3>HISTÓRICO DE JOGADAS</h3>
          <div class="chess-history" id="chessHistory"></div>
        </div>
        <div class="chess-side-section">
          <h3>PEÇAS CAPTURADAS</h3>
          <div class="captured-row"><span>Brancas</span><div id="capturedWhite"></div></div>
          <div class="captured-row"><span>Pretas</span><div id="capturedBlack"></div></div>
        </div>
        <div class="chess-side-actions">
          ${chess.spectatorMode?'':`<button class="btn btn-dark" onclick="offerChessDraw()">🤝 Empate</button>
          <button class="btn btn-danger" onclick="resignChess()">⚑ Desistir</button>`}
          <button class="btn btn-secondary full" onclick="copyCode('${chess.room.code}')">Copiar código da sala</button>
          <button class="btn btn-dark full" onclick="returnFromChess()">Voltar à sala</button>
        </div>
      </aside>
      <div id="chessOverlay"></div>
    </section>`;
  }
  updateChessUI();
}

function updateChessUI(){
  if(!chess) return;
  const lc=localColor();
  const opponent=E.other(lc);
  const top=lc==='white'?'black':'white';
  const bottom=lc;

  document.getElementById('chessTopPlayer').innerHTML=playerBar(top,'top');
  document.getElementById('chessBottomPlayer').innerHTML=playerBar(bottom,'bottom');
  renderBoard();
  renderHistory();
  document.getElementById('capturedWhite').innerHTML=chess.capturedWhite.map(E.displayPiece).join(' ');
  document.getElementById('capturedBlack').innerHTML=chess.capturedBlack.map(E.displayPiece).join(' ');
  document.getElementById('chessStatusLabel').textContent=statusText();
  document.getElementById('chessOverlay').innerHTML=renderOverlay();
  updateClockDisplays();
}

function statusText(){
  if(chess.status==='playing'){
    return E.isInCheck(chess,chess.turn)?'Xeque':'Em andamento';
  }
  if(chess.status==='checkmate') return 'Xeque-mate';
  if(chess.status==='stalemate') return 'Afogamento';
  if(chess.status==='draw') return 'Empate';
  if(chess.status==='resigned') return 'Desistência';
  if(chess.status==='timeout') return 'Tempo esgotado';
  return chess.status;
}

function boardOrientation(){
  return 'white';
}

function renderBoard(){
  const board=document.getElementById('chessBoard');
  if(!board) return;
  const rows=[0,1,2,3,4,5,6,7];
  const cols=[0,1,2,3,4,5,6,7];
  const legal=new Set(chess.legalMoves.map(m=>`${m.to.r},${m.to.c}`));
  const selected=chess.selectedSquare;
  const last=chess.lastMove;

  let html='';
  for(const r of rows){
    for(const c of cols){
      const p=chess.board[r][c];
      const dark=(r+c)%2===1;
      const sel=selected&&selected.r===r&&selected.c===c;
      const isLegal=legal.has(`${r},${c}`);
      const isLast=last&&((last.from.r===r&&last.from.c===c)||(last.to.r===r&&last.to.c===c));
      const kingCheck=p?.type==='king'&&p.color===chess.turn&&E.isInCheck(chess,p.color);
      const rankLabel=(c===cols[0]) ? `<span class="rank-label">${8-r}</span>` : '';
      const fileLabel=(r===rows[rows.length-1]) ? `<span class="file-label">${E.FILES[c].toUpperCase()}</span>` : '';
      html+=`<button class="chess-square ${dark?'dark':'light'} ${sel?'selected':''} ${isLegal?'legal':''} ${isLast?'last':''} ${kingCheck?'check':''}"
        onclick="clickChessSquare(${r},${c})">
        ${rankLabel}${fileLabel}
        ${p?`<span class="chess-piece ${p.color}">${E.displayPiece(p)}</span>`:''}
        ${isLegal?`<i class="legal-dot ${p?'capture':''}"></i>`:''}
      </button>`;
    }
  }
  board.innerHTML=html;
}

function clickChessSquare(r,c){
  if(!chess || chess.status!=='playing' || chess.spectatorMode) return;
  const mine=localColor();
  if(chess.turn!==mine) return toast('Aguarde a vez do adversário.');

  const p=chess.board[r][c];

  if(chess.selectedSquare){
    const move=chess.legalMoves.find(m=>m.to.r===r&&m.to.c===c);
    if(move){
      if(chess.onlineMode){
        chess.selectedSquare=null;
        chess.legalMoves=[];
        updateChessUI();
        return OnlineGameBridge.action({
          type:'MOVE',
          from:move.from,
          to:move.to,
          castle:move.castle||null,
          promotion:'queen'
        });
      }
      return makeChessMove(move);
    }
  }

  if(p && p.color===chess.turn && p.color===mine){
    chess.selectedSquare={r,c};
    chess.legalMoves=E.legalMovesFrom(chess,r,c);
  }else{
    chess.selectedSquare=null;
    chess.legalMoves=[];
  }
  updateChessUI();
}

function makeChessMove(move,promotion='queen'){
  if(!chess || chess.status!=='playing' || !move) return false;

  const legal=E.legalMovesFrom(chess,move.from.r,move.from.c);
  const valid=legal.find(m=>
    m.to.r===move.to.r &&
    m.to.c===move.to.c &&
    (m.castle||'')===(move.castle||'')
  );

  if(!valid){
    console.warn('[TDB Xadrez] Movimento inválido rejeitado:',move);
    return false;
  }

  const movingColor=chess.turn; const hadOpponentOffer=chess.drawOffer && chess.drawOffer!==movingColor;
  chess=E.applyMove(chess,valid,promotion);
  if(hadOpponentOffer) chess.drawOffer=null;
  window.__TDB_CHESS_STATE__=chess;
  chessMoveSound();
  renderChessScreen(false);

  if(chess.status==='playing') setTimeout(maybeBotMove,80);
  return true;
}

function maybeBotMove(){
  if(!chess || !chess.localBot || chess.status!=='playing') return;

  const color=botColor();
  if(chess.turn!==color) return;

  const bot=byColor(color);
  if(!bot?.bot) return;

  setTimeout(()=>{
    try{
      if(!chess || chess.status!=='playing' || chess.turn!==color) return;

      const legalMoves=E.allLegalMoves(chess,color);
      if(!legalMoves.length){
        renderChessScreen(false);
        return;
      }

      let chosen=null;

      if(typeof E.bestLegalMoves==='function'){
        try{
          const ranked=E.bestLegalMoves(chess,color);
          if(ranked?.length){
            const bestScore=ranked[0].score;
            const candidates=ranked.filter(x=>x.score>=bestScore-120).slice(0,5);
            chosen=(candidates[Math.floor(Math.random()*candidates.length)] || ranked[0])?.move || null;
          }
        }catch(err){
          console.warn('[TDB Xadrez] Ranking do bot falhou; usando jogadas legais simples.',err);
        }
      }

      if(!chosen){
        const captures=legalMoves.filter(m=>chess.board[m.to.r][m.to.c] || m.enPassant);
        const pool=captures.length ? captures : legalMoves;
        chosen=pool[Math.floor(Math.random()*pool.length)];
      }

      if(!makeChessMove(chosen,'queen')){
        for(const fallback of legalMoves){
          if(makeChessMove(fallback,'queen')) break;
        }
      }
    }catch(err){
      console.error('[TDB Xadrez] Erro no turno do bot:',err);
    }
  },450+Math.random()*250);
}

function renderHistory(){
  const box=document.getElementById('chessHistory');
  if(!box) return;
  const grouped=[];
  for(const m of chess.moveHistory){
    let row=grouped.find(x=>x.number===m.number);
    if(!row){ row={number:m.number,white:'',black:''}; grouped.push(row); }
    row[m.color]=m.notation;
  }
  box.innerHTML=grouped.length
    ? grouped.slice(-18).map(r=>`<div class="history-row"><span>${r.number}.</span><strong>${r.white||''}</strong><strong>${r.black||''}</strong></div>`).join('')
    : `<div class="chess-empty">A partida ainda não teve movimentos.</div>`;
  box.scrollTop=box.scrollHeight;
}

function renderOverlay(){
  if(chess.status==='playing' && chess.drawOffer && chess.drawOffer!==localColor()){
    return `<div class="draw-offer-toast"><div><strong>Proposta de empate</strong><span>O adversário ofereceu empate. Você pode responder ou simplesmente jogar.</span></div><div class="choices"><button class="btn btn-primary" onclick="acceptChessDraw()">Aceitar</button><button class="btn btn-dark" onclick="declineChessDraw()">Recusar</button></div></div>`;
  }
  if(chess.status==='checkmate'){
    return resultModal('XEQUE-MATE',chess.winner===localColor()?'Você venceu a partida.':'Seu adversário venceu a partida.');
  }
  if(chess.status==='stalemate' || chess.status==='draw'){
    return resultModal('EMPATE',chess.drawReason||'Partida empatada.');
  }
  if(chess.status==='resigned'){
    return resultModal('PARTIDA ENCERRADA',chess.winner===localColor()?'O adversário desistiu.':'Você desistiu.');
  }
  if(chess.status==='timeout'){
    return resultModal('TEMPO ESGOTADO',chess.winner===localColor()?'Você venceu por tempo.':'Você perdeu por tempo.');
  }
  return '';
}

function resultModal(title,text){
  return `<div class="chess-modal-backdrop"><div class="chess-result-modal">${logoTag()}<h2>${title}</h2><p>${text}</p><div class="choices"><button class="btn btn-primary" onclick="restartChess()">Nova partida</button><button class="btn btn-dark" onclick="returnFromChess()">Voltar à sala</button></div></div></div>`;
}

function offerChessDraw(){
  if(!chess || chess.status!=='playing' || chess.spectatorMode) return;
  if(chess.onlineMode) return OnlineGameBridge.action({type:'OFFER_DRAW'});

  const mine=localColor();
  if(!mine) return;
  chess.drawOffer=mine;
  toast('Proposta de empate enviada.');
  updateChessUI();

  if(chess.localBot){
    const offeredBy=mine;
    setTimeout(()=>{
      if(!chess || chess.status!=='playing' || chess.drawOffer!==offeredBy) return;
      if(Math.random()<.35){
        chess.status='draw';chess.drawReason='acordo entre jogadores';chess.drawOffer=null;renderChessScreen(false);
      }else{
        chess.drawOffer=null;toast('O Bot Xadrez recusou o empate.');renderChessScreen(false);
      }
    },650);
  }
}
function acceptChessDraw(){
  if(chess?.onlineMode) return OnlineGameBridge.action({type:'ACCEPT_DRAW'});
  chess.status='draw'; chess.drawReason='acordo entre jogadores'; chess.drawOffer=null; renderChessScreen(false);
}
function declineChessDraw(){
  if(chess?.onlineMode) return OnlineGameBridge.action({type:'DECLINE_DRAW'});
  chess.drawOffer=null; renderChessScreen(false);
}
function resignChess(){
  if(!chess || chess.status!=='playing' || chess.spectatorMode) return;
  if(!confirm('Tem certeza que deseja desistir da partida?')) return;
  if(chess.onlineMode) return OnlineGameBridge.action({type:'RESIGN'});
  chess.status='resigned'; chess.winner=E.other(localColor()); renderChessScreen(false);
}
function restartChess(){
  clearInterval(chessClockTimer);
  startChessGame(chess.room,chess.localBot);
}
function returnFromChess(){
  clearInterval(chessClockTimer);
  renderWaitingRoom();
}

function renderChessSpectator(room){
  if(window.__TDB_CHESS_STATE__){
    chess=window.__TDB_CHESS_STATE__; chess.spectatorMode=true; renderChessScreen(true);
    const actions=document.querySelector('.chess-side-actions'); if(actions) actions.innerHTML=`<button class="btn btn-dark full" onclick="leaveRoom()">Sair da transmissão</button>`;
  }else{
    app.innerHTML=`${topbar()}<section class="spectator-placeholder">${logoTag()}<h1>Assistindo Xadrez</h1><p>O estado ao vivo ficará disponível quando a partida estiver conectada ao backend online.</p><button class="btn btn-secondary" onclick="leaveRoom()">Voltar</button></section>`;
  }
}
window.renderChessSpectator=renderChessSpectator;

window.startChessGame=startChessGame;
window.startChessWithBot=startChessWithBot;
window.clickChessSquare=clickChessSquare;
window.offerChessDraw=offerChessDraw;
window.acceptChessDraw=acceptChessDraw;
window.declineChessDraw=declineChessDraw;
window.resignChess=resignChess;
window.restartChess=restartChess;
window.returnFromChess=returnFromChess;
})();
