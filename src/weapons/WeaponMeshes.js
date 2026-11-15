import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Procedural weapon meshes built from rounded boxes and cylinders.
 * Barrel points along -Z, grip below. Each weapon has a 'muzzle' child.
 */
const mats = {};
function mat(name) {
  if (mats[name]) return mats[name];
  switch (name) {
    case 'metal': mats[name] = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.42, metalness: 0.8 }); break;
    case 'dark': mats[name] = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.7, metalness: 0.25 }); break;
    case 'polymer': mats[name] = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.8, metalness: 0.05 }); break;
    case 'wood': mats[name] = new THREE.MeshStandardMaterial({ color: 0x6e4b2a, roughness: 0.65, metalness: 0.05 }); break;
    case 'steel': mats[name] = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.95 }); break;
    case 'tan': mats[name] = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8, metalness: 0.05 }); break;
    case 'rubber': mats[name] = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.95, metalness: 0.0 }); break;
    case 'brass': mats[name] = new THREE.MeshStandardMaterial({ color: 0xb08d3c, roughness: 0.35, metalness: 0.9 }); break;
    case 'olive': mats[name] = new THREE.MeshStandardMaterial({ color: 0x4f5a3a, roughness: 0.75, metalness: 0.1 }); break;
    default: mats[name] = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
  }
  return mats[name];
}

const geoCache = new Map();
function rbox(w, h, d) {
  const r = Math.min(0.006, Math.min(w, h, d) * 0.3);
  const key = `${w.toFixed(4)}_${h.toFixed(4)}_${d.toFixed(4)}`;
  let g = geoCache.get(key);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, r); geoCache.set(key, g); }
  return g;
}

function box(w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(rbox(w, h, d), mat(m));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  return mesh;
}
function cyl(r, len, m, x = 0, y = 0, z = 0, axis = 'z', r2 = r, seg = 14) {
  const g = new THREE.CylinderGeometry(r, r2, len, seg);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat(m));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
/** Picatinny-style rail: a base with evenly spaced ridges. */
function rail(len, m, x, y, z, w = 0.028) {
  const g = new THREE.Group();
  g.add(box(w, 0.012, len, m, 0, 0, 0));
  const n = Math.floor(len / 0.012);
  for (let i = 0; i < n; i += 2) g.add(box(w, 0.008, 0.006, m, 0, 0.01, -len / 2 + 0.004 + i * 0.012));
  g.position.set(x, y, z);
  return g;
}
function triggerGroup(m, x, y, z, s = 1) {
  const g = new THREE.Group();
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.03 * s, 0.004, 6, 14, Math.PI), mat(m));
  guard.rotation.set(0, Math.PI / 2, 0);
  guard.rotation.x = Math.PI;
  g.add(guard);
  g.add(box(0.006, 0.028 * s, 0.008, 'steel', 0, -0.012 * s, 0.0, 0.25));
  g.position.set(x, y, z);
  return g;
}

