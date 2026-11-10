/**
 * Small looping 3D previews that act out what each Dashboard and Component Library menu item is for.
 * Same look as the hero board (navy boards, dark chips, brand blue), built from simple shapes.
 *   'projects'    three project boards, each with a cost and a status light; the selection moves between them
 *   'create'      a "+" pulses, an empty board pops in, the first parts drop onto it
 *   'bom'         each part on the board lights up and gets its row in the parts list beside it
 *   'history'     saved versions stack up (v12, v13, v14); a new v15 drops on top
 *   'diff'        version 12 becomes version 14: one part removed (red, sinks), one added (green, drops in)
 *   'report'      a scan line passes over the board; parts turn green, the wrong one red
 *   'subassembly' a motor-driver module drops into a project board and clicks in
 *   'export'      the parts list fills a paper sheet (parts.csv) that slides off to the supplier
 *   'search'      "LM7805" is typed into a search bar; parts that do not match sink away, the match rises and glows
 *   'details'     an LM7805 beside its datasheet card; each raw value ("7V ~ 25V") gets its parsed number (7-25 V)
 *   'custom'      a dashed outline fills in as a new part: body, pins, name, specs, then "added to your library"
 * Returns a cleanup function, like the other motion modules.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type MenuVisualKind = 'projects' | 'create' | 'bom' | 'history' | 'diff' | 'report' | 'subassembly' | 'export' | 'search' | 'details' | 'custom';

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const outBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const T = 0.12; // board thickness

export function initMenuVisual(container: HTMLElement, kind: MenuVisualKind, reduce: boolean): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return () => undefined;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = 'mv-canvas';
  container.appendChild(renderer.domElement);

  const disposables: { dispose: () => void }[] = [];
  const keep = <D extends { dispose: () => void }>(x: D) => (disposables.push(x), x);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = keep(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xdbe6ff, 0x1a2234, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(-4, 8, 5);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 6.2, 7.4);
  camera.lookAt(0, 0.2, 0);

  // ---------- shared building blocks ----------
  const std = (p: THREE.MeshStandardMaterialParameters) => keep(new THREE.MeshStandardMaterial(p));
  const M = {
    board: std({ color: 0x14213d, roughness: 0.55, metalness: 0.15 }),
    module: std({ color: 0x1d4ed8, roughness: 0.5, metalness: 0.1 }),
    chip: std({ color: 0x1c1f26, roughness: 0.45 }),
    pin: std({ color: 0xc9ccd2, roughness: 0.3, metalness: 1 }),
    gold: std({ color: 0xd8ad55, roughness: 0.35, metalness: 1 }),
    paper: std({ color: 0xf8fafc, roughness: 0.9 }),
    lid: std({ color: 0xd0d4db, roughness: 0.25, metalness: 1 }),
  };
  const GREEN = new THREE.Color(0x10b981);
  const RED = new THREE.Color(0xef4444);
  const BLUE = new THREE.Color(0x3b82f6);

  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    return m;
  };
  /** Flat text lying on a surface, read from above. Each has its own material so it can fade. */
  const decal = (text: string, w: number, h: number, color = 'rgba(226,232,240,.85)', align: CanvasTextAlign = 'center') => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.max(32, Math.round((512 * h) / w));
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    g.font = `600 ${c.height * 0.62}px "JetBrains Mono", ui-monospace, monospace`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(text, align === 'left' ? 8 : c.width / 2, c.height / 2);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), mat);
    m.rotation.x = -Math.PI / 2;
    return { mesh: m, mat };
  };
  const board = (w: number, d: number, mat: THREE.Material = M.board) => box(w, T, d, mat, 0, T / 2, 0);
  /** A chip with pin strips on two sides; pass its own material to tint it. */
  const chip = (w: number, d: number, mat: THREE.Material = M.chip, h = 0.16) => {
    const g = new THREE.Group();
    g.add(box(w, h, d, mat, 0, h / 2, 0));
    for (const s of [-1, 1]) g.add(box(w * 0.8, 0.03, 0.08, M.pin, 0, 0.02, s * (d / 2 + 0.04)));
    return g;
  };
  const tint = () => std({ color: 0x1c1f26, roughness: 0.45, emissive: 0x000000 });
  /** A small round status light; its colour is set per frame. */
  const light = () => {
    const mat = keep(new THREE.MeshBasicMaterial({ color: 0x334155 }));
    const m = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 24)), mat);
    return { mesh: m, mat };
  };
  const at = <O extends THREE.Object3D>(o: O, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
  /** A standing TO-220 package (like the LM7805): body, metal tab behind, three legs. Base at y = 0. */
  const to220 = (s = 1, mat: THREE.Material = M.chip) => {
    const g = new THREE.Group();
    g.add(box(0.9 * s, 1.0 * s, 0.36 * s, mat, 0, 0.95 * s, 0));
    g.add(box(0.9 * s, 0.6 * s, 0.08 * s, M.pin, 0, 1.25 * s, -0.14 * s));
    for (const x of [-0.28, 0, 0.28]) g.add(box(0.07 * s, 0.45 * s, 0.05 * s, M.pin, x * s, 0.225 * s, 0.05 * s));
    return g;
  };

  const root = new THREE.Group();
  scene.add(root);
  let update: (t: number) => void = () => undefined;

  // ---------- scenes ----------
  if (kind === 'projects') {
    const names = ['robot  $23', 'weather  $41', 'drone  $68'];
    const status = [GREEN, RED, GREEN];
    const cards = names.map((name, i) => {
      const g = new THREE.Group();
      g.add(board(2.0, 1.45));
      g.add(at(chip(0.6, 0.6), -0.35, T, -0.15));
      g.add(at(chip(0.35, 0.25), 0.45, T, -0.25));
      g.add(at(chip(0.35, 0.25), 0.45, T, 0.2));
      const l = decal(name, 1.5, 0.22);
      l.mesh.position.set(-0.1, T + 0.002, 0.52);
      g.add(l.mesh);
      const led = light();
      led.mat.color.copy(status[i]!);
      g.add(at(led.mesh, 0.78, T + 0.02, -0.55));
      g.position.set((i - 1) * 2.35, 0, 0);
      root.add(g);
      return g;
    });
    const selMat = keep(new THREE.LineBasicMaterial({ color: 0x60a5fa }));
    const sel = new THREE.LineSegments(keep(new THREE.EdgesGeometry(keep(new THREE.PlaneGeometry(2.25, 1.7)))), selMat);
    sel.rotation.x = -Math.PI / 2;
    root.add(sel);
    // 3.9 s loop: the selection rests on each project in turn; the selected one lifts.
    update = (time) => {
      const t = reduce ? 0.6 : time % 3.9;
      const idx = Math.min(2, Math.floor(t / 1.3));
      const local = (t % 1.3) / 1.3;
      cards.forEach((c, i) => {
        const target = i === idx ? 0.28 : 0;
        c.position.y += (target - c.position.y) * (reduce ? 1 : 0.15);
        c.position.y += reduce ? 0 : Math.sin(time * 1.6 + i) * 0.004;
      });
      const from = ((idx + 2) % 3) - 1;
      const to = idx - 1;
      const k = outCubic(clamp01(local / 0.35));
      sel.position.set((from + (to - from) * k) * 2.35, 0.02 + cards[idx]!.position.y, 0);
    };
  } else if (kind === 'create') {
    const plus = new THREE.Group();
    const plusMat = keep(new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true }));
    plus.add(box(0.9, 0.06, 0.18, plusMat), box(0.18, 0.06, 0.9, plusMat));
    root.add(plus);
    const outlineMat = keep(new THREE.LineDashedMaterial({ color: 0x60a5fa, dashSize: 0.18, gapSize: 0.12, transparent: true }));
    const outline = new THREE.LineSegments(keep(new THREE.EdgesGeometry(keep(new THREE.PlaneGeometry(3.6, 2.4)))), outlineMat);
    outline.computeLineDistances();
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = 0.01;
    root.add(outline);
    const nb = new THREE.Group();
    nb.add(board(3.6, 2.4));
    const nl = decal('new-project', 1.6, 0.24);
    nl.mesh.position.set(-0.85, T + 0.002, 0.95);
    nb.add(nl.mesh);
    root.add(nb);
    const parts = [at(chip(0.8, 0.8), 0.3, T, -0.2), at(chip(0.5, 0.3), -1.0, T, -0.4), at(chip(0.4, 0.3), 1.2, T, 0.5)];
    parts.forEach((p) => nb.add(p));
    // 4.6 s loop: "+" pulses, the board pops in, three parts drop on, hold, shrink away.
    update = (time) => {
      const t = reduce ? 3.4 : time % 4.6;
      const pop = outBack(seg(t, 0.9, 1.5));
      const out = outCubic(seg(t, 4.0, 4.6));
      plus.scale.setScalar((1 + Math.sin(time * 5) * 0.08 * (reduce ? 0 : 1)) * (1 - seg(t, 0.8, 1.1)));
      plus.position.y = 0.3;
      plusMat.opacity = 1 - seg(t, 0.8, 1.1);
      outlineMat.opacity = 1 - seg(t, 1.0, 1.4);
      nb.scale.setScalar(Math.max(0.001, pop * (1 - out)));
      parts.forEach((p, i) => {
        const k = outBack(seg(t, 1.8 + i * 0.35, 2.3 + i * 0.35));
        p.position.y = T + (1 - k) * 1.8;
        p.visible = t > 1.8 + i * 0.35;
      });
    };
  } else if (kind === 'bom') {
    const b = new THREE.Group();
    b.add(board(2.8, 2.4));
    b.position.set(-2.0, 0, 0);
    root.add(b);
    const mats = [tint(), tint(), std({ color: 0xd0d4db, roughness: 0.25, metalness: 1, emissive: 0x000000 })];
    const parts = [at(chip(0.9, 0.9, mats[0]), -0.4, T, -0.3), at(chip(0.55, 0.4, mats[1], 0.3), 0.85, T, -0.55), at(chip(0.4, 0.4, mats[2], 0.14), 0.75, T, 0.6)];
    parts.forEach((p) => b.add(p));
    const rowsText = ['STM32F407    x1   $11.20', 'LM7805       x1    $0.89', 'BME280       x1    $6.20'];
    const head = decal('PARTS LIST', 1.4, 0.22, 'rgba(147,197,253,.95)', 'left');
    head.mesh.position.set(1.15, 0.02, -1.05);
    root.add(head.mesh);
    const rows = rowsText.map((txt, i) => {
      const g = new THREE.Group();
      g.add(box(2.6, 0.05, 0.5, M.paper, 0, 0.025, 0));
      const l = decal(txt, 2.45, 0.26, 'rgba(15,23,42,.9)', 'left');
      l.mesh.position.set(0, 0.052, 0);
      g.add(l.mesh);
      g.position.set(1.7, 0, -0.55 + i * 0.62);
      root.add(g);
      return g;
    });
    // 5 s loop: each part lights blue and its row slides in beside the board; hold; reset.
    update = (time) => {
      const t = reduce ? 4 : time % 5;
      const reset = seg(t, 4.5, 5);
      parts.forEach((p, i) => {
        const on = seg(t, 0.4 + i * 0.9, 0.7 + i * 0.9);
        const off = seg(t, 1.0 + i * 0.9, 1.4 + i * 0.9);
        mats[i]!.emissive.copy(BLUE).multiplyScalar(0.7 * on * (1 - off) * (reduce ? 0 : 1));
        p.position.y = T + 0.2 * on * (1 - off);
        const slide = outCubic(seg(t, 0.6 + i * 0.9, 1.1 + i * 0.9));
        rows[i]!.position.x = 1.7 + (1 - slide) * 3 + reset * 3;
        rows[i]!.visible = slide > 0.01 && reset < 0.99;
      });
    };
  } else if (kind === 'history') {
    const labels = ['v12', 'v13', 'v14', 'v15'];
    const stack = labels.map((v, i) => {
      const g = new THREE.Group();
      g.add(board(3.0, 2.0, i === 3 ? M.module : M.board));
      g.add(at(chip(0.7, 0.7), 0.2, T, -0.2));
      g.add(at(chip(0.4, 0.3), -0.9, T, -0.4));
      const l = decal(v, 0.6, 0.24, i === 3 ? 'rgba(255,255,255,.95)' : 'rgba(226,232,240,.85)');
      l.mesh.position.set(-1.1, T + 0.002, 0.72);
      g.add(l.mesh);
      g.position.set(i * 0.18, i * 0.5 - 0.6, -i * 0.12);
      root.add(g);
      return g;
    });
    const newest = stack[3]!;
    // 4 s loop: v12 to v14 stacked; v15 (blue) drops on top; hold; lifts away.
    update = (time) => {
      const t = reduce ? 2.4 : time % 4;
      const drop = outBack(seg(t, 0.6, 1.3));
      const away = outCubic(seg(t, 3.3, 4));
      newest.position.y = 0.9 + (1 - drop) * 2.2 + away * 2.2;
      newest.scale.setScalar(Math.max(0.001, 1 - away));
      newest.visible = t > 0.55;
    };
  } else if (kind === 'diff') {
    root.add(board(5, 3.2));
    root.add(at(chip(1.2, 1.2), 0, T, -0.2));
    root.add(at(chip(0.5, 0.35), -0.4, T, 1.0));
    root.add(at(chip(0.5, 0.35), 0.6, T, 1.0));
    const mk = () => {
      const mat = std({ color: 0x1c1f26, roughness: 0.45, emissive: 0x000000, transparent: true });
      const pinMat = std({ color: 0xc9ccd2, roughness: 0.3, metalness: 1, transparent: true });
      const g = new THREE.Group();
      g.add(box(0.9, 0.16, 0.7, mat, 0, 0.08, 0));
      for (const s of [-1, 1]) g.add(box(0.72, 0.03, 0.08, pinMat, 0, 0.02, s * 0.39));
      const setOpacity = (o: number) => {
        mat.opacity = o;
        pinMat.opacity = o;
        g.visible = o > 0.01;
      };
      return { group: g, mat, setOpacity };
    };
    const removed = mk();
    removed.group.position.set(-1.65, T, -0.4);
    root.add(removed.group);
    const added = mk();
    added.group.position.set(1.65, T, -0.4);
    root.add(added.group);
    const v12 = decal('v12', 0.9, 0.3);
    v12.mesh.position.set(-1.9, T + 0.002, 1.25);
    root.add(v12.mesh);
    const v14 = decal('v14', 0.9, 0.3, 'rgba(147,197,253,.95)');
    v14.mesh.position.set(-1.9, T + 0.002, 1.25);
    root.add(v14.mesh);
    // 5 s loop: version 12, the change happens, hold on version 14, reset.
    update = (time) => {
      const t = reduce ? 3.4 : time % 5;
      const change = seg(t, 1.3, 2.4);
      const reset = seg(t, 4.4, 5);
      removed.mat.emissive.copy(RED).multiplyScalar(0.6 * Math.min(1, change * 3) * (1 - reset));
      removed.group.position.y = T - outCubic(seg(t, 1.7, 2.4)) * 0.5 * (1 - reset);
      removed.setOpacity(1 - seg(t, 1.9, 2.4) * (1 - reset));
      const fall = outBack(seg(t, 1.6, 2.3));
      added.group.position.y = T + (1 - fall) * 1.6 + reset * 1.6;
      added.setOpacity(Math.min(1, seg(t, 1.5, 1.8)) * (1 - reset));
      added.mat.emissive.copy(GREEN).multiplyScalar(0.55 * (1 - seg(t, 3.4, 4.4)) * fall);
      v12.mat.opacity = 1 - change;
      v14.mat.opacity = change * (1 - reset);
    };
  } else if (kind === 'report') {
    root.add(board(4.6, 2.8));
    const specs: [number, number, number, number, number, boolean][] = [
      // x, z, w, d, h, passes
      [-1.6, -0.3, 0.55, 0.4, 0.35, true], // regulator
      [-0.3, -0.1, 1.0, 1.0, 0.16, true], // MCU
      [0.9, 0.7, 0.4, 0.3, 0.14, true], // capacitor
      [1.6, -0.5, 0.45, 0.45, 0.16, false], // the 3.3 V sensor on the 5 V rail
    ];
    const items = specs.map(([x, z, w, d, h, ok]) => {
      const mat = tint();
      root.add(at(chip(w, d, mat, h), x, T, z));
      const led = light();
      led.mesh.position.set(x, T + h + 0.25, z);
      led.mesh.scale.setScalar(0.001);
      root.add(led.mesh);
      return { x, ok, mat, led };
    });
    const scanMat = keep(new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    const scan = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.0, 0.9)), scanMat);
    scan.rotation.y = Math.PI / 2;
    root.add(scan);
    const tally = decal('3 pass   1 fail', 2.0, 0.26, 'rgba(226,232,240,.9)');
    tally.mesh.position.set(-1.0, T + 0.002, 1.15);
    root.add(tally.mesh);
    // 4.4 s loop: the scan line sweeps left to right; each part gets its result as the line passes.
    update = (time) => {
      const t = reduce ? 3.5 : time % 4.4;
      const sweep = seg(t, 0.3, 2.5);
      const sx = -2.4 + sweep * 4.8;
      scan.position.set(sx, 0.55, 0);
      scanMat.opacity = 0.35 * (sweep > 0 && sweep < 1 ? 1 : 0);
      const reset = seg(t, 4.0, 4.4);
      for (const it of items) {
        const hit = clamp01((sx - it.x) / 0.25) * (1 - reset);
        const c = it.ok ? GREEN : RED;
        it.mat.emissive.copy(c).multiplyScalar(0.45 * hit);
        it.led.mat.color.copy(c);
        it.led.mesh.scale.setScalar(Math.max(0.001, outBack(hit)));
      }
      tally.mat.opacity = seg(t, 2.6, 3.0) * (1 - reset);
    };
  } else if (kind === 'subassembly') {
    root.add(board(5, 3.2));
    root.add(at(chip(1.1, 1.1), -1.4, T, -0.3));
    root.add(at(chip(0.5, 0.35), -1.6, T, 0.9));
    root.add(at(chip(0.5, 0.35), -0.6, T, 0.9));
    const pl = decal('line-follower-bot', 2.2, 0.28);
    pl.mesh.position.set(-1.1, T + 0.002, -1.35);
    root.add(pl.mesh);
    const slotMat = keep(new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.9 }));
    const slot = new THREE.LineSegments(keep(new THREE.EdgesGeometry(keep(new THREE.PlaneGeometry(2.0, 1.5)))), slotMat);
    slot.rotation.x = -Math.PI / 2;
    slot.position.set(1.15, T + 0.003, 0.05);
    root.add(slot);
    const mod = new THREE.Group();
    mod.add(box(1.9, 0.08, 1.4, M.module, 0, 0.04, 0));
    mod.add(box(0.7, 0.14, 0.7, M.chip, -0.35, 0.15, 0.05));
    mod.add(box(0.3, 0.1, 0.2, M.chip, 0.5, 0.13, 0.35));
    mod.add(box(1.4, 0.1, 0.16, M.chip, 0.1, 0.13, -0.55));
    for (let i = 0; i < 6; i++) mod.add(box(0.05, 0.3, 0.05, M.gold, -0.5 + i * 0.2, 0.25, -0.55));
    const ml = decal('MOTOR DRIVER', 1.2, 0.2, 'rgba(255,255,255,.9)');
    ml.mesh.position.set(0.25, 0.081, 0.48);
    mod.add(ml.mesh);
    root.add(mod);
    const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(keep(new THREE.RingGeometry(1.15, 1.22, 48)), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(1.15, T + 0.01, 0.05);
    root.add(ring);
    // 4.4 s loop: hover above, drop and click in (green ring), rest, lift away.
    update = (time) => {
      const t = reduce ? 2.6 : time % 4.4;
      const drop = outBack(seg(t, 1.0, 1.7));
      const lift = outCubic(seg(t, 3.6, 4.4));
      const high = 1.7 + Math.sin(time * 2.2) * 0.06;
      mod.position.set(1.15, T + (1 - drop) * high + lift * high, 0.05);
      mod.rotation.y = (1 - drop) * 0.35 + lift * 0.35;
      const click = seg(t, 1.7, 2.6);
      ring.scale.setScalar(1 + click * 0.5);
      ringMat.opacity = reduce ? 0.6 : t > 1.7 && t < 2.6 ? 1 - click : 0;
      slotMat.opacity = 0.9 * (1 - drop) + 0.15;
    };
  } else if (kind === 'export') {
    const b = new THREE.Group();
    b.add(board(2.6, 2.0));
    b.add(at(chip(0.8, 0.8), -0.3, T, -0.2));
    b.add(at(chip(0.45, 0.35, M.chip, 0.3), 0.75, T, -0.45));
    b.add(at(chip(0.35, 0.35, M.lid, 0.14), 0.7, T, 0.5));
    b.position.set(-1.9, 0, 0);
    root.add(b);
    const sheet = new THREE.Group();
    sheet.add(box(2.4, 0.03, 2.8, M.paper, 0, 0.015, 0));
    const title = decal('parts.csv', 1.6, 0.26, 'rgba(29,78,216,.95)', 'left');
    title.mesh.position.set(-0.1, 0.032, -1.1);
    sheet.add(title.mesh);
    const lines = ['mpn,qty,price', 'STM32F407,1,11.20', 'LM7805,1,0.89', 'BME280,1,6.20'].map((txt, i) => {
      const l = decal(txt, 2.1, 0.22, i ? 'rgba(15,23,42,.85)' : 'rgba(71,85,105,.9)', 'left');
      l.mesh.position.set(0, 0.032, -0.55 + i * 0.42);
      sheet.add(l.mesh);
      return l;
    });
    root.add(sheet);
    // 4.8 s loop: the rows fill in one by one, then the sheet lifts and slides off to the right.
    update = (time) => {
      const t = reduce ? 2.6 : time % 4.8;
      const go = outCubic(seg(t, 3.2, 4.4));
      const back = seg(t, 4.4, 4.8);
      // While the empty sheet pops back in for the next loop, its rows stay blank.
      lines.forEach((l, i) => (l.mat.opacity = back > 0 ? 0 : seg(t, 0.4 + i * 0.45, 0.7 + i * 0.45)));
      if (back > 0) {
        sheet.position.set(1.4, 0, 0);
        sheet.rotation.set(0, 0, 0);
        sheet.scale.setScalar(Math.max(0.001, back));
      } else {
        sheet.position.set(1.4 + go * 4.5, go * 0.8, 0);
        sheet.rotation.set(0, -go * 0.3, go * 0.15);
        sheet.scale.setScalar(1);
      }
    };
  } else if (kind === 'search') {
    root.add(at(board(5.0, 2.7), 0, 0, 0.25));
    // The search bar, floating behind the tray, with one decal per typing step.
    const bar = new THREE.Group();
    bar.add(box(4.6, 0.1, 0.62, M.paper, 0, 0.05, 0));
    const typed = ['', 'L', 'LM', 'LM7', 'LM78', 'LM780', 'LM7805'];
    const steps = typed.map((q) => {
      const l = decal(q ? `Search   ${q}|` : 'Search   part number', 4.3, 0.34, q ? 'rgba(15,23,42,.95)' : 'rgba(100,116,139,.9)', 'left');
      l.mesh.position.set(0, 0.102, 0);
      bar.add(l.mesh);
      return l;
    });
    bar.position.set(0, 0.35, -1.65);
    root.add(bar);
    const names = ['STM32F407', 'ESP32', 'LM7805', 'BME280', 'LM317', 'RP2040', 'AMS1117', 'HC-SR04'];
    const glowMat = tint();
    const parts = names.map((name, i) => {
      const x = -1.75 + (i % 4) * 1.17;
      const z = -0.25 + Math.floor(i / 4) * 1.15;
      const g = name.startsWith('LM') ? to220(0.42, name === 'LM7805' ? glowMat : M.chip) : chip(0.55, 0.5);
      g.position.set(x, T, z);
      root.add(g);
      const l = decal(name, 1.05, 0.17);
      l.mesh.position.set(x, T + 0.002, z + 0.45);
      root.add(l.mesh);
      // The letter (1-6) at which the typed text stops matching this part; parts that always match never shrink.
      const stopsAt = typed.findIndex((q, k) => k > 0 && !name.startsWith(q));
      return { name, g, label: l, stopsAt };
    });
    const letterAt = (k: number) => 0.6 + (k - 1) * 0.3; // when letter k appears
    // 6.6 s loop: type one letter every 0.3 s; parts that stop matching shrink away; the match lifts and glows.
    update = (time) => {
      const t = reduce ? 4 : time % 6.6;
      const reset = seg(t, 6.0, 6.6);
      const n = reset > 0 ? 0 : Math.min(6, Math.max(0, Math.floor((t - 0.6) / 0.3) + 1));
      steps.forEach((s, i) => (s.mesh.visible = i === n));
      const q = typed[n]!; // only used for the reduced-motion still
      const done = n === 6 ? seg(t, 2.6, 3.1) : 0;
      for (const p of parts) {
        // Timeline-based (not per frame), so it looks the same on a slow phone and a fast laptop.
        const gone = p.stopsAt < 0 ? 0 : outCubic(seg(t, letterAt(p.stopsAt), letterAt(p.stopsAt) + 0.35));
        const show = reduce ? (p.name.startsWith(q) ? 1 : 0) : Math.max(1 - gone, outCubic(reset));
        p.g.scale.setScalar(Math.max(0.001, show));
        p.g.visible = show > 0.02; // no leftover specks once a part has shrunk away
        p.label.mat.opacity = show;
        if (p.name === 'LM7805') p.g.position.y = T + outCubic(done) * 0.35;
      }
      glowMat.emissive.copy(BLUE).multiplyScalar(0.6 * done);
    };
  } else if (kind === 'details') {
    const stand = new THREE.Group();
    stand.add(board(1.6, 1.3));
    stand.add(at(to220(1), 0, T, 0));
    const tag = decal('LM7805', 1.2, 0.24);
    tag.mesh.position.set(0, T + 0.002, 0.45);
    stand.add(tag.mesh);
    stand.position.set(-2.1, 0, -0.1);
    root.add(stand);
    const card = new THREE.Group();
    card.add(box(3.5, 0.03, 2.5, M.paper, 0, 0.015, 0));
    const title = decal('LM7805  datasheet', 2.4, 0.26, 'rgba(29,78,216,.95)', 'left');
    title.mesh.position.set(-0.4, 0.032, -0.95);
    card.add(title.mesh);
    const hlMat = keep(new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0, depthWrite: false }));
    const rows = [
      ['Input', '"7V ~ 25V"', '7-25 V'],
      ['Output', '"5V"', '5 V'],
      ['Current', '"1.5A"', '1.5 A'],
    ].map(([label, raw, value], i) => {
      const z = -0.35 + i * 0.55;
      const l = decal(label!, 0.9, 0.2, 'rgba(71,85,105,.95)', 'left');
      l.mesh.position.set(-1.2, 0.032, z);
      const r = decal(raw!, 1.2, 0.22, 'rgba(15,23,42,.85)', 'left');
      r.mesh.position.set(-0.15, 0.032, z);
      const v = decal(`-> ${value}`, 1.0, 0.22, 'rgba(29,78,216,1)', 'left');
      v.mesh.position.set(1.15, 0.033, z);
      const hlRow = keep(hlMat.clone());
      const hl = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.3, 0.42)), hlRow);
      hl.rotation.x = -Math.PI / 2;
      hl.position.set(0, 0.031, z);
      card.add(hl, l.mesh, r.mesh, v.mesh);
      return { l, r, v, hl, hlRow };
    });
    card.position.set(1.0, 0, 0.1);
    root.add(card);
    // 5.4 s loop: the raw text appears row by row, then each row is read and its number slides in (blue flash).
    update = (time) => {
      const t = reduce ? 4.2 : time % 5.4;
      const reset = 1 - seg(t, 4.8, 5.4);
      rows.forEach((row, i) => {
        const show = seg(t, 0.2 + i * 0.25, 0.5 + i * 0.25) * reset;
        row.l.mat.opacity = show;
        row.r.mat.opacity = show;
        const read = seg(t, 1.4 + i * 0.6, 1.8 + i * 0.6);
        row.v.mat.opacity = read * reset;
        row.v.mesh.position.x = 1.15 + (1 - outCubic(read)) * 0.4;
        row.hlRow.opacity = 0.35 * Math.sin(Math.PI * seg(t, 1.3 + i * 0.6, 2.0 + i * 0.6));
      });
    };
  } else if (kind === 'custom') {
    root.add(board(3.8, 2.6));
    // The new part: a dashed outline first, then the body grows up from the board, pins slide on, the name prints.
    const W = 1.5;
    const H = 0.36;
    const Dp = 1.0;
    const outlineMat = keep(new THREE.LineDashedMaterial({ color: 0x60a5fa, dashSize: 0.1, gapSize: 0.07, transparent: true }));
    const outline = new THREE.LineSegments(keep(new THREE.EdgesGeometry(keep(new THREE.BoxGeometry(W, H, Dp)))), outlineMat);
    outline.computeLineDistances();
    outline.position.set(0, T + H / 2, -0.15);
    root.add(outline);
    const body = new THREE.Group();
    body.add(box(W, H, Dp, M.chip, 0, H / 2, 0));
    const name = decal('MY-SENSOR', 1.2, 0.24);
    name.mesh.position.set(0, H + 0.002, 0);
    body.add(name.mesh);
    body.position.set(0, T, -0.15);
    root.add(body);
    const pins = [-1, 1].flatMap((side) =>
      [0, 1, 2, 3].map((i) => {
        const p = box(0.1, 0.05, 0.28, M.pin, -0.45 + i * 0.3, T + 0.03, 0);
        root.add(p);
        return { p, side, i };
      }),
    );
    const spec = decal('3.3 V    20 mA', 2.0, 0.24, 'rgba(147,197,253,.95)');
    spec.mesh.position.set(0, T + 0.002, 0.82);
    root.add(spec.mesh);
    const added = new THREE.Group();
    added.add(box(2.6, 0.08, 0.42, std({ color: 0x047857, roughness: 0.5 }), 0, 0.04, 0));
    const addedText = decal('added to your library', 2.4, 0.22, 'rgba(255,255,255,.98)');
    addedText.mesh.position.set(0, 0.082, 0);
    added.add(addedText.mesh);
    added.position.set(0, T, 1.25);
    root.add(added);
    // 5.6 s loop: outline, body fills in, pins, name, specs, then the green "added" tag; hold; everything clears.
    update = (time) => {
      const t = reduce ? 4.2 : time % 5.6;
      const clear = 1 - seg(t, 5.0, 5.6);
      outlineMat.opacity = Math.min(seg(t, 0.1, 0.4), 1 - seg(t, 1.0, 1.4)) * 0.95;
      const fill = outCubic(seg(t, 0.8, 1.4)) * clear;
      body.scale.set(1, Math.max(0.001, fill), 1);
      body.visible = fill > 0.002;
      for (const { p, side, i } of pins) {
        const k = outCubic(seg(t, 1.5 + i * 0.08, 1.9 + i * 0.08));
        p.position.z = -0.15 + side * (Dp / 2 + 0.12 + (1 - k) * 1.3);
        p.visible = k > 0 && clear > 0.01;
      }
      name.mat.opacity = seg(t, 2.3, 2.7);
      spec.mat.opacity = seg(t, 2.8, 3.2) * clear;
      added.scale.setScalar(Math.max(0.001, outBack(seg(t, 3.4, 3.9)) * clear));
    };
  }

  const fit = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.setLength(7.6 * Math.max(1, 1.6 / camera.aspect));
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(container);
  fit();

  let raf = 0;
  const start = performance.now();
  const frame = (now: number) => {
    // The first frame's timestamp can be slightly earlier than `start`; never let time go negative.
    const time = Math.max(0, (now - start) / 1000);
    root.rotation.set(0, -0.35 + (reduce ? 0 : Math.sin(time * 0.5) * 0.15), 0);
    update(time);
    renderer.render(scene, camera);
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  };
}
