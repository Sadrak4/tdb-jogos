const SUITS=['clubs','diamonds','hearts','spades'];
const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const MAX_PLAYERS=3;
const MAX_HANDS=3;

function clone(v){return structuredClone(v)}
function uid(prefix='BJ'){return`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`}
function cardValue(card){if(!card)return 0;if(card.rank==='A')return 11;if(['J','Q','K'].includes(card.rank))return 10;return Number(card.rank)}
function splitValue(card){return cardValue(card)}

export function handValue(cards=[]){
  let total=0,aces=0;
  for(const card of cards){
    if(!card)continue;
    total+=cardValue(card);
    if(card.rank==='A')aces++;
  }
  while(total>21&&aces>0){total-=10;aces--}
  const soft=aces>0;
  return{total,soft,bust:total>21};
}
function isNatural(hand){return !hand.fromSplit && hand.cards.length===2 && handValue(hand.cards).total===21}
function buildShoe(decks=4){
  const cards=[];
  for(let d=0;d<decks;d++)for(const suit of SUITS)for(const rank of RANKS)cards.push({id:`${d}-${suit}-${rank}-${Math.random().toString(36).slice(2,7)}`,suit,rank});
  for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}
  return cards;
}
function draw(state){
  if(!state.deck?.length)state.deck=buildShoe(state.rules.decks);
  return state.deck.pop();
}
function playerTemplate(p,state,{waitingNextRound=false}={}){
  return{
    id:p.id,username:p.username,avatar:p.avatar||null,connection:p.connection||'online',
    bankroll:state.rules.startingChips,bet:state.rules.minBet,ready:false,
    waitingNextRound,sittingOut:false,left:false,hands:[],activeHand:0,roundNet:0,roundResult:null
  };
}
function log(state,type,message,extra={}){
  state.events=Array.isArray(state.events)?state.events:[];
  state.events.push({id:uid('EVT'),type,message,at:Date.now(),...extra});
  if(state.events.length>40)state.events=state.events.slice(-40);
}
function currentRoomIds(room){return new Set((room?.players||[]).map(p=>p.id))}

export function syncRoomPlayers(state,room,{duringRound=null}={}){
  const activeRound=duringRound??['playerTurns','dealerTurn'].includes(state.phase);
  const ids=currentRoomIds(room);
  let changed=false;

  for(const rp of room?.players||[]){
    let p=state.players.find(x=>x.id===rp.id);
    if(!p){
      p=playerTemplate(rp,state,{waitingNextRound:activeRound||state.phase==='roundEnd'});
      state.players.push(p);changed=true;
      log(state,'join',`${rp.username} entrou na mesa${p.waitingNextRound?' e aguarda a próxima rodada':''}.`,{playerId:rp.id});
    }else{
      p.username=rp.username;p.avatar=rp.avatar||p.avatar||null;p.connection=rp.connection||'online';
      if(p.left){p.left=false;changed=true}
    }
  }

  for(const p of state.players){
    if(ids.has(p.id))continue;
    if(!p.left){p.left=true;p.connection='offline';changed=true}
    if(activeRound){
      for(const hand of p.hands||[])if(hand.status==='playing')hand.status='stand';
    }
  }

  if(['betting','roundEnd'].includes(state.phase)){
    const before=state.players.length;
    state.players=state.players.filter(p=>ids.has(p.id));
    if(state.players.length!==before)changed=true;
  }

  if(changed)state.version=(state.version||0)+1;
  return changed;
}

function eligibleBettingPlayers(state){
  return state.players.filter(p=>!p.left&&!p.waitingNextRound&&!p.sittingOut&&p.bankroll>=state.rules.minBet);
}
function allReady(state){
  const players=eligibleBettingPlayers(state);
  return players.length>0&&players.every(p=>p.ready&&p.bet>=state.rules.minBet&&p.bet<=p.bankroll);
}
function makeHand(cards,bet,{fromSplit=false,splitAces=false}={}){
  const hand={id:uid('HAND'),cards:[...cards],bet,status:'playing',fromSplit,splitAces,doubled:false,actions:0,result:null,payout:0};
  const value=handValue(hand.cards);
  if(isNatural(hand))hand.status='blackjack';
  else if(value.total===21)hand.status='stand';
  return hand;
}
function maybeFreshShoe(state){
  const threshold=Math.max(26,Math.floor(52*state.rules.decks*.25));
  if(!Array.isArray(state.deck)||state.deck.length<threshold){
    state.deck=buildShoe(state.rules.decks);
    state.shoeNumber=(state.shoeNumber||0)+1;
    log(state,'shuffle','O dealer embaralhou um novo shoe.');
  }
}

