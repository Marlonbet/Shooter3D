import { settings, joystick } from './state.js';

export function applySettings() {
  document.documentElement.style.setProperty('--btn-scale', settings.btnScale);
  document.documentElement.style.setProperty('--ctrl-opacity', settings.ctrlOpacity);

  document.getElementById('camSensLabel').textContent = settings.camSens.toFixed(1);
  document.getElementById('mouseSensLabel').textContent = settings.mouseSens.toFixed(1);
  document.getElementById('btnScaleLabel').textContent = settings.btnScale.toFixed(1);
  document.getElementById('opacityLabel').textContent = settings.ctrlOpacity.toFixed(1);
}

export function setupSettings() {
  document.getElementById('camSensSlider').addEventListener('input', (e) => {
    settings.camSens = parseFloat(e.target.value); applySettings();
  });
  document.getElementById('mouseSensSlider').addEventListener('input', (e) => {
    settings.mouseSens = parseFloat(e.target.value); applySettings();
  });
  document.getElementById('btnScaleSlider').addEventListener('input', (e) => {
    settings.btnScale = parseFloat(e.target.value); applySettings();
  });
  document.getElementById('opacitySlider').addEventListener('input', (e) => {
    settings.ctrlOpacity = parseFloat(e.target.value); applySettings();
  });
  document.getElementById('invertYToggle').addEventListener('change', (e) => {
    settings.invertY = e.target.checked;
  });
}