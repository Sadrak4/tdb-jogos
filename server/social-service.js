import * as Hub from './hub-service.js';
import { initSupabase,isSupabaseReady,getSupabaseClient,emitEvent,getRoomPrivate,setRoomPrivate,runSupabaseQuery } from './realtime-store.js';
import * as Auth from './auth-service.js';
import { getGame,isTerminal } from './game-service.js';
function safeUser(u){return u?{id:u.id,username:u.username,avatar:u.avatar||null,avatarImage:u.avatar_image||u.avatarImage||null}:null}
async function db(){await initSupabase();if(!isSupabaseReady())throw new Error('Supabase indisponível.');return getSupabaseClient()}
async function usersByIds(ids){if(!ids.length)return new Map();const c=await db();const {data,error}=await runSupabaseQuery(c.from('tdb_users').select('id,username,avatar,avatar_image').in('id',[...new Set(ids)]),'Carregar usuários sociais');if(error)throw new Error(error.message);return new Map((data||[]).map(u=>[u.id,safeUser(u)]))}
export async function searchUsers(currentUserId,query){const c=await db(),q=String(query||'').trim();if(q.length<2)return[];let request=c.from('tdb_users').select('id,username,avatar,avatar_image').neq('id',currentUserId).limit(12);if(/^TDB-/i.test(q))request=request.ilike('id',`%${q.toUpperCase()}%`);else request=request.ilike('username',`%${q}%`);const {data,error}=await runSupabaseQuery(request,'Buscar jogadores');if(error)throw new Error(error.message);return(data||[]).map(safeUser)}
export async function socialSummary(userId){
  const c=await db();
  const [friends,incoming,outgoing,invites]=await Promise.all([
    Auth.listFriends(userId),
    runSupabaseQuery(c.from('tdb_friend_requests').select('*').eq('receiver_id',userId).eq('status','pending').order('created_at',{ascending:false}),'Pedidos recebidos'),
    runSupabaseQuery(c.from('tdb_friend_requests').select('*').eq('sender_id',userId).eq('status','pending').order('created_at',{ascending:false}),'Pedidos enviados'),
    runSupabaseQuery(c.from('tdb_room_invites').select('*').eq('receiver_id',userId).eq('status','pending').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}),'Convites de sala')
  ]);
  for(const q of [incoming,outgoing,invites])if(q.error)throw new Error(q.error.message);
  const ids=[
    ...(incoming.data||[]).map(x=>x.sender_id),
    ...(outgoing.data||[]).map(x=>x.receiver_id),
    ...(invites.data||[]).map(x=>x.sender_id)
  ];
  const map=await usersByIds(ids);
  // Buscar presença apenas dos amigos: não fazer SELECT de todas as contas TDB.
  const friendIds=[...new Set(friends.map(f=>f.id).filter(Boolean))];
  const presence=friendIds.length
    ?await runSupabaseQuery(c.from('tdb_presence').select('user_id,status,data,updated_at').in('user_id',friendIds),'Presença social',4500)
    :{data:[],error:null};
  if(presence.error)throw new Error(presence.error.message);
  const presenceMap=new Map((presence.data||[]).map(p=>[p.user_id,p]));
  const labels={truco:'Truco',pool:'Sinuca',chess:'Xadrez',blackjack:'Blackjack',music:'TDB Lobby'};
  const enrichedFriends=friends.map(f=>{
    const pr=presenceMap.get(f.id),age=pr?Date.now()-new Date(pr.updated_at).getTime():Infinity,data=pr?.data||{};
    let status='Offline';
    if(age<30000){
      if(data.status==='playing')status=`Jogando ${labels[data.game]||data.game||''}`.trim();
      else if(data.status==='listening')status='No TDB Lobby';
      else if(data.status==='room')status=`Na sala${data.game?' • '+(labels[data.game]||data.game):''}`;
      else status='Online';
    }else if(age<90000)status='Ausente';
    return{...f,status,presence:data};
  });
  return{
    friends:enrichedFriends,
    incoming:(incoming.data||[]).map(r=>({...r,user:map.get(r.sender_id)||{id:r.sender_id,username:r.sender_id}})),
    outgoing:(outgoing.data||[]).map(r=>({...r,user:map.get(r.receiver_id)||{id:r.receiver_id,username:r.receiver_id}})),
    invites:(invites.data||[]).map(r=>({...r,sender:map.get(r.sender_id)||{id:r.sender_id,username:r.sender_id}}))
  };
}
export async function areFriends(a,b){const c=await db();const {data,error}=await runSupabaseQuery(c.from('tdb_friends').select('friend_id').eq('user_id',a).eq('friend_id',b).maybeSingle(),'Verificar amizade',4500);if(error)throw new Error(error.message);return!!data}
export async function sendFriendRequest(senderId,targetId){targetId=String(targetId||'').trim().toUpperCase();if(senderId===targetId)throw new Error('Você não pode adicionar a si mesmo.');const target=await Auth.findUserById(targetId);if(!target)throw new Error('Jogador não encontrado.');if(await areFriends(senderId,targetId))throw new Error('Esse jogador já é seu amigo.');const c=await db();const {data:reverse,error:reverseError}=await c.from('tdb_friend_requests').select('*').eq('sender_id',targetId).eq('receiver_id',senderId).eq('status','pending').maybeSingle();if(reverseError)throw new Error(reverseError.message);if(reverse){await acceptFriendRequest(senderId,targetId);return{autoAccepted:true,user:target}}const {error}=await c.from('tdb_friend_requests').upsert({sender_id:senderId,receiver_id:targetId,status:'pending',created_at:new Date().toISOString(),responded_at:null},{onConflict:'sender_id,receiver_id'});if(error)throw new Error(error.message);await emitEvent('friends',null,'request');return{autoAccepted:false,user:target}}
export async function acceptFriendRequest(receiverId,senderId){const c=await db();const {data:req,error}=await c.from('tdb_friend_requests').select('*').eq('sender_id',senderId).eq('receiver_id',receiverId).eq('status','pending').maybeSingle();if(error)throw new Error(error.message);if(!req)throw new Error('Pedido de amizade não encontrado.');const now=new Date().toISOString();const {error:friendError}=await c.from('tdb_friends').upsert([{user_id:receiverId,friend_id:senderId},{user_id:senderId,friend_id:receiverId}],{onConflict:'user_id,friend_id'});if(friendError)throw new Error(friendError.message);await c.from('tdb_friend_requests').update({status:'accepted',responded_at:now}).eq('sender_id',senderId).eq('receiver_id',receiverId);await emitEvent('friends',null,'accepted');return await Auth.findUserById(senderId)}
export async function rejectFriendRequest(receiverId,senderId){const c=await db();const {error}=await c.from('tdb_friend_requests').update({status:'rejected',responded_at:new Date().toISOString()}).eq('sender_id',senderId).eq('receiver_id',receiverId).eq('status','pending');if(error)throw new Error(error.message);await emitEvent('friends',null,'rejected');return true}

