import * as THREE from 'three';

// =========================================================
// ESTADO GLOBAL DEL JUEGO
// =========================================================
export const state = {
  running: false,
  paused: false,
  gameOver: false,
  
  // Puntuación y estadísticas globales
  score: 0,
  kills: 0,
  
  // Configuración de la partida actual
  mode: 'ffa', // 'ffa' | 'squad'
  difficulty: 'normal',
  mapId: 0,
  enemyCount: 7,
  allyCount: 3,
  killLimit: 30,
  // Límite de tiempo en minutos (0 = sin límite). En FFA es la
  // condición de fin: al agotarse se muestra el ranking final.
  timeLimitMin: 10,
  // Instante (ms, reloj local) en que termina la partida, o 0.
  matchEndsAt: 0,
  // Segundos restantes, calculado en el bucle principal.
  matchTimeLeft: 0,

  // ---- Multijugador (Nostr) ----
  // net.enabled: partida en red. net.isHost: este cliente es el
  // anfitrión y árbitro (valida impactos, simula los bots, lleva
  // el marcador). Los jugadores remotos viven en remotePlayers.
  net: {
    enabled: false,
    isHost: false,
    connected: false,
    relayCount: 0,
    totalRelays: 0,
    pingMs: null,
    myPubkey: null,
    myName: 'Jugador',
    // Contadores de diagnóstico de red (para saber, sin adivinar,
    // si los mensajes llegan o se pierden por el camino).
    stats: { pingSent: 0, pingRecv: 0, posRecv: 0, botSnapRecv: 0, lastPosAt: 0, lastBotSnapAt: 0 },
    // Canal directo WebRTC (ver rtc.js): true si al menos un
    // par está conectado en directo; si no, todo va por Nostr.
    rtcDirect: false,
    rtcPeerCount: 0,
  },
  // Sala actual antes y durante la partida.
  room: null, // { code, hostPubkey, hostName, settings, players, started }
  // Jugadores reales remotos (objetos de remote.js).
  remotePlayers: [],
  
  // Marcador por equipos (Escuadra)
  teamScore: { ally: 0, enemy: 0 },
  
  // Lista de bots instanciados
  bots: [],
  
  // Memoria compartida de los equipos (NUEVO)
  // Permite que los bots aliados y enemigos se comuniquen entre sí
  // para saber dónde vieron al enemigo por última vez.
  teamIntel: {
    ally: {
      lastKnownEnemyPos: null,
      timestamp: 0,
      reporterName: null,
      flankClaims: {}
    },
    enemy: {
      lastKnownEnemyPos: null,
      timestamp: 0,
      reporterName: null,
      flankClaims: {}
    }
  }
};

// =========================================================
// ESTADO DEL JUGADOR
// =========================================================
export const player = {
  pos: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
  recoilPitch: 0,
  
  // Vida y físicas
  hp: 100,
  maxHp: 100,
  radius: 0.45,
  speed: 6.2,
  alive: true,
  team: 'ally',
  
  // Arma
  ammo: 30,
  magSize: 30,
  reloading: false,
  reloadTimer: 0,
  reloadTime: 1.35,
  fireCooldown: 0,
  gunKick: 0,
  
  // Movimiento
  bob: 0,
  bobAmp: 0,
  vy: 0,
  onGround: true,
  
  // Estadísticas del jugador
  name: 'TÚ (Jugador)',
  kills: 0,
  deaths: 0,
  respawnTimer: 0
};

// =========================================================
// AJUSTES DEL JUGADOR
// =========================================================
export const settings = {
  camSens: 1.0,
  mouseSens: 1.0,
  btnScale: 1.0,
  ctrlOpacity: 1.0,
  invertY: false
};

// =========================================================
// ENTRADA (Teclado, Ratón y Táctil)
// =========================================================
export const input = {
  keys: {},
  mouseDown: false
};

export const joystick = {
  active: false,
  touchId: null,
  centerX: 0,
  centerY: 0,
  x: 0,
  y: 0,
  maxDist: 52
};