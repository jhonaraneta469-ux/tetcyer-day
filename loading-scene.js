/* ═══════════════════════════════════════════════════════════
   loading-scene.js — 3D loading screen:
   blooming flowers + ribbon spirals + floating light motes.
   A scene factory: builds into the shared stage.
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { makeFlower } from './flowers.js';

export function buildLoadingScene(stage) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x101426, 0.055);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9);

  /* ── lights (r155+ physical lighting) ── */
  scene.add(new THREE.AmbientLight(0xfff2dd, 1.7));
  const key = new THREE.DirectionalLight(0xffe6b3, 4.2);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe88fa2, 2.6);
  rim.position.set(-6, -2, 6);
  scene.add(rim);

  /* ── flowers: a ring of 5 blooming flowers ── */
  const flowers = [];
  const palette = [0xe88fa2, 0xd98aa0, 0xf2b8c6, 0xc95f77, 0xe8a8b8];
  for (let i = 0; i < 5; i++) {
    const f = makeFlower({
      petalCount: 8,
      color: palette[i % palette.length],
      innerColor: 0xd4a24c,
      petalLen: 0.9 + Math.random() * 0.4,
      layers: 2,
    });
    const angle = (i / 5) * Math.PI * 2;
    f.position.set(Math.cos(angle) * 3.4, Math.sin(angle) * 2.0, -1.5 - Math.random() * 2);
    f.rotation.z = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    f.userData.setBloom(0);
    scene.add(f);
    flowers.push(f);
  }

  /* ── ribbon spirals: glowing torus-knot ribbons ── */
  const ribbons = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.TorusKnotGeometry(2.2 + i * 0.35, 0.045, 220, 12, 2, 3);
    const mat = new THREE.MeshStandardMaterial({
      color: i === 0 ? 0xd4a24c : i === 1 ? 0xe88fa2 : 0x8fb8d4,
      emissive: i === 0 ? 0xd4a24c : i === 1 ? 0xe88fa2 : 0x8fb8d4,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85,
    });
    const r = new THREE.Mesh(geo, mat);
    r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    scene.add(r);
    ribbons.push(r);
  }

  /* ── floating light motes ── */
  const moteCount = 160;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 22;
    motePos[i * 3 + 1] = (Math.random() - 0.5) * 14;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
    moteSeed[i] = Math.random() * Math.PI * 2;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xffe6b3, size: 0.06, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  scene.add(motes);

  stage.register('loading', {
    scene, camera,
    update(dt, t) {
      // flowers bloom in sequence, then gently keep breathing
      flowers.forEach((f, i) => {
        const local = THREE.MathUtils.clamp(t * 0.5 - i * 0.28, 0, 1);
        f.userData.setBloom(local);
        f.rotation.z += 0.0015 + i * 0.0002;
      });
      ribbons.forEach((r, i) => {
        r.rotation.x += dt * (0.06 + i * 0.02);
        r.rotation.y += dt * (0.08 + i * 0.03);
      });
      const pos = moteGeo.attributes.position;
      for (let i = 0; i < moteCount; i++) {
        let y = pos.getY(i) + dt * 0.25;
        if (y > 7) y = -7;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.5 + moteSeed[i]) * dt * 0.15);
      }
      pos.needsUpdate = true;
      camera.position.x = Math.sin(t * 0.2) * 0.4;
      camera.position.y = Math.cos(t * 0.17) * 0.3;
      camera.lookAt(0, 0, 0);
    },
    onResize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  });
  return { scene, camera };
}
