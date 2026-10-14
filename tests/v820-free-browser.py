"""Browser test for TDB 8.2, using public-feed and personal library mocks."""
from pathlib import Path
import base64,re,runpy
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
mock=runpy.run_path(str(ROOT/'tests/v811-premium-browser.py'))['MOCK']
mock=mock.replace("if(path.includes('/auth/session'))",'''if(path.includes('/api/discover'))val={ok:true,steam:[{title:'Promoção comprovada',discount:65,url:'https://store.steampowered.com/app/123/',source:'Steam',type:'offer'}],epic:[{title:'Jogo grátis',url:'https://store.epicgames.com/pt-BR/p/game',source:'Epic Games',type:'free'}],news:[{title:'Novidade Xbox',url:'https://news.xbox.com/en-us/a',source:'Xbox Wire',type:'news'}]};
 else if(path.includes('/api/platform/music-profile')){
   if(opts.method==='POST'){
     const action=JSON.parse(opts.body||'{}').action||{};window.__posted.push({musicProfile:action});
     if(action.type==='RENAME_PRESET')window.__playlist.name=action.name;
     if(action.type==='MOVE_PRESET_TRACK'){
       const [track]=window.__playlist.tracks.splice(action.from,1);window.__playlist.tracks.splice(action.to,0,track);
     }
     val={presets:[window.__playlist]};
   }else val={profile:{favorites:[{videoId:'dQw4w9WgXcQ',title:'Música favorita'}],presets:[window.__playlist],history:[{videoId:'jNQXAC9IVRw',title:'Tocou ontem',playedAt:Date.now()-86400000}]}};
 }
 else if(path.includes('/auth/session'))''')
