import { BOT_NAMES, DIFFICULTIES, MAPS } from './config.js';
import { state, player } from './state.js';
import {
  initIdentity, setMyName, connectRelays, createRoom, joinRoom,
  leaveRoom, send, sendToHost, npubShort,
} from './net.js';
import { ensureRemote, clearRemotes } from './remote.js';
import { startGame } from './game.js';

// =========================================================
// SALAS MULTIJUGADOR: crear, unirse, sala previa a la partida
// La sala previa muestra TODAS las características antes de
// arrancar: modo, mapa, dificultad, tiempo, límite de bajas,
// bots aliados, bots enemigos, jugadores reales en línea y su
// bando. El bando se elige en la sala (Escuadra); en FFA todos
// juegan solos y el ranking final decide al ganador.
// =========================================================

const $ = (id) => document.getElementById(id);
let editingRoom = false;
let createSettings = null;

function defaultSettings() {
  return {
    mode: 'ffa', mapId: 0, difficulty: 'normal',
    enemyCount: 5, allyCount: 3, killLimit: 30,
    timeLimitMin: 10, maxPlayers: 6,
  };
}

function modeLabel(mode) { return mode === 'squad' ? 'ESCUADRA' : 'FREE FOR ALL'; }
function mapLabel(id) { return (MAPS[id] && MAPS[id].name) || 'ALMACÉN'; }
function diffLabel(d) { return (DIFFICULTIES[d] && DIFFICULTIES[d].label) || d; }

function showOverlay(id) {
  for (const x of ['menu', 'multiplayer', 'createRoom', 'roomLobby', 'settings']) {
    const el = $(x);
    if (el) el.classList.add('hidden');
  }
  const el = $(id);
  if (el) el.classList.remove('hidden');
}

function applySettingsToState(s) {
  state.mode = s.mode;
  state.mapId = s.mapId;
  state.difficulty = s.difficulty;
  state.enemyCount = s.enemyCount;
  state.allyCount = s.allyCount;
  state.killLimit = s.killLimit;
  state.timeLimitMin = s.timeLimitMin;
}

// ---- Pantalla de crear sala ----
function syncCreateUI() {
  const s = createSettings;
  if (!s) return;
  document.querySelectorAll('#createModeOptions button').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.mode));
  document.querySelectorAll('#createMapOptions button').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.map) === s.mapId));
  document.querySelectorAll('#createDiffOptions button').forEach((b) => b.classList.toggle('active', b.dataset.diff === s.difficulty));
  $('createEnemySlider').value = s.enemyCount;
  $('createEnemyLabel').textContent = s.enemyCount;
  $('createAllySlider').value = s.allyCount;
  $('createAllyLabel').textContent = s.allyCount;
  $('createKillSlider').value = s.killLimit;
  $('createKillLabel').textContent = s.killLimit;
  $('createTimeSlider').value = s.timeLimitMin;
  $('createTimeLabel').textContent = s.timeLimitMin + ' min';
  $('createMaxSlider').value = s.maxPlayers;
  $('createMaxLabel').textContent = s.maxPlayers;
  $('createSquadWrap').style.display = s.mode === 'squad' ? 'flex' : 'none';
  $('createConfirmBtn').textContent = editingRoom ? 'GUARDAR Y VOLVER A LA SALA' : 'CREAR SALA';
}

function readCreateUI() {
  return { ...createSettings };
}

// ---- Sala previa a la partida ----
export function renderLobby() {
  const room = state.room;
  if (!room) return;
  const s = room.settings;
  $('roomCodeBig').textContent = room.code || '—';
  $('roomHost').textContent = room.hostName || '—';
  $('roomRelayStatus').textContent = state.net.connected
    ? `● ${state.net.relayCount}/${state.net.totalRelays} relays` : 'Conectando a relays…';
  $('roomPing').textContent = state.net.pingMs == null ? 'Ping: …' : `Ping: ${state.net.pingMs} ms`;
  if (s) {
    $('roomCharMode').textContent = modeLabel(s.mode);
    $('roomCharMap').textContent = mapLabel(s.mapId);
    $('roomCharDiff').textContent = diffLabel(s.difficulty);
    $('roomCharTime').textContent = s.timeLimitMin + ' min';
    $('roomCharKill').textContent = s.mode === 'squad' ? s.killLimit + ' bajas' : '— (ranking por tiempo)';
    $('roomCharAllyBots').textContent = s.mode === 'squad' ? s.allyCount : '—';
    $('roomCharEnemyBots').textContent = s.enemyCount;
    $('roomCharMax').textContent = s.maxPlayers;
  }
  const list = $('roomPlayerList');
  list.innerHTML = '';
  const players = room.players || [];
  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'lobby-player' + (p.pubkey === state.net.myPubkey ? ' is-me' : '');
    const teamTxt = s && s.mode === 'squad'
      ? (p.team === 'ally' ? '🔵 AZUL' : '🔴 ROJO')
      : 'SOLO';
    row.innerHTML = `<span class="lp-name">${p.name}${p.isHost ? ' 👑' : ''}${p.pubkey === state.net.myPubkey ? ' (TÚ)' : ''}</span><span class="lp-team">${teamTxt}</span>`;
    list.appendChild(row);
  }
  $('roomPlayerCount').textContent = `${players.length} jugador${players.length === 1 ? '' : 'es'} en línea`;
  // Botones según rol.
  $('roomStartBtn').style.display = state.net.isHost ? 'block' : 'none';
  $('roomWaitText').style.display = state.net.isHost ? 'none' : 'block';
  $('roomEditBtn').style.display = state.net.isHost ? 'block' : 'none';
  const me = players.find((p) => p.pubkey === state.net.myPubkey);
  const teamWrap = $('roomTeamWrap');
  if (s && s.mode === 'squad' && me) {
    teamWrap.style.display = 'flex';
    document.querySelectorAll('#roomTeamWrap button').forEach((b) => b.classList.toggle('active', b.dataset.team === me.team));
  } else {
    teamWrap.style.display = 'none';
  }
  if (s && s.mode === 'ffa') {
    $('roomTeamHint').textContent = 'En Free For All cada uno juega solo: al acabar el tiempo, gana quien más bajas tenga.';
    $('roomTeamHint').style.display = 'block';
  } else {
    $('roomTeamHint').style.display = 'none';
  }
}

