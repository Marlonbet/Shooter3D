// =========================================================
// PANTALLA COMPLETA EN MÓVIL (iOS + Android)
// ---------------------------------------------------------
// La verdad incómoda, en una línea:
// - Android/Chrome: la API Fullscreen SÍ funciona con un toque.
// - iPhone/Safari: la API Fullscreen NO existe (Apple la reserva
//   para vídeo). En iPhone la única pantalla completa real, sin
//   pestañas ni barra de Safari, es abrir el juego como app
//   instalada desde "Añadir a pantalla de inicio".
// Por eso este módulo hace las dos cosas:
//  1. En Android (y en PC) pide pantalla completa de verdad al
//     pulsar el botón y al empezar una partida.
//  2. En iPhone detecta si ya se abrió instalado (standalone) y,
//     si no, muestra las instrucciones exactas para instalarlo.
// El manifest (manifest.webmanifest) + apple-mobile-web-app-capable
// son lo que hace que, una vez instalado, se abra sin navegador.
// =========================================================

export function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export async function enterFullscreen() {
  // iPhone sin instalar: no hay API; se muestra la ayuda.
  if (isIOS() && !isStandalone()) {
    const hint = document.getElementById('installHint');
    if (hint) {
      hint.style.display = 'block';
      hint.scrollIntoView({ block: 'center' });
    }
    return false;
  }
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    } else if (!document.webkitFullscreenElement && el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
    // Intentar fijar horizontal (solo funciona con pantalla
    // completa activa; si falla, se ignora en silencio).
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (err) { /* no soportado */ }
    return true;
  } catch (err) {
    return false;
  }
}

export function setupFullscreen() {
  const btn = document.getElementById('fullscreenBtn');
  if (btn) btn.addEventListener('click', () => { enterFullscreen(); });

  const hint = document.getElementById('installHint');
  const hintText = document.getElementById('installHintText');
  if (!hint || !hintText) return;

  const mobile = document.documentElement.classList.contains('is-mobile');
  if (!mobile || isStandalone()) {
    hint.style.display = 'none';
    return;
  }
  hint.style.display = 'block';
  if (isIOS()) {
    hintText.innerHTML = 'En iPhone, Safari no permite pantalla completa con un botón. Para jugar sin pestañas ni barra: pulsa <b>Compartir</b> (el cuadrado con flecha) → <b>Añadir a pantalla de inicio</b> → abre el juego desde su icono. Así sale a pantalla completa de verdad.';
  } else if (isAndroid()) {
    hintText.innerHTML = 'Para jugar sin pestañas ni barra: pulsa <b>⛶ PANTALLA COMPLETA</b> al empezar, o en Chrome pulsa <b>⋮ → Añadir a pantalla de inicio</b> y abre el juego desde su icono.';
  } else {
    hint.style.display = 'none';
  }
}
