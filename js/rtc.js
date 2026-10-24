// =========================================================
// CANAL DIRECTO WebRTC (vía rápida, Nostr sigue de respaldo)
// ---------------------------------------------------------
// Problema que resuelve: con los dos teléfonos en datos
// móviles, el ping por Nostr medido en Cuba fue 700 ms
// (teléfono -> relay internacional -> otro teléfono -> relay
// -> vuelta). Eso se siente en bots, en el otro jugador y en
// la confirmación de los disparos.
// Idea: en cuanto dos jugadores están en la misma sala, sus
// navegadores intentan conectarse DIRECTO entre sí con
// WebRTC (DataChannel). La señalización (oferta, respuesta y
// candidatos ICE) viaja por Nostr, que ya funciona, pero el
// juego en sí, si lo directo conecta, ya no pasa por ningún
// relay: si los dos están en la misma red de ETECSA, el
// tráfico puede quedarse dentro de Cuba y el ping cae mucho.
// Si lo directo NO conecta (NAT simétrico, UDP bloqueado),
// no pasa nada: Nostr sigue llevando todo como antes, porque
// cada mensaje de juego se envía por AMBOS caminos en
// paralelo (ver send() en net.js) y los receptores filtran
// los duplicados (pos y fotos por secuencia, daño y marcador
// por ser idempotentes, impactos por hitId en arbiter.js).
// Costo: cero. Solo STUN (descubrir la dirección pública),
// sin TURN (sin relay de tráfico, sin límite de megas, sin
// tarjeta). Si STUN de Google está bloqueado, se prueba
// también el de Metered.
// =========================================================

import { state } from './state.js';
import { send, setRtcSender, setRtcCloser, handlePingMessage, handlePongMessage } from './net.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
];

const peers = new Map(); // pubkey -> { pc, channel, open, retryTimer }
let rtcSupported = typeof RTCPeerConnection !== 'undefined';

function ensureRtcStats() {
  if (!state.net.rtcStats) state.net.rtcStats = { offerSent: 0, offerRecv: 0, answerSent: 0, answerRecv: 0, iceSent: 0, iceRecv: 0 };
  return state.net.rtcStats;
}

function updateState() {
  let open = 0;
  let connecting = false;
  let failed = false;
  for (const p of peers.values()) {
    if (p.open) open++;
    const st = p.pc ? p.pc.connectionState : '';
    if (st === 'connecting' || st === 'checking' || st === 'new') connecting = true;
    if (st === 'failed' || st === 'disconnected' || st === 'closed') failed = true;
  }
  state.net.rtcDirect = open > 0;
  state.net.rtcPeerCount = open;
  state.net.rtcStatus = open > 0 ? 'abierto' : connecting ? 'conectando…' : failed ? 'fallido' : peers.size > 0 ? 'sin canal' : 'sin par';
}

function closePeer(pubkey) {
  const p = peers.get(pubkey);
  if (!p) return;
  if (p.retryTimer) clearTimeout(p.retryTimer);
  try { if (p.channel) p.channel.close(); } catch (err) { /* ya cerrado */ }
  try { p.pc.close(); } catch (err) { /* ya cerrado */ }
  peers.delete(pubkey);
  updateState();
}

export function closeAllPeers() {
  for (const pubkey of Array.from(peers.keys())) closePeer(pubkey);
}

function sendDirectTo(peer, msg) {
  if (!peer.open || !peer.channel || peer.channel.readyState !== 'open') return false;
  try {
    peer.channel.send(JSON.stringify(msg));
    return true;
  } catch (err) {
    return false;
  }
}

// Envío por el canal directo. Lo registra net.js: cada send()
// de juego, además de publicar por Nostr, llama aquí.
// targetPubkey: si viene, solo a ese par; si no, a todos los
// pares directos abiertos (difusión, como Nostr).
function sendDirect(msg, targetPubkey) {
  if (targetPubkey) {
    const peer = peers.get(targetPubkey);
    return peer ? sendDirectTo(peer, msg) : false;
  }
  let any = false;
  for (const peer of peers.values()) if (sendDirectTo(peer, msg)) any = true;
  return any;
}

function handleDirectMessage(peerPubkey, data) {
  let msg;
  try { msg = JSON.parse(data); } catch (err) { return; }
  if (!msg || msg.v !== 1 || !msg.type) return;
  if (msg.type.startsWith('rtc_')) return; // señalización no va por aquí
  if (msg.from === state.net.myPubkey) return;
  if (msg.type === 'ping') {
    // Respuesta SOLO por el canal directo (el camino rápido).
    // El ping también llegó por Nostr y se responde por Nostr
    // en net.js; el primero que vuelva es el que mide el Ping.
    handlePingMessage(msg, (id, t) => {
      sendDirect({ v: 1, type: 'pong', from: state.net.myPubkey, name: state.net.myName, id, t }, peerPubkey);
    });
    return;
  }
  if (msg.type === 'pong') {
    handlePongMessage(msg);
    return;
  }
  // El resto (pos, bot_snapshot, hit, damage, score, start...)
  // se procesa exactamente igual que si viniera por Nostr:
  // los mismos oyentes de 'neon-net' lo reciben.
  window.dispatchEvent(new CustomEvent('neon-net', { detail: { ...msg, pubkey: msg.from } }));
}

