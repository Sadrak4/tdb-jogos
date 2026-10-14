"""TDB 8.1.1 visual smoke test with an isolated, local API mock.
No request is made to a user's real database or site.
"""
from pathlib import Path
import base64
from playwright.sync_api import sync_playwright
import re
ROOT = Path(__file__).resolve().parents[1]
MOCK = r'''
const store = new Map([['tdb_session_token','visual-test-token']]);
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
window.confirm=()=>true;window.__posted=[];window.__messages=[{id:'m1',username:'Amigo123',user_id:'U2',message:'Bora jogar Truco?',created_at:new Date().toISOString()},{id:'m2',username:'Dono',user_id:'TEST-OWNER',message:'Partiu! Coloca uma música aí.',created_at:new Date().toISOString()}];
window.__room={code:'SALA-PREMIUM01',name:'Sala da Galera',visibility:'public',ownerId:'TEST-OWNER',members:[{id:'TEST-OWNER',username:'Dono',lastSeen:Date.now()},{id:'U2',username:'Amigo123',lastSeen:Date.now()},{id:'U3',username:'Amigo456',lastSeen:Date.now()}],screens:[],tables:[],music:{queue:[{id:'M1',videoId:'n45',title:'Música da Galera'}],index:0,playing:false,position:0,startedAt:null,revision:0},permissions:{tables:'everyone',music:{add:'everyone',play:'everyone',remove:'owner',next:'owner',voteSkip:true}}};
window.fetch=async(url,opts={})=>{
 const path=String(url);let val={ok:true};
 if(path.includes('/auth/session'))val.user={id:'TEST-OWNER',username:'Dono'};
 else if(path.includes('op=list'))val.rooms=[{code:window.__room.code,name:window.__room.name,visibility:'public',members:window.__room.members.length,tables:window.__room.tables.length}];
 else if(path.includes('op=snapshot'))val={ok:true,room:window.__room,messages:window.__messages,game:null,serverTime:Date.now()};
 else if(opts.method==='POST'){
   const d=JSON.parse(opts.body||'{}');window.__posted.push(d);
   if(d.op==='action'&&d.action?.type==='message')window.__messages.push({username:'Dono',user_id:'TEST-OWNER',message:d.action.message,created_at:new Date().toISOString()});
   if(d.op==='action'&&d.action?.type==='table:create'){
     const a=d.action,bots=Number(a.bots||0);
     const table={id:'TB-'+Math.random().toString(36).slice(2,9),game:a.game,settings:a.settings||{},ownerId:'TEST-OWNER',players:[{id:'TEST-OWNER',username:'Dono'},...Array.from({length:bots},(_,i)=>({id:'BOT-'+i,username:'BOT '+(i+1),bot:true}))],watchers:[],requests:[],status:'waiting'};
     window.__room.tables.push(table);val.table=table;
   }
   if(d.op==='action'&&d.action?.type==='table:start'){
     const t=window.__room.tables.find(t=>t.id===d.action.tableId);if(t)t.status='playing';
   }
 }
 return {ok:true,status:200,json:async()=>val};
};
'''
def run(width,height,home_shot=None,room_shot=None):
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  page.set_default_timeout(6000)
  print("browser",width,flush=True)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  html=(ROOT/'index.html').read_text()
  html=re.sub(r'<script[^>]+src=[^>]+></script>','',html)
  html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>', '', html)
  page.set_content(html,wait_until="domcontentloaded")
  
  page.evaluate('(css)=>{const s=document.createElement("style");s.textContent=css;document.head.appendChild(s)}',(ROOT/'hub/hub.css').read_text())
  
  page.evaluate('(css)=>{const s=document.createElement("style");s.textContent=css;document.head.appendChild(s)}',(ROOT/'hub/premium-gold.css').read_text())
  page.evaluate('() => {'+MOCK+'}')
  page.add_script_tag(content=(ROOT/'games/chess/chess-engine.js').read_text())
  datauri='data:text/javascript;base64,'+base64.b64encode((ROOT/'hub/classic-games.js').read_bytes()).decode('ascii')
  hub=(ROOT/'hub/hub.js').read_text().replace("'./classic-games.js'",repr(datauri))
  page.add_script_tag(content=hub,type='module')
  
  page.wait_for_timeout(220)
  assert page.locator('#home').is_visible()
  home_scroll_width=page.evaluate('document.documentElement.scrollWidth')
  assert home_scroll_width<=width+2,f'Home horizontal overflow: {home_scroll_width}>{width}'
  assert page.locator('#home-room-count').inner_text()=='01'
  assert page.locator('#home-people-count').inner_text()=='03'
  assert page.locator('img[src="assets/logo-official.png"]').count()>=2
  # Screenshots use the exact logo shipped with the package, not a replacement.
  logo_data='data:image/png;base64,'+base64.b64encode((ROOT/'assets/logo-official.png').read_bytes()).decode('ascii')
  page.evaluate("(url)=>document.querySelectorAll('img[src=\"assets/logo-official.png\"]').forEach(img=>img.src=url)",logo_data)
  
  if home_shot:page.screenshot(path=str(home_shot),full_page=True)
  # Verify working home quick action, not a decorative control.
  page.locator('#home-training').click()
  assert page.locator('#modal-title').inner_text()=='Treinamento individual'
  page.locator('#modal-cancel').click()
  page.locator('#home-join').click()
  assert page.locator('#modal-title').inner_text()=='Entrar com código'
  page.locator('#modal-cancel').click()
  page.locator('#home-rooms [data-enter="SALA-PREMIUM01"]').click()
  page.wait_for_timeout(170)
  assert page.locator('#room-view').is_visible()
  room_scroll_width=page.evaluate('document.documentElement.scrollWidth')
  assert room_scroll_width<=width+2,f'Room horizontal overflow: {room_scroll_width}>{width}'
  assert page.locator('#room-delete').is_visible(),'Room owner controls must remain visible'
  assert page.locator('#dock-now').inner_text()=='Música da Galera'
  assert page.locator('#social-members-preview .social-person').count()==3
  assert page.locator('#social-chat-preview .social-mini-message').count()==2
  
  if room_shot:
   page.wait_for_timeout(4150) # hide ephemeral toast in screenshot
   page.screenshot(path=str(room_shot),full_page=True)
  page.locator('#social-chat-input').fill('Teste no chat lateral')
  page.locator('#social-chat-form button').click()
  page.wait_for_timeout(125)
  assert any(o.get('action',{}).get('type')=='message' and o.get('action',{}).get('message')=='Teste no chat lateral' for o in page.evaluate('window.__posted'))
  # Media dock control is connected to RC3 music control.
  page.locator('#dock-play').click()
  page.wait_for_timeout(80)
  assert any(o.get('action',{}).get('type')=='music' and o.get('action',{}).get('action',{}).get('type')=='play' for o in page.evaluate('window.__posted'))
  # Core RC3 game-specific modal still works.
  page.locator('#new-bot-table').click()
  assert page.locator('#modal-fields [name="mode"]').input_value()=='bot'
  page.locator('#modal-fields [name="game"]').select_option('truco')
  assert page.locator('#modal-fields [name="seats"]').is_visible()
  assert page.locator('#modal-fields [name="trucoTurnTimer"]').is_visible()
  assert not page.locator('#modal-fields [name="clock"]').is_visible()
  page.locator('#modal-cancel').click()
  # Owner controls must be clickable; this was the user's main RC1 regression.
  page.locator('#room-settings').click()
  assert page.locator('#modal-title').inner_text()=='Permissões da sala'
  page.locator('#modal-cancel').click()
  page.locator('#social-members-open').click()
  assert page.locator('#members-list .member-card').count()==3
  page.locator('[data-tab="tables"]').click()
  page.locator('#room-delete').click()
  page.wait_for_timeout(120)
  assert any(o.get('action',{}).get('type')=='room:delete' for o in page.evaluate('window.__posted'))
  assert page.locator('#home').is_visible()
  assert not errors,errors
  print(f'✔ Browser {width}×{height}: home, brand, quick actions, room, social chat, music dock, game modal, no JS errors')
  browser.close()
if __name__=='__main__':
 run(1680,1020,Path('/mnt/data/TDB-8.1.1-PREVIA-HOME.png'),Path('/mnt/data/TDB-8.1.1-PREVIA-SALA.png'))
 run(390,844)
