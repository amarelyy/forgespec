/**
 * Hero 3D circuit board, built from simple shapes (no model files).
 * Animation 1 (on load): parts drop onto the board, then power traces draw themselves from the 5 V regulator.
 *   The path through the 3.3 V regulator to the MCU lights blue; the path that runs 5 V straight into the
 *   3.3 V BME280 turns red and the sensor pulses. This is the headline's story.
 * Animation 2 (on scroll): while the hero scrolls away, the board tilts back, sinks and fades.
 * Drag to turn the board any way, including upside down to see the solder joints underneath.
 * Hovering (or tapping) any part or wire shows what it is; the MCU, the 5 V regulator and the sensor also navigate (onPick).
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

/** Id of anything with a pop-up: a part or a wire. Only the BoardPick ones also navigate. */
type PartId = string;
const NAV = new Set<PartId>(['mcu', 'reg', 'sensor']);

interface Info { name: string; sub: string; action?: string; error?: boolean }
const TARGETS: Record<PartId, Info> = {
  mcu: { name: 'STM32F407 microcontroller', sub: 'The brain of the board', action: 'Open the Component Library' },
  reg: { name: 'LM7805 regulator', sub: 'Makes the 5 V rail', action: 'See how it works' },
  sensor: { name: 'BME280 sensor', sub: 'Needs 3.3 V, gets 5 V', action: 'See how ForgeSpec catches it', error: true },
  ldo: { name: 'AMS1117 3.3 V regulator', sub: 'Turns 5 V into 3.3 V for the MCU. This is the right way to power a 3.3 V part.' },
  cap1: { name: 'C1, 470 \u00b5F capacitor', sub: 'Smooths the battery input before the regulator' },
  cap2: { name: 'C2, 470 \u00b5F capacitor', sub: 'Smooths dips on the 5 V rail' },
  pwr: { name: 'J1 power input', sub: 'A 9 V battery plugs in here' },
  header: { name: 'J2, 12-pin header', sub: 'Wires out to the motors and line sensors' },
  usb: { name: 'USB-C port', sub: 'Programs the MCU and can power the board' },
  xtal: { name: '8 MHz crystal', sub: 'Keeps the MCU clock on time' },
  // Small surface-mount parts (ids match the SMD list below).
  c3: { name: 'C3, 100 nF capacitor', sub: 'Decoupling: soaks up tiny power spikes right next to the MCU' },
  r1: { name: 'R1, 10 k\u03a9 resistor', sub: 'Pull-up that holds the MCU reset pin high' },
  c4: { name: 'C4, 100 nF capacitor', sub: 'Decoupling for the MCU\u2019s other power pins' },
  r2: { name: 'R2, 22 \u03a9 resistor', sub: 'Series resistor on the USB data line' },
  c5: { name: 'C5, 20 pF capacitor', sub: 'Load capacitor that helps the crystal start' },
  r3: { name: 'R3, 4.7 k\u03a9 resistor', sub: 'I2C pull-up on the sensor data line' },
  c6: { name: 'C6, 10 \u00b5F capacitor', sub: 'Keeps the 3.3 V regulator stable' },
  r4: { name: 'R4, 4.7 k\u03a9 resistor', sub: 'I2C pull-up on the sensor clock line' },
  c7: { name: 'C7, 100 nF capacitor', sub: 'Filters noise on the battery input' },
  r5: { name: 'R5, 10 k\u03a9 resistor', sub: 'BOOT0 pull-down, so the MCU starts from its own flash' },
  // Wires. Power traces are 3D; signal traces are painted on the board (WIRES below).
  'w-in': { name: '9 V input trace', sub: 'Battery power from J1 to the LM7805' },
  'w-rail': { name: '5 V rail', sub: 'Regulated 5 V from the LM7805 to the 3.3 V regulator' },
  'w-core': { name: '3.3 V supply', sub: 'Feeds the STM32 the voltage it expects' },
  'w-wrong': { name: '5 V to the BME280: the mistake', sub: 'Puts 5 V on a part rated 1.71 to 3.6 V. ForgeSpec flags this before you order the board.', error: true },
  'w-sda': { name: 'I2C data (SDA)', sub: 'Sensor readings travel from the BME280 to the MCU' },
  'w-scl': { name: 'I2C clock (SCL)', sub: 'The MCU\u2019s clock that paces each reading' },
  'w-hdr': { name: 'Header signals (PA0 to PA5)', sub: 'Six lines from the MCU out to J2, for the motor driver and line sensors' },
  'w-usbn': { name: 'USB D-', sub: 'One half of the USB data pair; it runs side by side with D+' },
  'w-usbp': { name: 'USB D+', sub: 'The other half of the USB data pair' },
  'w-osc': { name: 'Clock lines (OSC_IN, OSC_OUT)', sub: 'Connect the 8 MHz crystal to the MCU' },
  'w-gnd': { name: 'Ground return (bottom side)', sub: 'Carries current back from the sensor side to the regulator' },
  'w-vbat': { name: 'Battery sense line (bottom side)', sub: 'Lets the MCU measure how full the battery is' },
  'w-vbus': { name: 'USB 5 V, VBUS (bottom side)', sub: 'Power from the USB port, routed under the board' },
  'w-gnd2': { name: 'Ground (bottom side)', sub: 'Connects capacitor C1 to ground' },
};

