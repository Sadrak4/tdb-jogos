(function(){
'use strict';
const AWAY_AFTER=5*60*1000;
let lastActivity=Date.now(),away=false;
function activeContext(){
  const room=window.TDBAppState?.activeRoom;
  if(room){
    if(window.TDBAppState?.view==='music'||room.game==='music')return{status:'listening',extra:{roomCode:room.code,game:'music'}};
    if(String(window.TDBAppState?.view||'').startsWith('playing-'))return{status:'playing',extra:{roomCode:room.code,game:room.game}};
    return{status:'room',extra:{roomCode:room.code,game:room.game}};
  }
  return{status:'lobby',extra:{}};
}
function mark(){lastActivity=Date.now();if(away){away=false;const c=activeContext();window.TDBCore?.presence?.set?.(window.TDBAppState?.user?.id,c.status,c.extra)}}
['pointerdown','keydown','touchstart','mousemove'].forEach(e=>window.addEventListener(e,mark,{passive:true}));
setInterval(()=>{const id=window.TDBAppState?.user?.id;if(!id)return;if(!away&&Date.now()-lastActivity>=AWAY_AFTER){away=true;window.TDBCore?.presence?.set?.(id,'away',{view:window.TDBAppState?.view||null})}},15000);
window.TDBPresenceManager={markActive:mark,get away(){return away}};
})();
