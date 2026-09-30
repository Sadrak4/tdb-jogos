import * as Chess from './chess-engine.js';
import * as Truco from './truco-engine.js';
import * as Blackjack from './blackjack-engine.js';
import {getSharedValue,setSharedValue,getRoomPrivate,setRoomPrivate,applyMutation} from './realtime-store.js';
import { recordGameResult } from './stats-service.js';
function gameKey(code){return`game:${code}`}function clone(v){return structuredClone(v)}
function colors(room){const p=room.players||[];if(p.length<2)throw new Error('Xadrez precisa de 2 jogadores.');const pref=room.chessColor||'random';if(pref==='white')return{white:p[0],black:p[1]};if(pref==='black')return{white:p[1],black:p[0]};return Math.random()<.5?{white:p[0],black:p[1]}:{white:p[1],black:p[0]}}
export function isTerminal(state){return state?.game==='chess'?state.status!=='playing':state?.game==='truco'?['finished','abandoned'].includes(state.phase):false}
async function syncMatchRow(state){if(!state?.matchId||state.game==='blackjack')return;const status=isTerminal(state)?'finished':'playing';await applyMutation({type:'match:upsert',match:{matchId:state.matchId,roomCode:state.roomCode||state.roomId,game:state.game,status,players:state.game==='chess'?Object.values(state.players||{}):state.players||[],createdAt:state.startedAt||Date.now(),updatedAt:Date.now()}})}
async function finalizeIfNeeded(state,reason=null){if(!isTerminal(state))return state;await recordGameResult(state,{reason});const code=state.roomCode||state.roomId,room=await getRoomPrivate(code);if(room&&room.status==='playing'){room.status='finished';room.finishedAt=Date.now();await setRoomPrivate(room)}await syncMatchRow(state);return state}
export async function getGame(code){return await getSharedValue(gameKey(code),null)}
export async function refreshGame(code){let state=await getGame(code);if(!state)return null;const beforeVersion=state.version||0;if(state.game==='chess'&&state.clockEnabled&&state.status==='playing')state=chessTick(state);if(state.game==='truco'&&state.phase!=='finished')state=Truco.tick(state,Date.now());if(state.game==='blackjack'){const room=await getRoomPrivate(code);if(room){const ticked=Blackjack.tick(state,room,Date.now());state=ticked.state}}if((state.version||0)!==beforeVersion||isTerminal(state)){await saveGame(code,state);await finalizeIfNeeded(state,state.status==='timeout'?'timeout':state.lastAutoAction?.type||null)}return state}
export async function saveGame(code,state){await setSharedValue(gameKey(code),state);await syncMatchRow(state);return state}
export async function startGame(room){let state;if(room.game==='chess'){const c=colors(room);state=Chess.createState({room,whitePlayer:c.white,blackPlayer:c.black});state.game='chess';state.roomCode=room.code;state.version=1;state.players.white.color='white';state.players.black.color='black'}else if(room.game==='truco')state=Truco.createState(room);else if(room.game==='blackjack')state=Blackjack.createState(room);else throw new Error('Jogo não suportado pelo servidor.');state.processedActionIds=[];state.startedAt=state.startedAt||Date.now();room.status='playing';room.startedAt=Date.now();await setRoomPrivate(room);await saveGame(room.code,state);return state}
export function roleAndIdentity(state,userId,requestedRole='player'){if(requestedRole==='spectator')return{role:'spectator'};if(state.game==='chess'){if(state.players.white.id===userId)return{role:'player',color:'white'};if(state.players.black.id===userId)return{role:'player',color:'black'};return{role:'spectator'}}if(state.game==='truco'){const seat=Truco.seatForUser(state,userId);return seat===null?{role:'spectator'}:{role:'player',seat}}if(state.game==='blackjack')return Blackjack.roleAndIdentity(state,userId,requestedRole);return{role:'spectator'}}
function chessTick(state){if(!state.clockEnabled||state.status!=='playing')return state;const now=Date.now(),last=state.serverClockAt||now,delta=Math.max(0,(now-last)/1000);state.serverClockAt=now;state.clocks[state.turn]=Math.max(0,state.clocks[state.turn]-delta);if(state.clocks[state.turn]<=0){state.status='timeout';state.winner=Chess.other(state.turn);state.version=(state.version||0)+1}return state}
function rememberAction(state,actionId){if(!actionId)return;state.processedActionIds=Array.isArray(state.processedActionIds)?state.processedActionIds:[];state.processedActionIds.push(actionId);if(state.processedActionIds.length>80)state.processedActionIds=state.processedActionIds.slice(-80)}
export async function applyAction(code,userId,action){let state=await refreshGame(code);if(!state)throw new Error('Partida não encontrada.');const actionId=String(action?.actionId||'');if(actionId&&state.processedActionIds?.includes(actionId))return state;if(action?.expectedVersion!==undefined&&Number(action.expectedVersion)!==Number(state.version||0))throw Object.assign(new Error('A partida mudou. Estado atualizado; tente novamente.'),{code:'STALE_STATE'});if(state.game==='chess'){state=chessTick(state);const ident=roleAndIdentity(state,userId,'player');if(ident.role!=='player')throw new Error('Espectador não pode jogar.');if(state.status!=='playing')throw new Error('A partida já terminou.');if(action.type==='MOVE'){if(state.turn!==ident.color)throw new Error('Não é sua vez.');const beforeMoves=state.moveHistory.length,offered=state.drawOffer;state=Chess.applyMove(state,{from:action.from,to:action.to,castle:action.castle||undefined},action.promotion||'queen');if(state.moveHistory.length===beforeMoves)throw new Error('Movimento inválido.');if(offered&&offered!==ident.color)state.drawOffer=null;state.game='chess';state.roomCode=code;state.version=(state.version||0)+1;state.serverClockAt=Date.now()}else if(action.type==='OFFER_DRAW'){state.drawOffer=ident.color;state.version++}else if(action.type==='DECLINE_DRAW'){state.drawOffer=null;state.version++}else if(action.type==='ACCEPT_DRAW'){if(state.drawOffer&&state.drawOffer!==ident.color){state.status='draw';state.drawReason='acordo';state.drawOffer=null;state.version++}else throw new Error('Não existe proposta de empate do adversário.')}else if(action.type==='RESIGN'){state.status='resigned';state.winner=Chess.other(ident.color);state.finishReason='resign';state.version++}else throw new Error('Ação inválida.')}else if(state.game==='truco'){const ident=roleAndIdentity(state,userId,'player');if(ident.role!=='player')throw new Error('Espectador não pode jogar.');if(['finished','abandoned'].includes(state.phase))throw new Error('A partida já terminou.');state=Truco.applyTrucoAction(state,ident.seat,action)}else if(state.game==='blackjack'){const room=await getRoomPrivate(code);if(!room)throw new Error('Sala não encontrada.');state=Blackjack.applyAction(state,userId,action,room,Date.now())}rememberAction(state,actionId);await saveGame(code,state);await finalizeIfNeeded(state);return state}
export async function abandonGame(code,userId,reason='abandonment'){let state=await getGame(code);if(!state||isTerminal(state))return state;if(state.game==='chess'){const ident=roleAndIdentity(state,userId,'player');if(ident.role!=='player')return state;state.status='abandoned';state.winner=Chess.other(ident.color);state.finishReason=reason;state.version=(state.version||0)+1}else if(state.game==='truco'){const ident=roleAndIdentity(state,userId,'player');if(ident.role!=='player')return state;const p=state.players.find(p=>p.seat===ident.seat);state.phase='abandoned';state.winner=p?1-p.team:null;state.finishReason=reason;state.turnDeadlineAt=null;state.version=(state.version||0)+1}else if(state.game==='blackjack'){const room=await getRoomPrivate(code);if(room)state=Blackjack.leavePlayer(state,userId,room,Date.now())}await saveGame(code,state);await finalizeIfNeeded(state,reason);return state}
export function viewFor(state,userId,role='player'){if(state.game==='truco')return Truco.viewFor(state,userId,role);if(state.game==='blackjack')return Blackjack.viewFor(state,userId,role);const s=clone(state);s.role=role;if(state.game==='chess'){const ident=roleAndIdentity(state,userId,role);s.localColor=ident.color||null}return s}