function setCurrentTurn(state,now=Date.now()){
  while(state.turnIndex<state.turnOrder.length){
    const player=state.players.find(p=>p.id===state.turnOrder[state.turnIndex]);
    if(!player||player.left){state.turnIndex++;continue}
    let idx=Math.max(0,player.activeHand||0);
    while(idx<player.hands.length&&player.hands[idx].status!=='playing')idx++;
    player.activeHand=idx;
    if(idx<player.hands.length){
      state.currentPlayerId=player.id;
      state.turnDeadlineAt=state.rules.turnTimer>0?now+state.rules.turnTimer*1000:null;
      return true;
    }
    state.turnIndex++;
  }
  state.currentPlayerId=null;state.turnDeadlineAt=null;
  beginDealerTurn(state,now);
  return false;
}
function advanceFromHand(state,player,now=Date.now()){
  player.activeHand=(player.activeHand||0)+1;
  if(player.activeHand<player.hands.length&&player.hands[player.activeHand].status==='playing'){
    state.currentPlayerId=player.id;
    state.turnDeadlineAt=state.rules.turnTimer>0?now+state.rules.turnTimer*1000:null;
    return;
  }
  state.turnIndex++;
  setCurrentTurn(state,now);
}
function beginDealerTurn(state,now=Date.now()){
  state.phase='dealerTurn';
  state.dealer.revealed=true;
  state.dealerNextAt=now+820;
  state.turnDeadlineAt=null;
  state.currentPlayerId=null;
  log(state,'dealer','Dealer revelou a carta fechada.');
  state.version++;
}
function dealerShouldHit(state){
  const v=handValue(state.dealer.cards);
  return v.total<17;
}
function summarizePlayer(player){
  const results=player.hands.map(h=>h.result);
  if(results.every(r=>r==='loss'))return'loss';
  if(results.every(r=>r==='push'))return'push';
  if(results.every(r=>['win','blackjack'].includes(r)))return'win';
  return'mixed';
}
function settleRound(state,now=Date.now()){
  const dealer=handValue(state.dealer.cards);
  const dealerNatural=state.dealer.cards.length===2&&dealer.total===21;
  state.dealer.value=dealer.total;
  state.dealer.bust=dealer.bust;

  for(const p of state.players){
    if(!p.hands?.length)continue;
    let net=0;
    for(const hand of p.hands){
      const value=handValue(hand.cards);
      const natural=isNatural(hand);
      let payout=0,result='loss';
      if(value.bust){result='loss';payout=0}
      else if(natural&&dealerNatural){result='push';payout=hand.bet}
      else if(natural&&!dealerNatural){result='blackjack';payout=hand.bet*2.5}
      else if(dealerNatural){result='loss';payout=0}
      else if(dealer.bust||value.total>dealer.total){result='win';payout=hand.bet*2}
      else if(value.total===dealer.total){result='push';payout=hand.bet}
      else{result='loss';payout=0}
      hand.result=result;hand.payout=payout;hand.status=value.bust?'bust':'done';
      p.bankroll+=payout;net+=payout-hand.bet;
    }
    p.roundNet=net;p.roundResult=summarizePlayer(p);p.ready=false;
    const returned=p.hands.reduce((sum,h)=>sum+Number(h.payout||0),0);
    if(returned>0){
      log(state,'payout',`${p.username} recebeu ${returned} fichas da mesa.`,{playerId:p.id,amount:returned});
    }
  }
  state.phase='roundEnd';
  state.nextRoundAt=now+7000;
  state.dealerNextAt=null;
  state.currentPlayerId=null;
  state.turnDeadlineAt=null;
  log(state,'round-end',`Rodada ${state.round} encerrada.`);
  state.version++;
}