mock=mock.replace("window.confirm=()=>true;", "window.__playlist={id:'PL1',name:'Playlist Salva',tracks:[{videoId:'dQw4w9WgXcQ',title:'Faixa A'},{videoId:'jNQXAC9IVRw',title:'Faixa B'}]};window.confirm=()=>true;window.prompt=()=> 'Playlist Nova';")
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1440,'height':900})
    page.set_default_timeout(9000);errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
    html=re.sub(r'<script[^>]+src=[^>]+></script>','',(ROOT/'index.html').read_text())
    html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
    page.set_content(html)
    for css in ['hub/hub.css','hub/premium-gold.css','hub/upgrade-free.css','games/chess/chess.css','hub/classic-window.css','hub/upgrade-free.css','hub/universe-83.css','hub/quality-833.css']:
        page.evaluate('(css)=>{const s=document.createElement("style");s.textContent=css;document.head.appendChild(s)}',(ROOT/css).read_text())
    page.evaluate('() => {'+mock+'}')
    page.add_script_tag(content=(ROOT/'games/chess/chess-engine.js').read_text())
    classics='data:text/javascript;base64,'+base64.b64encode((ROOT/'hub/classic-games.js').read_bytes()).decode('ascii')
    discover='data:text/javascript;base64,'+base64.b64encode((ROOT/'hub/discover.js').read_bytes()).decode('ascii')
    hub=(ROOT/'hub/hub.js').read_text().replace("'./classic-games.js'",repr(classics)).replace("'./discover.js'",repr(discover)).replace('login();', 'window.__musicTest={S,syncMusic};login();')
    page.add_script_tag(content=hub,type='module')
    page.add_script_tag(content=(ROOT/'hub/universe-83.js').read_text(),type='module')
    page.wait_for_timeout(450)
    assert page.locator('#discover-list .discover-card').count()>=4,errors
    assert page.locator('#discover-list').get_by_text('Promoção comprovada').count()==1
    page.locator('#discover-section').screenshot(path='/mnt/data/TDB-8.2.0-PREVIA-GAMING-HUB.png')
    page.locator('[data-discover-filter="epic"]').click()
    assert page.locator('#discover-list').get_by_text('Jogo grátis').count()==1
    assert page.locator('#discover-list').get_by_text('Promoção comprovada').count()==0
    page.locator('#home-library').click()
    page.wait_for_timeout(100)
    assert page.locator('#library-dialog').is_visible(),errors
    assert page.locator('.library-nav .library-switch').count()==3
    assert page.locator('.library-playlist').count()==1
    assert page.locator('.library-playlist-tracks').count()==0
    page.locator('[data-library="tab"][data-tab="history"]').click()
    assert page.locator('#library-data').get_by_text('Tocou ontem').count()==1
    page.locator('[data-library="tab"][data-tab="favorites"]').click()
    assert page.locator('#library-data').get_by_text('Música favorita').count()>=1
    page.locator('[data-library="tab"][data-tab="playlists"]').click()
    page.locator('[data-library="expand"]').first.click()
    page.locator('#library-search').fill('Faixa B')
    assert page.locator('#library-data').get_by_text('Faixa B').count()==1
    assert page.locator('#library-data').get_by_text('Faixa A').count()==0
    page.locator('#library-search').fill('')
    page.locator('[data-library="rename"]').first.click()
    assert page.locator('#modal-title').inner_text()=='Renomear playlist'
    page.locator('#modal-fields [name="name"]').fill('Playlist Nova')
    page.locator('#modal-ok').click()
    page.wait_for_timeout(120)
    assert page.locator('#library-data').get_by_text('Playlist Nova').count()==1
    page.locator('[data-library="move"][data-from="1"][data-to="0"]').first.click()
    page.wait_for_timeout(120)
    assert page.evaluate('window.__playlist.tracks[0].title')=='Faixa B'
    page.locator('#library-close').click()
    page.locator('#home-rooms [data-enter="SALA-PREMIUM01"]').click();page.wait_for_timeout(150)
    assert page.locator('#room-view').is_visible()
    assert page.locator('.room-quickbar').count()==0
    assert page.locator('.social-rail').is_visible()
    assert page.locator('.room-rail').is_visible()
    assert page.locator('#room-invite-friends').is_visible(),'Convites continuam disponíveis na sala'
    page.evaluate('window.__musicTest.S.snapshot.room.music.playing=true')
    assert page.locator('.room-rail').is_visible(),'Player ativo não pode desaparecer'
    page.evaluate('window.__musicTest.S.snapshot.room.music.playing=false')
    # A correção só acontece após desvio prolongado, sem ciclar play/pause/seek.
    mtest=page.evaluate('''() => {
      const {S,syncMusic}=window.__musicTest;
      const track={videoId:'dQw4w9WgXcQ',title:'Teste de sincronização'};
      S.snapshot.room.music={queue:[track],index:0,revision:43,playing:true,position:0,startedAt:Date.now()-100000};
      S.trackKey=track.videoId;S.audioArmed=true;S.youtubeReady=true;
      S.musicIntent=track.videoId+':play';S.musicLastIntentAt=Date.now();
      S.musicTrackChangedAt=Date.now()-60000;S.musicLastSeekAt=Date.now()-60000;S.musicDriftSince=Date.now()-14000;
      const counters={seek:0,pause:0,play:0};
      S.yt={getPlayerState:()=>1,getCurrentTime:()=>0,seekTo:()=>counters.seek++,pauseVideo:()=>counters.pause++,playVideo:()=>counters.play++};
      for(let i=0;i<10;i++)syncMusic(S.snapshot.room.music);
      return counters;
    }''')
    assert mtest['seek']==1 and mtest['pause']==0 and mtest['play']==0,mtest
    first=page.evaluate('''() => {
      const {S,syncMusic}=window.__musicTest;
      S.musicNeedsInitialAlign=true;S.musicTrackChangedAt=Date.now()-3000;S.musicLastSeekAt=Date.now()-3000;
      S.musicIntent='dQw4w9WgXcQ:play';let seek=0;
      S.yt.seekTo=()=>seek++;
      syncMusic(S.snapshot.room.music);syncMusic(S.snapshot.room.music);
      return seek;
    }''')
    assert first==1,'Alinhamento inicial não deve repetir busca de posição'
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
    assert page.evaluate('document.documentElement.scrollWidth')<=392,'Layout 8.2 transbordou no celular'
    assert not errors,errors
    print('✔ 8.2 Chromium: home gamer, filtros, biblioteca/histórico em abas, renomear/reordenar, convites acessíveis sem a antiga barra e sem erros JS')
    browser.close()
