import * as THREE from 'three';

/** Procedural weapon meshes. Barrel points along -Z, grip below. Includes a 'muzzle' child. */
const mats = {};
function mat(name) {
  if (mats[name]) return mats[name];
  switch (name) {
    case 'metal': mats[name] = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.45, metalness: 0.8 }); break;
    case 'dark': mats[name] = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.75, metalness: 0.2 }); break;
    case 'polymer': mats[name] = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.8, metalness: 0.05 }); break;
    case 'wood': mats[name] = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.7, metalness: 0.05 }); break;
    case 'steel': mats[name] = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.3, metalness: 0.95 }); break;
    case 'tan': mats[name] = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8, metalness: 0.05 }); break;
    default: mats[name] = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.7 });
  }
  return mats[name];
}

function box(w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(m));
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  return mesh;
}
function cyl(r, len, m, x = 0, y = 0, z = 0, axis = 'z', r2 = r) {
  const g = new THREE.CylinderGeometry(r, r2, len, 12);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat(m));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function buildWeaponMesh(key) {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  switch (key) {
    case 'rifle': {
      g.add(box(0.075, 0.1, 0.5, 'metal', 0, 0, -0.05));            // receiver
      g.add(box(0.07, 0.075, 0.26, 'wood', 0, -0.005, -0.42));       // handguard
      g.add(cyl(0.013, 0.34, 'steel', 0, 0.015, -0.68));             // barrel
      g.add(box(0.03, 0.05, 0.05, 'metal', 0, 0.065, -0.52));        // front sight
      g.add(box(0.05, 0.05, 0.08, 'metal', 0, 0.07, 0.05));          // rear sight / carry
      g.add(box(0.05, 0.22, 0.08, 'metal', 0, -0.14, -0.2, 0.18));   // magazine
      g.add(box(0.045, 0.13, 0.06, 'polymer', 0, -0.1, 0.06, -0.3)); // grip
      g.add(box(0.05, 0.07, 0.3, 'wood', 0, -0.02, 0.33));           // stock
      g.add(box(0.06, 0.1, 0.05, 'dark', 0, -0.035, 0.46));          // buttpad
      muzzle.position.set(0, 0.015, -0.86);
      break;
    }
    case 'carbine': {
      g.add(box(0.07, 0.1, 0.46, 'metal', 0, 0, -0.03));
      g.add(box(0.065, 0.07, 0.3, 'tan', 0, -0.005, -0.4));
      g.add(cyl(0.012, 0.3, 'steel', 0, 0.015, -0.68));
      g.add(box(0.03, 0.05, 0.04, 'metal', 0, 0.065, -0.5));
      g.add(box(0.04, 0.04, 0.12, 'metal', 0, 0.07, 0.0));
      g.add(box(0.05, 0.2, 0.07, 'metal', 0, -0.13, -0.16, 0.08));
      g.add(box(0.045, 0.13, 0.06, 'polymer', 0, -0.1, 0.07, -0.3));
      g.add(box(0.04, 0.05, 0.26, 'metal', 0, 0.0, 0.3));
      g.add(box(0.06, 0.1, 0.06, 'polymer', 0, -0.03, 0.44));
      muzzle.position.set(0, 0.015, -0.84);
      break;
    }
    case 'smg': {
      g.add(box(0.07, 0.09, 0.36, 'metal', 0, 0, -0.02));
      g.add(cyl(0.012, 0.2, 'steel', 0, 0.01, -0.3));
      g.add(cyl(0.02, 0.12, 'dark', 0, 0.01, -0.26));
      g.add(box(0.04, 0.26, 0.06, 'metal', 0, -0.16, -0.08, 0.05));
      g.add(box(0.045, 0.12, 0.06, 'polymer', 0, -0.1, 0.09, -0.25));
      g.add(box(0.03, 0.03, 0.22, 'metal', 0, 0.02, 0.26));
      g.add(box(0.05, 0.08, 0.03, 'metal', 0, 0.0, 0.37));
      muzzle.position.set(0, 0.01, -0.42);
      break;
    }
    case 'heavy_pistol': {
      g.add(box(0.04, 0.05, 0.25, 'steel', 0, 0.025, -0.06));        // long slide
      g.add(box(0.038, 0.032, 0.2, 'metal', 0, -0.015, -0.04));      // frame
      g.add(cyl(0.009, 0.03, 'metal', 0, 0.025, -0.19));
      g.add(box(0.034, 0.12, 0.05, 'polymer', 0, -0.09, 0.04, -0.22)); // grip
      g.add(box(0.014, 0.035, 0.035, 'metal', 0, -0.05, -0.02));
      g.add(box(0.014, 0.02, 0.015, 'metal', 0, 0.06, 0.05));
      g.add(box(0.008, 0.015, 0.012, 'metal', 0, 0.058, -0.17));
      muzzle.position.set(0, 0.025, -0.21);
      break;
    }
    case 'shotgun': {
      g.add(box(0.07, 0.085, 0.3, 'metal', 0, 0, 0.0));              // receiver
      g.add(cyl(0.016, 0.55, 'steel', 0, 0.03, -0.42));              // barrel
      g.add(cyl(0.02, 0.45, 'metal', 0, -0.02, -0.38));              // tube magazine
      g.add(box(0.06, 0.07, 0.16, 'wood', 0, -0.0, -0.3));           // pump
      g.add(box(0.03, 0.03, 0.03, 'metal', 0, 0.065, -0.66));        // bead sight
      g.add(box(0.045, 0.12, 0.06, 'wood', 0, -0.1, 0.1, -0.3));     // grip
      g.add(box(0.05, 0.09, 0.3, 'wood', 0, -0.03, 0.3));            // stock
      g.add(box(0.06, 0.11, 0.04, 'dark', 0, -0.04, 0.46));
      muzzle.position.set(0, 0.03, -0.7);
      break;
    }
    case 'sniper': {
      g.add(box(0.07, 0.09, 0.55, 'polymer', 0, -0.005, 0.0));       // body/chassis
      g.add(cyl(0.014, 0.7, 'steel', 0, 0.02, -0.6));                // long barrel
      g.add(cyl(0.025, 0.08, 'metal', 0, 0.02, -0.93));              // muzzle brake
      g.add(box(0.05, 0.2, 0.08, 'metal', 0, -0.13, -0.12, 0.05));   // magazine
      g.add(box(0.045, 0.13, 0.06, 'polymer', 0, -0.1, 0.12, -0.3)); // grip
      g.add(box(0.05, 0.08, 0.3, 'polymer', 0, -0.02, 0.4));         // stock
      g.add(box(0.06, 0.12, 0.05, 'dark', 0, -0.03, 0.56));
      g.add(box(0.03, 0.04, 0.16, 'metal', 0, 0.065, -0.05));        // scope mount
      g.add(cyl(0.028, 0.3, 'metal', 0, 0.11, -0.05));               // scope tube
      g.add(cyl(0.036, 0.06, 'metal', 0, 0.11, -0.22));              // objective
      g.add(cyl(0.034, 0.05, 'metal', 0, 0.11, 0.12));               // ocular
      const lens = cyl(0.03, 0.005, 'steel', 0, 0.11, -0.255);
      lens.material = new THREE.MeshStandardMaterial({ color: 0x3a6cff, roughness: 0.1, metalness: 0.9 });
      g.add(lens);
      g.add(box(0.012, 0.03, 0.05, 'metal', 0.0, -0.01, -0.0, 0, 0, 0.9)); // bolt handle
      muzzle.position.set(0, 0.02, -0.98);
      break;
    }
    case 'grenade_he': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), mat('dark'));
      body.scale.set(1, 1.25, 1);
      g.add(body);
      g.add(cyl(0.02, 0.03, 'steel', 0, 0.065, 0, 'y'));
      g.add(box(0.012, 0.06, 0.025, 'steel', 0.03, 0.045, 0, 0, 0, -0.3)); // spoon
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
      muzzle.position.set(0, 0, 0);
      break;
    }
    case 'bomb': {
      g.add(box(0.28, 0.1, 0.17, 'tan', 0, 0.05, 0));                // C4 block
      g.add(box(0.1, 0.03, 0.08, 'dark', -0.05, 0.11, 0));           // timer box
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
      muzzle.position.set(0, 0.05, 0);
      break;
    }
    case 'pistol': {
      g.add(box(0.035, 0.045, 0.2, 'metal', 0, 0.02, -0.04));        // slide
      g.add(box(0.034, 0.03, 0.17, 'polymer', 0, -0.015, -0.03));    // frame
      g.add(cyl(0.008, 0.03, 'steel', 0, 0.02, -0.15));
      g.add(box(0.03, 0.11, 0.045, 'polymer', 0, -0.085, 0.03, -0.25)); // grip
      g.add(box(0.012, 0.03, 0.03, 'metal', 0, -0.045, -0.02));       // trigger guard
      g.add(box(0.012, 0.02, 0.015, 'metal', 0, 0.052, 0.04));        // rear sight
      g.add(box(0.008, 0.015, 0.012, 'metal', 0, 0.05, -0.13));       // front sight
      muzzle.position.set(0, 0.02, -0.17);
      break;
    }
    case 'knife': {
      g.add(box(0.028, 0.038, 0.13, 'polymer', 0, 0, 0.06));         // handle
      g.add(box(0.03, 0.04, 0.02, 'metal', 0, 0, 0.13));             // pommel
      const blade = box(0.006, 0.046, 0.22, 'steel', 0, 0.006, -0.12);
      g.add(blade);
      const tip = box(0.006, 0.03, 0.05, 'steel', 0, 0.012, -0.25, 0, 0, 0);
      tip.rotation.x = 0.35;
      g.add(tip);
      g.add(box(0.034, 0.06, 0.014, 'metal', 0, 0, -0.01));          // guard
      muzzle.position.set(0, 0, -0.27);
      break;
    }
  }
  g.add(muzzle);
  return g;
}
