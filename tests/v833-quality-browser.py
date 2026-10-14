"""TDB 8.3.3: biblioteca reorganizada e visual do Truco/Seis.
Chromium com API simulada. Não valida Vercel/Supabase externos.
"""
import ast, base64, json, re, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OLD=ROOT/'tests/v812-classics-browser.py'
tree=ast.parse(OLD.read_text())
MOCK=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='MOCK' for x in n.targets))
MOCK=MOCK.replace("if(path.includes('/auth/session'))",'''if(path.includes('/api/platform/music-profile')){
   const profile={favorites:[{videoId:'x1',title:'Música favorita'}],presets:[window.__pl],history:[{videoId:'x2',title:'Música antiga',playedAt:Date.now()-3600000}]};
   if(opts.method==='POST'){
     const a=JSON.parse(opts.body||'{}').action||{};
     if(a.type==='MOVE_PRESET_TRACK'){const item=window.__pl.tracks.splice(a.from,1)[0];window.__pl.tracks.splice(a.to,0,item)}
     if(a.type==='RENAME_PRESET')window.__pl.name=a.name;
     if(a.type==='REMOVE_PRESET_TRACK')window.__pl.tracks.splice(a.index,1);
     val={presets:[window.__pl],favorites:profile.favorites,history:profile.history};
   }else val={profile};
 }
 else if(path.includes('/auth/session'))''')
MOCK=MOCK.replace('window.confirm=()=>true;',"window.__pl={id:'PL1',name:'Noite TDB',tracks:[{videoId:'a1',title:'Faixa A'},{videoId:'b2',title:'Faixa B'}]};window.confirm=()=>true;")
fixture_js='''import * as T from '../server/truco-engine.js';
const players=[{id:'TEST-OWNER',username:'Dono'},{id:'BOT1',username:'BOT Fácil',bot:true},{id:'BOT2',username:'BOT Médio',bot:true},{id:'BOT3',username:'BOT Difícil',bot:true}];
let g=T.createState({code:'GAME1',trucoSeats:4,players,turnTimer:0});
g.current=0;g.hands[0]=[{rank:'4',suit:'clubs'}];g.hands[1]=[{rank:'5',suit:'clubs'}];g.hands[2]=[{rank:'3',suit:'clubs'}];g.hands[3]=[{rank:'A',suit:'clubs'}];g.manilhaRank='6';g.vira={rank:'5',suit:'hearts'};
let trick=g;for(let i=0;i<4;i++)trick=T.applyTrucoAction(trick,i,{type:'PLAY_CARD',cardIdx:0});
let won=T.tick(trick,Number(trick.trickResolveAt)+50);
let raise=T.applyTrucoAction(g,0,{type:'REQUEST_RAISE'});
let six=structuredClone(g);six.handValue=3;six=T.applyTrucoAction(six,0,{type:'REQUEST_RAISE'});
console.log(JSON.stringify({trick:T.viewFor(trick,'TEST-OWNER'),won:T.viewFor(won,'TEST-OWNER'),raise:T.viewFor(raise,'TEST-OWNER'),six:T.viewFor(six,'TEST-OWNER')}));
'''
script=ROOT/'tests/_fixture_833.mjs'
script.write_text(fixture_js)
try:
    fixture=json.loads(subprocess.check_output(['node',str(script)],cwd=ROOT,text=True))
