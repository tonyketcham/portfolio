/**
 * Particles as instanced billboard sprites (WebGPU points are always 1px).
 *  - ParticlePool: CPU-simulated bursts (dust, hearts, confetti, steam, ...)
 *    drawn as design-tool handles, dots, hearts and plus-signs.
 *  - createAmbient: GPU-only drifting fireflies and spores.
 * Pure three.js, so the harness can render them.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  atan,
  float,
  fract,
  instancedBufferAttribute,
  max,
  sin,
  cos,
  step,
  uniform,
  uv,
  vec2,
  vec3,
  mix,
} from 'three/tsl';
import { globalUniforms } from '../scene/globals';
import type { F, V2 } from './common';

export const SHAPE = { square: 0, circle: 1, heart: 2, plus: 3, ring: 4, spark: 5 } as const;

export interface ParticleKind {
  shape: number;
  colors: string[];
  life: [number, number];
  size: [number, number];
  speed: number;
  up: number;
  gravity: number;
  drag: number;
  grow: number;
  /** emissive: ignores fog/lighting and blooms through the dark */
  glow?: boolean;
}

export const PARTICLE_KINDS: Record<string, ParticleKind> = {
  dust: { shape: SHAPE.circle, colors: ['#a8a29e', '#d6d3d1', '#e7e5e4'], life: [0.5, 1.0], size: [0.14, 0.26], speed: 1.8, up: 0.9, gravity: -1.6, drag: 3, grow: 0.9 },
  sawdust: { shape: SHAPE.square, colors: ['#d6b98c', '#b08a5a', '#f3e2c0'], life: [0.6, 1.1], size: [0.05, 0.09], speed: 2.4, up: 2.2, gravity: -6, drag: 1.6, grow: 0 },
  hearts: { shape: SHAPE.heart, colors: ['#f472b6', '#fb7185', '#f9a8d4'], life: [0.9, 1.4], size: [0.22, 0.3], speed: 0.6, up: 1.6, gravity: 0.6, drag: 1.5, grow: 0 },
  confetti: { shape: SHAPE.square, colors: ['#3b82f6', '#f472b6', '#facc15', '#22c55e', '#a855f7', '#fb923c'], life: [1.2, 2], size: [0.12, 0.2], speed: 4, up: 5, gravity: -7, drag: 1.2, grow: 0 },
  steam: { shape: SHAPE.circle, colors: ['#e4e4e7', '#fafafa'], life: [1.2, 2], size: [0.1, 0.16], speed: 0.15, up: 0.6, gravity: 0.25, drag: 0.5, grow: 1.4 },
  spores: { shape: SHAPE.plus, colors: ['#fde68a', '#f9a8d4', '#fca5a5'], life: [1.8, 3], size: [0.08, 0.14], speed: 0.4, up: 0.5, gravity: 0.15, drag: 0.4, grow: 0, glow: true },
  sparkle: { shape: SHAPE.square, colors: ['#3b82f6', '#60a5fa'], life: [0.5, 0.9], size: [0.12, 0.18], speed: 2.6, up: 1.2, gravity: -1, drag: 2.5, grow: -0.5, glow: true },
  embers: { shape: SHAPE.spark, colors: ['#fb923c', '#facc15', '#f97316'], life: [0.6, 1.3], size: [0.05, 0.1], speed: 0.4, up: 1.4, gravity: 0.8, drag: 0.8, grow: -0.6, glow: true },
  magic: { shape: SHAPE.ring, colors: ['#c084fc', '#e879f9', '#a5f3fc'], life: [0.7, 1.2], size: [0.16, 0.3], speed: 1.2, up: 0.8, gravity: 0.3, drag: 1.6, grow: 0.8, glow: true },
};

/** Shape mask for a sprite uv in [0, 1]². */
const shapeMask = Fn(([shape, p0]: [F, V2]) => {
  const p = p0.sub(0.5);
  const sq = step(max(abs(p.x), abs(p.y)), 0.5);
  const circle = step(p.length(), 0.5);
  // heart (iq)
  const hp = vec2(p.x, p.y.add(0.12)).mul(1.25);
  const a = atan(hp.x, hp.y).div(Math.PI);
  const h = abs(a);
  const d = h.mul(13).sub(h.mul(h).mul(22)).add(h.mul(h).mul(h).mul(10)).div(h.mul(-5).add(6));
  const heart = step(hp.length(), d.mul(0.5));
  const plus = max(step(abs(p.x), 0.1).mul(step(abs(p.y), 0.45)), step(abs(p.y), 0.1).mul(step(abs(p.x), 0.45)));
  const ring = step(p.length(), 0.5).mul(step(0.32, p.length()));
  const spark = step(abs(p.x).add(abs(p.y)), 0.5);
  return shape
    .lessThan(0.5)
    .select(sq, shape.lessThan(1.5).select(circle, shape.lessThan(2.5).select(heart, shape.lessThan(3.5).select(plus, shape.lessThan(4.5).select(ring, spark)))));
});

export class ParticlePool {
  readonly sprite: THREE.Sprite;
  private pos: THREE.InstancedBufferAttribute;
  private data: THREE.InstancedBufferAttribute; // size, alpha, shape, glow
  private col: THREE.InstancedBufferAttribute;
  private vel: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private base: Float32Array;
  private grow: Float32Array;
  private gravity: Float32Array;
  private drag: Float32Array;
  private cursor = 0;
  private live = 0;

