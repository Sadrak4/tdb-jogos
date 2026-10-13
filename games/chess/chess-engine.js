
(function(){
'use strict';

const PIECES = {
  white: { king:'♔', queen:'♕', rook:'♖', bishop:'♗', knight:'♘', pawn:'♙' },
  black: { king:'♚', queen:'♛', rook:'♜', bishop:'♝', knight:'♞', pawn:'♟' }
};

const FILES = ['a','b','c','d','e','f','g','h'];

function other(color){ return color === 'white' ? 'black' : 'white'; }
function inside(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function squareName(r,c){ return FILES[c] + (8-r); }
function parseSquare(s){ return {r:8-Number(s[1]), c:FILES.indexOf(s[0])}; }
function clone(obj){ return structuredClone(obj); }

function piece(type,color){ return {type,color,moved:false}; }

function initialBoard(){
  const b=Array.from({length:8},()=>Array(8).fill(null));
  const back=['rook','knight','bishop','queen','king','bishop','knight','rook'];
  for(let c=0;c<8;c++){
    b[0][c]=piece(back[c],'black');
    b[1][c]=piece('pawn','black');
    b[6][c]=piece('pawn','white');
    b[7][c]=piece(back[c],'white');
  }
  return b;
}

function positionKey(state){
  const rows=state.board.map(row=>row.map(p=>p?p.color[0]+p.type[0]:'--').join('')).join('/');
  return `${rows}|${state.turn}|${state.enPassantTarget||'-'}`;
}

function createState({room,whitePlayer,blackPlayer}){
  const seconds=Number(room.chessClock||0);
  const st={
    matchId:`CHESS-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    roomId:room.code,
    room:clone(room),
    players:{white:clone(whitePlayer),black:clone(blackPlayer)},
    board:initialBoard(),
    turn:'white',
    selectedSquare:null,
    legalMoves:[],
    moveHistory:[],
    capturedWhite:[],
    capturedBlack:[],
    clocks:{white:seconds,black:seconds},
    clockEnabled:seconds>0,
    status:'playing',
    winner:null,
    drawReason:null,
    lastMove:null,
    enPassantTarget:null,
    halfmoveClock:0,
    fullmoveNumber:1,
    promotionPending:null,
    drawOffer:null,
    positionCounts:{},
    startedAt:Date.now()
  };
  st.positionCounts[positionKey(st)]=1;
  return st;
}

function kingSquare(state,color){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=state.board[r][c];
    if(p?.color===color && p.type==='king') return {r,c};
  }
  return null;
}

function pseudoMoves(state,r,c,attackOnly=false){
  const p=state.board[r][c];
  if(!p) return [];
  const out=[];
  const add=(rr,cc,extra={})=>{
    if(!inside(rr,cc)) return;
    const target=state.board[rr][cc];
    if(!target || target.color!==p.color) out.push({from:{r,c},to:{r:rr,c:cc},...extra});
  };
  const ray=(dr,dc)=>{
    let rr=r+dr,cc=c+dc;
    while(inside(rr,cc)){
      const target=state.board[rr][cc];
      if(!target) out.push({from:{r,c},to:{r:rr,c:cc}});
      else{
        if(target.color!==p.color) out.push({from:{r,c},to:{r:rr,c:cc}});
        break;
      }
      rr+=dr; cc+=dc;
    }
  };

  if(p.type==='pawn'){
    const dir=p.color==='white'?-1:1;
    const start=p.color==='white'?6:1;
    if(attackOnly){
      for(const dc of [-1,1]) if(inside(r+dir,c+dc)) out.push({from:{r,c},to:{r:r+dir,c:c+dc}});
      return out;
    }
    if(inside(r+dir,c) && !state.board[r+dir][c]){
      add(r+dir,c,{promotion:(r+dir===0||r+dir===7)});
      if(r===start && !state.board[r+2*dir][c]) add(r+2*dir,c,{doublePawn:true});
    }
    for(const dc of [-1,1]){
      const rr=r+dir,cc=c+dc;
      if(!inside(rr,cc)) continue;
      const target=state.board[rr][cc];
      if(target && target.color!==p.color) add(rr,cc,{capture:true,promotion:(rr===0||rr===7)});
      const sq=squareName(rr,cc);
      if(state.enPassantTarget===sq) add(rr,cc,{capture:true,enPassant:true});
    }
    return out;
  }

  if(p.type==='knight'){
    for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r+dr,c+dc);
  }
  if(p.type==='bishop' || p.type==='queen'){
    for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) ray(dr,dc);
  }
  if(p.type==='rook' || p.type==='queen'){
    for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) ray(dr,dc);
  }
  if(p.type==='king'){
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) if(dr||dc) add(r+dr,c+dc);
    if(!attackOnly && !p.moved && !isInCheck(state,p.color)){
      // King side
      const rookK=state.board[r][7];
      if(rookK?.type==='rook' && rookK.color===p.color && !rookK.moved &&
         !state.board[r][5] && !state.board[r][6] &&
         !isSquareAttacked(state,r,5,other(p.color)) &&
         !isSquareAttacked(state,r,6,other(p.color))){
        out.push({from:{r,c},to:{r,c:6},castle:'king'});
      }
      // Queen side
      const rookQ=state.board[r][0];
      if(rookQ?.type==='rook' && rookQ.color===p.color && !rookQ.moved &&
         !state.board[r][1] && !state.board[r][2] && !state.board[r][3] &&
         !isSquareAttacked(state,r,3,other(p.color)) &&
         !isSquareAttacked(state,r,2,other(p.color))){
        out.push({from:{r,c},to:{r,c:2},castle:'queen'});
      }
    }
  }
  return out;
}

function isSquareAttacked(state,r,c,byColor){
  for(let rr=0;rr<8;rr++) for(let cc=0;cc<8;cc++){
    const p=state.board[rr][cc];
    if(!p || p.color!==byColor) continue;
    const moves=pseudoMoves(state,rr,cc,true);
    if(moves.some(m=>m.to.r===r && m.to.c===c)) return true;
  }
  return false;
}

function isInCheck(state,color){
  const k=kingSquare(state,color);
  return k ? isSquareAttacked(state,k.r,k.c,other(color)) : false;
}

function makeMoveUnchecked(state,move,promotionChoice='queen'){
  const s=clone(state);
  const {from,to}=move;
  const p=s.board[from.r][from.c];
  const captured=s.board[to.r][to.c];
  if(!p) return s;

  if(move.enPassant){
    const capR=p.color==='white'?to.r+1:to.r-1;
    const ep=s.board[capR][to.c];
    if(ep){
      (p.color==='white'?s.capturedWhite:s.capturedBlack).push(clone(ep));
      s.board[capR][to.c]=null;
    }
  }else if(captured){
    (p.color==='white'?s.capturedWhite:s.capturedBlack).push(clone(captured));
  }

  s.board[to.r][to.c]=p;
  s.board[from.r][from.c]=null;
  p.moved=true;

  if(move.castle==='king'){
    const rook=s.board[to.r][7];
    s.board[to.r][5]=rook; s.board[to.r][7]=null; if(rook) rook.moved=true;
  }
  if(move.castle==='queen'){
    const rook=s.board[to.r][0];
    s.board[to.r][3]=rook; s.board[to.r][0]=null; if(rook) rook.moved=true;
  }

  if(p.type==='pawn' && (to.r===0 || to.r===7)){
    p.type=promotionChoice || 'queen';
  }

  s.enPassantTarget=null;
  if(p.type==='pawn' && Math.abs(to.r-from.r)===2){
    s.enPassantTarget=squareName((to.r+from.r)/2,to.c);
  }
  return s;
}

function legalMovesFrom(state,r,c){
  const p=state.board[r][c];
  if(!p || p.color!==state.turn || state.status!=='playing') return [];
  return pseudoMoves(state,r,c,false).filter(move=>{
    const next=makeMoveUnchecked(state,move);
    return !isInCheck(next,p.color);
  });
}

function allLegalMoves(state,color=state.turn){
  const original=state.turn;
  const temp=clone(state);
  temp.turn=color;
  const out=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=temp.board[r][c];
    if(p?.color===color) out.push(...legalMovesFrom(temp,r,c));
  }
  temp.turn=original;
  return out;
}

function moveNotation(before,move,after,movedPiece,captured,wasCheck,wasMate){
  if(move.castle==='king') return 'O-O';
  if(move.castle==='queen') return 'O-O-O';
  const letters={king:'R',queen:'D',rook:'T',bishop:'B',knight:'C',pawn:''};
  const prefix=letters[movedPiece.type]||'';
  const capture=captured||move.enPassant?'x':'';
  let txt=`${prefix}${capture}${squareName(move.to.r,move.to.c)}`;
  if(move.promotion){const pm={queen:'D',rook:'T',bishop:'B',knight:'C'};txt+=`=${pm[move.promotionChoice]||'D'}`;}
  if(wasMate) txt+='#';
  else if(wasCheck) txt+='+';
  return txt;
}

function insufficientMaterial(state){
  const pieces=[];
  for(const row of state.board) for(const p of row) if(p && p.type!=='king') pieces.push(p);
  if(pieces.length===0) return true;
  if(pieces.length===1 && ['bishop','knight'].includes(pieces[0].type)) return true;
  return false;
}

function finalizeAfterMove(state,move,before,movedPiece,captured){
  const opponent=state.turn;
  const legal=allLegalMoves(state,opponent);
  const check=isInCheck(state,opponent);

  if(legal.length===0){
    if(check){
      state.status='checkmate';
      state.winner=other(opponent);
    }else{
      state.status='stalemate';
      state.drawReason='afogamento';
    }
  }else if(insufficientMaterial(state)){
    state.status='draw';
    state.drawReason='material insuficiente';
  }

  // TDB: empate automático por repetição foi desativado.

  const notation=moveNotation(before,move,state,movedPiece,captured,check,state.status==='checkmate');
  state.moveHistory.push({
    number:Math.ceil(state.moveHistory.length/2),
    color:other(state.turn),
    notation,
    from:squareName(move.from.r,move.from.c),
    to:squareName(move.to.r,move.to.c)
  });
  return state;
}

function applyMove(state,move,promotionChoice='queen'){
  if(state.status!=='playing') return state;
  const legal=legalMovesFrom(state,move.from.r,move.from.c);
  const chosen=legal.find(m=>m.to.r===move.to.r && m.to.c===move.to.c && (m.castle||'')===(move.castle||''));
  if(!chosen) return state;

  const before=clone(state);
  const movedPiece=clone(state.board[move.from.r][move.from.c]);
  const captured=clone(state.board[move.to.r][move.to.c]);

  chosen.promotionChoice=promotionChoice;
  const next=makeMoveUnchecked(state,chosen,promotionChoice);
  next.lastMove={from:chosen.from,to:chosen.to};
  next.selectedSquare=null;
  next.legalMoves=[];
  next.turn=other(state.turn);
  next.fullmoveNumber += next.turn==='white'?1:0;
  next.halfmoveClock=(movedPiece.type==='pawn'||captured)?0:state.halfmoveClock+1;

  return finalizeAfterMove(next,chosen,before,movedPiece,captured);
}

function displayPiece(p){ return p ? PIECES[p.color][p.type] : ''; }


function pieceValue(type){
  return ({pawn:100,knight:320,bishop:330,rook:500,queen:900,king:20000})[type] || 0;
}

function moveLeavesOpponentInCheck(state,move){
  const beforeTurn=state.turn;
  const next=applyMove(state,move,'queen');
  if(next===state) return false;
  return isInCheck(next, next.turn);
}

function isMateMove(state,move){
  const next=applyMove(state,move,'queen');
  return next!==state && next.status==='checkmate';
}

function moveScore(state,move){
  const mover=state.board[move.from.r][move.from.c];
  if(!mover) return -999999;

  if(isMateMove(state,move)) return 1000000;

  let score=0;
  const target=state.board[move.to.r][move.to.c];

  if(target){
    score += pieceValue(target.type)*10 - pieceValue(mover.type);
  }
  if(move.enPassant) score += 950;
  if(move.promotion) score += 8000;
  if(move.castle) score += 450;

  const next=applyMove(state,move,'queen');
  if(next!==state){
    if(isInCheck(next,next.turn)) score += 700;

    // Penalize moving into a square that can immediately be captured,
    // unless compensation is significant.
    if(isSquareAttacked(next,move.to.r,move.to.c,next.turn)){
      score -= Math.floor(pieceValue(mover.type)*0.45);
    }

    // Small positional preference toward center.
    const dr=Math.abs(3.5-move.to.r), dc=Math.abs(3.5-move.to.c);
    score += Math.max(0,60-Math.floor((dr+dc)*10));
  }

  return score;
}

function bestLegalMoves(state,color=state.turn){
  const temp=clone(state);
  temp.turn=color;
  const moves=allLegalMoves(temp,color);
  return moves
    .map(move=>({move,score:moveScore(temp,move)}))
    .sort((a,b)=>b.score-a.score);
}

function positionalPieceScore(piece,r,c){
  if(!piece) return 0;
  const center=Math.max(0,7-Math.round((Math.abs(3.5-r)+Math.abs(3.5-c))*2));
  let score=center*4;
  if(piece.type==='pawn'){
    const advance=piece.color==='white'?(6-r):(r-1);
    score+=Math.max(0,advance)*8;
    if(c===3||c===4)score+=8;
  }
  if(piece.type==='knight')score+=center*5;
  if(piece.type==='bishop')score+=center*3;
  if(piece.type==='rook'&&(r===0||r===7))score+=3;
  if(piece.type==='king'){
    const home=piece.color==='white'?7:0;
    if(r===home&&(c===6||c===2))score+=55;
    if(Math.abs(3.5-r)+Math.abs(3.5-c)<3)score-=25;
  }
  return score;
}

function evaluatePosition(state,perspective){
  if(state.status==='checkmate')return state.winner===perspective?10000000:-10000000;
  if(['stalemate','draw'].includes(state.status))return 0;
  if(state.status==='timeout'||state.status==='resigned'||state.status==='abandoned'){
    return state.winner===perspective?9000000:state.winner?-9000000:0;
  }
  let score=0;
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=state.board[r][c];
    if(!p)continue;
    const value=pieceValue(p.type)+positionalPieceScore(p,r,c);
    score+=(p.color===perspective?value:-value);
  }
  if(isInCheck(state,other(perspective)))score+=45;
  if(isInCheck(state,perspective))score-=60;
  return score;
}

function orderedSearchMoves(state,moves,maxCount=18){
  return moves
    .map(move=>({move,score:moveScore(state,move)}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,maxCount)
    .map(x=>x.move);
}

function chooseBotMove(state,color=state.turn,difficulty='easy',options={}){
  const level=['easy','medium','hard'].includes(difficulty)?difficulty:'easy';
  const temp=clone(state);
  temp.turn=color;
  const all=Array.isArray(options.candidateMoves)&&options.candidateMoves.length
    ? options.candidateMoves.map(clone)
    : allLegalMoves(temp,color);
  if(!all.length)return null;

  const ranked=all.map(move=>({move,score:moveScore(temp,move)})).sort((a,b)=>b.score-a.score);
  if(level==='easy'){
    // Fácil mantém erros humanos: normalmente vê capturas/xeques simples,
    // mas escolhe entre várias jogadas razoáveis e às vezes joga algo neutro.
    if(Math.random()<0.18)return all[Math.floor(Math.random()*all.length)];
    const best=ranked[0]?.score??0;
    const pool=ranked.filter(x=>x.score>=best-260).slice(0,8);
    return (pool[Math.floor(Math.random()*Math.max(1,pool.length))]||ranked[0]).move;
  }

  const depth=level==='hard'?3:2;
  const branch=level==='hard'?18:12;
  const budget=Number(options.timeBudgetMs|| (level==='hard'?780:320));
  const deadline=Date.now()+Math.max(80,budget);
  let timedOut=false;

  function search(node,remaining,alpha,beta){
    if(Date.now()>=deadline){timedOut=true;return evaluatePosition(node,color)}
    if(remaining<=0||node.status!=='playing')return evaluatePosition(node,color);
    const maximizing=node.turn===color;
    const legal=allLegalMoves(node,node.turn);
    if(!legal.length)return evaluatePosition(node,color);
    const moves=orderedSearchMoves(node,legal,branch);
    if(maximizing){
      let value=-Infinity;
      for(const move of moves){
        const next=applyMove(node,move,'queen');
        value=Math.max(value,search(next,remaining-1,alpha,beta));
        alpha=Math.max(alpha,value);
        if(beta<=alpha||timedOut)break;
      }
      return value;
    }
    let value=Infinity;
    for(const move of moves){
      const next=applyMove(node,move,'queen');
      value=Math.min(value,search(next,remaining-1,alpha,beta));
      beta=Math.min(beta,value);
      if(beta<=alpha||timedOut)break;
    }
    return value;
  }

  const root=orderedSearchMoves(temp,all,level==='hard'?20:14);
  let bestMove=root[0]||ranked[0].move;
  let bestScore=-Infinity;
  const scored=[];
  for(const move of root){
    const next=applyMove(temp,move,'queen');
    const score=search(next,depth-1,-Infinity,Infinity);
    scored.push({move,score});
    if(score>bestScore){bestScore=score;bestMove=move}
    if(timedOut)break;
  }

  // Médio varia levemente entre variantes quase equivalentes; Difícil é mais preciso.
  scored.sort((a,b)=>b.score-a.score);
  if(level==='medium'&&scored.length>1){
    const near=scored.filter(x=>x.score>=scored[0].score-45).slice(0,3);
    if(near.length>1&&Math.random()<0.32)return near[Math.floor(Math.random()*near.length)].move;
  }
  return scored[0]?.move||bestMove;
}

window.TDBChessEngine={
  PIECES,FILES,createState,initialBoard,displayPiece,
  legalMovesFrom,allLegalMoves,applyMove,isInCheck,
  squareName,parseSquare,other,clone,insufficientMaterial,
  pieceValue,moveScore,bestLegalMoves,evaluatePosition,chooseBotMove
};
})();
