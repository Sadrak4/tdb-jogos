import fs from 'node:fs';
import assert from 'node:assert/strict';

const music=fs.readFileSync(new URL('../server/music-service.js', import.meta.url),'utf8');
const room=fs.readFileSync(new URL('../server/http-handlers/rooms/upsert.js', import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js', import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../games/music/music.js', import.meta.url),'utf8');

assert(!music.includes('Limite de ${limit} músicas por pessoa atingido'));
assert(!music.includes('function queueLimit'));
assert(room.includes('musicQueueLimit:0'));
assert(room.includes('room.musicQueueLimit=0'));
assert(!app.includes('id="musicQueueLimit"'));
assert(!app.includes('id="editMusicQueueLimit"'));
assert(ui.includes('∞ Sem limite'));
console.log('v7.2.1 music unlimited smoke: OK');
