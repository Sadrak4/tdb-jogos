
(function () {
  'use strict';

  const STORAGE_PREFIX = '';

  class LocalStorageAdapter {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    }

    set(key, value) {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return value;
    }

    remove(key) {
      localStorage.removeItem(STORAGE_PREFIX + key);
    }
  }

  class LocalAuthAdapter {
    constructor(storage) {
      this.storage = storage;
    }

    users() {
      return this.storage.get('tbd_users', []);
    }

    saveUsers(users) {
      this.storage.set('tbd_users', users);
    }

    currentUser() {
      return this.storage.get('tbd_current_user', null);
    }

    setCurrentUser(user) {
      if (user) this.storage.set('tbd_current_user', user);
      else this.storage.remove('tbd_current_user');
    }

    usernameExists(username, exceptId = null) {
      const normalized = String(username || '').trim().toLowerCase();
      return this.users().some(
        u => u.id !== exceptId &&
             String(u.username || '').trim().toLowerCase() === normalized
      );
    }
  }

  class LocalRoomAdapter {
    constructor(storage) {
      this.storage = storage;
    }

    list() {
      return this.storage.get('tbd_rooms', []);
    }

    replace(rooms) {
      this.storage.set('tbd_rooms', rooms);
      return rooms;
    }

    active() {
      return this.storage.get('tbd_active_room', null);
    }

    setActive(room) {
      if (room) this.storage.set('tbd_active_room', room);
      else this.storage.remove('tbd_active_room');
    }

    upsert(room) {
      const rooms = this.list();
      const idx = rooms.findIndex(r => r.code === room.code);
      if (idx >= 0) rooms[idx] = structuredClone(room);
      else rooms.push(structuredClone(room));
      this.replace(rooms);
      return room;
    }

    remove(code) {
      this.replace(this.list().filter(r => r.code !== code));
      const active = this.active();
      if (active?.code === code) this.setActive(null);
    }
  }

  class LocalMatchAdapter {
    constructor(storage) { this.storage = storage; }
    list() { return this.storage.get('tdb_matches', []); }
    replace(matches) { this.storage.set('tdb_matches', matches); return matches; }
    upsert(match) {
      const matches=this.list();
      const i=matches.findIndex(m=>m.matchId===match.matchId);
      if(i>=0) matches[i]=structuredClone(match); else matches.push(structuredClone(match));
      this.replace(matches); return match;
    }
    remove(matchId){ this.replace(this.list().filter(m=>m.matchId!==matchId)); }
    byRoom(roomCode){ return this.list().find(m=>m.roomCode===roomCode && m.status!=='finished')||null; }
  }

  class LocalPresenceAdapter {
    constructor(storage){ this.storage=storage; }
    set(userId,status,extra={}){
      const all=this.storage.get('tdb_presence',{});
      all[userId]={status,...extra,updatedAt:Date.now()};
      this.storage.set('tdb_presence',all); return all[userId];
    }
    get(userId){ return this.storage.get('tdb_presence',{})[userId]||{status:'offline'}; }
  }

  class LocalRealtimeAdapter {
    constructor() {
      this.listeners = new Map();
    }

    subscribe(channel, callback) {
      if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
      this.listeners.get(channel).add(callback);
      return () => this.listeners.get(channel)?.delete(callback);
    }

    publish(channel, payload) {
      for (const callback of this.listeners.get(channel) || []) {
        callback(structuredClone(payload));
      }
    }
  }


  class LocalSharedStateAdapter {
    constructor(storage,realtime){
      this.storage=storage;
      this.realtime=realtime;
    }

    get(key,fallback=null){
      return this.storage.get(`tdb_shared_${key}`,fallback);
    }

    set(key,value){
      this.storage.set(`tdb_shared_${key}`,value);
      this.realtime.publish(`shared:${key}`,value);
      return value;
    }

    subscribe(key,callback){
      return this.realtime.subscribe(`shared:${key}`,callback);
    }
  }

  class GameActionBus {
    constructor() {
      this.handlers = new Map();
      this.transport = 'local';
    }

    register(game, action, handler) {
      this.handlers.set(`${game}:${action}`, handler);
    }

    dispatch(game, action, payload = {}) {
      const handler = this.handlers.get(`${game}:${action}`);
      if (!handler) {
        console.warn(`[TDB ActionBus] Handler ausente: ${game}:${action}`);
        return;
      }
      return handler(structuredClone(payload));
    }

    setTransport(name) {
      this.transport = name;
    }
  }

  class SoundManager {
    constructor() {
      this.enabled = true;
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;
    }

    tone({ frequency = 440, duration = .06, volume = .02, type = 'sine' } = {}) {
      if (!this.enabled) return;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch {}
    }
  }

  const storage = new LocalStorageAdapter();
  const auth = new LocalAuthAdapter(storage);
  const rooms = new LocalRoomAdapter(storage);
  const matches = new LocalMatchAdapter(storage);
  const presence = new LocalPresenceAdapter(storage);
  const realtime = new LocalRealtimeAdapter();
  const sharedState = new LocalSharedStateAdapter(storage,realtime);
  const actions = new GameActionBus();
  const sound = new SoundManager();

  window.TDBCore = {
    mode: 'local',
    storage,
    auth,
    rooms,
    matches,
    presence,
    realtime,
    sharedState,
    actions,
    sound,

    // Future switch point:
    // Replace auth/rooms/realtime with Supabase/WebSocket adapters,
    // keeping the same methods used by the UI.
    useOnlineAdapters(adapters) {
      if (!adapters) return;
      if (adapters.auth) this.auth = adapters.auth;
      if (adapters.rooms) this.rooms = adapters.rooms;
      if (adapters.matches) this.matches = adapters.matches;
      if (adapters.presence) this.presence = adapters.presence;
      if (adapters.realtime) this.realtime = adapters.realtime;
      if (adapters.sharedState) this.sharedState = adapters.sharedState;
      if (adapters.actions) this.actions = adapters.actions;
      this.mode = 'online';
    }
  };
})();
