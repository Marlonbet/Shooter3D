import * as THREE from 'three';
import { ALLY_STYLE, DIFFICULTIES } from './config.js';
import { state } from './state.js';
import { scene } from './three-setup.js';
import { addTracer, addImpact } from './effects.js';

// =========================================================
// JUGADORES REALES REMOTOS
// Misma silueta que un bot, pero sin IA: su posición, giro y
// vida llegan por Nostr y se interpolan para que el movimiento
// no se vea a saltos. En modo Escuadra el color indica el bando;
// en FFA todos usan el color enemigo (rojo/rosa).
// =========================================================

function makeNameSprite(name, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 48;
  const ctx = canvas.getContext('2d');
  ctx.font = '700 26px "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = colorHex;
  ctx.fillText(name.slice(0, 18), 128, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 0.45, 1);
  sprite.position.y = 2.62;
  return sprite;
}

export class RemotePlayer {
  constructor(meta, cfg) {
    this.pubkey = meta.pubkey;
    this.name = meta.name || 'Jugador';
    this.team = meta.team || 'enemy';
    this.kills = 0;
    this.deaths = 0;
    this.alive = true;
    this.hp = 100;
    this.maxHp = 100;
    this.pos = new THREE.Vector3(meta.x || 0, 0, meta.z || 0);
    this.targetPos = this.pos.clone();
    this.yaw = 0;
    this.targetYaw = 0;
    this.pitch = 0;
    this.radius = 0.55;
    this.lastSeq = -1;
    this.lastSeen = performance.now();

    const isAlly = this.team === 'ally';
    const bodyColor = isAlly ? ALLY_STYLE.bodyColor : (cfg ? cfg.bodyColor : 0x5c0e1c);
    const accent = isAlly ? ALLY_STYLE.accent : (cfg ? cfg.accent : 0xff4d6d);
    this.accentHex = accent;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.35, emissive: accent, emissiveIntensity: 0.12 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 12), this.bodyMat);
    body.position.y = 0.95; body.castShadow = true; body.userData.remote = this;
    this.group.add(body);
    this.headMat = new THREE.MeshStandardMaterial({ color: 0x272c36, roughness: 0.4, metalness: 0.7, emissive: accent, emissiveIntensity: 0.45 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), this.headMat);
    head.position.y = 1.78; head.castShadow = true; head.userData.remote = this; head.userData.head = true;
    this.group.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: accent }));
    visor.position.set(0, 1.8, -0.23); this.group.add(visor);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.58), new THREE.MeshStandardMaterial({ color: 0x181c24, metalness: 0.85, roughness: 0.3 }));
    gun.position.set(0.26, 1.24, -0.38); this.group.add(gun);
    if (isAlly) {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 4), new THREE.MeshBasicMaterial({ color: 0x4d9fff }));
      marker.rotation.x = Math.PI; marker.position.y = 2.55; this.group.add(marker);
    }
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
    barBg.position.set(0, 2.28, 0); this.group.add(barBg);
    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.075), new THREE.MeshBasicMaterial({ color: 0x39ff9e, side: THREE.DoubleSide, depthWrite: false }));
    this.barFill.position.set(0, 2.28, 0.004); this.group.add(this.barFill);
    this.nameSprite = makeNameSprite(this.name, isAlly ? '#4d9fff' : '#ff5c8a');
    this.group.add(this.nameSprite);
    this.hitMeshes = [body, head];
    scene.add(this.group);
  }

  applySnapshot(s) {
    if (typeof s.seq === 'number' && s.seq <= this.lastSeq) return;
    if (typeof s.seq === 'number') this.lastSeq = s.seq;
    this.lastSeen = performance.now();
    this.targetPos.set(s.x, 0, s.z);
    this.targetYaw = s.yaw;
    this.pitch = s.pitch || 0;
    if (typeof s.hp === 'number') this.setHp(s.hp);
    if (typeof s.alive === 'boolean' && s.alive !== this.alive) this.setAlive(s.alive);
    if (typeof s.kills === 'number') this.kills = s.kills;
    if (typeof s.deaths === 'number') this.deaths = s.deaths;
  }

  setHp(hp) {
    this.hp = Math.max(0, hp);
    this.barFill.scale.x = Math.max(0, this.hp / this.maxHp);
    const f = this.hp / this.maxHp;
    this.barFill.material.color.setHex(f > 0.6 ? 0x39ff9e : f > 0.3 ? 0xffd23f : 0xff4d6d);
  }

  setAlive(alive) {
    this.alive = alive;
    this.group.visible = alive;
    if (alive) this.group.scale.setScalar(1);
  }

  update(dt) {
    // Interpolación: el remoto se acerca a la última posición
    // recibida en vez de teletransportarse a ella.
    const k = 1 - Math.exp(-dt * 11);
    this.pos.lerp(this.targetPos, k);
    let diff = this.targetYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * k;
    this.group.position.copy(this.pos);
    this.group.position.y = Math.sin(performance.now() * 0.008 + this.pos.x) * 0.035;
    this.group.rotation.y = this.yaw;
    // La barra es de doble cara (como en los bots) y el nombre es
    // un sprite, así que ambos se leen desde cualquier ángulo.
  }

  dispose() {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }
}

