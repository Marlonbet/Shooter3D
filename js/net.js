import { state } from './state.js';

// =========================================================
// RED: Nostr (sin servidor propio, sin costo, funciona en Cuba)
// ---------------------------------------------------------
// Protocolo (eventos efímeros kind 20001, no se guardan en el
// relay; solo sirven para el directo):
//   - Todos los mensajes llevan la etiqueta ['d', CODIGO_SALA].
//   - El anfitrión (creador de la sala) es el árbitro: valida
//     impactos, simula los bots y lleva el marcador. Los demás
//     clientes nunca aplican daño por su cuenta: envían una
//     reclamación ('hit') y esperan la confirmación del árbitro.
//   - 'pos' se envía como máximo 10 veces/s y solo si el jugador
//     se movió o giró de forma apreciable (ahorra datos móviles).
//   - 'ping'/'pong' miden el tiempo de ida y vuelta a través de
//     los relays: ese es el Ping que se muestra en pantalla.
// Relays: los mismos que ya funcionan en Cuba en ChatApp y
// CubMatch. relay.nostr.band se excluye a propósito: en CubMatch
// ni siquiera completaba el TLS y se sustituyó por nostr.mom.
// =========================================================

export const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
];

export const GAME_KIND = 20001;

const sockets = new Map(); // url -> WebSocket
let subId = 'neon-' + Math.random().toString(36).slice(2, 10);
let secretKey = null;
let pingTimer = null;
let announceTimer = null;
let posSeq = 0;
const pendingPings = new Map(); // id -> t0

function tools() {
  return window.NostrTools || null;
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function initIdentity() {
  const t = tools();
  if (!t) throw new Error('Falta js/nostr-bundle.js (NostrTools no cargó).');
  let stored = null;
  try { stored = localStorage.getItem('neonstrike_secret'); } catch (err) { /* sin storage */ }
  if (stored && /^[0-9a-f]{64}$/.test(stored)) {
    secretKey = hexToBytes(stored);
  } else {
    secretKey = t.generateSecretKey();
    try { localStorage.setItem('neonstrike_secret', bytesToHex(secretKey)); } catch (err) { /* sin storage */ }
  }
  state.net.myPubkey = t.getPublicKey(secretKey);
  let name = 'Jugador';
  try { name = localStorage.getItem('neonstrike_name') || name; } catch (err) { /* sin storage */ }
  state.net.myName = name;
  return { pubkey: state.net.myPubkey, name };
}

export function setMyName(name) {
  const clean = (name || '').trim().slice(0, 18) || 'Jugador';
  state.net.myName = clean;
  try { localStorage.setItem('neonstrike_name', clean); } catch (err) { /* sin storage */ }
  return clean;
}

export function npubShort(pubkey) {
  try {
    const npub = tools().nip19.npubEncode(pubkey);
    return npub.slice(0, 10) + '…' + npub.slice(-4);
  } catch (err) {
    return (pubkey || '').slice(0, 8);
  }
}

function updateRelayCount() {
  let open = 0;
  for (const ws of sockets.values()) if (ws.readyState === WebSocket.OPEN) open++;
  state.net.relayCount = open;
  state.net.totalRelays = RELAYS.length;
  state.net.connected = open > 0;
  window.dispatchEvent(new CustomEvent('neon-relays', { detail: { open, total: RELAYS.length } }));
}

export function connectRelays() {
  for (const url of RELAYS) {
    if (sockets.has(url)) continue;
    let ws;
    try { ws = new WebSocket(url); } catch (err) { continue; }
    sockets.set(url, ws);
    ws.onopen = () => { updateRelayCount(); subscribeCurrentRoom(ws); };
    ws.onclose = () => { updateRelayCount(); };
    ws.onerror = () => { updateRelayCount(); };
    ws.onmessage = (ev) => {
      let arr;
      try { arr = JSON.parse(ev.data); } catch (err) { return; }
      if (arr[0] !== 'EVENT' || !arr[2]) return;
      handleEvent(arr[2]);
    };
  }
  updateRelayCount();
}

function subscribeCurrentRoom(ws) {
  if (!state.room || !state.room.code) return;
  const filter = { kinds: [GAME_KIND], '#d': [state.room.code], limit: 0 };
  try { ws.send(JSON.stringify(['REQ', subId, filter])); } catch (err) { /* relay caído */ }
}

export function subscribeRoom() {
  for (const ws of sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) subscribeCurrentRoom(ws);
  }
}

