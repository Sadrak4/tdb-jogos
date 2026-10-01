import {
  initSupabase,isSupabaseReady,getSupabaseClient,
  getSharedValue,setSharedValue,getRoomPrivate,setRoomPrivate,emitEvent
} from './realtime-store.js';
import * as Auth from './auth-service.js';

const PARTY_MAX=4;
const ROOM_CHAT_MAX=50;
const ROOM_REACTION_MAX=24;
const MUSIC_FAVORITES_MAX=100;
const MUSIC_PRESETS_MAX=10;
const ALLOWED_REACTIONS=new Set(['😂','🔥','👏','😮','❤️','👍']);

function clone(v){return structuredClone(v)}
function now(){return Date.now()}
function cleanText(v,max=280){return String(v||'').trim().replace(/\s+/g,' ').slice(0,max)}
function roomChatKey(code){return `roomchat:${String(code||'').toUpperCase()}`}
function roomReactionKey(code){return `roomreactions:${String(code||'').toUpperCase()}`}
function partyKey(id){return `party:${id}`}
function partyMemberKey(userId){return `party-member:${userId}`}
function partyInvitesKey(userId){return `party-invites:${userId}`}
function musicFavoritesKey(userId){return `music-favorites:${userId}`}
function musicPresetsKey(userId){return `music-presets:${userId}`}
function musicStateKey(code){return `music:${String(code||'').toUpperCase()}`}
function safeUser(u){return u?{id:u.id,username:u.username,avatar:u.avatar||null}:null}

async function areFriends(a,b){
  const friends=await Auth.listFriends(a);
  return friends.some(x=>x.id===b);
}
function isRoomMember(room,userId){
  return (room?.players||[]).some(p=>p.id===userId)||(room?.spectators||[]).some(p=>p.id===userId);
}
async function requireRoomMember(code,userId){
  const room=await getRoomPrivate(String(code||'').toUpperCase());
  if(!room)throw new Error('Sala não encontrada.');
  if(!isRoomMember(room,userId))throw new Error('Você não está nesta sala.');
  return room;
}

export async function setReady(code,user,ready){
  const room=await getRoomPrivate(String(code||'').toUpperCase());
  if(!room)throw new Error('Sala não encontrada.');
  if(room.game==='music')throw new Error('TDB Music não usa estado de pronto.');
  if(room.status!=='open')throw new Error('A partida já começou.');
  const player=(room.players||[]).find(p=>p.id===user.id);
  if(!player)throw new Error('Você não está como jogador nesta sala.');
  player.ready=!!ready;
  player.readyAt=player.ready?now():null;
  await setRoomPrivate(room);
  await emitEvent('rooms',room.code,'ready');
  return room;
}

export async function roomFeed(code,user){
  const room=await requireRoomMember(code,user.id);
  const [messages,reactions]=await Promise.all([
    getSharedValue(roomChatKey(room.code),[]),
    getSharedValue(roomReactionKey(room.code),[])
  ]);
  const cutoff=now()-4000;
  return{
    roomCode:room.code,
    messages:(Array.isArray(messages)?messages:[]).slice(-ROOM_CHAT_MAX),
    reactions:(Array.isArray(reactions)?reactions:[]).filter(r=>Number(r.expiresAt||0)>now()&&Number(r.at||0)>=cutoff).slice(-ROOM_REACTION_MAX),
    spectatorCount:(room.spectators||[]).length,
    spectators:(room.spectators||[]).map(safeUser)
  };
}

export async function sendRoomMessage(code,user,message){
  const room=await requireRoomMember(code,user.id);
  const text=cleanText(message,280);
  if(text.length<1)throw new Error('Digite uma mensagem.');
  const current=await getSharedValue(roomChatKey(room.code),[]);
  const list=Array.isArray(current)?current:[];
  const entry={
    id:`MSG-${now()}-${Math.random().toString(36).slice(2,8)}`,
    userId:user.id,username:user.username,avatar:user.avatar||null,
    message:text,at:now()
  };
  list.push(entry);
  await setSharedValue(roomChatKey(room.code),list.slice(-ROOM_CHAT_MAX));
  await emitEvent('roomfeed',room.code,'message');
  return entry;
}

export async function sendRoomReaction(code,user,emoji){
  const room=await requireRoomMember(code,user.id);
  const value=String(emoji||'');
  if(!ALLOWED_REACTIONS.has(value))throw new Error('Reação inválida.');
  const current=await getSharedValue(roomReactionKey(room.code),[]);
  const list=(Array.isArray(current)?current:[]).filter(r=>Number(r.expiresAt||0)>now()-1000);
  const entry={
    id:`RCT-${now()}-${Math.random().toString(36).slice(2,8)}`,
    userId:user.id,username:user.username,avatar:user.avatar||null,
    emoji:value,at:now(),expiresAt:now()+2400
  };
  list.push(entry);
  await setSharedValue(roomReactionKey(room.code),list.slice(-ROOM_REACTION_MAX));
  await emitEvent('roomfeed',room.code,'reaction');
  return entry;
}

