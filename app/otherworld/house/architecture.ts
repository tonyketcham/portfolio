/**
 * House architecture: floors, walls (with doors, windows, trims and corner
 * posts), the foundation plate, hedges, and contact-shadow decals, plus their
 * TSL materials.
 *
 * Walls cut away (down to knee height, with a hatched section cap like an
 * architectural plan) when they stand between the camera and the player, and
 * rise out of the blueprint during the intro.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  dot,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  normalLocal,
  output,
  positionLocal,
  positionWorld,
  select,
  sin,
  step,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { mulberry32 } from '../lib/random';
import { globalUniforms } from '../scene/globals';
import { bayer4, falloff, fbm, hash12, hash22, hex3, vnoise, type F, type V2, type V3 } from '../shaders/common';
import { tileOverlay } from '../shaders/terrain';
import { HOUSE_STYLES, type HouseStyle } from './styles';
import { houseUniforms } from './materials';
import { gardenBedMask, gardenPathCentre, gardenPathMask, RING_HALF } from './gardenPlan';
import { ROOM, WALL_H, WALL_T, type HouseLayout, type PlacedHotspot, type WallSide } from './layout';
import type { FloorKind } from './types';
import { wallSectionFaces, type WallBox } from './wallSections';

const FLOOR_CODE: Record<FloorKind, number> = { planks: 0, boards: 1, stone: 2, marble: 3, carpet: 4, grass: 5 };

export const archUniforms = {
  /** Player position (xz) for the wall cutaway. */
  player: uniform(new THREE.Vector2(0, -160)),
  /** 0 = walls up, 1 = auto cutaway, 2 = all walls down. */
  cutMode: uniform(1),
  cutHeight: uniform(0.55),
  cutRadius: uniform(7.5),
  /** House centre (xz) for the blueprint rise stagger. */
  centre: uniform(new THREE.Vector2(0, -160)),
  /**
   * The view camera's position. Not `cameraPosition`: shadow passes render
   * from the light, and the walls must cast the same cut there.
   */
  camera: uniform(new THREE.Vector3()),
};

/** CPU twin of the shader's cutaway test, for hiding wall-mounted pieces. */
export function sideIsCut(L: HouseLayout, side: WallSide, cam: THREE.Vector3, player: THREE.Vector2) {
  const mode = archUniforms.cutMode.value;
  if (mode < 0.5) return false;
  if (mode > 1.5) return true;
  const mx = L.ox + (side.a[0] + side.b[0]) / 2;
  const mz = L.oz + (side.a[1] + side.b[1]) / 2;
  const [nx, nz] = side.n;
  const camSide = nx * (cam.x - mx) + nz * (cam.z - mz);
  const plySide = nx * (player.x - mx) + nz * (player.y - mz);
  const along = Math.abs(-nz * (player.x - mx) + nx * (player.y - mz));
  return camSide * plySide < 0 && Math.abs(plySide) < archUniforms.cutRadius.value - 0.75 && along < 6;
}

// ── geometry accumulation ────────────────────────────────────────────────────
class Builder {
  rand = mulberry32(7);
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  seg: number[] = [];
  info: number[] = [];
  clip: number[] = [];
  private box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private n3 = new THREE.Matrix3();

  /** Axis-aligned-to-`yaw` box: centre, size [len, h, thick]. */
  addBox(
    c: [number, number, number],
    size: [number, number, number],
    yaw: number,
    color: THREE.Color,
    seg: [number, number, number, number],
    surf: number,
    cut: number,
    jitter = 0.03
  ) {
    this.m.compose(this.v.set(...c), this.q.setFromEuler(this.e.set(0, yaw, 0)), new THREE.Vector3(...size));
    this.n3.getNormalMatrix(this.m);
    const p = this.box.attributes.position;
    const n = this.box.attributes.normal;
    const tmp = new THREE.Vector3();
    let k = 1;
    for (let i = 0; i < p.count; i++) {
      tmp.fromBufferAttribute(p, i).applyMatrix4(this.m);
      this.pos.push(tmp.x, tmp.y, tmp.z);
      tmp.fromBufferAttribute(n, i).applyMatrix3(this.n3).normalize();
      this.nrm.push(tmp.x, tmp.y, tmp.z);
      if (i % 3 === 0) k = 1 + (this.rand() - 0.5) * 2 * jitter;
      this.col.push(color.r * k, color.g * k, color.b * k);
      this.seg.push(...seg);
      this.info.push(surf, cut);
      this.clip.push(c[1] - size[1] / 2, c[1] + size[1] / 2, 0);
    }
  }

