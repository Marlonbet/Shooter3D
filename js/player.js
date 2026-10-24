import * as THREE from 'three';
import { ARENA, PLAYER_EYE } from './config.js';
import { state, player, input, joystick } from './state.js';
import { camera, gunGroup } from './three-setup.js';
import { world, collides, rand } from './world.js';
import { addTracer, addImpact } from './effects.js';
import { updateHUD, showHitmarker } from './hud.js';
import { send, sendToHost } from './net.js';

const raycaster = new THREE.Raycaster();

// Daño confirmado por el anfitrión (red). No se vuelve a contar
// la baja del asesino aquí: el árbitro ya la contó y la envía en
// el propio mensaje (killerKills).
window.addEventListener('neon-net', (e) => {
  const msg = e.detail;
  if (!msg || msg.type !== 'damage') return;
  if (msg.target === state.net.myPubkey) {
    if (!player.alive) return;
    player.hp = Math.max(0, msg.victimHp);
    const vig = document.getElementById('damageVignette');
    if (vig) {
      vig.style.opacity = Math.min(0.95, 0.35 + msg.amount / 22);
      setTimeout(() => { vig.style.opacity = 0; }, 90);
    }
    if (msg.died) playerDie(null);
    updateHUD();
  } else if (msg.killer === state.net.myPubkey) {
    player.kills = msg.killerKills;
    state.kills = msg.killerKills;
    updateHUD();
  }
});
window.addEventListener('neon-my-kills', (e) => {
  if (!e.detail) return;
  player.kills = e.detail.kills;
  state.kills = e.detail.kills;
  updateHUD();
});

export function damagePlayer(amount, source = null) {
  if (!player.alive || state.gameOver) return;
  player.hp -= amount;
  const vig = document.getElementById('damageVignette');
  vig.style.opacity = Math.min(0.95, 0.35 + amount / 22);
  setTimeout(() => { vig.style.opacity = 0; }, 90);
  if (player.hp <= 0) { player.hp = 0; playerDie(source); }
  updateHUD();
}

export function playerDie(source) {
  player.alive = false;
  player.deaths++;
  gunGroup.visible = false;

  // Registrar quién nos mató. En red, el daño de otro jugador
  // llega con source=null (el árbitro ya lo contó); este camino
  // solo lo usan los bots locales del anfitrión.
  if (source && source.team) {
    source.kills++;
    if (state.mode === 'squad') state.teamScore[source.team]++;
  }

  if (state.net.enabled) {
    // En red siempre hay reaparición (también en FFA): la
    // partida termina por tiempo o por límite de bajas, y el
    // ranking final decide al ganador.
    player.respawnTimer = 3.0;
  } else if (state.mode === 'ffa') {
    // En solitario, morir en FFA es definitivo
    window.dispatchEvent(new CustomEvent('gameOver', { detail: 'dead' }));
  } else {
    // En Escuadra hay respawn
    player.respawnTimer = 3.0;
    if (state.teamScore.enemy >= state.killLimit) {
      window.dispatchEvent(new CustomEvent('gameOver', { detail: 'lose' }));
    }
  }
  updateHUD();
}

export function respawnPlayer() {
  player.alive = true;
  player.hp = player.maxHp;
  player.ammo = player.magSize;
  if (state.net.enabled) {
    // En red, reaparecer en un punto aleatorio (no siempre en el
    // centro, para que no te esperen en el mismo sitio).
    let x = 0, z = 0, ok = false, tries = 0;
    while (!ok && tries < 100) {
      tries++;
      x = rand(-ARENA + 5, ARENA - 5); z = rand(-ARENA + 5, ARENA - 5);
      if (collides(x, z, player.radius + 0.3)) continue;
      ok = true;
    }
    player.pos.set(x, 0, z);
  } else {
    player.pos.set(0, 0, 0); // Reaparecer en el centro
  }
  player.vy = 0;
  player.onGround = true;
  player.reloading = false;
  gunGroup.visible = true;
  
  document.getElementById('damageVignette').style.opacity = 0;
  document.getElementById('respawnText').style.display = 'none';
  document.getElementById('ammoWrap').classList.remove('reloading');
  document.getElementById('reloadHint').classList.remove('on');
  
  updateHUD();
}

export function startReload() {
  if (player.reloading || player.ammo === player.magSize || !player.alive) return;
  player.reloading = true;
  player.reloadTimer = player.reloadTime;
  document.getElementById('ammoWrap').classList.add('reloading');
  document.getElementById('reloadHint').classList.add('on');
}