async function getPartyMembership(userId){
  const membership=await getSharedValue(partyMemberKey(userId),null);
  return membership?.partyId||null;
}
async function getPartyById(id){
  if(!id)return null;
  const party=await getSharedValue(partyKey(id),null);
  return party&&Array.isArray(party.members)?party:null;
}
async function saveParty(party){
  party.updatedAt=now();
  await setSharedValue(partyKey(party.id),party);
  await emitEvent('party',party.roomCode||null,'update');
  return party;
}
async function hydrateParty(party,userId){
  if(!party)return null;
  const invites=await getSharedValue(partyInvitesKey(userId),[]);
  return{...clone(party),isLeader:party.leaderId===userId,invites:(Array.isArray(invites)?invites:[]).filter(i=>Number(i.expiresAt||0)>now())};
}


export async function partyCanFollowRoom(userId,roomCode,ownerId=null){
  const partyId=await getPartyMembership(userId);
  const party=await getPartyById(partyId);
  if(!party)return false;
  const code=String(roomCode||'').toUpperCase();
  return party.roomCode===code
    && (!ownerId||party.leaderId===ownerId)
    && party.members.some(m=>m.id===userId);
}

export async function partySummaryForUser(userId){
  const partyId=await getPartyMembership(userId);
  const party=await getPartyById(partyId);
  const invites=await getSharedValue(partyInvitesKey(userId),[]);
  if(!party){
    if(partyId)await setSharedValue(partyMemberKey(userId),null);
    return{party:null,invites:(Array.isArray(invites)?invites:[]).filter(i=>Number(i.expiresAt||0)>now())};
  }
  return{party:await hydrateParty(party,userId),invites:(Array.isArray(invites)?invites:[]).filter(i=>Number(i.expiresAt||0)>now())};
}

