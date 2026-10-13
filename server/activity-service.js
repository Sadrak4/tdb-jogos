// v7.2.5 — Central de Atividades (organização, sem iniciar partidas).
// Reutiliza tdb_shared, não altera o esquema Supabase existente.
import { getRoomPrivate, getSharedValue, setSharedValue } from './realtime-store.js';

const ALLOWED_GAMES={chess:{name:'Xadrez',capacity:2},pool:{name:'Sinuca',capacity:2},truco:{name:'Truco',capacity:4}};
const MAX_TABLES=1; // Etapa inicial; expansão para mesas simultâneas na v7.3.0.
const key=code=>`activities:${code}`;
const member=(room,id)=>(room.players||[]).some(p=>p.id===id)||(room.spectators||[]).some(p=>p.id===id);
const identity=user=>({id:user.id,username:String(user.username||'Jogador').slice(0,40)});
const blank=code=>({roomCode:code,tables:[],revision:0,updatedAt:Date.now()});

async function checkedRoom(code,user){
  const normalized=String(code||'').trim().toUpperCase();
  if(!/^[A-Z0-9-]{3,32}$/.test(normalized))throw new Error('Código de sala inválido.');
  const room=await getRoomPrivate(normalized);
  if(!room||room.game!=='music')throw new Error('Entre em uma sala TDB Lobby para organizar mesas.');
  if(!member(room,user.id))throw new Error('Você não participa desta sala.');
  return room;
}
function sanitize(room,data){
  const allowed=new Set([...(room.players||[]),...(room.spectators||[])].map(p=>p.id));
  const state=data&&typeof data==='object'?data:blank(room.code);
  const tables=(Array.isArray(state.tables)?state.tables:[]).slice(0,MAX_TABLES).filter(t=>ALLOWED_GAMES[t?.game]).map(t=>({
    ...t,
    players:(Array.isArray(t.players)?t.players:[]).filter(p=>allowed.has(p.id)).slice(0,ALLOWED_GAMES[t.game].capacity),
    spectators:(Array.isArray(t.spectators)?t.spectators:[]).filter(p=>allowed.has(p.id)).slice(0,20)
  }));
  return {roomCode:room.code,tables,revision:Number(state.revision||0),updatedAt:Number(state.updatedAt||0)};
}
export async function getActivities(code,user){
  const room=await checkedRoom(code,user);
  return sanitize(room,await getSharedValue(key(room.code),blank(room.code)));
}
export async function applyActivityAction(code,user,action={}){
  const room=await checkedRoom(code,user);
  const type=String(action.type||'').toUpperCase();
  const state=sanitize(room,await getSharedValue(key(room.code),blank(room.code)));
  const self=identity(user);
  const table=state.tables[0]||null;
  if(type==='CREATE'){
    const game=String(action.game||'').toLowerCase();
    if(!ALLOWED_GAMES[game])throw new Error('Escolha Xadrez, Sinuca ou Truco.');
    if(table)throw new Error('Já existe uma mesa nesta sala. Encerre-a antes de criar outra.');
    state.tables=[{
      id:`ACT-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,
      game,gameName:ALLOWED_GAMES[game].name,capacity:ALLOWED_GAMES[game].capacity,
      hostId:user.id,hostName:self.username,players:[self],spectators:[],
      status:'organizing',createdAt:Date.now()
    }];
  }else if(type==='JOIN'||type==='WATCH'){
    if(!table||table.id!==String(action.tableId||''))throw new Error('Mesa não encontrada. Atualize a lista.');
    const players=table.players.filter(p=>p.id!==user.id);
    const spectators=table.spectators.filter(p=>p.id!==user.id);
    if(type==='JOIN'){
      if(players.length>=table.capacity)throw new Error('A mesa já está cheia. Entre como espectador.');
      players.push(self);
    }else{
      spectators.push(self);
    }
    table.players=players;
    table.spectators=spectators;
  }else if(type==='LEAVE'){
    if(!table||table.id!==String(action.tableId||''))throw new Error('Mesa não encontrada.');
    table.players=table.players.filter(p=>p.id!==user.id);
    table.spectators=table.spectators.filter(p=>p.id!==user.id);
  }else if(type==='CLOSE'){
    if(!table||table.id!==String(action.tableId||''))throw new Error('Mesa não encontrada.');
    if(user.id!==table.hostId&&user.id!==room.ownerId)throw new Error('Somente o organizador ou host da sala pode encerrar a mesa.');
    state.tables=[];
  }else{
    throw new Error('Ação da mesa inválida.');
  }
  state.revision+=1;
  state.updatedAt=Date.now();
  await setSharedValue(key(room.code),state);
  return state;
}
