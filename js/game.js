import { DIFFICULTIES, isMobile } from './config.js';
import { state, player } from './state.js';
import { scene } from './three-setup.js';
import { disposeGroup } from './world.js';
import { buildMap } from './maps.js';
import { clearEffects } from './effects.js';
import { Bot } from './bot.js';
import { updateHUD, buildRanking } from './hud.js';
import { requestLock } from './utils.js';
import { clearRemotes } from './remote.js';
import { enterFullscreen } from './fullscreen.js';

const menuEl = document.getElementById('menu');
const settingsEl = document.getElementById('settings');
const pauseEl = document.getElementById('pause');
const gameoverEl = document.getElementById('gameover');
const hudEl = document.getElementById('hud');
const mobileControlsEl = document.getElementById('mobileControls');
const pauseBtnEl = document.getElementById('pauseBtn');
const gameoverTitle = document.getElementById('gameoverTitle');

export function startGame() {
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  state.score = 0;
  state.kills = 0;
  state.teamScore = { ally: 0, enemy: 0 }; // Resetear equipos

  buildMap(state.mapId);

  // En red, el bando y el nombre vienen de la sala.
  if (state.net.enabled && state.room) {
    const me = state.room.players.find((p) => p.pubkey === state.net.myPubkey);
    if (me) player.team = me.team || 'ally';
    player.name = state.net.myName;
  } else {
    player.team = 'ally';
  }
  // Límite de tiempo: en red lo fija el anfitrión en el evento
  // 'start' (matchEndsAt); en solitario se calcula aquí.
  if (state.net.enabled) {
    if (!state.matchEndsAt && state.timeLimitMin > 0) state.matchEndsAt = Date.now() + state.timeLimitMin * 60000;
  } else {
    state.matchEndsAt = state.timeLimitMin > 0 ? Date.now() + state.timeLimitMin * 60000 : 0;
  }
  state.matchTimeLeft = state.matchEndsAt ? Math.max(0, Math.ceil((state.matchEndsAt - Date.now()) / 1000)) : 0;

  player.pos.set(0, 0, 0);
  player.yaw = 0; player.pitch = 0; player.recoilPitch = 0;
  player.vy = 0; player.onGround = true;
  player.hp = player.maxHp; player.alive = true;
  player.ammo = player.magSize; player.reloading = false;
  player.fireCooldown = 0; player.bob = 0; player.bobAmp = 0; player.gunKick = 0;
  player.kills = 0; player.deaths = 0; player.respawnTimer = 0;

  for (const b of state.bots) { scene.remove(b.group); disposeGroup(b.group); }
  state.bots.length = 0;

  const cfg = DIFFICULTIES[state.difficulty];

  // Nombres de bots: en red los fija el anfitrión en 'start'
  // para que todos vean los mismos nombres en el mismo orden.
  const botNames = (state.net.enabled && state.room && Array.isArray(state.room.botNames))
    ? state.room.botNames : null;
  let botNameIdx = 0;
  const makeBot = (team) => {
    const b = new Bot(cfg, team);
    if (botNames && botNames[botNameIdx]) b.name = botNames[botNameIdx];
    botNameIdx++;
    b.spawn();
    scene.add(b.group);
    state.bots.push(b);
    return b;
  };
  for (let i = 0; i < state.enemyCount; i++) makeBot('enemy');
  if (state.mode === 'squad') {
    for (let i = 0; i < state.allyCount; i++) makeBot('ally');
  }
  // Jugadores reales: al arrancar, todos vivos y con vida llena.
  for (const r of state.remotePlayers) { r.setAlive(true); r.setHp(r.maxHp); r.kills = 0; r.deaths = 0; }

  clearEffects();

  menuEl.classList.add('hidden');
  settingsEl.classList.add('hidden');
  for (const id of ['multiplayer', 'createRoom', 'roomLobby']) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }
  pauseEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  hudEl.classList.add('on');

  if (isMobile) {
    mobileControlsEl.classList.add('on');
    pauseBtnEl.classList.add('on');
    // Android: pantalla completa real. iPhone: solo funciona si
    // el juego se abrió instalado (ver js/fullscreen.js).
    enterFullscreen();
  }

  document.getElementById('ammoWrap').classList.remove('reloading');
  document.getElementById('reloadHint').classList.remove('on');
  document.getElementById('lowHealthVignette').style.opacity = 0;
  document.getElementById('respawnText').style.display = 'none';

  updateHUD();
  requestLock();
}

export function pauseGame() {
  if (!state.running || state.gameOver) return;
  state.paused = true;
  pauseEl.classList.remove('hidden');
  import('./state.js').then(({ input }) => {
    input.mouseDown = false;
    for (const k in input.keys) input.keys[k] = false;
  });
}

export function resumeGame() {
  if (state.gameOver) return;
  state.paused = false;
  pauseEl.classList.add('hidden');
  requestLock();
}

export function endGame(reason) {
  if (state.gameOver) return;
  state.gameOver = true;
  state.running = false;
  if (document.pointerLockElement) document.exitPointerLock();

  // Configurar textos según la razón
  if (reason === 'win') {
    gameoverTitle.textContent = '¡VICTORIA!';
    gameoverTitle.style.color = '#4dffd0';
    gameoverTitle.style.textShadow = '0 0 40px rgba(60,255,180,0.7)';
  } else if (reason === 'time') {
    // Fin por límite de tiempo (FFA y resto): el ranking manda.
    gameoverTitle.textContent = '¡TIEMPO AGOTADO!';
    gameoverTitle.style.color = '#ffd76e';
    gameoverTitle.style.textShadow = '0 0 40px rgba(255,200,60,0.7)';
  } else if (reason === 'lose') {
    gameoverTitle.textContent = 'DERROTA';
    gameoverTitle.style.color = '#ff5c8a';
    gameoverTitle.style.textShadow = '0 0 40px rgba(255,60,110,0.7)';
  } else {
    gameoverTitle.textContent = 'ELIMINADO';
    gameoverTitle.style.color = '#ff5c8a';
    gameoverTitle.style.textShadow = '0 0 40px rgba(255,60,110,0.7)';
  }

  document.getElementById('finalScore').textContent = state.score;
  
  // Construir y mostrar el ranking
  buildRanking();
  
  gameoverEl.classList.remove('hidden');
  hudEl.classList.remove('on');
  mobileControlsEl.classList.remove('on');
  pauseBtnEl.classList.remove('on');
}

export function quitToMenu() {
  state.running = false; state.paused = false; state.gameOver = false;
  if (document.pointerLockElement) document.exitPointerLock();
  pauseEl.classList.add('hidden');
  gameoverEl.classList.add('hidden');
  hudEl.classList.remove('on');
  mobileControlsEl.classList.remove('on');
  pauseBtnEl.classList.remove('on');
  menuEl.classList.remove('hidden');
  settingsEl.classList.add('hidden');

  buildMap(state.mapId);
  for (const b of state.bots) { scene.remove(b.group); disposeGroup(b.group); }
  state.bots.length = 0;
  clearRemotes();
  state.matchEndsAt = 0;
  state.matchTimeLeft = 0;
}

// Escuchar el evento global de fin de juego
window.addEventListener('gameOver', (e) => {
  endGame(e.detail);
});