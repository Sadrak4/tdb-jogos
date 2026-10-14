from pathlib import Path
from playwright.sync_api import sync_playwright
import re
import base64
ROOT=Path(__file__).resolve().parents[1]
MOCK=r'''
const store=new Map([['tdb_session_token','local-test-token']]);
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
window.confirm=()=>true;window.__posted=[];
window.__room={code:'SALA-RC3BOT01',name:'Sala amigos',visibility:'public',ownerId:'TEST-OWNER',members:[{id:'TEST-OWNER',username:'Dono',lastSeen:Date.now()}],screens:[],tables:[],music:{queue:[],index:-1,playing:false,position:0,startedAt:null,revision:0},permissions:{tables:'everyone',music:{add:'everyone',play:'everyone',remove:'owner',next:'owner',voteSkip:true}}};
window.fetch=async (url,opts={})=>{
 const path=String(url);let val={ok:true};
 if(path.includes('/auth/session'))val.user={id:'TEST-OWNER',username:'Dono'};
 else if(path.includes('op=list'))val.rooms=[{code:window.__room.code,name:window.__room.name,visibility:'public',members:1,tables:window.__room.tables.length}];
 else if(path.includes('op=snapshot'))val={ok:true,room:window.__room,messages:[],game:null,serverTime:Date.now()};
 else if(opts.method==='POST'){
  const data=JSON.parse(opts.body||'{}');window.__posted.push(data);
  if(data.op==='action'&&data.action?.type==='table:create'){
   const a=data.action,settings=a.settings||{},bots=Number(a.bots||0);
   const table={id:'TB-'+Math.random().toString(36).slice(2,12),game:a.game,settings,ownerId:'TEST-OWNER',players:[{id:'TEST-OWNER',username:'Dono'},...Array.from({length:bots},(_,i)=>({id:'BOT-'+i,username:'BOT '+(i+1),bot:true,difficulty:a.botDifficulty}))],watchers:[],requests:[],status:'waiting'};
   window.__room.tables.push(table);val.table=table;
  }
  if(data.op==='action'&&data.action?.type==='table:start'){
   const t=window.__room.tables.find(t=>t.id===data.action.tableId);if(t)t.status='playing';
  }
 }
 return {ok:true,status:200,json:async()=>val};
};
'''
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1250,'height':950})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  html=(ROOT/'index.html').read_text()
  html=re.sub(r'<script[^>]+src=[^>]+></script>', '', html)
  html=re.sub(r'<link[^>]+hub/hub\.css[^>]+>', '', html)
  page.set_content(html)
  page.evaluate('(css)=>{const s=document.createElement("style");s.textContent=css;document.head.appendChild(s)}',(ROOT/'hub/hub.css').read_text())
  page.evaluate('() => {'+MOCK+'}')
  page.add_script_tag(content=(ROOT/'games/chess/chess-engine.js').read_text())
  datauri='data:text/javascript;base64,'+base64.b64encode((ROOT/'hub/classic-games.js').read_bytes()).decode('ascii')
  discoveruri='data:text/javascript;base64,'+base64.b64encode((ROOT/'hub/discover.js').read_bytes()).decode('ascii')
  hub=(ROOT/'hub/hub.js').read_text().replace("'./classic-games.js'",repr(datauri)).replace("'./discover.js'",repr(discoveruri))
  page.add_script_tag(content=hub,type='module')
  page.wait_for_timeout(200)
  page.locator('[data-enter="SALA-RC3BOT01"]').first.click();page.wait_for_timeout(150)
  assert page.locator('#new-bot-table').is_visible(),'BOT button not visible inside room'
  # Mesmo snapshots legados não devem renderizar mesas antigas de Sinuca.
  page.evaluate("window.__room.tables.push({id:'LEGACY-POOL',game:'pool',settings:{},players:[],watchers:[],requests:[],status:'finished',ownerId:'TEST-OWNER'})")
  page.wait_for_timeout(2150)
  assert page.locator('#tables-list .game-pool').count()==0,'Mesa antiga de Sinuca apareceu na interface'
  page.locator('#new-table').click()
  def field(name):return page.locator(f'#modal-fields [name="{name}"]')
  def visible(name):return field(name).is_visible()
  assert visible('clock') and visible('color') and not visible('aim') and not visible('seats') and not visible('botDifficulty')
  assert 'pool' not in field('game').locator('option').evaluate_all('(items)=>items.map(e=>e.value)'), 'Sinuca não deve aparecer'
  field('mode').select_option('bot')
  assert visible('botDifficulty') and not visible('botCount')
  field('botDifficulty').select_option('hard');field('clock').select_option('300')
  page.locator('#modal-ok').click();page.wait_for_timeout(180)
  posts=page.evaluate('window.__posted')
  create=[p['action'] for p in posts if p.get('op')=='action' and p.get('action',{}).get('type')=='table:create'][-1]
  assert create['game']=='chess' and create['bots']==1 and create['botDifficulty']=='hard',create
  assert create['settings']=={'clock':'300','color':'random','spectators':'open'},create
  assert any(p.get('action',{}).get('type')=='table:start' for p in posts),'BOT chess game not started automatically'
  # Dedicated BOT button inside online room.
  page.locator('#new-bot-table').click()
  assert field('mode').input_value()=='bot'
  field('game').select_option('truco');field('seats').select_option('4')
  assert visible('botCount') and visible('trucoTurnTimer') and not visible('clock')
  field('botCount').select_option('3');field('botDifficulty').select_option('easy');field('trucoTurnTimer').select_option('30')
  page.locator('#modal-ok').click();page.wait_for_timeout(180)
  posts=page.evaluate('window.__posted')
  create=[p['action'] for p in posts if p.get('op')=='action' and p.get('action',{}).get('type')=='table:create'][-1]
  assert create['game']=='truco' and create['bots']==3 and create['settings']=={'seats':'4','turnTimer':'30','spectators':'open'},create
  assert len([p for p in posts if p.get('action',{}).get('type')=='table:start'])==2,posts
  # Friend mode should never create bots.
  page.locator('#new-table').click();field('game').select_option('chess');page.locator('#modal-ok').click();page.wait_for_timeout(120)
  posts=page.evaluate('window.__posted')
  create=[p['action'] for p in posts if p.get('op')=='action' and p.get('action',{}).get('type')=='table:create'][-1]
  assert create['bots']==0 and create['game']=='chess',create
  assert not errors,errors
  print('✔ Chromium: game-specific settings, bot within room, Xadrez BOT, Truco 2x2 3 BOTs, friends-only mode, no JS errors')
  browser.close()
