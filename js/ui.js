import { state } from './state.js';
import { isMobile } from './config.js';
import { buildMap } from './maps.js';
import { startGame, pauseGame, resumeGame, quitToMenu } from './game.js';
import { setupSettings } from './settings.js';

const menuEl = document.getElementById('menu');
const settingsEl = document.getElementById('settings');
const squadSettingsWrap = document.getElementById('squadSettingsWrap');
const enemyCountLabel = document.getElementById('enemyCountLabel');
const allyCountLabel = document.getElementById('allyCountLabel');
const killLimitLabel = document.getElementById('killLimitLabel');

function updateModeUI() {
  const isSquad = state.mode === 'squad';
  squadSettingsWrap.style.display = isSquad ? 'flex' : 'none';
}

export function setupUI() {
  document.querySelectorAll('#modeOptions button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#modeOptions button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mode = btn.dataset.mode;
      updateModeUI();
    });
  });
  
  document.querySelectorAll('#diffOptions button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#diffOptions button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.difficulty = btn.dataset.diff;
    });
  });
  
  document.querySelectorAll('#mapOptions button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mapOptions button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.mapId = parseInt(btn.dataset.map);
      buildMap(state.mapId);
    });
  });
  
  document.getElementById('enemyCountSlider').addEventListener('input', (e) => {
    state.enemyCount = parseInt(e.target.value);
    enemyCountLabel.textContent = state.enemyCount;
  });
  
  document.getElementById('allyCountSlider').addEventListener('input', (e) => {
    state.allyCount = parseInt(e.target.value);
    allyCountLabel.textContent = state.allyCount;
  });
  
  document.getElementById('killLimitSlider').addEventListener('input', (e) => {
    state.killLimit = parseInt(e.target.value);
    killLimitLabel.textContent = state.killLimit;
  });

  const timeLimitSlider = document.getElementById('timeLimitSlider');
  const timeLimitLabel = document.getElementById('timeLimitLabel');
  if (timeLimitSlider) {
    timeLimitSlider.addEventListener('input', (e) => {
      state.timeLimitMin = parseInt(e.target.value);
      timeLimitLabel.textContent = state.timeLimitMin === 0 ? 'Sin límite' : state.timeLimitMin + ' min';
    });
  }
  
  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('resumeBtn').addEventListener('click', resumeGame);
  document.getElementById('quitBtn').addEventListener('click', quitToMenu);
  document.getElementById('retryBtn').addEventListener('click', startGame);
  document.getElementById('menuBtn').addEventListener('click', quitToMenu);
  
  document.getElementById('openSettingsBtn').addEventListener('click', () => {
    menuEl.classList.add('hidden');
    settingsEl.classList.remove('hidden');
  });
  document.getElementById('closeSettingsBtn').addEventListener('click', () => {
    settingsEl.classList.add('hidden');
    menuEl.classList.remove('hidden');
  });
  
  setupSettings();
  
  const controlsHint = document.getElementById('controlsHint');
  if (isMobile) {
    controlsHint.innerHTML = '<b>Joystick</b> mover · <b>Deslizar</b> apuntar<br><b>DISPARAR</b> · <b>RECARGAR</b> · <b>SALTAR</b>';
  } else {
    controlsHint.innerHTML = '<b>WASD</b> mover · <b>Ratón</b> apuntar · <b>Clic izq.</b> disparar · <b>R</b> recargar<br><b>Shift</b> correr · <b>Espacio</b> saltar · <b>Esc</b> pausa';
  }
  
  updateModeUI();
}