finally:script.unlink(missing_ok=True)
assert fixture['trick']['pendingTrick']['winnerSeat']==2,fixture['trick']['pendingTrick']
assert fixture['trick']['trickResolveAt']-fixture['trick']['pendingTrick'].get('at',fixture['trick']['trickResolveAt']-1250)>=0
assert fixture['won']['lastTrickSummary']['result']==0
fixture['won']['lastTrickSummary']['expiresAt']=int(time.time()*1000)+90000 # manter o resumo presente durante a inspeção visual com API simulada

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1365,'height':850})
    page.set_default_timeout(7000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<script[^>]+src=[^>]+></script>','',html)
    html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
    page.set_content(html)
    for path in ['hub/hub.css','hub/premium-gold.css','games/chess/chess.css','hub/classic-window.css','hub/upgrade-free.css','hub/universe-83.css','hub/social-admin-831.css','hub/navigation-832.css','hub/quality-833.css']:
        page.evaluate('(css)=>{let s=document.createElement("style");s.textContent=css;document.head.append(s)}',(ROOT/path).read_text())
    page.evaluate('() => {'+MOCK+'}')
    page.add_script_tag(content=(ROOT/'games/chess/chess-engine.js').read_text())
    url=lambda path:'data:text/javascript;base64,'+base64.b64encode((ROOT/path).read_bytes()).decode()
    classics=url('hub/classic-games.js'); discover=url('hub/discover.js')
    hub=(ROOT/'hub/hub.js').read_text().replace("'./classic-games.js'",repr(classics)).replace("'./discover.js'",repr(discover))
    page.add_script_tag(content=hub,type='module')
    page.add_script_tag(content=(ROOT/'hub/universe-83.js').read_text(),type='module')
    page.wait_for_timeout(450)
    assert page.locator('#home').is_visible(),errors
    page.locator('#home-library').click();page.wait_for_timeout(80)
    assert page.locator('#library-dialog').is_visible(),errors
    assert page.locator('.library-nav .library-switch').count()==3
    assert page.get_by_text('Noite TDB',exact=True).is_visible()
    assert page.locator('.library-playlist-tracks').count()==0,'Playlist should start collapsed'
    page.locator('[data-library="expand"]').first.click()
    assert page.locator('.library-playlist-tracks').count()==1
    assert page.get_by_text('Faixa A').is_visible()
    page.locator('[data-library="move"][data-from="1"]').first.click();page.wait_for_timeout(80)
    assert page.evaluate('window.__pl.tracks[0].title')=='Faixa B'
    page.locator('#library-dialog').screenshot(path=str(ROOT/'tests/preview-library-playlists-833.png'))
    page.locator('[data-library="tab"][data-tab="favorites"]').click()
    assert page.locator('.library-song b').get_by_text('Música favorita',exact=True).is_visible()
    assert page.locator('.library-playlist').count()==0
    page.locator('[data-library="tab"][data-tab="history"]').click()
    assert page.get_by_text('Música antiga',exact=True).is_visible()
    page.locator('#library-close').click()
    page.locator('#home-rooms [data-enter="SALA-ORIGINAL"]').click();page.wait_for_timeout(130)
    assert page.locator('#room-view').is_visible()
    assert page.locator('.room-quickbar').count()==0,'Old quickbar must be removed'
    assert page.locator('.room-rail').is_visible() and page.locator('.social-rail').is_visible()
    # Visual preview from pure, official engine states.
    page.evaluate('window.__f833='+json.dumps(fixture))
    out=page.evaluate('''async(url)=>{
      const {renderClassicTruco}=await import(url);
      const f=window.__f833;
      const render=x=>renderClassicTruco(x,{userId:'TEST-OWNER'});
      return {trick:render(f.trick),won:render(f.won),raise:render(f.raise),six:render(f.six)};
    }''',classics)
    assert 'round-winner-card' in out['trick']
    assert 'NOSSA DUPLA VENCEU A RODADA' in out['trick']
    assert 'NOSSA DUPLA VENCEU A RODADA' in out['won'], (fixture['won'].get('lastTrickSummary'),out['won'][:1000])
    assert 'TRUCO!' in out['raise'] and 'PEDIDO DE AUMENTO' in out['raise']
    assert 'SEIS!' in out['six'] and 'PEDIDO DE AUMENTO' in out['six']
    assert 'class="truco-card' in out['trick']
    page.locator('#game-window-body').evaluate('(el,html)=>el.innerHTML=html',out['trick'])
    page.locator('#game-window').evaluate('(el)=>el.classList.remove("hidden")')
    assert page.locator('#game-window .round-winner-card').count()==1
    assert page.locator('#game-window .classic-truco-round-flash').is_visible()
    page.evaluate('(logo)=>document.querySelectorAll(`img[src="assets/logo-official.png"]`).forEach(el=>el.src=logo)','data:image/png;base64,'+base64.b64encode((ROOT/'assets/logo-official.png').read_bytes()).decode())
    page.wait_for_timeout(350)
    page.screenshot(path=str(ROOT/'tests/preview-truco-winner-833.png'))
    page.locator('#game-window-body').evaluate('(el,html)=>el.innerHTML=html',out['six'])
    assert page.locator('#game-window .classic-truco-raise-notice').is_visible()
    page.wait_for_timeout(350)
    page.screenshot(path=str(ROOT/'tests/preview-truco-seis-833.png'))
    page.locator('#game-window').evaluate('(el)=>el.classList.add("hidden")')
    page.locator('#home-library').evaluate('(el)=>el.click()');page.wait_for_timeout(100)
    page.locator('#library-dialog').screenshot(path=str(ROOT/'tests/preview-library-833.png'))
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(80)
    assert page.locator('#library-dialog').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth')<=392,'Mobile layout overflow'
    assert not errors,errors
    print('✔ TDB 8.3.3 Chromium: biblioteca em abas, playlist recolhível, favoritos, histórico, remover quickbar, Truco carta dourada, aviso Seis/Truco, layout mobile, sem erros JS')
    browser.close()