type Pt = [number, number];
/** Signal traces painted on the board: drawn from this list and picked from it (nearest line to the pointer). */
const WIRES: { id: PartId; side: 'top' | 'bottom'; width: number; lines: Pt[][] }[] = [
  { id: 'w-sda', side: 'top', width: 0.05, lines: [[[1.45, 0.25], [2.1, 0.25], [2.65, 0.8], [2.65, 1.3]]] },
  { id: 'w-scl', side: 'top', width: 0.05, lines: [[[1.45, 0.45], [1.95, 0.45], [2.45, 0.95], [2.45, 1.3]]] },
  { id: 'w-hdr', side: 'top', width: 0.04, lines: Array.from({ length: 6 }, (_, i): Pt[] => [[0.75 + i * 0.5, -2.2], [0.75 + i * 0.5, -1.75], [-0.05 + i * 0.25, -1.3]]) },
  { id: 'w-usbn', side: 'top', width: 0.05, lines: [[[3.3, -0.75], [2.2, -0.75], [1.5, -0.55]]] },
  { id: 'w-usbp', side: 'top', width: 0.05, lines: [[[3.3, -0.45], [2.3, -0.45], [1.5, -0.25]]] },
  { id: 'w-osc', side: 'top', width: 0.04, lines: [[[0.4, 0.95], [0.4, 1.3], [0.55, 1.45]], [[0.85, 0.95], [0.85, 1.3], [0.7, 1.45]]] },
  { id: 'w-gnd', side: 'bottom', width: 0.05, lines: [[[-2.6, -1.15], [-2.6, -0.4], [0.2, -0.4], [0.9, 0.3], [2.9, 0.3]]] },
  { id: 'w-vbat', side: 'bottom', width: 0.05, lines: [[[-3.45, 1.95], [-1.0, 1.95], [-0.6, 1.55], [-0.2, 1.55], [-0.2, 1.05]]] },
  { id: 'w-vbus', side: 'bottom', width: 0.05, lines: [[[3.6, -0.6], [2.4, -0.6], [1.9, -1.1], [1.9, -2.25]]] },
  { id: 'w-gnd2', side: 'bottom', width: 0.05, lines: [[[-3.45, -0.35], [-3.45, 0.9], [-2.0, 0.9], [-1.6, 1.3]]] },
];

/** Power traces, built in 3D so they can light up during the intro. */
const POWER: Record<'w-in' | 'w-rail' | 'w-core' | 'w-wrong', Pt[]> = {
  'w-in': [[-3.4, 1.6], [-3.4, 0.25], [-2.9, -0.25], [-2.9, -1.1]],
  'w-rail': [[-2.6, -1.1], [-2.6, 0.2], [-1.9, 0.2], [-1.9, 1.2], [-1.8, 1.2]],
  'w-core': [[-1.0, 1.2], [-0.35, 1.2], [-0.35, 1.08]],
  'w-wrong': [[-2.6, 0.2], [-2.6, 2.25], [2.35, 2.25], [2.75, 1.85]],
};

