"""Chromium integration smoke with a simulated API. Never accesses a real account."""
from pathlib import Path
import base64, re, runpy
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
MOCK=runpy.run_path(str(ROOT/'tests/v811-premium-browser.py'))['MOCK']
css=['hub/hub.css','hub/premium-gold.css','games/chess/chess.css','hub/classic-window.css','hub/upgrade-free.css','hub/universe-83.css','hub/social-admin-831.css']
DISCOVER="""
if(path.includes('/api/discover'))val={ok:true,steam:[{title:'Jogo com desconto verificado',discount:35,url:'https://store.steampowered.com/app/123/',source:'Steam',type:'offer'}],epic:[],news:[{title:'Notícia do TDB',url:'https://news.xbox.com/en-us/',source:'Xbox Wire',type:'news'}]}; else if(path.includes('/auth/session'))
"""
MOCK=MOCK.replace("if(path.includes('/auth/session'))",DISCOVER)
API_MOCK=r'''
window.__socialCalls=[]; window.__newUserName='Dono';
const baseFetch=window.fetch;
const socialResponse=(obj,ok=true)=>({ok,status:ok?200:400,json:async()=>obj});
window.fetch=async(url,opts={})=>{
  const path=String(url);const body=JSON.parse(opts.body||'{}');window.__socialCalls.push({path,body});
  if(path.startsWith('/api/profile/public'))return socialResponse({ok:true,user:{id:'TEST-OWNER',username:window.__newUserName,banner:null,avatarImage:null},stats:{chess:{played:4,wins:2,losses:1,draws:1},truco:{played:3,wins:1,losses:2}},recent:[{game:'chess',result_type:'win',winner_ids:['TEST-OWNER'],loser_ids:['U2'],finished_at:new Date().toISOString(),mode:'1v1'}]});
  if(path==='/api/profile/update'){window.__newUserName=body.username;return socialResponse({ok:true,user:{id:'TEST-OWNER',username:body.username,avatarImage:body.avatarImage,banner:body.banner}});}
  if(path==='/api/friends/list')return socialResponse({ok:true,friends:[{id:'U2',username:'Amigo123',status:'Online'}],incoming:[{sender_id:'U3',user:{id:'U3',username:'Amigo456'}}],outgoing:[],invites:[{id:24,room_code:'SALA-11223344',sender:{id:'U2',username:'Amigo123'}}]});
  if(path.includes('/api/users/search'))return socialResponse({ok:true,users:[{id:'U4',username:'Novato'}]});
  if(path==='/api/friends/add'||path==='/api/friends/remove'||path==='/api/friends/respond'||path==='/api/invites/send')return socialResponse({ok:true});
  if(path==='/api/invites/respond')return socialResponse({ok:true,accepted:body.accept,roomCode:'SALA-11223344'});
  if(path==='/api/admin/login')return socialResponse({ok:true,token:'secure-admin-test'});
  if(path==='/api/admin/session')return socialResponse({ok:true,admin:{username:'adm'}});
  if(path==='/api/admin/overview')return socialResponse({ok:true,overview:{users:5,onlineUsers:2,openRooms:3,activeMatches:1,banned:0,openReports:2,errors24h:0}});
  if(path==='/api/admin/users')return socialResponse({ok:true,users:[{id:'U4',username:'Novato',banned:false,presence_status:'offline'}]});
  if(path.startsWith('/api/admin/users?'))return socialResponse({ok:true,users:[{id:'U4',username:'Novato',banned:false,presence_status:'offline'}]});
  if(path==='/api/admin/reports')return socialResponse({ok:true,reports:[{id:2,status:'open',reason:'Spam'}]});
  if(path==='/api/admin/operations')return socialResponse({ok:true,operations:{rooms:[{code:'SALA-12345678',name:'Sala teste',status:'open',players:2}],maintenance:{enabled:false,message:'Volto já'}}});
  if(path.startsWith('/api/admin/logs'))return socialResponse({ok:true,logs:[]});
  if(path.startsWith('/api/admin/'))return socialResponse({ok:true});
  return baseFetch(url,opts);
};
'''
def test(width,height):
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  page.set_default_timeout(7000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  html=re.sub(r'<script[^>]+src=[^>]+></script>','',(ROOT/'index.html').read_text())
  html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
  page.set_content(html)
  for name in css:page.evaluate('(css)=>{const s=document.createElement("style");s.textContent=css;document.head.appendChild(s)}',(ROOT/name).read_text())
  # Inline only for fileless Chromium screenshots; the released site uses normal asset URLs.
  logo='data:image/png;base64,'+base64.b64encode((ROOT/'assets/logo-official.png').read_bytes()).decode()
  art='data:image/webp;base64,'+base64.b64encode((ROOT/'assets/universe-news-art.webp').read_bytes()).decode()
  page.evaluate('({logo,art})=>{document.querySelectorAll(".brand-mark img,.universe-brand-panel img,.universe-side-footer img,.universe-compact-footer img,.game-window-identity img").forEach(img=>img.src=logo);const hero=document.querySelector(".universe-hero-art");if(hero)hero.style.backgroundImage=`url(${art})`}',{'logo':logo,'art':art})
  page.evaluate('() => {'+MOCK+'}')
  page.evaluate("window.__room.code='SALA-ABC12345'")
  page.evaluate('() => {const store=new Map();Object.defineProperty(window,"sessionStorage",{configurable:true,value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}})}')
  page.evaluate('() => {'+API_MOCK+'}')
  page.add_script_tag(content=(ROOT/'games/chess/chess-engine.js').read_text())
  module=lambda path:'data:text/javascript;base64,'+base64.b64encode((ROOT/path).read_bytes()).decode()
  hub=(ROOT/'hub/hub.js').read_text().replace("'./classic-games.js'",repr(module('hub/classic-games.js'))).replace("'./discover.js'",repr(module('hub/discover.js')))
  page.add_script_tag(content=hub,type='module')
  page.add_script_tag(content=(ROOT/'hub/universe-83.js').read_text(),type='module')
  page.add_script_tag(content=(ROOT/'hub/social-admin-831.js').read_text(),type='module')
  page.wait_for_timeout(550)
  assert not page.locator('#nav-games').is_hidden()
  assert page.locator('#top-training').is_hidden(), 'duplicate training menu should remain hidden'
  assert page.get_by_text('Nuuvem',exact=True).count()>=1
  page.locator('#universe-profile').click();page.wait_for_timeout(160)
  assert page.locator('#profile-view').is_visible(),errors
  assert 'Dono' in page.locator('#profile-username').inner_text(),errors
  assert 'Vitórias' in page.locator('#profile-stats').inner_text()
  if width>700: page.screenshot(path='/mnt/data/TDB-8.3.1-PREVIA-PERFIL.png',full_page=True)
  page.locator('#profile-edit').click()
  assert page.locator('#profile-edit-dialog').is_visible()
  page.locator('#profile-edit-form [name=username]').fill('DonoPremium')
  page.locator('#profile-edit-form button[type=submit]').click();page.wait_for_timeout(150)
  assert page.locator('#profile-edit-dialog').is_hidden() and page.locator('#profile-username').inner_text()=='DonoPremium'

  page.locator('#nav-friends').click();page.wait_for_timeout(150)
  assert page.locator('#friends-view').is_visible(),errors
  assert page.locator('#friends-list').get_by_text('Amigo123').count()==1,errors
  if width>700: page.screenshot(path='/mnt/data/TDB-8.3.1-PREVIA-AMIGOS.png',full_page=True)
  page.locator('#friends-search-form input').fill('Nova');page.locator('#friends-search-form button').click();page.wait_for_timeout(90)
  assert page.locator('#friends-results').get_by_text('Novato').count()==1
  page.locator('#friends-results [data-social="add"]').click()
  assert page.evaluate("window.__socialCalls.some(x=>x.path==='/api/friends/add'&&x.body.friendId==='U4')")
  page.locator('#nav-admin').click();page.wait_for_timeout(150)
  assert page.locator('#admin-view').is_visible()
  page.locator('#admin-login-form [name=username]').fill('adm');page.locator('#admin-login-form [name=password]').fill('test-password')
  page.locator('#admin-login-form button').click();page.wait_for_timeout(160)
  assert page.locator('#admin-console').is_visible(),errors
  assert page.locator('#admin-content').get_by_text('Contas').count()==1
  if width>700: page.screenshot(path='/mnt/data/TDB-8.3.1-PREVIA-ADM.png',full_page=True)
  page.locator('[data-admin-tab="users"]').click();page.wait_for_timeout(160)
  assert page.locator('#admin-users-table').get_by_text('Novato').count()==1
  page.locator('[data-admin-tab="reports"]').click();page.wait_for_timeout(140)
  assert page.locator('#admin-content').get_by_text('Spam').count()==1
  page.locator('#nav-home').click();page.wait_for_timeout(80)
  assert page.locator('#home').is_visible() and page.locator('#profile-view').is_hidden()
  page.locator('#home-rooms [data-enter]').first.click();page.wait_for_timeout(220)
  assert page.locator('#room-view .social-rail .share-card').count()==1
  assert page.locator('#room-view .room-rail .share-card').count()==0
  if width>700: page.screenshot(path='/mnt/data/TDB-8.3.1-PREVIA-SALA.png',full_page=True)
  assert page.locator('#social-members-preview').is_hidden()
  page.locator('#universe-members-access').click();assert page.locator('#members-panel').is_visible()
  page.locator('#universe-room-invite').click();page.wait_for_timeout(170)
  assert page.locator('#friends-view').is_visible()
  assert page.locator('#friends-list [data-social="invite"]').count()==1
  page.locator('#friends-list [data-social="invite"]').click();page.wait_for_timeout(120)
  assert page.evaluate("window.__socialCalls.some(x=>x.path==='/api/invites/send'&&x.body.roomCode==='SALA-ABC12345')")
  viewport_width=page.evaluate('document.documentElement.scrollWidth')
  assert viewport_width<=width+5,(width,viewport_width)
  assert not errors,errors
  print('✔ 8.3.1 Chromium',width,'home, profile, friends/invite, admin, panels, no JS errors')
  browser.close()
if __name__=='__main__':
 test(1440,900)
 test(390,844)
