import { isMobile } from './config.js';
import { canvas } from './three-setup.js';

export function requestLock() {
  if (isMobile) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (err) { /* ignore */ }
}