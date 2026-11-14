import * as THREE from 'three';

/* ---------- small deterministic noise ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeValueNoise(seed, size = 64) {
  const rnd = mulberry32(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    x = ((x % size) + size) % size; y = ((y % size) + size) % size;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = (x0 + 1) % size, y1 = (y0 + 1) % size;
    const fx = fade(x - x0), fy = fade(y - y0);
    const a = g[y0 * size + x0], b = g[y0 * size + x1];
    const c = g[y1 * size + x0], d = g[y1 * size + x1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  };
}

function fbm(noise, x, y, octaves = 5, lac = 2, gain = 0.5) {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < octaves; i++) {
    v += noise(x * f, y * f) * amp;
    sum += amp; amp *= gain; f *= lac;
  }
  return v / sum;
}

/* ---------- texture helpers ---------- */
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = 1, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Builds a normal map from a height array (tileable). */
function normalFromHeight(height, size, strength = 2) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const dn = height[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(values, size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, values[i] * 255));
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Generic surface generator.
 * `shade(x, y, n)` returns [r,g,b,height,roughness] in 0..1.
 */
function buildSurface({ size = 256, seed = 1, shade, normalStrength = 2.5, repeat = 1 }) {
  const noise = makeValueNoise(seed, 8);
  const noise2 = makeValueNoise(seed * 7 + 3, 8);
  const albedo = makeCanvas(size);
  const actx = albedo.getContext('2d');
  const img = actx.createImageData(size, size);
  const d = img.data;
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const scale = 8 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (fx, fy, o = 5) => fbm(noise, x * scale * fx, y * scale * fy, o);
      const n2 = (fx, fy, o = 4) => fbm(noise2, x * scale * fx, y * scale * fy, o);
      const [r, g, b, h, ro] = shade(x / size, y / size, n, n2);
      const i = (y * size + x) * 4;
      d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; d[i + 3] = 255;
      height[y * size + x] = h;
      rough[y * size + x] = ro;
    }
  }
  actx.putImageData(img, 0, 0);
  const map = toTexture(albedo, { srgb: true, repeat });
  const normalMap = toTexture(normalFromHeight(height, size, normalStrength), { srgb: false, repeat });
  const roughnessMap = toTexture(grayCanvas(rough, size), { srgb: false, repeat });
  return { map, normalMap, roughnessMap };
}

/* ---------- materials ---------- */
const cache = {};

export function concreteFloor() {
  if (cache.floor) return cache.floor;
  const tex = buildSurface({
    size: 512, seed: 11, normalStrength: 3,
    shade(u, v, n, n2) {
      const base = 0.44 + (n(1, 1) - 0.5) * 0.18 + (n(4, 4, 4) - 0.5) * 0.08;
      // tile seams every 1/2 of the texture (texture tiles 4m -> 2m tiles)
      const su = Math.min(u % 0.5, 0.5 - (u % 0.5)), sv = Math.min(v % 0.5, 0.5 - (v % 0.5));
      const seam = Math.min(su, sv) < 0.006 ? 1 : 0;
      const stain = Math.pow(n2(0.7, 0.7, 3), 3) * 0.35;
      const c = base * (1 - seam * 0.45) - stain;
      const tint = 0.97 + (n2(2, 2, 2) - 0.5) * 0.06;
      const h = c - seam * 0.5 + (n(8, 8, 2) - 0.5) * 0.05;
      return [c * tint, c * tint * 0.99, c * 0.97, h, 0.85 - stain * 0.3 + seam * 0.1];
    },
  });
  cache.floor = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap,
    roughness: 1, metalness: 0.02, normalScale: new THREE.Vector2(0.6, 0.6),
  });
  cache.floor.userData.tile = 4; // meters per repeat
  return cache.floor;
}

