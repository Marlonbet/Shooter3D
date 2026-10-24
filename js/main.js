import { state, player } from './state.js';
import { renderer, scene, camera, sun } from './three-setup.js';
import { buildMap } from './maps.js';
import { updatePlayer, respawnPlayer } from './player.js';
import { updateEffects } from './effects.js';
import { updateHUD } from './hud.js';
import { setupInput } from './input.js';
import { setupUI } from './ui.js';
import { applySettings } from './settings.js';
import { pauseGame, endGame } from './game.js';
import { updateRemotes } from './remote.js';
import { send, sendPlayerPos } from './net.js';
import { broadcastScore } from './arbiter.js';
import { setupLobby } from './lobby.js';
import { setupFullscreen, enterFullscreen } from './fullscreen.js';

/* ---------- Inicialización ---------- */
buildMap(0);
updateHUD();
setupUI();
setupLobby();
setupFullscreen();
setupInput();
applySettings();

// Escuchar el evento global para terminar la partida
window.addEventListener('gameOver', (e) => {
  endGame(e.detail);
});

/* ---------- Game loop ---------- */
let lastTime = performance.now();
let previewAngle = 0;
let lastPosSent = 0;
let lastPos = { x: 9999, z: 9999, yaw: 9999, hp: -1, alive: null };
let lastBotSnap = 0;
let lastScoreSent = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state.running && !state.paused) {

    // ---- Límite de tiempo: fin de partida + ranking ----
    if (state.matchEndsAt) {
      state.matchTimeLeft = Math.max(0, Math.ceil((state.matchEndsAt - Date.now()) / 1000));
      if (state.matchTimeLeft <= 0 && !state.gameOver) {
        if (state.net.enabled && state.net.isHost) send('end', { reason: 'time' });
        endGame('time');
      }
    }

    // ---- Fin por límite de bajas en Escuadra (red: el
    // anfitrión lo anuncia; en solo ya lo disparan los bots) ----
    if (state.net.enabled && state.net.isHost && state.mode === 'squad' && !state.gameOver) {
      if (state.teamScore.ally >= state.killLimit || state.teamScore.enemy >= state.killLimit) {
        send('end', { reason: 'squad_end', teamScore: { ...state.teamScore } });
        endGame(state.teamScore[player.team] >= state.killLimit ? 'win' : 'lose');
      }
    }

    // Lógica de respawn (Escuadra en solo; siempre en red)
    if (!player.alive && !state.gameOver && (state.mode === 'squad' || state.net.enabled)) {
      player.respawnTimer -= dt;
      if (player.respawnTimer <= 0) {
        respawnPlayer();
      }
    }

    updatePlayer(dt);
    // En red, solo el anfitrión simula los bots; los demás los
    // colocan con las fotos (bot_snapshot) que aquel envía.
    if (!state.net.enabled || state.net.isHost) {
      for (const b of state.bots) b.update(dt);
    }
    updateRemotes(dt);
    updateEffects(dt);
    updateHUD();

    // ---- Red: posición, bots y marcador ----
    if (state.net.enabled && player.alive !== false) {
      const t = performance.now();
      const moved = Math.hypot(player.pos.x - lastPos.x, player.pos.z - lastPos.z) > 0.2
        || Math.abs(player.yaw - lastPos.yaw) > 0.05
        || player.hp !== lastPos.hp || player.alive !== lastPos.alive;
      if ((moved && t - lastPosSent >= 100) || t - lastPosSent >= 500) {
        lastPosSent = t;
        lastPos = { x: player.pos.x, z: player.pos.z, yaw: player.yaw, hp: player.hp, alive: player.alive };
        sendPlayerPos({ x: player.pos.x, z: player.pos.z, yaw: player.yaw, pitch: player.pitch, hp: player.hp, alive: player.alive, kills: player.kills, deaths: player.deaths, team: player.team });
      }
      if (state.net.isHost && t - lastBotSnap >= 200) {
        lastBotSnap = t;
        send('bot_snapshot', {
          bots: state.bots.map((b) => ({ x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2), yaw: +b.faceYaw.toFixed(3), hp: Math.round(b.hp), alive: b.alive })),
        });
      }
      if (state.net.isHost && t - lastScoreSent >= 1000) {
        lastScoreSent = t;
        broadcastScore();
      }
    }

    sun.position.set(player.pos.x + 34, 56, player.pos.z + 22);
    sun.target.position.set(player.pos.x, 0, player.pos.z);
    sun.target.updateMatrixWorld();
  } else if (!state.running && !state.gameOver) {
    previewAngle += dt * 0.13;
    const r = 30;
    camera.position.set(
      Math.sin(previewAngle) * r,
      15 + Math.sin(previewAngle * 0.7) * 4,
      Math.cos(previewAngle) * r
    );
    camera.lookAt(0, 1.5, 0);
    updateEffects(dt);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

/* ---------- Resize / orientación ---------- */
function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(handleResize, 120));

const rotateHintEl = document.getElementById('rotateHint');
function checkOrientation() {
  const isMobileNow = document.documentElement.classList.contains('is-mobile');
  if (isMobileNow && state.running && window.innerHeight > window.innerWidth) {
    rotateHintEl.classList.add('on');
  } else {
    rotateHintEl.classList.remove('on');
  }
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 150));

window.addEventListener('blur', () => {
  if (state.running && !state.paused && !state.gameOver) pauseGame();
});