export function playerShoot() {
  if (!player.alive || state.paused) return;
  if (player.reloading || player.fireCooldown > 0) return;
  if (player.ammo <= 0) { startReload(); return; }

  player.ammo--;
  player.fireCooldown = 0.095;
  player.gunKick = 1;
  player.recoilPitch += 0.011;

  const moving = input.keys['KeyW'] || input.keys['KeyA'] || input.keys['KeyS'] || input.keys['KeyD'] ||
                 (joystick.active && Math.hypot(joystick.x, joystick.y) > 0.1);
  const spread = moving ? 0.021 : 0.008;

  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  dir.x += (Math.random() - 0.5) * spread * 2;
  dir.y += (Math.random() - 0.5) * spread * 2;
  dir.z += (Math.random() - 0.5) * spread * 2;
  dir.normalize();

  const origin = camera.position.clone();
  raycaster.set(origin, dir);
  raycaster.far = 180;

  const targets = [];
  for (const b of state.bots) if (b.alive) targets.push(...b.hitMeshes);
  for (const r of state.remotePlayers) if (r.alive) targets.push(...r.hitMeshes);
  targets.push(...world.obstacleMeshes);

  const hits = raycaster.intersectObjects(targets, false);
  const muzzle = new THREE.Vector3(0.25, -0.16, -0.85).applyQuaternion(camera.quaternion).add(origin);
  const netMode = state.net.enabled;

  // Reclamación de impacto al árbitro (red) o daño local (solo).
  const claimHit = (targetKind, targetIndex, targetPubkey, dmg, isHead) => {
    if (!netMode) return;
    const claim = { targetKind, targetIndex, targetPubkey, damage: dmg, headshot: isHead };
    if (state.net.isHost) {
      // El anfitrión se aplica su propio impacto sin pasar por
      // el relay (sus mensajes propios se filtran en net.js).
      window.dispatchEvent(new CustomEvent('neon-net', { detail: { type: 'hit', from: state.net.myPubkey, ...claim } }));
    } else {
      sendToHost('hit', claim);
    }
  };

  if (hits.length > 0) {
    const hit = hits[0];
    const bot = hit.object.userData.bot;
    const remote = hit.object.userData.remote;

    if (remote) {
      const isHead = !!hit.object.userData.head;
      const dmg = isHead ? 68 : 26;
      if (state.mode === 'squad' && remote.team === player.team) {
        addTracer(muzzle, hit.point, 0x4d9fff);
        addImpact(hit.point, 0x4d9fff);
      } else {
        addTracer(muzzle, hit.point, 0x9dfcff);
        addImpact(hit.point, 0xff5577);
        showHitmarker(isHead);
        claimHit('remote', null, remote.pubkey, dmg, isHead);
        // Daño optimista (solo invitado): la barra baja al
        // instante; si el árbitro lo rechaza, la siguiente foto
        // o mensaje de vida la corrige. Sin esto, el invitado
        // veía que disparaba y nada pasaba durante 1-2 s.
        if (!state.net.isHost && typeof remote.setHp === 'function') remote.setHp(Math.max(0, remote.hp - dmg));
      }
    } else if (bot && bot.team === 'ally' && state.mode === 'squad' && !netMode) {
      addTracer(muzzle, hit.point, 0x4d9fff);
      addImpact(hit.point, 0x4d9fff);
    } else if (bot && state.mode === 'squad' && netMode && bot.team === player.team) {
      // Fuego amigo desactivado en Escuadra en red (vale para
      // bots aliados y enemigos según el bando elegido).
      addTracer(muzzle, hit.point, 0x4d9fff);
      addImpact(hit.point, 0x4d9fff);
    } else if (bot) {
      const isHead = !!hit.object.userData.head;
      const dmg = isHead ? 68 : 26;
      if (netMode) {
        addTracer(muzzle, hit.point, 0x9dfcff);
        addImpact(hit.point, 0xff5577);
        showHitmarker(isHead);
        claimHit('bot', state.bots.indexOf(bot), null, dmg, isHead);
        // Daño optimista (solo invitado): igual que arriba, la
        // barra baja ya; el árbitro confirma o corrige después.
        if (!state.net.isHost) {
          bot.hp = Math.max(0, bot.hp - dmg);
          bot.barFill.scale.x = Math.max(0, bot.hp / bot.maxHp);
          if (typeof bot.updateBarColor === 'function') bot.updateBarColor();
        }
      } else {
        bot.takeDamage(dmg, isHead, 'player');
        addTracer(muzzle, hit.point, 0x9dfcff);
        addImpact(hit.point, 0xff5577);
        showHitmarker(isHead);
      }
    } else {
      addTracer(muzzle, hit.point, 0x9dfcff);
      addImpact(hit.point, 0x9dfcff);
    }
    // Que los demás vean mi trazadora.
    if (netMode) send('shot', { ox: muzzle.x, oy: muzzle.y, oz: muzzle.z, tx: hit.point.x, ty: hit.point.y, tz: hit.point.z });
  } else {
    const end = origin.clone().add(dir.clone().multiplyScalar(80));
    addTracer(muzzle, end, 0x9dfcff);
    if (netMode) send('shot', { ox: muzzle.x, oy: muzzle.y, oz: muzzle.z, tx: end.x, ty: end.y, tz: end.z });
  }

  if (!netMode || state.net.isHost) {
    for (const b of state.bots) {
      if (b.alive && typeof b.hearNoise === 'function') b.hearNoise(player.pos, player.team);
    }
  }
  updateHUD();
}

