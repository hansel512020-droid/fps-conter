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

export const WEAPONS = {
  knife: {
    key: 'knife', name: 'CUCHILLO', slot: 3, type: 'melee', auto: true,
    damage: 42, hsMult: 2.2, rpm: 150, range: 1.9, mag: Infinity, reserve: 0,
    speed: 1.0, swapTime: 0.25, sound: 'knife', price: 0,
    spread: { base: 0, move: 0, air: 0, crouch: 1, perShot: 0, recover: 1 },
    recoil: { recover: 10, scale: 1 },
    pattern: pattern(4, () => [0, 0.6]),
  },
  pistol: {
    key: 'pistol', name: 'PISTOLA', slot: 2, type: 'pistol', auto: false,
    damage: 35, hsMult: 4, rpm: 400, range: 80, mag: 15, reserve: 60, reload: 2.1,
    speed: 1.0, swapTime: 0.45, sound: 'pistol', price: 300, falloff: 0.85,
    spread: { base: 0.35, move: 2.4, air: 6, crouch: 0.75, perShot: 0.55, recover: 5 },
    recoil: { recover: 11, scale: 1 },
    pattern: pattern(20, (i) => [(Math.random() - 0.5) * 0.6, 1.6 + Math.min(i, 4) * 0.2]),
  },
  smg: {
    key: 'smg', name: 'SUBFUSIL', slot: 1, type: 'smg', auto: true,
    damage: 26, hsMult: 4, rpm: 820, range: 90, mag: 30, reserve: 120, reload: 2.3,
    speed: 0.98, swapTime: 0.5, sound: 'smg', price: 1200, falloff: 0.78,
    spread: { base: 0.45, move: 1.1, air: 5, crouch: 0.8, perShot: 0.22, recover: 6 },
    recoil: { recover: 9, scale: 1 },
    pattern: pattern(30, (i) => [Math.sin(i * 0.7) * (i > 4 ? 0.9 : 0.25), i < 4 ? 0.9 : 0.55]),
  },
  rifle: {
    key: 'rifle', name: 'FUSIL DE ASALTO', slot: 1, type: 'rifle', auto: true,
    damage: 33, hsMult: 4, rpm: 600, range: 120, mag: 30, reserve: 90, reload: 2.5,
    speed: 0.9, swapTime: 0.55, sound: 'rifle', price: 2700, falloff: 0.92,
    spread: { base: 0.3, move: 1.6, air: 7, crouch: 0.72, perShot: 0.28, recover: 6 },
    recoil: { recover: 8, scale: 1 },
    pattern: pattern(30, (i) => {
      // classic shape: strong vertical climb for the first ~8, then horizontal drift left, then right
      const up = i < 3 ? 1.35 : i < 9 ? 1.15 : 0.45;
      const side = i < 6 ? (Math.random() - 0.5) * 0.3 : i < 15 ? -1.1 : i < 22 ? 1.25 : -0.9;
      return [side, up];
    }),
  },
  carbine: {
    key: 'carbine', name: 'CARABINA', slot: 1, type: 'rifle', auto: true,
    damage: 36, hsMult: 4, rpm: 666, range: 120, mag: 30, reserve: 90, reload: 2.7,
    speed: 0.9, swapTime: 0.55, sound: 'rifle', price: 2900, falloff: 0.92,
    spread: { base: 0.34, move: 1.8, air: 7, crouch: 0.72, perShot: 0.32, recover: 6 },
    recoil: { recover: 8, scale: 1 },
    pattern: pattern(30, (i) => {
      const up = i < 3 ? 1.5 : i < 9 ? 1.25 : 0.5;
      const side = i < 5 ? (Math.random() - 0.5) * 0.35 : i < 13 ? 1.2 : i < 21 ? -1.3 : 1.0;
      return [side, up];
    }),
  },
};

export const SLOT_ORDER = ['rifle', 'carbine', 'smg', 'pistol', 'knife'];

export function kickVector(def, shotIndex) {
  const p = def.pattern[Math.min(shotIndex, def.pattern.length - 1)];
  return { yaw: p[0] * DEG * def.recoil.scale, pitch: p[1] * DEG * def.recoil.scale };
}
