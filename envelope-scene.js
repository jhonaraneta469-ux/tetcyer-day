/* ═══════════════════════════════════════════════════════════
   envelope-scene.js — the 3D envelope + letter.
   All custom geometry, no external textures.

   ── Animation model ───────────────────────────────────────
   Every animated property is a PURE FUNCTION of (openT, t):
   `applyPose()` rewrites the whole rig from scratch each frame
   from overlapping eased tracks. Nothing accumulates, nothing
   is mutated in place, and the closing "land" track blends the
   sequence pose into the perpetual idle pose, so the handoff at
   the end of the timeline is mathematically continuous — there
   is no frame where a value can jump. `reset()` is therefore
   just `openT = 0`.

   ── Timeline (seconds from the click) ─────────────────────
     0.00–0.60  the wax seal wakes: brightens, the star turns
     0.55–2.10  the seal shatters into wedges that tumble away
     0.75–1.95  the flap swings back, revealing the dark interior
     1.55–3.10  the letter rises clear of the envelope mouth
     2.85–4.10  the folded top half unfolds upward
     3.20–5.20  the envelope bows out: sinks, tilts back, fades
     3.60–5.30  the letter turns a full waltz to present itself
     5.00–6.20  the pose lands, blended into the perpetual idle
   ═══════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { makeFlower } from './flowers.js';
import { makePetalField, updatePetalField } from './petals.js';

const TAU = Math.PI * 2;

/* ── easing + track helpers ── */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** normalised progress of `t` through the window [a, b] */
const track = (t, a, b) => clamp01((t - a) / (b - a));
const mix = (a, b, w) => a + (b - a) * w;
const smooth = (p) => p * p * (3 - 2 * p);
/* smootherstep: first AND second derivatives vanish at both ends, so a track
   using it can neither start nor stop with a visible snap. */
const smoother = (p) => p * p * p * (p * (p * 6 - 15) + 10);
const outCubic = (p) => 1 - Math.pow(1 - p, 3);
const inCubic = (p) => p * p * p;
const inOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** overshoots once then settles. Composed over `smooth` so it also leaves
    rest smoothly instead of snapping into motion on the first frame. */
const outBackSoft = (p) => {
  const c = 1.20;
  const u = smooth(p) - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};
/** a 0 → 1 → 0 bump that starts and ends at rest */
const bump = (p) => Math.sin(smooth(p) * Math.PI);

/* ── timeline ── */
const T = {
  sealWake:  [0.00, 0.60],
  sealBreak: [0.55, 2.10],
  flap:      [0.75, 1.95],
  rise:      [1.55, 3.10],
  unfold:    [2.85, 4.10],
  bowOut:    [3.20, 5.20],
  waltz:     [3.60, 5.30],
  land:      [5.00, 6.20],
};
export const OPEN_DURATION = T.land[1];

