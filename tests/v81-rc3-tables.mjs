import assert from 'node:assert/strict';
import * as Hub from '../server/hub-service.js';
const owner={id:'RC3-OWNER',username:'Dono RC3'};
const {code}=await Hub.createRoom(owner,{name:'Sala online com BOT',visibility:'public'});
for(const [game,settings,bots,difficulty,expected] of [
  ['chess',{clock:300,color:'black',spectators:'open'},1,'easy',{clock:300,color:'black'}],
  ['truco',{seats:4,turnTimer:30},3,'medium',{seats:4,turnTimer:30}],
]){
  const {table}=await Hub.act(code,owner,{type:'table:create',game,settings,bots,botDifficulty:difficulty});
  assert.equal(table.players.length,bots+1);
  assert.equal(table.players.filter(p=>p.bot).length,bots);
  for(const bot of table.players.filter(p=>p.bot))assert.equal(bot.difficulty,difficulty);
  for(const [key,value] of Object.entries(expected))assert.equal(table.settings[key],value);
  await Hub.act(code,owner,{type:'table:start',tableId:table.id});
  const snapshot=await Hub.getSnapshot(code,owner,table.id);
  assert.equal(snapshot.room.tables.find(t=>t.id===table.id).status,'playing');
  assert.equal(snapshot.game.game,game);
  console.log(`✔ ${game}: mesa online criada e iniciada com ${bots} BOT(s) ${difficulty}`);
}
const {table:friendly}=await Hub.act(code,owner,{type:'table:create',game:'chess',settings:{clock:600}});
assert.equal(friendly.players.length,1,'Mesa com amigos não deve incluir BOT automaticamente.');
await assert.rejects(Hub.act(code,owner,{type:'table:create',game:'pool',bots:1}),/Xadrez ou Truco/i);
await assert.rejects(Hub.act(code,owner,{type:'table:create',game:'truco',settings:{seats:4},bots:4}),/Número de BOTs inválido/i);
await assert.rejects(Hub.act(code,owner,{type:'table:create',game:'chess',bots:1,botDifficulty:'impossible'}),/Dificuldade de BOT inválida/i);
console.log('✔ RC3: modo amigos, validação de vagas e dificuldade no servidor');
