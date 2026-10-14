import * as Chess from './chess-engine.js';
import * as Truco from './truco-engine.js';
import * as Blackjack from './blackjack-engine.js';
import * as Pool from './pool-engine.js';
import {getSharedValue,setSharedValue,compareAndSetGame,removeSharedValue,getRoomPrivate,setRoomPrivate,applyMutation} from './realtime-store.js';
import {recordGameResult} from './stats-service.js';

function gameKey(code){return`game:${code}`}
function clone(v){return structuredClone(v)}
function colors(room){
  const p=room.players||[];
  if(p.length<2)throw new Error('Xadrez precisa de 2 jogadores.');
  const pref=room.chessColor||'random';
  if(pref==='white')return{white:p[0],black:p[1]};
  if(pref==='black')return{white:p[1],black:p[0]};
  return Math.random()<.5?{white:p[0],black:p[1]}:{white:p[1],black:p[0]};
}

export function isTerminal(state){
  if(state?.game==='chess')return state.status!=='playing';
  if(state?.game==='truco')return['finished','abandoned'].includes(state.phase);
  if(state?.game==='pool')return state.status!=='playing';
  return false;
}

async function syncMatchRow(state){
  if(!state?.matchId||state.game==='blackjack')return true;
  const status=isTerminal(state)?'finished':'playing';
  const players=state.game==='chess'?Object.values(state.players||{}):state.players||[];
  try{
    await applyMutation({type:'match:upsert',match:{
      matchId:state.matchId,
      roomCode:state.roomCode||state.roomId,
      game:state.game,
      status,
      players,
      createdAt:state.startedAt||Date.now(),
      updatedAt:Date.now()
    }});
    return true;
  }catch(err){
    console.warn('[TDB match sync]',err?.message||err);
    return false;
  }
}

async function finalizeIfNeeded(state,reason=null){
  if(!isTerminal(state))return state;
  try{await recordGameResult(state,{reason})}catch(err){console.warn('[TDB stats]',err?.message||err)}
  const code=state.roomCode||state.roomId;
  const room=await getRoomPrivate(code);
  if(room&&room.status==='playing'){
    room.status='finished';
    room.finishedAt=Date.now();
    await setRoomPrivate(room);
  }
  // O match resumido é sincronizado apenas ao iniciar/finalizar, não em cada jogada.
  await syncMatchRow(state);
  return state;
}

export async function getGame(code){return await getSharedValue(gameKey(code),null)}

export async function refreshGame(code,existingState=null){
  let state=existingState||await getGame(code);
  if(!state)return null;
  // Never advance clocks or BOTs while a disconnected player has paused a match.
  if(state.pausedAt)return state;
  const beforeVersion=state.version||0;
  if(state.game==='chess'&&state.clockEnabled&&state.status==='playing')state=chessTick(state);
  if(state.game==='chess'&&state.status==='playing')state=chessBotTurn(state);
  if(state.game==='truco'&&!isTerminal(state)){state=Truco.tick(state,Date.now());state=Truco.runBotTurn(state,Date.now());}
  if(state.game==='blackjack'){
    const room=await getRoomPrivate(code);
    if(room){const ticked=Blackjack.tick(state,room,Date.now());state=ticked.state}
  }
  if(state.game==='pool'&&state.status==='playing'){const now=Date.now();state=Pool.tick(state,now);state=Pool.runBotTurn(state,now)}
  if((state.version||0)!==beforeVersion){
    try{
      await saveGame(code,state,beforeVersion);
    }catch(err){
      if(err.code==='STALE_STATE')return await getGame(code);
      throw err;
    }
    if(isTerminal(state))await finalizeIfNeeded(state,state.status==='timeout'?'timeout':state.lastAutoAction?.type||null);
  }
  return state;
}

