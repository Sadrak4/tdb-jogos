import {initSupabase,isSupabaseReady,getSupabaseClient} from './realtime-store.js';

async function db(){await initSupabase();if(!isSupabaseReady())return null;return getSupabaseClient()}
function realPlayer(p){return!!p?.id&&String(p.id).startsWith('TDB-')&&!p.bot}
function pgnFromHistory(history=[]){const moves=[];for(let i=0;i<history.length;i+=2){const white=history[i]?.notation||'',black=history[i+1]?.notation||'';moves.push(`${Math.floor(i/2)+1}. ${white}${black?` ${black}`:''}`)}return moves.join(' ')}

export async function recordGameResult(state,{reason=null}={}){
  const c=await db();
  if(!c||!state?.matchId||!['chess','truco','pool'].includes(state.game))return false;
  let players=[],winnerIds=[],loserIds=[],resultType='draw',mode='default',metadata={};
  if(state.game==='chess'){
    players=[state.players?.white,state.players?.black].filter(Boolean);mode='1v1';
    if(state.winner){winnerIds=[state.players[state.winner]?.id].filter(Boolean);loserIds=players.map(p=>p.id).filter(id=>!winnerIds.includes(id));resultType=state.status==='abandoned'?'abandonment':'win'}
    metadata={status:state.status,drawReason:state.drawReason||null,pgn:pgnFromHistory(state.moveHistory||[]),moves:state.moveHistory||[],reason:reason||state.finishReason||null};
  }else if(state.game==='pool'){
    players=(state.players||[]).filter(Boolean);mode='8-ball';
    if(state.winnerId){winnerIds=[state.winnerId];loserIds=[state.loserId||players.find(p=>p.id!==state.winnerId)?.id].filter(Boolean);resultType=String(state.finishReason||'').includes('abandon')?'abandonment':'win'}
    metadata={variant:'8ball',reason:reason||state.finishReason||null,history:(state.history||[]).slice(0,18),groups:Object.fromEntries(players.map(p=>[p.id,p.group||null]))};
  }else{
    players=(state.players||[]).filter(Boolean);mode=state.mode||'default';
    if(state.winner!==null&&state.winner!==undefined){winnerIds=players.filter(p=>p.team===state.winner).map(p=>p.id);loserIds=players.filter(p=>p.team!==state.winner).map(p=>p.id);resultType=state.phase==='abandoned'?'abandonment':'win'}
    metadata={scores:state.scores||[],reason:reason||state.finishReason||null};
  }
  // Persist social and training matches, including BOT encounters; no competitive ranking.
  if(state.canceled){resultType='canceled';winnerIds=[];loserIds=[];}
  const counted=players.some(realPlayer);
  const payload={match_id:state.matchId,room_code:state.roomCode||state.roomId||null,game:state.game,mode,result_type:resultType,participant_ids:players.map(p=>p.id),winner_ids:winnerIds,loser_ids:loserIds,participants:players.map(p=>({id:p.id,username:p.username,avatar:p.avatar||null,team:p.team??null,color:p.color??null,group:p.group??null})),metadata,counted,started_at:state.startedAt?new Date(state.startedAt).toISOString():null,finished_at:new Date().toISOString()};
  const {error}=await c.from('tdb_game_results').upsert(payload,{onConflict:'match_id',ignoreDuplicates:true});
  if(error)throw new Error(error.message);
  return counted;
}

export async function profileHistory(userId){
  const c=await db();if(!c)return{stats:{},recent:[]};
  const [recentResponse,statsResponse]=await Promise.all([
    c.from('tdb_game_results').select('*').contains('participant_ids',[userId]).order('finished_at',{ascending:false}).limit(20),
    c.rpc('tdb_profile_history_stats',{p_user_id:userId})
  ]);
  if(recentResponse.error)throw new Error(recentResponse.error.message);
  const rows=recentResponse.data||[];
  if(!statsResponse.error)return{stats:statsResponse.data||{},recent:rows};
  if(!['PGRST202','42883'].includes(statsResponse.error.code))throw new Error(statsResponse.error.message);
  // Versões anteriores ao SQL 8.1.4: não fingir que os últimos 20
  // resultados representam o histórico permanente.
  return {stats:{},recent:rows,statsPendingMigration:true};
}
