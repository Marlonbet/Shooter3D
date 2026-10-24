import * as THREE from 'three';
import { ARENA, ALLY_STYLE, BOT_NAMES } from './config.js';
import { state, player } from './state.js';
import { world, collides, rand } from './world.js';
import { addTracer, addImpact } from './effects.js';
import { updateHUD, addKillfeed } from './hud.js';
import { damagePlayer } from './player.js';
import { navMesh } from './navmesh.js';

const raycaster = new THREE.Raycaster();

// Estados de la IA
const STATES = {
  PATROL: 'patrol',
  SEARCH: 'search',
  COMBAT: 'combat',
  FLANK: 'flank',
  COVER: 'cover'
};

// Fases internas de cobertura
const COVER_PHASE = {
  MOVING: 'moving',
  HIDING: 'hiding',
  PEEKING: 'peeking'
};

export class Bot {
  constructor(cfg, team) {
    this.cfg = cfg;
    this.team = team;
    this.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Math.floor(rand(10, 99));
    this.kills = 0;
    this.deaths = 0;
    
    this.alive = true;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.pos = new THREE.Vector3();
    this.lastPos = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = 0.55;

    // Navegación
    this.nav = navMesh;
    this.path = [];
    this.pathIndex = 0;
    this.pathTimer = 0;
    
    // IA y Percepción
    this.state = STATES.PATROL;
    this.target = null;
    this.targetLockTime = 0;
    this.lastKnownTargetPos = null;
    this.lastKnownTargetTime = 0;
    this.fov = Math.PI * 0.65;           // ~117° (mucho más realista)
    this.hearingRadius = 22;
    this.perceptionTimer = 0;
    
    // Memoria y Reacción
    this.lastAttacker = null;
    this.lastAttackerTime = 0;
    this.suppressedUntil = 0;
    this.lastPlayerPos = new THREE.Vector3();
    this.playerVelocity = new THREE.Vector3();
    this.lastBotPositions = new Map();
    
    // Combate y Movimiento
    this.fireTimer = 0;
    this.reactTimer = cfg.react;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1.0, 3.0);
    this.hitFlash = 0;
    this.dying = 0;
    this.respawnTimer = 0;
    this.faceYaw = 0;
    this.wanderAngle = rand(0, Math.PI * 2);
    
    // Cobertura avanzada
    this.coverCheckTimer = 0;
    this.coverPosition = null;
    this.coverPhase = COVER_PHASE.MOVING;
    this.peekTimer = 0;
    this.hideTimer = 0;
    this.preferredCoverSide = Math.random() < 0.5 ? 1 : -1; 

    // Investigación
    this.investigateTimer = 0;
    this.investigateYaw = 0;
    this.arrivedAtSearchPoint = false;