// O BOT usa a inteligência ORIGINAL do Xadrez 7.2.5 (análise posicional,
// busca alpha-beta e dificuldades reais). O servidor mantém a decisão oficial.
function chessBotTurn(state){
  const player=state.players?.[state.turn];if(!player?.bot)return state;
  const difficulty=['easy','medium','hard'].includes(player.difficulty)?player.difficulty:'medium';
  const move=Chess.chooseBotMove(state,state.turn,difficulty,{timeBudgetMs:difficulty==='hard'?680:260});
  if(!move)return state;
  const next=Chess.applyMove(state,move,'queen');
  next.game='chess';next.roomCode=state.roomCode;next.version=(state.version||0)+1;next.serverClockAt=Date.now();
  return next;
}
export async function pauseGame(code,shouldPause,existingState=null){
  const state=existingState||await getGame(code);if(!state||isTerminal(state))return state;
  if(shouldPause&&!state.pausedAt){const previous=Number(state.version||0);state.pausedAt=Date.now();state.version=previous+1;await saveGame(code,state,previous)}
  else if(!shouldPause&&state.pausedAt){
    const delta=Date.now()-state.pausedAt;delete state.pausedAt;
    if(state.serverClockAt)state.serverClockAt+=delta;
    if(state.turnDeadlineAt)state.turnDeadlineAt+=delta;
    if(state.botThinkUntil)state.botThinkUntil+=delta;
    if(state.trickResolveAt)state.trickResolveAt+=delta;
    if(state.readyAt)state.readyAt+=delta;
    const previous=Number(state.version||0);state.version=previous+1;await saveGame(code,state,previous);
  }
  return state;
}
export async function cancelGame(code,reason='admin'){const state=await getGame(code);if(!state||isTerminal(state))return state;
  state.canceled=true;state.finishReason=reason;state.winner=null;state.winnerId=null;
  if(state.game==='truco')state.phase='finished';else state.status='canceled';
  const previous=Number(state.version||0);state.version=previous+1;
  try{await saveGame(code,state,previous)}catch(err){if(err.code==='STALE_STATE')return await cancelGame(code,reason);throw err}
  await finalizeIfNeeded(state,reason);return state;
}
export async function saveGame(code,state,expectedVersion=null){
  if(expectedVersion===null)await setSharedValue(gameKey(code),state);
  else if(!await compareAndSetGame(gameKey(code),expectedVersion,state)){
    throw Object.assign(new Error('A partida mudou. Atualize e tente novamente.'),{code:'STALE_STATE'});
  }
  // Estado completo somente em tdb_shared; tdb_matches guarda resumo de
  // início/fim, sem uma gravação extra em cada jogada.
  return state;
}

export async function startGame(room){
  let state;
  if(room.game==='chess'){
    const c=colors(room);
    state=Chess.createState({room,whitePlayer:c.white,blackPlayer:c.black});
    state.game='chess';state.roomCode=room.code;state.version=1;
    state.players.white.color='white';state.players.black.color='black';state.serverClockAt=Date.now();
  }else if(room.game==='truco')state=Truco.createState(room);
  else if(room.game==='blackjack')state=Blackjack.createState(room);
  else if(room.game==='pool')state=Pool.createState(room);
  else throw new Error('Jogo não suportado pelo servidor.');

  state.processedActionIds=[];
  state.startedAt=state.startedAt||Date.now();

  const previousRoom=clone(room);
  const previousGame=await getGame(room.code);
  try{
    // Primeiro grava o estado oficial. A sala só vira "playing" quando
    // o estado da partida já existe; isso elimina salas fantasma.
    await setSharedValue(gameKey(room.code),state);
    room.status='playing';room.startedAt=Date.now();delete room.finishedAt;
    await setRoomPrivate(room);
    await syncMatchRow(state);
    return state;
  }catch(err){
    try{
      if(previousGame)await setSharedValue(gameKey(room.code),previousGame);
      else await removeSharedValue(gameKey(room.code));
    }catch(rollbackErr){console.warn('[TDB game rollback]',rollbackErr?.message||rollbackErr)}
    Object.keys(room).forEach(k=>delete room[k]);Object.assign(room,previousRoom);
    try{await setRoomPrivate(previousRoom)}catch(rollbackErr){console.warn('[TDB room rollback]',rollbackErr?.message||rollbackErr)}
    throw err;
  }
}

