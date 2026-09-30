
// Browser smoke tests for the chess engine.
window.runChessSmokeTests=function(){
  const E=window.TDBChessEngine;
  const fake={code:'TEST',chessClock:0};
  const p1={id:'1',username:'A'},p2={id:'2',username:'B'};
  const s=E.createState({room:fake,whitePlayer:p1,blackPlayer:p2});
  const out=[];
  const t=(name,ok)=>{out.push({name,ok});console[ok?'log':'error'](ok?'[OK]':'[FAIL]',name)};
  t('Tabuleiro possui 32 peças',s.board.flat().filter(Boolean).length===32);
  t('Brancas começam',s.turn==='white');
  t('Peão e2 possui e3/e4',E.legalMovesFrom(s,6,4).length===2);
  t('Cavalo g1 possui movimentos',E.legalMovesFrom(s,7,6).length===2);
  t('Rei e1 não pode mover no início',E.legalMovesFrom(s,7,4).length===0);
  console.table(out);return out;
};
