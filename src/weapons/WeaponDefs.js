/**
 * Weapon data. Angles in degrees, distances in meters, times in seconds.
 * Recoil patterns are per-shot view kicks [yaw, pitch] (deg) indexed by consecutive shot number.
 */
function pattern(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(i));
  return out;
}

const DEG = Math.PI / 180;
const NO_SPREAD = { base: 0, move: 0, air: 0, crouch: 1, perShot: 0, recover: 1 };

export const WEAPONS = {
  knife: {
    key: 'knife', name: 'CUCHILLO', short: 'CUCHILLO', slot: 3, type: 'melee', auto: true,
    damage: 42, hsMult: 2.2, rpm: 150, range: 1.9, mag: Infinity, reserve: 0,
    speed: 1.0, swapTime: 0.25, sound: 'knife', price: 0, killReward: 1500,
    spread: NO_SPREAD, recoil: { recover: 10, scale: 1 }, pattern: pattern(4, () => [0, 0.6]),
  },
  pistol: {
    key: 'pistol', name: 'PISTOLA', short: 'PISTOLA', slot: 2, type: 'pistol', auto: false,
    damage: 35, hsMult: 4, rpm: 400, range: 80, mag: 15, reserve: 60, reload: 2.1,
    speed: 1.0, swapTime: 0.45, sound: 'pistol', price: 200, killReward: 300, falloff: 0.85,
    spread: { base: 0.35, move: 2.4, air: 6, crouch: 0.75, perShot: 0.55, recover: 5 },
    recoil: { recover: 11, scale: 1 },
    pattern: pattern(20, (i) => [(Math.random() - 0.5) * 0.6, 1.6 + Math.min(i, 4) * 0.2]),
  },
  heavy_pistol: {
    key: 'heavy_pistol', name: 'PISTOLA PESADA', short: 'PESADA', slot: 2, type: 'pistol', auto: false,
    damage: 54, hsMult: 4, rpm: 267, range: 110, mag: 7, reserve: 35, reload: 2.3,
    speed: 0.96, swapTime: 0.5, sound: 'heavy', price: 700, killReward: 300, falloff: 0.9,
    spread: { base: 0.55, move: 3.4, air: 8, crouch: 0.75, perShot: 1.7, recover: 4 },
    recoil: { recover: 9, scale: 1 },
    pattern: pattern(10, (i) => [(Math.random() - 0.5) * 1.4, 3.4 + i * 0.3]),
  },
  smg: {
    key: 'smg', name: 'SUBFUSIL', short: 'SUBFUSIL', slot: 1, type: 'smg', auto: true,
    damage: 26, hsMult: 4, rpm: 820, range: 90, mag: 30, reserve: 120, reload: 2.3,
    speed: 0.98, swapTime: 0.5, sound: 'smg', price: 1200, killReward: 600, falloff: 0.78,
    spread: { base: 0.45, move: 1.1, air: 5, crouch: 0.8, perShot: 0.22, recover: 6 },
    recoil: { recover: 9, scale: 1 },
    pattern: pattern(30, (i) => [Math.sin(i * 0.7) * (i > 4 ? 0.9 : 0.25), i < 4 ? 0.9 : 0.55]),
  },
  shotgun: {
    key: 'shotgun', name: 'ESCOPETA', short: 'ESCOPETA', slot: 1, type: 'shotgun', auto: false,
    damage: 24, pellets: 9, hsMult: 3, rpm: 68, range: 45, mag: 8, reserve: 32, reload: 0.5, shellReload: true,
    speed: 0.92, swapTime: 0.6, sound: 'shotgun', price: 1100, killReward: 900, falloff: 0.5,
    spread: { base: 3.4, move: 1.0, air: 3, crouch: 0.9, perShot: 0.4, recover: 5 },
    recoil: { recover: 7, scale: 1 },
    pattern: pattern(8, () => [(Math.random() - 0.5) * 1.5, 5.5]),
  },
  rifle: {
    key: 'rifle', name: 'FUSIL DE ASALTO', short: 'FUSIL', slot: 1, type: 'rifle', auto: true,
    damage: 33, hsMult: 4, rpm: 600, range: 120, mag: 30, reserve: 90, reload: 2.5,
    speed: 0.9, swapTime: 0.55, sound: 'rifle', price: 2700, killReward: 300, falloff: 0.92, team: 'T',
    spread: { base: 0.3, move: 1.6, air: 7, crouch: 0.72, perShot: 0.28, recover: 6 },
    recoil: { recover: 8, scale: 1 },
    pattern: pattern(30, (i) => {
      const up = i < 3 ? 1.35 : i < 9 ? 1.15 : 0.45;
      const side = i < 6 ? (Math.random() - 0.5) * 0.3 : i < 15 ? -1.1 : i < 22 ? 1.25 : -0.9;
      return [side, up];
    }),
  },
  carbine: {
    key: 'carbine', name: 'CARABINA', short: 'CARABINA', slot: 1, type: 'rifle', auto: true,
    damage: 36, hsMult: 4, rpm: 666, range: 120, mag: 30, reserve: 90, reload: 2.7,
    speed: 0.9, swapTime: 0.55, sound: 'rifle', price: 3100, killReward: 300, falloff: 0.92, team: 'CT',
    spread: { base: 0.34, move: 1.8, air: 7, crouch: 0.72, perShot: 0.32, recover: 6 },
    recoil: { recover: 8, scale: 1 },
    pattern: pattern(30, (i) => {
      const up = i < 3 ? 1.5 : i < 9 ? 1.25 : 0.5;
      const side = i < 5 ? (Math.random() - 0.5) * 0.35 : i < 13 ? 1.2 : i < 21 ? -1.3 : 1.0;
      return [side, up];
    }),
  },
  sniper: {
    key: 'sniper', name: 'FRANCOTIRADOR', short: 'FRANCO', slot: 1, type: 'sniper', auto: false,
    damage: 115, hsMult: 2.5, rpm: 41, range: 400, mag: 10, reserve: 30, reload: 3.7,
    speed: 0.8, swapTime: 0.8, sound: 'sniper', price: 4750, killReward: 100, falloff: 0.995,
    scope: [22, 9], scopedSpread: 0.04, scopedSpeed: 0.45,
    spread: { base: 5.0, move: 7, air: 12, crouch: 0.9, perShot: 2.5, recover: 4 },
    recoil: { recover: 5, scale: 1 },
    pattern: pattern(10, () => [(Math.random() - 0.5) * 1.0, 8]),
  },
  grenade_he: {
    key: 'grenade_he', name: 'GRANADA EXPLOSIVA', short: 'HE', slot: 4, type: 'grenade', grenade: 'he',
    mag: 1, maxCount: 1, reserve: 0, rpm: 60, speed: 1.0, swapTime: 0.4, price: 300, killReward: 300,
    throwSpeed: 20, fuse: 1.7, spread: NO_SPREAD, recoil: { recover: 10, scale: 1 }, pattern: [[0, 0]],
  },
  grenade_flash: {
    key: 'grenade_flash', name: 'CEGADORA', short: 'FLASH', slot: 4, type: 'grenade', grenade: 'flash',
    mag: 1, maxCount: 2, reserve: 0, rpm: 60, speed: 1.0, swapTime: 0.4, price: 200, killReward: 300,
    throwSpeed: 21, fuse: 1.6, spread: NO_SPREAD, recoil: { recover: 10, scale: 1 }, pattern: [[0, 0]],
  },
  grenade_smoke: {
    key: 'grenade_smoke', name: 'GRANADA DE HUMO', short: 'HUMO', slot: 4, type: 'grenade', grenade: 'smoke',
    mag: 1, maxCount: 1, reserve: 0, rpm: 60, speed: 1.0, swapTime: 0.4, price: 300, killReward: 300,
    throwSpeed: 18, fuse: 1.5, spread: NO_SPREAD, recoil: { recover: 10, scale: 1 }, pattern: [[0, 0]],
  },
  bomb: {
    key: 'bomb', name: 'BOMBA C4', short: 'C4', slot: 5, type: 'bomb', mag: Infinity, reserve: 0, rpm: 60,
    speed: 1.0, swapTime: 0.5, price: 0, killReward: 0, plantTime: 3.2,
    spread: NO_SPREAD, recoil: { recover: 10, scale: 1 }, pattern: [[0, 0]],
  },
};