export function getRemote(pubkey) {
  return state.remotePlayers.find((r) => r.pubkey === pubkey) || null;
}

export function ensureRemote(meta, cfg) {
  let r = getRemote(meta.pubkey);
  if (!r) {
    r = new RemotePlayer(meta, cfg);
    state.remotePlayers.push(r);
  } else if (meta.team && meta.team !== r.team) {
    // Cambio de bando en la sala: se recrea con el color del bando.
    removeRemote(meta.pubkey);
    r = new RemotePlayer(meta, cfg);
    state.remotePlayers.push(r);
  }
  return r;
}

export function removeRemote(pubkey) {
  const i = state.remotePlayers.findIndex((r) => r.pubkey === pubkey);
  if (i >= 0) {
    state.remotePlayers[i].dispose();
    state.remotePlayers.splice(i, 1);
  }
}

export function clearRemotes() {
  for (const r of state.remotePlayers) r.dispose();
  state.remotePlayers.length = 0;
}

export function updateRemotes(dt) {
  for (const r of state.remotePlayers) {
    if (r.alive) r.update(dt);
    // Sin noticias 10 s: se considera desconectado y se oculta.
    if (performance.now() - r.lastSeen > 10000 && r.group.visible) r.group.visible = false;
    else if (r.alive && performance.now() - r.lastSeen <= 10000 && !r.group.visible) r.group.visible = true;
  }
}

// Mensajes de red que afectan a los remotos (llegan como evento
// 'neon-net' desde net.js). Esto evita importaciones circulares:
// net.js solo publica el evento, remote.js decide qué hacer.
window.addEventListener('neon-net', (e) => {
  const msg = e.detail;
  if (!msg) return;
  if (msg.type === 'pos') {
    if (msg.from === state.net.myPubkey) return;
    const cfg = DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
    const r = ensureRemote({ pubkey: msg.from, name: msg.name, team: msg.team || 'enemy' }, cfg);
    r.applySnapshot(msg);
  } else if (msg.type === 'bot_snapshot' && Array.isArray(msg.bots)) {
    // Solo el anfitrión simula los bots; los demás los colocan
    // donde dice la foto que llega 5 veces por segundo.
    if (state.net.isHost) return;
    msg.bots.forEach((b, i) => {
      const bot = state.bots[i];
      if (!bot) return;
      bot.pos.set(b.x, 0, b.z);
      bot.group.position.copy(bot.pos);
      bot.faceYaw = b.yaw;
      bot.group.rotation.y = b.yaw;
      bot.hp = b.hp;
      bot.barFill.scale.x = Math.max(0, bot.hp / bot.maxHp);
      if (typeof bot.updateBarColor === 'function') bot.updateBarColor();
      if (!b.alive && bot.alive) { bot.alive = false; bot.group.visible = false; }
      else if (b.alive && !bot.alive) { bot.alive = true; bot.group.visible = true; bot.group.scale.setScalar(1); }
    });
  } else if (msg.type === 'shot' && msg.from !== state.net.myPubkey) {
    const r = getRemote(msg.from);
    if (!r) return;
    const from = new THREE.Vector3(msg.ox, msg.oy, msg.oz);
    const to = new THREE.Vector3(msg.tx, msg.ty, msg.tz);
    addTracer(from, to, r.accentHex, 0.75);
  } else if (msg.type === 'bot_damage') {
    // Si la baja es mía, el árbitro me dice cuántas llevo.
    if (msg.killer === state.net.myPubkey) {
      window.dispatchEvent(new CustomEvent('neon-my-kills', { detail: { kills: msg.killerKills } }));
    }
    const bot = state.bots[msg.botIndex];
    if (!bot) return;
    bot.hp = msg.hp;
    bot.barFill.scale.x = Math.max(0, bot.hp / bot.maxHp);
    if (typeof bot.updateBarColor === 'function') bot.updateBarColor();
    if (!msg.alive && bot.alive) {
      bot.alive = false;
      bot.group.visible = false;
    }
  } else if (msg.type === 'score') {
    if (msg.teamScore) state.teamScore = { ...msg.teamScore };
    if (Array.isArray(msg.players)) {
      for (const p of msg.players) {
        const r = getRemote(p.pubkey);
        if (r) { r.kills = p.kills; r.deaths = p.deaths; }
      }
    }
  }
});

// Trazadora del disparo de un remoto: la dibuja quien la recibe
// usando el origen y el punto final que envía el tirador.
window.addEventListener('neon-shot-fx', (e) => {
  const d = e.detail;
  if (!d) return;
  addTracer(new THREE.Vector3(d.ox, d.oy, d.oz), new THREE.Vector3(d.tx, d.ty, d.tz), d.color || 0x9dfcff, 0.75);
  if (d.hit) addImpact(new THREE.Vector3(d.tx, d.ty, d.tz), 0xff5577);
});
