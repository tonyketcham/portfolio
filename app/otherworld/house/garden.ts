/**
 * The courtyard garden's living layer: a lawn of instanced grass clumps,
 * flower beds along the walls, wildflowers in the grass, timber edging and
 * swatch-card plant labels. Everything sways in the wind, grows in at the
 * end of the build, and parts around the player as they walk through.
 *
 * The flowers are a little off: tulips whose petals are colour swatches,
 * daisies with a selected radio button for a middle, lavender made of pixels.
 */
import * as THREE from 'three/webgpu';
import { attribute, cos, mix, positionLocal, sin, vec2, vec3, vertexColor } from 'three/tsl';
import { mulberry32 } from '../lib/random';
import { globalUniforms } from '../scene/globals';
import { falloff, fbm, hash12 } from '../shaders/common';
import { archUniforms } from './architecture';
import { Kit } from './kit';
import { houseUniforms } from './materials';
import { inGardenBed, onGardenPath } from './gardenPlan';
import { ROOM, houseWalkable, type HouseLayout, type PlacedRoom } from './layout';

// ── geometry ─────────────────────────────────────────────────────────────────
/** Three blades fanned out from one root, dark at the base, light at the tip. */
function clumpGeometry() {
  const pos: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color('#1f3d12');
  const tip = new THREE.Color('#7fb04a');
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.4;
    const h = 0.2 + (b % 2) * 0.07;
    const lean = 0.06 + b * 0.02;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const w = 0.03;
    // two triangles per blade: a base quad and a pointed tip
    const v0 = [-dz * w + dx * 0.03, 0, dx * w + dz * 0.03];
    const v1 = [dz * w + dx * 0.03, 0, -dx * w + dz * 0.03];
    const v2 = [dx * (0.03 + lean * 0.5), h * 0.55, dz * (0.03 + lean * 0.5)];
    const v3 = [dx * (0.03 + lean), h, dz * (0.03 + lean)];
    const mid = [-dz * w * 0.6 + v2[0], h * 0.55, dx * w * 0.6 + v2[2]];
    for (const v of [v0, v1, v2, v0, v2, mid, mid, v2, v3]) pos.push(...v);
    const c = (y: number) => base.clone().lerp(tip, y / h);
    for (const v of [v0, v1, v2, v0, v2, mid, mid, v2, v3]) {
      const k = c(v[1]);
      col.push(k.r, k.g, k.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // grass looks better lit from above than by its own facets
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  return g;
}

const STEM = '#3f6b2a';
const LEAF = '#4d7c34';

/** Petals are pure white so the per-instance tint can find them. */
function tulipGeometry() {
  const k = new Kit(3);
  k.cyl(0.008, 0.011, 0.27, STEM, [0, 0, 0], 5);
  k.box(0.045, 0.13, 0.008, LEAF, [0.02, 0.02, 0], { rot: [0, 0.4, -0.35] });
  k.box(0.04, 0.1, 0.008, LEAF, [-0.02, 0.03, 0], { rot: [0, -0.5, 0.3] });
  // the head: three square swatches, cupped
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.push([Math.sin(a) * 0.022, 0.27, Math.cos(a) * 0.022], [0, a, 0]);
    k.box(0.055, 0.075, 0.012, '#ffffff', [0, 0, 0], { rot: [-0.32, 0, 0], jitter: 0.04 });
    k.pop();
  }
  return k.build(false)!;
}

function daisyGeometry() {
  const k = new Kit(5);
  k.cyl(0.007, 0.009, 0.19, STEM, [0, 0, 0], 5);
  k.box(0.035, 0.08, 0.007, LEAF, [0.015, 0.01, 0], { rot: [0, 0.2, -0.5] });
  k.push([0, 0.195, 0], [0.35, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(0.022, 0.006, 0.06, '#ffffff', [Math.sin(a) * 0.04, 0, Math.cos(a) * 0.04], { rot: [0, a, 0], jitter: 0.03 });
  }
  // a radio button: ring + selected dot
  k.cyl(0.026, 0.026, 0.012, '#1d4ed8', [0, 0, 0], 10, { jitter: 0 });
  k.cyl(0.013, 0.013, 0.016, '#93c5fd', [0, 0.002, 0], 8, { jitter: 0 });
  k.pop();
  return k.build(false)!;
}

function lavenderGeometry() {
  const k = new Kit(7);
  for (let s = 0; s < 3; s++) {
    const a = s * 2.1;
    const lean = 0.12;
    k.push([0, 0, 0], [Math.cos(a) * lean, 0, Math.sin(a) * lean]);
    k.cyl(0.005, 0.006, 0.3, STEM, [0, 0, 0], 4);
    for (let i = 0; i < 6; i++) k.box(0.026 - i * 0.002, 0.024, 0.026 - i * 0.002, '#ffffff', [0, 0.16 + i * 0.027, 0], { rot: [0, i * 0.5, 0], jitter: 0.05 });
    k.pop();
  }
  return k.build(false)!;
}

// ── instancing ───────────────────────────────────────────────────────────────
interface Inst {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  tint?: THREE.Color;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: Inst[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  mesh.count = list.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const roots = new Float32Array(Math.max(1, list.length) * 4);
  const tints = new Float32Array(Math.max(1, list.length) * 3).fill(1);
  list.forEach((p, i) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.yaw);
    s.setScalar(p.scale);
    m.compose(new THREE.Vector3(p.x, 0, p.z), q, s);
    mesh.setMatrixAt(i, m);
    roots.set([p.x, 0, p.z, (i * 0.618) % 1], i * 4);
    if (p.tint) tints.set([p.tint.r, p.tint.g, p.tint.b], i * 3);
  });
  geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(roots, 4));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Wind, growth and the player wading through, for instanced garden plants.
 * positionLocal is already instance-transformed, so offsets are world-ish.
 */
function plantPosition(sway: number, pulseCentre?: [number, number]) {
  const U = globalUniforms;
  const root = attribute<'vec4'>('aRoot', 'vec4');
  // grow in once the walls are up, each plant a beat after the last
  const grow = houseUniforms.built.sub(0.84).div(0.16).sub(root.w.mul(0.35)).div(0.65).clamp(0, 1);
  let local = positionLocal.sub(root.xyz).mul(vec3(1, grow, 1));
  if (pulseCentre) {
    // soft-body squish: a wave pulses out from the garden's centre, bent and
    // weighted by drifting noise. Volume is kept, so tall means thin.
    const dc = root.xz.sub(vec2(pulseCentre[0], pulseCentre[1])).length();
    const n = fbm(root.xz.mul(0.7).add(U.uTime.mul(0.12)));
    const phase = dc.mul(2.2).sub(U.uTime.mul(2.4)).add(n.mul(4.0));
    const pulse = sin(phase).mul(n.mul(0.9).add(0.45));
    const sy = pulse.mul(0.2).add(1);
    const sxz = sy.sqrt().reciprocal();
    local = local.mul(vec3(sxz, sy, sxz));
  }
  const h = local.y.max(0);
  const w = h.mul(h).mul(sway);
  const ph = root.x.mul(0.6).add(root.z.mul(0.35));
  const gust = sin(U.uTime.mul(0.45).add(root.x.mul(0.08))).mul(0.5).add(0.5);
  const wind = vec3(sin(U.uTime.mul(1.9).add(ph)).mul(w).mul(gust.add(0.4)), 0, cos(U.uTime.mul(1.4).add(ph.mul(1.3))).mul(w).mul(0.6));
  // part around the player
  const away = root.xz.sub(archUniforms.player);
  const d = away.length();
  const push = falloff(d, 0.18, 0.62).mul(h).mul(1.6);
  const dir = away.div(d.max(0.001));
  const part = vec3(dir.x.mul(push), push.mul(-0.35), dir.y.mul(push));
  return root.xyz.add(local).add(wind).add(part);
}

function grassMaterial() {
  const m = new THREE.MeshLambertNodeMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.positionNode = plantPosition(5.5);
  const root = attribute<'vec4'>('aRoot', 'vec4');
  // patchy lawn: a little yellower here, bluer there
  const patch = hash12(root.xz.mul(0.7).floor());
  m.colorNode = mix(vec3(0.9, 0.95, 0.7), vec3(1.05, 1.0, 1.15), patch).mul(hash12(root.xz.mul(13.1)).mul(0.25).add(0.85));
  return m;
}

function flowerMaterial(centre: [number, number]) {
  const m = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true });
  // little side-to-side sway (the beds hug the walls), mostly squish
  m.positionNode = plantPosition(0.7, centre);
  const tint = attribute<'vec3'>('aTint', 'vec3');
  const c = vertexColor();
  const petal = c.r.min(c.g).min(c.b).smoothstep(0.8, 0.9);
  m.colorNode = mix(vec3(1), tint, petal);
  return m;
}