export function roleAndIdentity(state,userId,requestedRole='player'){
  if(requestedRole==='spectator')return{role:'spectator'};
  if(state.game==='chess'){
    if(state.players.white.id===userId)return{role:'player',color:'white'};
    if(state.players.black.id===userId)return{role:'player',color:'black'};
    return{role:'spectator'};
  }
  if(state.game==='truco'){
    const seat=Truco.seatForUser(state,userId);
    return seat===null?{role:'spectator'}:{role:'player',seat};
  }
  if(state.game==='pool'){
    const seat=Pool.seatForUser(state,userId);
    return seat===null?{role:'spectator'}:{role:'player',seat};
  }
  if(state.game==='blackjack')return Blackjack.roleAndIdentity(state,userId,requestedRole);
  return{role:'spectator'};
}

function chessTick(state){
  if(!state.clockEnabled||state.status!=='playing')return state;
  const now=Date.now(),last=state.serverClockAt||now,delta=Math.max(0,(now-last)/1000);
  state.serverClockAt=now;
  state.clocks[state.turn]=Math.max(0,state.clocks[state.turn]-delta);
  if(state.clocks[state.turn]<=0){state.status='timeout';state.winner=Chess.other(state.turn);state.version=(state.version||0)+1}
  return state;
}

function rememberAction(state,actionId){
  if(!actionId)return;
  state.processedActionIds=Array.isArray(state.processedActionIds)?state.processedActionIds:[];
  state.processedActionIds.push(actionId);
  if(state.processedActionIds.length>80)state.processedActionIds=state.processedActionIds.slice(-80);
}

export async function applyAction(code,userId,action){
  let state=await refreshGame(code);
  if(!state)throw new Error('Partida não encontrada.');
  if(state.pausedAt)throw new Error('Partida pausada aguardando reconexão.');
  const originalVersion=Number(state.version||0);
  const actionId=String(action?.actionId||'');
  if(actionId&&state.processedActionIds?.includes(actionId))return state;
  if(action?.expectedVersion!==undefined&&Number(action.expectedVersion)!==Number(state.version||0)){
    throw Object.assign(new Error('A partida mudou. Estado atualizado; tente novamente.'),{code:'STALE_STATE'});
  }
  if(state.game==='chess'){
    state=chessTick(state);
    const ident=roleAndIdentity(state,userId,'player');
    if(ident.role!=='player')throw new Error('Espectador não pode jogar.');
    if(state.status!=='playing')throw new Error('A partida já terminou.');
    if(action.type==='MOVE'){
      if(state.turn!==ident.color)throw new Error('Não é sua vez.');
      const beforeMoves=state.moveHistory.length,offered=state.drawOffer;
      state=Chess.applyMove(state,{from:action.from,to:action.to,castle:action.castle||undefined},action.promotion||'queen');
      if(state.moveHistory.length===beforeMoves)throw new Error('Movimento inválido.');
      if(offered&&offered!==ident.color)state.drawOffer=null;
      state.game='chess';state.roomCode=code;state.version=(state.version||0)+1;state.serverClockAt=Date.now();
    }else if(action.type==='OFFER_DRAW'){state.drawOffer=ident.color;state.version++}
    else if(action.type==='DECLINE_DRAW'){state.drawOffer=null;state.version++}
    else if(action.type==='ACCEPT_DRAW'){
      if(state.drawOffer&&state.drawOffer!==ident.color){state.status='draw';state.drawReason='acordo';state.drawOffer=null;state.version++}
      else throw new Error('Não existe proposta de empate do adversário.');
    }else if(action.type==='RESIGN'){state.status='resigned';state.winner=Chess.other(ident.color);state.finishReason='resign';state.version++}
    else throw new Error('Ação inválida.');
  }else if(state.game==='truco'){
    const ident=roleAndIdentity(state,userId,'player');
    if(ident.role!=='player')throw new Error('Espectador não pode jogar.');
    if(['finished','abandoned'].includes(state.phase))throw new Error('A partida já terminou.');
    state=Truco.applyTrucoAction(state,ident.seat,action);
  }else if(state.game==='blackjack'){
    const room=await getRoomPrivate(code);if(!room)throw new Error('Sala não encontrada.');
    state=Blackjack.applyAction(state,userId,action,room,Date.now());
  }else if(state.game==='pool'){
    state=Pool.applyAction(state,userId,action,Date.now());
  }else throw new Error('Jogo não suportado.');
  // Antecipar o turno dos BOTs ainda na resposta à jogada humana.
  // Mantém a estratégia original (inclusive as dificuldades) e respeita pausas,
  // turnos humanos e o breve tempo de revelação da carta no Truco.
  if(!state.pausedAt&&state.game==='chess'&&state.status==='playing')state=chessBotTurn(state);
  if(!state.pausedAt&&state.game==='truco'&&!isTerminal(state)){
    for(let i=0;i<4;i++){
      const before=state.version||0;
      state=Truco.runBotTurn(state,Date.now());
      if((state.version||0)===before)break;
    }
  }
  rememberAction(state,actionId);
  await saveGame(code,state,originalVersion);
  if(isTerminal(state))await finalizeIfNeeded(state);
  return state;
}

