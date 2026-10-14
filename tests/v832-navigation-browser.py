"""Headless Chromium: navigation, admin isolation, profile, rooms and Nuuvem with simulated API."""
from pathlib import Path
import base64,re,runpy
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=runpy.run_path(str(ROOT/'tests/v811-premium-browser.py'))['MOCK']
API=runpy.run_path(str(ROOT/'tests/v831-social-admin-browser.py'))['API_MOCK']
CSS=['hub/hub.css','hub/premium-gold.css','games/chess/chess.css','hub/classic-window.css','hub/upgrade-free.css','hub/universe-83.css','hub/social-admin-831.css','hub/navigation-832.css']

def module(path):return 'data:text/javascript;base64,'+base64.b64encode((ROOT/path).read_bytes()).decode()

def load_ui(page):
 html=re.sub(r'<script[^>]+src=[^>]+></script>','',(ROOT/'index.html').read_text())
 html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
 page.set_content(html)
 for name in CSS:page.evaluate('(css)=>{const s=document.createElement("style");s.textContent=css;document.head.appendChild(s)}',(ROOT/name).read_text())
 page.evaluate('() => {'+BASE+'}')
 page.evaluate('() => {const m=new Map();Object.defineProperty(window,"sessionStorage",{configurable:true,value:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}})}')
 page.evaluate('() => {'+API+'}')
 # Caches /api/discover fixture, including Nuuvem price from verified source
 page.evaluate('() => {const prev=window.fetch;window.fetch=(url,opts)=>String(url)==="/api/discover"?Promise.resolve({ok:true,status:200,json:async()=>({ok:true,steam:[],epic:[],news:[],nuuvem:[{title:"Jogo em oferta",source:"Nuuvem",discount:50,price:"R$ 19,99",url:"https://www.nuuvem.com/br-pt/item/jogo-demo",type:"offer"}]})}):prev(url,opts)}')
 page.add_script_tag(content=(ROOT/'games/chess/chess-engine.js').read_text())
 hub=(ROOT/'hub/hub.js').read_text().replace("'./classic-games.js'",repr(module('hub/classic-games.js'))).replace("'./discover.js'",repr(module('hub/discover.js')))
 page.add_script_tag(content=hub,type='module')
 for m in ['hub/universe-83.js','hub/social-admin-831.js','hub/navigation-832.js']:
  page.add_script_tag(content=(ROOT/m).read_text(),type='module')
 page.wait_for_timeout(550)