export function buildWeaponMesh(key) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  switch (key) {
    case 'rifle': {
      // AK-style: wooden furniture, curved magazine, slanted gas block
      g.add(box(0.07, 0.085, 0.42, 'metal', 0, 0.005, -0.03));            // receiver
      g.add(box(0.072, 0.03, 0.42, 'dark', 0, 0.06, -0.03));              // dust cover
      g.add(box(0.07, 0.07, 0.22, 'wood', 0, -0.005, -0.37));             // lower handguard
      g.add(box(0.055, 0.035, 0.2, 'wood', 0, 0.05, -0.38));              // upper handguard
      g.add(cyl(0.012, 0.36, 'steel', 0, 0.045, -0.68));                  // barrel
      g.add(cyl(0.02, 0.05, 'metal', 0, 0.045, -0.52));                   // gas block
      g.add(cyl(0.011, 0.26, 'metal', 0, 0.075, -0.4));                   // gas tube
      g.add(cyl(0.016, 0.06, 'metal', 0, 0.045, -0.83, 'z', 0.012));      // muzzle brake
      g.add(box(0.012, 0.045, 0.012, 'metal', 0, 0.085, -0.8));           // front sight post
      g.add(box(0.03, 0.03, 0.025, 'metal', 0, 0.085, -0.81));            // front sight hood
      g.add(box(0.02, 0.02, 0.07, 'metal', 0, 0.08, -0.2));               // rear sight block
      g.add(box(0.052, 0.21, 0.07, 'metal', 0, -0.13, -0.17, 0.3));       // magazine (curved)
      g.add(box(0.05, 0.1, 0.07, 'metal', 0, -0.25, -0.1, 0.6));          //   lower part of the curve
      g.add(box(0.045, 0.13, 0.065, 'wood', 0, -0.1, 0.08, -0.35));       // pistol grip
      g.add(triggerGroup('metal', 0, -0.045, -0.01));
      g.add(box(0.04, 0.055, 0.3, 'wood', 0, -0.005, 0.33, 0.04));        // stock
      g.add(box(0.05, 0.11, 0.05, 'rubber', 0, -0.02, 0.48));             // butt pad
      g.add(box(0.012, 0.035, 0.05, 'metal', 0.045, 0.025, -0.02, 0, 0, 0.9)); // charging handle
      muzzle.position.set(0, 0.045, -0.87);
      break;
    }
    case 'carbine': {
      // M4-style: rails, telescoping stock, straight magazine
      g.add(box(0.068, 0.08, 0.26, 'metal', 0, 0.0, 0.02));               // upper + lower receiver
      g.add(rail(0.24, 'dark', 0, 0.05, 0.02));
      g.add(box(0.07, 0.08, 0.28, 'tan', 0, -0.002, -0.3));               // handguard
      g.add(rail(0.26, 'dark', 0, 0.05, -0.3));
      g.add(rail(0.2, 'dark', 0, -0.045, -0.3));
      g.add(cyl(0.011, 0.3, 'steel', 0, 0.015, -0.6));                    // barrel
      g.add(cyl(0.017, 0.055, 'metal', 0, 0.015, -0.77, 'z', 0.014));     // flash hider
      g.add(box(0.03, 0.06, 0.03, 'metal', 0, 0.07, -0.46));              // front sight
      g.add(box(0.012, 0.03, 0.006, 'metal', 0, 0.1, -0.46));
      g.add(box(0.04, 0.045, 0.04, 'metal', 0, 0.075, 0.08));             // rear sight
      g.add(box(0.05, 0.2, 0.07, 'metal', 0, -0.13, -0.1, 0.08));         // magazine
      g.add(box(0.045, 0.13, 0.06, 'polymer', 0, -0.1, 0.1, -0.3));       // grip
      g.add(triggerGroup('metal', 0, -0.045, 0.0));
      g.add(cyl(0.017, 0.26, 'metal', 0, 0.01, 0.3));                     // buffer tube
      g.add(box(0.05, 0.1, 0.16, 'polymer', 0, -0.02, 0.4));              // stock
      g.add(box(0.055, 0.12, 0.03, 'rubber', 0, -0.025, 0.49));
      g.add(box(0.03, 0.02, 0.04, 'metal', 0, 0.03, 0.17, 0, 0, 0));       // charging handle
      muzzle.position.set(0, 0.015, -0.8);
      break;
    }
    case 'smg': {
      g.add(box(0.066, 0.08, 0.34, 'metal', 0, 0, -0.02));                // receiver
      g.add(rail(0.3, 'dark', 0, 0.048, -0.02));
      g.add(cyl(0.011, 0.16, 'steel', 0, 0.012, -0.28));                  // barrel
      g.add(cyl(0.02, 0.1, 'rubber', 0, 0.012, -0.25));                   // barrel shroud
      g.add(box(0.03, 0.045, 0.02, 'metal', 0, 0.075, -0.17));            // front sight
      g.add(box(0.035, 0.035, 0.03, 'metal', 0, 0.075, 0.1));             // rear sight
      g.add(box(0.04, 0.27, 0.055, 'metal', 0, -0.165, -0.08, 0.06));     // long magazine
      g.add(box(0.045, 0.12, 0.06, 'polymer', 0, -0.1, 0.08, -0.25));     // grip
      g.add(triggerGroup('metal', 0, -0.045, 0.0, 0.9));
      g.add(box(0.045, 0.07, 0.1, 'polymer', 0, -0.055, -0.2));           // foregrip block
      g.add(cyl(0.012, 0.22, 'metal', 0.02, 0.02, 0.26, 'z'));            // folding stock bars
      g.add(cyl(0.012, 0.22, 'metal', -0.02, 0.02, 0.26, 'z'));
      g.add(box(0.06, 0.08, 0.025, 'metal', 0, 0.0, 0.37));               // stock plate
      muzzle.position.set(0, 0.012, -0.37);
      break;
    }
    case 'shotgun': {
      g.add(box(0.07, 0.085, 0.28, 'metal', 0, 0, 0.0));                  // receiver
      g.add(cyl(0.016, 0.55, 'steel', 0, 0.03, -0.42));                   // barrel
      g.add(cyl(0.02, 0.46, 'metal', 0, -0.02, -0.38));                   // tube magazine
      g.add(box(0.06, 0.065, 0.16, 'wood', 0, 0.0, -0.3));                // pump
      for (let i = 0; i < 5; i++) g.add(box(0.062, 0.067, 0.008, 'dark', 0, 0, -0.24 - i * 0.03)); // pump grooves
      g.add(box(0.016, 0.02, 0.016, 'brass', 0, 0.056, -0.68));           // bead sight
      g.add(box(0.03, 0.025, 0.025, 'metal', 0, 0.055, -0.1));            // rear sight
      g.add(box(0.05, 0.05, 0.03, 'metal', 0, -0.05, 0.02));              // loading port
      g.add(triggerGroup('metal', 0, -0.045, 0.08));
      g.add(box(0.045, 0.12, 0.06, 'wood', 0, -0.1, 0.14, -0.3));         // grip
      g.add(box(0.045, 0.085, 0.3, 'wood', 0, -0.03, 0.32, 0.06));        // stock
      g.add(box(0.055, 0.12, 0.04, 'rubber', 0, -0.045, 0.48));
      muzzle.position.set(0, 0.03, -0.7);
      break;
    }
    case 'sniper': {
      g.add(box(0.07, 0.085, 0.52, 'olive', 0, -0.005, 0.0));             // chassis
      g.add(box(0.05, 0.06, 0.5, 'metal', 0, 0.045, -0.02));              // receiver / action
      g.add(cyl(0.015, 0.7, 'steel', 0, 0.05, -0.6));                     // barrel
      g.add(cyl(0.024, 0.09, 'metal', 0, 0.05, -0.93));                   // muzzle brake
      for (let i = 0; i < 3; i++) g.add(box(0.052, 0.012, 0.01, 'dark', 0, 0.05, -0.9 - i * 0.015));
      g.add(box(0.05, 0.2, 0.08, 'metal', 0, -0.13, -0.1, 0.05));         // magazine
      g.add(box(0.045, 0.13, 0.06, 'olive', 0, -0.1, 0.12, -0.3));        // grip
      g.add(triggerGroup('metal', 0, -0.045, 0.02));
      g.add(box(0.05, 0.09, 0.32, 'olive', 0, -0.015, 0.42));             // stock
      g.add(box(0.05, 0.05, 0.14, 'olive', 0, 0.045, 0.4));               // cheek rest
      g.add(box(0.06, 0.13, 0.04, 'rubber', 0, -0.03, 0.59));
      g.add(rail(0.22, 'dark', 0, 0.085, -0.02));
      g.add(box(0.02, 0.04, 0.03, 'metal', -0.0, 0.11, -0.12));           // scope rings
      g.add(box(0.02, 0.04, 0.03, 'metal', -0.0, 0.11, 0.06));
      g.add(cyl(0.026, 0.34, 'metal', 0, 0.14, -0.04));                   // scope tube
      g.add(cyl(0.04, 0.08, 'metal', 0, 0.14, -0.24, 'z', 0.03));         // objective bell
      g.add(cyl(0.034, 0.06, 'metal', 0, 0.14, 0.15, 'z', 0.03));         // ocular
      const lens = cyl(0.036, 0.004, 'steel', 0, 0.14, -0.282);
      lens.material = new THREE.MeshStandardMaterial({ color: 0x2a5cff, roughness: 0.08, metalness: 0.9 });
      g.add(lens);
      g.add(cyl(0.014, 0.03, 'metal', 0, 0.175, -0.04, 'y'));             // elevation turret
      g.add(cyl(0.014, 0.03, 'metal', 0.035, 0.14, -0.04, 'x'));          // windage turret
      g.add(cyl(0.006, 0.07, 'steel', 0.04, 0.05, 0.08, 'x'));            // bolt
      g.add(cyl(0.012, 0.012, 'steel', 0.075, 0.05, 0.08, 'x'));          // bolt knob
      g.add(cyl(0.006, 0.18, 'metal', 0.02, -0.07, -0.55, 'y'));          // bipod legs (folded)
      g.add(cyl(0.006, 0.18, 'metal', -0.02, -0.07, -0.55, 'y'));
      muzzle.position.set(0, 0.05, -0.98);
      break;
    }
    case 'heavy_pistol': {
      g.add(box(0.04, 0.05, 0.25, 'steel', 0, 0.025, -0.06));             // slide
      for (let i = 0; i < 6; i++) g.add(box(0.042, 0.03, 0.004, 'metal', 0, 0.03, 0.03 + i * 0.008)); // rear serrations
      g.add(box(0.038, 0.032, 0.2, 'metal', 0, -0.015, -0.04));           // frame
      g.add(cyl(0.009, 0.03, 'metal', 0, 0.025, -0.19));
      g.add(box(0.034, 0.12, 0.05, 'polymer', 0, -0.09, 0.04, -0.22));    // grip
      g.add(triggerGroup('metal', 0, -0.042, -0.02, 0.8));
      g.add(box(0.014, 0.02, 0.015, 'metal', 0, 0.06, 0.05));             // rear sight
      g.add(box(0.008, 0.015, 0.012, 'metal', 0, 0.058, -0.17));          // front sight
      g.add(box(0.01, 0.02, 0.012, 'metal', 0, 0.04, 0.07, 0.4));         // hammer
      muzzle.position.set(0, 0.025, -0.21);
      break;
    }
    case 'pistol': {
      g.add(box(0.035, 0.045, 0.2, 'metal', 0, 0.02, -0.04));             // slide
      for (let i = 0; i < 5; i++) g.add(box(0.037, 0.028, 0.004, 'dark', 0, 0.022, 0.03 + i * 0.008));
      g.add(box(0.034, 0.03, 0.17, 'polymer', 0, -0.015, -0.03));         // frame
      g.add(box(0.012, 0.006, 0.08, 'polymer', 0, -0.033, -0.08));        // frame rail
      g.add(cyl(0.008, 0.03, 'steel', 0, 0.02, -0.15));
      g.add(box(0.03, 0.11, 0.045, 'polymer', 0, -0.085, 0.03, -0.25));   // grip
      g.add(triggerGroup('metal', 0, -0.04, -0.02, 0.75));
      g.add(box(0.012, 0.02, 0.015, 'metal', 0, 0.052, 0.04));            // rear sight
      g.add(box(0.008, 0.015, 0.012, 'metal', 0, 0.05, -0.13));           // front sight
      muzzle.position.set(0, 0.02, -0.17);
      break;
    }
    case 'knife': {
      g.add(box(0.028, 0.038, 0.13, 'rubber', 0, 0, 0.06));               // handle
      for (let i = 0; i < 4; i++) g.add(box(0.03, 0.04, 0.006, 'dark', 0, 0, 0.015 + i * 0.03)); // grip rings
      g.add(box(0.03, 0.04, 0.02, 'metal', 0, 0, 0.13));                  // pommel
      g.add(box(0.006, 0.046, 0.22, 'steel', 0, 0.006, -0.12));           // blade
      const tip = box(0.006, 0.03, 0.05, 'steel', 0, 0.012, -0.25);
      tip.rotation.x = 0.35;
      g.add(tip);
      g.add(box(0.004, 0.02, 0.18, 'dark', 0, -0.01, -0.1));              // fuller / dark edge
      g.add(box(0.034, 0.06, 0.014, 'metal', 0, 0, -0.01));               // guard
      muzzle.position.set(0, 0, -0.27);
      break;
    }
    case 'grenade_he': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), mat('olive'));
      body.scale.set(1, 1.25, 1);
      body.castShadow = true;
      g.add(body);
      g.add(cyl(0.02, 0.03, 'steel', 0, 0.065, 0, 'y'));
      g.add(box(0.012, 0.06, 0.025, 'steel', 0.03, 0.045, 0, 0, 0, -0.3)); // spoon
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.002, 6, 12), mat('steel'));
      ring.position.set(-0.02, 0.07, 0);
      g.add(ring);
      const band = cyl(0.046, 0.012, 'metal', 0, 0.0, 0, 'y');
      band.material = new THREE.MeshStandardMaterial({ color: 0xb7a23c, roughness: 0.6 });
      g.add(band);
      muzzle.position.set(0, 0, 0);
      break;
    }
    case 'grenade_flash': {
      g.add(cyl(0.028, 0.11, 'steel', 0, 0, 0, 'y'));
      g.add(cyl(0.018, 0.025, 'metal', 0, 0.065, 0, 'y'));
      g.add(box(0.012, 0.06, 0.025, 'steel', 0.03, 0.045, 0, 0, 0, -0.3));
      const band = cyl(0.029, 0.02, 'metal', 0, -0.02, 0, 'y');
      band.material = new THREE.MeshStandardMaterial({ color: 0x3a6ea8, roughness: 0.5 });
      g.add(band);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(cyl(0.004, 0.08, 'dark', Math.cos(a) * 0.028, 0.01, Math.sin(a) * 0.028, 'y')); }
      muzzle.position.set(0, 0, 0);
      break;
    }
    case 'grenade_smoke': {
      g.add(cyl(0.033, 0.13, 'metal', 0, 0, 0, 'y'));
      g.add(cyl(0.018, 0.025, 'metal', 0, 0.075, 0, 'y'));
      g.add(box(0.012, 0.06, 0.025, 'steel', 0.035, 0.05, 0, 0, 0, -0.3));
      const band = cyl(0.034, 0.03, 'metal', 0, -0.03, 0, 'y');
      band.material = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.6 });
      g.add(band);
      const top = cyl(0.034, 0.02, 'metal', 0, 0.055, 0, 'y');
      top.material = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.6 });
      g.add(top);
      muzzle.position.set(0, 0, 0);
      break;
    }
    case 'bomb': {
      g.add(box(0.28, 0.1, 0.17, 'tan', 0, 0.05, 0));                     // C4 block
      g.add(box(0.1, 0.03, 0.08, 'dark', -0.05, 0.11, 0));                // timer box
      const screen = box(0.07, 0.005, 0.035, 'dark', -0.05, 0.127, 0);
      screen.material = new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff55, emissiveIntensity: 1.2, roughness: 0.4 });
      g.add(screen);
      const led = box(0.015, 0.012, 0.015, 'dark', 0.08, 0.115, -0.04);
      led.name = 'led';
      led.material = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 0.3 });
      g.add(led);
      for (let i = 0; i < 3; i++) {
        const w = cyl(0.004, 0.12, 'metal', 0.04 + i * 0.03, 0.1, 0.03 + i * 0.01, 'z');
        w.material = new THREE.MeshStandardMaterial({ color: [0xff3030, 0x30c0ff, 0xffd030][i], roughness: 0.6 });
        w.rotation.x = 0.4;
        g.add(w);
      }
      g.add(box(0.3, 0.02, 0.03, 'rubber', 0, 0.1, 0.05));                // strap
      g.add(box(0.3, 0.02, 0.03, 'rubber', 0, 0.1, -0.05));
      muzzle.position.set(0, 0.05, 0);
      break;
    }
  }
  g.add(muzzle);
  return g;
}
