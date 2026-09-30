const RANKS=['4','5','6','7','Q','J','K','A','2','3'];
const SUITS=['diamonds','spades','hearts','clubs'];
const SUIT_POWER={diamonds:1,spades:2,hearts:3,clubs:4};

function clone(v){return structuredClone(v)}
function nextRank(rank){return RANKS[(RANKS.indexOf(rank)+1)%RANKS.length]}
function teamOfSeat(seat){return seat%2}
function nextSeat(active,seat){
  const i=active.indexOf(seat);
  return active[(i+1)%active.length];
}
function deck40(){
  const d=[];
  for(const suit of SUITS) for(const rank of RANKS) d.push({rank,suit,id:`${rank}-${suit}`});
  return d;
}
function shuffle(a){
  const x=[...a];
  for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}
  return x;
}
function strength(card,manilha){
  if(card.rank===manilha) return 100+SUIT_POWER[card.suit];
  return RANKS.indexOf(card.rank);
}
function compareCards(a,b,manilha){
  const sa=strength(a,manilha), sb=strength(b,manilha);
  return sa===sb?0:(sa>sb?1:-1);
}
function makePlayers(room){
  const seats=Number(room.trucoSeats||4)===2?[0,2]:[0,1,2,3];
  const oneVsOne=seats.length===2;
  return seats.map((seat,i)=>{
    const p=room.players?.[i]||{id:`BOT-${seat}`,username:`Bot ${seat}`,avatar:'BOT',bot:true};
    return {...clone(p),seat,team:oneVsOne?i:teamOfSeat(seat),bot:!!p.bot};
  });
}
function teamForSeat(state,seat){
  return state.players.find(p=>p.seat===seat)?.team ?? teamOfSeat(seat);
}
function createTrucoState(room){
  const players=makePlayers(room);
  const activeSeats=players.map(p=>p.seat);
  const s={
    game:'truco', matchId:`TRUCO-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    roomCode:room.code, mode:activeSeats.length===2?'1v1':'2v2',
    players,activeSeats,scores:[0,0],winner:null,phase:'playing',
    dealer:activeSeats[activeSeats.length-1],current:null,round:0,handValue:1,
    trickCards:[],trickResults:[],hands:{},vira:null,manilhaRank:null,
    pendingRaise:null,eleven:null,ironHand:false,logs:[],version:1,
    turnTimer:Number(room.turnTimer||0),turnDeadlineAt:null,lastAutoAction:null
  };
  dealHand(s);
  return s;
}
function armDeadline(s){
  const seconds=Number(s.turnTimer||0);
  s.turnDeadlineAt=seconds>0 && s.phase!=='finished'?Date.now()+seconds*1000:null;
}
function dealHand(s){
  const d=shuffle(deck40());
  s.hands={};
  for(const seat of s.activeSeats) s.hands[seat]=[];
  for(let r=0;r<3;r++) for(const seat of s.activeSeats) s.hands[seat].push(d.shift());
  s.vira=d.shift(); s.manilhaRank=nextRank(s.vira.rank);
  s.round=0;s.trickCards=[];s.trickResults=[];s.handValue=1;s.pendingRaise=null;
  s.dealer=nextSeat(s.activeSeats,s.dealer);
  s.current=nextSeat(s.activeSeats,s.dealer);
  s.ironHand=s.scores[0]===11&&s.scores[1]===11;
  const elevenTeam=s.ironHand?null:(s.scores[0]===11?0:(s.scores[1]===11?1:null));
  s.eleven=elevenTeam===null?null:{team:elevenTeam,pending:true,responses:{}};
  if(s.eleven) s.phase='eleven'; else s.phase='playing';
  armDeadline(s);
  s.version++;
}
function handWinnerFromResults(results,forehandTeam){
  if(results.length<2) return null;
  const [a,b,c]=results;
  if(a!=='tie' && b===a) return a;
  if(a==='tie' && b!=='tie') return b;
  if(a!=='tie' && b==='tie') return a;
  if(results.length<3) return null;
  if(c!=='tie') return c;
  if(a!=='tie') return a;
  if(b!=='tie') return b;
  return forehandTeam;
}
function resolveTrick(s){
  let best=null,tie=false;
  for(const tc of s.trickCards){
    if(!best){best=tc;tie=false;continue}
    const cmp=compareCards(tc.card,best.card,s.manilhaRank);
    if(cmp>0){best=tc;tie=false}
    else if(cmp===0) tie=true;
  }
  const result=tie?'tie':teamForSeat(s,best.seat);
  s.trickResults.push(result);
  const lead=s.current;
  const trickWinnerSeat=tie?lead:best.seat;
  s.round++;
  s.trickCards=[];
  const forehand=teamForSeat(s,nextSeat(s.activeSeats,s.dealer));
  const hw=handWinnerFromResults(s.trickResults,forehand);
  if(hw!==null || s.round>=3){
    awardHand(s,hw===null?forehand:hw,s.handValue);
  }else{
    s.current=trickWinnerSeat;
  }
}
function awardHand(s,team,points){
  s.scores[team]+=points;
  s.logs.push(`Time ${team+1} ganhou ${points} ponto(s).`);
  if(s.scores[team]>=12){
    s.winner=team;s.phase='finished';s.turnDeadlineAt=null;s.version++;return;
  }
  dealHand(s);
}
function membersOfTeam(s,team){return s.players.filter(p=>p.team===team).map(p=>p.seat)}
function actionPlay(s,seat,{cardIdx,hidden=false}){
  if(s.phase!=='playing'||s.current!==seat) throw new Error('Não é sua vez.');
  if(hidden&&s.round===0) throw new Error('Não pode esconder na primeira rodada.');
  const hand=s.hands[seat]||[];
  const card=hand[cardIdx];
  if(!card) throw new Error('Carta inválida.');
  hand.splice(cardIdx,1);
  s.trickCards.push({seat,card,hidden:!!hidden});
  if(s.trickCards.length===s.activeSeats.length) resolveTrick(s);
  else s.current=nextSeat(s.activeSeats,seat);
}
function nextRaise(v){return v===1?3:v===3?6:v===6?9:v===9?12:null}
function actionRaise(s,seat){
  if(s.phase!=='playing'||s.current!==seat) throw new Error('Só quem está na vez pode pedir.');
  if(s.eleven||s.ironHand) throw new Error('Não pode pedir aumento nesta mão.');
  const to=nextRaise(s.handValue); if(!to) throw new Error('Já está em 12.');
  const p=s.players.find(x=>x.seat===seat); if(!p) throw new Error('Jogador inválido.');
  s.pendingRaise={from:s.handValue,to,bySeat:seat,targetTeam:1-p.team,responses:{}};
  s.phase='raise-response';
}
function actionRaiseResponse(s,seat,answer){
  const pr=s.pendingRaise;if(!pr||s.phase!=='raise-response') throw new Error('Sem pedido pendente.');
  const p=s.players.find(x=>x.seat===seat);if(!p||p.team!==pr.targetTeam) throw new Error('Você não responde este pedido.');
  if(!['accept','run','raise'].includes(answer)) throw new Error('Resposta inválida.');
  pr.responses[seat]=answer;
  const members=membersOfTeam(s,pr.targetTeam);
  if(answer==='run'){
    awardHand(s,1-pr.targetTeam,pr.from);
    return;
  }
  if(members.some(x=>!pr.responses[x])) return;
  const values=members.map(x=>pr.responses[x]);
  if(values.every(v=>v==='raise')){
    s.handValue=pr.to;
    const to=nextRaise(pr.to);
    if(!to){s.pendingRaise=null;s.phase='playing';return}
    const newTarget=1-pr.targetTeam;
    s.pendingRaise={from:pr.to,to,bySeat:seat,targetTeam:newTarget,responses:{}};
    return;
  }
  s.handValue=pr.to;s.pendingRaise=null;s.phase='playing';
}
function actionEleven(s,seat,play){
  if(!s.eleven?.pending||s.phase!=='eleven') throw new Error('Sem Mão de 11.');
  const p=s.players.find(x=>x.seat===seat);if(!p||p.team!==s.eleven.team) throw new Error('Decisão inválida.');
  s.eleven.responses=s.eleven.responses||{};
  s.eleven.responses[seat]=!!play;
  const members=membersOfTeam(s,s.eleven.team);
  if(!play){awardHand(s,1-s.eleven.team,1);return}
  if(members.some(member=>s.eleven.responses[member]===undefined)) return;
  s.handValue=3;s.eleven.pending=false;s.phase='playing';armDeadline(s);
}
export function applyTrucoAction(state,seat,action){
  const s=clone(state);
  switch(action.type){
    case 'PLAY_CARD':actionPlay(s,seat,action);break;
    case 'REQUEST_RAISE':actionRaise(s,seat);break;
    case 'RESPOND_RAISE':actionRaiseResponse(s,seat,action.answer);break;
    case 'ELEVEN_DECISION':actionEleven(s,seat,!!action.play);break;
    default:throw new Error('Ação de Truco desconhecida.');
  }
  if(s.phase!=='finished') armDeadline(s);
  s.version=(s.version||0)+1;
  return s;
}
export function tick(state,now=Date.now()){
  let s=clone(state);
  if(!s.turnTimer||!s.turnDeadlineAt||now<s.turnDeadlineAt||s.phase==='finished') return s;
  try{
    if(s.phase==='playing'){
      const hand=s.hands[s.current]||[];
      if(hand.length){
        const idx=Math.floor(Math.random()*hand.length);
        const player=s.players.find(p=>p.seat===s.current);
        s.lastAutoAction={type:'timeout-card',seat:s.current,at:now};
        s.logs.push(`${player?.username||'Jogador'} ficou sem tempo. Carta aleatória aberta jogada.`);
        actionPlay(s,s.current,{cardIdx:idx,hidden:false});
      }
    }else if(s.phase==='raise-response' && s.pendingRaise){
      const seats=membersOfTeam(s,s.pendingRaise.targetTeam).filter(seat=>!s.pendingRaise.responses?.[seat]);
      for(const seat of seats){if(s.phase!=='raise-response') break;actionRaiseResponse(s,seat,'accept')}
      s.lastAutoAction={type:'timeout-raise-accept',at:now};
    }else if(s.phase==='eleven' && s.eleven?.pending){
      const seats=membersOfTeam(s,s.eleven.team).filter(seat=>s.eleven.responses?.[seat]===undefined);
      for(const seat of seats){if(s.phase!=='eleven') break;actionEleven(s,seat,true)}
      s.lastAutoAction={type:'timeout-eleven-play',at:now};
    }
  }catch{}
  if(s.phase!=='finished') armDeadline(s);
  s.version=(s.version||0)+1;
  return s;
}

export function createState(room){return createTrucoState(room)}
export function viewFor(state,userId,role='player'){
  const s=clone(state);
  const me=s.players.find(p=>p.id===userId);
  const mySeat=me?.seat??null;
  // Hidden cards already played on the table must stay private too.
  s.trickCards=(s.trickCards||[]).map(tc=>tc.hidden?{...tc,card:null}:tc);

  for(const seat of s.activeSeats){
    let canSee=role!=='spectator' && seat===mySeat;
    if(role!=='spectator' && s.eleven?.pending && me && me.team===s.eleven.team){
      const partner=s.players.find(p=>p.seat===seat);
      if(partner?.team===me.team) canSee=true;
    }
    if(s.ironHand) canSee=false;
    if(!canSee) s.hands[seat]=(s.hands[seat]||[]).map(()=>null);
  }
  s.localSeat=mySeat;
  s.role=role;
  return s;
}
export function seatForUser(state,userId){
  return state.players.find(p=>p.id===userId)?.seat ?? null;
}
