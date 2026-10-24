import { state, player } from './state.js';

const uiScore = document.getElementById('uiScore');
const uiKills = document.getElementById('uiKills');
const uiAlive = document.getElementById('uiAlive');
const healthBar = document.getElementById('healthBar');
const healthTxt = document.getElementById('healthTxt');
const ammoNow = document.getElementById('ammoNow');
const ammoMax = document.getElementById('ammoMax');
const hitmarkerEl = document.getElementById('hitmarker');
const killfeedEl = document.getElementById('killfeed');

// Elementos de equipo
const teamScoreHud = document.getElementById('teamScoreHud');
const allyScoreEl = document.getElementById('allyScore');
const enemyScoreEl = document.getElementById('enemyScore');
const respawnText = document.getElementById('respawnText');
const respawnTimer = document.getElementById('respawnTimer');
const pingStat = document.getElementById('pingStat');
const pingVal = document.getElementById('pingVal');
const timeStat = document.getElementById('timeStat');
const timeVal = document.getElementById('timeVal');

let hitmarkerTimeout = null;

export function showHitmarker(isHead) {
  hitmarkerEl.classList.toggle('head', isHead);
  hitmarkerEl.style.opacity = '1';
  hitmarkerEl.style.transition = 'none';
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => {
    hitmarkerEl.style.transition = 'opacity .22s';
    hitmarkerEl.style.opacity = '0';
  }, isHead ? 110 : 70);
}

export function addKillfeed(headshot) {
  const el = document.createElement('div');
  el.className = 'kf' + (headshot ? ' head' : '');
  el.textContent = headshot ? '✦ CABEZA +150' : '✕ ELIMINADO +100';
  killfeedEl.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; }, 1200);
  setTimeout(() => el.remove(), 1650);
}

export function updateHUD() {
  uiScore.textContent = state.score;
  uiKills.textContent = state.kills;

  let aliveEnemies = 0;
  for (const b of state.bots) {
    if (!b.alive) continue;
    if (state.mode === 'ffa' || b.team !== player.team) aliveEnemies++;
  }
  for (const r of state.remotePlayers) {
    if (!r.alive) continue;
    if (state.mode === 'ffa' || r.team !== player.team) aliveEnemies++;
  }
  uiAlive.textContent = aliveEnemies;

  // ---- Ping en tiempo real (red) o LOCAL (solo) ----
  if (pingStat && pingVal) {
    if (state.net.enabled) {
      pingStat.classList.remove('hidden');
      const ms = state.net.pingMs;
      pingVal.textContent = ms == null ? '…' : ms + ' ms' + (state.net.rtcDirect ? ' · DIRECTO' : '');
      pingVal.classList.remove('ping-good', 'ping-mid', 'ping-bad');
      if (ms != null) pingVal.classList.add(ms < 150 ? 'ping-good' : ms < 300 ? 'ping-mid' : 'ping-bad');
    } else {
      pingStat.classList.remove('hidden');
      pingVal.textContent = 'LOCAL';
      pingVal.classList.remove('ping-mid', 'ping-bad');
      pingVal.classList.add('ping-good');
    }
  }

  // ---- Tiempo restante (cuando hay límite) ----
  if (timeStat && timeVal) {
    if (state.matchEndsAt && state.running) {
      timeStat.classList.remove('hidden');
      const s = Math.max(0, state.matchTimeLeft);
      timeVal.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    } else {
      timeStat.classList.add('hidden');
    }
  }

  // --- HUD de Equipos (Escuadra) ---
  if (state.mode === 'squad') {
    teamScoreHud.classList.remove('hidden');
    allyScoreEl.textContent = state.teamScore.ally;
    enemyScoreEl.textContent = state.teamScore.enemy;
  } else {
    teamScoreHud.classList.add('hidden');
  }

  // --- Estado de Respawn ---
  if (!player.alive && (state.mode === 'squad' || state.net.enabled) && !state.gameOver) {
    respawnText.style.display = 'block';
    respawnTimer.textContent = Math.ceil(player.respawnTimer);
  } else {
    respawnText.style.display = 'none';
  }

  const hpPct = Math.max(0, player.hp) / player.maxHp * 100;
  healthBar.style.width = hpPct + '%';
  healthBar.classList.remove('low', 'mid');
  if (hpPct <= 33) healthBar.classList.add('low');
  else if (hpPct <= 65) healthBar.classList.add('mid');

  healthTxt.textContent = Math.max(0, Math.round(player.hp));
  ammoNow.textContent = player.ammo;
  ammoMax.textContent = player.magSize;
}

export function buildRanking() {
  const container = document.getElementById('finalRanking');
  container.innerHTML = '';

  // Unir al jugador, a todos los bots y a los jugadores reales.
  // En FFA el ranking es individual: gana quien más bajas tenga
  // (desempate: menos muertes). En Escuadra se ordena igual, y
  // el color indica el bando respecto al tuyo.
  const allActors = [player, ...state.bots, ...state.remotePlayers].filter(a => a.name || a === player);

  // Ordenar por bajas (desc), luego por muertes (asc)
  allActors.sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.deaths - b.deaths;
  });

  allActors.forEach((actor, index) => {
    const isPlayer = actor === player;
    const actorTeam = isPlayer ? player.team : actor.team;
    const isAlly = state.mode === 'squad' ? (actorTeam === player.team) : isPlayer;

    const row = document.createElement('div');
    row.className = `rank-row ${isPlayer ? 'is-player' : ''}`;

    const nameColorClass = isAlly ? 'ally-color' : 'enemy-color';
    const displayName = isPlayer ? `TÚ (${state.net.enabled ? state.net.myName : 'Jugador'})` : actor.name;

    row.innerHTML = `
      <div class="name">
        <span class="rank-num">#${index + 1}</span>
        <span class="${nameColorClass}">${displayName}</span>
      </div>
      <div class="kills">${actor.kills} BAJAS · ${actor.deaths} MUERTES</div>
    `;
    container.appendChild(row);
  });
}