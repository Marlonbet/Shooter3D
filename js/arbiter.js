import { state, player } from './state.js';
import { send, hostApplyJoin, hostApplyLeave, hostApplyTeam } from './net.js';
import { getRemote } from './remote.js';

// =========================================================
// ÁRBITRO (solo corre en el anfitrión)
// El anfitrión es el único que aplica daño y lleva el marcador.
// Un cliente que dispara no se da la baja a sí mismo: envía
// 'hit' y espera el 'damage' / 'bot_damage' del anfitrión.
// Validación básica anti-trampa: tirador vivo, objetivo vivo y
// distancia razonable (70 m, con margen para el retardo).
// =========================================================

function shooterPos(pubkey) {
  if (pubkey === state.net.myPubkey) return player.pos;
  const r = getRemote(pubkey);
  return r ? r.pos : null;
}

function broadcastDamage(targetPubkey, amount, headshot, killerPubkey, killerKills, victimHp, died) {
  send('damage', {
    target: targetPubkey, amount, headshot,
    killer: killerPubkey, killerKills, victimHp, died,
  });
}

export function broadcastScore() {
  if (!state.net.isHost) return;
  const players = [{ pubkey: state.net.myPubkey, kills: player.kills, deaths: player.deaths }];
  for (const r of state.remotePlayers) players.push({ pubkey: r.pubkey, kills: r.kills, deaths: r.deaths });
  send('score', { teamScore: { ...state.teamScore }, players });
}

function applyDamageToRemote(victim, amount, headshot, killerPubkey, killer) {
  if (!victim.alive) return;
  victim.hp = Math.max(0, victim.hp - amount);
  victim.setHp(victim.hp);
  let died = false;
  if (victim.hp <= 0) {
    victim.alive = false;
    victim.deaths++;
    victim.group.visible = false;
    died = true;
    if (killer) {
      killer.kills++;
      if (killer === player) state.kills++;
      if (state.mode === 'squad' && killer.team) state.teamScore[killer.team]++;
    }
  }
  const killerKills = killer ? killer.kills : 0;
  broadcastDamage(victim.pubkey, amount, headshot, killerPubkey, killerKills, victim.hp, died);
}

// Impactos ya vistos (hitId -> hora): un mismo disparo puede
// llegar por Nostr y por el canal directo; el segundo se ignora
// para no aplicar daño doble. Se podan los de más de 30 s.
const seenHitIds = new Map();

function handleHit(msg) {
  if (!state.net.isHost) return;
  if (msg.hitId) {
    const now = Date.now();
    if (seenHitIds.has(msg.hitId)) return;
    seenHitIds.set(msg.hitId, now);
    if (seenHitIds.size > 500) {
      for (const [id, t] of seenHitIds) if (now - t > 30000) seenHitIds.delete(id);
    }
  }
  const shooter = msg.from;
  const sPos = shooterPos(shooter);
  if (!sPos) return;
  // El tirador debe estar vivo (salvo que sea el propio anfitrión,
  // cuyo estado local ya se conoce).
  if (shooter !== state.net.myPubkey) {
    const r = getRemote(shooter);
    if (!r || !r.alive) return;
  } else if (!player.alive) return;

  const killer = shooter === state.net.myPubkey ? player : getRemote(shooter);
  // Para bots, el "killer" que cuenta en Bot.die es el remoto o
  // la cadena 'player' si dispara el anfitrión.
  const killerForBot = shooter === state.net.myPubkey ? 'player' : killer;
  if (!killer) return;

  if (msg.targetKind === 'bot') {
    const bot = state.bots[msg.targetIndex];
    if (!bot || !bot.alive) return;
    const dist = sPos.distanceTo(bot.pos);
    if (dist > 70) return;
    const diedBefore = bot.alive;
    bot.takeDamage(msg.damage, !!msg.headshot, killerForBot);
    // takeDamage ya actualizó bajas y marcador en el anfitrión.
    const killerKills = shooter === state.net.myPubkey ? player.kills : (killer ? killer.kills : 0);
    send('bot_damage', {
      botIndex: msg.targetIndex, hp: Math.max(0, bot.hp), alive: bot.alive,
      headshot: !!msg.headshot, killer: shooter, killerKills,
    });
    if (diedBefore && !bot.alive) broadcastScore();
  } else if (msg.targetKind === 'remote') {
    const victim = getRemote(msg.targetPubkey);
    if (!victim || !victim.alive) return;
    const dist = sPos.distanceTo(victim.pos);
    if (dist > 70) return;
    // En FFA todos son enemigos; en Escuadra no hay fuego amigo
    // entre compañeros (el cliente tampoco debería haberlo enviado).
    if (state.mode === 'squad' && killer && killer.team === victim.team) return;
    applyDamageToRemote(victim, msg.damage, !!msg.headshot, shooter, killer);
    if (!victim.alive) broadcastScore();
  }
}

function handleBotShot(detail) {
  if (!state.net.isHost) return;
  const victim = getRemote(detail.targetPubkey);
  if (!victim || !victim.alive) return;
  const bot = state.bots[detail.botIndex];
  // El bot atacante cuenta como "killer" para el marcador de
  // equipo en Escuadra; sus bajas no se persiguen por jugador.
  const fakeKiller = { team: detail.botTeam, kills: bot ? bot.kills : 0 };
  applyDamageToRemote(victim, detail.damage, false, null, fakeKiller);
  if (bot) bot.kills = fakeKiller.kills;
}

window.addEventListener('neon-net', (e) => {
  const msg = e.detail;
  if (!msg) return;
  if (msg.type === 'hit') handleHit(msg);
  else if (msg.type === 'join' && state.net.isHost) hostApplyJoin(msg);
  else if (msg.type === 'leave' && state.net.isHost) hostApplyLeave(msg);
  else if (msg.type === 'team' && state.net.isHost) hostApplyTeam(msg);
});

window.addEventListener('neon-bot-shot', (e) => {
  if (e.detail) handleBotShot(e.detail);
});
