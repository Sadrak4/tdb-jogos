import { getRoomPrivate,getSharedValue,setSharedValue } from './realtime-store.js';

function key(code){return `music:${code}`}

function defaultState(code,userId=null){
  const now=Date.now();
  return {
    roomCode:code,
    queue:[],
    currentIndex:-1,
    status:'paused',
    position:0,
    changedAt:now,
    updatedAt:now,
    updatedBy:userId,
    revision:0,
    playbackRevision:0,
    controlsLocked:false,
    skipVotes:[],
    history:[],
    lastAction:null,
    lastActionId:null
  };
}

function member(room,userId){return (room.players||[]).some(p=>p.id===userId)}
function host(room,userId){return room.ownerId===userId}
function canControl(room,s,userId){return host(room,userId)||(!s.controlsLocked&&room.musicControl!=='host')}
function expectedPosition(s){
  const base=Number(s.position||0);
  return s.status==='playing'
    ? base+Math.max(0,(Date.now()-Number(s.changedAt||Date.now()))/1000)
    : base;
}
function actionPosition(action,s){
  const supplied=Number(action?.position);
  return Number.isFinite(supplied)&&supplied>=0?supplied:expectedPosition(s);
}
function annotate(s,type,user,extra={},playbackChanged=false){
  s.lastAction={type,by:user.username,byId:user.id,at:Date.now(),...extra};
  s.updatedAt=Date.now();
  s.updatedBy=user.id;
  s.revision=Number(s.revision||0)+1;
  if(playbackChanged)s.playbackRevision=Number(s.playbackRevision||0)+1;
}
function rememberCurrent(s){
  const current=s.queue?.[s.currentIndex];
  if(!current)return;
  s.history=Array.isArray(s.history)?s.history:[];
  const item={
    videoId:current.videoId,
    title:current.title,
    channel:current.channel,
    thumbnail:current.thumbnail,
    url:current.url,
    addedBy:current.addedBy,
    playedAt:Date.now()
  };
  s.history=[item,...s.history.filter(x=>x.videoId!==item.videoId||Date.now()-Number(x.playedAt||0)>1000)].slice(0,10);
}
function advance(s){
  rememberCurrent(s);
  s.skipVotes=[];
  if(s.currentIndex+1>=s.queue.length){
    s.status='paused';
    s.position=0;
    s.changedAt=Date.now();
    return;
  }
  s.currentIndex++;
  s.position=0;
  s.status='playing';
  s.changedAt=Date.now();
}

