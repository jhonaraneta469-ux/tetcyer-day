/* ═══════════════════════════════════════════════════════════
   stage.js — owns the single WebGL renderer + render loop.
   Scenes register themselves; only the active one renders.
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  let active = null;           // { scene, camera, update(dt,t), onResize(w,h) }
  const registry = new Map();  // name -> scene bundle
  let last = performance.now();
  let running = true;

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (active) {
      active.update(dt, now / 1000);
      renderer.render(active.scene, active.camera);
    }
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    for (const s of registry.values()) s.onResize?.(window.innerWidth, window.innerHeight);
  });

  return {
    renderer,
    register(name, bundle) { registry.set(name, bundle); },
    activate(name) {
      const bundle = registry.get(name);
      if (bundle) active = bundle;
    },
    deactivate() { active = null; },
    dispose() { running = false; renderer.dispose(); },
    get activeName() { return active ? [...registry.keys()].find(k => registry.get(k) === active) : null; },
    debug: () => ({ active: active?.scene, camera: active?.camera }),
  };
}