export const SLOT_ORDER = ['sniper', 'rifle', 'carbine', 'shotgun', 'smg', 'heavy_pistol', 'pistol', 'knife', 'grenade_he', 'grenade_flash', 'grenade_smoke', 'bomb'];

export const EQUIPMENT = {
  vest: { key: 'vest', name: 'CHALECO', price: 650 },
  vesthelm: { key: 'vesthelm', name: 'CHALECO + CASCO', price: 1000 },
  kit: { key: 'kit', name: 'KIT DE DESACTIVACIÓN', price: 400, team: 'CT' },
};

export const BUY_CATEGORIES = [
  { title: 'PISTOLAS', items: ['pistol', 'heavy_pistol'] },
  { title: 'ARMAS PRINCIPALES', items: ['smg', 'shotgun', 'rifle', 'carbine', 'sniper'] },
  { title: 'EQUIPO', items: ['vest', 'vesthelm', 'kit'] },
  { title: 'GRANADAS', items: ['grenade_he', 'grenade_flash', 'grenade_smoke'] },
];

export function kickVector(def, shotIndex) {
  const p = def.pattern[Math.min(shotIndex, def.pattern.length - 1)];
  return { yaw: p[0] * DEG * def.recoil.scale, pitch: p[1] * DEG * def.recoil.scale };
}
