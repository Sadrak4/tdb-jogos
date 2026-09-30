
import { setRoomPrivate,getRoomPrivate } from '../server/realtime-store.js';
import * as Games from '../server/game-service.js';
import { musicAction } from '../server/music-service.js';

function assert(name,condition){
  if(!condition) throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}

// ---------------------------------------------------------
// Competitive lifecycle: room -> game -> result -> room -> rematch
// ---------------------------------------------------------
const host={id:'TDB-LIFE0001',username:'Host',avatar:'H',connection:'online'};
const guest={id:'TDB-LIFE0002',username:'Guest',avatar:'G',connection:'online'};
const room={
  code:'XDR-LIFE54',
  game:'chess',
  name:'Lifecycle',
  owner:'Host',
  ownerId:host.id,
  privacy:'public',
  password:'',
  status:'open',
  chessClock:0,
  chessColor:'white',
  players:[host,guest],
  spectators:[]
};

await setRoomPrivate(room);
const first=await Games.startGame(room);
assert('First match starts',first.status==='playing');
const firstId=first.matchId;

const ended=await Games.applyAction(room.code,host.id,{type:'RESIGN'});
assert('Resign ends first match',Games.isTerminal(ended));

let storedRoom=await getRoomPrivate(room.code);
assert('Finished match marks room finished',storedRoom.status==='finished');

storedRoom=await Games.returnToRoom(room.code,guest.id);
assert('Returning player reopens room',storedRoom.status==='open');

const second=await Games.rematchGame(room.code,host.id);
assert('Host starts a fresh rematch',second.status==='playing');
assert('Rematch gets a new matchId',second.matchId!==firstId);

storedRoom=await getRoomPrivate(room.code);
assert('Room is playing during rematch',storedRoom.status==='playing');

// ---------------------------------------------------------
// Music: a room is usable without competitive match state.
// ---------------------------------------------------------
const musicRoom={
  code:'MUS-LIFE54',
  game:'music',
  name:'Music',
  owner:'Host',
  ownerId:host.id,
  privacy:'public',
  password:'',
  status:'open',
  musicControl:'everyone',
  musicSkipMode:'vote',
  musicQueueLimit:5,
  players:[host,guest],
  spectators:[]
};

await setRoomPrivate(musicRoom);

let ms=await musicAction(musicRoom.code,host,{
  type:'ADD_TRACK',
  track:{
    videoId:'dQw4w9WgXcQ',
    title:'Track A',
    channel:'Channel A',
    url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  }
});
assert('Host can add music to an open Music room',ms.queue.length===1);

ms=await musicAction(musicRoom.code,guest,{
  type:'ADD_TRACK',
  track:{
    videoId:'9bZkp7q19f0',
    title:'Track B',
    channel:'Channel B',
    url:'https://www.youtube.com/watch?v=9bZkp7q19f0'
  }
});
assert('Guest can share same Music queue',ms.queue.length===2);

const musicStored=await getRoomPrivate(musicRoom.code);
assert('Music room stays joinable/open',musicStored.status==='open');

console.log('ALL V5.4 LIFECYCLE TESTS PASSED');
