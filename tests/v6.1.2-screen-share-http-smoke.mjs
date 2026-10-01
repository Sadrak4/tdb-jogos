
import * as Auth from '../server/auth-service.js';
import { applyMutation } from '../server/realtime-store.js';
import { handleHttpApi } from '../server/http-router.js';

function assert(name,condition){
  if(!condition)throw new Error(`FAIL: ${name}`);
  console.log('OK',name);
}
function response(){
  return {
    statusCode:200,
    body:null,
    headers:{},
    headersSent:false,
    setHeader(k,v){this.headers[k]=v;return this},
    status(code){this.statusCode=code;return this},
    json(value){this.body=value;this.headersSent=true;return value}
  };
}
async function call({method='GET',token,code,body=null}){
  const query={route:'platform/screen-share'};
  if(code)query.code=code;
  const req={
    method,
    headers:token?{authorization:`Bearer ${token}`}:{},
    query,
    body,
    url:`/api/router?route=platform/screen-share${code?`&code=${code}`:''}`,
    socket:{remoteAddress:'127.0.0.1'}
  };
  const res=response();
  res.req=req;
  await handleHttpApi(req,res);
  return res;
}

const suffix=Math.random().toString(36).slice(2,8);
await Auth.register(`Alpha${suffix}`,'1234');
await Auth.register(`Beta${suffix}`,'1234');
const a=await Auth.login(`Alpha${suffix}`,'1234');
const b=await Auth.login(`Beta${suffix}`,'1234');

const room={
  code:`R${suffix}`.toUpperCase().slice(0,8),
  game:'music',
  name:'HTTP Screen Test',
  ownerId:a.user.id,
  owner:a.user.username,
  status:'open',
  privacy:'public',
  players:[
    {id:a.user.id,username:a.user.username},
    {id:b.user.id,username:b.user.username}
  ],
  spectators:[]
};
await applyMutation({type:'room:upsert',room});

let res=await call({method:'GET',token:a.token,code:room.code});
assert('GET /api/router?route=platform/screen-share returns 200',res.statusCode===200&&res.body?.ok===true);
assert('Initial HTTP state is inactive',res.body?.state?.active===false);

const broadcastId=`SCR-${Date.now()}-HTTP12`;
res=await call({
  method:'POST',
  token:a.token,
  body:{code:room.code,action:{type:'START',broadcastId}}
});
assert('POST START through HTTP router returns 200',res.statusCode===200&&res.body?.ok===true);
assert('HTTP START confirms exact broadcast id',res.body?.state?.broadcastId===broadcastId);

res=await call({method:'GET',token:b.token,code:room.code});
assert('Second account sees broadcaster through HTTP route',
  res.body?.state?.active===true&&res.body?.state?.broadcaster?.id===a.user.id);

res=await call({
  method:'POST',
  token:b.token,
  body:{code:room.code,action:{type:'WATCH',broadcastId}}
});
assert('Viewer WATCH through HTTP route is accepted',
  res.statusCode===200&&res.body?.state?.selfViewer?.status==='requested');

res=await call({
  method:'POST',
  token:a.token,
  body:{code:room.code,action:{type:'STOP',broadcastId}}
});
assert('Broadcaster STOP through HTTP route is accepted',
  res.statusCode===200&&res.body?.state?.active===false);

console.log('ALL V6.1.2 SCREEN SHARE HTTP TESTS PASSED');
