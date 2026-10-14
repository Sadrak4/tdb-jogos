import assert from 'node:assert/strict';
import * as Auth from '../server/auth-service.js';
import hubHandler from '../server/http-handlers/hub.js';
const user=await Auth.register(`Test${Date.now()}`,'test1234');
const result=await Auth.login(user.username,'test1234');
const token=result.token;
async function call(method,body={},query={},bearer=token){
 let status=200,answer;
 const req={method,body,query,headers:{authorization:bearer?`Bearer ${bearer}`:''}};
 const res={status(n){status=n;return this},json(value){answer=value;return this}};
 await hubHandler(req,res);
 return {status,body:answer};
}
assert.equal((await call('GET',{}, {op:'list'},null)).status,401);
const created=await call('POST',{op:'create',name:'Sala API',visibility:'private'});
assert.equal(created.status,200);assert(created.body.ok);
const code=created.body.code;
const view=await call('GET',{}, {op:'snapshot',code});
assert.equal(view.body.room.name,'Sala API');
const msg=await call('POST',{op:'action',code,action:{type:'message',message:'Teste via endpoint'}});
assert(msg.body.ok);
assert.equal((await call('GET',{}, {op:'snapshot',code})).body.messages[0].message,'Teste via endpoint');
console.log('✔ v8 API route: session login, unauthorized rejection, room creation, snapshot, chat');