export function updatePlayer(dt) {
  if (!player.alive) return;

  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.recoilPitch += (0 - player.recoilPitch) * Math.min(1, dt * 9);
  player.gunKick += (0 - player.gunKick) * Math.min(1, dt * 13);

  if (player.reloading) {
    player.reloadTimer -= dt;
    if (player.reloadTimer <= 0) {
      player.reloading = false;
      player.ammo = player.magSize;
      document.getElementById('ammoWrap').classList.remove('reloading');
      document.getElementById('reloadHint').classList.remove('on');
      updateHUD();
    }
  }

  if (input.mouseDown && !player.reloading) playerShoot();

  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right   = new THREE.Vector3( Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  let fwdInput = 0, rightInput = 0;
  if (input.keys['KeyW']) fwdInput += 1;
  if (input.keys['KeyS']) fwdInput -= 1;
  if (input.keys['KeyD']) rightInput += 1;
  if (input.keys['KeyA']) rightInput -= 1;
  if (joystick.active) {
    fwdInput = -joystick.y;
    rightInput = joystick.x;
  }

  const move = new THREE.Vector3().addScaledVector(forward, fwdInput).addScaledVector(right, rightInput);
  const moving = move.lengthSq() > 0.0001;
  if (moving) move.normalize();

  const sprinting = input.keys['ShiftLeft'] || input.keys['ShiftRight'] || (joystick.active && Math.hypot(joystick.x, joystick.y) > 0.9);
  const speed = player.speed * (sprinting ? 1.45 : 1);

  if (moving) {
    const stepX = move.x * speed * dt;
    const stepZ = move.z * speed * dt;
    if (!collides(player.pos.x + stepX, player.pos.z, player.radius)) player.pos.x += stepX;
    if (!collides(player.pos.x, player.pos.z + stepZ, player.radius)) player.pos.z += stepZ;
    player.bob += dt * (sprinting ? 15 : 11);
    player.bobAmp = Math.min(1, player.bobAmp + dt * 6);
  } else {
    player.bobAmp = Math.max(0, player.bobAmp - dt * 6);
  }

  if (input.keys['Space'] && player.onGround) { player.vy = 5.4; player.onGround = false; }
  if (!player.onGround) {
    player.vy -= 17 * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.onGround = true; }
  }

  player.pos.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, player.pos.x));
  player.pos.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, player.pos.z));

  const bobY = Math.sin(player.bob) * 0.045 * player.bobAmp;
  const bobX = Math.cos(player.bob * 0.5) * 0.03 * player.bobAmp;

  camera.position.set(
    player.pos.x + bobX * Math.cos(player.yaw),
    player.pos.y + PLAYER_EYE + bobY,
    player.pos.z - bobX * Math.sin(player.yaw));
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch + player.recoilPitch;

  const k = player.gunKick;
  gunGroup.position.set(0.25, -0.21 + k * 0.015, -0.48 + k * 0.07);
  gunGroup.rotation.set(k * 0.18, 0.06, k * 0.05);

  const lowVig = document.getElementById('lowHealthVignette');
  if (player.hp <= 35) lowVig.style.opacity = 0.35 + Math.sin(performance.now() * 0.004) * 0.18;
  else lowVig.style.opacity = 0;
}