def test_ui(width,height):
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=b.new_page(viewport={'width':width,'height':height})
  page.set_default_timeout(9000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  load_ui(page)
  assert page.locator('#home').is_visible(),errors
  assert page.locator('#nav-admin,#admin-view,#nav-history,.universe-side-footer,.sidebar-bottom').count()==0
  assert page.locator('#nav-home,#nav-room,#nav-games,#nav-music,#nav-friends,#nav-profile').count()==6
  assert 'Nome' not in page.locator('.sidebar').inner_text() and 'MAIS QUE JOGOS' not in page.locator('.sidebar').inner_text()
  assert page.get_by_text('Jogo em oferta',exact=True).count()>=1, 'Nuuvem offer should be in feed'
  page.locator('[data-discover-filter="nuuvem"]').click()
  assert page.locator('#discover-list .discover-card').count()>=1
  assert page.locator('#discover-list').get_by_text('R$ 19,99').count()==1
  page.locator('#nav-room').click();page.wait_for_timeout(180)
  assert page.locator('#rooms-view').is_visible(),errors
  assert page.locator('#rooms-mine').is_visible()
  page.locator('[data-rooms-tab="create"]').click()
  assert page.locator('#rooms-create').is_visible()
  page.locator('#rooms-create-action').click()
  assert page.locator('#modal-title').inner_text()=='Crie sua sala'
  page.locator('#modal-cancel').click()
  page.locator('[data-rooms-tab="explore"]').click();page.wait_for_timeout(100)
  assert page.locator('#rooms-explore').is_visible()
  assert page.locator('#rooms-explore-grid [data-enter]').count()>=1
  page.locator('#rooms-search').fill('sem correspondência');assert page.locator('#rooms-explore-grid [data-enter]').count()==0
  page.locator('#rooms-search').fill('Sala da');page.wait_for_timeout(50)
  assert page.locator('#rooms-explore-grid [data-enter]').count()>=1
  page.locator('#rooms-explore-grid [data-enter]').first.click();page.wait_for_timeout(170)
  assert page.locator('#room-view').is_visible()
  assert page.locator('#room-view .share-card').count()==1
  page.locator('#nav-room').click();page.wait_for_timeout(100)
  assert page.locator('#rooms-view').is_visible()
  page.locator('[data-rooms-tab="mine"]').click()
  assert 'SALA-' in page.locator('#rooms-current-code').inner_text()
  page.locator('#rooms-continue').click();page.wait_for_timeout(90)
  assert page.locator('#room-view').is_visible()
  page.locator('#nav-profile').click();page.wait_for_timeout(140)
  assert page.locator('#profile-view').is_visible()
  assert page.locator('#profile-recent').get_by_text('Xadrez').count()>=1
  assert page.locator('#profile-history').count()==0
  page.locator('#nav-friends').click();page.wait_for_timeout(130)
  assert page.locator('#friends-list').get_by_text('Amigo123').count()==1
  page.locator('#nav-games').click();assert page.locator('#modal-title').inner_text()=='Treinamento individual'
  page.locator('#modal-cancel').click()
  page.locator('#nav-home').click()
  # use official logo as shipped for screenshots
  logo='data:image/png;base64,'+base64.b64encode((ROOT/'assets/logo-official.png').read_bytes()).decode()
  page.evaluate('(v)=>document.querySelectorAll(".brand img,.universe-compact-footer img,.universe-brand-panel img").forEach(n=>n.src=v)',logo)
  if width==1440:
   page.wait_for_timeout(300);page.evaluate('document.getElementById("toast").classList.remove("visible")');page.screenshot(path='/mnt/data/TDB-8.3.2-PREVIA-HOME.png',full_page=True)
  page.locator('#nav-room').click()
  if width==1440:
   page.wait_for_timeout(340);page.evaluate('document.getElementById("toast").classList.remove("visible")');page.screenshot(path='/mnt/data/TDB-8.3.2-PREVIA-SALAS.png',full_page=True)
  # Mobile should not clip 6 navigational destinations horizontally inside body
  assert page.evaluate('document.documentElement.scrollWidth')<=width+5,(width,page.evaluate('document.documentElement.scrollWidth'))
  assert not errors,errors
  print('✔ UI',width,'navigation, rooms, Nuuvem, profile, friends, games, no JS errors')
  b.close()

def test_admin():
 with sync_playwright() as p:
  b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=b.new_page(viewport={'width':1360,'height':860});page.set_default_timeout(8000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  html=re.sub(r'<script[^>]+src=[^>]+></script>','',(ROOT/'adm/index.html').read_text())
  html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
  page.set_content(html)
  for f in ['hub/hub.css','hub/premium-gold.css','hub/universe-83.css','hub/social-admin-831.css','hub/adm-standalone.css']:
   page.evaluate('(css)=>{const e=document.createElement("style");e.textContent=css;document.head.append(e)}',(ROOT/f).read_text())
  page.evaluate('() => {const m=new Map();Object.defineProperty(window,"sessionStorage",{configurable:true,value:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}})}')
  page.evaluate('() => {'+API+'}')
  page.add_script_tag(content=(ROOT/'hub/adm-standalone.js').read_text(),type='module')
  page.wait_for_timeout(100)
  assert page.locator('#admin-login-panel').is_visible()
  assert page.locator('#admin-console').is_hidden()
  assert page.locator('#auth-form,#nav-home,#shell').count()==0
  page.locator('[name="username"]').fill('admin-test');page.locator('[name="password"]').fill('password-test')
  page.locator('#admin-login-form button[type="submit"]').click();page.wait_for_timeout(130)
  assert page.locator('#admin-console').is_visible(),errors
  assert page.locator('#admin-content').get_by_text('Contas').count()==1
  page.wait_for_timeout(340);page.screenshot(path='/mnt/data/TDB-8.3.2-PREVIA-ADM.png',full_page=True)
  page.locator('[data-admin-tab="users"]').click();page.wait_for_timeout(130)
  assert page.locator('#admin-users-table').get_by_text('Novato').count()==1
  page.locator('[data-admin-tab="reports"]').click();page.wait_for_timeout(130)
  assert page.locator('#admin-content').get_by_text('Spam').count()==1
  page.locator('#admin-logout').click();page.wait_for_timeout(120)
  assert page.locator('#admin-login-panel').is_visible() and page.locator('#admin-console').is_hidden()
  assert not errors,errors
  print('✔ /adm isolated login, users, reports, logout')
  b.close()
if __name__=='__main__':
 test_ui(1440,900)
 test_ui(390,844)
 test_admin()
