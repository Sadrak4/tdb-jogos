(function(){'use strict';
const P=window.TDBPoolPhysics;
if(!P){console.error('[TDB] Física da Sinuca não carregada.');return}
let pool=null,room=null,role='player',canvas=null,ctx=null,raf=0,timerInterval=0,lastShotId=null,displayBalls=[],hoverWorld=null,aimAngle=0,drag=null,anim=null,resizeObserver=null,soundTimers=[],shotPending=false;
const BALL_COLORS={1:'#f3c41a',2:'#2457d6',3:'#d83b31',4:'#6b42be',5:'#ef7d21',6:'#17875f',7:'#7a2430',8:'#121212',9:'#f3c41a',10:'#2457d6',11:'#d83b31',12:'#6b42be',13:'#ef7d21',14:'#17875f',15:'#7a2430'};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
const esc=v=>typeof escapeHtml==='function'?escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const me=()=>pool?.localSeat!=null?pool.players?.[pool.localSeat]:null;
const current=()=>pool?.players?.[pool.turnIndex]||null;
const isMyTurn=()=>role==='player'&&!shotPending&&pool?.status==='playing'&&pool?.turnPlayerId===state?.user?.id&&Date.now()>=Number(pool?.readyAt||0);
const myGroup=()=>me()?.group||null;
const remaining=(group)=>pool?.balls?.filter(b=>!b.pocketed&&((group==='solid'&&b.id>=1&&b.id<=7)||(group==='stripe'&&b.id>=9&&b.id<=15))).length||0;
const groupLabel=g=>g==='solid'?'Lisas':g==='stripe'?'Listradas':'Mesa aberta';
const gameOver=()=>pool?.status!=='playing';
function formatTime(ms,maxSeconds=null){if(!ms)return'--';let sec=Math.max(0,Math.ceil((ms-Date.now())/1000));if(Number.isFinite(maxSeconds)&&maxSeconds>0)sec=Math.min(sec,maxSeconds);return`00:${String(sec).padStart(2,'0')}`}
function playerById(id){return pool?.players?.find(p=>p.id===id)||null}
function avatarMarkup(p){try{return avatarHtml(p||{},'avatar')}catch{return`<div class="avatar">${esc((p?.username||'?')[0])}</div>`}}
function ballDot(id){const striped=id>=9&&id<=15;const c=BALL_COLORS[id]||'#fff';return`<span class="pool-mini-ball ${striped?'striped':''}" style="--ball-color:${c}">${id}</span>`}
function ballsForGroup(group){if(!group)return'';const ids=group==='solid'?[1,2,3,4,5,6,7]:[9,10,11,12,13,14,15];return ids.map(id=>{const b=pool?.balls?.find(x=>x.id===id);return`<span class="pool-rack-ball ${b?.pocketed?'is-pocketed':''}">${ballDot(id)}</span>`}).join('')}
function poolStatusText(){
  if(!pool)return'Conectando…';
  if(shotPending)return'Enviando tacada…';
  if(anim)return'Bolas em movimento…';
  if(pool.status!=='playing'){
    const w=playerById(pool.winnerId);return w?`${w.username} venceu`:'Partida encerrada';
  }
  if(role==='spectator')return`${current()?.username||'Jogador'} está na mesa`;
  if(isMyTurn()){
    if(pool.ballInHand)return'Sua vez • posicione a branca';
    if(pool.canCallPocket&&!Number.isInteger(pool.calledPocket))return'Sua vez • escolha a caçapa da 8';
    return'SUA VEZ';
  }
  return`${current()?.username||'Adversário'} está mirando…`;
}
function poolHint(){
  if(shotPending)return'A tacada está sendo validada pelo servidor…';
  if(anim)return'Aguarde as bolas pararem para a próxima jogada.';
  if(role==='spectator')return'Você está assistindo sem interferir na partida.';
  if(gameOver())return'A partida terminou. Você pode voltar à sala para ajustar regras ou jogar novamente.';
  if(!isMyTurn())return'Aguarde o adversário concluir a tacada.';
  if(pool.ballInHand)return'Clique em uma posição livre da mesa para colocar a bola branca.';
  if(pool.canCallPocket&&!Number.isInteger(pool.calledPocket))return'Clique em uma das seis caçapas para declarar onde a bola 8 deve entrar.';
  return'Mire com o mouse, segure o botão esquerdo, puxe o taco para trás e solte para bater.';
}
function reasonText(reason){return({
  'eight-ball':'Bola 8 encaçapada corretamente','early-eight':'Bola 8 encaçapada antes da hora','foul-on-eight':'Falta na tacada da bola 8','wrong-pocket':'Bola 8 caiu em uma caçapa diferente da declarada','resign':'Desistência','reconnect-timeout':'Tempo de reconexão esgotado','abandonment':'Abandono da partida'
})[reason]||reason||'Partida encerrada'}

function cleanupPoolUi(){
  cancelAnimationFrame(raf);raf=0;clearInterval(timerInterval);timerInterval=0;
  for(const id of soundTimers)clearTimeout(id);soundTimers=[];
  if(resizeObserver){try{resizeObserver.disconnect()}catch{}resizeObserver=null}
  drag=null;anim=null;hoverWorld=null;shotPending=false;
}
window.cleanupPoolUi=cleanupPoolUi;
function renderShell(){
  cleanupPoolUi()
  state.view=role==='spectator'?'watching':'playing-pool';
  app.innerHTML=`${topbar()}<section class="pool-page fade-in" id="poolRoot">
    <div class="pool-topline">
      <div><span class="eyebrow">SINUCA • 8-BALL</span><h1>Mesa ${esc(room?.code||'')}</h1><p id="poolStatusSub">${esc(poolHint())}</p></div>
      <div class="pool-top-actions"><span class="pool-live-badge">${role==='spectator'?'● AO VIVO':'8-BALL'}</span><button class="btn btn-dark" onclick="poolLeaveMatch()">${role==='spectator'?'Sair da transmissão':'Voltar / sair'}</button></div>
    </div>
    <div class="pool-layout">
      <main class="pool-stage-card">
        <div class="pool-turn-banner" id="poolTurnBanner"><strong>${esc(poolStatusText())}</strong><span id="poolTurnClock"></span></div>
        <div class="pool-canvas-wrap" id="poolCanvasWrap"><canvas id="poolCanvas" aria-label="Mesa de sinuca 8-ball"></canvas><div class="pool-power" id="poolPower"><span>FORÇA</span><div><i id="poolPowerFill"></i></div><b id="poolPowerValue">0%</b></div></div>
        <div class="pool-mobile-hint" id="poolHint">${esc(poolHint())}</div>
      </main>
      <aside class="pool-side">
        <div class="pool-player-card" id="poolPlayer0"></div>
        <div class="pool-player-card" id="poolPlayer1"></div>
        <div class="pool-panel">
          <div class="pool-panel-head"><div><span class="eyebrow">PARTIDA</span><h3>Estado da mesa</h3></div></div>
          <div class="pool-match-info" id="poolMatchInfo"></div>
          <div class="pool-pocket-call" id="poolPocketCall"></div>
        </div>
        <div class="pool-panel pool-history-panel"><div class="pool-panel-head"><div><span class="eyebrow">HISTÓRICO</span><h3>Últimas jogadas</h3></div></div><div class="pool-history" id="poolHistory"></div></div>
        <div class="pool-panel pool-result" id="poolResult" hidden></div>
        <div class="pool-side-actions" id="poolSideActions"></div>
      </aside>
    </div>
  </section>`;
  canvas=document.getElementById('poolCanvas');ctx=canvas?.getContext('2d');
  if(!canvas||!ctx)return;
  bindCanvas();
  const wrap=document.getElementById('poolCanvasWrap');
  if(window.ResizeObserver&&wrap){resizeObserver=new ResizeObserver(()=>resizeCanvas());resizeObserver.observe(wrap)}
  window.addEventListener('resize',resizeCanvas,{passive:true,once:true});
  resizeCanvas();updateHud();startTimerLoop();drawLoop();
}
function updatePlayerCard(index){
  const el=document.getElementById(`poolPlayer${index}`),p=pool?.players?.[index];if(!el||!p)return;
  const turn=pool.status==='playing'&&pool.turnIndex===index;
  const local=p.id===state?.user?.id;
  el.className=`pool-player-card ${turn?'is-turn':''} ${local?'is-local':''}`;
  el.innerHTML=`<div class="pool-player-main">${avatarMarkup(p)}<div><small>${local?'VOCÊ':index===0?'JOGADOR 1':'JOGADOR 2'}</small><strong>${esc(p.username)}</strong><span>${groupLabel(p.group)}${p.group?` • ${remaining(p.group)} restante${remaining(p.group)===1?'':'s'}`:''}</span></div>${turn?'<em>NA MESA</em>':''}</div><div class="pool-ball-strip">${ballsForGroup(p.group)||'<span class="pool-open-table">Aguardando definição das bolas</span>'}</div>`;
}
function updateHud(){
  if(!pool)return;
  updatePlayerCard(0);updatePlayerCard(1);
  const banner=document.getElementById('poolTurnBanner');if(banner)banner.querySelector('strong').textContent=poolStatusText();
  const hint=document.getElementById('poolHint');if(hint)hint.textContent=poolHint();
  const sub=document.getElementById('poolStatusSub');if(sub)sub.textContent=poolHint();
  const info=document.getElementById('poolMatchInfo');if(info)info.innerHTML=`<div><span>Modo</span><strong>8-Ball • 1x1</strong></div><div><span>Tempo por tacada</span><strong>${pool.turnTimer?`${pool.turnTimer}s`:'Sem limite'}</strong></div><div><span>Mesa</span><strong>${pool.tableOpen?'Aberta':'Grupos definidos'}</strong></div><div><span>Espectadores</span><strong>${room?.poolAllowSpectators===false?'Desativados':'Permitidos'}</strong></div>`;
  const call=document.getElementById('poolPocketCall');if(call){
    if(pool.canCallPocket||Number.isInteger(pool.calledPocket)){
      const labels=['Sup. esquerda','Sup. centro','Sup. direita','Inf. esquerda','Inf. centro','Inf. direita'];
      call.innerHTML=`<strong>Bola 8</strong><span>${Number.isInteger(pool.calledPocket)?`Caçapa declarada: ${labels[pool.calledPocket]}`:'Clique em uma caçapa da mesa antes da tacada.'}</span>`;
      call.classList.toggle('is-required',pool.canCallPocket&&!Number.isInteger(pool.calledPocket));
    }else call.innerHTML='<strong>Bola 8</strong><span>Elimine seu grupo para liberar a preta.</span>';
  }
  const hist=document.getElementById('poolHistory');if(hist)hist.innerHTML=(pool.history||[]).slice(0,8).map(h=>`<div class="pool-history-row ${h.type||''}"><i></i><span>${esc(h.text)}</span></div>`).join('')||'<div class="muted">A partida está começando.</div>';
  const result=document.getElementById('poolResult');if(result){if(gameOver()){const w=playerById(pool.winnerId);result.hidden=false;result.innerHTML=`<span class="eyebrow">RESULTADO</span><h2>${w?`${esc(w.username)} venceu`:'Partida encerrada'}</h2><p>${esc(reasonText(pool.finishReason))}</p>`}else result.hidden=true}
  const actions=document.getElementById('poolSideActions');if(actions){
    if(role==='spectator')actions.innerHTML='<button class="btn btn-dark full" onclick="leaveRoom()">Sair da transmissão</button>';
    else if(gameOver())actions.innerHTML=`${room?.ownerId===state?.user?.id?'<button class="btn btn-primary full" onclick="poolRematch()">Revanche</button>':''}<button class="btn btn-secondary full" onclick="poolReturnToRoom()">Voltar à sala</button>`;
    else actions.innerHTML='<button class="btn btn-dark full" onclick="poolResign()">Desistir da partida</button>';
  }
}
function startTimerLoop(){clearInterval(timerInterval);timerInterval=setInterval(()=>{const el=document.getElementById('poolTurnClock');if(!el||!pool)return;el.textContent=anim?'•••':pool.turnTimer&&pool.turnDeadlineAt?formatTime(pool.turnDeadlineAt,pool.turnTimer):'';el.classList.toggle('danger',!anim&&pool.turnTimer&&pool.turnDeadlineAt-Date.now()<8000)},250)}
function resizeCanvas(){if(!canvas||!ctx)return;const wrap=canvas.parentElement;if(!wrap)return;const rect=wrap.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);const w=Math.max(320,Math.floor(rect.width)),h=Math.max(220,Math.floor(rect.height));canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
function geom(){const w=canvas?.clientWidth||900,h=canvas?.clientHeight||500;const pad=Math.max(34,Math.min(w,h)*.085),innerW=w-pad*2,innerH=innerW/2;let tableH=Math.min(h-pad*1.25,innerH),tableW=tableH*2;if(tableW>innerW){tableW=innerW;tableH=tableW/2}const x=(w-tableW)/2,y=(h-tableH)/2;return{x,y,w:tableW,h:tableH,pad:Math.max(22,Math.min(tableW,tableH)*.11)}}
function worldToCanvas(x,y){const g=geom();return{x:g.x+x/P.TABLE.width*g.w,y:g.y+y/P.TABLE.height*g.h}}
function canvasToWorld(clientX,clientY){const rect=canvas.getBoundingClientRect(),g=geom(),px=clientX-rect.left,py=clientY-rect.top;return{x:(px-g.x)/g.w*P.TABLE.width,y:(py-g.y)/g.h*P.TABLE.height,inside:px>=g.x&&px<=g.x+g.w&&py>=g.y&&py<=g.y+g.h,px,py}}
function drawRoundedRect(c,x,y,w,h,r){c.beginPath();if(typeof c.roundRect==='function')c.roundRect(x,y,w,h,r);else{const rr=Math.min(r,w/2,h/2);c.moveTo(x+rr,y);c.arcTo(x+w,y,x+w,y+h,rr);c.arcTo(x+w,y+h,x,y+h,rr);c.arcTo(x,y+h,x,y,rr);c.arcTo(x,y,x+w,y,rr);c.closePath()}}
function drawTable(){
  const g=geom(),rail=Math.max(22,Math.min(g.w,g.h)*.115),outer={x:g.x-rail,y:g.y-rail,w:g.w+rail*2,h:g.h+rail*2};
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=32;ctx.shadowOffsetY=18;
  let wood=ctx.createLinearGradient(outer.x,outer.y,outer.x+outer.w,outer.y+outer.h);wood.addColorStop(0,'#21150f');wood.addColorStop(.25,'#5a3522');wood.addColorStop(.5,'#2e1a12');wood.addColorStop(.75,'#6b4027');wood.addColorStop(1,'#1c110d');ctx.fillStyle=wood;drawRoundedRect(ctx,outer.x,outer.y,outer.w,outer.h,28);ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,211,139,.18)';ctx.lineWidth=2;drawRoundedRect(ctx,outer.x+4,outer.y+4,outer.w-8,outer.h-8,24);ctx.stroke();
  const felt=ctx.createRadialGradient(g.x+g.w*.5,g.y+g.h*.45,10,g.x+g.w*.5,g.y+g.h*.5,g.w*.6);felt.addColorStop(0,'#147050');felt.addColorStop(.6,'#0c563e');felt.addColorStop(1,'#073b2c');ctx.fillStyle=felt;drawRoundedRect(ctx,g.x,g.y,g.w,g.h,10);ctx.fill();
  // Subtle cloth lines and head string.
  ctx.globalAlpha=.08;ctx.strokeStyle='#d7ffe9';ctx.lineWidth=1;for(let i=1;i<10;i++){ctx.beginPath();ctx.moveTo(g.x+g.w*i/10,g.y);ctx.lineTo(g.x+g.w*i/10,g.y+g.h);ctx.stroke()}ctx.globalAlpha=.22;ctx.setLineDash([4,8]);ctx.beginPath();ctx.moveTo(g.x+g.w*.25,g.y+8);ctx.lineTo(g.x+g.w*.25,g.y+g.h-8);ctx.stroke();ctx.setLineDash([]);
  ctx.globalAlpha=.10;ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(24,g.h*.10)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('TDB',g.x+g.w*.5,g.y+g.h*.5);ctx.globalAlpha=1;
  const pr=Math.max(12,g.w/P.TABLE.width*P.TABLE.pocketRadius*1.04);for(let i=0;i<P.POCKETS.length;i++){const p=P.POCKETS[i],q=worldToCanvas(p.x,p.y),called=Number(pool?.calledPocket)===i;ctx.beginPath();ctx.fillStyle=called?'#e8b84d':'#050706';ctx.arc(q.x,q.y,pr+(called?5:0),0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.fillStyle='#020302';ctx.arc(q.x,q.y,pr*.78,0,Math.PI*2);ctx.fill();if(called){ctx.strokeStyle='rgba(245,202,92,.75)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(q.x,q.y,pr+10,0,Math.PI*2);ctx.stroke()}}
  ctx.restore();
}
function drawBall(b){if(b.pocketed)return;const q=worldToCanvas(b.x,b.y),g=geom(),r=g.w/P.TABLE.width*P.TABLE.ballRadius,striped=b.id>=9&&b.id<=15,color=BALL_COLORS[b.id]||'#f4f4f2';ctx.save();ctx.shadowColor='rgba(0,0,0,.48)';ctx.shadowBlur=r*.75;ctx.shadowOffsetY=r*.35;ctx.beginPath();ctx.arc(q.x,q.y,r,0,Math.PI*2);ctx.fillStyle=b.id===0?'#f5f2e9':striped?'#f5f2e9':color;ctx.fill();ctx.shadowBlur=0;if(striped){ctx.save();ctx.beginPath();ctx.arc(q.x,q.y,r,0,Math.PI*2);ctx.clip();ctx.fillStyle=color;ctx.fillRect(q.x-r,q.y-r*.52,r*2,r*1.04);ctx.restore()}if(b.id!==0){const nr=r*.45;ctx.beginPath();ctx.arc(q.x,q.y,nr,0,Math.PI*2);ctx.fillStyle='#f8f7f0';ctx.fill();ctx.fillStyle='#111';ctx.font=`700 ${Math.max(7,r*.58)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(b.id),q.x,q.y+.3)}ctx.beginPath();ctx.arc(q.x-r*.28,q.y-r*.33,r*.23,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.38)';ctx.fill();ctx.restore()}
function rayHit(angle,cue){
  if(!cue)return null;const dx=Math.cos(angle),dy=Math.sin(angle),r=P.TABLE.ballRadius;let bestT=99,hit=null;
  // cushions
  const tx=dx>0?(P.TABLE.width-r-cue.x)/dx:dx<0?(r-cue.x)/dx:99,ty=dy>0?(P.TABLE.height-r-cue.y)/dy:dy<0?(r-cue.y)/dy:99;if(tx>0&&tx<bestT){bestT=tx;hit={x:cue.x+dx*tx,y:cue.y+dy*tx,type:'rail'}}if(ty>0&&ty<bestT){bestT=ty;hit={x:cue.x+dx*ty,y:cue.y+dy*ty,type:'rail'}}
  for(const b of displayBalls){if(b.id===0||b.pocketed)continue;const ox=cue.x-b.x,oy=cue.y-b.y,R=r*2;const bb=2*(dx*ox+dy*oy),cc=ox*ox+oy*oy-R*R,disc=bb*bb-4*cc;if(disc<0)continue;const t=(-bb-Math.sqrt(disc))/2;if(t>0&&t<bestT){bestT=t;hit={x:cue.x+dx*t,y:cue.y+dy*t,type:'ball',ball:b}}}
  return hit;
}
function drawAim(){
  if(!pool||!isMyTurn()||pool.ballInHand||anim||gameOver())return;const cue=displayBalls.find(b=>b.id===0&&!b.pocketed);if(!cue)return;const hit=rayHit(aimAngle,cue),start=worldToCanvas(cue.x,cue.y),end=hit?worldToCanvas(hit.x,hit.y):worldToCanvas(cue.x+Math.cos(aimAngle)*.7,cue.y+Math.sin(aimAngle)*.7);
  if(room?.poolAimAssist!=='none'){ctx.save();ctx.setLineDash([8,9]);ctx.strokeStyle='rgba(255,255,255,.58)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.setLineDash([]);if(hit?.type==='ball'){ctx.strokeStyle='rgba(237,197,92,.85)';ctx.beginPath();ctx.arc(end.x,end.y,8,0,Math.PI*2);ctx.stroke()}ctx.restore()}
  const pull=drag?.power||0,g=geom(),scale=g.w/P.TABLE.width,behind=.11+pull*.30,front=.015;const x1=start.x-Math.cos(aimAngle)*behind*scale,y1=start.y-Math.sin(aimAngle)*behind*scale,x2=start.x-Math.cos(aimAngle)*front*scale,y2=start.y-Math.sin(aimAngle)*front*scale;
  ctx.save();ctx.lineCap='round';ctx.strokeStyle='rgba(0,0,0,.38)';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();const grad=ctx.createLinearGradient(x1,y1,x2,y2);grad.addColorStop(0,'#5b3118');grad.addColorStop(.58,'#c58d4a');grad.addColorStop(.92,'#f2e6cf');ctx.strokeStyle=grad;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();
}
function drawBallInHandGhost(){if(!pool?.ballInHand||!isMyTurn()||!hoverWorld?.inside)return;const valid=isValidCueSpot(hoverWorld.x,hoverWorld.y),q=worldToCanvas(hoverWorld.x,hoverWorld.y),g=geom(),r=g.w/P.TABLE.width*P.TABLE.ballRadius;ctx.save();ctx.globalAlpha=.72;ctx.beginPath();ctx.arc(q.x,q.y,r,0,Math.PI*2);ctx.fillStyle=valid?'#fffdf5':'#ff6f6f';ctx.fill();ctx.strokeStyle=valid?'#70f3bd':'#ff5555';ctx.lineWidth=2;ctx.stroke();ctx.restore()}
function draw(){if(!ctx||!canvas)return;const w=canvas.clientWidth,h=canvas.clientHeight;ctx.clearRect(0,0,w,h);drawTable();for(const b of displayBalls)drawBall(b);drawAim();drawBallInHandGhost()}
function drawLoop(){cancelAnimationFrame(raf);const tick=(now)=>{if(anim){const elapsed=(now-anim.started)/1000,index=Math.min(anim.frames.length-1,Math.max(0,Math.floor(elapsed*60))),frame=anim.frames[index];if(frame){const byId=new Map(frame.balls.map(x=>[x[0],x]));displayBalls=anim.base.map(b=>{const f=byId.get(b.id);return f?{...b,x:f[1],y:f[2],pocketed:!!f[3]}:b})}if(elapsed>=anim.duration+.12){displayBalls=structuredClone(pool.balls||[]);anim=null;setPower(0);window.TDBSound?.play?.('poolSettle',{channel:'pool-settle',dedupeMs:120});updateHud()}}draw();raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick)}
function setPower(power){power=clamp(power,0,1);if(drag)drag.power=power;const fill=document.getElementById('poolPowerFill'),v=document.getElementById('poolPowerValue');if(fill)fill.style.width=`${Math.round(power*100)}%`;if(v)v.textContent=`${Math.round(power*100)}%`;const box=document.getElementById('poolPower');if(box)box.classList.toggle('active',power>0)}
function isValidCueSpot(x,y){const r=P.TABLE.ballRadius;if(x<r||x>P.TABLE.width-r||y<r||y>P.TABLE.height-r)return false;if(P.POCKETS.some(p=>Math.hypot(x-p.x,y-p.y)<P.TABLE.pocketRadius+r*.35))return false;return(pool?.balls||[]).filter(b=>b.id!==0&&!b.pocketed).every(b=>Math.hypot(b.x-x,b.y-y)>=r*2.05)}
function nearestPocket(w){let idx=-1,d=.13;for(let i=0;i<P.POCKETS.length;i++){const p=P.POCKETS[i],dd=Math.hypot(w.x-p.x,w.y-p.y);if(dd<d){d=dd;idx=i}}return idx}
function bindCanvas(){
  canvas.style.touchAction='none';
  canvas.addEventListener('pointermove',e=>{hoverWorld=canvasToWorld(e.clientX,e.clientY);if(!hoverWorld.inside)return;if(drag){const cur=hoverWorld,dx=Math.cos(drag.angle),dy=Math.sin(drag.angle),back=-(cur.x-drag.start.x)*dx-(cur.y-drag.start.y)*dy;setPower(clamp(back/.42,0,1))}else if(isMyTurn()&&!pool.ballInHand&&!anim){const cue=displayBalls.find(b=>b.id===0&&!b.pocketed);if(cue)aimAngle=Math.atan2(hoverWorld.y-cue.y,hoverWorld.x-cue.x)}});
  canvas.addEventListener('pointerleave',()=>{hoverWorld=null});
  canvas.addEventListener('pointerdown',e=>{if(!pool||anim||gameOver()||role==='spectator'||!isMyTurn())return;const w=canvasToWorld(e.clientX,e.clientY);hoverWorld=w;if(!w.inside)return;canvas.setPointerCapture?.(e.pointerId);
    if(pool.ballInHand){if(isValidCueSpot(w.x,w.y))poolAction({type:'PLACE_CUE',x:w.x,y:w.y});else toast('A branca precisa ficar livre e dentro da mesa.');return}
    if(pool.canCallPocket&&!Number.isInteger(pool.calledPocket)){const idx=nearestPocket(w);if(idx>=0){poolAction({type:'CALL_POCKET',pocket:idx});return}else{toast('Clique diretamente em uma das caçapas para declarar a bola 8.');return}}
    const cue=displayBalls.find(b=>b.id===0&&!b.pocketed);if(!cue)return;aimAngle=Math.atan2(w.y-cue.y,w.x-cue.x);drag={start:w,angle:aimAngle,power:0};setPower(0);e.preventDefault();
  });
  canvas.addEventListener('pointerup',e=>{if(!drag)return;const shot={...drag};drag=null;if(shot.power>=.055){window.TDBSound?.play?.('poolCue',{channel:'pool-cue',dedupeMs:80});poolAction({type:'SHOOT',angle:shot.angle,power:shot.power})}else setPower(0);try{canvas.releasePointerCapture?.(e.pointerId)}catch{}});
  canvas.addEventListener('pointercancel',()=>{drag=null;setPower(0)});
}
async function poolAction(action){if(!window.OnlineGameBridge?.roomCode)return toast('Partida ainda não sincronizada.');if(shotPending)return false;shotPending=true;updateHud();try{const ok=await window.OnlineGameBridge.action(action);if(!ok&&action.type==='SHOOT')setPower(0);return ok}finally{shotPending=false;updateHud()}}
function beginShotAnimation(serverState){
  const shot=serverState?.lastShot;if(!shot?.shotId||shot.shotId===lastShotId)return false;
  lastShotId=shot.shotId;for(const id of soundTimers)clearTimeout(id);soundTimers=[];
  const age=Date.now()-Number(shot.finishedAt||0);if(age>6000||!Array.isArray(shot.startBalls)){displayBalls=structuredClone(serverState.balls||[]);return false}
  try{
    const sim=P.simulateShot(shot.startBalls,shot.angle,shot.power,{captureFrames:true});anim={frames:sim.frames,base:structuredClone(shot.startBalls),duration:sim.duration,started:performance.now()};displayBalls=structuredClone(shot.startBalls);
    const events=Array.isArray(shot.soundEvents)?shot.soundEvents:[];
    let lastCollisionAt=-1;
    for(const ev of events){
      const delay=Math.max(0,Math.min(6500,Number(ev.t||0)*1000));
      if(ev.type==='collision'){
        if(delay-lastCollisionAt<55)continue;lastCollisionAt=delay;
        soundTimers.push(setTimeout(()=>window.TDBSound?.play?.('poolCollision',{channel:`pool-hit-${Math.round(delay/80)}`,dedupeMs:35}),delay));
      }else if(ev.type==='rail'){
        soundTimers.push(setTimeout(()=>window.TDBSound?.play?.('poolRail',{channel:`pool-rail-${Math.round(delay/100)}`,dedupeMs:50}),delay));
      }else if(ev.type==='pocket'){
        soundTimers.push(setTimeout(()=>window.TDBSound?.play?.('poolPocket',{channel:`pool-pocket-${Math.round(delay/100)}`,dedupeMs:70}),delay));
      }
    }
    updateHud();return true;
  }catch{displayBalls=structuredClone(serverState.balls||[]);return false}
}
function applyOnlinePoolState(serverState,activeRoom,serverRole='player'){
  const previous=pool;pool=structuredClone(serverState);role=serverRole||serverState.role||'player';room=structuredClone(activeRoom||room||state.activeRoom||{});window.__TDB_POOL_STATE__=pool;
  const root=document.getElementById('poolRoot');if(!root)renderShell();
  const animated=beginShotAnimation(serverState);if(!animated&&!anim)displayBalls=structuredClone(pool.balls||[]);
  if(previous?.status==='playing'&&pool.status!=='playing'){const mine=pool.winnerId===state?.user?.id;window.TDBSound?.play?.(mine?'victory':'defeat',{channel:'pool-result',dedupeMs:400})}
  if(pool.lastShot?.foul&&pool.lastShot.shotId!==previous?.lastShot?.shotId)window.TDBSound?.play?.('poolFoul',{channel:'pool-foul',dedupeMs:150});
  updateHud();
}
window.applyOnlinePoolState=applyOnlinePoolState;
function renderPoolSpectator(r){room=structuredClone(r);role='spectator';if(window.__TDB_POOL_STATE__){pool=structuredClone(window.__TDB_POOL_STATE__);renderShell()}else app.innerHTML=`${topbar()}<section class="spectator-placeholder">${logoTag()}<h1>Assistindo Sinuca</h1><p>Conectando à mesa ao vivo…</p><button class="btn btn-secondary" onclick="leaveRoom()">Voltar</button></section>`}
window.renderPoolSpectator=renderPoolSpectator;
async function poolResign(){if(!pool||gameOver())return;if(!confirm('Desistir desta partida de Sinuca?'))return;await poolAction({type:'RESIGN'})}
async function poolReturnToRoom(){if(!room?.code)return;cleanupPoolUi();window.OnlineGameBridge?.stop?.();const updated=await window.TDBOnline?.returnGameToRoom?.(room.code);if(!updated)return toast('Não foi possível voltar à sala.');state.activeRoom=updated;Core.rooms.setActive(updated);state.view='waiting';setPresence('room',{roomCode:updated.code,game:'pool'});renderWaitingRoom()}
async function poolRematch(){if(!room?.code)return;const result=await window.TDBOnline?.rematchGame?.(room.code);if(!result?.state)return toast('Não foi possível iniciar a revanche.');if(result.room){room=result.room;state.activeRoom=result.room;Core.rooms.setActive(result.room)}state.view='playing-pool';setPresence('playing',{roomCode:room.code,game:'pool'})}
function poolLeaveMatch(){if(role==='spectator'){cleanupPoolUi();return leaveRoom();}if(gameOver())return poolReturnToRoom();return poolResign()}
window.poolResign=poolResign;window.poolReturnToRoom=poolReturnToRoom;window.poolRematch=poolRematch;window.poolLeaveMatch=poolLeaveMatch;
})();