function publish(event) {
  const msg = JSON.stringify(['EVENT', event]);
  for (const ws of sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(msg); } catch (err) { /* relay caído */ }
    }
  }
}

// Envía un mensaje de juego. targetPubkey: si se indica, solo ese
// jugador debe actuar (los demás lo ignoran); el resto lo ve
// todo el mundo de la sala (trazadoras, marcador...).
export function send(type, data = {}, targetPubkey = null) {
  if (!state.room || !state.room.code) return false;
  const t = tools();
  if (!t || !secretKey) return false;
  const tags = [['d', state.room.code]];
  if (targetPubkey) tags.push(['p', targetPubkey]);
  const content = JSON.stringify({ v: 1, type, from: state.net.myPubkey, name: state.net.myName, ...data });
  try {
    const event = t.finalizeEvent({
      kind: GAME_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
    }, secretKey);
    publish(event);
    return true;
  } catch (err) {
    return false;
  }
}

export function sendToHost(type, data = {}) {
  if (!state.room || !state.room.hostPubkey) return false;
  return send(type, data, state.room.hostPubkey);
}

// Posición propia. El bucle principal la llama con los datos ya
// calculados (evita importar player aquí).
export function sendPlayerPos(p) {
  posSeq++;
  send('pos', {
    seq: posSeq, x: +p.x.toFixed(2), z: +p.z.toFixed(2),
    yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3),
    hp: Math.round(p.hp), alive: p.alive,
    kills: p.kills, deaths: p.deaths, team: p.team,
  });
}

function handleEvent(ev) {
  if (ev.kind !== GAME_KIND) return;
  let msg;
  try { msg = JSON.parse(ev.content); } catch (err) { return; }
  if (!msg || msg.v !== 1 || !msg.type) return;
  if (!state.room || !state.room.code) return;
  const roomTag = (ev.tags || []).find((t) => t[0] === 'd');
  if (!roomTag || roomTag[1] !== state.room.code) return;

  // ---- Ping / pong: se resuelven aquí, no llegan a la UI ----
  if (msg.type === 'ping') {
    // El anfitrión responde; si yo soy el anfitrión, respondo
    // también a mi propio ping (mide la vuelta por el relay).
    if (state.net.isHost || msg.target === state.net.myPubkey) {
      send('pong', { id: msg.id, t: msg.t }, msg.from);
    }
    return;
  }
  if (msg.type === 'pong') {
    // BUG CORREGIDO 2026-10-24: antes se exigía msg.target en el
    // contenido, pero send() pone el destinatario solo en la
    // etiqueta ['p', pubkey], nunca en el contenido. Por eso el
    // pong se ignoraba siempre y el ping quedaba en "…" en
    // anfitrión e invitado. Ahora se comprueba la etiqueta.
    const pTag = (ev.tags || []).find((t) => t[0] === 'p');
    if (pTag && pTag[1] !== state.net.myPubkey) return;
    if (pendingPings.has(msg.id)) {
      state.net.pingMs = Date.now() - pendingPings.get(msg.id);
      pendingPings.delete(msg.id);
    }
    return;
  }

  // Los mensajes propios no se reprocesan (salvo el ping propio
  // del anfitrión, ya resuelto arriba).
  if (msg.from === state.net.myPubkey) return;

  window.dispatchEvent(new CustomEvent('neon-net', { detail: { ...msg, pubkey: ev.pubkey } }));
}

// ---- Ping periódico ----
export function startPingLoop() {
  stopPingLoop();
  pingTimer = setInterval(() => {
    if (!state.room || !state.net.connected) return;
    const id = Math.random().toString(36).slice(2, 10);
    pendingPings.set(id, Date.now());
    if (pendingPings.size > 20) {
      const first = pendingPings.keys().next().value;
      pendingPings.delete(first);
    }
    // Anfitrión: mide el ping contra un invitado real si lo hay
    // (el invitado responde porque el ping lleva su pubkey como
    // destino); si está solo, se mide a sí mismo por el relay.
    // Invitado: mide contra el anfitrión.
    let target = state.room.hostPubkey;
    if (state.net.isHost) {
      const other = (state.room.players || []).find((p) => p.pubkey !== state.net.myPubkey);
      target = other ? other.pubkey : state.net.myPubkey;
    }
    if (target) send('ping', { id, t: Date.now(), target }, target);
  }, 2000);
}
export function stopPingLoop() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  pendingPings.clear();
}

