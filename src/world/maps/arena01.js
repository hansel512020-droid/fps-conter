import { MapBuilder } from '../MapBuilder.js';

/**
 * "Depósito" — a three-lane layout with two bomb sites.
 * North (row 0) = defenders, South = attackers.
 *
 *            [ B site ]      [ CT spawn ]      [ A site ]
 *               |  \              |               /  |
 *           tunnels  B-conn      mid        A-short  long
 *               |        \        |          /       |
 *               +--------- [ T spawn ] ---------------+
 */
export function buildArena01() {
  const m = new MapBuilder(56, 44, 2);
  m.name = 'Depósito';

  // --- Defender spawn and mid lane
  m.carve(22, 1, 33, 5, 'CT');
  m.carve(26, 6, 29, 11);          // CT -> mid corridor
  m.carve(22, 12, 33, 31);         // mid
  m.carve(26, 32, 29, 35);         // mid -> T
  m.carve(18, 36, 37, 42, 'T');    // attacker spawn

  // --- Site A (east)
  m.carve(40, 3, 53, 13);
  m.zoneRect(44, 6, 50, 11, 'A');
  m.carve(34, 2, 39, 4);           // CT -> A
  m.carve(46, 14, 52, 35);         // long A
  m.carve(38, 36, 52, 41);         // T -> long
  m.carve(34, 14, 44, 16);         // mid -> A short
  m.fill(40, 13, 41, 13); m.fill(45, 13, 47, 13); m.fill(52, 13, 53, 13); // A entrances
  m.fill(46, 34, 47, 35);          // long corner
  m.fill(38, 36, 39, 38);          // spawn divider

  // --- Site B (west)
  m.carve(2, 3, 15, 13);
  m.zoneRect(5, 6, 11, 11, 'B');
  m.carve(16, 2, 21, 4);           // CT -> B
  m.carve(3, 14, 9, 35);           // B tunnels
  m.carve(3, 36, 17, 41);          // T -> tunnels
  m.carve(11, 14, 21, 16);         // mid -> B connector
  m.fill(2, 13, 3, 13); m.fill(7, 13, 10, 13); m.fill(14, 13, 15, 13); // B entrances
  m.fill(3, 20, 5, 27);            // tunnel bulge
  m.fill(8, 28, 9, 31);            // tunnel jog
  m.fill(16, 36, 17, 38);          // spawn divider

  // --- Mid structure
  m.fill(26, 19, 29, 22);          // central pillar
  m.crate(23, 24, 1); m.crate(24, 24, 1); m.crate(24, 25, 2);
  m.crate(31, 16, 2); m.crate(32, 16, 1);
  m.crate(22, 13, 2); m.crate(33, 13, 2);
  m.crate(30, 28, 1); m.crate(31, 28, 1);
  m.half(24, 30, 25, 30); m.half(30, 30, 31, 30);

  // --- Site A cover
  m.crate(47, 7, 2); m.crate(46, 7, 1); m.crate(47, 8, 1);
  m.crate(50, 10, 1); m.crate(51, 10, 1);
  m.crate(42, 5, 2); m.crate(43, 5, 1);
  m.fill(50, 3, 53, 4);
  m.half(44, 12, 45, 12);

  // --- Site B cover
  m.crate(7, 7, 2); m.crate(8, 7, 1); m.crate(7, 8, 1);
  m.crate(11, 10, 1); m.crate(12, 10, 1);
  m.crate(4, 5, 2); m.crate(5, 5, 1);
  m.fill(2, 3, 4, 4);
  m.half(10, 12, 11, 12);

  // --- Lane cover
  m.crate(48, 24, 1); m.crate(49, 24, 1); m.crate(50, 24, 2);
  m.crate(46, 19, 2); m.crate(47, 19, 1);
  m.crate(4, 17, 1); m.crate(8, 33, 2); m.crate(7, 33, 1);
  m.crate(40, 40, 2); m.crate(14, 40, 2);
  m.crate(36, 15, 1); m.crate(13, 15, 1);

  // --- Spawn cover
  m.crate(23, 2, 1); m.crate(33, 4, 1);
  m.crate(20, 41, 1); m.crate(35, 41, 1);

  // --- Spawn points (yaw: 0 faces north/-z, PI faces south/+z)
  const PI = Math.PI;
  [[24, 3], [26, 2], [28, 3], [30, 2], [32, 3], [25, 4], [31, 4], [27, 4]].forEach(([x, z]) => m.spawn('CT', x, z, PI));
  [[21, 39], [24, 40], [27, 39], [30, 40], [33, 39], [36, 40], [23, 41], [31, 41]].forEach(([x, z]) => m.spawn('T', x, z, 0));

  // --- Decorative props (lamps etc.)
  m.prop('lamp', 27, 12); m.prop('lamp', 28, 31);
  m.prop('lamp', 47, 10); m.prop('lamp', 8, 10);
  m.prop('lamp', 49, 30); m.prop('lamp', 6, 30);
  m.prop('lamp', 20, 15); m.prop('lamp', 36, 15);
  m.prop('lamp', 28, 38); m.prop('lamp', 27, 3);

  return m;
}