    // Coordinación de equipo
    this.role = 'assault'; // assault | flanker | suppressor
    this.claimedFlankSide = null;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);

    const isAlly = team === 'ally';
    const bodyColor = isAlly ? ALLY_STYLE.bodyColor : cfg.bodyColor;
    const accent = isAlly ? ALLY_STYLE.accent : cfg.accent;
    this.accentHex = accent;

    this.bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.55, metalness: 0.35, emissive: accent, emissiveIntensity: 0.12 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 12), this.bodyMat);
    body.position.y = 0.95; body.castShadow = true; body.userData.bot = this;
    this.group.add(body);

    this.headMat = new THREE.MeshStandardMaterial({ color: 0x272c36, roughness: 0.4, metalness: 0.7, emissive: accent, emissiveIntensity: 0.45 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), this.headMat);
    head.position.y = 1.78; head.castShadow = true; head.userData.bot = this; head.userData.head = true;
    this.group.add(head);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: accent }));
    visor.position.set(0, 1.8, -0.23); this.group.add(visor);

    const gunMat = new THREE.MeshStandardMaterial({ color: 0x181c24, metalness: 0.85, roughness: 0.3 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.58), gunMat);
    gun.position.set(0.26, 1.24, -0.38); gun.castShadow = true; this.group.add(gun);

    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.4, 3, 6), this.bodyMat);
    armL.position.set(-0.32, 1.22, -0.16); armL.rotation.x = 0.5; this.group.add(armL);
    const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.4, 3, 6), this.bodyMat);
    armR.position.set(0.3, 1.2, -0.2); armR.rotation.x = 0.7; this.group.add(armR);

    if (isAlly) {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 4), new THREE.MeshBasicMaterial({ color: 0x4d9fff }));
      marker.rotation.x = Math.PI; marker.position.y = 2.55; this.group.add(marker);
    }

    const barMatBg = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
    this.barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.12), barMatBg);
    this.barBg.position.set(0, 2.28, 0); this.group.add(this.barBg);

    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.075), new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide, depthWrite: false }));
    this.barFill.position.set(0, 2.28, 0.004); this.group.add(this.barFill);

    this.hitMeshes = [body, head];
  }

  isHostileTo(target) {
    if (state.mode === 'ffa') return true;
    const targetTeam = target.isPlayer ? 'ally' : target.team;
    return this.team !== targetTeam;
  }

  // ==========================================
  // PERCEPCIÓN Y COMUNICACIÓN
  // ==========================================

  hasLOSTo(targetPos) {
    const from = this.pos.clone().setY(1.5);
    const to = targetPos.clone().setY(1.5);
    const d = new THREE.Vector3().subVectors(to, from);
    const len = d.length();
    if (len < 0.5) return true;
    d.normalize();
    raycaster.set(from, d);
    raycaster.far = len - 0.4;
    const hits = raycaster.intersectObjects(world.obstacleMeshes, false);
    return hits.length === 0;
  }

  getAngleTo(targetPos) {
    const forward = new THREE.Vector3(-Math.sin(this.faceYaw), 0, -Math.cos(this.faceYaw));
    const toTarget = new THREE.Vector3().subVectors(targetPos, this.pos).setY(0).normalize();
    return forward.angleTo(toTarget);
  }

  getTargetFacingAngle(target) {
    if (!target) return Math.PI;
    let targetYaw = 0;
    if (target.isPlayer) {
      if (this.playerVelocity.lengthSq() > 0.5) {
        targetYaw = Math.atan2(-this.playerVelocity.x, -this.playerVelocity.z);
      } else {
        return 0; 
      }
    } else if (target.bot) {
      targetYaw = target.bot.faceYaw;
    }
    const toMe = new THREE.Vector3().subVectors(this.pos, target.pos).setY(0).normalize();
    const targetForward = new THREE.Vector3(-Math.sin(targetYaw), 0, -Math.cos(targetYaw));
    return targetForward.angleTo(toMe);
  }

  findVisibleTarget() {
    let best = null, bestDist = Infinity;

    const playerTarget = { isPlayer: true, pos: player.pos, team: 'ally' };
    if (player.alive && this.isHostileTo(playerTarget)) {
      const d = this.pos.distanceTo(player.pos);
      if (d < this.cfg.range && this.hasLOSTo(player.pos)) {
        const angle = this.getAngleTo(player.pos);
        if (angle < this.fov / 2 || d < 3.5) {
          if (d < bestDist) { best = playerTarget; bestDist = d; }
        }
      }
    }
    for (const b of state.bots) {
      if (b === this || !b.alive) continue;
      const botTarget = { bot: b, pos: b.pos, team: b.team };
      if (!this.isHostileTo(botTarget)) continue;
      const d = this.pos.distanceTo(b.pos);
      if (d >= this.cfg.range) continue;
      if (!this.hasLOSTo(b.pos)) continue;
      const angle = this.getAngleTo(b.pos);
      if (angle < this.fov / 2 || d < 3.5) {
        if (d < bestDist) { best = botTarget; bestDist = d; }
      }
    }
    // Multijugador: los bots del anfitrión también ven y atacan
    // a los jugadores reales remotos (no solo al anfitrión).
    for (const r of state.remotePlayers) {
      if (!r.alive) continue;
      const remoteTarget = { isRemote: true, remote: r, pos: r.pos, team: r.team };
      if (!this.isHostileTo(remoteTarget)) continue;
      const d = this.pos.distanceTo(r.pos);
      if (d >= this.cfg.range) continue;
      if (!this.hasLOSTo(r.pos)) continue;
      const angle = this.getAngleTo(r.pos);
      if (angle < this.fov / 2 || d < 3.5) {
        if (d < bestDist) { best = remoteTarget; bestDist = d; }
      }
    }
    return best;
  }

  reportToTeam() {
    if (state.mode !== 'squad' || !this.target) return;
    const intel = state.teamIntel[this.team];
    intel.lastKnownEnemyPos = this.target.pos.clone();
    intel.timestamp = performance.now();
    intel.reporterName = this.name;
    
    if (!intel.flankClaims) intel.flankClaims = {};
  }

  readTeamIntel() {
    if (state.mode !== 'squad') return null;
    const intel = state.teamIntel[this.team];
    if (intel.lastKnownEnemyPos && performance.now() - intel.timestamp < 9000) {
      return { pos: intel.lastKnownEnemyPos.clone(), age: performance.now() - intel.timestamp };
    }
    return null;
  }

  countTeammatesOnFlank(side) {
    if (state.mode !== 'squad') return 0;
    let count = 0;
    for (const b of state.bots) {
      if (b === this || !b.alive || b.team !== this.team) continue;
      if (b.state === STATES.FLANK && b.claimedFlankSide === side) count++;
    }
    return count;
  }

  hearNoise(pos, sourceTeam) {
    if (this.team === sourceTeam) return;
    if (this.pos.distanceTo(pos) < this.hearingRadius) {
      this.lastKnownTargetPos = pos.clone();
      this.lastKnownTargetTime = performance.now();
      if (this.state === STATES.PATROL || this.state === STATES.SEARCH) {
        this.state = STATES.SEARCH;
        this.pathTimer = 0;
        this.arrivedAtSearchPoint = false;
      }
    }
  }

  // ==========================================
  // CÁLCULO DE VELOCIDAD Y PREDICCIÓN
  // ==========================================

  updateTargetVelocity(dt) {
    if (!this.target) {
      this.playerVelocity.set(0, 0, 0);
      return;
    }
    
    if (this.target.isPlayer) {
      if (this.lastPlayerPos.lengthSq() > 0) {
        this.playerVelocity.subVectors(player.pos, this.lastPlayerPos).divideScalar(Math.max(dt, 0.001));
      }
      this.lastPlayerPos.copy(player.pos);
    } else if (this.target.isRemote) {
      const rp = this.target.remote;
      if (this.lastBotPositions.has(rp)) {
        const last = this.lastBotPositions.get(rp);
        this.playerVelocity.subVectors(rp.pos, last).divideScalar(Math.max(dt, 0.001));
      }
      this.lastBotPositions.set(rp, rp.pos.clone());
    } else {
      const bot = this.target.bot;
      if (this.lastBotPositions.has(bot)) {
        const last = this.lastBotPositions.get(bot);
        this.playerVelocity.subVectors(bot.pos, last).divideScalar(Math.max(dt, 0.001));
      }
      this.lastBotPositions.set(bot, bot.pos.clone());
    }
  }

  // ==========================================
  // COBERTURA INTELIGENTE
  // ==========================================

  isCoveredFrom(pos, threatPos) {
    const from = pos.clone().setY(1.0);
    const to = threatPos.clone().setY(1.0);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const dist = from.distanceTo(to);
    raycaster.set(from, dir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(world.obstacleMeshes, false);
    return hits.length > 0;
  }

  findCoverPosition(threatPos, searchRadius = 16) {
    let best = null, bestScore = -Infinity;
    
    const leftBusy = this.countTeammatesOnFlank(-1);
    const rightBusy = this.countTeammatesOnFlank(1);
    const preferSide = leftBusy <= rightBusy ? -1 : 1;

    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      const dist = searchRadius * (0.35 + Math.random() * 0.65);
      const testX = this.pos.x + Math.cos(angle) * dist;
      const testZ = this.pos.z + Math.sin(angle) * dist;
      
      if (!this.nav.isWalkable(testX, testZ)) continue;
      if (collides(testX, testZ, this.radius)) continue;
      
      const testPos = new THREE.Vector3(testX, 0, testZ);
      
      // La posición de cover debe ocultarnos del enemigo
      if (!this.isCoveredFrom(testPos, threatPos)) continue;
      
      // Comprobar si hay un punto de "peek" cercano para poder disparar
      let hasPeek = false;
      for (let p = 0; p < 6; p++) {
        const peekOffset = new THREE.Vector3(
          Math.cos(angle + (p - 2.5) * 0.4) * 1.8,
          0,
          Math.sin(angle + (p - 2.5) * 0.4) * 1.8
        );
        const peekPos = testPos.clone().add(peekOffset);
        
        if (this.nav.isWalkable(peekPos.x, peekPos.z) && !collides(peekPos.x, peekPos.z, this.radius * 0.8)) {
          const fromPeek = peekPos.clone().setY(1.5);
          const toThreat = threatPos.clone().setY(1.5);
          const d = new THREE.Vector3().subVectors(toThreat, fromPeek).normalize();
          raycaster.set(fromPeek, d);
          raycaster.far = fromPeek.distanceTo(toThreat) - 0.3;
          
          // Si desde el peek podemos ver al enemigo, es una cobertura perfecta
          if (raycaster.intersectObjects(world.obstacleMeshes, false).length === 0) {
            hasPeek = true;
            break;
          }
        }
      }
      
      if (!hasPeek && Math.random() > 0.4) continue; // Preferir siempre covers desde las que se pueda asomar

      const distToSelf = this.pos.distanceTo(testPos);
      const distToThreat = testPos.distanceTo(threatPos);
      
      const side = Math.sin(angle) > 0 ? 1 : -1;
      const sideBonus = (side === preferSide) ? 2.5 : 0;
      
      const score = -distToSelf * 0.7 + distToThreat * 0.35 + sideBonus + (hasPeek ? 3 : 0);
      
      if (score > bestScore) {
        bestScore = score;
        best = testPos;
        this.preferredCoverSide = side;
      }
    }
    return best;
  }

  // ==========================================
  // MOVIMIENTO Y PATHFINDING
  // ==========================================

  setDestination(dest) {
    if (!dest) return;
    const randomizedDest = dest.clone().add(new THREE.Vector3(rand(-0.9, 0.9), 0, rand(-0.9, 0.9)));
    const path = this.nav.findPath(this.pos, randomizedDest);
    if (path.length > 0) {
      this.path = this.nav.getSmoothPath(path);
      this.pathIndex = 0;
    }
  }

  followPath(dt, speedMultiplier = 1) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) return null;
    const currentWaypoint = this.path[this.pathIndex];
    const toWaypoint = new THREE.Vector3().subVectors(currentWaypoint, this.pos);
    toWaypoint.y = 0;
    if (toWaypoint.length() < 1.15) {
      this.pathIndex++;
      return this.followPath(dt, speedMultiplier);
    }
    const dir = toWaypoint.normalize();
    const spd = this.cfg.speed * speedMultiplier;
    const stepX = dir.x * spd * dt;
    const stepZ = dir.z * spd * dt;
    if (!collides(this.pos.x + stepX, this.pos.z, this.radius)) this.pos.x += stepX;
    if (!collides(this.pos.x, this.pos.z + stepZ, this.radius)) this.pos.z += stepZ;
    this.pos.x = Math.max(-ARENA + 1.5, Math.min(ARENA - 1.5, this.pos.x));
    this.pos.z = Math.max(-ARENA + 1.5, Math.min(ARENA - 1.5, this.pos.z));
    return dir;
  }

  getRandomPatrolPoint() {
    for (let i = 0; i < 20; i++) {
      const rx = rand(-ARENA + 5, ARENA - 5);
      const rz = rand(-ARENA + 5, ARENA - 5);
      if (this.nav.isWalkable(rx, rz)) return new THREE.Vector3(rx, 0, rz);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  // ==========================================
  // COMBATE Y DISPARO
  // ==========================================

  getCurrentAccuracy() {
    let acc = this.cfg.acc;
    
    const speed = this.velocity.length();
    if (speed > 4) acc *= 0.62;
    else if (speed > 1.5) acc *= 0.82;
    else if (speed < 0.4) acc *= 1.18; 
    
    if (this.targetLockTime > 0.6) acc *= 1.12;
    if (this.targetLockTime > 1.6) acc *= 1.12;
    
    if (performance.now() < this.suppressedUntil) acc *= 0.48;
    
    if (this.coverPhase === COVER_PHASE.PEEKING) acc *= 0.88;
    
    if (this.hp / this.maxHp < 0.3) acc *= 0.85;
    
    return Math.min(0.94, acc);
  }

  shoot() {
    if (!this.target) return;
    if (this.state === STATES.COVER && this.coverPhase === COVER_PHASE.HIDING) return;
    
    const targetPos = this.target.pos.clone();
    targetPos.y = this.target.isPlayer ? 1.35 : 1.2;
    
    if (this.targetLockTime > 0.25) {
      const dist = this.pos.distanceTo(this.target.pos);
      const bulletSpeed = 95;
      const timeToHit = dist / bulletSpeed;
      const leadFactor = Math.min(0.95, 0.55 + this.targetLockTime * 0.2);
      const predictedMove = this.playerVelocity.clone().multiplyScalar(timeToHit * leadFactor);
      targetPos.add(predictedMove);
    }
    
    const from = this.pos.clone().setY(1.32);
    const acc = this.getCurrentAccuracy();
    const hits = Math.random() < acc;
    
    const spreadMultiplier = this.velocity.length() > 3.5 ? 2.3 : (this.coverPhase === COVER_PHASE.PEEKING ? 1.4 : 1.0);
    const aim = hits ? targetPos.clone() : targetPos.clone().add(new THREE.Vector3(
      rand(-1.7, 1.7) * spreadMultiplier,
      rand(-1.1, 1.1) * spreadMultiplier,
      rand(-1.7, 1.7) * spreadMultiplier
    ));

    addTracer(from, aim, this.accentHex, 0.75);

    if (hits) {
      if (this.target.isPlayer) damagePlayer(this.cfg.dmg, this);
      else if (this.target.isRemote) {
        // En red, el daño a un jugador real lo aplica el árbitro
        // (que soy yo, porque solo el anfitrión simula bots).
        window.dispatchEvent(new CustomEvent('neon-bot-shot', {
          detail: {
            targetPubkey: this.target.remote.pubkey,
            damage: this.cfg.dmg,
            botIndex: state.bots.indexOf(this),
            botTeam: this.team,
          },
        }));
      } else {
        const tb = this.target.bot;
        if (tb.alive) tb.takeDamage(this.cfg.dmg, false, this);
      }
    }

    for (const b of state.bots) {
      if (b === this || !b.alive) continue;
      if (typeof b.hearNoise === 'function') b.hearNoise(this.pos, this.team);
    }
  }

  // ==========================================
  // VIDA Y MUERTE
  // ==========================================

  spawn() {
    const isAlly = this.team === 'ally';
    let x = 0, z = 0, ok = false, tries = 0;
    while (!ok && tries < 300) {
      tries++;
      if (isAlly && player.alive) {
        const a = rand(0, Math.PI * 2), d = rand(5, 12);
        x = player.pos.x + Math.cos(a) * d; z = player.pos.z + Math.sin(a) * d;
      } else {
        const a = rand(0, Math.PI * 2), d = rand(16, ARENA - 5);
        x = Math.cos(a) * d; z = Math.sin(a) * d;
      }
      x = Math.max(-ARENA + 3, Math.min(ARENA - 3, x));
      z = Math.max(-ARENA + 3, Math.min(ARENA - 3, z));
      if (collides(x, z, this.radius + 0.3)) continue;
      let tooClose = false;
      for (const b of state.bots) {
        if (b === this || !b.alive) continue;
        if (b.team === this.team) continue;
        if (Math.hypot(x - b.pos.x, z - b.pos.z) < 8) { tooClose = true; break; }
      }
      if (tooClose) continue;
      if (!isAlly && Math.hypot(x - player.pos.x, z - player.pos.z) < 14) continue;
      ok = true;
    }
    if (!ok) { x = rand(-ARENA + 5, ARENA - 5); z = rand(-ARENA + 5, ARENA - 5); }

    this.pos.set(x, 0, z);
    this.group.position.copy(this.pos);
    this.alive = true; this.dying = 0; this.hp = this.maxHp;
    this.target = null; this.reactTimer = this.cfg.react; this.fireTimer = rand(0.2, 0.9);
    this.group.visible = true; this.group.scale.setScalar(1); this.group.rotation.set(0, 0, 0);
    this.barFill.scale.x = 1;
    this.state = STATES.PATROL; this.path = []; this.lastKnownTargetPos = null;
    this.lastAttacker = null; this.targetLockTime = 0;
    this.coverPosition = null; this.coverPhase = COVER_PHASE.MOVING;
    this.arrivedAtSearchPoint = false;
    this.role = Math.random() < 0.35 ? 'flanker' : (Math.random() < 0.5 ? 'suppressor' : 'assault');
    this.claimedFlankSide = null;
    this.updateBarColor();
  }

  updateBarColor() {
    const f = this.hp / this.maxHp;
    const c = this.barFill.material.color;
    if (f > 0.6) c.setHex(0x39ff9e);
    else if (f > 0.3) c.setHex(0xffd23f);
    else c.setHex(0xff4d6d);
  }

  takeDamage(amount, headshot, source) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hitFlash = 1;
    this.barFill.scale.x = Math.max(0, this.hp / this.maxHp);
    this.updateBarColor();
    
    this.suppressedUntil = performance.now() + rand(900, 1400);
    
    if (source === 'player') {
      this.lastAttacker = 'player';
      this.lastAttackerTime = performance.now();
      this.lastKnownTargetPos = player.pos.clone();
      this.lastKnownTargetTime = performance.now();
    } else if (source && source.pos) {
      this.lastAttacker = source;
      this.lastAttackerTime = performance.now();
      this.lastKnownTargetPos = source.pos.clone();
      this.lastKnownTargetTime = performance.now();
    }

    if (this.state === STATES.PATROL || this.state === STATES.SEARCH) {
      this.state = STATES.SEARCH;
      this.arrivedAtSearchPoint = false;
      this.pathTimer = 0;
    }

    if (this.hp <= 0) { this.die(headshot, source); return true; }
    return false;
  }

  die(headshot, source) {
    this.alive = false; this.dying = 0.45; this.respawnTimer = rand(2.2, 3.6);
    this.target = null; this.state = STATES.PATROL;
    this.deaths++;

    if (source === 'player') {
      player.kills++;
      state.score += headshot ? 150 : 100;
      state.kills++;
      // En red el jugador puede ser del bando rojo: el punto va
      // a su bando, no siempre al azul.
      if (state.mode === 'squad') state.teamScore[player.team]++;
      addKillfeed(headshot);
    } else if (source && source.team) {
      source.kills++;
      if (state.mode === 'squad') state.teamScore[source.team]++;
    }

    // En red el fin de partida lo decide el anfitrión en el bucle
    // principal (tiempo o límite de bajas), no cada bot.
    if (!state.net.enabled && state.mode === 'squad' && state.teamScore.ally >= state.killLimit) {
      window.dispatchEvent(new CustomEvent('gameOver', { detail: 'win' }));
    }

    updateHUD();
    const p = this.pos.clone().setY(1.2);
    for (let i = 0; i < 6; i++) {
      addImpact(p.clone().add(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.6, 0.8), rand(-0.6, 0.6))), this.accentHex);
    }
  }

  // ==========================================
  // DECISIONES TÁCTICAS
  // ==========================================

  shouldFlank() {
    if (!this.target) return false;
    const dist = this.pos.distanceTo(this.target.pos);
    if (dist < 7 || dist > 28) return false;

    const facingAngle = this.getTargetFacingAngle(this.target);
    const isLookingAtUs = facingAngle < Math.PI * 0.55;

    let baseChance = this.role === 'flanker' ? 0.55 : (this.role === 'suppressor' ? 0.12 : 0.28);
    
    const leftCount = this.countTeammatesOnFlank(-1);
    const rightCount = this.countTeammatesOnFlank(1);
    if (Math.min(leftCount, rightCount) >= 2) baseChance *= 0.4;

    if (isLookingAtUs) baseChance *= 1.4;
    if (performance.now() < this.suppressedUntil) baseChance *= 0.5;

    return Math.random() < baseChance;
  }

  shouldSeekCover() {
    const healthPct = this.hp / this.maxHp;
    const underFire = performance.now() < this.suppressedUntil;
    
    if (healthPct < 0.38) return true;
    if (healthPct < 0.55 && underFire) return true;
    if (underFire && Math.random() < 0.25) return true;
    return false;
  }

  // ==========================================
  // BUCLE PRINCIPAL DE LA IA
  // ==========================================

  update(dt) {
    if (!this.alive) {
      if (this.dying > 0) {
        this.dying -= dt;
        const k = Math.max(0, this.dying / 0.45);
        this.group.scale.setScalar(k);
        this.group.rotation.z = (1 - k) * 1.4;
        if (this.dying <= 0) this.group.visible = false;
      } else {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.spawn();
      }
      return;
    }

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4.5);
      this.bodyMat.emissiveIntensity = 0.12 + this.hitFlash * 2.2;
      this.headMat.emissiveIntensity = 0.45 + this.hitFlash * 2.2;
    }

    this.velocity.subVectors(this.pos, this.lastPos).divideScalar(Math.max(dt, 0.001));
    this.lastPos.copy(this.pos);

    this.perceptionTimer -= dt;
    if (this.perceptionTimer <= 0) {
      this.perceptionTimer = 0.09;
      const wasVisible = !!this.target;
      this.target = this.findVisibleTarget();
      
      if (this.target) {
        this.lastKnownTargetPos = this.target.pos.clone();
        this.lastKnownTargetTime = performance.now();
        this.reportToTeam();
        if (!wasVisible) this.reactTimer = this.cfg.react * 0.45;
        this.arrivedAtSearchPoint = false;
      } else {
        const intel = this.readTeamIntel();
        if (intel && (!this.lastKnownTargetPos || performance.now() - this.lastKnownTargetTime > intel.age)) {
          this.lastKnownTargetPos = intel.pos;
          this.lastKnownTargetTime = performance.now() - intel.age;
        }
      }
    }

    this.updateTargetVelocity(dt);

    if (this.target) this.targetLockTime += dt;
    else this.targetLockTime = 0;

    const now = performance.now();
    const recentlyAttacked = now - this.lastAttackerTime < 2200;
    
    if (this.target) {
      if (this.shouldSeekCover()) {
        this.state = STATES.COVER;
      } else if (this.shouldFlank()) {
        this.state = STATES.FLANK;
        const left = this.countTeammatesOnFlank(-1);
        const right = this.countTeammatesOnFlank(1);
        this.claimedFlankSide = left <= right ? -1 : 1;
      } else {
        this.state = STATES.COMBAT;
        this.claimedFlankSide = null;
      }
    } else if (this.lastKnownTargetPos && now - this.lastKnownTargetTime < 11000) {
      this.state = STATES.SEARCH;
    } else if (recentlyAttacked) {
      this.state = STATES.SEARCH;
    } else {
      this.state = STATES.PATROL;
      this.claimedFlankSide = null;
    }

    this.pathTimer -= dt;
    let lookAt = null;
    let moveSpeed = 1.0;

    if (this.pathTimer <= 0) {
      this.pathTimer = 0.45 + Math.random() * 0.35;
      
      if (this.state === STATES.PATROL) {
        if (this.path.length === 0 || this.pathIndex >= this.path.length) {
          this.setDestination(this.getRandomPatrolPoint());
        }
      } else if (this.state === STATES.SEARCH) {
        if (this.lastKnownTargetPos) {
          const distToLast = this.pos.distanceTo(this.lastKnownTargetPos);
          if (distToLast < 2.8) {
            this.arrivedAtSearchPoint = true;
          } else {
            this.setDestination(this.lastKnownTargetPos);
            this.arrivedAtSearchPoint = false;
          }
        }
      } else if (this.state === STATES.FLANK) {
        const tPos = this.target.pos;
        const toTarget = new THREE.Vector3().subVectors(tPos, this.pos).setY(0).normalize();
        const side = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(this.claimedFlankSide || this.strafeDir);
        
        const flankPos = tPos.clone()
          .add(side.multiplyScalar(11 + Math.random() * 4))
          .add(toTarget.clone().multiplyScalar(-3)); 
          
        this.setDestination(flankPos);
        moveSpeed = 1.25;
      } else if (this.state === STATES.COVER) {
        this.coverCheckTimer -= dt;
        if (!this.coverPosition || this.coverCheckTimer <= 0 || this.coverPhase === COVER_PHASE.MOVING) {
          this.coverCheckTimer = 2.8;
          const threatPos = this.target ? this.target.pos : (this.lastKnownTargetPos || player.pos);
          this.coverPosition = this.findCoverPosition(threatPos);
          this.coverPhase = COVER_PHASE.MOVING;
        }
        if (this.coverPosition) this.setDestination(this.coverPosition);
        moveSpeed = 1.35;
      }
    }

    if (this.state === STATES.COMBAT && this.target) {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(0.7, 1.9);
        this.strafeDir *= -1;
      }
      
      const tPos = this.target.pos;
      const toTarget = new THREE.Vector3().subVectors(tPos, this.pos).setY(0).normalize();
      const perp = new THREE.Vector3(-toTarget.z, 0, toTarget.x).multiplyScalar(this.strafeDir);
      
      const dist = this.pos.distanceTo(tPos);
      const idealDist = this.role === 'suppressor' ? 14 : (this.role === 'flanker' ? 9 : 11);
      if (dist > idealDist + 3) perp.add(toTarget.clone().multiplyScalar(0.75));
      else if (dist < idealDist - 2.5) perp.sub(toTarget.clone().multiplyScalar(0.8));
      
      perp.normalize();
      
      const strafeSpeed = this.cfg.speed * (this.role === 'flanker' ? 0.85 : 0.68);
      const stepX = perp.x * strafeSpeed * dt;
      const stepZ = perp.z * strafeSpeed * dt;
      if (!collides(this.pos.x + stepX, this.pos.z, this.radius)) this.pos.x += stepX;
      if (!collides(this.pos.x, this.pos.z + stepZ, this.radius)) this.pos.z += stepZ;
      
      lookAt = tPos;
      
    } else if (this.state === STATES.COVER) {
      if (this.coverPosition && this.pos.distanceTo(this.coverPosition) < 1.6) {
        if (this.coverPhase === COVER_PHASE.MOVING) {
          this.coverPhase = COVER_PHASE.HIDING;
          this.hideTimer = rand(0.7, 1.6);
          this.peekTimer = 0;
        }
        
        if (this.coverPhase === COVER_PHASE.HIDING) {
          this.hideTimer -= dt;
          if (Math.random() < 0.02) {
            const micro = new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4));
            if (!collides(this.pos.x + micro.x, this.pos.z + micro.z, this.radius)) {
              this.pos.add(micro);
            }
          }
          
          if (this.hideTimer <= 0 && this.target) {
            this.coverPhase = COVER_PHASE.PEEKING;
            this.peekTimer = rand(0.55, 1.15);
          }
        } else if (this.coverPhase === COVER_PHASE.PEEKING) {
          this.peekTimer -= dt;
          
          if (this.target) {
            const toThreat = new THREE.Vector3().subVectors(this.target.pos, this.pos).setY(0).normalize();
            const peekStep = toThreat.multiplyScalar(1.6 * dt);
            if (!collides(this.pos.x + peekStep.x, this.pos.z + peekStep.z, this.radius * 0.9)) {
              this.pos.x += peekStep.x;
              this.pos.z += peekStep.z;
            }
            lookAt = this.target.pos;
          }
          
          if (this.peekTimer <= 0) {
            this.coverPhase = COVER_PHASE.HIDING;
            this.hideTimer = rand(0.9, 2.1);
            if (this.coverPosition) this.setDestination(this.coverPosition);
          }
        }
      } else {
        this.followPath(dt, moveSpeed);
        this.coverPhase = COVER_PHASE.MOVING;
      }
      
      if (this.target) lookAt = this.target.pos;
      else if (this.lastKnownTargetPos) lookAt = this.lastKnownTargetPos;
      
    } else if (this.state === STATES.SEARCH && this.arrivedAtSearchPoint) {
      this.investigateTimer -= dt;
      if (this.investigateTimer <= 0) {
        this.investigateTimer = rand(0.8, 1.6);
        this.investigateYaw = this.faceYaw + rand(-1.2, 1.2);
        const offset = new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3));
        const newPos = this.pos.clone().add(offset);
        if (this.nav.isWalkable(newPos.x, newPos.z) && !collides(newPos.x, newPos.z, this.radius)) {
          this.setDestination(newPos);
        }
      }
      this.followPath(dt, 0.7);
      
      const lookDir = new THREE.Vector3(-Math.sin(this.investigateYaw), 0, -Math.cos(this.investigateYaw));
      lookAt = this.pos.clone().add(lookDir.multiplyScalar(5));
      
    } else {
      this.followPath(dt, moveSpeed);
      
      if (this.state === STATES.SEARCH && this.lastKnownTargetPos) {
        lookAt = this.lastKnownTargetPos;
      } else if (this.state === STATES.FLANK && this.target) {
        lookAt = this.target.pos;
      } else if (this.lastAttacker && now - this.lastAttackerTime < 1800) {
        if (this.lastAttacker === 'player') lookAt = player.pos;
        else if (this.lastAttacker.pos) lookAt = this.lastAttacker.pos;
      }
    }

    if (this.target && (this.state === STATES.COMBAT || this.state === STATES.FLANK || 
        (this.state === STATES.COVER && this.coverPhase === COVER_PHASE.PEEKING))) {
      
      if (this.hasLOSTo(this.target.pos)) {
        this.fireTimer -= dt;
        if (this.reactTimer > 0) this.reactTimer -= dt;
        else if (this.fireTimer <= 0) {
          const rateMul = this.role === 'suppressor' ? 0.75 : 1.0;
          this.fireTimer = this.cfg.rate * rateMul * rand(0.8, 1.25);
          this.shoot();
        }
      }
    } else {
      this.fireTimer = Math.max(this.fireTimer, 0.25);
    }

    this.group.position.copy(this.pos);
    this.group.position.y = Math.sin(performance.now() * 0.008 + this.pos.x) * 0.035;

    if (lookAt) {
      const lookVec = lookAt.clone().sub(this.pos).setY(0);
      if (lookVec.lengthSq() > 0.01) {
        const targetYaw = Math.atan2(-lookVec.x, -lookVec.z);
        let diff = targetYaw - this.faceYaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        
        const justHit = this.lastAttacker && (now - this.lastAttackerTime < 900);
        const rotSpeed = justHit ? 16 : (this.state === STATES.COVER ? 10 : 8.5);
        this.faceYaw += diff * Math.min(1, dt * rotSpeed);
        this.group.rotation.y = this.faceYaw;
      }
    }
    this.group.updateMatrixWorld(true);
  }
}