export async function hasValidRoomInvite(userId,roomCode){const c=await db();const {data,error}=await runSupabaseQuery(c.from('tdb_room_invites').select('id').eq('receiver_id',userId).eq('room_code',String(roomCode||'').toUpperCase()).in('status',['pending','accepted']).gt('expires_at',new Date().toISOString()).limit(1),'Verificar convite',4500);if(error)throw new Error(error.message);return!!(data||[]).length}
// Invite flow targets the modern tdb_hubs social room, not legacy tdb_rooms.
export async function sendRoomInvite(senderId,receiverId,roomCode){
  if(!(await areFriends(senderId,receiverId)))throw new Error('Só é possível convidar amigos.');
  const room=await Hub.inspectRoomForInvite(String(roomCode||'').toUpperCase(),senderId,receiverId);
  const c=await db();
  const {error:oldError}=await runSupabaseQuery(c.from('tdb_room_invites').update({status:'expired'}).eq('receiver_id',receiverId).eq('room_code',room.code).eq('status','pending'),'Expirar convites antigos',4500);
  if(oldError)throw new Error(oldError.message);
  const {data,error}=await runSupabaseQuery(c.from('tdb_room_invites').insert({room_code:room.code,sender_id:senderId,receiver_id:receiverId,status:'pending',expires_at:new Date(Date.now()+10*60*1000).toISOString()}).select('*').single(),'Enviar convite',4500);
  if(error)throw new Error(error.message);
  await emitEvent('invites',room.code,'sent');return data;
}
export async function respondRoomInvite(userId,inviteId,accept){
  const c=await db();
  const {data:invite,error}=await runSupabaseQuery(c.from('tdb_room_invites').select('*').eq('id',inviteId).eq('receiver_id',userId).eq('status','pending').maybeSingle(),'Abrir convite',4500);
  if(error)throw new Error(error.message);
  if(!invite)throw new Error('Convite não encontrado ou expirado.');
  if(new Date(invite.expires_at).getTime()<=Date.now()){
    await c.from('tdb_room_invites').update({status:'expired'}).eq('id',invite.id);
    throw new Error('Este convite expirou.');
  }
  let joined=null;
  if(accept){
    // Invitation acceptance is allowed only if the friendship remains active.
    if(!(await areFriends(userId,invite.sender_id)))throw new Error('A amizade deste convite não está mais ativa.');
    const u=await Auth.findUserById(userId);
    if(!u)throw new Error('Conta não encontrada.');
    joined=await Hub.joinRoom(invite.room_code,u); // room capacity, removal and expiry validated by Hub
  }
  const {error:updateError}=await runSupabaseQuery(c.from('tdb_room_invites').update({status:accept?'accepted':'rejected'}).eq('id',invite.id).eq('receiver_id',userId).eq('status','pending'),'Responder convite',4500);
  if(updateError)throw new Error(updateError.message);
  await emitEvent('invites',invite.room_code,accept?'accepted':'rejected');
  return{accepted:!!accept,roomCode:accept?joined?.code:invite.room_code};
}