function prepareBetting(state,room,now=Date.now()){
  syncRoomPlayers(state,room,{duringRound:false});
  state.round=(state.round||0)+1;
  state.phase='betting';
  state.dealer={cards:[],revealed:false,value:null,bust:false};
  state.turnOrder=[];state.turnIndex=0;state.currentPlayerId=null;state.turnDeadlineAt=null;state.dealerNextAt=null;state.nextRoundAt=null;
  for(const p of state.players){
    p.waitingNextRound=false;p.hands=[];p.activeHand=0;p.roundNet=0;p.roundResult=null;p.ready=false;
    if(p.bankroll<state.rules.minBet){p.sittingOut=true;p.bet=0}else{p.sittingOut=false;p.bet=Math.min(Math.max(p.bet||state.rules.minBet,state.rules.minBet),p.bankroll)}
  }
  log(state,'betting',`Apostas abertas para a rodada ${state.round}.`);
  state.version++;
}

function dealRound(state,now=Date.now()){
  const players=eligibleBettingPlayers(state).filter(p=>p.ready);
  if(!players.length)return state;
  maybeFreshShoe(state);
  state.dealer={cards:[],revealed:false,value:null,bust:false};
  for(const p of players){
    p.bankroll-=p.bet;p.hands=[makeHand([],p.bet)];p.activeHand=0;p.roundNet=0;p.roundResult=null;
  }
  // Real blackjack dealing order: one card to each seat, dealer, then repeat.
  for(const p of players)p.hands[0].cards.push(draw(state));
  state.dealer.cards.push(draw(state));
  for(const p of players)p.hands[0].cards.push(draw(state));
  state.dealer.cards.push(draw(state));
  for(const p of players){
    const h=p.hands[0];
    if(isNatural(h))h.status='blackjack';
    else if(handValue(h.cards).total===21)h.status='stand';
    else h.status='playing';
  }
  state.phase='playerTurns';state.roundStartedAt=now;
  state.turnOrder=players.map(p=>p.id);state.turnIndex=0;
  state.currentPlayerId=null;state.turnDeadlineAt=null;
  log(state,'deal',`Cartas distribuídas para a rodada ${state.round}.`);
  state.version++;
  const dealerNatural=handValue(state.dealer.cards).total===21&&state.dealer.cards.length===2;
  if(dealerNatural){beginDealerTurn(state,now);return state}
  setCurrentTurn(state,now);
  return state;
}

export function createState(room){
  const rules={
    maxPlayers:MAX_PLAYERS,maxHands:MAX_HANDS,
    startingChips:[500,1000,2000].includes(Number(room.blackjackStartingChips))?Number(room.blackjackStartingChips):1000,
    minBet:[10,25,50].includes(Number(room.blackjackMinBet))?Number(room.blackjackMinBet):25,
    turnTimer:[0,15,20,30].includes(Number(room.blackjackTurnTimer))?Number(room.blackjackTurnTimer):20,
    decks:[1,2,4].includes(Number(room.blackjackDecks))?Number(room.blackjackDecks):4,
    dealerStands:17,blackjackPayout:1.5
  };
  const state={game:'blackjack',roomCode:room.code,matchId:uid('BLACKJACK'),version:1,startedAt:Date.now(),phase:'betting',round:1,rules,deck:buildShoe(rules.decks),shoeNumber:1,dealer:{cards:[],revealed:false,value:null,bust:false},players:[],turnOrder:[],turnIndex:0,currentPlayerId:null,turnDeadlineAt:null,dealerNextAt:null,nextRoundAt:null,events:[]};
  state.players=(room.players||[]).slice(0,MAX_PLAYERS).map(p=>playerTemplate(p,state));
  log(state,'table-open','Mesa Blackjack aberta. Faça sua aposta.');
  return state;
}

function findPlayer(state,userId){return state.players.find(p=>p.id===userId)||null}
function activeHand(player){return player?.hands?.[player.activeHand]||null}
function sameSplitValue(cards){return cards?.length===2&&splitValue(cards[0])===splitValue(cards[1])}
function actionFlags(state,player){
  const hand=activeHand(player);
  const isTurn=state.phase==='playerTurns'&&state.currentPlayerId===player?.id&&hand?.status==='playing';
  if(!isTurn)return{hit:false,stand:false,double:false,split:false};
  return{
    hit:true,stand:true,
    double:hand.cards.length===2&&!hand.splitAces&&player.bankroll>=hand.bet,
    split:hand.cards.length===2&&!hand.splitAces&&sameSplitValue(hand.cards)&&player.hands.length<MAX_HANDS&&player.bankroll>=hand.bet
  };
}