function myTeam() {
  const me = state.room && state.room.players.find((p) => p.pubkey === state.net.myPubkey);
  return me ? me.team : 'ally';
}

function setMyTeam(team) {
  if (!state.room) return;
  const me = state.room.players.find((p) => p.pubkey === state.net.myPubkey);
  if (me) me.team = team;
  if (state.net.isHost) {
    send('room_announce', { hostName: state.net.myName, settings: state.room.settings, players: state.room.players });
  } else {
    sendToHost('team', { team });
  }
  renderLobby();
}

function makeBotNames(settings) {
  const names = [...BOT_NAMES];
  // Barajar para no repetir el mismo orden en cada partida.
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const out = [];
  const total = settings.enemyCount + (settings.mode === 'squad' ? settings.allyCount : 0);
  for (let i = 0; i < total; i++) {
    out.push(names[i % names.length] + '_' + Math.floor(10 + Math.random() * 90));
  }
  return out;
}

function startMultiplayerGame() {
  const room = state.room;
  if (!room || !room.settings) return;
  applySettingsToState(room.settings);
  room.started = true;
  const cfg = DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
  for (const p of room.players) {
    if (p.pubkey !== state.net.myPubkey) ensureRemote(p, cfg);
  }
  startGame();
}

export function setupLobby() {
  // Identidad persistente (clave Nostr guardada en el teléfono).
  try {
    initIdentity();
    connectRelays();
  } catch (err) {
    const st = $('mpStatus');
    if (st) st.textContent = 'Error: ' + err.message;
  }
  const nameInput = $('mpName');
  if (nameInput) {
    nameInput.value = state.net.myName;
    nameInput.addEventListener('change', () => {
      setMyName(nameInput.value);
      if (state.room) {
        const me = state.room.players.find((p) => p.pubkey === state.net.myPubkey);
        if (me) me.name = state.net.myName;
        renderLobby();
      }
    });
  }

  window.addEventListener('neon-relays', () => {
    const st = $('mpStatus');
    if (st) st.textContent = state.net.connected
      ? `● Conectado a ${state.net.relayCount}/${state.net.totalRelays} relays` : 'Conectando a relays…';
    if (state.room) renderLobby();
  });

  $('openMultiplayerBtn').addEventListener('click', () => {
    try { initIdentity(); connectRelays(); } catch (err) { /* ya avisado */ }
    if (nameInput) nameInput.value = state.net.myName;
    showOverlay('multiplayer');
  });
  $('mpBackBtn').addEventListener('click', () => showOverlay('menu'));
  $('mpCreateBtn').addEventListener('click', () => {
    editingRoom = false;
    createSettings = defaultSettings();
    syncCreateUI();
    showOverlay('createRoom');
  });
  $('mpJoinBtn').addEventListener('click', () => {
    const code = ($('mpJoinCode').value || '').trim().toUpperCase();
    if (!code) { alert('Escribe el código de la sala (ejemplo: NEON-7K2P).'); return; }
    const team = $('mpJoinTeam').value || 'enemy';
    joinRoom(code, team);
    showOverlay('roomLobby');
    renderLobby();
  });

  // Crear sala: opciones.
  document.querySelectorAll('#createModeOptions button').forEach((b) => b.addEventListener('click', () => {
    createSettings.mode = b.dataset.mode; syncCreateUI();
  }));
  document.querySelectorAll('#createMapOptions button').forEach((b) => b.addEventListener('click', () => {
    createSettings.mapId = parseInt(b.dataset.map); syncCreateUI();
  }));
  document.querySelectorAll('#createDiffOptions button').forEach((b) => b.addEventListener('click', () => {
    createSettings.difficulty = b.dataset.diff; syncCreateUI();
  }));
  $('createEnemySlider').addEventListener('input', (e) => { createSettings.enemyCount = parseInt(e.target.value); syncCreateUI(); });
  $('createAllySlider').addEventListener('input', (e) => { createSettings.allyCount = parseInt(e.target.value); syncCreateUI(); });
  $('createKillSlider').addEventListener('input', (e) => { createSettings.killLimit = parseInt(e.target.value); syncCreateUI(); });
  $('createTimeSlider').addEventListener('input', (e) => { createSettings.timeLimitMin = parseInt(e.target.value); syncCreateUI(); });
  $('createMaxSlider').addEventListener('input', (e) => { createSettings.maxPlayers = parseInt(e.target.value); syncCreateUI(); });
  $('createBackBtn').addEventListener('click', () => showOverlay(editingRoom ? 'roomLobby' : 'multiplayer'));
  $('createConfirmBtn').addEventListener('click', () => {
    const settings = readCreateUI();
    if (editingRoom) {
      state.room.settings = settings;
      send('room_announce', { hostName: state.net.myName, settings, players: state.room.players });
      showOverlay('roomLobby');
      renderLobby();
    } else {
      createRoom(settings);
      showOverlay('roomLobby');
      renderLobby();
    }
  });

  // Sala previa.
  $('roomCopyBtn').addEventListener('click', async () => {
    const code = state.room ? state.room.code : '';
    try { await navigator.clipboard.writeText(code); $('roomCopyBtn').textContent = '¡COPIADO!'; setTimeout(() => { $('roomCopyBtn').textContent = '📋 COPIAR CÓDIGO'; }, 1500); } catch (err) { /* portapapeles no disponible */ }
  });
  $('roomEditBtn').addEventListener('click', () => {
    editingRoom = true;
    createSettings = { ...(state.room.settings || defaultSettings()) };
    syncCreateUI();
    showOverlay('createRoom');
  });
  document.querySelectorAll('#roomTeamWrap button').forEach((b) => b.addEventListener('click', () => setMyTeam(b.dataset.team)));
  $('roomLeaveBtn').addEventListener('click', () => {
    leaveRoom();
    clearRemotes();
    showOverlay('menu');
  });
  $('roomStartBtn').addEventListener('click', () => {
    const room = state.room;
    if (!room || !state.net.isHost) return;
    const settings = room.settings;
    room.botNames = makeBotNames(settings);
    const startAt = Date.now();
    room.matchEndsAt = settings.timeLimitMin > 0 ? startAt + settings.timeLimitMin * 60000 : 0;
    state.matchEndsAt = room.matchEndsAt;
    send('start', {
      settings, players: room.players, botNames: room.botNames,
      startAt, matchEndsAt: room.matchEndsAt,
    });
    startMultiplayerGame();
  });

  // Mensajes de red que mueven la sala.
  window.addEventListener('neon-net', (e) => {
    const msg = e.detail;
    if (!msg || !state.room) return;
    if (msg.type === 'room_announce' || msg.type === 'room_update') {
      if (!state.net.isHost) {
        state.room.hostPubkey = msg.from;
        state.room.hostName = msg.hostName || state.room.hostName;
        if (msg.settings) state.room.settings = msg.settings;
        if (Array.isArray(msg.players)) {
          state.room.players = msg.players;
          const me = state.room.players.find((p) => p.pubkey === state.net.myPubkey);
          if (!me) {
            // El anfitrión aún no me añadió: reenvío mi join.
            send('join', { name: state.net.myName, team: myTeam() });
          }
        }
        if (!state.room.started) renderLobby();
      } else {
        renderLobby();
      }
    } else if (msg.type === 'start') {
      if (state.net.isHost) return;
      state.room.settings = msg.settings;
      state.room.players = msg.players;
      state.room.botNames = msg.botNames;
      state.room.started = true;
      state.matchEndsAt = msg.matchEndsAt || 0;
      player.team = myTeam();
      startMultiplayerGame();
    } else if (msg.type === 'end') {
      if (msg.reason === 'time') {
        // El fin por tiempo lo marca el anfitrión; si ya terminó
        // en local, endGame lo ignora.
        import('./game.js').then(({ endGame }) => endGame('time'));
      } else if (msg.reason === 'squad_end' && msg.teamScore) {
        state.teamScore = { ...msg.teamScore };
        const won = msg.teamScore[player.team] >= (state.killLimit || 30);
        import('./game.js').then(({ endGame }) => endGame(won ? 'win' : 'lose'));
      }
    } else if (msg.type === 'leave' && msg.from === state.room.hostPubkey && !state.room.started) {
      alert('El anfitrión salió de la sala.');
      leaveRoom();
      clearRemotes();
      showOverlay('menu');
    }
  });

  // Refrescar la sala cada 2 s (ping, relays, jugadores).
  setInterval(() => { if (state.room && !state.room.started) renderLobby(); }, 2000);
}
