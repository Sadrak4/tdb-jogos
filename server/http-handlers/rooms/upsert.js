import { getRoomPrivate,setRoomPrivate,backendStatus } from '../../realtime-store.js';
import { requireApiUser,sendApiError } from '../../api-auth.js';

function publicRoom(room){
  const copy=structuredClone(room);
  copy.hasPassword=!!copy.password;
  delete copy.password;
  return copy;
}

function sanitizeCreate(input,user){
  const game=['truco','pool','chess','music','blackjack'].includes(input.game)?input.game:'truco';
  return {
    code:String(input.code||'').toUpperCase(),
    game,
    name:String(input.name||`Sala de ${user.username}`).slice(0,30),
    owner:user.username,
    ownerId:user.id,
    privacy:['public','private','friends','invite'].includes(input.privacy)?input.privacy:'public',
    password:String(input.password||'').slice(0,16),
    status:'open',
    turnTimer:[0,30,60].includes(Number(input.turnTimer))?Number(input.turnTimer):0,
    trucoSeats:Number(input.trucoSeats)===2?2:4,
    chessClock:[0,60,180,300,600,900].includes(Number(input.chessClock))?Number(input.chessClock):0,
    chessColor:['white','black','random'].includes(input.chessColor)?input.chessColor:'random',
    chessBotDifficulty:['easy','medium','hard'].includes(input.chessBotDifficulty)?input.chessBotDifficulty:'easy',
    poolTurnTimer:[0,30,45,60].includes(Number(input.poolTurnTimer))?Number(input.poolTurnTimer):45,
    poolAimAssist:['short','none'].includes(input.poolAimAssist)?input.poolAimAssist:'short',
    poolAllowSpectators:input.poolAllowSpectators!==false,
    musicControl:input.musicControl==='host'?'host':'everyone',
    musicSkipMode:['host','everyone','vote'].includes(input.musicSkipMode)?input.musicSkipMode:'vote',
    musicQueueLimit:[0,3,5,10].includes(Number(input.musicQueueLimit))?Number(input.musicQueueLimit):5,
    blackjackTurnTimer:[0,15,20,30].includes(Number(input.blackjackTurnTimer))?Number(input.blackjackTurnTimer):20,
    blackjackMinBet:[10,25,50].includes(Number(input.blackjackMinBet))?Number(input.blackjackMinBet):25,
    blackjackStartingChips:[500,1000,2000].includes(Number(input.blackjackStartingChips))?Number(input.blackjackStartingChips):1000,
    blackjackDecks:[1,2,4].includes(Number(input.blackjackDecks))?Number(input.blackjackDecks):4,
    players:[{id:user.id,username:user.username,avatar:user.avatar||null,avatarImage:user.avatarImage||null,connection:'online'}],
    spectators:[],
    createdAt:Date.now()
  };
}

function applyEditableRules(room,input){
  const playing=room.status==='playing';
  const rulesChanged=room.game==='truco'
    ? (input.trucoSeats!==undefined&&Number(input.trucoSeats)!==Number(room.trucoSeats||4)) || (input.turnTimer!==undefined&&Number(input.turnTimer)!==Number(room.turnTimer||0))
    : room.game==='chess'
      ? (input.chessClock!==undefined&&Number(input.chessClock)!==Number(room.chessClock||0)) || (input.chessColor!==undefined&&input.chessColor!==(room.chessColor||'random')) || (input.chessBotDifficulty!==undefined&&input.chessBotDifficulty!==(room.chessBotDifficulty||'easy'))
      : room.game==='pool'
        ? (input.poolTurnTimer!==undefined&&Number(input.poolTurnTimer)!==Number(room.poolTurnTimer??45)) || (input.poolAimAssist!==undefined&&input.poolAimAssist!==(room.poolAimAssist||'short')) || (input.poolAllowSpectators!==undefined&&Boolean(input.poolAllowSpectators)!==(room.poolAllowSpectators!==false))
      : room.game==='music'
        ? (input.musicControl!==undefined&&input.musicControl!==(room.musicControl||'everyone')) || (input.musicSkipMode!==undefined&&input.musicSkipMode!==(room.musicSkipMode||'vote')) || (input.musicQueueLimit!==undefined&&Number(input.musicQueueLimit)!==Number(room.musicQueueLimit??5))
        : false;
  if(playing&&rulesChanged) throw new Error('Não é possível alterar as regras durante uma partida.');

  room.name=String(input.name||room.name).slice(0,30);
  room.privacy=['public','private','friends','invite'].includes(input.privacy)?input.privacy:room.privacy;
  if(input.password!==undefined) room.password=String(input.password||'').slice(0,16);

  if(room.game==='truco'){
    const seats=Number(input.trucoSeats);
    if([2,4].includes(seats)){
      if((room.players||[]).length>seats){
        throw new Error(`A sala possui ${(room.players||[]).length} jogadores. Remova jogadores antes de reduzir para ${seats}.`);
      }
      room.trucoSeats=seats;
    }
    const timer=Number(input.turnTimer);
    if([0,30,60].includes(timer)) room.turnTimer=timer;
  }

  if(room.game==='chess'){
    const clock=Number(input.chessClock);
    if([0,60,180,300,600,900].includes(clock)) room.chessClock=clock;
    if(['white','black','random'].includes(input.chessColor)) room.chessColor=input.chessColor;
    if(['easy','medium','hard'].includes(input.chessBotDifficulty)) room.chessBotDifficulty=input.chessBotDifficulty;
  }


  if(room.game==='pool'){
    const timer=Number(input.poolTurnTimer);
    if([0,30,45,60].includes(timer)) room.poolTurnTimer=timer;
    if(['short','none'].includes(input.poolAimAssist)) room.poolAimAssist=input.poolAimAssist;
    if(input.poolAllowSpectators!==undefined) room.poolAllowSpectators=Boolean(input.poolAllowSpectators);
  }

  if(room.game==='music'){
    room.musicControl=input.musicControl==='host'?'host':'everyone';
    room.musicSkipMode=['host','everyone','vote'].includes(input.musicSkipMode)?input.musicSkipMode:room.musicSkipMode;
    if([0,3,5,10].includes(Number(input.musicQueueLimit))) room.musicQueueLimit=Number(input.musicQueueLimit);
  }

  return room;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método inválido'});
  try{
    const [user,status]=await Promise.all([requireApiUser(req),backendStatus()]);
    if(status.production&&!status.supabase) throw new Error('Supabase não configurado.');

    const input=structuredClone(req.body?.room||null);
    if(!input?.code) throw new Error('Sala inválida.');
    if(input.game==='blackjack') throw new Error('Blackjack está em manutenção temporária.');

    const previous=await getRoomPrivate(String(input.code).toUpperCase());
    let room;
    if(!previous){
      room=sanitizeCreate(input,user);
    }else{
      if(previous.ownerId!==user.id) throw new Error('Somente o host pode alterar a sala.');
      room=applyEditableRules(previous,input);
    }

    await setRoomPrivate(room);
    res.json({ok:true,room:publicRoom(room)});
  }catch(err){
    sendApiError(res,err);
  }
}
