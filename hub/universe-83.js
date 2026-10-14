/* TDB 8.3: navigation/presentation only. All room, music and game actions
   intentionally delegate to the existing hub controls instead of duplicating engines. */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const click=id=>document.getElementById(id)?.click();
const currentUser=()=>$('#user-name')?.textContent||'Jogador';
const getRooms=()=>$$('#home-rooms [data-enter]').map(n=>({id:n.dataset.enter,title:n.querySelector('h3')?.textContent||n.dataset.enter,members:n.querySelector('.card-foot')?.textContent?.trim()||''}));
const scrollToSection=id=>{click('nav-home');requestAnimationFrame(()=>$('#'+id)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}))};
function showNews(type){scrollToSection('discover-section');if(type)clickFilter(type)}
function clickFilter(type){$(`[data-discover-filter="${type}"]`)?.click()}
function updateUser(){const n=currentUser();$('#universe-username').textContent=n;$('#universe-account-name').textContent=n;$('#universe-avatar').textContent=n.slice(0,1).toUpperCase()}
const watchName=new MutationObserver(updateUser);if($('#user-name'))watchName.observe($('#user-name'),{childList:true,subtree:true});updateUser();
function updateRooms(){const rooms=getRooms();const root=$('#universe-room-preview');if(!root)return;root.innerHTML=rooms.length?rooms.slice(0,5).map(r=>`<button class="universe-room-item" type="button" data-universe-enter="${esc(r.id)}"><span class="universe-room-emblem">⌂</span><span><b>${esc(r.title)}</b><small>${esc(r.members)}</small></span><em>Entrar ↗</em></button>`).join(''):'<div class="universe-room-empty"><span>⌂</span><b>Nenhuma sala aberta agora</b><small>Crie uma sala e convide sua galera.</small></div>'}
// Observe only room-card changes, not the whole document (avoids rendering loops).
const homeRooms=$('#home-rooms');if(homeRooms)new MutationObserver(updateRooms).observe(homeRooms,{childList:true});updateRooms();
function updateResume(){const code=localStorage.getItem('tdb_hub_last_room');$('#universe-resume-room')?.classList.toggle('hidden',!code)}
updateResume();
$('#universe-resume-room')?.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('tdb:resume-room')));
$('#universe-room-preview')?.addEventListener('click',e=>{const b=e.target.closest('[data-universe-enter]');if(!b)return;const id=b.dataset.universeEnter;const btn=$$('#home-rooms [data-enter]').find(x=>x.dataset.enter===id);btn?.click()});
const actionIds={
  'nav-explore':()=>scrollToSection('universe-home-rooms-anchor'),
  'nav-games':()=>click('top-training'),
  'nav-music':()=>click('home-library'),
  'universe-home-rooms':()=>scrollToSection('universe-home-rooms-anchor'),
  'universe-see-rooms':()=>scrollToSection('universe-home-rooms-anchor'),
  'universe-create-room':()=>click('top-create'),
  'universe-join-room':()=>click('top-join'),
  'universe-quick-chess':()=>click('top-training'),
  'universe-quick-library':()=>click('home-library'),
  'universe-quick-history':()=>click('nav-history'),
  'universe-room-tables':()=>clickTab('tables'),
  'universe-room-streams':()=>$('#room-view .share-card')?.scrollIntoView({block:'nearest',behavior:'smooth'}),
  'universe-room-chat':()=>clickTab('chat'),
  'universe-room-people':()=>clickTab('members'),
  'universe-room-invite':()=>click('nav-friends')
};
function clickTab(tab){$(`[data-tab="${tab}"]`)?.click();$('#'+(tab==='chat'?'chat-panel':tab==='members'?'members-panel':'tables-panel'))?.scrollIntoView({block:'nearest',behavior:'smooth'})}
// In HTML the explore anchor is a real existing section, not an independent view.
$('.home-rooms-section')?.setAttribute('id','universe-home-rooms-anchor');
for(const [id,fn] of Object.entries(actionIds))document.getElementById(id)?.addEventListener('click',fn);
for(const b of $$('[data-universe-filter]'))b.addEventListener('click',()=>showNews(b.dataset.universeFilter));
// The helper is displayed only when no tables are present; it never replaces the real games.
const tableList=$('#tables-list'),roomGuide=$('#universe-room-guide');
function updateRoomGuide(){if(roomGuide&&tableList)roomGuide.classList.toggle('hidden',!!tableList.querySelector('.table-card'))}
if(tableList)new MutationObserver(updateRoomGuide).observe(tableList,{childList:true});
updateRoomGuide();
$('#universe-guide-create')?.addEventListener('click',()=>click('new-table'));
$('#universe-guide-bot')?.addEventListener('click',()=>click('new-bot-table'));
// Keep selected sidebar state consistent with the existing home/room nav.
const shell=$('#shell');const setNav=()=>{const home=!$('#home')?.classList.contains('hidden');const room=!$('#room-view')?.classList.contains('hidden');$('#nav-home')?.classList.toggle('active',home);$('#nav-room')?.classList.toggle('active',room);updateResume()};
window.addEventListener('storage',e=>{if(e.key==='tdb_hub_last_room')updateResume()});
if(shell)new MutationObserver(setNav).observe($('#home'),{attributes:true,attributeFilter:['class']});setNav();
// Global palette/search with keyboard navigation; no new backend or private data.
const command=$('#universe-command'),input=$('#universe-command-input'),results=$('#universe-command-results');
const shortcuts=[
  {title:'Notícias e promoções',desc:'Abrir home gamer',fn:()=>click('nav-home')},
  {title:'Ofertas Steam',desc:'Ver promoções disponíveis',fn:()=>showNews('steam')},
  {title:'Jogos grátis Epic',desc:'Conferir ofertas gratuitas',fn:()=>showNews('epic')},
  {title:'Nuuvem',desc:'Loja brasileira de jogos e ofertas',fn:()=>showNews('nuuvem')},
  {title:'Explorar salas',desc:'Ver salas abertas',fn:()=>scrollToSection('universe-home-rooms-anchor')},
  {title:'Criar sala',desc:'Abrir criação de sala',fn:()=>click('top-create')},
  {title:'Entrar com código',desc:'Acessar sala privada',fn:()=>click('top-join')},
  {title:'Jogos',desc:'Xadrez ou Truco com BOT',fn:()=>click('top-training')},
  {title:'Meu perfil',desc:'Minha conta e minhas estatísticas',fn:()=>click('nav-profile')},
  {title:'Amigos e convites',desc:'Adicionar amigos e convidar para salas',fn:()=>click('nav-friends')},
  {title:'Biblioteca musical',desc:'Favoritos, playlists e histórico',fn:()=>click('home-library')},
  {title:'Histórico de partidas',desc:'Consultar resultados anteriores',fn:()=>click('nav-history')}
];
let shown=[],highlighted=0;
function getNews(){return $$('#discover-list .discover-card[href^="https://"]').map(a=>({title:a.querySelector('strong')?.textContent?.trim()||'',desc:a.querySelector('.discover-source')?.textContent?.trim()||'Notícia',fn:()=>a.click()})).filter(x=>x.title)}
function selectCommand(index){const all=$$('#universe-command-results [data-command-index]');if(!all.length)return;highlighted=(index+all.length)%all.length;all.forEach((node,i)=>{node.classList.toggle('is-active',i===highlighted);node.setAttribute('aria-selected',String(i===highlighted))});all[highlighted].scrollIntoView({block:'nearest'})}
function renderCommands(){const q=input.value.trim().toLocaleLowerCase('pt-BR');const roomEntries=getRooms().map(r=>({title:r.title,desc:'Sala '+r.id,fn:()=>{$$('#home-rooms [data-enter]').find(b=>b.dataset.enter===r.id)?.click()}}));shown=[...shortcuts,...roomEntries,...getNews()].filter(s=>(s.title+' '+s.desc).toLocaleLowerCase('pt-BR').includes(q)).slice(0,11);results.innerHTML=shown.length?shown.map((s,i)=>`<button type="button" class="universe-command-option" data-command-index="${i}" role="option"><b>${esc(s.title)}</b><small>${esc(s.desc)}</small><span>↗</span></button>`).join(''):'<p class="subtle">Nada encontrado. Tente buscar por sala, música ou jogos.</p>';highlighted=0;selectCommand(0)}
function openCommand(){if(!$('#shell')||$('#shell').classList.contains('hidden'))return;if(!command.open)command.showModal();input.value='';renderCommands();input.focus()}
function closeCommand(){if(command.open)command.close()}
$('#universe-search-trigger')?.addEventListener('click',openCommand);
$('#universe-command-close')?.addEventListener('click',closeCommand);
input?.addEventListener('input',renderCommands);
results?.addEventListener('click',e=>{const b=e.target.closest('[data-command-index]');if(!b)return;const choice=shown[Number(b.dataset.commandIndex)];if(choice){closeCommand();choice.fn()}});
input?.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();selectCommand(highlighted+(e.key==='ArrowDown'?1:-1))}else if(e.key==='Enter'&&shown.length){e.preventDefault();const chosen=shown[highlighted];closeCommand();chosen?.fn()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&command.open){e.preventDefault();closeCommand();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();command.open?closeCommand():openCommand()}});
// Notifications panel now delegates to real pending friend/room requests.
$('#universe-notifications')?.addEventListener('click',()=>click('nav-friends'));
const account=$('#universe-account-dialog');
$('#universe-profile')?.addEventListener('click',()=>{click('nav-profile')});
$('#universe-account-close')?.addEventListener('click',()=>account.close());
$('#universe-account-history')?.addEventListener('click',()=>{account.close();click('nav-history')});
// Featured news is linked only to a verified public item returned by /api/discover.
function setFeatured(entry){
  const title=$('#universe-feature-title'),source=$('#universe-feature-source'),link=$('#universe-feature-link'),desc=$('#universe-feature-desc');
  if(!entry||!title||!link)return;
  let url;try{url=new URL(entry.url);if(url.protocol!=='https:')return}catch{return}
  title.textContent=String(entry.title||'').slice(0,170)||'Novidades do universo gamer';
  source.textContent=String(entry.source||'FONTE OFICIAL').toLocaleUpperCase('pt-BR');
  desc.textContent='Leia a matéria na fonte original. Informações e preços podem mudar.';
  link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Ler na fonte oficial ↗';
}
document.addEventListener('tdb:discover',event=>setFeatured(event.detail?.featured));
if(window.__tdbDiscoverFeatured)setFeatured(window.__tdbDiscoverFeatured);
