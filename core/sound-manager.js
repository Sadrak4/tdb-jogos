(function(){
'use strict';
let ctx=null;
let masterEnabled=true;
let volumes={master:.55,ui:.42,game:.50,notification:.48};
const lastPlayed=new Map();
const pendingSounds=[];

function audioContext(){
  if(!ctx){
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C)return null;
    try{ctx=new C()}catch{return null}
  }
  return ctx;
}
let unlockPromise=null;
async function unlockAudio(){
  const c=audioContext();
  if(!c)return false;
  if(c.state==='running')return true;
  if(unlockPromise)return unlockPromise;
  unlockPromise=(async()=>{
    try{
      await c.resume();
      // Um buffer silencioso confirma o desbloqueio em navegadores mais rígidos.
      const buffer=c.createBuffer(1,1,22050);
      const source=c.createBufferSource();
      source.buffer=buffer;source.connect(c.destination);source.start(0);
      return c.state==='running';
    }catch{return false}
    finally{unlockPromise=null}
  })();
  return unlockPromise;
}
function clamp(v,min=0,max=1){return Math.max(min,Math.min(max,Number(v)||0))}
function configure(next={}){
  if(typeof next.enabled==='boolean')masterEnabled=next.enabled;
  for(const key of ['master','ui','game','notification']){
    if(next[key]!==undefined)volumes[key]=clamp(next[key]);
  }
}
function categoryGain(category,volume=1){
  if(!masterEnabled)return 0;
  const cat=volumes[category]??volumes.ui;
  // Final ceiling intentionally low to avoid harsh/loud browser audio.
  return Math.min(.09,.09*volumes.master*cat*clamp(volume,0,1.4));
}
function dedupe(key,ms=28){
  const now=performance.now(),prev=lastPlayed.get(key)||0;
  if(now-prev<ms)return false;
  lastPlayed.set(key,now);return true;
}
function tone({frequency=440,duration=.055,volume=.75,type='sine',category='ui',delay=0,attack=.004}={}){
  const c=audioContext(),level=categoryGain(category,volume);
  if(!c||!level)return;
  if(c.state!=='running'){unlockAudio().then(ok=>{if(ok)tone({frequency,duration,volume,type,category,delay,attack})});return;}
  const t=c.currentTime+Math.max(0,delay);
  const osc=c.createOscillator(),gain=c.createGain();
  osc.type=type;osc.frequency.setValueAtTime(frequency,t);
  gain.gain.setValueAtTime(.0001,t);
  gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level),t+attack);
  gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  osc.connect(gain);gain.connect(c.destination);osc.start(t);osc.stop(t+duration+.015);
}
function noise({duration=.05,volume=.55,category='game',delay=0,highpass=500}={}){
  const c=audioContext(),level=categoryGain(category,volume);
  if(!c||!level)return;
  if(c.state!=='running'){unlockAudio().then(ok=>{if(ok)noise({duration,volume,category,delay,highpass})});return;}
  const length=Math.max(1,Math.floor(c.sampleRate*duration));
  const buffer=c.createBuffer(1,length,c.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);
  const src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
  filter.type='highpass';filter.frequency.value=highpass;
  const t=c.currentTime+delay;
  gain.gain.setValueAtTime(level,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  src.buffer=buffer;src.connect(filter);filter.connect(gain);gain.connect(c.destination);src.start(t);src.stop(t+duration+.01);
}
function sequence(notes,opts={}){
  notes.forEach((n,i)=>tone({...opts,...n,delay:(opts.delay||0)+(n.delay??i*.045)}));
}
const presets={
  click:()=>tone({frequency:430,duration:.035,volume:.48,type:'triangle',category:'ui'}),
  confirm:()=>sequence([{frequency:430},{frequency:570}],{duration:.055,volume:.55,type:'sine',category:'ui'}),
  back:()=>sequence([{frequency:390},{frequency:300}],{duration:.05,volume:.46,type:'triangle',category:'ui'}),
  success:()=>sequence([{frequency:440},{frequency:590},{frequency:740}],{duration:.07,volume:.58,type:'sine',category:'ui'}),
  error:()=>sequence([{frequency:230},{frequency:185}],{duration:.075,volume:.58,type:'square',category:'ui'}),
  notification:()=>sequence([{frequency:650},{frequency:820}],{duration:.07,volume:.55,type:'sine',category:'notification'}),
  roomJoin:()=>sequence([{frequency:330},{frequency:440},{frequency:560}],{duration:.06,volume:.56,type:'triangle',category:'ui'}),
  gameStart:()=>sequence([{frequency:260},{frequency:390},{frequency:520}],{duration:.08,volume:.62,type:'triangle',category:'game'}),
  cardDeal:()=>{noise({duration:.032,volume:.42,category:'game',highpass:800});tone({frequency:185,duration:.035,volume:.32,type:'triangle',category:'game'})},
  cardPlay:()=>{noise({duration:.05,volume:.62,category:'game',highpass:420});tone({frequency:145,duration:.045,volume:.38,type:'triangle',category:'game'})},
  cardHidden:()=>{noise({duration:.045,volume:.45,category:'game',highpass:650});tone({frequency:115,duration:.05,volume:.35,type:'triangle',category:'game'})},
  truco:()=>sequence([{frequency:250},{frequency:390},{frequency:520}],{duration:.095,volume:.68,type:'square',category:'game'}),
  roundWin:()=>sequence([{frequency:420},{frequency:610}],{duration:.075,volume:.58,type:'triangle',category:'game'}),
  roundLose:()=>sequence([{frequency:330},{frequency:220}],{duration:.075,volume:.50,type:'triangle',category:'game'}),
  victory:()=>sequence([{frequency:392},{frequency:523},{frequency:659},{frequency:784}],{duration:.12,volume:.64,type:'triangle',category:'game'}),
  defeat:()=>sequence([{frequency:330},{frequency:277},{frequency:220}],{duration:.13,volume:.54,type:'triangle',category:'game'}),
  chessSelect:()=>tone({frequency:520,duration:.028,volume:.32,type:'sine',category:'game'}),
  chessMove:()=>{tone({frequency:245,duration:.045,volume:.43,type:'triangle',category:'game'});noise({duration:.028,volume:.20,category:'game',highpass:900})},
  chessCapture:()=>{tone({frequency:190,duration:.065,volume:.52,type:'triangle',category:'game'});noise({duration:.055,volume:.38,category:'game',highpass:500})},
  chessCheck:()=>sequence([{frequency:540},{frequency:430}],{duration:.065,volume:.58,type:'square',category:'game'}),
  chessInvalid:()=>tone({frequency:175,duration:.07,volume:.46,type:'square',category:'game'}),
  poolCue:()=>{noise({duration:.028,volume:.34,category:'game',highpass:760});tone({frequency:125,duration:.045,volume:.48,type:'triangle',category:'game'})},
  poolCollision:()=>{tone({frequency:210,duration:.026,volume:.30,type:'triangle',category:'game'});noise({duration:.018,volume:.18,category:'game',highpass:1100})},
  poolRail:()=>{tone({frequency:150,duration:.035,volume:.24,type:'triangle',category:'game'});noise({duration:.02,volume:.13,category:'game',highpass:820})},
  poolPocket:()=>sequence([{frequency:115},{frequency:82}],{duration:.055,volume:.42,type:'triangle',category:'game'}),
  poolSettle:()=>tone({frequency:105,duration:.028,volume:.18,type:'triangle',category:'game'}),
  poolFoul:()=>sequence([{frequency:250},{frequency:175}],{duration:.075,volume:.46,type:'square',category:'game'}),
  blackjackDeal:()=>{noise({duration:.035,volume:.34,category:'game',highpass:920});tone({frequency:170,duration:.035,volume:.25,type:'triangle',category:'game'})},
  blackjackCard:()=>{noise({duration:.04,volume:.36,category:'game',highpass:760});tone({frequency:155,duration:.035,volume:.24,type:'triangle',category:'game'})},
  blackjackStand:()=>tone({frequency:205,duration:.05,volume:.30,type:'triangle',category:'game'}),
  blackjackDouble:()=>sequence([{frequency:210},{frequency:310}],{duration:.055,volume:.38,type:'triangle',category:'game'}),
  blackjackSplit:()=>sequence([{frequency:300,delay:0},{frequency:420,delay:.04}],{duration:.05,volume:.34,type:'sine',category:'game'}),
  dealerFlip:()=>{noise({duration:.035,volume:.28,category:'game',highpass:1000});tone({frequency:265,duration:.045,volume:.28,type:'triangle',category:'game'})},
  blackjackBust:()=>sequence([{frequency:210},{frequency:165}],{duration:.07,volume:.38,type:'triangle',category:'game'}),
  blackjackWin:()=>sequence([{frequency:410},{frequency:540},{frequency:680}],{duration:.08,volume:.42,type:'triangle',category:'game'}),
  blackjackLose:()=>sequence([{frequency:285},{frequency:225}],{duration:.08,volume:.32,type:'triangle',category:'game'}),
  musicAdd:()=>sequence([{frequency:500},{frequency:670}],{duration:.05,volume:.38,type:'sine',category:'ui'}),
  musicRemove:()=>tone({frequency:250,duration:.055,volume:.35,type:'triangle',category:'ui'})
};
function queuePendingSound(name,options){
  if(pendingSounds.length>=8)pendingSounds.shift();
  pendingSounds.push({name,options:{...options,dedupeMs:0}});
}
function flushPendingSounds(){
  if(!masterEnabled||!ctx||ctx.state!=='running'||!pendingSounds.length)return;
  const items=pendingSounds.splice(0);
  items.forEach((item,index)=>setTimeout(()=>{
    const fn=presets[item.name]||presets.click;
    try{fn(item.options)}catch{}
  },index*28));
}
function play(name='click',options={}){
  if(!masterEnabled)return false;
  if(!dedupe(`${name}:${options.channel||'default'}`,options.dedupeMs??28))return false;
  const fn=presets[name]||presets.click;
  const c=audioContext();
  if(!c)return false;
  const run=()=>{try{fn(options);return true}catch{return false}};
  if(c.state==='running')return run();
  unlockAudio().then(ok=>{
    if(ok){run();flushPendingSounds()}
    else queuePendingSound(name,options);
  });
  return true;
}
function inferClick(el){
  const text=String(el.textContent||'').trim().toLowerCase();
  if(/voltar|sair|recusar|cancelar|fechar|depois/.test(text))return'back';
  if(/salvar|criar|entrar|aceitar|enviar|confirmar|registrar|iniciar/.test(text))return'confirm';
  return'click';
}
function interactiveTarget(target){return target?.closest?.('button:not(:disabled), a.link-btn, .game-card, .profile-mini, .top-brand')||null}
document.addEventListener('pointerup',event=>{
  const el=interactiveTarget(event.target);if(!el)return;
  if(el.closest('.chess-board,.truco-hand,.music-queue-item'))return;
  if(el.dataset.sound==='none')return;
  play(el.dataset.sound||inferClick(el),{channel:'ui-click',dedupeMs:36});
},{passive:true});
const unlockFromGesture=()=>{if(masterEnabled)unlockAudio().then(ok=>{if(ok)flushPendingSounds()})};
document.addEventListener('pointerdown',unlockFromGesture,{passive:true,capture:true});
document.addEventListener('pointerup',unlockFromGesture,{passive:true,capture:true});
document.addEventListener('touchstart',unlockFromGesture,{passive:true,capture:true});
document.addEventListener('keydown',unlockFromGesture,{capture:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&masterEnabled&&ctx)unlockAudio()});
window.TDBSound={
  play,tone,noise,sequence,configure,unlock:unlockAudio,
  test:async()=>{const ok=await unlockAudio();if(ok)play('success',{channel:'audio-test-direct',dedupeMs:0});return ok},
  get enabled(){return masterEnabled},
  get state(){return ctx?.state||'not-created'},
  get volumes(){return{...volumes}}
};
})();
