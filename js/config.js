export const ARENA = 34;
export const PLAYER_EYE = 1.65;

export const DIFFICULTIES = {
  facil: { label: 'FÁCIL', hp: 55, speed: 2.8, dmg: 4, rate: 1.55, acc: 0.40, range: 30, react: 1.0, bodyColor: 0x1e5c46, accent: 0x39ff9e },
  normal: { label: 'NORMAL', hp: 95, speed: 3.5, dmg: 7, rate: 1.0, acc: 0.62, range: 42, react: 0.6, bodyColor: 0x6b5410, accent: 0xffd23f },
  dificil: { label: 'DIFÍCIL', hp: 150, speed: 4.6, dmg: 10, rate: 0.8, acc: 0.80, range: 55, react: 0.3, bodyColor: 0x5c0e1c, accent: 0xff4d6d }
};

export const ALLY_STYLE = { bodyColor: 0x1e3d7a, accent: 0x4d9fff };
export const MAPS = [{ name: 'ALMACÉN' }, { name: 'DESIERTO' }, { name: 'NEÓN' }];

// Nombres para los bots en el ranking
export const BOT_NAMES = [
  'Viper', 'Ghost', 'Raven', 'Blaze', 'Frost', 'Hawk',
  'Reaper', 'Titan', 'Nova', 'Onyx', 'Jinx', 'Neo',
  'Kilo', 'Echo', 'Sierra', 'Bravo', 'Alpha', 'Delta'
];

export const isMobile = document.documentElement.classList.contains('is-mobile');
export const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;