function growMaterial() {
  const m = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true });
  const grow = houseUniforms.built.sub(0.84).div(0.16).clamp(0, 1);
  m.positionNode = positionLocal.mul(vec3(1, grow, 1));
  return m;
}

// ── palettes ─────────────────────────────────────────────────────────────────
const TULIPS = ['#f472b6', '#facc15', '#f97316', '#ef4444', '#a855f7', '#fb7185', '#fde68a'];
const LAVENDER = ['#a78bfa', '#8b5cf6', '#c4b5fd'];
const DAISY = ['#fafafa', '#fef9c3', '#fce7f3'];

type Species = 'tulip' | 'daisy' | 'lavender';

export interface GardenLayer {
  group: THREE.Group;
  /** Where the butterflies should hang around (world xz). */
  centre: [number, number];
  dispose: () => void;
}

/** Build the lawn, beds and flowers for one garden room. */
export function buildGarden(L: HouseLayout, r: PlacedRoom, seed = 1): GardenLayer {
  const rand = mulberry32(seed * 977 + r.index * 31);
  const ox = L.ox + r.i0;
  const oz = L.oz + r.j0;
  const free = (lx: number, lz: number) => houseWalkable(L, r.i0 + Math.floor(lx), r.j0 + Math.floor(lz));

  // lawn
  const clumps: Inst[] = [];
  for (let j = 0; j < ROOM; j++)
    for (let i = 0; i < ROOM; i++) {
      if (!houseWalkable(L, r.i0 + i, r.j0 + j)) continue;
      for (let n = 0; n < 16; n++) {
        const lx = i + rand();
        const lz = j + rand();
        if (onGardenPath(lx, lz, 0.06) || inGardenBed(lx, lz)) continue;
        clumps.push({ x: ox + lx, z: oz + lz, yaw: rand() * Math.PI * 2, scale: 0.75 + rand() * 0.6 });
      }
    }

  // beds: runs of one species with a shared colour, like they were planted
  const flowers: Record<Species, Inst[]> = { tulip: [], daisy: [], lavender: [] };
  const labels: { x: number; z: number; yaw: number; color: string }[] = [];
  const edging = new Kit(seed);
  const sides: { from: [number, number]; dir: [number, number]; inward: [number, number] }[] = [
    { from: [0, 0], dir: [1, 0], inward: [0, 1] },
    { from: [8, 0], dir: [0, 1], inward: [-1, 0] },
    { from: [8, 8], dir: [-1, 0], inward: [0, -1] },
    { from: [0, 8], dir: [0, -1], inward: [1, 0] },
  ];
  const speciesOrder: Species[] = ['tulip', 'lavender', 'tulip', 'daisy'];
  let run = 0;
  for (const s of sides) {
    let open = false;
    let start = 0;
    const flush = (end: number) => {
      if (!open || end - start < 0.6) return;
      open = false;
      // timber edging along the inner edge of the bed
      const a0 = start;
      const a1 = end;
      const cx = s.from[0] + s.dir[0] * ((a0 + a1) / 2) + s.inward[0] * 0.37;
      const cz = s.from[1] + s.dir[1] * ((a0 + a1) / 2) + s.inward[1] * 0.37;
      const len = a1 - a0;
      const along = s.dir[0] !== 0;
      edging.box(along ? len : 0.05, 0.075, along ? 0.05 : len, '#7a5636', [ox + cx, 0, oz + cz]);
      // plant it
      const species = speciesOrder[run % speciesOrder.length];
      const palette = species === 'tulip' ? TULIPS : species === 'lavender' ? LAVENDER : DAISY;
      const color = palette[Math.floor(rand() * palette.length)];
      run++;
      const step = species === 'lavender' ? 0.24 : 0.15;
      for (let a = a0 + 0.12; a < a1 - 0.08; a += step * (0.8 + rand() * 0.4)) {
        for (const depth of species === 'lavender' ? [0.18] : [0.1, 0.25]) {
          const lx = s.from[0] + s.dir[0] * a + s.inward[0] * (depth + (rand() - 0.5) * 0.06);
          const lz = s.from[1] + s.dir[1] * a + s.inward[1] * (depth + (rand() - 0.5) * 0.06);
          const tint = new THREE.Color(rand() < 0.15 ? palette[Math.floor(rand() * palette.length)] : color);
          flowers[species].push({ x: ox + lx, z: oz + lz, yaw: rand() * Math.PI * 2, scale: 1.25 + rand() * 0.45, tint });
        }
      }
      // a swatch card on a stick says what's planted here
      const la = a0 + 0.25;
      labels.push({
        x: ox + s.from[0] + s.dir[0] * la + s.inward[0] * 0.3,
        z: oz + s.from[1] + s.dir[1] * la + s.inward[1] * 0.3,
        yaw: Math.atan2(s.inward[0], s.inward[1]),
        color,
      });
    };
    for (let a = 0; a < 8; a += 0.25) {
      const lx = s.from[0] + s.dir[0] * (a + 0.125) + s.inward[0] * 0.18;
      const lz = s.from[1] + s.dir[1] * (a + 0.125) + s.inward[1] * 0.18;
      const ok = inGardenBed(lx, lz) && free(lx, lz) && lx > 0 && lz > 0 && lx < 8 && lz < 8;
      if (ok && !open) {
        open = true;
        start = a;
      } else if (!ok && open) flush(a);
    }
    flush(8);
  }

  // wildflowers: a few daisies in the lawn
  for (let n = 0; n < 22; n++) {
    const lx = 0.6 + rand() * 6.8;
    const lz = 0.6 + rand() * 6.8;
    if (onGardenPath(lx, lz, 0.12) || inGardenBed(lx, lz) || !free(lx, lz)) continue;
    flowers.daisy.push({ x: ox + lx, z: oz + lz, yaw: rand() * Math.PI * 2, scale: 1.0 + rand() * 0.35, tint: new THREE.Color(DAISY[n % DAISY.length]) });
  }

  for (const l of labels) {
    edging.push([l.x, 0, l.z], [0, l.yaw, 0]);
    edging.cyl(0.008, 0.008, 0.2, '#c2a36b', [0, 0, 0], 4);
    edging.box(0.11, 0.08, 0.012, '#fafafa', [0, 0.17, 0], { rot: [-0.25, 0, 0], jitter: 0 });
    edging.box(0.085, 0.045, 0.004, l.color, [0, 0.19, 0.009], { rot: [-0.25, 0, 0], jitter: 0 });
    edging.pop();
  }

  const group = new THREE.Group();
  group.name = 'garden';
  const disposables: { dispose: () => void }[] = [];
  const add = (o: THREE.Mesh) => {
    group.add(o);
    disposables.push(o.geometry, o.material as THREE.Material);
  };
  add(instanced(clumpGeometry(), grassMaterial(), clumps));
  const fm = flowerMaterial([ox + 4, oz + 4]);
  add(instanced(tulipGeometry(), fm, flowers.tulip));
  add(instanced(daisyGeometry(), fm, flowers.daisy));
  add(instanced(lavenderGeometry(), fm, flowers.lavender));
  const edge = edging.build(true);
  if (edge) {
    const mesh = new THREE.Mesh(edge, growMaterial());
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    add(mesh);
  }
  for (const c of group.children) c.userData.garden = true;
  return {
    group,
    centre: [ox + 4, oz + 4],
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