/** Shortest distance from a point to a polyline, in board units. */
function distToLine(x: number, z: number, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i]!;
    const [x2, z2] = pts[i + 1]!;
    const dx = x2 - x1;
    const dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), z - (z1 + t * dz)));
  }
  return best;
}

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

  // Signal traces (I2C to the sensor, header, USB and crystal to the MCU): dim, static.
  for (const w of WIRES) if (w.side === 'top') w.lines.forEach((pts) => line(pts, 'rgba(96,140,220,.45)', w.width));

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
  text('\u00a9FORGESPEC', -3.5, 2.62, 0.14, 'rgba(226,232,240,.6)', 'left');
  const silkTex = keep(new THREE.CanvasTexture(silk));
  silkTex.colorSpace = THREE.SRGBColorSpace;
  silkTex.anisotropy = 8;
  const silkPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, D)), keep(new THREE.MeshStandardMaterial({ map: silkTex, transparent: true, roughness: 0.6, metalness: 0.2 })));
  silkPlane.rotation.x = -Math.PI / 2;
  silkPlane.position.y = T + 0.021;
  silkPlane.receiveShadow = true;
  boardGroup.add(silkPlane);

  // ---------- underside: copper pads and a solder joint under every through-hole pin ----------
  const JOINTS: [number, number][] = [
    [-2.9, -1.15], [-2.6, -1.15], [-2.3, -1.15], // LM7805 legs
    [-3.57, -0.35], [-3.33, -0.35], [-1.87, -1.35], [-1.63, -1.35], // capacitors
    [-3.62, 1.95], [-3.18, 1.95], // power terminal
    ...Array.from({ length: 12 }, (_, i): [number, number] => [0.525 + i * 0.25, -2.25]), // pin header
    [3.3, -1.0], [3.3, -0.2], [3.9, -1.0], [3.9, -0.2], // USB shell tabs
    [0.42, 1.55], [0.82, 1.55], // crystal
  ];
  const under = document.createElement('canvas');
  under.width = W * S;
  under.height = D * S;
  const u = under.getContext('2d')!;
  // Seen from below, the plane's top edge is the board's front edge, so z is flipped here.
  const uz = (z: number) => (D / 2 - z) * S;
  u.strokeStyle = 'rgba(96,140,220,.4)';
  u.lineCap = 'round';
  u.lineJoin = 'round';
  for (const w of WIRES) {
    if (w.side !== 'bottom') continue;
    u.lineWidth = w.width * S;
    for (const pts of w.lines) {
      u.beginPath();
      pts.forEach(([x, z], i) => (i ? u.lineTo(px(x), uz(z)) : u.moveTo(px(x), uz(z))));
      u.stroke();
    }
  }
  for (const [x, z] of JOINTS) {
    u.fillStyle = '#c99a45';
    u.beginPath();
    u.arc(px(x), uz(z), 0.13 * S, 0, Math.PI * 2);
    u.fill();
  }
  for (const [x, z] of [[-3.65, -2.25], [3.65, -2.25], [-3.65, 2.25], [3.65, 2.25]]) {
    u.fillStyle = '#c99a45';
    u.beginPath();
    u.arc(px(x), uz(z), 0.2 * S, 0, Math.PI * 2);
    u.fill();
    u.fillStyle = '#0b1222';
    u.beginPath();
    u.arc(px(x), uz(z), 0.12 * S, 0, Math.PI * 2);
    u.fill();
  }
  u.fillStyle = 'rgba(226,232,240,.6)';
  u.textAlign = 'center';
  u.textBaseline = 'middle';
  u.font = `700 ${0.42 * S}px "JetBrains Mono", ui-monospace, monospace`;
  u.fillText('\u00a9FORGESPEC', px(0), uz(-0.9));
  u.font = `600 ${0.15 * S}px "JetBrains Mono", ui-monospace, monospace`;
  u.fillText('BOTTOM  REV 14  LEAD-FREE', px(0), uz(-1.45));
  const underTex = keep(new THREE.CanvasTexture(under));
  underTex.colorSpace = THREE.SRGBColorSpace;
  underTex.anisotropy = 8;
  const underPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, D)), keep(new THREE.MeshStandardMaterial({ map: underTex, transparent: true, roughness: 0.6, metalness: 0.2 })));
  underPlane.rotation.x = Math.PI / 2; // faces down
  underPlane.position.y = -0.021;
  boardGroup.add(underPlane);

  // Solder: a shiny cone under each pin, with the cut pin end poking out of it.
  const solderMat = std({ color: 0xdfe3e8, roughness: 0.14, metalness: 1 });
  const cones = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.12, 0.04, 0.1, 20)), solderMat, JOINTS.length);
  const stubs = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.028, 0.028, 0.08, 10)), M.pin, JOINTS.length);
  JOINTS.forEach(([x, z], i) => {
    cones.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, -0.07, z));
    stubs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, -0.15, z));
  });
  cones.castShadow = true;
  boardGroup.add(cones, stubs);

  // ---------- parts ----------
  const TOP = T + 0.02;
  interface Part { group: THREE.Group; delay: number; pick?: PartId; lift: number }
  const parts: Part[] = [];
  const addPart = (x: number, z: number, delay: number, build: (grp: THREE.Group) => void, pick?: PartId) => {
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
  }, 'ldo');

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
  for (const [x, z, d, id] of [[-3.45, -0.35, 0.3, 'cap1'], [-1.75, -1.35, 0.36, 'cap2']] as const) {
    addPart(x, z, d, (grp) => {
      grp.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 32), M.capSleeve).translateY(TOP + 0.35));
      grp.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 32), M.capTop).translateY(TOP + 0.71));
      grp.add(box(0.06, 0.66, 0.1, M.capStripe, 0.27, TOP + 0.35, 0.08));
    }, id);
  }

  // J1: power input terminal block. J2: pin header. USB connector on the right edge. Crystal by the MCU.
  addPart(-3.4, 1.95, 0.42, (grp) => {
    grp.add(box(0.95, 0.5, 0.65, M.blueBlock, 0, TOP + 0.25, 0));
    for (const x of [-0.22, 0.22]) {
      grp.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 20), M.pin).translateX(x).translateY(TOP + 0.52));
    }
  }, 'pwr');
  addPart(1.9, -2.25, 0.48, (grp) => {
    grp.add(box(3.1, 0.24, 0.26, M.plastic, 0, TOP + 0.12, 0));
    const pins = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.06, 0.6, 0.06)), M.gold, 12);
    pins.castShadow = true;
    for (let i = 0; i < 12; i++) pins.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-1.375 + i * 0.25, TOP + 0.3, 0));
    grp.add(pins);
  }, 'header');
  addPart(3.6, -0.6, 0.54, (grp) => {
    grp.add(box(0.75, 0.32, 0.95, M.pin, 0, TOP + 0.16, 0));
    grp.add(box(0.02, 0.14, 0.62, M.plastic, 0.38, TOP + 0.16, 0));
  }, 'usb');
  addPart(0.62, 1.55, 0.58, (grp) => {
    const xtal = mesh(new THREE.CapsuleGeometry(0.15, 0.4, 6, 16), M.pin);
    xtal.rotation.z = Math.PI / 2;
    xtal.scale.set(1, 1, 0.75);
    xtal.position.y = TOP + 0.13;
    grp.add(xtal);
  }, 'xtal');

  // Small SMD resistors and capacitors around the MCU.
  // Tan bodies are capacitors, dark ones resistors.
  const smd: [PartId, number, number, boolean, boolean][] = [
    ['c3', -0.95, 0.6, true, false], ['r1', -0.95, -0.6, false, false], ['c4', 1.75, 0.95, true, true], ['r2', 1.75, -1.15, false, true],
    ['c5', -0.2, 1.55, true, false], ['r3', 1.25, 1.55, false, false], ['c6', -1.95, -0.35, true, true], ['r4', 2.2, 0.3, false, false],
    ['c7', -2.0, 2.0, true, false], ['r5', 0.5, 2.2, false, true],
  ];
  smd.forEach(([id, x, z, tan, turn], i) => {
    addPart(x, z, 0.62 + i * 0.03, (grp) => {
      grp.add(box(0.34, 0.11, 0.17, tan ? M.smdTan : M.smdDark, 0, TOP + 0.055, 0));
      for (const e of [-0.15, 0.15]) grp.add(box(0.06, 0.12, 0.18, M.pin, e, TOP + 0.06, 0));
      if (turn) grp.rotation.y = Math.PI / 2;
    }, id);
  });

  // ---------- power traces (drawn on during the intro) ----------
  interface Path { segs: { mesh: THREE.Mesh; from: number; len: number }[]; joints: { mesh: THREE.Mesh; at: number }[]; total: number }
  const traceMeshes: THREE.Mesh[] = [];
  const buildPath = (id: PartId, pts: Pt[], lit: THREE.Material): Path => {
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
      dim.userData.pick = id;
      traceMeshes.push(dim);
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
  const inPath = buildPath('w-in', POWER['w-in'], M.traceLit);
  const railPath = buildPath('w-rail', POWER['w-rail'], M.traceLit);
  const corePath = buildPath('w-core', POWER['w-core'], M.traceLit);
  const wrongPath = buildPath('w-wrong', POWER['w-wrong'], M.traceErr);

  // Hover glow for a wire: a soft white strip laid over its route, built the first time it is needed.
  const glowMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
  const glows = new Map<PartId, THREE.Group>();
  const routeOf = (id: PartId): { side: 'top' | 'bottom'; lines: Pt[][] } | null => {
    if (id in POWER) return { side: 'top', lines: [POWER[id as keyof typeof POWER]] };
    return WIRES.find((w) => w.id === id) ?? null;
  };
  const setGlow = (id: PartId | null) => {
    requestRender();
    for (const [k, g] of glows) g.visible = k === id;
    if (!id || glows.has(id)) return;
    const route = routeOf(id);
    if (!route) return;
    const grp = new THREE.Group();
    const y = route.side === 'top' ? T + 0.06 : -0.034;
    for (const pts of route.lines) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, z1] = pts[i]!;
        const [x2, z2] = pts[i + 1]!;
        const len = Math.hypot(x2 - x1, z2 - z1);
        const seg = new THREE.Mesh(keep(new THREE.BoxGeometry(len + 0.13, 0.008, 0.13)), glowMat);
        seg.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
        seg.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
        grp.add(seg);
      }
    }
    glows.set(id, grp);
    boardGroup.add(grp);
  };

  // A transparent floor that only shows the board's shadow.
  // It stays put (not in the rotating group) and writes no depth, so a flipped board never clips into it.
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(30, 30)), keep(new THREE.ShadowMaterial({ opacity: 0.14, depthWrite: false })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.2;
  floor.receiveShadow = true;
  scene.add(floor);

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
  let hovered: PartId | null = null;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const pickables = parts.filter((p) => p.pick).map((p) => p.group);
  const coarse = matchMedia('(pointer: coarse)').matches;

  const pickAt = (cx: number, cy: number): PartId | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects([...pickables, ...traceMeshes, silkPlane, underPlane], true)[0];
    if (!hit) return null;
    if ((hit.object === silkPlane || hit.object === underPlane) && hit.uv) {
      // A painted trace: turn the hit point into board coordinates and take the nearest wire on that side.
      const top = hit.object === silkPlane;
      const x = (hit.uv.x - 0.5) * W;
      const z = top ? (0.5 - hit.uv.y) * D : (hit.uv.y - 0.5) * D;
      let best: PartId | null = null;
      let dist = 0.1;
      for (const w of WIRES) {
        if ((w.side === 'top') !== top) continue;
        for (const pts of w.lines) {
          const d = distToLine(x, z, pts);
          if (d < dist) {
            dist = d;
            best = w.id;
          }
        }
      }
      return best;
    }
    return (hit.object.userData.pick as PartId | undefined) ?? null;
  };

  let tipFor: PartId | null = null;
  let tipTimer = 0;
  const showTip = (id: PartId | null, cx = 0, cy = 0) => {
    tipFor = id;
    setGlow(id);
    if (!id) {
      tip.classList.remove('is-on');
      return;
    }
    const t = TARGETS[id];
    const action = t.action && (coarse ? `Tap again: ${t.action.toLowerCase()}` : t.action);
    tip.innerHTML = `<strong>${t.name}</strong><span>${t.sub}</span>${action ? `<em>${action} &rarr;</em>` : ''}`;
    tip.classList.toggle('is-error', !!t.error);
    const rect = container.getBoundingClientRect();
    const x = Math.min(cx - rect.left + 16, rect.width - 250);
    const y = Math.min(cy - rect.top + 16, rect.height - 110);
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
    tip.classList.add('is-on');
  };

  // Hint under the board; fades once the visitor has turned it.
  const hint = document.createElement('div');
  hint.className = 'hb-hint';
  hint.textContent = coarse ? 'Swipe sideways to flip the board. Tap a part for details.' : 'Drag to turn the board over. Hover a part for details.';
  container.appendChild(hint);

  // Drag to turn. Mouse: left/right spins it, up/down tips it over. Touch: a sideways swipe flips it,
  // so vertical swipes still scroll the page (touch-action: pan-y on the canvas).
  const spin = new THREE.Quaternion();
  const REST = new THREE.Quaternion();
  const qd = new THREE.Quaternion();
  const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  const vel = { x: 0, y: 0, touch: false };
  let drag: { id: number; x: number; y: number; sx: number; sy: number; moved: boolean; touch: boolean } | null = null;
  let lastTurn = -Infinity;
  const turn = (dx: number, dy: number, touch: boolean) => {
    const k = 0.009;
    if (touch) spin.premultiply(qd.setFromAxisAngle(AXIS.z, -dx * k));
    else {
      spin.premultiply(qd.setFromAxisAngle(AXIS.y, dx * k));
      spin.premultiply(qd.setFromAxisAngle(AXIS.x, dy * k));
    }
  };

  const ac = new AbortController();
  const { signal } = ac;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, touch: e.pointerType !== 'mouse' };
    vel.x = vel.y = 0;
    canvas.setPointerCapture(e.pointerId);
  }, { signal });
  canvas.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        hovered = null;
        showTip(null);
        container.classList.add('has-turned');
        canvas.style.cursor = 'grabbing';
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      turn(dx, dy, drag.touch);
      Object.assign(vel, { x: dx, y: drag.touch ? 0 : dy, touch: drag.touch });
      drag.x = e.clientX;
      drag.y = e.clientY;
      lastTurn = performance.now();
      requestRender();
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const rect = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    hovered = pickAt(e.clientX, e.clientY);
    canvas.style.cursor = hovered ? 'pointer' : 'grab';
    showTip(hovered, e.clientX, e.clientY);
    requestRender();
  }, { signal });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    canvas.style.cursor = '';
    if (d.moved) {
      // Only coast if the pointer was still moving when released; a pause before letting go stops it dead.
      if (performance.now() - lastTurn > 80) vel.x = vel.y = 0;
      lastTurn = performance.now();
      requestRender();
      return;
    }
    const id = pickAt(e.clientX, e.clientY);
    // A tap on a phone first shows the pop-up; a second tap on the same part follows its link.
    if (d.touch && id && (tipFor !== id || !NAV.has(id))) {
      showTip(id, e.clientX, e.clientY);
      clearTimeout(tipTimer);
      tipTimer = window.setTimeout(() => showTip(null), 3000);
      return;
    }
    if (id && NAV.has(id)) onPick(id as BoardPick);
  }, { signal });
  canvas.addEventListener('pointercancel', () => {
    drag = null;
  }, { signal });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.tx = 0;
    pointer.ty = 0;
    hovered = null;
    showTip(null);
    requestRender();
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
  let prevNow = performance.now();
  const euler = new THREE.Euler();
  const base = new THREE.Quaternion();
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
    // After a drag the board coasts, then eases back to its resting angle once left alone for a moment.
    // Time-based (not per frame), so it feels the same on a slow phone and a 120 Hz laptop.
    const dt = Math.min(0.05, (now - prevNow) / 1000);
    prevNow = now;
    if (!drag && !reduce) {
      if (Math.abs(vel.x) + Math.abs(vel.y) > 0.05) {
        turn(vel.x * dt * 60, vel.y * dt * 60, vel.touch);
        const decay = Math.exp(-5 * dt);
        vel.x *= decay;
        vel.y *= decay;
      } else if (now - lastTurn > 2600) spin.slerp(REST, 1 - Math.exp(-3.5 * dt));
    } else if (!drag && now - lastTurn > 2600) spin.copy(REST);
    euler.set(-0.06 + s * 0.55 + pointer.y * 0.06, -0.42 + pointer.x * 0.12 + s * 0.25, 0);
    root.quaternion.copy(spin).multiply(base.setFromEuler(euler));
    root.position.y = -s * 1.6;
    root.scale.setScalar(1 - s * 0.18);
    canvas.style.opacity = String(1 - s * 0.85);

    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      onReady();
    }

    const settling =
      !!drag ||
      Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > 0.001 ||
      parts.some((p) => Math.abs((p.pick === hovered ? 0.18 : 0) - p.lift) > 0.002);
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
    hint.remove();
    clearTimeout(tipTimer);
  };
}
