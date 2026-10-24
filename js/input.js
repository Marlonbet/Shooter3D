import { state, player, settings, input, joystick } from './state.js';
import { canvas } from './three-setup.js';
import { isMobile } from './config.js';
import { playerShoot, startReload } from './player.js';
import { pauseGame, resumeGame } from './game.js';
import { requestLock } from './utils.js';

const joystickZone = document.getElementById('joystickZone');
const joystickKnob = document.getElementById('joystickKnob');

export function setupInput() {
  /* ---------- Teclado ---------- */
  window.addEventListener('keydown', (e) => {
    input.keys[e.code] = true;
    if (e.code === 'KeyR' && state.running && !state.paused) startReload();
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'Escape' && state.running && !state.gameOver) {
      if (state.paused) resumeGame(); else pauseGame();
    }
  });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });

  /* ---------- Ratón (PC) ---------- */
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || isMobile) return;
    if (!document.pointerLockElement && state.running && !state.paused) {
      requestLock(); return;
    }
    input.mouseDown = true;
    if (state.running && !state.paused) playerShoot();
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (state.paused || !state.running) return;
    const sens = 0.0021 * settings.mouseSens;
    player.yaw   -= e.movementX * sens;
    player.pitch -= e.movementY * sens * (settings.invertY ? -1 : 1);
    player.pitch = Math.max(-1.52, Math.min(1.52, player.pitch));
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) {
      input.mouseDown = false;
      if (!isMobile && state.running && !state.gameOver && !state.paused) pauseGame();
    }
  });

  /* ---------- Táctil (móvil) ---------- */
  if (!isMobile) return;

  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    const t = e.changedTouches[0];
    const rect = joystickZone.getBoundingClientRect();
    joystick.active = true;
    joystick.touchId = t.identifier;
    joystick.centerX = rect.left + rect.width/2;
    joystick.centerY = rect.top + rect.height/2;
    joystick.maxDist = rect.width * 0.37;
    joystick.x = 0; joystick.y = 0;
    joystickKnob.style.transform = 'translate(0,0)';
  }, { passive:false });

  joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault(); e.stopPropagation();
    for (const t of e.changedTouches) {
      if (t.identifier !== joystick.touchId) continue;
      let dx = t.clientX - joystick.centerX;
      let dy = t.clientY - joystick.centerY;
      const dist = Math.hypot(dx, dy);
      if (dist > joystick.maxDist) {
        dx = dx / dist * joystick.maxDist;
        dy = dy / dist * joystick.maxDist;
      }
      joystick.x = dx / joystick.maxDist;
      joystick.y = dy / joystick.maxDist;
      joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }, { passive:false });

  const endJoystick = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joystick.touchId) continue;
      joystick.active = false;
      joystick.touchId = null;
      joystick.x = 0; joystick.y = 0;
      joystickKnob.style.transform = 'translate(0,0)';
    }
  };
  joystickZone.addEventListener('touchend', endJoystick);
  joystickZone.addEventListener('touchcancel', endJoystick);

  // Cámara táctil sobre el canvas
  const lookTouches = new Map();
  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) lookTouches.set(t.identifier, { x:t.clientX, y:t.clientY });
  }, { passive:false });
  canvas.addEventListener('touchmove', (e) => {
    if (!state.running || state.paused) return;
    e.preventDefault();
    const sens = 0.005 * settings.camSens;
    for (const t of e.changedTouches) {
      const st = lookTouches.get(t.identifier);
      if (!st) continue;
      const dx = t.clientX - st.x, dy = t.clientY - st.y;
      st.x = t.clientX; st.y = t.clientY;
      player.yaw   -= dx * sens;
      player.pitch -= dy * sens * (settings.invertY ? -1 : 1);
      player.pitch = Math.max(-1.52, Math.min(1.52, player.pitch));
    }
  }, { passive:false });
  const endLook = (e) => { for (const t of e.changedTouches) lookTouches.delete(t.identifier); };
  canvas.addEventListener('touchend', endLook);
  canvas.addEventListener('touchcancel', endLook);

  // Botones de acción
  const fireBtn = document.getElementById('fireBtn');
  fireBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!state.running || state.paused || state.gameOver) return;
    input.mouseDown = true;
    playerShoot();
  }, { passive:false });
  fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); input.mouseDown = false; });
  fireBtn.addEventListener('touchcancel', () => { input.mouseDown = false; });

  document.getElementById('reloadBtn').addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (state.running && !state.paused) startReload();
  }, { passive:false });

  document.getElementById('jumpBtn').addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (player.onGround && player.alive && state.running && !state.paused) {
      player.vy = 5.4; player.onGround = false;
    }
  }, { passive:false });

  document.getElementById('pauseBtn').addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (state.running && !state.paused) pauseGame();
    else if (state.paused) resumeGame();
  }, { passive:false });
}