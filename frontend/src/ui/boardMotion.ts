/**
 * Hero 3D circuit board, built from simple shapes (no model files).
 * Animation 1 (on load): parts drop onto the board, then power traces draw themselves from the 5 V regulator.
 *   The path through the 3.3 V regulator to the MCU lights blue; the path that runs 5 V straight into the
 *   3.3 V BME280 turns red and the sensor pulses. This is the headline's story.
 * Animation 2 (on scroll): while the hero scrolls away, the board tilts back, sinks and fades.
 * Hovering the MCU, the 5 V regulator or the sensor shows a label; clicking one calls onPick.
 * Returns a cleanup function (StrictMode safe), like the other motion modules.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type BoardPick = 'mcu' | 'reg' | 'sensor';

interface Options {
  reduce: boolean;
  onPick: (id: BoardPick) => void;
  onReady: () => void;
}

// Board size in world units: x is width, z is depth (towards the viewer), y is up.
const W = 8;
const D = 5.6;
const T = 0.16;

const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outBack: (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const TARGETS: Record<BoardPick, { name: string; sub: string; action: string }> = {
  mcu: { name: 'STM32F407 microcontroller', sub: 'The brain of the board', action: 'Open the Component Library' },
  reg: { name: 'LM7805 regulator', sub: 'Makes the 5 V rail', action: 'See how it works' },
  sensor: { name: 'BME280 sensor', sub: 'Needs 3.3 V, gets 5 V', action: 'See how ForgeSpec catches it' },
};

export function initHeroBoard(container: HTMLElement, { reduce, onPick, onReady }: Options): () => void {
  // ---------- renderer, scene, camera ----------
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return () => undefined; // no WebGL: the CSS fallback stays
  }
  const small = matchMedia('(max-width: 920px)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'hb-canvas';
  container.appendChild(renderer.domElement);

  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = keep(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  scene.environment = envTex;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xdbe6ff, 0x1a2234, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-5, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ab4ff, 0.8);
  rim.position.set(6, 4, -6);
  scene.add(rim);

  // ---------- materials ----------
  const std = (p: THREE.MeshStandardMaterialParameters) => keep(new THREE.MeshStandardMaterial(p));
  const M = {
    board: std({ color: 0x14213d, roughness: 0.55, metalness: 0.15 }),
    chip: std({ color: 0x1c1f26, roughness: 0.42, metalness: 0.1 }),
    chipDot: std({ color: 0x3a3f4a, roughness: 0.6 }),
    pin: std({ color: 0xc9ccd2, roughness: 0.28, metalness: 1 }),
    gold: std({ color: 0xd8ad55, roughness: 0.32, metalness: 1 }),
    plastic: std({ color: 0x15171c, roughness: 0.7 }),
    blueBlock: std({ color: 0x2563eb, roughness: 0.5 }),
    capSleeve: std({ color: 0x1e2433, roughness: 0.35, metalness: 0.2 }),
    capTop: std({ color: 0xb8bcc4, roughness: 0.25, metalness: 1 }),
    capStripe: std({ color: 0x9aa3b5, roughness: 0.5 }),
    smdTan: std({ color: 0xb48a5c, roughness: 0.55 }),
    smdDark: std({ color: 0x23262d, roughness: 0.5 }),
    traceDim: std({ color: 0x23417a, roughness: 0.5, metalness: 0.4 }),
    traceLit: std({ color: 0x2563eb, emissive: 0x3b82f6, emissiveIntensity: 0.55, roughness: 0.4 }),
    traceErr: std({ color: 0x2563eb, emissive: 0x3b82f6, emissiveIntensity: 0.55, roughness: 0.4 }),
    sensorLid: std({ color: 0xd0d4db, roughness: 0.22, metalness: 1, emissive: 0xef4444, emissiveIntensity: 0 }),
  };
  // Kept below full brightness so tone mapping does not wash them out to pastel.
  const RED = new THREE.Color(0xdc2626);
  const RED_E = new THREE.Color(0xef4444);
  const BLUE = new THREE.Color(0x2563eb);
  const BLUE_E = new THREE.Color(0x3b82f6);

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return m;
  };

  /** Flat text decal, e.g. the marking printed on a chip. `facing` 'up' lies on a top face, 'front' faces the viewer. */
  const decal = (text: string, w: number, h: number, color: string, facing: 'up' | 'front' = 'up', weight = 600) => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.round((512 * h) / w);
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lines = text.split('\n');
    const size = Math.min(c.height / (lines.length * 1.25), 120);
    g.font = `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
    lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * size * 1.2));
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
    if (facing === 'up') m.rotation.x = -Math.PI / 2;
    return m;
  };

  // ---------- board ----------
  const root = new THREE.Group(); // scroll + parallax transforms
  const boardGroup = new THREE.Group(); // intro rise + idle float
  root.add(boardGroup);
  scene.add(root);

  const shape = new THREE.Shape();
  const r = 0.28;
  shape.moveTo(-W / 2 + r, -D / 2);
  shape.lineTo(W / 2 - r, -D / 2);
  shape.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + r);
  shape.lineTo(W / 2, D / 2 - r);
  shape.quadraticCurveTo(W / 2, D / 2, W / 2 - r, D / 2);
  shape.lineTo(-W / 2 + r, D / 2);
  shape.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - r);
  shape.lineTo(-W / 2, -D / 2 + r);
  shape.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + r, -D / 2);
  const boardGeo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  boardGeo.rotateX(-Math.PI / 2); // shape y -> -z, extrude depth -> +y
  boardGroup.add(mesh(boardGeo, M.board));

  // Silkscreen, pads and the thin signal traces are painted on one texture that sits on the board.
  const S = 256; // canvas pixels per world unit
  const silk = document.createElement('canvas');
  silk.width = W * S;
  silk.height = D * S;
  const g = silk.getContext('2d')!;
  const px = (x: number) => (x + W / 2) * S;
  const pz = (z: number) => (z + D / 2) * S;
  const line = (pts: [number, number][], color: string, width: number) => {
    g.strokeStyle = color;
    g.lineWidth = width * S;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(px(x), pz(z)) : g.moveTo(px(x), pz(z))));
    g.stroke();
  };
  const text = (s: string, x: number, z: number, size = 0.16, color = 'rgba(226,232,240,.85)', align: CanvasTextAlign = 'center') => {
    g.fillStyle = color;
    g.font = `600 ${size * S}px "JetBrains Mono", ui-monospace, monospace`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, px(x), pz(z));
  };
  const outline = (x: number, z: number, w: number, d: number) => {
    g.strokeStyle = 'rgba(226,232,240,.55)';
    g.lineWidth = 0.025 * S;
    g.strokeRect(px(x - w / 2), pz(z - d / 2), w * S, d * S);
  };
  const pad = (x: number, z: number, w: number, d: number) => {
    g.fillStyle = '#c99a45';
    g.fillRect(px(x - w / 2), pz(z - d / 2), w * S, d * S);
  };

  // Signal traces (I2C to the sensor, header and USB to the MCU): dim, static.
  const sig = 'rgba(96,140,220,.45)';
  line([[1.45, 0.25], [2.1, 0.25], [2.65, 0.8], [2.65, 1.3]], sig, 0.05);
  line([[1.45, 0.45], [1.95, 0.45], [2.45, 0.95], [2.45, 1.3]], sig, 0.05);
  for (let i = 0; i < 6; i++) line([[0.75 + i * 0.5, -2.2], [0.75 + i * 0.5, -1.75], [-0.05 + i * 0.25, -1.3]], sig, 0.04);
  line([[3.3, -0.75], [2.2, -0.75], [1.5, -0.55]], sig, 0.05);
  line([[3.3, -0.45], [2.3, -0.45], [1.5, -0.25]], sig, 0.05);
  line([[0.4, 0.95], [0.4, 1.3], [0.55, 1.45]], sig, 0.04);
  line([[0.85, 0.95], [0.85, 1.3], [0.7, 1.45]], sig, 0.04);

  // Vias, mounting holes, outlines, labels.
  g.fillStyle = 'rgba(201,154,69,.8)';
  for (const [x, z] of [[-0.9, -1.7], [-0.4, 1.9], [1.8, 1.2], [2.0, -1.4], [-1.6, -0.9], [3.2, 0.4], [-0.9, 0.3]]) {
    g.beginPath();
    g.arc(px(x), pz(z), 0.06 * S, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, z] of [[-3.65, -2.25], [3.65, -2.25], [-3.65, 2.25], [3.65, 2.25]]) {
    g.fillStyle = '#c99a45';
    g.beginPath();
    g.arc(px(x), pz(z), 0.2 * S, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0b1222';
    g.beginPath();
    g.arc(px(x), pz(z), 0.12 * S, 0, Math.PI * 2);
    g.fill();
  }
  outline(0.4, -0.1, 2.35, 2.35);
  outline(-2.6, -1.5, 1.3, 0.75);
  outline(-1.4, 1.2, 1.05, 0.75);
  outline(3.0, 1.55, 0.95, 0.95);
  pad(-2.9, -1.15, 0.16, 0.22);
  pad(-2.6, -1.15, 0.16, 0.22);
  pad(-2.3, -1.15, 0.16, 0.22);
  text('U1', -0.95, -1.42);
  text('U2  5V', -2.6, -1.98);
  text('U3  3V3', -1.4, 1.72);
  text('U4', 2.4, 1.0);
  text('+5V', -2.3, 0.85, 0.15, 'rgba(147,197,253,.9)');
  text('J1  PWR', -3.35, 2.42, 0.14);
  text('J2', 0.2, -2.55, 0.14);
  text('FORGESPEC  line-follower-bot  v14', -3.5, 2.62, 0.13, 'rgba(226,232,240,.55)', 'left');
  const silkTex = keep(new THREE.CanvasTexture(silk));
  silkTex.colorSpace = THREE.SRGBColorSpace;
  silkTex.anisotropy = 8;
  const silkPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, D)), keep(new THREE.MeshStandardMaterial({ map: silkTex, transparent: true, roughness: 0.6, metalness: 0.2 })));
  silkPlane.rotation.x = -Math.PI / 2;
  silkPlane.position.y = T + 0.021;
  silkPlane.receiveShadow = true;
  boardGroup.add(silkPlane);

  // ---------- parts ----------
  const TOP = T + 0.02;
  interface Part { group: THREE.Group; delay: number; pick?: BoardPick; lift: number }
  const parts: Part[] = [];
  const addPart = (x: number, z: number, delay: number, build: (grp: THREE.Group) => void, pick?: BoardPick) => {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    build(grp);
    if (pick) grp.traverse((o) => (o.userData.pick = pick));
    boardGroup.add(grp);
    parts.push({ group: grp, delay, pick, lift: 0 });
    return grp;
  };

  // U1: STM32, LQFP package with pins on four sides.
  addPart(0.4, -0.1, 0.0, (grp) => {
    const s = 1.9;
    grp.add(box(s, 0.18, s, M.chip, 0, TOP + 0.12, 0));
    const pinGeo = keep(new THREE.BoxGeometry(0.055, 0.035, 0.26));
    const n = 14;
    const pins = new THREE.InstancedMesh(pinGeo, M.pin, n * 4);
    pins.castShadow = true;
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < n; i++) {
        const t = -s / 2 + 0.18 + (i * (s - 0.36)) / (n - 1);
        const rot = new THREE.Matrix4().makeRotationY((side * Math.PI) / 2);
        m4.makeTranslation(t, TOP + 0.04, s / 2 + 0.1).premultiply(rot);
        pins.setMatrixAt(k++, m4);
      }
    }
    grp.add(pins);
    const dot = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 24), M.chipDot);
    dot.position.set(-s / 2 + 0.25, TOP + 0.215, -s / 2 + 0.25);
    grp.add(dot);
    const label = decal('STM32F407\nVGT6', 1.3, 0.55, '#b9c0cc');
    label.position.y = TOP + 0.212;
    grp.add(label);
  }, 'mcu');

  // U2: LM7805 in a TO-220 package, standing up with its metal tab behind.
  addPart(-2.6, -1.5, 0.12, (grp) => {
    grp.add(box(1.0, 1.15, 0.45, M.chip, 0, TOP + 0.45 + 0.575, 0));
    const tab = box(1.0, 0.8, 0.1, M.pin, 0, TOP + 0.45 + 1.15 + 0.2, -0.17);
    grp.add(tab);
    const hole = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 24), M.plastic);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, TOP + 0.45 + 1.15 + 0.32, -0.17);
    grp.add(hole);
    for (const x of [-0.3, 0, 0.3]) grp.add(box(0.08, 0.47, 0.05, M.pin, x, TOP + 0.23, 0.35));
    for (const x of [-0.3, 0, 0.3]) grp.add(box(0.08, 0.05, 0.4, M.pin, x, TOP + 0.47, 0.17));
    const label = decal('LM7805', 0.85, 0.3, '#c7cdd8', 'front');
    label.position.set(0, TOP + 1.15, 0.226);
    grp.add(label);
  }, 'reg');

  // U3: AMS1117 3.3 V regulator (SOT-223), feeds the MCU correctly.
  addPart(-1.4, 1.2, 0.2, (grp) => {
    grp.add(box(0.75, 0.16, 0.42, M.chip, 0, TOP + 0.1, 0.08));
    grp.add(box(0.7, 0.03, 0.22, M.pin, 0, TOP + 0.02, -0.25));
    for (const x of [-0.25, 0, 0.25]) grp.add(box(0.08, 0.03, 0.2, M.pin, x, TOP + 0.02, 0.38));
    const label = decal('3V3', 0.5, 0.2, '#b9c0cc');
    label.position.set(0, TOP + 0.181, 0.08);
    grp.add(label);
  });

  // U4: BME280 sensor, the metal-lid part that ends up on the wrong rail.
  const sensor = addPart(3.0, 1.55, 0.28, (grp) => {
    grp.add(box(0.85, 0.06, 0.85, M.blueBlock, 0, TOP + 0.03, 0));
    grp.add(box(0.55, 0.2, 0.55, M.sensorLid, 0, TOP + 0.16, 0));
    const vent = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16), M.plastic);
    vent.position.set(0.15, TOP + 0.265, -0.15);
    grp.add(vent);
  }, 'sensor');
  const glow = new THREE.PointLight(0xef4444, 0, 3.2, 1.6);
  glow.position.set(0, TOP + 0.9, 0);
  sensor.add(glow);
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.5, 0.58, 48)), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = TOP + 0.01;
  sensor.add(ring);

  // Electrolytic capacitors beside the regulator.
  for (const [x, z, d] of [[-3.45, -0.35, 0.3], [-1.75, -1.35, 0.36]] as const) {
    addPart(x, z, d, (grp) => {
      grp.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 32), M.capSleeve).translateY(TOP + 0.35));
      grp.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 32), M.capTop).translateY(TOP + 0.71));
      grp.add(box(0.06, 0.66, 0.1, M.capStripe, 0.27, TOP + 0.35, 0.08));
    });
  }

  // J1: power input terminal block. J2: pin header. USB connector on the right edge. Crystal by the MCU.
  addPart(-3.4, 1.95, 0.42, (grp) => {
    grp.add(box(0.95, 0.5, 0.65, M.blueBlock, 0, TOP + 0.25, 0));
    for (const x of [-0.22, 0.22]) {
      grp.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 20), M.pin).translateX(x).translateY(TOP + 0.52));
    }
  });
  addPart(1.9, -2.25, 0.48, (grp) => {
    grp.add(box(3.1, 0.24, 0.26, M.plastic, 0, TOP + 0.12, 0));
    const pins = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.06, 0.6, 0.06)), M.gold, 12);
    pins.castShadow = true;
    for (let i = 0; i < 12; i++) pins.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-1.375 + i * 0.25, TOP + 0.3, 0));
    grp.add(pins);
  });
  addPart(3.6, -0.6, 0.54, (grp) => {
    grp.add(box(0.75, 0.32, 0.95, M.pin, 0, TOP + 0.16, 0));
    grp.add(box(0.02, 0.14, 0.62, M.plastic, 0.38, TOP + 0.16, 0));
  });
  addPart(0.62, 1.55, 0.58, (grp) => {
    const xtal = mesh(new THREE.CapsuleGeometry(0.15, 0.4, 6, 16), M.pin);
    xtal.rotation.z = Math.PI / 2;
    xtal.scale.set(1, 1, 0.75);
    xtal.position.y = TOP + 0.13;
    grp.add(xtal);
  });

  // Small SMD resistors and capacitors around the MCU.
  const smd: [number, number, boolean, boolean][] = [
    [-0.95, 0.6, true, false], [-0.95, -0.6, false, false], [1.75, 0.95, true, true], [1.75, -1.15, false, true],
    [-0.2, 1.55, true, false], [1.25, 1.55, false, false], [-1.95, -0.35, true, true], [2.2, 0.3, false, false],
    [-2.0, 2.0, true, false], [0.5, 2.2, false, true],
  ];
  smd.forEach(([x, z, tan, turn], i) => {
    addPart(x, z, 0.62 + i * 0.03, (grp) => {
      grp.add(box(0.34, 0.11, 0.17, tan ? M.smdTan : M.smdDark, 0, TOP + 0.055, 0));
      for (const e of [-0.15, 0.15]) grp.add(box(0.06, 0.12, 0.18, M.pin, e, TOP + 0.06, 0));
      if (turn) grp.rotation.y = Math.PI / 2;
    });
  });

  // ---------- power traces (drawn on during the intro) ----------
  interface Path { segs: { mesh: THREE.Mesh; from: number; len: number }[]; joints: { mesh: THREE.Mesh; at: number }[]; total: number }
  const buildPath = (pts: [number, number][], lit: THREE.Material): Path => {
    const segs: Path['segs'] = [];
    const joints: Path['joints'] = [];
    let total = 0;
    const y = T + 0.035;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i]!;
      const [x2, z2] = pts[i + 1]!;
      const len = Math.hypot(x2 - x1, z2 - z1);
      const angle = Math.atan2(-(z2 - z1), x2 - x1);
      // Dim copper underneath, always visible.
      const dim = mesh(new THREE.BoxGeometry(len + 0.1, 0.02, 0.1), M.traceDim);
      dim.position.set((x1 + x2) / 2, y - 0.004, (z1 + z2) / 2);
      dim.rotation.y = angle;
      dim.castShadow = false;
      boardGroup.add(dim);
      // Lit copy grows from the start of the segment (geometry origin at its start).
      const geo = new THREE.BoxGeometry(len, 0.026, 0.1);
      geo.translate(len / 2, 0, 0);
      const m = mesh(geo, lit);
      m.castShadow = false;
      m.position.set(x1, y, z1);
      m.rotation.y = angle;
      m.scale.x = 0.0001;
      boardGroup.add(m);
      segs.push({ mesh: m, from: total, len });
      if (i > 0) {
        const j = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.026, 16), lit);
        j.position.set(x1, y, z1);
        j.visible = false;
        j.castShadow = false;
        boardGroup.add(j);
        joints.push({ mesh: j, at: total });
      }
      total += len;
    }
    return { segs, joints, total };
  };
  const setPath = (p: Path, progress: number) => {
    const done = progress * p.total;
    for (const s of p.segs) s.mesh.scale.x = Math.max(0.0001, clamp01((done - s.from) / s.len));
    for (const j of p.joints) j.mesh.visible = done >= j.at;
  };
  const inPath = buildPath([[-3.4, 1.6], [-3.4, 0.25], [-2.9, -0.25], [-2.9, -1.1]], M.traceLit);
  const railPath = buildPath([[-2.6, -1.1], [-2.6, 0.2], [-1.9, 0.2], [-1.9, 1.2], [-1.8, 1.2]], M.traceLit);
  const corePath = buildPath([[-1.0, 1.2], [-0.35, 1.2], [-0.35, 1.08]], M.traceLit);
  const wrongPath = buildPath([[-2.6, 0.2], [-2.6, 2.25], [2.35, 2.25], [2.75, 1.85]], M.traceErr);

  // A transparent floor that only shows the board's shadow.
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(30, 30)), keep(new THREE.ShadowMaterial({ opacity: 0.16 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.55;
  floor.receiveShadow = true;
  root.add(floor);

  // ---------- layout ----------
  const tip = document.createElement('div');
  tip.className = 'hb-tip';
  container.appendChild(tip);

  const fit = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull back on tall, narrow stages (phones) so the whole board stays in frame.
    const narrow = w < 600;
    const dist = 15.8 * Math.max(1, (narrow ? 1.45 : 1.15) / camera.aspect);
    const elev = THREE.MathUtils.degToRad(40);
    const shift = narrow ? 0 : -0.2; // nudges the board right, away from the headline
    camera.position.set(shift, Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.lookAt(shift, 0.1, 0);
    camera.updateProjectionMatrix();
    requestRender();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(container);

  // ---------- interaction ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered: BoardPick | null = null;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const pickables = parts.filter((p) => p.pick).map((p) => p.group);

  const pickAt = (cx: number, cy: number): BoardPick | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    return (hit?.object.userData.pick as BoardPick | undefined) ?? null;
  };

  const showTip = (id: BoardPick | null, cx = 0, cy = 0) => {
    if (!id) {
      tip.classList.remove('is-on');
      return;
    }
    const t = TARGETS[id];
    tip.innerHTML = `<strong>${t.name}</strong><span>${t.sub}</span><em>${t.action} &rarr;</em>`;
    tip.classList.toggle('is-error', id === 'sensor');
    const rect = container.getBoundingClientRect();
    const x = Math.min(cx - rect.left + 16, rect.width - 240);
    tip.style.transform = `translate(${Math.max(8, x)}px, ${cy - rect.top + 16}px)`;
    tip.classList.add('is-on');
  };

  const ac = new AbortController();
  const { signal } = ac;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    if (e.pointerType === 'touch') return;
    hovered = pickAt(e.clientX, e.clientY);
    canvas.style.cursor = hovered ? 'pointer' : '';
    showTip(hovered, e.clientX, e.clientY);
    requestRender();
  }, { signal });
  canvas.addEventListener('pointerleave', () => {
    pointer.tx = 0;
    pointer.ty = 0;
    hovered = null;
    showTip(null);
    requestRender();
  }, { signal });
  canvas.addEventListener('click', (e) => {
    const id = pickAt(e.clientX, e.clientY);
    if (id) onPick(id);
  }, { signal });

  // Scroll progress of the board itself: 0 until its top reaches the top of the screen, 1 once it has mostly
  // scrolled away. (Measured on the stage, not the hero, so on phones the board is not already fading when it
  // first comes into view below the text.)
  let scroll = 0;
  const readScroll = () => {
    const r = container.getBoundingClientRect();
    scroll = clamp01((64 - r.top) / (r.height * 0.9));
    requestRender();
  };
  window.addEventListener('scroll', readScroll, { passive: true, signal });

  // Only render while the stage is on screen.
  let visible = true;
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) requestRender();
  });
  io.observe(container);

  // ---------- animation ----------
  const INTRO_PARTS = 1.25; // seconds until the last part lands
  const TRACE_START = 1.45;
  const TRACE_LEN = 1.3;
  const ERROR_AT = TRACE_START + TRACE_LEN + 0.15;
  let start = -1;
  let raf = 0;
  let ready = false;

  const frame = (now: number) => {
    raf = 0;
    if (start < 0) start = now;
    const t = reduce ? 99 : (now - start) / 1000;

    // Board rises in.
    const rise = ease.outCubic(clamp01(t / 0.7));
    boardGroup.position.y = (1 - rise) * -0.8 + (reduce ? 0 : Math.sin(t * 0.9) * 0.05 * clamp01(t - 3));
    boardGroup.scale.setScalar(0.94 + 0.06 * rise);

    // Parts drop in, then the picked one lifts on hover.
    for (const p of parts) {
      const k = clamp01((t - 0.35 - p.delay) / 0.55);
      p.lift += ((p.pick && p.pick === hovered ? 0.18 : 0) - p.lift) * 0.2;
      p.group.position.y = (1 - ease.outBack(k)) * 2.6 + p.lift;
      p.group.visible = k > 0;
    }

    // Traces draw from the 5 V regulator outwards.
    const tr = (delay: number, len = TRACE_LEN) => ease.outCubic(clamp01((t - TRACE_START - delay) / len));
    setPath(inPath, tr(-0.45, 0.6));
    setPath(railPath, tr(0, 0.7));
    setPath(corePath, tr(0.65, 0.4));
    setPath(wrongPath, tr(0.15));

    // The wrong path and the sensor turn red, then the sensor keeps pulsing.
    const err = clamp01((t - ERROR_AT) / 0.35);
    M.traceErr.color.copy(BLUE).lerp(RED, err);
    M.traceErr.emissive.copy(BLUE_E).lerp(RED_E, err);
    const pulse = reduce ? 1 : 0.65 + 0.35 * Math.sin((t - ERROR_AT) * 4);
    M.sensorLid.emissiveIntensity = err * 0.55 * pulse;
    glow.intensity = err * 5 * pulse;
    const wave = reduce ? 0.4 : ((t - ERROR_AT) % 1.6) / 1.6;
    ring.scale.setScalar(1 + wave * 1.6);
    ringMat.opacity = err * (1 - wave) * 0.8;

    // Pointer parallax, eased.
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    // Scroll-away: tilt back, sink, shrink. Combined with the base angle and parallax.
    const s = reduce ? 0 : ease.outCubic(scroll);
    root.rotation.set(-0.06 + s * 0.55 + pointer.y * 0.06, -0.42 + pointer.x * 0.12 + s * 0.25, 0);
    root.position.y = -s * 1.6;
    root.scale.setScalar(1 - s * 0.18);
    canvas.style.opacity = String(1 - s * 0.85);

    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      onReady();
    }

    const settling = Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.001 || parts.some((p) => Math.abs((p.pick === hovered ? 0.18 : 0) - p.lift) > 0.002);
    if (visible && (!reduce || settling)) raf = requestAnimationFrame(frame);
  };
  function requestRender() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  fit();
  readScroll();
  requestRender();

  return () => {
    cancelAnimationFrame(raf);
    ac.abort();
    ro.disconnect();
    io.disconnect();
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
    canvas.remove();
    tip.remove();
  };
}
