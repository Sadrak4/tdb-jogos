/** TDB Hub 8.0 Beta: independent social rooms, persistent music and game tables. */
import {randomBytes} from 'node:crypto';
import {initSupabase,isSupabaseReady,getSupabaseClient,runSupabaseQuery,setRoomPrivate,applyMutation,removeSharedValue} from './realtime-store.js';
import * as Games from './game-service.js';
const localRooms=new Map(), localMessages=[], localSignals=[];
let localMessageId=0,localSignalId=0;
const clone=v=>structuredClone(v);
const code=prefix=>`${prefix}-${randomBytes(4).toString('hex').toUpperCase()}`;
const self=u=>({id:u.id,username:String(u.username).slice(0,40)});
const name=s=>String(s||'').trim().slice(0,60);
const validCode=s=>/^[A-Z0-9-]{5,32}$/.test(s);
const allowed={chess:2,truco:4}; // Sinuca removida da oferta; partidas históricas preservadas.
const PRESENCE_MS=75000, EMPTY_MS=3600000, SCREEN_RECONNECT_MS=30000;
const fresh=m=>Date.now()-Number(m.lastSeen||0)<PRESENCE_MS;
const activeMembers=d=>(d.members||[]).filter(fresh);
const creator=(d,row)=>row?.owner_id||d.createdBy||d.ownerId;
const owner=(d,row,user)=>creator(d,row)===user.id;
const defaults=()=>({tables:'everyone',music:{add:'everyone',play:'everyone',remove:'owner',select:'owner',next:'owner',seek:'owner',voteSkip:true}});
function permissions(d){return d.permissions||(d.permissions=defaults())}
function currentScreens(d){return d.screens||(d.screens=d.screen?[d.screen]:[])}
function adjustPresence(d){
  const active=activeMembers(d);
  if(active.length){d.emptySince=null}
  else if(!Number.isFinite(Number(d.emptySince))||d.emptySince==null){
    const last=Math.max(0,...(d.members||[]).map(m=>Number(m.lastSeen||0)));
    d.emptySince=last?last+PRESENCE_MS:Date.now();
  }
  const now=Date.now();
  d.screens=currentScreens(d).filter(x=>{
    const last=Number(x.lastSeen||x.startedAt||0);
    if(now-last>PRESENCE_MS&&!x.disconnectedAt)x.disconnectedAt=last+PRESENCE_MS;
    return !x.disconnectedAt||now-Number(x.disconnectedAt)<SCREEN_RECONNECT_MS;
  });
  
  return active;
}
const expired=d=>{if(!d)return true;const active=activeMembers(d);if(active.length)return false;const last=Math.max(0,...(d.members||[]).map(m=>Number(m.lastSeen||0)));const since=d.emptySince==null?(last?last+PRESENCE_MS:Number(d.createdAt||Date.now())):Number(d.emptySince);return Date.now()-since>=EMPTY_MS};

