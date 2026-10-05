/* petals.js - falling petal particle field shared by scenes */
import * as THREE from 'three';

let petalGeoCache = null;

function makePetalGeometry() {
  if (petalGeoCache) return petalGeoCache;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.10, 0.08, 0.14, 0.22, 0.06, 0.34);
  s.bezierCurveTo(0.02, 0.40, -0.02, 0.40, -0.06, 0.34);
  s.bezierCurveTo(-0.14, 0.22, -0.10, 0.08, 0, 0);
  petalGeoCache = new THREE.ShapeGeometry(s, 8);
  return petalGeoCache;
}

export function makePetalField(count, spread) {
  const group = new THREE.Group();
  const petalGeo = makePetalGeometry();
  const petals = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.95 + Math.random() * 0.06, 0.55, 0.72),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(petalGeo, mat);
    m.position.set(
      (Math.random() - 0.5) * spread * 2,
      Math.random() * 10 - 2,
      (Math.random() - 0.5) * 4 - 0.5
    );
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    m.userData.fallSpeed = 0.3 + Math.random() * 0.5;
    m.userData.swaySeed = Math.random() * Math.PI * 2;
    m.userData.swayAmp = 0.4 + Math.random() * 0.8;
    group.add(m);
    petals.push(m);
  }
  group.userData.petals = petals;
  return group;
}

export function updatePetalField(group, dt, t) {
  const petals = group.userData.petals;
  if (!petals) return;
  for (const p of petals) {
    p.position.y -= p.userData.fallSpeed * dt;
    p.position.x += Math.sin(t * 1.2 + p.userData.swaySeed) * p.userData.swayAmp * dt;
    p.rotation.z += dt * 0.8;
    p.rotation.x += dt * 0.5;
    if (p.position.y < -5.5) {
      p.position.y = 6 + Math.random() * 2;
      p.position.x = (Math.random() - 0.5) * 16;
    }
  }
}
