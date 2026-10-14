/** TDB 8.3.1 regression: modern invite eligibility and env-only ADM credentials.
 * Local memory implementation; real PostgreSQL/permissions remain Preview tests.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const salt=crypto.randomBytes(16).toString('hex');
const password='Senha de teste local 8.3.1!';
process.env.TDB_ADMIN_USERNAME='admin-test-only';
process.env.TDB_ADMIN_PASSWORD_SALT=salt;
process.env.TDB_ADMIN_PASSWORD_HASH=crypto.scryptSync(password,salt,64).toString('hex');
const Admin=await import('../server/admin-service.js');
const Hub=await import('../server/hub-service.js');
await assert.rejects(Admin.loginAdmin('adm','uma-senha-antiga'),/inválid/);
await assert.rejects(Admin.loginAdmin('admin-test-only','senha-invalida'),/inválid/);
const session=await Admin.loginAdmin('admin-test-only',password);
assert(session.token&&session.token.length===64);
assert((await Admin.adminSession(session.token))?.role==='admin');
await Admin.logoutAdmin(session.token);
assert.equal(await Admin.adminSession(session.token),null);
const owner={id:'TDB-A-OWNER',username:'Criador'};
const visitor={id:'TDB-A-VISITOR',username:'Convidado'};
const outsider={id:'TDB-A-OTHER',username:'Não membro'};
const {code}=await Hub.createRoom(owner,{name:'Privada convite 8.3.1',visibility:'private'});
assert.deepEqual((await Hub.inspectRoomForInvite(code,owner.id,visitor.id)).code,code);
await assert.rejects(Hub.inspectRoomForInvite(code,outsider.id,visitor.id),/Entre na sala/);
await Hub.joinRoom(code,visitor);
await assert.rejects(Hub.inspectRoomForInvite(code,owner.id,visitor.id),/já está na sala/);
await Hub.act(code,owner,{type:'room:kick',userId:visitor.id});
await assert.rejects(Hub.inspectRoomForInvite(code,owner.id,visitor.id),/removido/);
const training=await Hub.createRoom(owner,{name:'Treino pessoal',training:true});
await assert.rejects(Hub.inspectRoomForInvite(training.code,owner.id,outsider.id),/treinamento/);
console.log('✔ TDB 8.3.1: ADM com hash de variável de ambiente, sessão revogável e convites validados em tdb_hubs');
