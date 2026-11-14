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
      g.add(box(0.07, 0.075, 0.26, 'polymer', 0, -0.005, -0.42));    // handguard
      g.add(cyl(0.013, 0.34, 'steel', 0, 0.015, -0.68));             // barrel
      g.add(box(0.03, 0.05, 0.05, 'metal', 0, 0.065, -0.52));        // front sight
      g.add(box(0.05, 0.05, 0.08, 'metal', 0, 0.07, 0.05));          // rear sight / carry
      g.add(box(0.05, 0.22, 0.08, 'metal', 0, -0.14, -0.2, 0.18));   // magazine
      g.add(box(0.045, 0.13, 0.06, 'polymer', 0, -0.1, 0.06, -0.3)); // grip
      g.add(box(0.05, 0.07, 0.3, 'polymer', 0, -0.02, 0.33));        // stock
      g.add(box(0.06, 0.1, 0.05, 'polymer', 0, -0.035, 0.46));       // buttpad
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
      g.add(box(0.025, 0.035, 0.11, 'polymer', 0, 0, 0.04));         // handle
      const blade = box(0.004, 0.035, 0.17, 'steel', 0, 0.005, -0.1);
      g.add(blade);
      g.add(box(0.03, 0.05, 0.012, 'metal', 0, 0, -0.02));           // guard
      muzzle.position.set(0, 0, -0.2);
      break;
    }
  }
  g.add(muzzle);
  return g;
}