export async function abandonGame(code,userId,reason='abandonment'){
  let state=await getGame(code);
  if(!state||isTerminal(state))return state;
  const originalVersion=Number(state.version||0);
  if(state.game==='chess'){
    const ident=roleAndIdentity(state,userId,'player');if(ident.role!=='player')return state;
    state.status='abandoned';state.winner=Chess.other(ident.color);state.finishReason=reason;state.version=(state.version||0)+1;
  }else if(state.game==='truco'){
    const ident=roleAndIdentity(state,userId,'player');if(ident.role!=='player')return state;
    const p=state.players.find(p=>p.seat===ident.seat);state.phase='abandoned';state.winner=p?1-p.team:null;state.finishReason=reason;state.turnDeadlineAt=null;state.version=(state.version||0)+1;
  }else if(state.game==='blackjack'){
    const room=await getRoomPrivate(code);if(room)state=Blackjack.leavePlayer(state,userId,room,Date.now());
  }else if(state.game==='pool'){
    const ident=roleAndIdentity(state,userId,'player');if(ident.role!=='player')return state;
    const opp=state.players.find(p=>p.id!==userId);state.status='finished';state.winnerId=opp?.id||null;state.loserId=userId;state.finishReason=reason;state.turnDeadlineAt=null;state.version=(state.version||0)+1;
  }
  try{await saveGame(code,state,originalVersion)}catch(err){if(err.code==='STALE_STATE')return await abandonGame(code,userId,reason);throw err}
  await finalizeIfNeeded(state,reason);
  return state;
}

export function viewFor(state,userId,role='player'){
  if(state.game==='truco')return Truco.viewFor(state,userId,role);
  if(state.game==='blackjack')return Blackjack.viewFor(state,userId,role);
  if(state.game==='pool')return Pool.viewFor(state,userId,role);
  const s=clone(state);s.role=role;
  if(state.game==='chess'){const ident=roleAndIdentity(state,userId,role);s.localColor=ident.color||null}
  return s;
}

export async function returnToRoom(code,userId){
  const room=await getRoomPrivate(code);if(!room)throw new Error('Sala não encontrada.');
  const isMember=(room.players||[]).some(p=>p.id===userId);if(!isMember)throw new Error('Você não pertence a esta sala.');
  const state=await getGame(code);if(state&&!isTerminal(state))throw new Error('A partida ainda está em andamento.');
  room.status='open';delete room.finishedAt;delete room.startedAt;
  room.players=(room.players||[]).map(p=>({...p,connection:'online'}));
  await setRoomPrivate(room);return room;
}

export async function rematchGame(code,userId){
  const room=await getRoomPrivate(code);if(!room)throw new Error('Sala não encontrada.');
  if(room.ownerId!==userId)throw new Error('Somente o host pode iniciar uma nova partida.');
  const current=await getGame(code);if(current&&!isTerminal(current))throw new Error('A partida atual ainda não terminou.');
  const required=room.game==='truco'?Number(room.trucoSeats||4):['chess','pool'].includes(room.game)?2:1;
  if((room.players||[]).length<required)throw new Error(`A sala precisa de ${required} jogador(es).`);
  if((room.players||[]).some(p=>p.connection==='reconnecting'))throw new Error('Aguarde todos os jogadores reconectarem antes da nova partida.');
  // startGame é transacional e só marca a sala como playing depois de
  // gravar o novo estado oficial. Não antecipe o status na revanche.
  return await startGame(room);
}
