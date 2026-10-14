/** Smoke TDB 8.1.4: local CAS, administrative cancellation, incremental chat.
 * Supabase SQL atomicity requires separate Preview database integration tests.
 */
import assert from 'node:assert/strict';
import * as Hub from '../server/hub-service.js';
import * as Games from '../server/game-service.js';
import {compareAndSetGame,getSharedValue,setSharedValue} from '../server/realtime-store.js';
const admin={id:'TDB-I-ADMIN',username:'Administrador'};
const guest={id:'TDB-I-GUEST',username:'Convidado'};
const {code}=await Hub.createRoom(admin,{name:'Teste integridade 8.1.4'});
await Hub.joinRoom(code,guest);
await Hub.act(code,admin,{type:'message',message:'Primeira'});
const original=await Hub.getSnapshot(code,admin);
assert.equal(original.messages.length,1);
const cursor=original.messages[0].id;
await Hub.act(code,guest,{type:'message',message:'Segunda'});
const delta=await Hub.getSnapshot(code,admin,null,cursor);
assert(delta.messagesDelta);
assert.equal(delta.messages.length,1);
assert.equal(delta.messages[0].message,'Segunda');
const {table}=await Hub.act(code,admin,{type:'table:create',game:'chess'});
await Hub.act(code,guest,{type:'table:join',tableId:table.id});
await Hub.act(code,admin,{type:'table:start',tableId:table.id});
const state=await Games.getGame(table.id);
assert.equal(state.game,'chess');
const result=await Promise.all([
  compareAndSetGame(`game:${table.id}`,state.version,{...state,version:state.version+1}),
  compareAndSetGame(`game:${table.id}`,state.version,{...state,version:state.version+1})
]);
assert.equal(result.filter(Boolean).length,1,'Only one write must claim the same version');
assert.equal((await getSharedValue(`game:${table.id}`)).version,state.version+1);
await Hub.act(code,admin,{type:'room:kick',userId:guest.id});
const canceled=await Games.getGame(table.id);
assert.equal(canceled.status,'canceled');
assert.equal(canceled.winner,null);
assert.equal(canceled.canceled,true);
const shot=await Hub.getSnapshot(code,admin,table.id);
assert.equal(shot.room.tables.find(t=>t.id===table.id).status,'finished');
await assert.rejects(Hub.joinRoom(code,guest),/removido/);
console.log('✔ 8.1.4: chat incremental, CAS concorrente, expulsão administrativa cancela sem vencedor');
