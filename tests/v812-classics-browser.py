"""Testes reais de cliques no Chromium, servidos via HTTP com API falsa.
Não acessa Supabase/Vercel nem conta real. Foco: motores originais ligados às janelas.
"""
import json, subprocess, base64, re
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
PORT=18792
script="""import * as T from '../server/truco-engine.js';
const room={code:'CLASSIC-TRC',game:'truco',trucoSeats:4,turnTimer:0,players:[{id:'TEST-OWNER',username:'Dono'},{id:'BOT1',username:'Bot Fácil',bot:true,difficulty:'easy'},{id:'BOT2',username:'Bot Médio',bot:true,difficulty:'medium'},{id:'BOT3',username:'Bot Difícil',bot:true,difficulty:'hard'}]};
const s=T.createState(room);s.current=0;console.log(JSON.stringify(T.viewFor(s,'TEST-OWNER')));
"""
fixture=ROOT/'tests/_temp_truco_fixture.mjs'
fixture.write_text(script)
try:
 truco=json.loads(subprocess.check_output(['node',str(fixture)],cwd=ROOT,text=True))
finally: fixture.unlink(missing_ok=True)

MOCK = r'''
const store=new Map([['tdb_session_token','test-token']]);
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}});
window.confirm=()=>true;window.__snapCount=0;window.__actions=[];window.__game=null;window.__room={code:'SALA-ORIGINAL',name:'Sala da Galera',visibility:'public',ownerId:'TEST-OWNER',members:[{id:'TEST-OWNER',username:'Dono',lastSeen:Date.now()},{id:'FRIEND',username:'Amigo',lastSeen:Date.now()}],screens:[],tables:[],music:{queue:[],index:-1,playing:false,position:0,startedAt:null,revision:0},permissions:{tables:'everyone',music:{add:'everyone',play:'everyone',remove:'owner',next:'owner',voteSkip:true}}};
window.fetch=async(url,opts={})=>{
 const path=String(url),type=(opts.method||'GET');let val={ok:true};
 if(path.includes('/auth/session'))val.user={id:'TEST-OWNER',username:'Dono'};
 else if(path.includes('op=list'))val.rooms=[{code:window.__room.code,name:window.__room.name,visibility:'public',members:2,tables:window.__room.tables.length}];
 else if(path.includes('op=snapshot')){window.__snapCount++;val={ok:true,room:window.__room,messages:[],game:window.__game,serverTime:Date.now()};}
 else if(type==='POST'){
  const d=JSON.parse(opts.body||'{}');window.__actions.push(d);const a=d.action||{};
  if(d.op==='action'&&a.type==='table:create'){
    const bots=Number(a.bots||0);const t={id:'TAB-'+Math.random().toString(36).slice(2,8),game:a.game,settings:a.settings||{},ownerId:'TEST-OWNER',status:'waiting',players:[{id:'TEST-OWNER',username:'Dono'},...Array.from({length:bots},(_,i)=>({id:'BOT'+(i+1),username:'Bot '+(i+1),bot:true,difficulty:a.botDifficulty}))],watchers:[],requests:[]};
    window.__room.tables.push(t);val.table=t;
  }
  if(d.op==='action'&&a.type==='table:start'){
    const t=window.__room.tables.find(x=>x.id===a.tableId);t.status='playing';
    if(t.game==='chess'){
      const white={...t.players[0],color:'white'},black={...t.players[1],color:'black'};
      window.__game=window.TDBChessEngine.createState({room:{code:t.id,chessClock:Number(t.settings.clock||300)},whitePlayer:white,blackPlayer:black});
      window.__game.game='chess';window.__game.version=1;window.__game.localColor='white';window.__game.serverClockAt=Date.now();
    }else if(t.game==='truco')window.__game=structuredClone(window.__trucoFixture);
  }
  if(d.op==='action'&&a.type==='game:action'){
    if(window.__game?.game==='chess'&&a.action.type==='MOVE'){
      const m=a.action;let next=window.TDBChessEngine.applyMove(window.__game,{from:m.from,to:m.to,castle:m.castle},m.promotion);
      next.version=(window.__game.version||0)+1;next.game='chess';next.localColor='white';next.serverClockAt=Date.now();window.__game=next;
      if(next.turn==='black'&&next.status==='playing'){
        const bm=window.TDBChessEngine.allLegalMoves(next,'black')[0];next=window.TDBChessEngine.applyMove(next,bm,'queen');next.version=(window.__game.version||0)+1;next.game='chess';next.localColor='white';next.serverClockAt=Date.now();window.__game=next;
      }
    }else if(window.__game?.game==='truco'){
      window.__game.version++;window.__game.logs.push('Jogada recebida pelo servidor simulado');
      if(a.action.type==='PLAY_CARD'){window.__game.hands[0].splice(a.action.cardIdx,1);window.__game.current=1}
    }
    val.game=structuredClone(window.__game); // Mesmo formato da API real do TDB.
  }
 }
 return {ok:true,status:200,json:async()=>structuredClone(val)};
};
'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
  page=browser.new_page(viewport={'width':1440,'height':900},device_scale_factor=1)
  page.set_default_timeout(6500)
  page.route('**/www.youtube.com/**',lambda route:route.abort())
  page.route('**/fonts.googleapis.com/**',lambda route:route.abort())
  page.route('**/fonts.gstatic.com/**',lambda route:route.abort())
  errors=[];page.on('pageerror',lambda ex:errors.append(str(ex)))
  html=(ROOT/'index.html').read_text()
  html=re.sub(r'<script[^>]+src=[^>]+></script>','',html)
  html=re.sub(r'<link[^>]+rel="stylesheet"[^>]*>','',html)
  page.set_content(html,wait_until='domcontentloaded')
  for f in ['hub/hub.css','hub/premium-gold.css','games/chess/chess.css','hub/classic-window.css']:
   page.evaluate('(css)=>{const s=document.createElement("style");s.textContent=css;document.head.appendChild(s)}',(ROOT/f).read_text())
  page.evaluate('window.__trucoFixture='+json.dumps(truco)+';')
  page.evaluate('() => {'+MOCK+'}')
  page.add_script_tag(content=(ROOT/'games/chess/chess-engine.js').read_text())
  mod=(ROOT/'hub/classic-games.js').read_bytes()
  datauri='data:text/javascript;base64,'+base64.b64encode(mod).decode('ascii')
  discoveruri='data:text/javascript;base64,'+base64.b64encode((ROOT/'hub/discover.js').read_bytes()).decode('ascii')
  hub=(ROOT/'hub/hub.js').read_text().replace("'./classic-games.js'",repr(datauri)).replace("'./discover.js'",repr(discoveruri))
  page.add_script_tag(content=hub,type='module')
  page.wait_for_timeout(450)
  assert page.locator('#home').is_visible(),errors
  page.locator('[data-enter="SALA-ORIGINAL"]').first.click()
  page.wait_for_timeout(150)
  assert page.locator('#room-view').is_visible(),errors
  assert page.locator('#room-delete').is_visible(),errors
  # XADREZ: mesa online contra BOT, original client rules + official engine.
  page.locator('#new-bot-table').click()
  page.locator('#modal-fields [name="game"]').select_option('chess')
  page.locator('#modal-ok').click()
  page.wait_for_timeout(250)
  assert page.locator('#game-window').is_visible(),errors
  assert page.evaluate('getComputedStyle(document.querySelector("#game-window")).resize')=='both'
  assert page.locator('#game-window').bounding_box()['width']<1200
  assert page.locator('#game-window .chess-board .chess-square').count()==64
  assert page.locator('#game-window .chess-left-panel').is_visible()
  assert page.locator('#game-window .chess-history').is_visible()
  assert page.locator('#game-window .chess-clock').count()==2
  assert page.locator('#game-area').is_hidden(),'Chess must not consume the tables area'
  official_logo='data:image/png;base64,'+base64.b64encode((ROOT/'assets/logo-official.png').read_bytes()).decode('ascii')
  page.evaluate("(logo)=>document.querySelectorAll(`img[src=\"assets/logo-official.png\"]`).forEach(i=>i.src=logo)",official_logo)
  page.screenshot(path=str(ROOT/'tests/preview-chess-window.png'))
  # Start legal E2-E4 from original engine hints
  page.locator('[data-move="6,4"]').click()
  assert page.locator('#game-window .legal-dot').count()>=1,'Original legal moves indicators must be present'
  queries_before_move=page.evaluate('window.__snapCount')
  page.locator('[data-move="4,4"]').click()
  page.wait_for_timeout(120)
  assert page.evaluate('window.__snapCount')==queries_before_move,'Jogada não deve disparar novo snapshot apenas para exibir resposta já recebida'
  posts=page.evaluate('window.__actions')
  move=[x['action']['action'] for x in posts if x.get('action',{}).get('type')=='game:action'][-1]
  assert move['type']=='MOVE' and move['from']=={'r':6,'c':4} and move['to']=={'r':4,'c':4},move
  assert page.locator('#game-window .chess-history .history-row').count()==2
  # Original-style drag-and-drop: white pawn D2 to D4 after BOT response.
  page.drag_and_drop('[data-move="6,3"] .chess-piece','[data-move="4,3"]')
  page.wait_for_timeout(140)
  actions=[a['action']['action'] for a in page.evaluate('window.__actions') if a.get('action',{}).get('type')=='game:action' and a.get('action',{}).get('action',{}).get('type')=='MOVE']
  assert any(a['from']=={'r':6,'c':3} and a['to']=={'r':4,'c':3} for a in actions),actions
  # minimize, restore, maximize, close and reopen must not resign
  page.locator('#game-window-handle [data-window="minimize"]').click()
  assert page.locator('#game-window').is_hidden() and page.locator('#game-restore').is_visible()
  page.locator('#game-restore').click()
  assert page.locator('#game-window').is_visible()
  page.locator('#game-window [data-window="maximize"]').click()
  assert 'maximized' in page.locator('#game-window').get_attribute('class')
  page.locator('#game-window [data-window="maximize"]').click()
  page.locator('#game-window [data-window="close"]').click()
  assert page.locator('#game-window').is_hidden()
  assert not any(x.get('action',{}).get('action',{}).get('type')=='RESIGN' for x in page.evaluate('window.__actions'))
  page.locator('#tables-list [data-task="open"]').first.click()
  assert page.locator('#game-window .chess-board').is_visible()
  page.locator('#game-window [data-window="close"]').click()
  # Truco 2x2, 3 BOTs. Cards are from server-redacted view.
  page.evaluate('window.__chessBackup=structuredClone(window.__game)')
  page.locator('#new-bot-table').click()
  page.locator('#modal-fields [name="game"]').select_option('truco')
  page.locator('#modal-fields [name="seats"]').select_option('4')
  page.locator('#modal-fields [name="botCount"]').select_option('3')
  page.locator('#modal-ok').click()
  page.wait_for_timeout(220)
  assert page.locator('#game-window').is_visible(),errors
  assert page.locator('#game-window .classic-truco .table-shell').is_visible()
  assert page.locator('#game-window .classic-truco .player-seat').count()==4
  assert page.locator('#game-window .classic-truco .classic-truco-hand [data-truco^="PLAY_CARD"]').count()==3
  assert page.locator('#game-window .classic-truco .score-panel').is_visible()
  assert page.locator('#game-window .classic-truco .classic-truco-vira').is_visible()
  # Spectator safety test: only local hand visible; no full opponent cards in markup
  view_cards=page.locator('#game-window .classic-truco .truco-card:not(.hidden)').count()
  assert view_cards<=4,view_cards
  page.evaluate("(logo)=>document.querySelectorAll(`img[src=\"assets/logo-official.png\"]`).forEach(i=>i.src=logo)",official_logo)
  page.screenshot(path=str(ROOT/'tests/preview-truco-window.png'))
  page.locator('#game-window [data-truco="PLAY_CARD|0"]').click()
  page.wait_for_timeout(100)
  assert any(o.get('action',{}).get('action',{}).get('type')=='PLAY_CARD' for o in page.evaluate('window.__actions'))
  # Mobile: responsive floating window must remain fully within viewport.
  page.set_viewport_size({'width':390,'height':844})
  page.wait_for_timeout(130)
  assert page.locator('#game-window').is_visible()
  pos=page.locator('#game-window').bounding_box()
  assert pos['x']>=-1 and pos['x']+pos['width']<=391,pos
  page.screenshot(path=str(ROOT/'tests/preview-truco-mobile.png'))
  page.locator('#game-window [data-window="close"]').click()
  page.evaluate('window.__game=structuredClone(window.__chessBackup)')
  page.locator('#tables-list [data-task="open"]').first.click()
  page.wait_for_timeout(80)
  assert page.locator('#game-window .chess-board').is_visible()
  pos=page.locator('#game-window').bounding_box()
  assert pos['x']>=-1 and pos['x']+pos['width']<=391,pos
  page.evaluate("(logo)=>document.querySelectorAll(`img[src=\"assets/logo-official.png\"]`).forEach(i=>i.src=logo)",official_logo)
  page.screenshot(path=str(ROOT/'tests/preview-chess-mobile.png'))
  assert not errors,errors
  print('✔ Chromium desktop/mobile: janela xadrez clássico, arrastar, BOT, minimizar/maximizar/fechar/reabrir, Truco 2x2 e privacidade. Sem erros JS.')
  # Original legacy print suppressed.
  # legacy: Chromium desktop: Sala antiga, xadrez clássico e jogada válida+BOT, janela minimizar/maximizar/fechar/reabrir, Truco 2x2 com 3 BOTs, privacidade e interação. Sem erros JS.')
  browser.close()
finally:
 pass