export async function returnToRoom(code,userId){
  const room=await getRoomPrivate(code);
  if(!room) throw new Error('Sala não encontrada.');

  const isMember=(room.players||[]).some(p=>p.id===userId);
  if(!isMember) throw new Error('Você não pertence a esta sala.');

  const state=await getGame(code);
  if(state && !isTerminal(state)){
    throw new Error('A partida ainda está em andamento.');
  }

  room.status='open';
  delete room.finishedAt;
  delete room.startedAt;
  room.players=(room.players||[]).map(p=>({
    ...p,
    connection:'online'
  }));

  await setRoomPrivate(room);
  return room;
}

export async function rematchGame(code,userId){
  const room=await getRoomPrivate(code);
  if(!room) throw new Error('Sala não encontrada.');
  if(room.ownerId!==userId) throw new Error('Somente o host pode iniciar uma nova partida.');

  const current=await getGame(code);
  if(current && !isTerminal(current)){
    throw new Error('A partida atual ainda não terminou.');
  }

  const required=room.game==='truco'
    ? Number(room.trucoSeats||4)
    : room.game==='chess'
      ? 2
      : 1;

  if((room.players||[]).length<required){
    throw new Error(`A sala precisa de ${required} jogador(es).`);
  }

  if((room.players||[]).some(p=>p.connection==='reconnecting')){
    throw new Error('Aguarde todos os jogadores reconectarem antes da nova partida.');
  }

  room.status='playing';
  room.startedAt=Date.now();
  delete room.finishedAt;
  await setRoomPrivate(room);

  return await startGame(room);
}
