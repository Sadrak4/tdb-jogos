const TABLE=Object.freeze({width:2,height:1,ballRadius:0.028,pocketRadius:0.064,maxSpeed:2.55,friction:0.43,ballRestitution:0.985,cushionRestitution:0.88,dt:1/240,maxTime:14});
const POCKETS=Object.freeze([
  {x:0,y:0,label:'superior esquerda'},
  {x:1,y:0,label:'superior central'},
  {x:2,y:0,label:'superior direita'},
  {x:0,y:1,label:'inferior esquerda'},
  {x:1,y:1,label:'inferior central'},
  {x:2,y:1,label:'inferior direita'}
]);
const COLORS={1:'#f5c518',2:'#2458d3',3:'#d93025',4:'#6d3bbd',5:'#f47c20',6:'#18875b',7:'#6d1824',8:'#111111',9:'#f5c518',10:'#2458d3',11:'#d93025',12:'#6d3bbd',13:'#f47c20',14:'#18875b',15:'#6d1824'};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));
const clone=v=>structuredClone(v);
export function ballGroup(id){id=Number(id);if(id>=1&&id<=7)return'solid';if(id>=9&&id<=15)return'stripe';if(id===8)return'eight';return'cue'}
export function otherGroup(group){return group==='solid'?'stripe':group==='stripe'?'solid':null}
export function pockets(){return clone(POCKETS)}
export function tableSpec(){return {...TABLE,pockets:pockets()}}
function makeBall(id,x,y){return{id,x,y,vx:0,vy:0,pocketed:false,group:ballGroup(id),color:COLORS[id]||'#f7f7f7'}}
function shuffled(values){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export function rackBalls(){
  const balls=[makeBall(0,.46,.5)];
  const solids=shuffled([1,2,3,4,5,6,7]),stripes=shuffled([9,10,11,12,13,14,15]);
  const leftCorner=solids.pop(),rightCorner=stripes.pop();
  const corners=Math.random()<.5?[leftCorner,rightCorner]:[rightCorner,leftCorner];
  const remaining=shuffled([...solids,...stripes]),ids=new Array(15),reserved=new Set([4,10,14]);
  ids[4]=8;ids[10]=corners[0];ids[14]=corners[1];
  let ri=0;for(let i=0;i<ids.length;i++)if(!reserved.has(i))ids[i]=remaining[ri++];
  const r=TABLE.ballRadius,gap=r*2.035,dx=Math.sqrt(3)*r*1.017,apexX=1.43;
  let idx=0;
  for(let row=0;row<5;row++){
    const x=apexX+row*dx;
    for(let j=0;j<=row;j++){
      const y=.5+(j-row/2)*gap;
      balls.push(makeBall(ids[idx++],x,y));
    }
  }
  return balls;
}
function speed(b){return Math.hypot(b.vx,b.vy)}
function nearestPocketIndex(x,y){let best=0,d=Infinity;for(let i=0;i<POCKETS.length;i++){const p=POCKETS[i],dd=(x-p.x)**2+(y-p.y)**2;if(dd<d){d=dd;best=i}}return best}
function tryPocket(ball,t,events){
  if(ball.pocketed)return false;
  for(let i=0;i<POCKETS.length;i++){
    const p=POCKETS[i];
    if(Math.hypot(ball.x-p.x,ball.y-p.y)<=TABLE.pocketRadius){
      ball.pocketed=true;ball.pocketIndex=i;ball.pocketedAt=t;ball.vx=ball.vy=0;
      events.push({type:'pocket',ballId:ball.id,pocketIndex:i,t});
      return true;
    }
  }
  return false;
}
function cushion(ball,t,events,contactState){
  if(ball.pocketed)return;
  const r=TABLE.ballRadius,w=TABLE.width,h=TABLE.height;
  let hit=false;
  if(ball.x<r){ball.x=r;ball.vx=Math.abs(ball.vx)*TABLE.cushionRestitution;hit=true}
  else if(ball.x>w-r){ball.x=w-r;ball.vx=-Math.abs(ball.vx)*TABLE.cushionRestitution;hit=true}
  if(ball.y<r){ball.y=r;ball.vy=Math.abs(ball.vy)*TABLE.cushionRestitution;hit=true}
  else if(ball.y>h-r){ball.y=h-r;ball.vy=-Math.abs(ball.vy)*TABLE.cushionRestitution;hit=true}
  if(hit){events.push({type:'rail',ballId:ball.id,t});if(contactState.firstHit)contactState.railAfterContact=true}
}
function collide(a,b,t,events,contactState){
  if(a.pocketed||b.pocketed)return;
  let dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy),min=TABLE.ballRadius*2;
  if(!dist||dist>=min)return;
  let nx=dx/dist,ny=dy/dist;
  const overlap=min-dist;
  a.x-=nx*overlap*.5;a.y-=ny*overlap*.5;b.x+=nx*overlap*.5;b.y+=ny*overlap*.5;
  const rvx=b.vx-a.vx,rvy=b.vy-a.vy,rel=rvx*nx+rvy*ny;
  if(rel>=0)return;
  const impulse=-(1+TABLE.ballRestitution)*rel/2;
  a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
  if(!contactState.firstHit&&(a.id===0||b.id===0)){
    contactState.firstHit=a.id===0?b.id:a.id;
    events.push({type:'first-hit',ballId:contactState.firstHit,t});
  }
  events.push({type:'collision',a:a.id,b:b.id,t,speed:Math.abs(rel)});
}
function applyFriction(ball,dt){
  if(ball.pocketed)return;
  const s=speed(ball);if(s<=0)return;
  const ns=Math.max(0,s-TABLE.friction*dt);
  if(ns<.006){ball.vx=ball.vy=0;return}
  const k=ns/s;ball.vx*=k;ball.vy*=k;
}
export function simulateShot(inputBalls,angle,power,{captureFrames=false}={}){
  const balls=clone(inputBalls).map(b=>({...b,vx:0,vy:0}));
  const cue=balls.find(b=>b.id===0);
  if(!cue||cue.pocketed)throw new Error('Posicione a bola branca antes da tacada.');
  angle=Number(angle);power=clamp(power,.05,1);
  if(!Number.isFinite(angle))throw new Error('Ângulo inválido.');
  const velocity=TABLE.maxSpeed*(.16+.84*power);
  cue.vx=Math.cos(angle)*velocity;cue.vy=Math.sin(angle)*velocity;
  const events=[],frames=[],contactState={firstHit:null,railAfterContact:false};
  const dt=TABLE.dt,maxSteps=Math.ceil(TABLE.maxTime/dt),sampleEvery=Math.max(1,Math.round((1/60)/dt));
  let settledFor=0,t=0;
  if(captureFrames)frames.push({t:0,balls:balls.map(b=>[b.id,b.x,b.y,b.pocketed?1:0])});
  for(let step=1;step<=maxSteps;step++){
    t=step*dt;
    for(const b of balls){if(!b.pocketed){b.x+=b.vx*dt;b.y+=b.vy*dt}}
    for(const b of balls){if(!b.pocketed)tryPocket(b,t,events)}
    for(const b of balls)cushion(b,t,events,contactState);
    for(let pass=0;pass<2;pass++)for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++)collide(balls[i],balls[j],t,events,contactState);
    for(const b of balls)applyFriction(b,dt);
    if(captureFrames&&step%sampleEvery===0)frames.push({t,balls:balls.map(b=>[b.id,b.x,b.y,b.pocketed?1:0])});
    const max=Math.max(...balls.filter(b=>!b.pocketed).map(speed),0);
    if(max<.012)settledFor+=dt;else settledFor=0;
    if(settledFor>.18)break;
  }
  for(const b of balls){b.vx=0;b.vy=0}
  const pocketed=events.filter(e=>e.type==='pocket').map(e=>({ballId:e.ballId,pocketIndex:e.pocketIndex,t:e.t}));
  const objectPocketed=pocketed.filter(e=>e.ballId!==0);
  return{balls,duration:t,events,frames,firstHit:contactState.firstHit,railAfterContact:contactState.railAfterContact,pocketed,objectPocketed};
}
function playerIndex(state,userId){return(state.players||[]).findIndex(p=>p.id===userId)}
function remainingForGroup(state,group){return state.balls.filter(b=>!b.pocketed&&ballGroup(b.id)===group).length}
function canCallEight(state,index){const g=state.players[index]?.group;return!!g&&remainingForGroup(state,g)===0}
function validCueSpot(state,x,y){
  const r=TABLE.ballRadius;x=Number(x);y=Number(y);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<r||x>TABLE.width-r||y<r||y>TABLE.height-r)return false;
  if(POCKETS.some(p=>Math.hypot(x-p.x,y-p.y)<TABLE.pocketRadius+r*.35))return false;
  return state.balls.filter(b=>b.id!==0&&!b.pocketed).every(b=>Math.hypot(b.x-x,b.y-y)>=r*2.05);
}
function resetDeadline(state,now=Date.now()){state.turnDeadlineAt=state.turnTimer?now+state.turnTimer*1000:null}
function addHistory(state,item){state.history=Array.isArray(state.history)?state.history:[];state.history.unshift({at:Date.now(),...item});state.history=state.history.slice(0,18)}
function switchTurn(state,now=Date.now()){state.turnIndex=state.turnIndex===0?1:0;state.turnPlayerId=state.players[state.turnIndex]?.id||null;state.calledPocket=null;resetDeadline(state,now)}
function resPotEight(balls){const eight=balls.find(b=>b.id===8);if(!eight)return;const spots=[[1.48,.5],[1.36,.5],[1.24,.5],[1.6,.5]];for(const [x,y] of spots){const clear=balls.filter(b=>b.id!==8&&!b.pocketed).every(b=>Math.hypot(b.x-x,b.y-y)>=TABLE.ballRadius*2.05);if(clear){Object.assign(eight,{x,y,pocketed:false,pocketIndex:null,pocketedAt:null,vx:0,vy:0});return}}Object.assign(eight,{x:1.48,y:.5,pocketed:false,pocketIndex:null,pocketedAt:null,vx:0,vy:0})}
export function createState(room){
  const players=(room.players||[]).slice(0,2).map((p,i)=>({...p,seat:i,group:null}));
  if(players.length<2)throw new Error('Sinuca precisa de 2 jogadores.');
  const now=Date.now(),turnTimer=[0,30,45,60].includes(Number(room.poolTurnTimer))?Number(room.poolTurnTimer):45;
  const state={game:'pool',variant:'8ball',mode:'1v1',matchId:`POOL-${now}-${Math.random().toString(36).slice(2,7)}`,roomCode:room.code,players,balls:rackBalls(),turnIndex:0,turnPlayerId:players[0].id,turnTimer,turnDeadlineAt:turnTimer?now+turnTimer*1000:null,readyAt:now,tableOpen:true,breakShot:true,ballInHand:false,calledPocket:null,status:'playing',winnerId:null,loserId:null,finishReason:null,history:[],version:1,startedAt:now,lastShot:null};
  addHistory(state,{type:'start',text:`${players[0].username} abre a partida.`});
  return state;
}
export function tick(input,now=Date.now()){
  const state=clone(input);if(state.status!=='playing'||!state.turnTimer||!state.turnDeadlineAt||now<state.turnDeadlineAt)return state;
  const timedOut=state.players[state.turnIndex];
  const cue=state.balls.find(b=>b.id===0);if(cue)cue.pocketed=true;
  switchTurn(state,now);state.ballInHand=true;state.version=(state.version||0)+1;
  addHistory(state,{type:'foul',playerId:timedOut?.id,text:`Tempo esgotado de ${timedOut?.username||'jogador'}. Bola na mão para o adversário.`});
  return state;
}
export function applyAction(input,userId,action,now=Date.now()){
  let state=tick(input,now);if(state.status!=='playing')throw new Error('A partida já terminou.');if(Number(state.readyAt||0)>now)throw new Error('Aguarde as bolas pararem antes da próxima jogada.');
  const index=playerIndex(state,userId);if(index<0)throw new Error('Espectador não pode jogar.');if(index!==state.turnIndex)throw new Error('Não é sua vez.');
  const me=state.players[index],opp=state.players[index===0?1:0];
  if(action.type==='PLACE_CUE'){
    if(!state.ballInHand)throw new Error('A bola branca não está na mão.');
    const x=Number(action.x),y=Number(action.y);if(!validCueSpot(state,x,y))throw new Error('Posição inválida para a bola branca.');
    const cue=state.balls.find(b=>b.id===0);Object.assign(cue,{x,y,pocketed:false,pocketIndex:null,pocketedAt:null,vx:0,vy:0});state.ballInHand=false;state.version++;resetDeadline(state,now);addHistory(state,{type:'place',playerId:userId,text:`${me.username} posicionou a branca.`});return state;
  }
  if(action.type==='CALL_POCKET'){
    if(!canCallEight(state,index))throw new Error('Você ainda não está jogando na bola 8.');
    const pocket=Number(action.pocket);if(!Number.isInteger(pocket)||pocket<0||pocket>=POCKETS.length)throw new Error('Caçapa inválida.');
    state.calledPocket=pocket;state.version++;addHistory(state,{type:'call',playerId:userId,text:`${me.username} chamou a caçapa ${POCKETS[pocket].label}.`});return state;
  }
  if(action.type==='RESIGN'){
    state.status='finished';state.winnerId=opp.id;state.loserId=me.id;state.finishReason='resign';state.turnDeadlineAt=null;state.version++;addHistory(state,{type:'finish',text:`${me.username} desistiu. ${opp.username} venceu.`});return state;
  }
  if(action.type!=='SHOOT')throw new Error('Ação inválida.');
  if(state.ballInHand)throw new Error('Posicione a bola branca antes de jogar.');
  const angle=Number(action.angle),power=clamp(action.power,.05,1);
  if(!Number.isFinite(angle))throw new Error('Tacada inválida.');
  const groupBefore=me.group,remainingBefore=groupBefore?remainingForGroup(state,groupBefore):null,calledPocket=state.calledPocket;
  const startBalls=clone(state.balls);
  const sim=simulateShot(state.balls,angle,power);
  const readyAt=now+Math.ceil(sim.duration*1000);
  state.balls=sim.balls;
  const pocketedIds=sim.pocketed.map(e=>e.ballId),objectIds=pocketedIds.filter(id=>id!==0),cueScratch=pocketedIds.includes(0),eightEvent=sim.pocketed.find(e=>e.ballId===8)||null;
  const foulReasons=[];
  if(cueScratch)foulReasons.push('bola branca encaçapada');
  if(!sim.firstHit)foulReasons.push('nenhuma bola atingida');
  else if(state.breakShot){if(sim.firstHit===8)foulReasons.push('bola 8 atingida primeiro na saída');}
  else if(state.tableOpen){if(sim.firstHit===8)foulReasons.push('bola 8 atingida primeiro com a mesa aberta');}
  else if(groupBefore){const required=remainingBefore===0?'eight':groupBefore;if(ballGroup(sim.firstHit)!==required)foulReasons.push(required==='eight'?'a bola 8 deveria ser atingida primeiro':'bola do grupo adversário atingida primeiro');}
  if(sim.firstHit&&!sim.railAfterContact&&!sim.pocketed.length)foulReasons.push('nenhuma bola tocou tabela após o contato');
  if(state.breakShot&&!objectIds.length){const breakRails=new Set(sim.events.filter(e=>e.type==='rail'&&e.ballId!==0).map(e=>e.ballId));if(breakRails.size<4)foulReasons.push('saída inválida: menos de quatro bolas tocaram a tabela');}
  let foul=foulReasons.length>0;
  if(state.tableOpen&&!state.breakShot&&!foul){const eligible=objectIds.find(id=>['solid','stripe'].includes(ballGroup(id)));if(eligible){me.group=ballGroup(eligible);opp.group=otherGroup(me.group);state.tableOpen=false;}}
  // Bola 8 na saída é recolocada e a partida continua.
  if(state.breakShot&&eightEvent){resPotEight(state.balls)}
  let finished=false;
  if(eightEvent&&!state.breakShot){
    const eligible=!!groupBefore&&remainingBefore===0,calledCorrect=Number(calledPocket)===Number(eightEvent.pocketIndex);
    if(eligible&&!foul&&calledCorrect){state.winnerId=me.id;state.loserId=opp.id;state.finishReason='eight-ball';}
    else{state.winnerId=opp.id;state.loserId=me.id;state.finishReason=!eligible?'early-eight':foul?'foul-on-eight':'wrong-pocket';}
    state.status='finished';state.turnDeadlineAt=null;finished=true;
  }
  const ownGroup=me.group||groupBefore;
  const pocketedOwn=objectIds.some(id=>ballGroup(id)===ownGroup);
  const pocketedOpen=state.tableOpen&&objectIds.some(id=>['solid','stripe'].includes(ballGroup(id)));
  const continues=!finished&&!foul&&(pocketedOwn||pocketedOpen);
  if(!finished){
    if(foul){const cue=state.balls.find(b=>b.id===0);if(cue)cue.pocketed=true;state.ballInHand=true;switchTurn(state,readyAt)}
    else if(!continues){state.ballInHand=false;switchTurn(state,readyAt)}
    else{state.ballInHand=false;state.calledPocket=null;resetDeadline(state,readyAt)}
  }
  state.breakShot=false;
  const shotId=`SHOT-${now}-${Math.random().toString(36).slice(2,7)}`;
  state.readyAt=readyAt;
  const soundEvents=sim.events.filter(e=>['collision','rail','pocket'].includes(e.type)).slice(0,48).map(e=>({type:e.type,t:e.t,speed:e.speed||0,ballId:e.ballId??null,a:e.a??null,b:e.b??null}));
  state.lastShot={shotId,playerId:userId,playerName:me.username,angle,power,startBalls,duration:sim.duration,firstHit:sim.firstHit,pocketed:sim.pocketed,soundEvents,foul,foulReasons,calledPocket,startedAt:now,settlesAt:readyAt,finishedAt:now};
  state.version=(state.version||0)+1;
  const pocketText=objectIds.length?` Encaçapou ${objectIds.map(id=>`#${id}`).join(', ')}.`:'';
  if(finished){addHistory(state,{type:'finish',playerId:userId,text:`${state.players.find(p=>p.id===state.winnerId)?.username||'Jogador'} venceu na bola 8.${pocketText}`})}
  else if(foul){addHistory(state,{type:'foul',playerId:userId,text:`Falta de ${me.username}: ${foulReasons.join('; ')}.${pocketText}`})}
  else{addHistory(state,{type:'shot',playerId:userId,text:`${me.username} realizou a tacada.${pocketText}${continues?' Continua na mesa.':''}`})}
  return state;
}
export function seatForUser(state,userId){const i=playerIndex(state,userId);return i<0?null:i}
export function viewFor(input,userId,role='player'){
  const state=clone(input);state.role=role;const i=role==='spectator'?-1:playerIndex(state,userId),ready=Date.now()>=Number(state.readyAt||0);state.localSeat=i>=0?i:null;state.localPlayerId=i>=0?userId:null;state.canShoot=role==='player'&&ready&&state.status==='playing'&&state.turnPlayerId===userId&&!state.ballInHand;state.canPlaceCue=role==='player'&&ready&&state.status==='playing'&&state.turnPlayerId===userId&&state.ballInHand;state.canCallPocket=role==='player'&&ready&&state.status==='playing'&&state.turnPlayerId===userId&&i>=0&&canCallEight(state,i);return state;
}