  addWallSection(boxes: WallBox<{ color: THREE.Color; surf: number }>[], origin: [number, number], yaw: number, seg: [number, number, number, number]) {
    this.m.makeRotationY(yaw);
    this.n3.getNormalMatrix(this.m);
    const tmp = new THREE.Vector3();
    for (const f of wallSectionFaces(boxes)) {
      tmp.set(...f.normal).applyMatrix3(this.n3);
      const normal = [tmp.x, tmp.y, tmp.z];
      let k = 1;
      for (const [i, corner] of [0, 1, 2, 0, 2, 3].entries()) {
        tmp.set(...f.corners[corner]).applyMatrix4(this.m);
        this.pos.push(tmp.x + origin[0], tmp.y, tmp.z + origin[1]);
        this.nrm.push(...normal);
        if (i % 3 === 0) k = 1 + (this.rand() - 0.5) * 0.06;
        this.col.push(f.surface.color.r * k, f.surface.color.g * k, f.surface.color.b * k);
        this.seg.push(...seg);
        this.info.push(f.surface.surf, 1);
        this.clip.push(f.lower, f.upper, Number(f.internalTop));
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute(this.seg, 4));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 2));
    g.setAttribute('aClip', new THREE.Float32BufferAttribute(this.clip, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// ── walls ────────────────────────────────────────────────────────────────────
export function buildWalls(L: HouseLayout, style: HouseStyle) {
  const B = new Builder();
  const wallA = new THREE.Color(style.wall[0]);
  const trim = new THREE.Color(style.trim);
  const plinth = new THREE.Color(style.plinth);
  const wood = new THREE.Color('#5a3a22');
  const door = new THREE.Color('#6b4426');
  const hedge = [new THREE.Color('#2f5a24'), new THREE.Color('#3b6b2c'), new THREE.Color('#2a4f20')];
  const W = (x: number) => L.ox + x;
  const Z = (z: number) => L.oz + z;
  const H = WALL_H;
  const T = WALL_T;
  const postHalf = T * 1.7 / 2;

  // foundation plates, one per room
  for (const r of L.rooms) {
    const cx = W(r.i0 + ROOM / 2);
    const cz = Z(r.j0 + ROOM / 2);
    B.addBox([cx, -0.33, cz], [ROOM + 0.02, 0.6, ROOM + 0.02], 0, plinth, [cx, cz, 0, 0], 0, 0, 0.02);
    B.addBox([cx, -0.62, cz], [ROOM - 0.4, 0.08, ROOM - 0.4], 0, new THREE.Color('#141418'), [cx, cz, 0, 0], 0, 0, 0);
  }

  const posts = new Set<string>();
  for (const s of L.sides) {
    const ax = W(s.a[0]);
    const az = Z(s.a[1]);
    const tx = (s.b[0] - s.a[0]) / ROOM;
    const tz = (s.b[1] - s.a[1]) / ROOM;
    const yaw = Math.atan2(-tz, tx); // box length runs along x before yaw
    const normalDirection = -tz * s.n[0] + tx * s.n[1];
    const cx = ax + tx * ROOM * 0.5;
    const cz = az + tz * ROOM * 0.5;
    const seg: [number, number, number, number] = [cx, cz, s.n[0], s.n[1]];
    const at = (u: number): [number, number] => [ax + tx * u, az + tz * u];

    if (s.kind === 'hedge') {
      for (let u = 0.25; u < ROOM; u += 0.5) {
        const [x, z] = at(u);
        const h = 0.7 + B.rand() * 0.15;
        B.addBox([x, h / 2, z], [0.55, h, 0.55], yaw + (B.rand() - 0.5) * 0.3, hedge[Math.floor(B.rand() * 3)], [cx, cz, 0, 0], 0, 0, 0.08);
      }
      continue;
    }

    // solid spans between openings
    const cuts = [...s.openings].sort((p, q) => p.u0 - q.u0);
    let u = 0;
    const spans: [number, number][] = [];
    for (const o of cuts) {
      if (o.u0 > u) spans.push([u, o.u0]);
      u = o.u1;
    }
    if (u < ROOM) spans.push([u, ROOM]);
    const boxes: WallBox<{ color: THREE.Color; surf: number }>[] = [];
    const piece = (u0: number, u1: number, y0: number, y1: number, color = wallA, surf = 1, thick = T, offset = 0) => {
      // Corner posts own their footprint; adjacent sides must not cap it too.
      u0 = Math.max(postHalf, u0);
      u1 = Math.min(ROOM - postHalf, u1);
      if (u1 <= u0) return;
      boxes.push({ lo: [u0, y0, offset - thick / 2], hi: [u1, y1, offset + thick / 2], surface: { color, surf } });
    };
    for (const [u0, u1] of spans) {
      piece(u0, u1, 0, H);
      piece(u0, u1, 0, 0.12, trim, 0, T + 0.05); // skirting
    }
    for (const o of cuts) {
      if (o.kind === 'window') {
        piece(o.u0, o.u1, 0, 0.85);
        piece(o.u0, o.u1, 2.0, H);
        piece(o.u0, o.u1, 0, 0.12, trim, 0, T + 0.05);
        // frame + sill + mullions
        piece(o.u0 - 0.06, o.u1 + 0.06, 0.8, 0.88, trim, 0, T + 0.16);
        piece(o.u0 - 0.06, o.u1 + 0.06, 1.97, 2.06, trim, 0, T + 0.08);
        piece(o.u0 - 0.06, o.u0 + 0.05, 0.85, 2.0, trim, 0, T + 0.08);
        piece(o.u1 - 0.05, o.u1 + 0.06, 0.85, 2.0, trim, 0, T + 0.08);
        const mid = (o.u0 + o.u1) / 2;
        piece(mid - 0.03, mid + 0.03, 0.85, 2.0, trim, 0, 0.06);
        piece(o.u0, o.u1, 1.4, 1.45, trim, 0, 0.06);
      } else {
        piece(o.u0, o.u1, 2.2, H);
        // door frame
        piece(o.u0 - 0.1, o.u0 + 0.02, 0, 2.28, wood, 0, T + 0.1);
        piece(o.u1 - 0.02, o.u1 + 0.1, 0, 2.28, wood, 0, T + 0.1);
        piece(o.u0 - 0.1, o.u1 + 0.1, 2.18, 2.3, wood, 0, T + 0.1);
        if (o.kind === 'closed-door') {
          // double door, ajar by nothing; a small "+" says a room could go here
          piece(o.u0 + 0.03, (o.u0 + o.u1) / 2 - 0.01, 0, 2.18, door, 0, 0.1);
          piece((o.u0 + o.u1) / 2 + 0.01, o.u1 - 0.03, 0, 2.18, door, 0, 0.1);
          for (const k of [-1, 1]) {
            const u = (o.u0 + o.u1) / 2 + k * 0.12;
            piece(u - 0.025, u + 0.025, 1.025, 1.075, new THREE.Color('#d4a72c'), 0, 0.05, -0.07 * normalDirection);
          }
          const mid = (o.u0 + o.u1) / 2;
          for (const [lw, lh] of [
            [0.26, 0.07],
            [0.07, 0.26],
          ]) {
            piece(mid - lw / 2, mid + lw / 2, 1.62 - lh / 2, 1.62 + lh / 2, new THREE.Color('#3b82f6'), 0, 0.04, -0.08);
            piece(mid - lw / 2, mid + lw / 2, 1.62 - lh / 2, 1.62 + lh / 2, new THREE.Color('#3b82f6'), 0, 0.04, 0.08);
          }
        }
      }
    }
    // cornice along the full side
    piece(0, ROOM, H - 0.1, H, trim, 0, T + 0.06);
    B.addWallSection(boxes, [ax, az], yaw, seg);
    // corner posts
    for (const [px, pz] of [at(0), at(ROOM)]) {
      const key = `${px.toFixed(2)},${pz.toFixed(2)}`;
      if (posts.has(key)) continue;
      posts.add(key);
      B.addBox([px, (H + 0.08) / 2, pz], [T * 1.7, H + 0.08, T * 1.7], 0, trim, [px, pz, s.n[0], s.n[1]], 0, 1, 0.02);
    }
  }
  return B.geometry();
}

/** Wall surface pattern by house style (sRGB-ish albedo maths in linear). */
function wallPattern(styleId: number, u: F, y: F, A: V3, Bc: V3): V3 {
  switch (styleId) {
    case 0: {
      // timber frame: posts every 2 units, beams at 1.3 and the top, braces in the upper bays
      const fu = fract(u.div(2));
      const post = step(min(fu, fu.oneMinus()).mul(2), 0.07);
      const beam = step(abs(y.sub(1.3)), 0.08).max(step(abs(y.sub(2.42)), 0.08));
      const brace = step(abs(y.sub(1.3).sub(fu.mul(2).mul(0.55))), 0.05).mul(step(1.3, y));
      const timber = max(max(post, beam), brace);
      const plaster = A.mul(vnoise(vec2(u, y).mul(6)).mul(0.08).add(0.96));
      return mix(plaster, Bc, timber.clamp(0, 1));
    }
    case 1: {
      const row = floor(y.div(0.32));
      const off = row.mod(2).mul(0.3);
      const bx = fract(u.add(off).div(0.6));
      const by = fract(y.div(0.32));
      const mortar = step(bx, 0.04).max(step(by, 0.07));
      const id = hash12(vec2(floor(u.add(off).div(0.6)), row));
      return mix(A.mul(id.mul(0.18).add(0.9)), Bc.mul(0.7), mortar);
    }
    case 2: {
      const band = step(y, 0.55);
      const top = step(y.sub(0.55), 0.04).mul(step(0.55, y));
      return mix(mix(A.mul(fbm(vec2(u, y).mul(3)).mul(0.08).add(0.95)), Bc, band), Bc.mul(0.8), top);
    }
    case 3: {
      const fy = fract(y.div(0.28));
      const round = fy.sub(0.5).mul(2).abs();
      const id = hash12(vec2(floor(y.div(0.28)), 3));
      const log = A.mul(float(1).sub(round.mul(round).mul(0.45))).mul(id.mul(0.15).add(0.92));
      return mix(log, Bc.mul(0.6), step(0.94, round));
    }
    case 4: {
      const fx = fract(u.div(0.16));
      const r = fx.sub(0.5).mul(2).abs();
      const node = step(abs(fract(y.div(0.62).add(hash12(vec2(floor(u.div(0.16)), 1)))).sub(0.5)), 0.03);
      const stalk = A.mul(float(1).sub(r.mul(r).mul(0.5)));
      return mix(stalk, Bc, node.max(step(0.92, r)));
    }
    case 5: {
      // ashlar above a panelled dado
      const dado = step(y, 0.95);
      const rail = falloff(abs(y.sub(0.95)), 0.03, 0.05);
      const row = floor(y.div(0.5));
      const off = row.mod(2).mul(0.45);
      const bx = fract(u.add(off).div(0.9));
      const by = fract(y.div(0.5));
      const mortar = step(bx, 0.02).max(step(by, 0.035));
      const id = hash12(vec2(floor(u.add(off).div(0.9)), row));
      const ashlar = mix(A.mul(id.mul(0.1).add(0.95)), A.mul(0.78), mortar);
      const panel = fract(u.div(1.0));
      const panelEdge = step(panel, 0.04).max(step(0.96, panel)).max(step(y, 0.08));
      const lower = mix(Bc.mul(0.85), Bc.mul(0.62), panelEdge);
      return mix(mix(ashlar, lower, dado), Bc.mul(0.55), rail);
    }
    default: {
      // Frame: flat white, faint layout grid, a blue frame edge at the top
      const grid = step(fract(u.div(0.5)), 0.012).max(step(fract(y.div(0.5)), 0.012));
      const edge = step(WALL_H - 0.16, y);
      return mix(mix(A, A.mul(0.9), grid), Bc, edge);
    }
  }
}

export function createWallMaterial(styleId = HOUSE_STYLES.fancy.pattern, styleColors = HOUSE_STYLES.fancy.wall) {
  // vertex colours are read by hand below (vertexColors: true would multiply them in twice)
  const m = new THREE.MeshLambertNodeMaterial();
  const aSeg = attribute<'vec4'>('aSeg', 'vec4');
  const aInfo = attribute<'vec2'>('aInfo', 'vec2');
  const aClip = attribute<'vec3'>('aClip', 'vec3');
  const AU = archUniforms;

  // blueprint rise, staggered outward from the house centre
  const dist = aSeg.xy.sub(AU.centre).length();
  const rise = houseUniforms.built.mul(1.7).sub(dist.div(26).mul(0.7)).clamp(0, 1);
  const riseE = rise.mul(rise).mul(float(3).sub(rise.mul(2)));
  // The blueprint is a shallow relief, not a zero-thickness stack of every
  // exposed sill/lintel/cornice face at y=.03. Keep its depth ordering intact.
  const riseScale = max(riseE, 0.01);

  // cutaway: is the player on the other side of this wall from the camera, and close?
  const n = aSeg.zw;
  const m0 = aSeg.xy;
  const camSide = dot(n, AU.camera.xz.sub(m0));
  const plySide = dot(n, AU.player.sub(m0));
  const along = abs(dot(vec2(n.y.negate(), n.x), AU.player.sub(m0)));
  const between = step(camSide.mul(plySide), 0).mul(step(n.length(), 1.5)).mul(step(0.5, n.length()));
  const near = falloff(abs(plySide), AU.cutRadius.sub(1.5), AU.cutRadius).mul(falloff(along, 5.5, 6.5));
  const autoCut = between.mul(near);
  const cut = varying(
    select(AU.cutMode.lessThan(0.5), float(0), select(AU.cutMode.greaterThan(1.5), float(1), autoCut))
      .max(houseUniforms.buildMode.mul(0.6))
      .mul(aInfo.y)
  );
  // Move a single clipping plane through the union. Mixing each source
  // vertex with min(y, cutHeight) crushed many box faces onto the same plane.
  const sectionHeight = mix(float(WALL_H + 0.08), AU.cutHeight, cut);
  m.positionNode = Fn(() => {
    const p = positionLocal.toVar();
    const y = p.y;
    // flat walls on the blueprint sit a hair above the floor, as ink lines
    const yy = min(y, sectionHeight).mul(select(y.greaterThan(0), riseScale, float(1))).add(select(y.greaterThan(0), riseE.oneMinus().mul(0.03), float(0)));
    return vec3(p.x, yy, p.z);
  })();

  const t = vec2(n.y.negate(), n.x);
  const u = dot(positionWorld.xz, t);
  const A = hex3(styleColors[0]);
  const Bc = hex3(styleColors[1]);
  const pattern = wallPattern(styleId, u, positionWorld.y, A, Bc);
  const vc = attribute<'vec3'>('color', 'vec3');
  // blueprint ink until the wall has risen
  m.colorNode = mix(vec3(0.85, 0.92, 1.0), mix(vc, pattern, aInfo.x), riseE.smoothstep(0.0, 0.35));
  // Half-open slabs give the cap to exactly one level at every boundary.
  // Fully clipped slabs disappear, including downward-facing lintel bottoms.
  m.maskNode = aInfo.y.lessThan(0.5).or(
    sectionHeight.greaterThan(aClip.x).and(aClip.z.lessThan(0.5).or(sectionHeight.lessThanEqual(aClip.y)))
  );

  // Section cap on cut walls: dark poché + white hatch, like a plan drawing.
  m.outputNode = Fn(() => {
    const top = step(0.5, normalLocal.y).mul(step(0.01, cut)).mul(step(sectionHeight, aClip.y));
    const hatch = step(fract(positionWorld.x.add(positionWorld.z).mul(6)), 0.22);
    const poche = mix(vec3(0.012, 0.011, 0.016), vec3(0.55, 0.6, 0.75), hatch.mul(0.6));
    return vec4(mix(output.rgb, poche, top), output.a);
  })();
  return m;
}

// ── floors ───────────────────────────────────────────────────────────────────
export function buildFloors(L: HouseLayout) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const kind: number[] = [];
  const room: number[] = [];
  const walls: number[] = [];
  for (const r of L.rooms) {
    const x0 = L.ox + r.i0;
    const z0 = L.oz + r.j0;
    const x1 = x0 + ROOM;
    const z1 = z0 + ROOM;
    const wf = (['n', 'e', 's', 'w'] as const).map((s) => {
      if (r.def.outdoor) return 0;
      const side = L.sides.find(
        (sd) =>
          (sd.room === r || sd.other === r) &&
          sd.kind !== 'hedge' &&
          ((s === 'n' && sd.a[1] === r.j0 && sd.b[1] === r.j0) ||
            (s === 's' && sd.a[1] === r.j0 + ROOM && sd.b[1] === r.j0 + ROOM) ||
            (s === 'w' && sd.a[0] === r.i0 && sd.b[0] === r.i0) ||
            (s === 'e' && sd.a[0] === r.i0 + ROOM && sd.b[0] === r.i0 + ROOM))
      );
      return side ? 1 : 0;
    });
    const quad = [
      [x0, z0],
      [x0, z1],
      [x1, z0],
      [x1, z0],
      [x0, z1],
      [x1, z1],
    ];
    for (const [x, z] of quad) {
      pos.push(x, 0, z);
      nrm.push(0, 1, 0);
      kind.push(FLOOR_CODE[r.def.floor]);
      room.push(x0, z0, r.rot, r.index);
      walls.push(...wf);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aRoom', new THREE.Float32BufferAttribute(room, 4));
  g.setAttribute('aWalls', new THREE.Float32BufferAttribute(walls, 4));
  g.computeBoundingSphere();
  return g;
}

/** Hover / destination / marker / path state for house tiles. */
export function createHouseTileState(L: HouseLayout) {
  const data = new Uint8Array(L.width * L.height * 4);
  const tex = new THREE.DataTexture(data, L.width, L.height, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return {
    texture: tex,
    set(i: number, j: number, channel: number, on: boolean) {
      if (i < 0 || j < 0 || i >= L.width || j >= L.height) return;
      const k = (j * L.width + i) * 4 + channel;
      const v = on ? 255 : 0;
      if (data[k] !== v) {
        data[k] = v;
        tex.needsUpdate = true;
      }
    },
    clear(channel: number) {
      let dirty = false;
      for (let k = channel; k < data.length; k += 4)
        if (data[k]) {
          data[k] = 0;
          dirty = true;
        }
      if (dirty) tex.needsUpdate = true;
    },
  };
}
export type HouseTileState = ReturnType<typeof createHouseTileState>;

const floorColour = Fn(([kind, lp, wp]: [F, V2, V2]) => {
  const col = vec3(0).toVar();
  // planks (narrow, staggered), boards (wide)
  const plank = (w: number, a: string, b: string) => {
    const row = floor(lp.y.div(w));
    const off = hash12(vec2(row, 7)).mul(3);
    const seam = fract(lp.x.add(off).div(2.4));
    const id = hash12(vec2(row, floor(lp.x.add(off).div(2.4))));
    const grain = vnoise(vec2(lp.x.mul(1.5), lp.y.mul(28))).mul(0.18);
    const base = mix(hex3(a), hex3(b), id).mul(grain.add(0.9));
    const gap = step(fract(lp.y.div(w)), 0.06).max(step(seam, 0.012));
    return mix(base, base.mul(0.45), gap);
  };
  const p0 = plank(0.25, '#8a5a34', '#a06c40');
  const p1 = plank(0.5, '#5e3f27', '#74503a');
  // flagstones
  const fs = Fn(() => {
    const cell = floor(lp.mul(vec2(1 / 1.1, 1 / 0.9)).add(vec2(floor(lp.y.div(0.9)).mod(2).mul(0.5), 0)));
    const f = fract(lp.mul(vec2(1 / 1.1, 1 / 0.9)).add(vec2(floor(lp.y.div(0.9)).mod(2).mul(0.5), 0)));
    const edge = step(f.x, 0.05).max(step(f.y, 0.06));
    const id = hash12(cell);
    const stone = vec3(0.32, 0.31, 0.29).mul(id.mul(0.35).add(0.8)).mul(fbm(wp.mul(2)).mul(0.25).add(0.88));
    return mix(stone, vec3(0.1, 0.1, 0.1), edge);
  })();
  // marble checker with veins
  const checker = floor(lp.x).add(floor(lp.y)).mod(2);
  const vein = abs(sin(lp.x.add(lp.y.mul(0.6)).mul(3).add(fbm(lp.mul(1.4)).mul(5)))).pow(12);
  const marble = mix(vec3(0.82, 0.8, 0.76), vec3(0.08, 0.08, 0.09), checker).mul(float(1).sub(vein.mul(0.25)));
  // carpet with a border
  const e = min(min(lp.x, lp.y), min(float(ROOM).sub(lp.x), float(ROOM).sub(lp.y)));
  const border = step(e, 0.7).mul(step(0.18, e));
  const pattern = step(0.5, fract(lp.x.add(lp.y).mul(1.5))).mul(0.06);
  const carpet = mix(vec3(0.14, 0.03, 0.06).add(pattern), vec3(0.55, 0.36, 0.08), border.mul(step(abs(fract(e.mul(4)).sub(0.5)), 0.3)));
  // garden courtyard: dark lawn soil (the blades are geometry), stepping
  // stones in gravel along the paths, and flower-bed earth along the walls
  const lawn = vec3(0.075, 0.16, 0.035).mul(fbm(wp.mul(1.3)).mul(0.45).add(0.72)).mul(vnoise(wp.mul(8)).mul(0.3).add(0.82));
  const sg = lp.div(0.6);
  const cell = floor(sg);
  const jit = hash22(cell).sub(0.5);
  const sid = hash12(cell.add(17));
  const sq = abs(fract(sg).sub(0.5).sub(jit.mul(0.16))).sub(float(0.3).add(sid.mul(0.07)).sub(0.12));
  const stoneD = max(sq, vec2(0)).length().add(min(max(sq.x, sq.y), 0)).sub(0.12);
  const keep = gardenPathMask(cell.add(0.5).mul(0.6)).mul(step(0.12, hash12(cell.add(3))));
  const stoneCol = mix(hex3('#8f877d'), hex3('#d3cbbd'), sid).mul(vnoise(wp.mul(6)).mul(0.2).add(0.88));
  const gravel = hex3('#6f6555').mul(vnoise(wp.mul(30)).mul(0.35).add(0.75));
  const stone = step(stoneD, 0).mul(keep);
  const path = mix(gravel, mix(stoneCol, stoneCol.mul(0.55), stoneD.smoothstep(-0.05, 0)), stone);
  const soil = hex3('#3a2617').mul(vnoise(wp.mul(14)).mul(0.4).add(0.7));
  const garden = mix(mix(lawn, path, gardenPathMask(lp)), soil, gardenBedMask(lp)).toVar();
  // build mode: the path is a vector stroke, centre line and anchor points showing
  const centre = gardenPathCentre(lp);
  const box = (x: number, y: number) => {
    const d = abs(lp.sub(vec2(x, y)));
    return max(d.x, d.y);
  };
  const a = min(
    min(min(box(4, 0.3), box(4, 7.7)), min(box(0.3, 4), box(7.7, 4))),
    min(min(box(4, 4 - RING_HALF), box(4, 4 + RING_HALF)), min(box(4 - RING_HALF, 4), box(4 + RING_HALF, 4)))
  );
  const stroke = step(centre, 0.035).mul(gardenPathMask(lp));
  const bm = houseUniforms.buildMode;
  garden.assign(mix(garden, hex3('#3b82f6'), stroke.mul(bm)));
  garden.assign(mix(garden, hex3('#3b82f6'), step(a, 0.13).mul(bm)));
  garden.assign(mix(garden, vec3(0.98), step(a, 0.09).mul(bm)));

  col.assign(p0);
  col.assign(select(kind.greaterThan(0.5), p1, col));
  col.assign(select(kind.greaterThan(1.5), fs, col));
  col.assign(select(kind.greaterThan(2.5), marble, col));
  col.assign(select(kind.greaterThan(3.5), carpet, col));
  col.assign(select(kind.greaterThan(4.5), garden, col));
  return col;
});

export function createFloorMaterial(L: HouseLayout, tiles: HouseTileState) {
  const m = new THREE.MeshLambertNodeMaterial();
  const aKind = attribute<'float'>('aKind', 'float');
  const aRoom = attribute<'vec4'>('aRoom', 'vec4');
  const aWalls = attribute<'vec4'>('aWalls', 'vec4');
  const wp = positionWorld.xz;
  // room-local coords, rotated with the room so planks run the right way
  const rel = wp.sub(aRoom.xy);
  const r = aRoom.z;
  const lp = select(
    r.lessThan(0.5),
    rel,
    select(r.lessThan(1.5), vec2(rel.y, float(ROOM).sub(rel.x)), select(r.lessThan(2.5), vec2(float(ROOM).sub(rel.x), float(ROOM).sub(rel.y)), vec2(float(ROOM).sub(rel.y), rel.x)))
  );
  const base = floorColour(aKind, lp, wp);
  // AO along walls (world-space distances to each wall of this room)
  const ao = float(1)
    .mul(mix(float(1), rel.y.smoothstep(0.0, 0.9).mul(0.55).add(0.45), aWalls.x))
    .mul(mix(float(1), float(ROOM).sub(rel.x).smoothstep(0.0, 0.9).mul(0.55).add(0.45), aWalls.y))
    .mul(mix(float(1), float(ROOM).sub(rel.y).smoothstep(0.0, 0.9).mul(0.55).add(0.45), aWalls.z))
    .mul(mix(float(1), rel.x.smoothstep(0.0, 0.9).mul(0.55).add(0.45), aWalls.w));

  // blueprint: deep blue, a fine grid, white room outlines (the intro's artboard)
  const bpGrid = step(fract(wp.x.mul(2)), 0.03).max(step(fract(wp.y.mul(2)), 0.03)).mul(0.35);
  const tileLine = step(fract(wp.x), 0.04).max(step(fract(wp.y), 0.04)).mul(0.5);
  const roomEdge = step(min(min(rel.x, rel.y), min(float(ROOM).sub(rel.x), float(ROOM).sub(rel.y))), 0.07);
  const blueprint = mix(mix(vec3(0.02, 0.06, 0.2), vec3(0.18, 0.35, 0.8), max(bpGrid, tileLine)), vec3(0.95), roomEdge);
  // the print wipes in with the build, dithered
  const dist = wp.sub(archUniforms.centre).length().div(26);
  const th = bayer4(floor(wp.mul(8)));
  const built = step(dist.mul(0.7).add(th.mul(0.25)), houseUniforms.built.mul(1.4));
  m.colorNode = mix(blueprint, base.mul(ao), built);

  const cell = fract(wp.sub(vec2(L.ox, L.oz)));
  const tileUv = floor(wp.sub(vec2(L.ox, L.oz))).add(0.5).div(vec2(L.width, L.height));
  m.outputNode = Fn(() => {
    const st = texture(tiles.texture, tileUv);
    const lit = mix(blueprint, output.rgb, built);
    return vec4(tileOverlay(lit, st, cell, globalUniforms.uAccent), output.a);
  })();
  return m;
}

// ── window glass ─────────────────────────────────────────────────────────────
/** One merged pane per window (skipping windows that a piece fills, like stained glass). */
export function buildWindowGlass(L: HouseLayout, skip: (w: HouseLayout['windows'][number]) => boolean) {
  const parts: number[] = [];
  const seg: number[] = [];
  for (const w of L.windows) {
    if (skip(w)) continue;
    const yaw = (w.facing * Math.PI) / 2;
    const tx = Math.cos(yaw);
    const tz = -Math.sin(yaw);
    const hw = w.width / 2;
    const quad = [
      [-hw, 0.85],
      [hw, 0.85],
      [-hw, 2.0],
      [hw, 0.85],
      [hw, 2.0],
      [-hw, 2.0],
    ];
    for (const [u, y] of quad) {
      parts.push(w.x + tx * u, y, w.z + tz * u);
      seg.push(L.ox + (w.side.a[0] + w.side.b[0]) / 2, L.oz + (w.side.a[1] + w.side.b[1]) / 2, w.side.n[0], w.side.n[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 4));
  g.computeVertexNormals();
  return g;
}

/** Glass that cuts away with its wall (same test as the wall shader). */
export function createGlassMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const aSeg = attribute<'vec4'>('aSeg', 'vec4');
  const AU = archUniforms;
  const n = aSeg.zw;
  const m0 = aSeg.xy;
  const camSide = dot(n, AU.camera.xz.sub(m0));
  const plySide = dot(n, AU.player.sub(m0));
  const along = abs(dot(vec2(n.y.negate(), n.x), AU.player.sub(m0)));
  const autoCut = step(camSide.mul(plySide), 0).mul(falloff(abs(plySide), AU.cutRadius.sub(1.5), AU.cutRadius)).mul(falloff(along, 5.5, 6.5));
  const cut = select(AU.cutMode.lessThan(0.5), float(0), select(AU.cutMode.greaterThan(1.5), float(1), autoCut)).max(houseUniforms.buildMode.mul(0.6));
  const sheen = fract(positionWorld.x.add(positionWorld.z).add(positionWorld.y.mul(0.6)).mul(0.9)).step(0.12);
  m.colorNode = mix(vec3(0.55, 0.72, 0.95), vec3(1), sheen.mul(0.6));
  m.opacityNode = float(0.22).add(sheen.mul(0.25)).mul(float(1).sub(cut)).mul(houseUniforms.built);
  return m;
}

// ── hotspot outlines on the blueprint ────────────────────────────────────────
/** Dashed footprints for every hotspot, like components dropped on a plan. Fades as the house builds. */
export function buildHotspotOutlines(L: HouseLayout) {
  const pos: number[] = [];
  const uvs: number[] = [];
  const t = 0.05;
  const quad = (x0: number, z0: number, x1: number, z1: number, len: number) => {
    const pts = [
      [x0, z0, 0],
      [x0, z1, 0],
      [x1, z0, len],
      [x1, z0, len],
      [x0, z1, 0],
      [x1, z1, len],
    ];
    for (const [x, z, u] of pts) {
      pos.push(x, 0.025, z);
      uvs.push(u, 0);
    }
  };
  for (const h of L.hotspots) {
    if (!h.furniture || !h.rect[2]) continue;
    const x0 = L.ox + h.rect[0] + 0.08;
    const z0 = L.oz + h.rect[1] + 0.08;
    const x1 = L.ox + h.rect[0] + h.rect[2] - 0.08;
    const z1 = L.oz + h.rect[1] + h.rect[3] - 0.08;
    quad(x0, z0, x1, z0 + t, x1 - x0);
    quad(x0, z1 - t, x1, z1, x1 - x0);
    // vertical edges: swap axes so u runs along z
    for (const x of [x0, x1 - t]) {
      const zs = [
        [x, z0, 0],
        [x + t, z0, 0],
        [x, z1, z1 - z0],
        [x, z1, z1 - z0],
        [x + t, z0, 0],
        [x + t, z1, z1 - z0],
      ];
      for (const [px, pz, u] of zs) {
        pos.push(px, 0.025, pz);
        uvs.push(u, 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const u = attribute<'vec2'>('uv', 'vec2').x;
  const dash = step(fract(u.mul(5).sub(globalUniforms.uTime.mul(0.4))), 0.55);
  m.colorNode = vec3(0.75, 0.88, 1.0);
  m.opacityNode = dash.mul(float(1).sub(houseUniforms.built.mul(2.2)).clamp(0, 1));
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 3;
  return mesh;
}

// ── contact shadow decals ────────────────────────────────────────────────────
export function buildShadowDecals(hotspots: PlacedHotspot[]) {
  const pos: number[] = [];
  const uvs: number[] = [];
  for (const h of hotspots) {
    if (!h.furniture || h.def.wall || h.def.walkable || h.rect[2] === 0) continue;
    const w = h.rect[2] * 0.98 + 0.25;
    const d = h.rect[3] * 0.98 + 0.25;
    const x0 = h.x - w / 2;
    const z0 = h.z - d / 2;
    const quad = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ];
    for (const [u, v] of quad) {
      pos.push(x0 + u * w, 0.012, z0 + v * d);
      uvs.push(u, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, color: '#000000' });
  const uvn = attribute<'vec2'>('uv', 'vec2');
  const q = abs(uvn.sub(0.5)).mul(2);
  const box = max(q.x, q.y);
  m.opacityNode = falloff(box, 0.55, 1.0).mul(0.42).mul(houseUniforms.built);
  m.colorNode = vec3(0);
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 1;
  return mesh;
}

