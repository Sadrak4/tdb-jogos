import { createClient } from 'redis';

const MEMORY = {
  rooms: new Map(),
  matches: new Map(),
  presence: new Map(),
  shared: new Map()
};

let redisClient = null;
let publisher = null;
let subscriber = null;
let redisReady = false;
let initPromise = null;

export async function initRedis(){
  if(initPromise) return initPromise;

  initPromise=(async()=>{
    const url=process.env.REDIS_URL;
    if(!url) return false;

    try{
      redisClient=createClient({url});
      publisher=redisClient.duplicate();
      subscriber=redisClient.duplicate();

      redisClient.on('error',err=>console.error('[TDB Redis]',err));
      publisher.on('error',err=>console.error('[TDB Redis Publisher]',err));
      subscriber.on('error',err=>console.error('[TDB Redis Subscriber]',err));

      await Promise.all([
        redisClient.connect(),
        publisher.connect(),
        subscriber.connect()
      ]);

      redisReady=true;
      return true;
    }catch(err){
      console.error('[TDB] Redis indisponível; usando memória da instância.',err);
      redisReady=false;
      return false;
    }
  })();

  return initPromise;
}

export function isRedisReady(){
  return redisReady;
}

async function mapAll(hash, memoryMap){
  await initRedis();
  if(redisReady){
    const data=await redisClient.hGetAll(hash);
    return Object.values(data).map(v=>{
      try{return JSON.parse(v)}catch{return null}
    }).filter(Boolean);
  }
  return [...memoryMap.values()];
}

async function hashUpsert(hash,key,value,memoryMap){
  await initRedis();
  if(redisReady){
    await redisClient.hSet(hash,key,JSON.stringify(value));
  }else{
    memoryMap.set(key,structuredClone(value));
  }
}

async function hashRemove(hash,key,memoryMap){
  await initRedis();
  if(redisReady) await redisClient.hDel(hash,key);
  else memoryMap.delete(key);
}

export async function snapshot(){
  const [rooms,matches,presenceEntries,sharedEntries]=await Promise.all([
    mapAll('tdb:rooms',MEMORY.rooms),
    mapAll('tdb:matches',MEMORY.matches),
    mapAll('tdb:presence',MEMORY.presence),
    mapAll('tdb:shared',MEMORY.shared)
  ]);

  const presence={};
  for(const item of presenceEntries){
    if(item?.userId) presence[item.userId]=item;
  }

  // Only explicitly public shared state goes to browsers.
  // auth:* and game:* are never exposed by a global snapshot.
  const shared={};
  for(const item of sharedEntries){
    if(item?.key?.startsWith('music:')) shared[item.key]=item.value;
  }

  const publicRooms=rooms.map(room=>{
    const copy=structuredClone(room);
    copy.hasPassword=!!copy.password;
    delete copy.password;
    return copy;
  });

  return {rooms:publicRooms,matches,presence,shared,redis:redisReady};
}

export async function applyMutation(message){
  switch(message.type){
    case 'room:upsert':
      if(message.room?.code){
        await hashUpsert('tdb:rooms',message.room.code,message.room,MEMORY.rooms);
      }
      return;
    case 'room:remove':
      if(message.code){
        await hashRemove('tdb:rooms',message.code,MEMORY.rooms);
      }
      return;
    case 'match:upsert':
      if(message.match?.matchId){
        await hashUpsert('tdb:matches',message.match.matchId,message.match,MEMORY.matches);
      }
      return;
    case 'match:remove':
      if(message.matchId){
        await hashRemove('tdb:matches',message.matchId,MEMORY.matches);
      }
      return;
    case 'presence:set':
      if(message.userId){
        const payload={
          userId:message.userId,
          status:message.status||'online',
          ...(message.extra||{}),
          updatedAt:Date.now()
        };
        await hashUpsert('tdb:presence',message.userId,payload,MEMORY.presence);
        message.presence=payload;
      }
      return;
    case 'shared:set':
      if(message.key){
        await hashUpsert(
          'tdb:shared',
          message.key,
          {key:message.key,value:message.value,updatedAt:Date.now()},
          MEMORY.shared
        );
      }
      return;
  }
}

export async function publishGlobal(message){
  await initRedis();
  if(redisReady){
    await publisher.publish('tdb:broadcast',JSON.stringify(message));
    return true;
  }
  return false;
}

export async function subscribeGlobal(callback){
  await initRedis();
  if(!redisReady) return false;

  await subscriber.subscribe('tdb:broadcast',(raw)=>{
    try{
      callback(JSON.parse(raw));
    }catch(err){
      console.error('[TDB] Evento Redis inválido',err);
    }
  });
  return true;
}


export async function getSharedValue(key,fallback=null){
  await initRedis();
  if(redisReady){
    const raw=await redisClient.hGet('tdb:shared',key);
    if(!raw) return fallback;
    try{
      const obj=JSON.parse(raw);
      return obj?.value ?? fallback;
    }catch{return fallback}
  }
  return MEMORY.shared.get(key)?.value ?? fallback;
}

export async function setSharedValue(key,value){
  await initRedis();
  const payload={key,value,updatedAt:Date.now()};
  if(redisReady) await redisClient.hSet('tdb:shared',key,JSON.stringify(payload));
  else MEMORY.shared.set(key,payload);
  return value;
}

export async function getRoomPrivate(code){
  await initRedis();
  if(redisReady){
    const raw=await redisClient.hGet('tdb:rooms',code);
    if(!raw) return null;
    try{return JSON.parse(raw)}catch{return null}
  }
  return MEMORY.rooms.get(code) ? structuredClone(MEMORY.rooms.get(code)) : null;
}
export async function setRoomPrivate(room){
  if(!room?.code) return null;
  await hashUpsert('tdb:rooms',room.code,room,MEMORY.rooms);
  return room;
}