// ---- Sala: crear / unirse / salir ----
export function makeRoomCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  const rnd = new Uint8Array(4);
  crypto.getRandomValues(rnd);
  for (const b of rnd) out += chars[b % chars.length];
  return 'NEON-' + out;
}

export function createRoom(settings) {
  const code = makeRoomCode();
  state.room = {
    code,
    hostPubkey: state.net.myPubkey,
    hostName: state.net.myName,
    settings: { ...settings },
    players: [{ pubkey: state.net.myPubkey, name: state.net.myName, team: 'ally', isHost: true }],
    started: false,
  };
  state.net.enabled = true;
  state.net.isHost = true;
  subscribeRoom();
  startPingLoop();
  startAnnounceLoop();
  return code;
}

export function joinRoom(code, team) {
  const clean = (code || '').trim().toUpperCase();
  state.room = {
    code: clean,
    hostPubkey: null, // se aprende del primer announce del anfitrión
    hostName: '',
    settings: null,
    players: [{ pubkey: state.net.myPubkey, name: state.net.myName, team: team || 'enemy', isHost: false }],
    started: false,
  };
  state.net.enabled = true;
  state.net.isHost = false;
  subscribeRoom();
  startPingLoop();
  // El anfitrión responde con 'room_announce' y nos añade.
  send('join', { name: state.net.myName, team: team || 'enemy' });
  // Reintento por si el primer join se perdió en un relay.
  setTimeout(() => {
    if (state.room && !state.room.started && !state.room.hostPubkey) {
      send('join', { name: state.net.myName, team: team || 'enemy' });
    }
  }, 3000);
  return clean;
}

export function leaveRoom() {
  if (state.room) send('leave', {});
  stopPingLoop();
  stopAnnounceLoop();
  state.room = null;
  state.net.enabled = false;
  state.net.isHost = false;
  state.net.pingMs = null;
}

// El anfitrión anuncia la sala cada 3 s para que los que entran
// tarde (o perdieron el join) vean ajustes y jugadores.
export function startAnnounceLoop() {
  stopAnnounceLoop();
  if (!state.net.isHost) return;
  const announce = () => {
    if (!state.room || state.room.started) return;
    send('room_announce', {
      hostName: state.net.myName,
      settings: state.room.settings,
      players: state.room.players,
    });
  };
  announce();
  announceTimer = setInterval(announce, 3000);
}
export function stopAnnounceLoop() {
  if (announceTimer) { clearInterval(announceTimer); announceTimer = null; }
}

// El anfitrión mantiene la lista de jugadores y la difunde.
export function hostApplyJoin(msg) {
  if (!state.net.isHost || !state.room) return;
  const existing = state.room.players.find((p) => p.pubkey === msg.from);
  if (existing) {
    existing.name = msg.name || existing.name;
    existing.team = msg.team || existing.team;
  } else {
    state.room.players.push({ pubkey: msg.from, name: msg.name || 'Jugador', team: msg.team || 'enemy', isHost: false });
  }
  send('room_announce', { hostName: state.net.myName, settings: state.room.settings, players: state.room.players });
}

export function hostApplyLeave(msg) {
  if (!state.net.isHost || !state.room) return;
  state.room.players = state.room.players.filter((p) => p.pubkey !== msg.from);
  send('room_announce', { hostName: state.net.myName, settings: state.room.settings, players: state.room.players });
}

export function hostApplyTeam(msg) {
  if (!state.net.isHost || !state.room) return;
  const p = state.room.players.find((x) => x.pubkey === msg.from);
  if (p) p.team = msg.team;
  send('room_announce', { hostName: state.net.myName, settings: state.room.settings, players: state.room.players });
}

export function disconnectAll() {
  stopPingLoop();
  stopAnnounceLoop();
  for (const ws of sockets.values()) {
    try { ws.close(); } catch (err) { /* ya cerrado */ }
  }
  sockets.clear();
  updateRelayCount();
}