export function wallMaterial() {
  if (cache.wall) return cache.wall;
  const tex = buildSurface({
    size: 512, seed: 23, normalStrength: 2.2,
    shade(u, v, n, n2) {
      const plaster = 0.62 + (n(1, 1) - 0.5) * 0.16 + (n(4, 4, 4) - 0.5) * 0.06;
      // large panel seams: horizontal every 1/2, vertical every 1/2
      const su = Math.min(u % 0.5, 0.5 - (u % 0.5)), sv = Math.min(v % 0.5, 0.5 - (v % 0.5));
      const seam = Math.min(su, sv) < 0.005 ? 1 : 0;
      const grime = Math.pow(n2(0.8, 0.8, 3), 2.5) * 0.3;
      const c = plaster * (1 - seam * 0.5) - grime;
      const warm = 1 + (n2(3, 3, 2) - 0.5) * 0.05;
      return [c * warm * 1.0, c * 0.97, c * 0.92, c - seam * 0.6, 0.8 - grime * 0.2];
    },
  });
  cache.wall = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap,
    roughness: 1, metalness: 0.0, normalScale: new THREE.Vector2(0.5, 0.5),
  });
  cache.wall.userData.tile = 4;
  return cache.wall;
}

export function crateMaterial() {
  if (cache.crate) return cache.crate;
  const tex = buildSurface({
    size: 256, seed: 37, normalStrength: 2.5,
    shade(u, v, n, n2) {
      // horizontal planks
      const planks = 4;
      const pv = (v * planks) % 1;
      const edge = Math.min(pv, 1 - pv) < 0.05 ? 1 : 0;
      const grain = (n(1, 14, 4) - 0.5) * 0.18;
      const base = 0.55 + grain + (n2(3, 3, 2) - 0.5) * 0.12 - edge * 0.3;
      // metal frame band along the texture border
      const bu = Math.min(u, 1 - u), bv = Math.min(v, 1 - v);
      const frame = Math.min(bu, bv) < 0.07 ? 1 : 0;
      const r = frame ? 0.32 : base * 0.92, g = frame ? 0.3 : base * 0.66, b = frame ? 0.28 : base * 0.42;
      return [r, g, b, frame ? 0.9 : base - edge * 0.4, frame ? 0.55 : 0.8];
    },
  });
  cache.crate = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap,
    roughness: 1, metalness: 0.05, normalScale: new THREE.Vector2(0.7, 0.7),
  });
  cache.crate.userData.tile = 2;
  return cache.crate;
}

export function metalMaterial() {
  if (cache.metal) return cache.metal;
  const tex = buildSurface({
    size: 256, seed: 51, normalStrength: 3,
    shade(u, v, n, n2) {
      const paint = 0.36 + (n(1.5, 1.5) - 0.5) * 0.1 + (n2(8, 8, 3) - 0.5) * 0.05;
      const scratches = Math.pow(n2(20, 1, 2), 6) * 0.25;
      const bu = Math.min(u, 1 - u), bv = Math.min(v, 1 - v);
      const frame = Math.min(bu, bv) < 0.06 ? 1 : 0;
      // rivets along frame
      const rivet = frame && (Math.abs(((u * 8) % 1) - 0.5) < 0.12 && Math.abs(((v * 8) % 1) - 0.5) < 0.12) ? 1 : 0;
      const c = paint + scratches - frame * 0.08 + rivet * 0.2;
      const rust = Math.pow(n2(2, 2, 3), 4) * 0.5;
      return [c * 0.55 + rust * 0.4, c * 0.65 + rust * 0.15, c * 0.6, frame ? 0.95 : 0.5 + rivet * 0.5, 0.45 + rust * 0.4 - scratches];
    },
  });
  cache.metal = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap,
    roughness: 1, metalness: 0.6, normalScale: new THREE.Vector2(0.6, 0.6),
  });
  cache.metal.userData.tile = 2;
  return cache.metal;
}

export function groundOutsideMaterial() {
  if (cache.ground) return cache.ground;
  const tex = buildSurface({
    size: 256, seed: 77, normalStrength: 2,
    shade(u, v, n, n2) {
      const c = 0.3 + (n(1, 1) - 0.5) * 0.2 + (n2(6, 6, 3) - 0.5) * 0.1;
      return [c * 1.05, c * 0.95, c * 0.8, c, 0.95];
    },
  });
  cache.ground = new THREE.MeshStandardMaterial({
    map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0,
  });
  cache.ground.userData.tile = 6;
  return cache.ground;
}

/** Makes a square text/label texture (for bomb site markers etc.). */
export function labelTexture(text, color = '#ffffff', bg = 'rgba(0,0,0,0)') {
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = color;
  ctx.font = 'bold 190px Rajdhani, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
