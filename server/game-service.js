import * as Chess from './chess-engine.js';
import * as Truco from './truco-engine.js';
import { getSharedValue,setSharedValue } from './realtime-store.js';

function gameKey(code){return `game:${code}`}
function clone(v){return structuredClone(v)}
function colors(room){
  const p=room.players||[];
  if(p.length<2) throw new Error('Xadrez precisa de 2 jogadores.');
  const pref=room.chessColor||'random';
  if(pref==='white') return {white:p[0],black:p[1]};
  if(pref==='black') return {white:p[1],black:p[0]};
  return Math.random()<.5?{white:p[0],black:p[1]}:{white:p[1],black:p[0]};
}
export async function getGame(code){return await getSharedValue(gameKey(code),null)}
export async function refreshGame(code){
  let state=await getGame(code);
  if(!state) return null;
  if(state.game==='chess' && state.clockEnabled && state.status==='playing'){
    state=chessTick(state);
    await saveGame(code,state);
  }
  return state;
}
export async function saveGame(code,state){await setSharedValue(gameKey(code),state);return state}
export async function startGame(room){
  let state;
  if(room.game==='chess'){
    const c=colors(room);
    state=Chess.createState({room,whitePlayer:c.white,blackPlayer:c.black});
    state.game='chess';state.roomCode=room.code;state.version=1;
  }else if(room.game==='truco'){
    state=Truco.createState(room);
  }else throw new Error('Jogo não suportado pelo servidor.');
  await saveGame(room.code,state);
  return state;
}
export function roleAndIdentity(state,userId,requestedRole='player'){
  if(requestedRole==='spectator') return {role:'spectator'};
  if(state.game==='chess'){
    if(state.players.white.id===userId) return {role:'player',color:'white'};
    if(state.players.black.id===userId) return {role:'player',color:'black'};
    return {role:'spectator'};
  }
  if(state.game==='truco'){
    const seat=Truco.seatForUser(state,userId);
    return seat===null?{role:'spectator'}:{role:'player',seat};
  }
  return {role:'spectator'};
}
function chessTick(state){
  if(!state.clockEnabled||state.status!=='playing') return state;
  const now=Date.now();
  const last=state.serverClockAt||now;
  const delta=Math.max(0,(now-last)/1000);
  state.serverClockAt=now;
  state.clocks[state.turn]=Math.max(0,state.clocks[state.turn]-delta);
  if(state.clocks[state.turn]<=0){
    state.status='timeout';state.winner=Chess.other(state.turn);
  }
  return state;
}
export async function applyAction(code,userId,action){
  let state=await getGame(code);if(!state) throw new Error('Partida não encontrada.');
  if(state.game==='chess'){
    state=chessTick(state);
    const ident=roleAndIdentity(state,userId,'player');
    if(ident.role!=='player') throw new Error('Espectador não pode jogar.');
    if(action.type==='MOVE'){
      if(state.turn!==ident.color) throw new Error('Não é sua vez.');
      const from=action.from,to=action.to;
      const offered=state.drawOffer;
      state=Chess.applyMove(state,{from,to,castle:action.castle||undefined},action.promotion||'queen');
      if(offered && offered!==ident.color) state.drawOffer=null;
      state.game='chess';state.roomCode=code;state.version=(state.version||0)+1;state.serverClockAt=Date.now();
    }else if(action.type==='OFFER_DRAW'){
      state.drawOffer=ident.color;state.version++;
    }else if(action.type==='DECLINE_DRAW'){
      state.drawOffer=null;state.version++;
    }else if(action.type==='ACCEPT_DRAW'){
      if(state.drawOffer&&state.drawOffer!==ident.color){state.status='draw';state.drawReason='acordo';state.drawOffer=null;state.version++}
    }else if(action.type==='RESIGN'){
      state.status='resigned';state.winner=Chess.other(ident.color);state.version++;
    }else if(action.type==='RESTART'){
      throw new Error('Revanche deve ser iniciada pelo host.');
    }else throw new Error('Ação inválida.');
  }else if(state.game==='truco'){
    const ident=roleAndIdentity(state,userId,'player');
    if(ident.role!=='player') throw new Error('Espectador não pode jogar.');
    state=Truco.applyTrucoAction(state,ident.seat,action);
  }
  await saveGame(code,state);
  return state;
}
export function viewFor(state,userId,role='player'){
  if(state.game==='truco') return Truco.viewFor(state,userId,role);
  const s=clone(state);s.role=role;
  if(state.game==='chess'){
    const ident=roleAndIdentity(state,userId,role);s.localColor=ident.color||null;
  }
  return s;
}