const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const assert=(value,message,status=400)=>{if(!value)throw bad(message,status)};
const db=()=>getSupabaseClient();
async function ready(){
  await initSupabase();
  // A manutenção já foi verificada no router; não fazer outra viagem ao banco.
  if(process.env.VERCEL&&!isSupabaseReady())throw bad('Configure o Supabase para usar salas online.',503);
  return isSupabaseReady();
}
async function get(codeValue){
  const c=String(codeValue||'').toUpperCase();
  assert(validCode(c),'Código de sala inválido.');
  if(!await ready())return clone(localRooms.get(c)||null);
  const {data,error}=await runSupabaseQuery(db().from('tdb_hubs').select('*').eq('code',c).maybeSingle(),'Consultar sala social');
  if(error)throw bad(`Banco da sala indisponível: ${error.message}. Execute database/SUPABASE-HUB-v8.sql.`,503);
  return data;
}
async function load(codeValue,user){
  const room=await get(codeValue);
  assert(room,'Sala não encontrada.',404);
  assert(!expired(room.data),'Esta sala expirou.',404);
  assert(room.data?.members?.some(m=>m.id===user.id&&fresh(m)),'Entre nesta sala para acessar o conteúdo.',403);
  return room;
}
async function mutate(codeValue,user,fn,{requireMember=true}={}){
  for(let attempt=0;attempt<7;attempt++){
    const row=await get(codeValue);
    assert(row,'Sala não encontrada.',404);
    assert(!expired(row.data),'Esta sala expirou.',404);
    if(requireMember)assert(row.data.members.some(m=>m.id===user.id&&fresh(m)),'Você não participa dessa sala.',403);
    const data=clone(row.data);
    // A creator must never change when an old room had delegated active ownership.
    data.createdBy=row.owner_id||data.createdBy||data.ownerId;
    data.ownerId=data.createdBy;
    const result=await fn(data,row);
    if(result===false)return data;
    adjustPresence(data);data.updatedAt=Date.now();
    if(!await ready()){
      const current=localRooms.get(row.code);
      if(current?.revision!==row.revision)continue;
      localRooms.set(row.code,{...row,data:clone(data),revision:row.revision+1,updated_at:new Date().toISOString()});
      return data;
    }
    const {data:changed,error}=await runSupabaseQuery(db().from('tdb_hubs').update({data,revision:row.revision+1,updated_at:new Date().toISOString()}).eq('code',row.code).eq('revision',row.revision).select('code').maybeSingle(),'Atualizar sala social');
    if(error)throw bad(error.message,503);
    if(changed)return data;
  }
  throw bad('A sala recebeu muitas alterações simultâneas. Tente novamente.',409);
}
const initialMusic=()=>({queue:[],index:-1,playing:false,position:0,startedAt:null,revision:0});
function ensureMusic(data){return data.music||(data.music=initialMusic())}
function currentPos(m){return m.playing?Math.max(0,m.position+(Date.now()-Number(m.startedAt||Date.now()))/1000):m.position}
function youtubeId(input){
  let value=String(input||'').trim();
  if(/^[\w-]{11}$/.test(value))return value;
  try{const u=new URL(value);const h=u.hostname.toLowerCase();if(!(h==='youtu.be'||h==='youtube.com'||h==='www.youtube.com'||h==='m.youtube.com'||h==='music.youtube.com'||h==='www.youtube-nocookie.com'))return null;const id=h==='youtu.be'?u.pathname.slice(1).split('/')[0]:u.searchParams.get('v')||(u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/)||[])[1];return /^[\w-]{11}$/.test(id||'')?id:null}catch{return null}
}
function musicAction(data,user,action){
  const m=ensureMusic(data),type=String(action.type||'');
  const permission=permissions(data).music||{};
  const isOwner=creator(data)===user.id;
  if(type==='vote'){assert(permission.voteSkip!==false,'Votação desativada.');assert(m.queue.length,'Fila vazia.');
    const voters=activeMembers(data).map(x=>x.id);m.votes=(m.votes||[]).filter(v=>v.id&&voters.includes(v.id)&&v.at>Date.now()-60000);
    assert(!m.votes.some(v=>v.id===user.id),'Você já votou nesta música.');m.votes.push({id:user.id,at:Date.now()});
    if(m.votes.length>=Math.floor(voters.length/2)+1){m.index=(m.index+1)%m.queue.length;m.position=0;m.startedAt=Date.now();m.votes=[];}m.revision++;return;
  }
  const group=({add:'add',remove:'remove',play:'play',pause:'play',seek:'seek',next:'next',select:'select'})[type];
  if(group&&!isOwner)assert(permission[group]==='everyone','O criador restringiu este controle musical.',403);
  m.votes=[];

  switch(type){
    case 'add':{
      assert(m.queue.length<150,'Limite de 150 músicas na fila.');
      const id=youtubeId(action.url);assert(id,'Cole um link válido do YouTube.');
      m.queue.push({id:code('FAIXA'),videoId:id,title:name(action.title)||`YouTube • ${id}`,addedBy:user.username});
      if(m.index<0){m.index=0;m.position=0;m.playing=false;m.startedAt=null;}
      break;
    }
    case 'remove':{
      const at=m.queue.findIndex(t=>t.id===action.id);assert(at!==-1,'Música não encontrada.');
      const previous=m.index;m.queue.splice(at,1);
      if(!m.queue.length){m.index=-1;m.playing=false;m.position=0;m.startedAt=null;}
      else if(at<previous)m.index--;
      else if(at===previous){m.index=Math.min(at,m.queue.length-1);m.position=0;m.startedAt=Date.now();}
      break;
    }
    case 'play': assert(m.index>=0,'Adicione uma música primeiro.');m.startedAt=Date.now();m.playing=true;break;
    case 'pause': m.position=currentPos(m);m.playing=false;m.startedAt=null;break;
    case 'seek': m.position=Math.max(0,Math.min(Number(action.position)||0,86400));m.startedAt=Date.now();break;
    case 'next': assert(m.queue.length,'A fila está vazia.');m.index=(m.index+1)%m.queue.length;m.position=0;m.startedAt=Date.now();break;
    case 'select':{const i=Number(action.index);assert(Number.isInteger(i)&&i>=0&&i<m.queue.length,'Índice inválido.');m.index=i;m.position=0;m.startedAt=Date.now();break;}
    default:throw bad('Ação de música inválida.');
  }
  m.revision++;
}
export async function startTraining(user,input={}){
  const game=String(input.game||'chess');assert(allowed[game],'Jogo inválido.');
  const settings=sanitizeSettings(game,input.settings||{});
  const room=await createRoom(user,{name:`Treino ${game==='chess'?'Xadrez':'Truco'} • ${user.username}`,visibility:'private',training:true});
  const table=await createTable(room.code,user,game,settings);
  const difficulty=['easy','medium','hard'].includes(input.difficulty)?input.difficulty:'medium';
  const seats=settings.seats||2;
  for(let i=1;i<seats;i++)await addBot(room.code,user,table.id,difficulty);
  await startTable(room.code,user,table.id);
  return {code:room.code,tableId:table.id};
}
export async function musicCurrentForUser(codeValue,user){
  const room=await load(codeValue,user);
  const m=room.data.music||{};
  const track=(m.queue||[])[m.index];
  return track?{videoId:track.videoId,title:track.title,playing:!!m.playing}:null;
}
export async function musicQueueForUser(codeValue,user){
  const room=await load(codeValue,user);
  return (room.data.music?.queue||[]).slice(0,50).map(t=>({videoId:t.videoId,title:t.title,channel:t.channel||'',thumbnail:t.thumbnail||'',url:`https://www.youtube.com/watch?v=${t.videoId}`}));
}
export async function appendMusicPreset(codeValue,user,tracks,{replace=false}={}){
  const list=(Array.isArray(tracks)?tracks:[]).slice(0,50);
  assert(list.length,'Playlist está vazia.');
  await mutate(codeValue,user,d=>{
    const m=ensureMusic(d),policy=permissions(d).music;
    assert(creator(d)===user.id||policy.add==='everyone','Você não tem permissão para adicionar músicas.',403);
    if(replace){assert(creator(d)===user.id||policy.remove==='everyone','Apenas moderadores podem substituir a fila.',403);m.queue=[];m.index=-1}
    assert(m.queue.length+list.length<=150,'O limite da fila é 150 músicas.');
    for(const t of list){const id=youtubeId(t.videoId||t.url);assert(id,'Playlist contém link inválido.');m.queue.push({id:code('FAIXA'),videoId:id,title:name(t.title)||`YouTube • ${id}`,addedBy:user.username})}
    if(m.index<0){m.index=0;m.playing=false;m.position=0;m.startedAt=null}
    m.votes=[];m.revision++;
  });return {ok:true};
}
export async function createRoom(user,input={}){
  const roomCode=code('SALA');
  const row={code:roomCode,owner_id:user.id,name:name(input.name)||`Sala de ${user.username}`,visibility:input.training===true?'private':input.visibility==='private'?'private':'public',revision:0,data:{training:input.training===true,ownerId:user.id,createdBy:user.id,members:[{...self(user),joinedAt:Date.now(),lastSeen:Date.now()}],permissions:defaults(),music:initialMusic(),screens:[],tables:[],emptySince:null,createdAt:Date.now()}};
  if(!await ready()){localRooms.set(roomCode,clone(row));return {code:roomCode}}
  const {error}=await runSupabaseQuery(db().from('tdb_hubs').insert(row),'Criar sala social');
  if(error)throw bad(`Não foi possível criar sala: ${error.message}. Verifique a migração SQL.`,503);
  return {code:roomCode};
}
async function releaseTables(data){
  for(const t of data?.tables||[]){
    try{
      if(t.status==='playing')await Games.cancelGame(t.id,'room-removed');
      await applyMutation({type:'room:remove',code:t.id});
      await removeSharedValue(`game:${t.id}`);
    }catch(e){console.warn('[Hub release table]',e.message)}
  }
}
export async function deleteRoom(codeValue,user){
  const r=await get(codeValue);assert(r,'Sala não encontrada.',404);
  assert(owner(r.data,r,user),'Apenas quem criou pode excluir a sala.',403);
  if(!await ready()){await releaseTables(r.data);localRooms.delete(r.code);return {ok:true}}
  const {data:deleted,error}=await runSupabaseQuery(db().from('tdb_hubs').delete().eq('code',r.code).eq('owner_id',user.id).select('code').maybeSingle(),'Excluir sala');
  if(error)throw bad(error.message,503);
  assert(deleted,'Sala já foi removida.',404);
  await releaseTables(r.data);
  return {ok:true};
}
export async function cleanupExpired(limit=100){
  let removed=0;
  if(!await ready()){for(const [id,r] of localRooms)if(expired(r.data)){await releaseTables(r.data);localRooms.delete(id);removed++}return {removed}}
  const {data,error}=await runSupabaseQuery(db().from('tdb_hubs').select('code,data,revision').order('updated_at',{ascending:true}).limit(Math.min(200,limit)),'Localizar salas inativas');
  if(error)throw bad(error.message,503);
  for(const r of data||[]){if(!expired(r.data))continue;
    const {data:deleted,error:e}=await runSupabaseQuery(db().from('tdb_hubs').delete().eq('code',r.code).eq('revision',r.revision).select('code').maybeSingle(),'Limpar sala expirada');
    if(e)throw bad(e.message,503);
    // Um heartbeat pode ter mudado a revisão; nesse caso NADA foi excluído.
    if(deleted){await releaseTables(r.data);removed++}
  }
  return {removed};
}
export async function listRooms(user){
  // A limpeza física é feita no cron. Nunca bloquear a listagem de salas
  // com dezenas de exclusões e remoções de partidas antigas.
  if(!await ready())return [...localRooms.values()].filter(r=>r.visibility==='public'||r.owner_id===user.id||r.data.members.some(m=>m.id===user.id)).map(summary);
  const {data,error}=await runSupabaseQuery(db().from('tdb_hubs').select('code,name,visibility,owner_id,data,updated_at').order('updated_at',{ascending:false}).limit(80),'Listar salas sociais');
  if(error)throw bad(error.message,503);
  return (data||[]).filter(r=>!expired(r.data)&&(r.visibility==='public'||r.owner_id===user.id||r.data?.members?.some(m=>m.id===user.id))).map(summary);
}
function summary(r){return {code:r.code,name:r.data?.displayName||r.name,visibility:r.visibility,members:activeMembers(r.data||{}).length,tables:(r.data?.tables||[]).filter(t=>t.game!=='pool').length}}
export async function joinRoom(codeValue,user){
  const room=await get(codeValue);assert(room,'Sala não encontrada.',404);
  assert(!expired(room.data),'Sala expirada.',404);
  assert(!(room.data.banned||[]).includes(user.id),'Você foi removido desta sala.',403);
  assert(!room.data.training||creator(room.data,room)===user.id,'Sala de treinamento pessoal.',403);
  if(room.data.members.some(m=>m.id===user.id&&fresh(m)))return {code:room.code};
  await mutate(room.code,user,d=>{
    d.members=d.members.filter(m=>m.id!==user.id);
    assert(activeMembers(d).length<30,'A sala atingiu o limite de 30 participantes.');
    d.members.push({...self(user),joinedAt:Date.now(),lastSeen:Date.now()});d.emptySince=null;
    for(const t of d.tables||[])if(t.disconnectedAt)delete t.disconnectedAt[user.id];
  },{requireMember:false});
  return {code:room.code};
}
export async function leaveRoom(codeValue,user){
  await mutate(codeValue,user,d=>{
    d.members=d.members.filter(m=>m.id!==user.id);
    // Organizers remain owners of their tables. Active matches are not re-assigned.
    for(const t of d.tables){
      t.watchers=(t.watchers||[]).filter(p=>p.id!==user.id);
      if(t.status==='waiting')t.players=t.players.filter(p=>p.id!==user.id);
      if(t.status==='playing'&&t.players.some(p=>p.id===user.id)){
        t.disconnectedAt=t.disconnectedAt||{};t.disconnectedAt[user.id]=Date.now();
      }
    }
    if(!d.members.length)d.emptySince=Date.now();
  });
  return {ok:true};
}
const backgroundChecks=new Map();
export async function heartbeatRoom(codeValue,user){
  await mutate(codeValue,user,d=>{const m=d.members.find(x=>x.id===user.id);if(m){m.lastSeen=Date.now();d.emptySince=null}});
  // Mantém abandono/temporizadores vivos quando ninguém tem a janela da
  // partida aberta; somente UMA mesa por heartbeat, no máximo a cada 15 s.
  const previous=backgroundChecks.get(codeValue)||{at:0,index:0};
  if(Date.now()-previous.at>15000){
    backgroundChecks.set(codeValue,{at:Date.now(),index:previous.index+1});
    try{
      const room=await get(codeValue);
      const playing=(room?.data?.tables||[]).filter(t=>t.status==='playing'&&t.game!=='pool');
      if(playing.length)await reconcileGames(room,playing[previous.index%playing.length].id);
    }catch(err){if(err.code!=='STALE_STATE')console.warn('[Hub heartbeat/game]',err?.message||err)}
    if(backgroundChecks.size>1000){for(const [id,v] of backgroundChecks)if(Date.now()-v.at>120000)backgroundChecks.delete(id)}
  }
  return {ok:true};
}
export async function getMessages(roomCode,afterId=0){
  const cursor=Math.max(0,Math.trunc(Number(afterId)||0));
  if(!await ready()){
    const all=localMessages.filter(m=>m.code===roomCode);
    return cursor?all.filter(m=>m.id>cursor).slice(0,60):all.slice(-60);
  }
  let query=db().from('tdb_hub_messages').select('id,username,user_id,message,created_at').eq('code',roomCode);
  if(cursor)query=query.gt('id',cursor).order('id',{ascending:true}).limit(60);
  else query=query.order('id',{ascending:false}).limit(60);
  const {data,error}=await runSupabaseQuery(query,'Consultar chat');
  if(error)throw bad(error.message,503);
  return cursor?(data||[]):(data||[]).reverse();
}
export async function sendMessage(roomCode,user,message){
  const value=String(message||'').trim().slice(0,450);
  assert(value.length>0,'Digite uma mensagem.');
  await load(roomCode,user);
  if(!await ready()){
    const msg={id:++localMessageId,code:roomCode,username:user.username,user_id:user.id,message:value,created_at:new Date().toISOString()};
    localMessages.push(msg);if(localMessages.length>1000)localMessages.splice(0,localMessages.length-1000);return msg;
  }
  const {data,error}=await runSupabaseQuery(db().from('tdb_hub_messages').insert({code:roomCode,username:user.username,user_id:user.id,message:value}).select('id,username,user_id,message,created_at').single(),'Enviar mensagem');
  if(error)throw bad(error.message,503);return data;
}
async function reconcileGames(room,selectedId=null){
  const memberMap=new Map((room.data.members||[]).map(m=>[m.id,m]));
  const states=new Map();let roomChanged=false;
  for(const t of room.data.tables||[]){
    // Mesas antigas de Sinuca não aparecem nem consomem processamento no hub.
    if(t.status!=='playing'||t.game==='pool'||t.id!==selectedId)continue;
    const disconnected=t.players.filter(p=>!p.bot&&!fresh(memberMap.get(p.id)||{}));
    let state=await Games.getGame(t.id);
    if(!state)continue;
    if(disconnected.length){
      if(!state.pausedAt){try{state=await Games.pauseGame(t.id,true,state)}catch(err){if(err.code==='STALE_STATE')state=await Games.getGame(t.id);else throw err}}
      const timedOut=disconnected.filter(p=>{
        const explicitExit=Number(t.disconnectedAt?.[p.id]||0);
        const last=memberMap.get(p.id)?.lastSeen||t.startedAt||Date.now();
        const missingAt=explicitExit||Math.max(Number(last)+PRESENCE_MS,Number(t.startedAt||0));
        return Date.now()-missingAt>=180000;
      });
      if(timedOut.length){
        const losers=timedOut.map(p=>p.id),allHuman=t.players.filter(p=>!p.bot);
        if(allHuman.every(p=>losers.includes(p.id)))state=await Games.cancelGame(t.id,'both-disconnected');
        else state=await Games.abandonGame(t.id,losers[0],'disconnected');
        try{await mutate(room.code,{id:room.owner_id||creator(room.data,room)},d=>{const table=d.tables.find(x=>x.id===t.id);if(table)table.status='finished'},{requireMember:false});roomChanged=true}catch{}
      }
    }else{
      if(state.pausedAt){try{state=await Games.pauseGame(t.id,false,state)}catch(err){if(err.code==='STALE_STATE')state=await Games.getGame(t.id);else throw err}}
      state=await Games.refreshGame(t.id,state);
      if(state&&Games.isTerminal(state)){
        try{await mutate(room.code,{id:room.owner_id||creator(room.data,room)},d=>{const table=d.tables.find(x=>x.id===t.id);if(table)table.status='finished'},{requireMember:false});roomChanged=true}catch{}
      }
    }
    if(t.id===selectedId)states.set(t.id,state);
  }
  return {states,roomChanged};
}
export async function getSnapshot(roomCode,user,tableId,messagesAfter=0){
  let room=await load(roomCode,user);
  const reconciled=await reconcileGames(room,tableId);
  if(reconciled.roomChanged||room.data.tables.some(t=>t.status==='starting'&&Date.now()-t.startingAt>60000)){
    if(room.data.tables.some(t=>t.status==='starting'&&Date.now()-t.startingAt>60000)){
      await mutate(roomCode,user,d=>{for(const t of d.tables)if(t.status==='starting'&&Date.now()-t.startingAt>60000)t.status='waiting'});
    }
    room=await load(roomCode,user);
  }
  const selected=room.data.tables.find(t=>t.id===tableId&&t.game!=='pool');
  if(selected&&!selected.players.some(p=>p.id===user.id)&&!selected.watchers.some(p=>p.id===user.id)&&selected.ownerId!==user.id){
    assert(selected.settings?.spectators==='open','Você não tem autorização para assistir.',403);
  }
  let game=null;
  if(selected?.status==='playing'||selected?.status==='finished'){
    const state=reconciled.states.get(selected.id)||await Games.refreshGame(selected.id);
    if(state){
      if(Games.isTerminal(state)&&selected.status==='playing'){
        await mutate(roomCode,user,d=>{const t=d.tables.find(x=>x.id===selected.id);if(t&&t.status==='playing')t.status='finished'});
        selected.status='finished';
      }
      game=Games.viewFor(state,user.id,selected.players.some(p=>p.id===user.id)?'player':'spectator');
      if(game.room){delete game.room.password;delete game.room.hasPassword}
    }
  }
  const result=clone(room.data);adjustPresence(result);
  result.ownerId=creator(room.data,room);
  result.screen=result.screens?.[0]||null;
  result.members=activeMembers(result);
  // Nunca apagar mesas antigas automaticamente; apenas removê-las da navegação.
  result.tables=(result.tables||[]).filter(t=>t.game!=='pool');
  return {room:{code:room.code,name:room.data.displayName||room.name,visibility:room.visibility,...result},messages:await getMessages(room.code,messagesAfter),messagesDelta:Number(messagesAfter)>0,game,serverTime:Date.now()};
}
function sanitizeSettings(game,settings={}){
  const s={};
  if(game==='truco'){s.seats=Number(settings.seats)===4?4:2;s.turnTimer=[0,30,60].includes(Number(settings.turnTimer))?Number(settings.turnTimer):0}
  if(game==='chess'){s.clock=[0,60,180,300,600,900].includes(Number(settings.clock))?Number(settings.clock):0;s.color=['white','black','random'].includes(settings.color)?settings.color:'random'}
  s.spectators=['open','closed','approval'].includes(settings.spectators)?settings.spectators:'open';return s;
}
async function createTable(roomCode,user,game,settings={},bots=0,botDifficulty='medium'){
  assert(allowed[game],'Escolha Xadrez ou Truco.');
  const clean=sanitizeSettings(game,settings),seats=clean.seats||2;
  const number=Number(bots);
  assert(Number.isInteger(number)&&number>=0&&number<seats,'Número de BOTs inválido para esta modalidade.');
  assert(['easy','medium','hard'].includes(botDifficulty),'Dificuldade de BOT inválida.');
  let added=null;
  await mutate(roomCode,user,(d,row)=>{
    const policy=permissions(d).tables;
    assert(owner(d,row,user)||policy==='everyone'||(policy==='approved'&&(d.tableCreators||[]).includes(user.id)),'Sem permissão para criar mesas.',403);
    assert(d.tables.length<12,'Esta sala atingiu o limite de mesas.');
    const players=[self(user)];
    for(let i=0;i<number;i++)players.push({id:code('BOT'),username:`BOT ${i+1}`,bot:true,difficulty:botDifficulty});
    added={id:code('TB'),game,ownerId:user.id,players,watchers:[],requests:[],settings:clean,status:'waiting',createdAt:Date.now()};
    d.tables.push(added);
  });
  return added;
}
async function tableMember(roomCode,user,type,tableId,targetId){
  const previous=(await load(roomCode,user)).data.tables.find(t=>t.id===tableId);
  await mutate(roomCode,user,(d,row)=>{
    const t=d.tables.find(t=>t.id===tableId);assert(t,'Mesa não encontrada.',404);
    const canManage=t.ownerId===user.id||owner(d,row,user);
    if(type==='remove'){
      assert(canManage,'Apenas o organizador ou criador da sala pode encerrar a mesa.',403);
      d.tables=d.tables.filter(x=>x!==t);return;
    }
    if(type==='watch'){
      assert(t.settings?.spectators!=='closed','Esta mesa não permite espectadores.',403);
      if(t.settings?.spectators==='approval'&&t.ownerId!==user.id){t.requests=t.requests||[];if(!t.requests.some(x=>x.id===user.id))t.requests.push(self(user));return}
      t.watchers=t.watchers.filter(x=>x.id!==user.id);
      if(!t.players.some(x=>x.id===user.id))t.watchers.push(self(user));return;
    }
    if(type==='unwatch'){
      assert(t.ownerId===user.id,'Somente o organizador pode moderar espectadores.',403);
      assert(t.watchers?.some(p=>p.id===targetId),'Espectador não encontrado.',404);
      t.watchers=t.watchers.filter(p=>p.id!==targetId);return;
    }
    if(type==='approve'||type==='deny'){
      assert(t.ownerId===user.id,'Somente o organizador aprova espectadores.',403);
      const guest=t.requests?.find(p=>p.id===targetId);assert(guest,'Solicitação inexistente.');
      t.requests=t.requests.filter(p=>p.id!==targetId);
      if(type==='approve'&&!t.watchers.some(p=>p.id===targetId))t.watchers.push(guest);return;
    }
    if(type==='kick'){
      assert(canManage,'Sem permissão.',403);assert(t.status==='waiting','Não é permitido expulsar jogador durante a partida.',403);
      assert(targetId!==t.ownerId,'Organizador não pode se expulsar.');t.players=t.players.filter(p=>p.id!==targetId);return;
    }
    if(type==='join'){
      assert(t.status==='waiting','A partida já começou; entre como espectador.');
      if(t.players.some(p=>p.id===user.id))return false;
      assert(t.players.length<(t.settings?.seats||2),'Mesa cheia.');
      t.watchers=t.watchers.filter(p=>p.id!==user.id);t.players.push(self(user));return;
    }
    if(type==='leave'){
      if(t.status==='playing'){t.watchers=t.watchers.filter(p=>p.id!==user.id);return}
      t.players=t.players.filter(p=>p.id!==user.id);t.watchers=t.watchers.filter(p=>p.id!==user.id);
      // Do not transfer organizer status automatically.
      if(t.players.length===0)d.tables=d.tables.filter(x=>x!==t);
      return;
    }
    throw bad('Ação de mesa inválida.');
  });
  if(type==='remove'&&previous?.status==='playing')await Games.cancelGame(tableId,'administrative');
  return {ok:true};
}
async function swapSeats(roomCode,user,tableId,a,b){
  await mutate(roomCode,user,d=>{const t=d.tables.find(x=>x.id===tableId);assert(t,'Mesa não encontrada.',404);
    assert(t.status==='waiting'&&t.ownerId===user.id,'Somente o organizador ajusta equipes antes da partida.',403);
    const i=Number(a),j=Number(b);assert(Number.isInteger(i)&&Number.isInteger(j)&&i>=0&&j>=0&&i<t.players.length&&j<t.players.length,'Posição inválida.');
    [t.players[i],t.players[j]]=[t.players[j],t.players[i]];
  });return {ok:true};
}
async function addBot(roomCode,user,tableId,difficulty='medium'){
  await mutate(roomCode,user,d=>{const t=d.tables.find(t=>t.id===tableId);assert(t,'Mesa não encontrada.',404);
    assert(t.ownerId===user.id,'Somente organizador adiciona BOT.',403);assert(t.status==='waiting','Partida já iniciada.');
    assert(t.players.length<(t.settings?.seats||2),'Mesa cheia.');
    assert(['easy','medium','hard'].includes(difficulty),'Dificuldade inválida.');
    const number=t.players.filter(p=>p.bot).length+1;t.players.push({id:code('BOT'),username:`BOT ${number}`,bot:true,difficulty});
  });return {ok:true};
}
async function startTable(roomCode,user,tableId){
  await mutate(roomCode,user,d=>{
    const t=d.tables.find(t=>t.id===tableId);assert(t,'Mesa não encontrada.',404);
    assert(t.ownerId===user.id,'Somente organizador pode iniciar.',403);
    assert(t.status==='waiting','Mesa já está iniciando ou em andamento.');
    assert(t.players.length===(t.settings?.seats||2),`A mesa precisa de ${t.settings?.seats||2} jogadores.`);
    t.status='starting';t.startingAt=Date.now();
  });
  try{
    const room=await load(roomCode,user),table=room.data.tables.find(t=>t.id===tableId);
    assert(table,'Mesa removida durante a inicialização.');
    const settings=table.settings||{};
    const virtual={code:table.id,game:table.game,name:`Mesa ${table.game} de ${room.name}`,ownerId:table.ownerId,owner:table.players[0].username,players:table.players.map(p=>({...p,connection:'online'})),spectators:[],status:'open',privacy:'private',password:randomBytes(10).toString('hex'),trucoSeats:settings.seats||2,chessClockEnabled:!!settings.clock,chessClock:settings.clock||0,chessColor:settings.color||'random',poolTurnTimer:settings.turnTimer||0,poolAimAssist:settings.aim||'short',turnTimer:settings.turnTimer||0,createdAt:Date.now()};
    await setRoomPrivate(virtual);await Games.startGame(virtual);
    await mutate(roomCode,user,d=>{const current=d.tables.find(t=>t.id===tableId);assert(current,'Mesa removida durante inicialização.');current.status='playing';current.startedAt=Date.now();delete current.startingAt});
    return {ok:true};
  }catch(err){try{await mutate(roomCode,user,d=>{const t=d.tables.find(t=>t.id===tableId);if(t?.status==='starting'){t.status='waiting';delete t.startingAt}})}catch{}throw err}
}
async function gameAction(roomCode,user,tableId,action){
  const room=await load(roomCode,user);
  const t=room.data.tables.find(t=>t.id===tableId&&t.game!=='pool');assert(t,'Mesa não encontrada.',404);
  assert(t.status==='playing','Partida não iniciada.');
  assert(t.players.some(p=>p.id===user.id),'Espectadores não podem jogar.',403);
  const state=await Games.applyAction(t.id,user.id,{...action,actionId:action.actionId||code('ACT')});
  if(Games.isTerminal(state)){
    await mutate(roomCode,user,d=>{const cur=d.tables.find(x=>x.id===tableId);if(cur)cur.status='finished';});
  }
  const game=Games.viewFor(state,user.id,'player');if(game.room)delete game.room.password;return {game};
}
async function restartTable(roomCode,user,tableId){
  const room=await load(roomCode,user);
  const t=room.data.tables.find(t=>t.id===tableId);assert(t,'Mesa não encontrada.',404);
  assert(t.ownerId===user.id,'Somente organizador pode reiniciar.',403);
  const current=await Games.getGame(t.id);assert(current&&Games.isTerminal(current),'A partida atual ainda não terminou.');
  const humans=t.players.filter(p=>!p.bot);
  assert(humans.every(p=>(t.rematchVotes||[]).includes(p.id)),'Todos os jogadores humanos precisam aceitar a revanche.');
  await Games.rematchGame(t.id,t.ownerId);
  await mutate(roomCode,user,d=>{const cur=d.tables.find(x=>x.id===tableId);if(cur){cur.status='playing';cur.rematchVotes=[]}});
  return {ok:true};
}
async function screenPermission(roomCode,user,sessionId){
  const room=await get(roomCode);assert(room&&!expired(room.data),'Sala de transmissão indisponível.',404);
  const screens=currentScreens(room.data);
  const screen=screens.find(x=>x.sessionId===sessionId);
  assert(screen,'Transmissão não encontrada.',404);
  const participant=room.data.members.some(m=>m.id===user.id&&fresh(m));
  assert(participant||screen.ownerId===user.id,'Você não pertence à transmissão.',403);
  return {room,screen};
}
async function sendSignal(roomCode,user,body){
  const to=String(body.to||''),kind=String(body.kind||''),sessionId=String(body.sessionId||'').slice(0,60);
  assert(['offer','answer'].includes(kind),'Tipo de sinal inválido.');
  const {room,screen}=await screenPermission(roomCode,user,sessionId);
  assert((to===screen.ownerId||room.data.members.some(m=>m.id===to&&fresh(m)))&&to!==user.id,'Destinatário não autorizado.',403);
  // Only the broadcaster can answer. Only room viewers can send offers.
  assert(screen.ownerId===user.id||to===screen.ownerId,'Sinal inválido.',403);
  const payload=body.payload||{};assert(JSON.stringify(payload).length<50000,'Sinal muito grande.');
  if(!await ready()){localSignals.push({id:++localSignalId,code:roomCode,sender:user.id,receiver:to,kind,session_id:sessionId,payload,created_at:new Date().toISOString()});return {ok:true}}
  const {error}=await runSupabaseQuery(db().from('tdb_hub_signals').insert({code:roomCode,sender:user.id,receiver:to,kind,session_id:sessionId,payload}),'Enviar sinal WebRTC');
  if(error)throw bad(error.message,503);return {ok:true};
}
async function pullSignals(roomCode,user,lastId,sessionId){
  const room=await get(roomCode);assert(room&&!expired(room.data),'Sala indisponível.',404);
  assert(room.data.members.some(m=>m.id===user.id&&fresh(m))||currentScreens(room.data).some(x=>x.ownerId===user.id&&(!sessionId||x.sessionId===sessionId)),'Sem autorização para receber sinais.',403);
  const cursor=Math.max(0,Math.trunc(Number(lastId)||0));
  if(!await ready())return localSignals.filter(s=>s.code===roomCode&&s.receiver===user.id&&s.id>cursor).slice(0,30);
  const {data,error}=await runSupabaseQuery(db().from('tdb_hub_signals').select('id,code,sender,receiver,kind,session_id,payload').eq('code',roomCode).eq('receiver',user.id).gt('id',cursor).order('id',{ascending:true}).limit(30),'Receber sinais WebRTC');
  if(error)throw bad(error.message,503);return data||[];
}
async function screenAction(roomCode,user,action){
  const type=action.type;
  if(type==='screen:start'){
    // Reuse the reserved slot when its owner resumes the capture after a transient failure.
    const same=await get(roomCode);
    const existing=same&&currentScreens(same.data).find(x=>x.ownerId===user.id);
    if(existing){await mutate(roomCode,user,d=>{const slot=currentScreens(d).find(x=>x.ownerId===user.id);if(slot){slot.lastSeen=Date.now();slot.disconnectedAt=null}});return {sessionId:existing.sessionId,resumed:true}}
    const sessionId=code('SCREEN');
    // Prevent a participant from occupying multiple slots across rooms (query persisted hubs).
    if(await ready()){
      const {data,error}=await runSupabaseQuery(db().from('tdb_hubs').select('code,data').limit(200),'Verificar transmissão do usuário');
      if(error)throw bad(error.message,503);
      assert(!(data||[]).some(r=>!expired(r.data)&&currentScreens(r.data).some(x=>x.ownerId===user.id)),'Você já transmite em outra sala.',409);
    }else assert(![...localRooms.values()].some(r=>currentScreens(r.data).some(x=>x.ownerId===user.id)),'Você já transmite em outra sala.',409);
    await mutate(roomCode,user,d=>{const screens=currentScreens(d);assert(screens.length<3,'A sala já tem três transmissões.');screens.push({ownerId:user.id,username:user.username,sessionId,startedAt:Date.now(),lastSeen:Date.now()})});
    return {sessionId};
  }
  if(type==='screen:stop'||type==='screen:heartbeat'){
    await mutate(roomCode,user,(d,row)=>{
      const screens=currentScreens(d);const own=screens.find(x=>x.ownerId===user.id&&(!action.sessionId||x.sessionId===action.sessionId));
      if(type==='screen:heartbeat'){assert(own,'Sua transmissão não está ativa.',404);own.lastSeen=Date.now();own.disconnectedAt=null;return}
      const target=screens.find(x=>x.sessionId===action.sessionId)||own;
      assert(target,'Transmissão não encontrada.',404);
      assert(target.ownerId===user.id||owner(d,row,user),'Sem permissão para encerrar esta transmissão.',403);
      d.screens=screens.filter(x=>x.sessionId!==target.sessionId);
    },{requireMember:false});return {ok:true};
  }
  throw bad('Ação de transmissão inválida.');
}
export async function act(roomCode,user,action={}){
  const type=String(action.type||'');
  switch(type){
    case 'heartbeat':return heartbeatRoom(roomCode,user);
    case 'leave':return leaveRoom(roomCode,user);
    case 'message':return {message:await sendMessage(roomCode,user,action.message)};
    case 'room:delete':return deleteRoom(roomCode,user);
    case 'room:settings':await mutate(roomCode,user,(d,row)=>{assert(owner(d,row,user),'Apenas o criador pode alterar permissões.',403);const p=permissions(d);
      if(['everyone','owner','approved'].includes(action.tables))p.tables=action.tables;
      if(action.music&&typeof action.music==='object')for(const k of ['add','play','remove','select','next','seek'])if(['everyone','owner'].includes(action.music[k]))p.music[k]=action.music[k];
      if(typeof action.voteSkip==='boolean')p.music.voteSkip=action.voteSkip;
      if(typeof action.name==='string'&&name(action.name))d.displayName=name(action.name);
    });return {ok:true};
    case 'room:allow-table':await mutate(roomCode,user,(d,row)=>{assert(owner(d,row,user),'Apenas o criador autoriza mesas.',403);d.tableCreators=d.tableCreators||[];const target=String(action.userId||'');assert(d.members.some(m=>m.id===target),'Participante não encontrado.');d.tableCreators=action.allow===false?d.tableCreators.filter(x=>x!==target):[...new Set([...d.tableCreators,target])];});return {ok:true};
    case 'room:kick':{
      const current=await load(roomCode,user);
      assert(owner(current.data,current,user),'Apenas o criador pode expulsar pessoas.',403);
      const target=String(action.userId||'');
      assert(target&&target!==user.id,'Participante inválido.');
      assert(current.data.members.some(m=>m.id===target),'Participante não encontrado.',404);
      const affected=current.data.tables.filter(t=>t.status==='playing'&&t.players.some(p=>p.id===target));
      // Cancelamento administrativo não pode produzir vitória por abandono.
      for(const table of affected)await Games.cancelGame(table.id,'administrative-kick');
      await mutate(roomCode,user,(d,row)=>{
        assert(owner(d,row,user),'Apenas o criador pode expulsar pessoas.',403);
        d.members=d.members.filter(m=>m.id!==target);
        d.banned=[...new Set([...(d.banned||[]),target])];
        d.screens=currentScreens(d).filter(s=>s.ownerId!==target);
        for(const table of d.tables)if(affected.some(t=>t.id===table.id))table.status='finished';
      });
      return {ok:true};
    }
    case 'table:create':return {table:await createTable(roomCode,user,action.game,action.settings||{},action.bots||0,action.botDifficulty||'medium')};
    case 'table:bot':return addBot(roomCode,user,action.tableId,action.difficulty);
    case 'table:swap':return swapSeats(roomCode,user,action.tableId,action.a,action.b);
    case 'table:approve':case 'table:deny':case 'table:kick':case 'table:unwatch':return tableMember(roomCode,user,type.split(':')[1],action.tableId,action.userId);
    case 'table:vote-rematch':await mutate(roomCode,user,d=>{const t=d.tables.find(x=>x.id===action.tableId);assert(t?.status==='finished','A partida precisa estar encerrada.');assert(t.players.some(p=>p.id===user.id),'Somente jogadores votam.',403);t.rematchVotes=[...new Set([...(t.rematchVotes||[]),user.id])]});return {ok:true};
    case 'table:join':case 'table:watch':case 'table:leave':case 'table:remove':return tableMember(roomCode,user,type.split(':')[1],action.tableId);
    case 'table:start':return startTable(roomCode,user,action.tableId);
    case 'table:restart':return restartTable(roomCode,user,action.tableId);
    case 'game:action':return gameAction(roomCode,user,action.tableId,action.action||{});
    case 'music':await mutate(roomCode,user,d=>musicAction(d,user,action.action||{}));return {ok:true};
    case 'screen:start':case 'screen:stop':case 'screen:heartbeat':return screenAction(roomCode,user,action);
    case 'signal:send':return sendSignal(roomCode,user,action);
    case 'signal:pull':return {signals:await pullSignals(roomCode,user,action.after,action.sessionId)};
    default:throw bad('Ação não reconhecida.');
  }
}
