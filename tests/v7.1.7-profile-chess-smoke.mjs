import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const app=read('app.js');
const auth=read('server/auth-service.js');
const social=read('server/social-service.js');
const update=read('server/http-handlers/profile/update.js');
const css=read('ui/pages.css');
const gameplay=read('ui/gameplay-fixes.css');
const migration=read('SUPABASE-MIGRATION-v7.1.7.sql');
const health=read('server/http-handlers/health.js');

assert.equal(pkg.version,'7.1.7');
assert.match(health,/version:'7\.1\.7'/);
assert.match(migration,/add column if not exists avatar_image text/i);
assert.match(auth,/avatarImage:u\.avatar_image\|\|u\.avatarImage\|\|null/);
assert.match(auth,/avatar_image:cleanImageUrl\(avatarImage\)/);
assert.match(update,/req\.body\?\.avatarImage\|\|null/);
assert.match(social,/avatar_image/);
assert.match(app,/Foto de perfil \(URL da imagem\)/);
assert.match(app,/function renderPublicProfile\(id\)/);
assert.match(app,/Visitar perfil/);
assert.match(app,/publicProfileStatsHtml/);
assert.match(css,/TDB v7\.1\.7 — Profile 3\.0/);
assert.match(css,/profile-cover/);
assert.match(css,/avatar\.has-photo/);
assert.match(gameplay,/TDB v7\.1\.7 — chess board final sizing pass/);
assert.match(gameplay,/calc\(100dvh - 102px\)/);

console.log('v7.1.7 profile/chess smoke: OK');
