/* flowers.js - procedural 3D flowers facing +Z (toward camera).
   Each petal sits in a pivot group: pivot.rotation.z = fan angle,
   mesh.rotation.x = tilt toward camera. Bloom t: 0 = closed bud,
   1 = fully open. */
import * as THREE from 'three';

const PETAL_SHAPE = new THREE.Shape();
PETAL_SHAPE.moveTo(0, 0);
PETAL_SHAPE.bezierCurveTo(0.22, 0.18, 0.30, 0.55, 0.12, 0.92);
PETAL_SHAPE.bezierCurveTo(0.05, 1.02, -0.05, 1.02, -0.12, 0.92);
PETAL_SHAPE.bezierCurveTo(-0.30, 0.55, -0.22, 0.18, 0, 0);

const petalGeo = new THREE.ShapeGeometry(PETAL_SHAPE, 12);

export function makeFlower(opts = {}) {
  const {
    petalCount = 8,
    color = 0xe88fa2,
    innerColor = 0xd4a24c,
    petalLen = 1,
    layers = 2,
  } = opts;

  const flower = new THREE.Group();
  const petals = []; // { pivot, mesh, layer }
  const colorObj = new THREE.Color(color);

  for (let layer = 0; layer < layers; layer++) {
    const n = Math.max(3, petalCount - layer * 2);
    const sizeScale = 1 - layer * 0.3;
    for (let i = 0; i < n; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / n) * Math.PI * 2 + layer * 0.35; // fan around Z

      const mat = new THREE.MeshStandardMaterial({
        color: colorObj.clone().offsetHSL(0, 0, layer * 0.05),
        side: THREE.DoubleSide,
        roughness: 0.6,
        metalness: 0.05,
        transparent: true,
        opacity: 0.95,
      });
      const mesh = new THREE.Mesh(petalGeo, mat);
      pivot.add(mesh);
      flower.add(pivot);
      petals.push({ pivot, mesh, layer, sizeScale });
    }
  }

  // golden center disc
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(petalLen * 0.16, 16, 12),
    new THREE.MeshStandardMaterial({
      color: innerColor, roughness: 0.4,
      emissive: innerColor, emissiveIntensity: 0.25,
    })
  );
  center.position.z = petalLen * 0.06;
  flower.add(center);

  let bloomT = -1;
  flower.userData.setBloom = (t) => {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    if (clamped === bloomT) return;
    bloomT = clamped;
    const eased = clamped * clamped * (3 - 2 * clamped); // smoothstep
    for (const p of petals) {
      // closed bud: petals tilt ~72deg toward camera; open: flat + slight layer tilt
      const openTilt = p.layer * 0.18;
      p.mesh.rotation.x = (1 - eased) * 1.25 + openTilt;
      const s = 0.35 + 0.65 * eased;
      p.mesh.scale.set(
        petalLen * 0.55 * p.sizeScale * s,
        petalLen * p.sizeScale * s,
        1
      );
    }
  };
  flower.userData.setBloom(1);
  flower.userData.getBloom = () => bloomT;

  return flower;
}

/** Decorative curving stem with two leaves. */
export function makeStem(height = 3, color = 0x4e7a4a) {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.12, height * 0.4, 0.05),
    new THREE.Vector3(-0.1, height * 0.75, -0.04),
    new THREE.Vector3(0.05, height, 0),
  ]);
  group.add(new THREE.Mesh(
    new THREE.TubeGeometry(curve, 20, 0.035, 8, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  ));

  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.5, 0.1, 0.9, 0.5, 0.7, 1.0);
  leafShape.bezierCurveTo(0.35, 0.85, 0.1, 0.45, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 10);
  for (const side of [1, -1]) {
    const leaf = new THREE.Mesh(
      leafGeo,
      new THREE.MeshStandardMaterial({ color: 0x5a8a56, side: THREE.DoubleSide, roughness: 0.7 })
    );
    leaf.scale.set(0.8, 0.8, 1);
    leaf.position.set(side * 0.06, height * 0.45, 0.02);
    leaf.rotation.z = side > 0 ? -0.9 : Math.PI + 0.9;
    group.add(leaf);
  }
  return group;
}