function setupChannel(peerPubkey, channel) {
  const peer = peers.get(peerPubkey);
  if (!peer) return;
  peer.channel = channel;
  channel.onopen = () => { peer.open = true; updateState(); };
  channel.onclose = () => {
    peer.open = false;
    updateState();
    // Si se cae el canal en mitad de partida, el invitado pide
    // una nueva oferta al anfitrión (por Nostr, que sigue vivo).
    if (!state.net.isHost && state.room && state.room.hostPubkey === peerPubkey) {
      if (peer.retryTimer) clearTimeout(peer.retryTimer);
      peer.retryTimer = setTimeout(() => {
        if (state.room) send('rtc_request', { target: peerPubkey }, peerPubkey);
      }, 2000);
    }
  };
  channel.onmessage = (ev) => handleDirectMessage(peerPubkey, ev.data);
}

function createPeer(peerPubkey, initiator) {
  if (!rtcSupported) return null;
  const existing = peers.get(peerPubkey);
  if (existing) {
    // Ya hay una negociación en curso o abierta: no duplicar,
    // salvo que esté cerrada o fallida (entonces se recrea).
    const st = existing.pc.connectionState;
    if (existing.open || st === 'connecting' || st === 'connected' || st === 'new') return existing;
    closePeer(peerPubkey);
  }
  let pc;
  try {
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  } catch (err) {
    return null;
  }
  const peer = { pc, channel: null, open: false, retryTimer: null };
  peers.set(peerPubkey, peer);
  pc.onicecandidate = (ev) => {
    if (ev.candidate && state.room) {
      if (send('rtc_ice', { target: peerPubkey, candidate: ev.candidate }, peerPubkey)) ensureRtcStats().iceSent++;
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') peer.open = false;
    updateState();
  };
  if (initiator) {
    try {
      const channel = pc.createDataChannel('neon', { ordered: true });
      setupChannel(peerPubkey, channel);
    } catch (err) { /* sin canal */ }
  } else {
    pc.ondatachannel = (ev) => setupChannel(peerPubkey, ev.channel);
  }
  return peer;
}

async function startOffer(peerPubkey) {
  const existing = peers.get(peerPubkey);
  if (existing && existing.open) return; // ya hay canal directo
  const peer = createPeer(peerPubkey, true);
  if (!peer || !state.room) return;
  updateState();
  try {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    if (send('rtc_offer', { target: peerPubkey, sdp: peer.pc.localDescription }, peerPubkey)) ensureRtcStats().offerSent++;
  } catch (err) { /* la oferta falló: queda Nostr */ }
}

async function handleOffer(msg) {
  ensureRtcStats().offerRecv++;
  const peer = createPeer(msg.from, false);
  if (!peer || !state.room) return;
  updateState();
  try {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    if (send('rtc_answer', { target: msg.from, sdp: peer.pc.localDescription }, msg.from)) ensureRtcStats().answerSent++;
  } catch (err) { /* queda Nostr */ }
}

async function handleAnswer(msg) {
  ensureRtcStats().answerRecv++;
  const peer = peers.get(msg.from);
  if (!peer) return;
  try { await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp)); } catch (err) { /* queda Nostr */ }
  updateState();
}

async function handleIce(msg) {
  ensureRtcStats().iceRecv++;
  const peer = peers.get(msg.from);
  if (!peer || !msg.candidate) return;
  try { await peer.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (err) { /* candidato tardío */ }
}

// ---- Señalización por Nostr (oyente de 'neon-net') ----
window.addEventListener('neon-net', (e) => {
  const msg = e.detail;
  if (!msg || !msg.type || !msg.type.startsWith('rtc_')) return;
  if (msg.from === state.net.myPubkey) return;
  // Solo el destinatario actúa (los demás de la sala lo ignoran).
  if (msg.target && msg.target !== state.net.myPubkey) return;
  if (!state.room) return;
  if (msg.type === 'rtc_offer') handleOffer(msg);
  else if (msg.type === 'rtc_answer') handleAnswer(msg);
  else if (msg.type === 'rtc_ice') handleIce(msg);
  else if (msg.type === 'rtc_request' && state.net.isHost) {
    // El invitado pide (re)negociar: si ya hay canal abierto
    // no se hace nada; si no, se lanza una oferta nueva.
    const peer = peers.get(msg.from);
    if (peer && peer.open) return;
    startOffer(msg.from);
  }
});

// El anfitrión arranca la negociación cuando entra un invitado
// (oyente aparte: 'join' no es un mensaje rtc_* y el oyente
// de arriba lo ignoraría).
window.addEventListener('neon-net', (e) => {
  const msg = e.detail;
  if (!msg || msg.type !== 'join' || !state.net.isHost) return;
  if (msg.from === state.net.myPubkey) return;
  startOffer(msg.from);
});

// Al arrancar la partida, asegurar la negociación con todos:
// el anfitrión ofrece a cada jugador, el invitado pide al
// anfitrión si aún no hay canal.
window.addEventListener('neon-net', (e) => {
  const msg = e.detail;
  if (!msg || msg.type !== 'start') return;
  if (state.net.isHost && state.room) {
    for (const p of state.room.players || []) {
      if (p.pubkey !== state.net.myPubkey) startOffer(p.pubkey);
    }
  } else if (!state.net.isHost && state.room && state.room.hostPubkey) {
    const peer = peers.get(state.room.hostPubkey);
    if (!peer || !peer.open) send('rtc_request', { target: state.room.hostPubkey }, state.room.hostPubkey);
  }
});

// Registrar el envío directo en net.js y el cierre al salir.
if (rtcSupported) {
  setRtcSender(sendDirect);
  setRtcCloser(closeAllPeers);
}