export function applyAction(state,userId,action,room,now=Date.now()){
  const s=clone(state);syncRoomPlayers(s,room);
  const p=findPlayer(s,userId);
  if(!p)throw new Error('Você não pertence a esta mesa.');
  const type=String(action?.type||'').toUpperCase();

  if(type==='PLACE_BET'){
    if(s.phase!=='betting')throw new Error('As apostas desta rodada já fecharam.');
    if(p.waitingNextRound)throw new Error('Você entra na próxima rodada.');
    const amount=Math.floor(Number(action.amount||0));
    if(amount<s.rules.minBet)throw new Error(`A aposta mínima é ${s.rules.minBet}.`);
    if(amount>p.bankroll)throw new Error('Fichas insuficientes.');
    p.bet=amount;p.ready=true;p.sittingOut=false;
    log(s,'bet',`${p.username} confirmou ${amount} fichas.`,{playerId:p.id,amount});
    s.version++;
    if(allReady(s))dealRound(s,now);
    return s;
  }
  if(type==='REBUY'){
    if(s.phase!=='betting')throw new Error('Recarregue fichas entre rodadas.');
    if(p.bankroll>=s.rules.minBet)throw new Error('Você ainda possui fichas suficientes.');
    p.bankroll=s.rules.startingChips;p.bet=s.rules.minBet;p.sittingOut=false;p.ready=false;
    log(s,'rebuy',`${p.username} recarregou fichas virtuais.`,{playerId:p.id});s.version++;return s;
  }
  if(type==='NEXT_ROUND'){
    if(room.ownerId!==userId)throw new Error('Somente o host pode adiantar a próxima rodada.');
    if(s.phase!=='roundEnd')throw new Error('A rodada ainda não terminou.');
    prepareBetting(s,room,now);return s;
  }

  const flags=actionFlags(s,p);
  if(!flags.hit&&!flags.stand)throw new Error('Não é sua vez.');
  const hand=activeHand(p);

  if(type==='HIT'){
    if(!flags.hit)throw new Error('Não é possível pedir carta agora.');
    hand.cards.push(draw(s));hand.actions++;
    const value=handValue(hand.cards);
    log(s,'hit',`${p.username} pediu uma carta.`,{playerId:p.id});
    if(value.bust){hand.status='bust';log(s,'bust',`${p.username} estourou com ${value.total}.`,{playerId:p.id});advanceFromHand(s,p,now)}
    else if(value.total===21){hand.status='stand';advanceFromHand(s,p,now)}
    else{s.turnDeadlineAt=s.rules.turnTimer>0?now+s.rules.turnTimer*1000:null}
    s.version++;return s;
  }
  if(type==='STAND'){
    if(!flags.stand)throw new Error('Não é possível parar agora.');
    hand.status='stand';hand.actions++;
    log(s,'stand',`${p.username} parou em ${handValue(hand.cards).total}.`,{playerId:p.id});
    advanceFromHand(s,p,now);s.version++;return s;
  }
  if(type==='DOUBLE'){
    if(!flags.double)throw new Error('Não é possível dobrar esta mão.');
    const addedBet=hand.bet;
    p.bankroll-=addedBet;hand.bet*=2;hand.doubled=true;hand.actions++;
    hand.cards.push(draw(s));
    const value=handValue(hand.cards);hand.status=value.bust?'bust':'stand';
    log(s,'double',`${p.username} dobrou para ${hand.bet} fichas.`,{playerId:p.id,amount:addedBet,totalBet:hand.bet});
    advanceFromHand(s,p,now);s.version++;return s;
  }
  if(type==='SPLIT'){
    if(!flags.split)throw new Error('Não é possível separar esta mão.');
    const [c1,c2]=hand.cards,bet=hand.bet,isAces=c1.rank==='A'&&c2.rank==='A';
    p.bankroll-=bet;
    const h1=makeHand([c1,draw(s)],bet,{fromSplit:true,splitAces:isAces});
    const h2=makeHand([c2,draw(s)],bet,{fromSplit:true,splitAces:isAces});
    if(isAces){h1.status='stand';h2.status='stand'}
    p.hands.splice(p.activeHand,1,h1,h2);
    log(s,'split',`${p.username} separou a mão.`,{playerId:p.id,amount:bet,totalBet:bet*2});
    if(h1.status==='playing'){
      s.currentPlayerId=p.id;s.turnDeadlineAt=s.rules.turnTimer>0?now+s.rules.turnTimer*1000:null;
    }else{
      advanceFromHand(s,p,now);
    }
    s.version++;return s;
  }
  throw new Error('Ação inválida no Blackjack.');
}