export async function partyAction(user,action={}){
  const type=String(action.type||'').toUpperCase();
  const currentId=await getPartyMembership(user.id);
  let party=await getPartyById(currentId);

  if(type==='CREATE'){
    if(party)return await hydrateParty(party,user.id);
    const id=`PTY-${now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    party={id,leaderId:user.id,members:[safeUser(user)],roomCode:null,game:null,createdAt:now(),updatedAt:now()};
    await setSharedValue(partyMemberKey(user.id),{partyId:id,joinedAt:now()});
    await saveParty(party);
    return await hydrateParty(party,user.id);
  }

  if(type==='INVITE'){
    if(!party){
      party=await partyAction(user,{type:'CREATE'});
      party=await getPartyById(party.id);
    }
    if(party.leaderId!==user.id)throw new Error('Somente o líder do grupo pode convidar.');
    if(party.members.length>=PARTY_MAX)throw new Error('O grupo já está cheio.');
    const targetId=String(action.userId||'').toUpperCase();
    if(!targetId||targetId===user.id)throw new Error('Jogador inválido.');
    if(!(await areFriends(user.id,targetId)))throw new Error('Só é possível convidar amigos para o grupo.');
    if(await getPartyMembership(targetId))throw new Error('Esse amigo já está em outro grupo.');
    const target=await Auth.findUserById(targetId);
    if(!target)throw new Error('Jogador não encontrado.');
    const invites=await getSharedValue(partyInvitesKey(targetId),[]);
    const list=(Array.isArray(invites)?invites:[]).filter(i=>Number(i.expiresAt||0)>now()&&i.partyId!==party.id);
    list.push({id:`PIN-${now()}-${Math.random().toString(36).slice(2,7)}`,partyId:party.id,from:safeUser(user),expiresAt:now()+10*60*1000,createdAt:now()});
    await setSharedValue(partyInvitesKey(targetId),list.slice(-12));
    await emitEvent('party',null,'invite');
    return await hydrateParty(party,user.id);
  }

  if(type==='RESPOND'){
    const inviteId=String(action.inviteId||'');
    const invites=await getSharedValue(partyInvitesKey(user.id),[]);
    const list=Array.isArray(invites)?invites:[];
    const invite=list.find(i=>i.id===inviteId&&Number(i.expiresAt||0)>now());
    if(!invite)throw new Error('Convite de grupo não encontrado ou expirado.');
    await setSharedValue(partyInvitesKey(user.id),list.filter(i=>i.id!==inviteId));
    if(!action.accept){await emitEvent('party',null,'rejected');return null;}
    if(await getPartyMembership(user.id))throw new Error('Você já está em um grupo.');
    party=await getPartyById(invite.partyId);
    if(!party)throw new Error('Esse grupo não existe mais.');
    if(party.members.length>=PARTY_MAX)throw new Error('O grupo ficou cheio.');
    party.members.push(safeUser(user));
    await setSharedValue(partyMemberKey(user.id),{partyId:party.id,joinedAt:now()});
    await saveParty(party);
    return await hydrateParty(party,user.id);
  }

  if(type==='LEAVE'){
    if(!party)return null;
    party.members=party.members.filter(m=>m.id!==user.id);
    await setSharedValue(partyMemberKey(user.id),null);
    if(!party.members.length){
      await setSharedValue(partyKey(party.id),null);
      await emitEvent('party',null,'disband');
      return null;
    }
    if(party.leaderId===user.id)party.leaderId=party.members[0].id;
    await saveParty(party);
    return null;
  }

  if(type==='SET_ROOM'){
    if(!party)throw new Error('Você não está em um grupo.');
    if(party.leaderId!==user.id)throw new Error('Somente o líder pode mover o grupo.');
    const code=String(action.roomCode||'').toUpperCase();
    if(code){
      const room=await getRoomPrivate(code);
      if(!room||!(room.players||[]).some(p=>p.id===user.id))throw new Error('Entre na sala antes de chamar o grupo.');
      party.roomCode=room.code;party.game=room.game;party.roomName=room.name;
    }else{party.roomCode=null;party.game=null;party.roomName=null;}
    await saveParty(party);
    return await hydrateParty(party,user.id);
  }

  throw new Error('Ação de grupo inválida.');
}

export async function musicProfile(user){
  const [favorites,presets]=await Promise.all([
    getSharedValue(musicFavoritesKey(user.id),[]),
    getSharedValue(musicPresetsKey(user.id),[])
  ]);
  return{
    favorites:Array.isArray(favorites)?favorites:[],
    presets:Array.isArray(presets)?presets:[]
  };
}

export async function musicProfileAction(user,action={}){
  const type=String(action.type||'').toUpperCase();
  if(type==='TOGGLE_FAVORITE'){
    const track=action.track||{};
    const videoId=String(track.videoId||'');
    if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw new Error('Música inválida.');
    const favorites=await getSharedValue(musicFavoritesKey(user.id),[]);
    let list=Array.isArray(favorites)?favorites:[];
    const exists=list.some(x=>x.videoId===videoId);
    if(exists)list=list.filter(x=>x.videoId!==videoId);
    else list.unshift({videoId,title:cleanText(track.title,180)||'YouTube',channel:cleanText(track.channel,120),thumbnail:String(track.thumbnail||'').slice(0,500),url:String(track.url||'').slice(0,500),savedAt:now()});
    list=list.slice(0,MUSIC_FAVORITES_MAX);
    await setSharedValue(musicFavoritesKey(user.id),list);
    return{favorites:list,favorited:!exists};
  }
  if(type==='SAVE_PRESET'){
    const code=String(action.roomCode||'').toUpperCase();
    const room=await getRoomPrivate(code);
    if(!room||room.game!=='music'||room.ownerId!==user.id)throw new Error('Somente o host da sala Music pode salvar a playlist.');
    const state=await getSharedValue(musicStateKey(code),null);
    const queue=(state?.queue||[]).slice(0,50).map(t=>({videoId:t.videoId,title:t.title,channel:t.channel,thumbnail:t.thumbnail,url:t.url}));
    if(!queue.length)throw new Error('A fila está vazia.');
    const name=cleanText(action.name,30)||`Playlist ${new Date().toLocaleDateString('pt-BR')}`;
    let presets=await getSharedValue(musicPresetsKey(user.id),[]);
    presets=Array.isArray(presets)?presets:[];
    presets.unshift({id:`PL-${now()}-${Math.random().toString(36).slice(2,7)}`,name,tracks:queue,createdAt:now()});
    presets=presets.slice(0,MUSIC_PRESETS_MAX);
    await setSharedValue(musicPresetsKey(user.id),presets);
    return{presets};
  }
  if(type==='APPLY_PRESET'){
    const code=String(action.roomCode||'').toUpperCase();
    const room=await getRoomPrivate(code);
    if(!room||room.game!=='music'||room.ownerId!==user.id)throw new Error('Somente o host pode carregar uma playlist na sala.');
    const presets=await getSharedValue(musicPresetsKey(user.id),[]);
    const preset=(Array.isArray(presets)?presets:[]).find(p=>p.id===action.presetId);
    if(!preset)throw new Error('Playlist não encontrada.');
    const state=clone(await getSharedValue(musicStateKey(code),{roomCode:code,queue:[],currentIndex:-1,status:'paused',position:0,changedAt:now(),history:[],skipVotes:[]}));
    state.queue=(preset.tracks||[]).map((t,i)=>({...t,id:`Q-${now()}-${i}-${Math.random().toString(36).slice(2,5)}`,addedBy:user.username,addedById:user.id,addedAt:now()+i}));
    state.currentIndex=state.queue.length?0:-1;state.status='paused';state.position=0;state.changedAt=now();state.skipVotes=[];state.updatedAt=now();state.updatedBy=user.id;state.lastAction={type:'preset',by:user.username,byId:user.id,at:now(),name:preset.name};
    await setSharedValue(musicStateKey(code),state);
    await emitEvent('music',code,'preset');
    return{state,presets};
  }
  if(type==='DELETE_PRESET'){
    let presets=await getSharedValue(musicPresetsKey(user.id),[]);
    presets=(Array.isArray(presets)?presets:[]).filter(p=>p.id!==action.presetId);
    await setSharedValue(musicPresetsKey(user.id),presets);
    return{presets};
  }
  throw new Error('Ação de perfil Music inválida.');
}
