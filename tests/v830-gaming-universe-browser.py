"""TDB 8.3 smoke test: no public services or real Supabase involved."""
from pathlib import Path
import base64,re,runpy
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
MOCK=runpy.run_path(str(ROOT/'tests/v811-premium-browser.py'))['MOCK']
MOCK=MOCK.replace("if(path.includes('/auth/session'))", "if(path.includes('/api/discover'))val={ok:true,steam:[{title:'Jogo com desconto verificado',discount:35,url:'https://store.steampowered.com/app/123/',source:'Steam',type:'offer'}],epic:[{title:'Jogo gratuito',url:'https://store.epicgames.com/pt-BR/p/game',source:'Epic Games',type:'free'}],news:[{title:'Notícia de teste v8.3',url:'https://news.xbox.com/en-us/',source:'Xbox Wire',type:'news'}]}; else if(path.includes('/auth/session'))")
css=['hub/hub.css','hub/premium-gold.css','games/chess/chess.css','hub/classic-window.css','hub/upgrade-free.css','hub/universe-83.css']
def test(width,height,shots=False):
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
  page.set_default_timeout(8500)
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  html=re.sub(r'<script[^>]+src=[^>]+></script>','',(ROOT/'index.html').read_text())
  html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
  page.set_content(html)
  for filepath in css:
   page.evaluate('(css)=>{const s=document.createElement("style");s.textContent=css;document.head.appendChild(s)}',(ROOT/filepath).read_text())
  bg_data='data:image/webp;base64,'+base64.b64encode((ROOT/'assets/universe-news-art.webp').read_bytes()).decode()
  logo_data='data:image/png;base64,'+base64.b64encode((ROOT/'assets/logo-official.png').read_bytes()).decode()
  page.evaluate("({bg,logo})=>{document.querySelectorAll('.brand-mark img,.universe-brand-panel img,.universe-side-footer img,.universe-compact-footer img,.game-window-identity img').forEach(img=>img.src=logo);document.querySelector('.universe-hero-art').style.backgroundImage=`url(${bg})`}",{'bg':bg_data,'logo':logo_data})
  page.evaluate('() => {'+MOCK+'}')
  page.evaluate('localStorage.setItem("tdb_hub_last_room","SALA-PREMIUM01")')
  page.add_script_tag(content=(ROOT/'games/chess/chess-engine.js').read_text())
  classics='data:text/javascript;base64,'+base64.b64encode((ROOT/'hub/classic-games.js').read_bytes()).decode()
  discover='data:text/javascript;base64,'+base64.b64encode((ROOT/'hub/discover.js').read_bytes()).decode()
  hub=(ROOT/'hub/hub.js').read_text().replace("'./classic-games.js'",repr(classics)).replace("'./discover.js'",repr(discover))
  page.add_script_tag(content=hub,type='module')
  page.add_script_tag(content=(ROOT/'hub/universe-83.js').read_text(),type='module')
  page.wait_for_timeout(550)
  assert page.locator('#home').is_visible(),errors
  assert page.locator('#where').inner_text()=='Notícias'
  assert page.locator('#universe-resume-room').is_visible()
  assert page.locator('#universe-feature-title').inner_text()=='Notícia de teste v8.3',errors
  assert page.locator('#universe-feature-link').get_attribute('href')=='https://news.xbox.com/en-us/'
  assert page.locator('#universe-room-preview .universe-room-item').count()==1
  assert page.locator('#discover-list .discover-card').count()>=4
  width_actual=page.evaluate('document.documentElement.scrollWidth')
  if width_actual>width+2:
   off=page.evaluate('''() => [...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+2).slice(0,10).map(el=>({tag:el.tagName,id:el.id,cls:el.className?.baseVal||el.className,x:Math.round(el.getBoundingClientRect().x),w:Math.round(el.getBoundingClientRect().width)}))''')
   raise AssertionError(f'Home overflow width={width} scroll={width_actual}: {off}')
  if shots:page.screenshot(path='/mnt/data/TDB-8.3.0-PREVIA-HOME-REAL.png' if width>700 else '/mnt/data/TDB-8.3.0-PREVIA-HOME-MOBILE.png',full_page=True)
  page.locator('#universe-search-trigger').click()
  assert page.locator('#universe-command').is_visible()
  page.locator('#universe-command-input').fill('biblioteca')
  assert page.locator('#universe-command-results .universe-command-option').count()>=1
  page.keyboard.press('Escape')
  assert not page.locator('#universe-command').is_visible()
  page.locator('#universe-profile').click()
  assert page.locator('#universe-account-name').inner_text()=='Dono'
  page.locator('#universe-account-close').click()
  # Search also indexes verified external headlines, not just navigation shortcuts.
  page.keyboard.press('Control+k')
  page.locator('#universe-command-input').fill('Notícia de teste v8.3')
  assert page.locator('#universe-command-results .universe-command-option').count()==1
  assert page.locator('#universe-command-results .is-active').count()==1
  page.keyboard.press('Escape')
  page.keyboard.press('Control+k')
  page.locator('#universe-command-input').fill('sala')
  page.keyboard.press('ArrowDown')
  assert page.locator('#universe-command-results .is-active').count()==1
  page.keyboard.press('Escape')
  page.locator('[data-universe-filter="epic"]').click()
  assert page.locator('[data-discover-filter="epic"]').get_attribute('aria-pressed')=='true'
  assert page.locator('#discover-list').get_by_text('Jogo gratuito').count()==1
  page.locator('#universe-room-preview [data-universe-enter]').first.click()
  page.wait_for_timeout(260)
  assert page.locator('#room-view').is_visible(),errors
  assert page.locator('#room-delete').is_visible()
  assert page.locator('#room-name').inner_text()=='Sala da Galera'
  assert page.locator('#universe-room-guide').is_visible()
  page.locator('#universe-guide-bot').click()
  assert page.locator('#modal-title').inner_text()=='Nova mesa na sala'
  page.locator('#modal-cancel').click()
  page.locator('#nav-home').click()
  assert page.locator('#home').is_visible()
  assert page.locator('#universe-resume-room').is_visible()
  page.locator('#universe-resume-room').click()
  page.wait_for_timeout(150)
  assert page.locator('#room-view').is_visible()
  room_width=page.evaluate('document.documentElement.scrollWidth')
  if room_width>width+2:raise AssertionError(f'Room overflow width={width} scroll={room_width}')
  if shots:page.screenshot(path='/mnt/data/TDB-8.3.0-PREVIA-SALA-REAL.png' if width>700 else '/mnt/data/TDB-8.3.0-PREVIA-SALA-MOBILE.png',full_page=True)
  page.locator('#universe-room-chat').click();assert page.locator('#chat-panel').is_visible()
  page.locator('#universe-room-people').click();assert page.locator('#members-panel').is_visible()
  page.locator('#universe-room-tables').click();assert page.locator('#tables-panel').is_visible()
  page.locator('#new-bot-table').click()
  assert page.locator('#modal-title').inner_text()=='Nova mesa na sala'
  page.locator('#modal-cancel').click()
  page.locator('#room-settings').click();assert page.locator('#modal').is_visible()
  page.locator('#modal-cancel').click()
  page.locator('#nav-home').click();assert page.locator('#home').is_visible()
  page.locator('#universe-resume-room').click();page.wait_for_timeout(140)
  assert page.locator('#room-view').is_visible(),'Retomar sala não funcionou'
  assert not errors, errors
  print('✔ TDB 8.3 browser',width,'news-first, links, live rooms, search, account, modal, game buttons, no overflow')
  browser.close()
if __name__=='__main__':
 test(1440,900,True)
 test(390,844,True)