export function tick(state,room,now=Date.now()){
  const s=clone(state);const before=Number(s.version||0);
  syncRoomPlayers(s,room);

  if(s.phase==='playerTurns'){
    const current=findPlayer(s,s.currentPlayerId);
    if(!current||current.left){
      if(current){const hand=activeHand(current);if(hand?.status==='playing')hand.status='stand';advanceFromHand(s,current,now)}
      else setCurrentTurn(s,now);
      s.version++;
    }else if(s.turnDeadlineAt&&now>=s.turnDeadlineAt){
      const hand=activeHand(current);
      if(hand?.status==='playing'){
        hand.status='stand';
        log(s,'timeout',`${current.username} ficou sem tempo e parou automaticamente.`,{playerId:current.id});
        advanceFromHand(s,current,now);s.version++;
      }
    }
  }

  if(s.phase==='dealerTurn'&&s.dealerNextAt&&now>=s.dealerNextAt){
    if(dealerShouldHit(s)){
      s.dealer.cards.push(draw(s));s.dealerNextAt=now+820;
      log(s,'dealer-hit','Dealer pediu uma carta.');s.version++;
    }else{
      const dealerValue=handValue(s.dealer.cards);
      log(s,dealerValue.bust?'dealer-bust':'dealer-stand',dealerValue.bust?`Dealer estourou com ${dealerValue.total}.`:`Dealer parou em ${dealerValue.total}.`,{total:dealerValue.total});
      settleRound(s,now);
    }
  }

  if(s.phase==='roundEnd'&&s.nextRoundAt&&now>=s.nextRoundAt){
    prepareBetting(s,room,now);
  }

  // During betting, all confirmed players start automatically.
  if(s.phase==='betting'&&allReady(s))dealRound(s,now);
  return{state:s,changed:Number(s.version||0)!==before};
}

export function leavePlayer(state,userId,room,now=Date.now()){
  const s=clone(state);const p=findPlayer(s,userId);if(!p)return s;
  p.left=true;p.connection='offline';p.waitingNextRound=true;
  for(const hand of p.hands||[])if(hand.status==='playing')hand.status='stand';
  if(s.currentPlayerId===userId){advanceFromHand(s,p,now)}
  log(s,'leave',`${p.username} saiu da mesa.`,{playerId:p.id});s.version++;
  return s;
}

export function roleAndIdentity(state,userId,requestedRole='player'){
  if(requestedRole==='spectator')return{role:'spectator',player:null};
  const player=findPlayer(state,userId);
  return player?{role:'player',player}:{role:'spectator',player:null};
}

export function viewFor(state,userId,role='player'){
  const s=clone(state);const ident=roleAndIdentity(s,userId,role);
  s.role=ident.role;s.localPlayerId=ident.player?.id||null;
  s.shoeRemaining=s.deck?.length||0;delete s.deck;

  const reveal=s.phase==='dealerTurn'||s.phase==='roundEnd'||s.dealer.revealed;
  if(!reveal&&s.dealer.cards.length>1){
    s.dealer.cards=s.dealer.cards.map((c,i)=>i===0?c:null);
    s.dealer.value=handValue([s.dealer.cards[0]]).total;
  }else{
    s.dealer.value=handValue(s.dealer.cards).total;
  }

  for(const p of s.players){
    for(const hand of p.hands||[]){
      const v=handValue(hand.cards);hand.value=v.total;hand.soft=v.soft;hand.bust=v.bust;hand.natural=isNatural(hand);
    }
    p.availableActions=ident.player?.id===p.id?actionFlags(s,p):{hit:false,stand:false,double:false,split:false};
  }
  return s;
}