  constructor(readonly size = 700) {
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(size * 3), 3);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(size * 4), 4);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(size * 3), 3);
    for (const a of [this.pos, this.data, this.col]) a.setUsage(THREE.DynamicDrawUsage);
    this.vel = new Float32Array(size * 3);
    this.life = new Float32Array(size);
    this.max = new Float32Array(size);
    this.base = new Float32Array(size);
    this.grow = new Float32Array(size);
    this.gravity = new Float32Array(size);
    this.drag = new Float32Array(size);

    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
    const p = instancedBufferAttribute<'vec3'>(this.pos, 'vec3');
    const d = instancedBufferAttribute<'vec4'>(this.data, 'vec4');
    const c = instancedBufferAttribute<'vec3'>(this.col, 'vec3');
    m.positionNode = p;
    m.scaleNode = d.x;
    const mask = shapeMask(d.z, uv());
    // design-tool handle squares get a white core
    const core = d.z.lessThan(0.5).select(step(max(abs(uv().x.sub(0.5)), abs(uv().y.sub(0.5))), 0.28), float(0));
    m.colorNode = mix(vec3(c), vec3(1), core).mul(d.w.mul(1.5).add(1));
    m.opacityNode = d.y.mul(mask);
    m.alphaTest = 0.01;
    m.fog = true;
    this.sprite = new THREE.Sprite(m);
    this.sprite.count = size;
    this.sprite.frustumCulled = false;
    this.sprite.renderOrder = 5;
  }

  emit(kindName: string, x: number, y: number, z: number, count = 12, spread = 0.2) {
    const kind = PARTICLE_KINDS[kindName];
    if (!kind) return;
    const pos = this.pos.array as Float32Array;
    const data = this.data.array as Float32Array;
    const col = this.col.array as Float32Array;
    const c = new THREE.Color();
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.size;
      pos[i * 3] = x + (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2;
      const sp = kind.speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = kind.up * (0.6 + Math.random() * 0.8);
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.max[i] = this.life[i] = kind.life[0] + Math.random() * (kind.life[1] - kind.life[0]);
      this.base[i] = kind.size[0] + Math.random() * (kind.size[1] - kind.size[0]);
      this.grow[i] = kind.grow;
      this.gravity[i] = kind.gravity;
      this.drag[i] = kind.drag;
      data[i * 4] = this.base[i];
      data[i * 4 + 1] = 1;
      data[i * 4 + 2] = kind.shape;
      data[i * 4 + 3] = kind.glow ? 1 : 0;
      c.set(kind.colors[Math.floor(Math.random() * kind.colors.length)]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    this.live = this.size;
    this.col.needsUpdate = true;
    this.data.needsUpdate = true;
    this.pos.needsUpdate = true;
  }

  update(rawDt: number) {
    if (this.live <= 0) return;
    const dt = Math.min(rawDt, 0.05);
    const pos = this.pos.array as Float32Array;
    const data = this.data.array as Float32Array;
    let any = 0;
    for (let i = 0; i < this.size; i++) {
      if (this.life[i] <= 0) {
        if (data[i * 4 + 1] !== 0) data[i * 4 + 1] = 0;
        continue;
      }
      any++;
      this.life[i] -= dt;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 2] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k + this.gravity[i] * dt;
      pos[i * 3] += this.vel[i * 3] * dt;
      pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const u = 1 - this.life[i] / this.max[i];
      data[i * 4] = Math.max(0.01, this.base[i] * (1 + this.grow[i] * u));
      data[i * 4 + 1] = this.life[i] > 0 ? Math.min(1, (1 - u) * 2.2) : 0;
    }
    // one more upload after the last particle dies so it disappears
    this.live = any > 0 ? this.size : this.live - 1;
    this.pos.needsUpdate = true;
    this.data.needsUpdate = true;
  }
}

export const ambientUniforms = { fireflies: uniform(1), spores: uniform(1) };

/** GPU-only fireflies (kind 0) and rising spores (kind 1). */
export function createAmbient(points: { x: number; y: number; z: number; phase: number; kind: number }[]) {
  const n = Math.max(1, points.length);
  const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const b = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  points.forEach((p, i) => {
    a.setXYZW(i, p.x, p.y, p.z, p.phase);
    b.setX(i, p.kind);
  });
  const A = instancedBufferAttribute<'vec4'>(a, 'vec4');
  const kind = instancedBufferAttribute<'float'>(b, 'float');
  const U = globalUniforms;
  const t = U.uTime.mul(fract(A.w.mul(7.1)).mul(0.5).add(0.4)).add(A.w.mul(6.28));
  const rise = fract(U.uTime.mul(0.05).add(A.w));
  const firefly = kind.lessThan(0.5);
  const offset = firefly.select(
    vec3(sin(t).mul(0.8), sin(t.mul(1.7)).mul(0.35), cos(t.mul(0.8)).mul(0.8)),
    vec3(sin(t).mul(0.5), rise.mul(4), cos(t).mul(0.5))
  );
  const blink = sin(U.uTime.mul(3).add(A.w.mul(40))).mul(0.5).add(0.5);
  const alpha = firefly.select(
    U.uNight.add(0.15).mul(blink).mul(ambientUniforms.fireflies),
    sin(rise.mul(Math.PI)).mul(0.8).mul(ambientUniforms.spores)
  );
  const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.positionNode = A.xyz.add(offset);
  m.scaleNode = firefly.select(float(0.1), float(0.07));
  const pu = uv().sub(0.5);
  const inner = step(max(abs(pu.x), abs(pu.y)), 0.25);
  m.colorNode = firefly.select(mix(vec3(0.9, 0.7, 0.1), vec3(1), inner), vec3(0.96, 0.45, 0.7)).mul(1.6);
  m.opacityNode = alpha.clamp(0, 1).mul(firefly.select(float(1), step(pu.length(), 0.5)));
  m.fog = false;
  const sprite = new THREE.Sprite(m);
  sprite.count = points.length;
  sprite.frustumCulled = false;
  sprite.renderOrder = 4;
  return sprite;
}