export async function musicAction(code,user,action){
  code=String(code||'').toUpperCase();
  const room=await getRoomPrivate(code);
  if(!room||room.game!=='music')throw new Error('Sala TDB Lobby não encontrada.');
  if(!member(room,user.id))throw new Error('Você não está nesta sala.');

  const s=structuredClone(await getSharedValue(key(code),defaultState(code,user.id))||defaultState(code,user.id));
  s.controlsLocked=!!s.controlsLocked;
  s.skipVotes=Array.isArray(s.skipVotes)?s.skipVotes:[];
  s.history=Array.isArray(s.history)?s.history:[];
  s.revision=Number(s.revision||0);
  s.playbackRevision=Number(s.playbackRevision||0);

  if(action?.actionId&&s.lastActionId===action.actionId)return s;

  switch(action?.type){
    case 'ADD_TRACK':{
      const track=action.track||{};
      if(!/^[A-Za-z0-9_-]{11}$/.test(String(track.videoId||'')))throw new Error('Vídeo inválido.');
      if(s.queue.some(x=>x.videoId===track.videoId&&x.addedById===user.id))throw new Error('Você já adicionou esse vídeo à fila.');
      s.queue.push({
        id:`Q-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        videoId:String(track.videoId),
        title:String(track.title||'YouTube').slice(0,180),
        channel:String(track.channel||'').slice(0,120),
        thumbnail:String(track.thumbnail||'').slice(0,500),
        url:String(track.url||'').slice(0,500),
        addedBy:user.username,
        addedById:user.id,
        addedAt:Date.now()
      });
      const first=s.currentIndex<0;
      if(first){
        s.currentIndex=0;
        s.position=0;
        s.status='paused';
        s.changedAt=Date.now();
      }
      annotate(s,'add',user,{},first);
      break;
    }
    case 'PLAY':{
      if(!canControl(room,s,user.id))throw new Error('Os controles estão bloqueados pelo host.');
      if(!s.queue[s.currentIndex])throw new Error('Fila vazia.');
      s.position=Math.max(0,actionPosition(action,s));
      s.status='playing';
      s.changedAt=Date.now();
      s.skipVotes=[];
      annotate(s,'play',user,{},true);
      break;
    }
    case 'PAUSE':{
      if(!canControl(room,s,user.id))throw new Error('Os controles estão bloqueados pelo host.');
      s.position=Math.max(0,actionPosition(action,s));
      s.status='paused';
      s.changedAt=Date.now();
      annotate(s,'pause',user,{},true);
      break;
    }
    case 'NEXT':{
      if(action.trackId&&s.queue[s.currentIndex]?.id!==action.trackId)return s;
      if(s.controlsLocked&&!host(room,user.id))throw new Error('Os controles estão bloqueados pelo host.');
      const voteMode=room.musicSkipMode==='vote'&&!host(room,user.id);
      if(voteMode){
        if(!s.skipVotes.includes(user.id))s.skipVotes.push(user.id);
        const needed=Math.max(2,Math.floor((room.players||[]).length/2)+1);
        if(s.skipVotes.length<needed){
          annotate(s,'skip-vote',user,{votes:s.skipVotes.length,needed},false);
          break;
        }
      }else if(room.musicSkipMode==='host'&&!host(room,user.id)){
        throw new Error('Somente o host pode pular.');
      }
      advance(s);
      annotate(s,'next',user,{},true);
      break;
    }
    case 'ENDED':{
      // Apenas o host decide o avanço automático. Isso evita vários clientes
      // enviando NEXT ao mesmo tempo quando o mesmo vídeo termina.
      if(!host(room,user.id))return s;
      if(action.trackId&&s.queue[s.currentIndex]?.id!==action.trackId)return s;
      advance(s);
      annotate(s,'ended',user,{},true);
      break;
    }
    case 'PREVIOUS':{
      if(!canControl(room,s,user.id))throw new Error('Os controles estão bloqueados pelo host.');
      const pos=Math.max(0,actionPosition(action,s));
      if(pos<=5&&s.currentIndex>0){
        rememberCurrent(s);
        s.currentIndex--;
      }
      s.position=0;
      s.status='playing';
      s.changedAt=Date.now();
      s.skipVotes=[];
      annotate(s,'previous',user,{},true);
      break;
    }
    case 'JUMP':{
      if(!canControl(room,s,user.id))throw new Error('Somente quem controla o player pode escolher uma faixa.');
      const index=Number(action.index);
      if(!Number.isInteger(index)||index<0||index>=s.queue.length)throw new Error('Faixa inválida.');
      if(index!==s.currentIndex)rememberCurrent(s);
      s.currentIndex=index;
      s.position=0;
      s.status='playing';
      s.changedAt=Date.now();
      s.skipVotes=[];
      annotate(s,'jump',user,{},true);
      break;
    }
    case 'REMOVE':{
      const index=s.queue.findIndex(x=>x.id===action.itemId);
      if(index<0)throw new Error('Faixa não encontrada.');
      const item=s.queue[index];
      if(!host(room,user.id)&&item.addedById!==user.id)throw new Error('Você só pode remover músicas que adicionou.');
      const playbackChanged=index===s.currentIndex;
      if(playbackChanged)rememberCurrent(s);
      s.queue.splice(index,1);
      if(!s.queue.length){
        s.currentIndex=-1;
        s.position=0;
        s.status='paused';
        s.changedAt=Date.now();
      }else if(index<s.currentIndex){
        s.currentIndex--;
      }else if(index===s.currentIndex){
        s.currentIndex=Math.min(s.currentIndex,s.queue.length-1);
        s.position=0;
        s.status='paused';
        s.changedAt=Date.now();
      }
      s.skipVotes=[];
      annotate(s,'remove',user,{title:item.title},playbackChanged);
      break;
    }
    case 'MOVE':{
      if(s.controlsLocked&&!host(room,user.id))throw new Error('Os controles estão bloqueados pelo host.');
      const from=s.queue.findIndex(x=>x.id===action.itemId);
      if(from<0)throw new Error('Faixa não encontrada.');
      const item=s.queue[from];
      if(!host(room,user.id)&&item.addedById!==user.id)throw new Error('Somente o host ou quem adicionou pode reorganizar essa música.');
      const to=Math.max(0,Math.min(s.queue.length-1,from+Number(action.direction||0)));
      if(to===from)return s;
      s.queue.splice(from,1);
      s.queue.splice(to,0,item);
      if(s.currentIndex===from)s.currentIndex=to;
      else if(from<s.currentIndex&&to>=s.currentIndex)s.currentIndex--;
      else if(from>s.currentIndex&&to<=s.currentIndex)s.currentIndex++;
      annotate(s,'reorder',user,{},false);
      break;
    }
    case 'TOGGLE_LOCK':{
      if(!host(room,user.id))throw new Error('Somente o host pode bloquear os controles.');
      s.controlsLocked=!s.controlsLocked;
      annotate(s,s.controlsLocked?'lock':'unlock',user,{},false);
      break;
    }
    default:
      throw new Error('Ação de música inválida.');
  }

  if(action?.actionId)s.lastActionId=action.actionId;
  await setSharedValue(key(code),s);
  return s;
}