export function buildEnvelopeScene(stage) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x101426, 0.042);

  /* An opaque scene background. Without one the canvas stays
     transparent, and additively-blended meshes (the halo) write
     alpha into it — which punches a dark rectangle through the
     page gradient instead of glowing. */
  scene.background = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(256, 0, 40, 256, 40, 600);
    grad.addColorStop(0, '#1a2140');
    grad.addColorStop(0.6, '#101426');
    grad.addColorStop(1, '#0a0d1a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
  const camHome = new THREE.Vector3(0, 0.6, 7.5);
  const camEnd = new THREE.Vector3(0, 1.62, 4.95);
  const lookAt = new THREE.Vector3();

  /** How far back the camera must sit for a box of this half-size to fit. */
  function fitZ(halfW, halfH) {
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    return Math.max(halfH / tan, halfW / (tan * camera.aspect));
  }
  /* A phone's viewport is far narrower than it is tall, so a fixed dolly
     distance that frames the letter on a desktop crops it on a phone.
     Both ends of the dolly are therefore derived from the live aspect. */
  function reframe() {
    camHome.z = Math.max(7.5, fitZ(W * 0.62, H * 0.95));
    camEnd.z = Math.max(4.95, fitZ(LW * 0.66, LH * 0.78));
  }
  camera.position.copy(camHome);
  camera.lookAt(0, 0, 0);

  /* ── lights ── */
  scene.add(new THREE.AmbientLight(0xfff2dd, 1.7));
  const key = new THREE.DirectionalLight(0xffe6b3, 4.2);
  key.position.set(3, 5, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe88fa2, 2.6);
  rim.position.set(-5, 2, 4);
  scene.add(rim);
  const under = new THREE.PointLight(0xd4a24c, 2.5, 12);
  under.position.set(0, -2.5, 2);
  scene.add(under);
  /* swells as the letter presents itself */
  const letterLight = new THREE.PointLight(0xffd9a0, 0, 9);
  scene.add(letterLight);

  /* ═══════════════════════════════════════════════════════
     ENVELOPE
     `envelope` carries the shared tilt + idle float.
     `shell`    is only the paper, so it can bow out later
                without dragging the letter down with it.
     ═══════════════════════════════════════════════════════ */
  const envelope = new THREE.Group();
  envelope.name = 'theEnvelope';
  const shell = new THREE.Group();
  envelope.add(shell);
  const W = 2.6, H = 1.7, D = 0.14;

  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xf7ead2, roughness: 0.85, metalness: 0.02, transparent: true,
  });
  const paperBackMat = new THREE.MeshStandardMaterial({
    color: 0xe8d7b6, roughness: 0.88, metalness: 0.02, transparent: true,
  });
  const foldMat = new THREE.MeshStandardMaterial({
    color: 0xf2e3c6, roughness: 0.86, metalness: 0.02, transparent: true,
  });
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x6f5a44, roughness: 0.95, metalness: 0.0, transparent: true,
  });
  const flapInnerMat = new THREE.MeshStandardMaterial({
    color: 0xdcc7a2, roughness: 0.9, metalness: 0.02, side: THREE.BackSide, transparent: true,
  });
  /* every material that belongs to the paper shell, faded together on bow-out */
  const shellMats = [paperMat, paperBackMat, foldMat, innerMat, flapInnerMat];

  // back panel
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paperBackMat);
  back.position.z = -D / 2;
  shell.add(back);

  /* the dark interior, seen through the mouth once the flap lifts */
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.97, H * 0.97), innerMat);
  inner.position.z = -D / 2 + 0.01;
  shell.add(inner);

  // front panel
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), paperMat);
  front.position.z = D / 2;
  shell.add(front);

  const borderMat = new THREE.MeshBasicMaterial({
    color: 0xc9a86a, transparent: true, opacity: 0.3,
  });
  shellMats.push(borderMat);
  const border = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, H * 0.9), borderMat);
  border.position.z = D / 2 + 0.002;
  shell.add(border);

  /* the three front folds — each a slightly different tone so the
     creases of a real envelope read without any texture */
  const mkFold = (pts, z, mat) => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
    m.position.z = z;
    shell.add(m);
    return m;
  };
  const bottomFold = mkFold(
    [[-W / 2, -H / 2], [W / 2, -H / 2], [0, H / 2 - 0.3]], D / 2 + 0.006, paperMat);
  const leftFold = mkFold(
    [[-W / 2, -H / 2], [-W / 2, H / 2], [0, 0]], D / 2 + 0.003, foldMat);
  const rightFold = mkFold(
    [[W / 2, -H / 2], [W / 2, H / 2], [0, 0]], D / 2 + 0.004, paperBackMat);

  /* ── flap: hinged on the top edge of the front face ──
     Two triangles back to back so the underside shows a
     different, darker paper once it swings open. */
  const flapGroup = new THREE.Group();
  flapGroup.position.set(0, H / 2, D / 2);
  const flapShape = new THREE.Shape();
  flapShape.moveTo(-W / 2, 0);
  flapShape.lineTo(W / 2, 0);
  flapShape.lineTo(0, -H * 0.62);
  flapShape.closePath();
  const flapGeo = new THREE.ShapeGeometry(flapShape);
  const flapOuter = new THREE.Mesh(flapGeo, paperMat);
  flapOuter.position.z = 0.008;
  flapGroup.add(flapOuter);
  const flapInner = new THREE.Mesh(flapGeo, flapInnerMat);
  flapInner.position.z = 0.002;
  flapGroup.add(flapInner);
  shell.add(flapGroup);

  /* ── wax seal, built from six wedges so it can shatter ── */
  const SHARDS = 6;
  const sealGroup = new THREE.Group();
  sealGroup.position.set(0, -0.204, D / 2 + 0.032);
  shell.add(sealGroup);
  const shards = [];
  for (let i = 0; i < SHARDS; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc95f77, roughness: 0.35, metalness: 0.15,
      emissive: 0xc95f77, emissiveIntensity: 0.35,
      transparent: true, opacity: 1,
    });
    const wedge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.225, 0.245, 0.062, 10, 1, false,
        (i / SHARDS) * TAU, TAU / SHARDS),
      mat
    );
    wedge.rotation.x = Math.PI / 2;   // face the camera
    const pivot = new THREE.Group();  // animated in envelope-local axes
    pivot.add(wedge);
    sealGroup.add(pivot);
    const a = (i / SHARDS) * TAU + Math.PI / SHARDS;
    shards.push({
      pivot, mat,
      dir: new THREE.Vector3(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.35 + Math.random() * 0.5),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 9),
      speed: 0.55 + Math.random() * 0.5,
    });
  }
  shellMats.push(...shards.map(s => s.mat));

  // gold star pressed into the wax
  const starShape = new THREE.Shape();
  const starPts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.12 : 0.05;
    const a = (i / 10) * TAU - Math.PI / 2;
    starPts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  starShape.setFromPoints(starPts);
  const starMat = new THREE.MeshStandardMaterial({
    color: 0xd4a24c, emissive: 0xd4a24c, emissiveIntensity: 0.6,
    roughness: 0.3, metalness: 0.7, transparent: true,
  });
  shellMats.push(starMat);
  const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape), starMat);
  star.position.set(0, -0.204, D / 2 + 0.068);
  shell.add(star);

  scene.add(envelope);

  /* ═══════════════════════════════════════════════════════
     THE LETTER
     Two halves, each a subdivided plane drawn front and back
     so the paper has a real reverse side and a real thickness
     seen edge-on during the waltz. The geometry ripples every
     frame like paper catching a draught.
     ═══════════════════════════════════════════════════════ */
  const letterRig = new THREE.Group();
  letterRig.name = 'theLetter';
  const LW = W * 0.92, LH = H * 0.88;
  const HALF = LH / 2;
  const PAPER = 0.006;          // half the paper thickness

  const TXW = 1024, TXH = 320;  // matches the LW : HALF aspect (3.2 : 1)

  /* ── the two face textures. The gilded frame is drawn INTO the
     canvas (three sides on each half) so the border can never
     protrude past the paper or z-fight with it. ── */
  function parchment(g) {
    const bg = g.createLinearGradient(0, 0, 0, TXH);
    bg.addColorStop(0, '#fdf6e9');
    bg.addColorStop(1, '#f8eeda');
    g.fillStyle = bg;
    g.fillRect(0, 0, TXW, TXH);
    g.fillStyle = 'rgba(185,141,95,.05)';   // faint grain
    for (let i = 0; i < 220; i++) {
      g.fillRect(Math.random() * TXW, Math.random() * TXH, 2, 1);
    }
  }
  /** Gilded frame. `openEdge` is the side that meets the fold. */
  function gild(g, openEdge) {
    const m = 22, t = 5;
    g.fillStyle = '#d4a24c';
    g.fillRect(m, m, t, TXH - m * 2);              // left
    g.fillRect(TXW - m - t, m, t, TXH - m * 2);    // right
    if (openEdge !== 'top') g.fillRect(m, m, TXW - m * 2, t);
    if (openEdge !== 'bottom') g.fillRect(m, TXH - m - t, TXW - m * 2, t);
    g.fillStyle = 'rgba(212,162,76,.45)';          // inner hairline
    const n = m + t + 6;
    g.fillRect(n, n, 2, TXH - n * 2);
    g.fillRect(TXW - n - 2, n, 2, TXH - n * 2);
  }

  const topCnv = document.createElement('canvas');
  topCnv.width = TXW; topCnv.height = TXH;
  const topCtx = topCnv.getContext('2d');
  function drawTop() {
    const g = topCtx;
    g.clearRect(0, 0, TXW, TXH);
    parchment(g);
    gild(g, 'bottom');           // the fold is this half's bottom edge
    g.textAlign = 'center';
    g.fillStyle = '#a94e63';
    g.font = 'italic 92px "Cormorant Garamond", Georgia, serif';
    g.fillText('Happy', TXW / 2, 138);
    g.font = 'italic 76px "Cormorant Garamond", Georgia, serif';
    g.fillText("Teacher's Day", TXW / 2, 222);
    g.fillStyle = '#d4a24c';     // small flourish either side
    g.font = '40px serif';
    g.fillText('❁', TXW / 2 - 320, 190);
    g.fillText('❁', TXW / 2 + 320, 190);
    topTex.needsUpdate = true;
  }

  const botCnv = document.createElement('canvas');
  botCnv.width = TXW; botCnv.height = TXH;
  const botCtx = botCnv.getContext('2d');
  function drawBottom() {
    const g = botCtx;
    g.clearRect(0, 0, TXW, TXH);
    parchment(g);
    gild(g, 'top');              // the fold is this half's top edge
    g.textAlign = 'center';
    g.fillStyle = '#a94e63';
    g.font = 'italic 64px "Cormorant Garamond", Georgia, serif';
    g.fillText('Dear Teachers & Professors,', TXW / 2, 108);
    g.fillStyle = '#7a5c44';
    g.font = 'italic 46px "Cormorant Garamond", Georgia, serif';
    g.fillText('with love…', TXW / 2, 172);
    g.strokeStyle = 'rgba(185,141,95,.32)';   // ruled script lines
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(200, 214 + i * 26);
      g.lineTo(TXW - 200, 214 + i * 26);
      g.stroke();
    }
    botTex.needsUpdate = true;
  }

  const topTex = new THREE.CanvasTexture(topCnv);
  const botTex = new THREE.CanvasTexture(botCnv);
  for (const tx of [topTex, botTex]) {
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = Math.min(8, stage.renderer.capabilities.getMaxAnisotropy());
  }
  drawTop();
  drawBottom();
  // webfonts arrive after first paint; redraw so the real face is used
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { drawTop(); drawBottom(); });
  }

  const faceMat = (map) => new THREE.MeshStandardMaterial({
    map, roughness: 0.92, metalness: 0.0, side: THREE.FrontSide,
  });
  /* the reverse of the paper: blank, a touch darker, as a real letter is */
  const reverseMat = new THREE.MeshStandardMaterial({
    color: 0xefe2c9, roughness: 0.95, metalness: 0.0, side: THREE.BackSide,
  });

  /** A rippling half-sheet: one geometry, a textured front and a blank back. */
  function makeHalf(map, yCentre) {
    const geo = new THREE.PlaneGeometry(LW, HALF, 32, 12);
    const base = Float32Array.from(geo.attributes.position.array);
    const grp = new THREE.Group();
    const f = new THREE.Mesh(geo, faceMat(map));
    f.position.set(0, yCentre, PAPER);
    const b = new THREE.Mesh(geo, reverseMat);
    b.position.set(0, yCentre, -PAPER);
    grp.add(f, b);
    return { grp, geo, base };
  }

  const bottomHalf = makeHalf(botTex, -HALF / 2);
  letterRig.add(bottomHalf.grp);

  /* the top half hinges on the letter's waist (y = 0) */
  const foldTop = new THREE.Group();
  const topHalf = makeHalf(topTex, HALF / 2);
  foldTop.add(topHalf.grp);
  letterRig.add(foldTop);

  /* a small rose wax seal in the lower corner of the letter */
  const letterSealMat = new THREE.MeshStandardMaterial({
    color: 0xc95f77, roughness: 0.35, metalness: 0.15,
    emissive: 0xc95f77, emissiveIntensity: 0.3,
  });
  const letterSeal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.095, 0.03, 20), letterSealMat);
  letterSeal.rotation.x = Math.PI / 2;
  letterSeal.position.set(LW / 2 - 0.24, -HALF + 0.17, PAPER + 0.015);
  letterRig.add(letterSeal);

  /* halo: a soft radial glow, NOT a hard-edged plane */
  const haloTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 4, 128, 128, 128);
    grad.addColorStop(0.00, 'rgba(255,226,170,0.95)');
    grad.addColorStop(0.35, 'rgba(255,205,140,0.34)');
    grad.addColorStop(0.70, 'rgba(220,150,120,0.08)');
    grad.addColorStop(1.00, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  /* depthTest stays ON: the halo sits behind the letter and must be
     occluded by it, otherwise it washes the writing out. */
  const haloMat = new THREE.MeshBasicMaterial({
    map: haloTex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(LW * 2.6, LH * 2.6), haloMat);
  halo.position.z = -0.16;
  halo.renderOrder = -1;
  letterRig.add(halo);

  envelope.add(letterRig);

  /* ── soft shadow beneath the envelope ── */
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex, transparent: true, opacity: 0.6, depthWrite: false,
  });
  const envelopeShadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.4, W * 2.4), shadowMat);
  envelopeShadow.rotation.x = -Math.PI / 2;
  envelopeShadow.position.set(0, -2.6, -0.4);
  scene.add(envelopeShadow);

  /* ═══ petal burst, thrown from the mouth as the letter rises ═══ */
  const burst = new THREE.Group();
  scene.add(burst);
  const burstPetals = [];
  {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(0.10, 0.08, 0.14, 0.22, 0.06, 0.34);
    s.bezierCurveTo(0.02, 0.40, -0.02, 0.40, -0.06, 0.34);
    s.bezierCurveTo(-0.14, 0.22, -0.10, 0.08, 0, 0);
    const geo = new THREE.ShapeGeometry(s, 8);
    for (let i = 0; i < 30; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.95 + Math.random() * 0.06, 0.6, 0.74),
        transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
      });
      const m = new THREE.Mesh(geo, mat);
      burst.add(m);
      const a = Math.random() * TAU;
      burstPetals.push({
        m, mat,
        dir: new THREE.Vector3(Math.cos(a) * 1.5, 0.35 + Math.random() * 0.9,
                               0.5 + Math.abs(Math.sin(a)) * 0.8),
        dist: 2.2 + Math.random() * 3.0,
        spin: new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5),
        delay: Math.random() * 0.35,
        scale: 0.7 + Math.random() * 0.8,
      });
    }
  }

  /* ═══ ambient petals + motes ═══ */
  const petalField = makePetalField(40, 8);
  scene.add(petalField);

  const moteGeo = new THREE.BufferGeometry();
  const moteCount = 120;
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 16;
    motePos[i * 3 + 1] = (Math.random() - 0.5) * 10;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    moteSeed[i] = Math.random() * TAU;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xffe6b3, size: 0.05, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(motes);

  /* ═══ corner flowers ═══ */
  const cornerFlowers = [];
  const flowerPalette = [0xe88fa2, 0xf2b8c6, 0xd98aa0, 0xc95f77];
  const cornerPositions = [
    [-3.4, 1.8, -1.2], [3.4, 1.8, -1.2], [-3.4, -1.6, -1.2], [3.4, -1.6, -1.2],
  ];
  cornerPositions.forEach((p, i) => {
    const f = makeFlower({ petalCount: 7, color: flowerPalette[i % 4], petalLen: 0.55, layers: 2 });
    f.position.set(p[0], p[1], p[2]);
    f.rotation.z = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    f.userData.setBloom(0.75);
    scene.add(f);
    cornerFlowers.push(f);
  });

  /* ═══════════════════════════════════════════════════════
     INTERACTION
     Only the envelope's paper is pickable. The halo, the letter
     and the shadow are deliberately excluded: the halo alone is
     a 6-unit quad, and raycasting it made roughly a third of the
     screen behave like the envelope.
     ═══════════════════════════════════════════════════════ */
  const pickTargets = [front, back, border, bottomFold, leftFold, rightFold,
                       flapOuter, flapInner, star, ...shards.map(s => s.pivot)];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let opened = false;
  let openT = 0;
  let hovering = false;
  let interactive = false;
  const onOpenCallbacks = [];
  const onDoneCallbacks = [];
  let doneFired = false;

  const isUiEvent = (e) => !!(e.target && e.target.closest &&
    e.target.closest('button, a, .letter-paper, .top-bar'));

  function hitsEnvelope(e) {
    pointer.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickTargets, true).length > 0;
  }

  function setHover(on) {
    if (hovering === on) return;
    hovering = on;
    document.body.style.cursor = on ? 'pointer' : 'default';
  }

  function onClick(e) {
    if (!interactive || opened || isUiEvent(e)) return;
    if (hitsEnvelope(e)) { opened = true; setHover(false); onOpenCallbacks.forEach(cb => cb()); }
  }
  function onMove(e) {
    if (!interactive || opened || isUiEvent(e)) { setHover(false); return; }
    setHover(hitsEnvelope(e));
  }
  window.addEventListener('pointerdown', onClick);
  window.addEventListener('pointermove', onMove);

  /* ═══════════════════════════════════════════════════════
     POSE — every animated value, rebuilt from (openT, t)
     ═══════════════════════════════════════════════════════ */
  const RISE_Y = 1.72;    // clears the mouth: H/2 + LH/2 = 1.60, plus margin
  const DRIFT_Y = 0.30;   // extra lift while unfolding
  const BASE_Y = RISE_Y + DRIFT_Y;

  /* the perpetual resting motion the sequence lands into */
  const idle = {
    y:    (t) => BASE_Y + Math.sin(t * 0.90) * 0.055,
    z:    (t) => Math.sin(t * 0.60) * 0.030,
    rotY: (t) => TAU + Math.sin(t * 0.42) * 0.30,  // TAU keeps the waltz continuous
    rotZ: (t) => Math.sin(t * 0.31) * 0.045,
    rotX: (t) => Math.sin(t * 0.53) * 0.030,
  };

  /** Paper catching a draught. The displacement tapers to nothing at the
      hinge edge and is fullest at the free edge, so both halves stay welded
      along the fold however much the rest of the sheet moves.
      `hinge` is +1 when the fold is the sheet's +y edge, -1 for its -y edge. */
  function ripple(geo, base, amp, t, phase, hinge) {
    const pos = geo.attributes.position;
    const h = HALF / 2;                       // the geometry spans [-h, +h]
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const d = hinge > 0 ? (h - y) / HALF : (y + h) / HALF;  // 0 at the fold
      const taper = smooth(clamp01(d));
      pos.setZ(i,
        Math.sin(x * 2.1 + t * 1.3 + phase) * Math.cos(y * 3.0 - t * 0.9) * amp * taper);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function applyPose(openT, t) {
    /* ── envelope: shared tilt + idle float, both calming as it opens ── */
    const calm = 1 - smooth(track(openT, 0, 1.3));
    envelope.position.y = Math.sin(t * 1.2) * 0.06 * calm;
    envelope.rotation.z = Math.sin(t * 0.8) * 0.02 * calm;
    envelope.rotation.y = Math.sin(t * 0.5) * 0.04 * calm;
    // square the presentation up to the camera once the letter is clear
    envelope.rotation.x = mix(-0.12, 0, smooth(track(openT, 3.1, 4.6)));

    /* ── the wax seal ── */
    const wake = track(openT, ...T.sealWake);
    const brk = track(openT, ...T.sealBreak);
    const brkE = inCubic(brk);
    for (const s of shards) {
      s.pivot.position.set(
        s.dir.x * brkE * 1.5 * s.speed,
        s.dir.y * brkE * 0.9 * s.speed - brk * brk * 2.6,
        s.dir.z * brkE * 0.8 * s.speed
      );
      s.pivot.rotation.set(s.spin.x * brkE, s.spin.y * brkE, s.spin.z * brkE);
      s.pivot.scale.setScalar(1 - brk * 0.25);
      s.mat.emissiveIntensity = 0.35 + Math.sin(wake * Math.PI) * 1.3;
      s.mat.opacity = 1 - outCubic(brk);
      s.pivot.visible = brk < 1;
    }
    star.rotation.z = wake * Math.PI + brk * 6;
    star.scale.setScalar(Math.max(0.001, 1 - outCubic(brk)));
    starMat.opacity = 1 - outCubic(brk);
    star.visible = brk < 1;

    /* ── flap: swings back past vertical, overshoots once, settles ── */
    flapGroup.rotation.x = -outBackSoft(track(openT, ...T.flap)) * Math.PI * 1.18;

    /* ── the envelope bows out of the way ── */
    const bow = smooth(track(openT, ...T.bowOut));
    shell.position.y = -bow * 1.55;
    shell.position.z = -bow * 0.70;
    shell.rotation.x = -bow * 0.50;
    shell.scale.setScalar(1 - bow * 0.16);
    const shellOpacity = 1 - bow * 0.88;
    for (const m of shellMats) {
      m.opacity = m === borderMat ? 0.3 * shellOpacity : shellOpacity;
      m.depthWrite = bow < 0.02;
    }
    shadowMat.opacity = 0.6 * (1 - bow * 0.85);

    /* ── the letter ── */
    const rise = smoother(track(openT, ...T.rise));
    const unfoldP = track(openT, ...T.unfold);
    const unfold = outBackSoft(unfoldP);
    const waltz = inOutCubic(track(openT, ...T.waltz));

    const seqY = rise * RISE_Y + smooth(unfoldP) * DRIFT_Y;
    const seqZ = rise * 0.12;
    const seqRotY = waltz * TAU;
    // a gentle lean into the turn, unwound as the waltz completes
    const seqRotZ = bump(track(openT, ...T.waltz)) * 0.16;
    const seqRotX = -bump(track(openT, ...T.rise)) * 0.10;

    /* land: blend the sequence pose into the idle pose. Because both
       sides are continuous and the weight is continuous, the letter
       can never jump — including at the moment the sequence ends. */
    const w = smooth(track(openT, ...T.land));
    letterRig.position.set(0, mix(seqY, idle.y(t), w), mix(seqZ, idle.z(t), w));
    letterRig.rotation.set(
      mix(seqRotX, idle.rotX(t), w),
      mix(seqRotY, idle.rotY(t), w),
      mix(seqRotZ, idle.rotZ(t), w)
    );

    // the fold: -π (shut inside the envelope) → 0 (open)
    foldTop.rotation.x = -(1 - unfold) * Math.PI;

    // the letter is hidden inside the envelope until it starts to rise
    const emerged = openT > T.rise[0] - 0.01;
    letterSeal.visible = emerged && unfoldP > 0;

    haloMat.opacity = mix(0, 0.34, smooth(track(openT, 1.9, 4.2)))
      + (w > 0.99 ? Math.sin(t * 1.4) * 0.05 : 0) * w;
    letterLight.position.set(0, letterRig.position.y, 1.7);
    letterLight.intensity = 2.1 * smooth(track(openT, 1.8, 4.0));

    /* ── petal burst from the mouth ── */
    for (const p of burstPetals) {
      const bp = clamp01((track(openT, 1.5, 3.4) - p.delay) / (1 - p.delay));
      const e = smoother(bp);
      p.m.position.set(
        p.dir.x * e * p.dist,
        H / 2 + p.dir.y * e * p.dist - bp * bp * 1.9,
        p.dir.z * e * p.dist + 0.3
      );
      p.m.rotation.set(p.spin.x * e, p.spin.y * e, p.spin.z * e);
      p.m.scale.setScalar(p.scale);
      p.mat.opacity = bp <= 0 ? 0 : Math.sin(bp * Math.PI) * 0.9;
      p.m.visible = bp > 0 && bp < 1;
    }

    /* ── camera: one continuous dolly, then held ── */
    const cam = inOutCubic(track(openT, 0.9, 5.6));
    camera.position.set(
      mix(camHome.x, camEnd.x, cam),
      mix(camHome.y, camEnd.y, cam),
      mix(camHome.z, camEnd.z, cam)
    );
    lookAt.set(0, mix(0, BASE_Y - 0.06, cam), 0);
    camera.lookAt(lookAt);

    /* ── the paper breathes ── */
    const life = smooth(track(openT, 2.6, 4.4));
    ripple(bottomHalf.geo, bottomHalf.base, 0.030 * life, t, 0, +1);
    ripple(topHalf.geo, topHalf.base, 0.034 * life, t, 1.7, -1);
  }

  /* ═══ update loop ═══ */
  stage.register('envelope', {
    scene, camera,
    update(dt, t) {
      if (opened && openT < OPEN_DURATION + 0.5) openT += dt;
      applyPose(openT, t);

      /* The sequence advances on the frame clock (dt is capped, so it runs
         slower than the wall clock on a struggling device). Anything that
         waits for it must therefore wait on openT, never on a timer. */
      if (opened && !doneFired && openT >= OPEN_DURATION) {
        doneFired = true;
        onDoneCallbacks.forEach(cb => cb());
      }

      key.intensity = hovering && !opened ? 4.2 + Math.sin(t * 6) * 0.8 : 4.2;

      updatePetalField(petalField, dt, t);

      const pos = moteGeo.attributes.position;
      for (let i = 0; i < moteCount; i++) {
        let y = pos.getY(i) + dt * 0.18;
        if (y > 5) y = -5;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.4 + moteSeed[i]) * dt * 0.12);
      }
      pos.needsUpdate = true;

      for (const f of cornerFlowers) {
        const target = opened ? 1 : 0.75;
        const cur = f.userData.bloomT ?? 0.75;
        const next = cur + (target - cur) * Math.min(dt * 2, 1);
        f.userData.setBloom(next);
        f.userData.bloomT = next;
        f.rotation.z += dt * 0.05;
      }
    },
    onResize(w, h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      reframe();
    },
  });

  reframe();
  applyPose(0, 0);

  return {
    enter() {
      interactive = true;
      stage.activate('envelope');
    },
    /** Programmatically trigger the open sequence (keyboard access). */
    openViaKeyboard() {
      if (!interactive || opened) return;
      opened = true;
      setHover(false);
      onOpenCallbacks.forEach(cb => cb());
    },
    /** The whole rig is a function of openT, so rewinding is the reset. */
    reset() {
      opened = false;
      openT = 0;
      doneFired = false;
      interactive = true;
      setHover(false);
      applyPose(0, performance.now() / 1000);
      return false; // envelopeOpened state
    },
    onOpen(cb) { onOpenCallbacks.push(cb); },
    /** Fired when the open sequence has actually finished playing. */
    onSequenceComplete(cb) { onDoneCallbacks.push(cb); },
    /** Seconds elapsed in the open sequence (0 = shut). Used by the tests. */
    progress() { return openT; },
  };
}
