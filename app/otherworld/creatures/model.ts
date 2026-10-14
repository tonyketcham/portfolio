/**
 * A creature's body, grown from its spec: primitives for a body, googly eyes,
 * limbs on pivots, a hat of some kind. No skeleton; every part is a group the
 * animator swings, squashes and blinks. Colours and wobble live in uniforms,
 * so the lab's sliders only rebuild meshes when the *shape* changes.
 */
import * as THREE from 'three/webgpu';
import { damp, mulberry32 } from '../lib/random';
import { accentMaterial, creatureUniforms, glowMaterial, skinMaterial, writeCreatureColors, type CreatureUniforms } from '../shaders/creatures';
import { shapeKey, type CreatureSpec, type Gait } from './spec';

export interface RigFrame {
  dt: number;
  time: number;
  /** 0 standing … 1 full gait. */
  moving: number;
  talking: boolean;
  /** World point to look at. */
  look: THREE.Vector3 | null;
}

const tmp = new THREE.Vector3();

interface Parts {
  body: THREE.Group;
  legs: { pivot: THREE.Group; phase: number; side: number }[];
  arms: { pivot: THREE.Group; side: number; rest: number }[];
  eyes: THREE.Group[];
  stalks: THREE.Group[];
  mouth: THREE.Group | null;
  topper: THREE.Group | null;
  visorDot: THREE.Mesh | null;
  topperKind: CreatureSpec['topper'];
}

export class CreatureRig {
  /** Positioned and turned by the owner. */
  readonly root = new THREE.Group();
  /** Overall size and hover; parts hang off this. */
  private readonly scaler = new THREE.Group();
  readonly u: CreatureUniforms = creatureUniforms();
  private readonly accent: THREE.Material;
  private readonly glow: THREE.Material;
  private readonly white = new THREE.MeshBasicNodeMaterial({ color: '#fafafa' });
  private readonly black = new THREE.MeshBasicNodeMaterial({ color: '#0a0a0c' });
  private readonly hidden = new THREE.MeshBasicNodeMaterial({ visible: false });
  private skin: THREE.Material | null = null;
  private skinId: CreatureSpec['skin'] | null = null;
  private geometries: THREE.BufferGeometry[] = [];
  private parts: Parts | null = null;
  private key = '';
  private spec!: CreatureSpec;
  /** Unscaled body size. */
  private H = 1;
  private W = 0.6;
  private legH = 0;
  private topExtra = 0;
  private phase = 0;
  private blink = 3;
  private poke = 0;
  private pokeT = 0;
  private hover = 0;

  constructor(spec: CreatureSpec) {
    this.accent = accentMaterial(this.u);
    this.glow = glowMaterial(this.u);
    this.root.add(this.scaler);
    this.setSpec(spec);
  }

  /** World-space point just above its head, for speech. */
  headPoint(out: THREE.Vector3) {
    const s = this.scaleFor(this.spec);
    return out.set(0, (this.legH + this.H + this.topExtra) * s + this.hover + 0.25, 0).applyMatrix4(this.root.matrixWorld);
  }

  /** Total height in world units. */
  get height() {
    return (this.legH + this.H) * this.scaleFor(this.spec);
  }

  setSpec(spec: CreatureSpec) {
    this.spec = spec;
    writeCreatureColors(this.u, spec.colors);
    this.u.wobble.value = spec.wobble;
    this.u.seed.value = (spec.seed % 1000) / 37;
    if (spec.skin !== this.skinId) {
      this.skin?.dispose();
      this.skin = skinMaterial(spec.skin, this.u);
      this.skinId = spec.skin;
      this.key = '';
    }
    const key = shapeKey(spec);
    if (key !== this.key) {
      this.key = key;
      this.build(spec);
    }
    this.scaler.scale.setScalar(this.scaleFor(spec));
  }

  private scaleFor(spec: CreatureSpec) {
    return 0.6 + spec.size * 0.9;
  }

  /** Squash, flash and a squeak's worth of wobble. */
  pokeIt() {
    this.poke = 1;
    this.pokeT = 0;
  }

  private geo<T extends THREE.BufferGeometry>(g: T) {
    this.geometries.push(g);
    return g;
  }

  private mesh(g: THREE.BufferGeometry, m: THREE.Material) {
    return new THREE.Mesh(this.geo(g), m);
  }

  private clear() {
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    this.scaler.clear();
    this.parts = null;
  }

  /** Front-surface z of the body at height y (relative to its centre). */
  private frontAt(spec: CreatureSpec, y: number) {
    const { H, W } = this;
    const k = Math.min(1, Math.abs((2 * y) / H));
    switch (spec.body) {
      case 'box':
        return W * 0.4;
      case 'cone':
        return (W / 2) * Math.max(0.08, 0.5 - y / H);
      case 'gem':
        return (W / 2) * Math.max(0.1, 1 - k);
      case 'torus':
        return W * 0.16;
      case 'noodle':
        return W * 0.26;
      case 'bean': {
        const r = W / 2;
        const flat = H / 2 - r;
        if (Math.abs(y) <= flat) return r;
        const dy = Math.abs(y) - flat;
        return Math.sqrt(Math.max(0, r * r - dy * dy));
      }
      case 'totem': {
        // stacked balls: the one at this height
        const seg = 3;
        const h = H / seg;
        const local = ((y + H / 2) % h) - h / 2;
        const r = Math.min(W / 2, h * 0.6);
        return Math.sqrt(Math.max(0, r * r - local * local));
      }
      default:
        return (W / 2) * Math.sqrt(Math.max(0, 1 - k * k)) * (spec.body === 'ico' ? 0.9 : 1);
    }
  }

  private build(spec: CreatureSpec) {
    this.clear();
    const r = mulberry32(spec.seed);
    const H = (this.H = (spec.body === 'noodle' ? 1.35 : 1) * (0.55 + spec.height * 1.1));
    const W = (this.W = 0.45 + spec.girth * 0.75);
    const legs = spec.gait === 'slither' ? 0 : spec.legs;
    const legH = (this.legH = legs ? 0.12 + spec.legLength * 0.55 : 0);
    const skin = this.skin!;

    // ── body ──
    const body = new THREE.Group();
    body.position.y = legH + H / 2;
    this.scaler.add(body);
    const bodyMesh = (g: THREE.BufferGeometry) => body.add(this.mesh(g, skin));
    switch (spec.body) {
      case 'blob':
        bodyMesh(new THREE.SphereGeometry(0.5, 18, 12).scale(W, H, W));
        break;
      case 'bean':
        bodyMesh(new THREE.CapsuleGeometry(W / 2, Math.max(0.01, H - W), 6, 14));
        break;
      case 'box':
        bodyMesh(new THREE.BoxGeometry(W, H, W * 0.8));
        break;
      case 'cone':
        bodyMesh(new THREE.ConeGeometry(W / 2, H, 14));
        break;
      case 'gem':
        bodyMesh(new THREE.OctahedronGeometry(0.5, 0).scale(W, H, W));
        break;
      case 'torus':
        bodyMesh(new THREE.TorusGeometry(W / 2 - W * 0.16, W * 0.16, 8, 20).scale(1, H / W, 1));
        break;
      case 'totem': {
        const h = H / 3;
        const rad = Math.min(W / 2, h * 0.6);
        for (let i = 0; i < 3; i++) bodyMesh(new THREE.SphereGeometry(rad * (1 - i * 0.1), 14, 10).translate(0, -H / 2 + h * (i + 0.5), 0));
        break;
      }
      case 'noodle':
        bodyMesh(new THREE.CapsuleGeometry(W * 0.26, Math.max(0.01, H - W * 0.52), 6, 12));
        break;
      case 'ico':
        bodyMesh(new THREE.IcosahedronGeometry(0.5, 0).scale(W * 0.95, H, W * 0.95));
        break;
    }

    // ── face ──
    const eyes: THREE.Group[] = [];
    const stalks: THREE.Group[] = [];
    let visorDot: THREE.Mesh | null = null;
    const n = spec.eyeStyle === 'visor' ? 0 : spec.eyes;
    const er = (0.05 + spec.eyeSize * 0.1) * (n > 3 ? 0.72 : 1) * Math.min(1.3, 0.7 + W * 0.5);
    const eyeY = spec.body === 'cone' ? -H * 0.05 : spec.body === 'torus' ? H * 0.32 : H * 0.17;
    const eyeball = (style: CreatureSpec['eyeStyle']) => {
      const g = new THREE.Group();
      g.add(this.mesh(new THREE.SphereGeometry(er, 12, 8), style === 'void' ? this.black : this.white));
      const pupil = this.mesh(new THREE.SphereGeometry(er * (style === 'void' ? 0.28 : 0.52), 10, 6), style === 'void' ? this.glow : this.black);
      pupil.position.z = er * (style === 'void' ? 0.85 : 0.72);
      g.add(pupil);
      return g;
    };
    if (spec.eyeStyle === 'visor') {
      const vy = eyeY;
      const vz = this.frontAt(spec, vy);
      const vw = Math.max(0.2, Math.min(W * 0.85, vz * 2.2 + 0.1));
      const vh = 0.07 + spec.eyeSize * 0.08;
      const visor = this.mesh(new THREE.BoxGeometry(vw, vh, 0.06), this.glow);
      visor.position.set(0, vy, vz);
      body.add(visor);
      visorDot = this.mesh(new THREE.BoxGeometry(vh * 0.8, vh * 0.8, 0.02), this.black);
      visorDot.position.set(0, vy, vz + 0.035);
      body.add(visorDot);
    } else if (spec.eyeStyle === 'stalk') {
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? 0 : -0.7 + (1.4 * i) / (n - 1);
        const stalk = new THREE.Group();
        stalk.position.set(Math.sin(a) * W * 0.18, H / 2 - 0.04, 0);
        stalk.rotation.z = -a * 0.8;
        const len = 0.18 + spec.eyeSize * 0.22 + r() * 0.08;
        const stem = this.mesh(new THREE.CylinderGeometry(0.018, 0.026, len, 6).translate(0, len / 2, 0), skin);
        stalk.add(stem);
        const eye = eyeball('round');
        eye.position.y = len + er * 0.6;
        stalk.add(eye);
        body.add(stalk);
        stalks.push(stalk);
        eyes.push(eye);
      }
    } else {
      const spread = Math.min(W * 0.72, n * er * 2.3);
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
        const y = eyeY + (n > 2 ? (r() - 0.5) * H * 0.22 : 0);
        const fz = this.frontAt(spec, y);
        const z = spec.body === 'box' ? fz : Math.sqrt(Math.max(0.0001, fz * fz - x * x * 0.8));
        const eye = eyeball(spec.eyeStyle);
        eye.position.set(x, y, z - er * 0.25);
        body.add(eye);
        eyes.push(eye);
      }
    }

    let mouth: THREE.Group | null = null;
    if (spec.mouth !== 'none') {
      mouth = new THREE.Group();
      const my = eyeY - Math.max(er * 1.6, H * 0.14);
      mouth.position.set(0, my, this.frontAt(spec, my) + 0.005);
      const mw = Math.min(W * 0.25, 0.16);
      switch (spec.mouth) {
        case 'smile':
          mouth.add(this.mesh(new THREE.TorusGeometry(mw, 0.016, 4, 12, Math.PI).rotateZ(Math.PI), this.black));
          break;
        case 'o':
          mouth.add(this.mesh(new THREE.TorusGeometry(mw * 0.45, 0.02, 6, 14), this.black));
          break;
        case 'zigzag':
          for (let i = 0; i < 4; i++) {
            const seg = this.mesh(new THREE.BoxGeometry(mw * 0.6, 0.018, 0.02), this.black);
            seg.position.x = -mw * 0.75 + i * mw * 0.5;
            seg.rotation.z = i % 2 ? -0.6 : 0.6;
            mouth.add(seg);
          }
          break;
        case 'beak':
          mouth.add(this.mesh(new THREE.ConeGeometry(0.06 + W * 0.04, 0.16 + W * 0.08, 4).rotateX(Math.PI / 2).translate(0, 0, 0.06), this.accent));
          break;
        case 'fangs': {
          mouth.add(this.mesh(new THREE.BoxGeometry(mw * 1.6, 0.035, 0.02), this.black));
          for (const s of [-1, 1]) {
            const fang = this.mesh(new THREE.ConeGeometry(0.022, 0.07, 4).rotateX(Math.PI), this.white);
            fang.position.set(s * mw * 0.45, -0.04, 0.01);
            mouth.add(fang);
          }
          break;
        }
      }
      body.add(mouth);
    }

    // ── arms ──
    const arms: Parts['arms'] = [];
    for (let i = 0; i < spec.arms; i++) {
      const side = i % 2 ? 1 : -1;
      const y = -H * 0.05 - Math.floor(i / 2) * H * 0.2;
      const sx = spec.body === 'box' ? W / 2 : Math.max(0.06, this.frontAt(spec, y) * (spec.body === 'torus' ? 3 : 1));
      const pivot = new THREE.Group();
      pivot.position.set(side * sx, y, 0);
      const len = 0.2 + H * 0.22;
      const rad = 0.022 + spec.girth * 0.014;
      pivot.add(this.mesh(new THREE.CylinderGeometry(rad, rad, len, 6).translate(0, -len / 2, 0), skin));
      const hand = this.mesh(new THREE.SphereGeometry(rad * 2, 8, 6).translate(0, -len, 0), this.accent);
      pivot.add(hand);
      const rest = side * (0.3 + r() * 0.25);
      pivot.rotation.z = rest;
      body.add(pivot);
      arms.push({ pivot, side, rest });
    }

    // ── legs ──
    const legParts: Parts['legs'] = [];
    for (let i = 0; i < legs; i++) {
      let x: number;
      let z: number;
      if (legs <= 2) {
        x = legs === 1 ? 0 : (i ? 1 : -1) * W * 0.22;
        z = 0;
      } else {
        const a = ((i + 0.5) / legs) * Math.PI * 2;
        x = Math.cos(a) * W * 0.36;
        z = Math.sin(a) * W * 0.3;
      }
      const tilt = legs > 4 ? 0.4 : legs > 2 ? 0.2 : 0;
      const pivot = new THREE.Group();
      const side = x === 0 ? 1 : Math.sign(x);
      pivot.position.set(x, legH, z);
      pivot.rotation.z = side * tilt;
      const L = legH / Math.cos(tilt);
      const rad = 0.03 + spec.girth * 0.02;
      pivot.add(this.mesh(new THREE.CylinderGeometry(rad, rad * 0.8, L, 6).translate(0, -L / 2, 0), skin));
      pivot.add(this.mesh(new THREE.BoxGeometry(rad * 2.6, rad * 1.4, rad * 3.4).translate(0, -L + rad * 0.5, rad * 0.8), this.accent));
      this.scaler.add(pivot);
      legParts.push({ pivot, phase: legs <= 2 ? i * Math.PI : i * 0.9 + (i % 2) * Math.PI, side });
    }

    // ── topper ──
    let topper: THREE.Group | null = null;
    this.topExtra = 0;
    if (spec.topper !== 'none') {
      topper = new THREE.Group();
      topper.position.y = H / 2 - 0.02;
      body.add(topper);
      switch (spec.topper) {
        case 'antennae':
          for (const s of [-1, 1]) {
            const a = new THREE.Group();
            a.position.x = s * W * 0.12;
            a.rotation.z = -s * 0.35;
            a.add(this.mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.3, 5).translate(0, 0.15, 0), this.black));
            a.add(this.mesh(new THREE.SphereGeometry(0.045, 8, 6).translate(0, 0.32, 0), this.glow));
            topper.add(a);
          }
          this.topExtra = 0.34;
          break;
        case 'horns':
          for (const s of [-1, 1]) {
            const h = this.mesh(new THREE.ConeGeometry(0.06, 0.24, 6).translate(0, 0.12, 0), this.accent);
            h.position.x = s * Math.max(0.08, W * 0.2);
            h.position.y = -0.04;
            h.rotation.z = -s * 0.5;
            topper.add(h);
          }
          this.topExtra = 0.2;
          break;
        case 'halo': {
          const halo = this.mesh(new THREE.TorusGeometry(Math.max(0.12, W * 0.28), 0.022, 6, 24).rotateX(Math.PI / 2), this.glow);
          halo.position.y = 0.2;
          topper.add(halo);
          this.topExtra = 0.24;
          break;
        }
        case 'cap': {
          const cr = Math.max(0.18, W * 0.46);
          topper.add(this.mesh(new THREE.SphereGeometry(cr, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), this.accent));
          for (let i = 0; i < 7; i++) {
            const a = r() * Math.PI * 2;
            const el = 0.3 + r() * 0.9;
            const dot = this.mesh(new THREE.IcosahedronGeometry(0.02 + r() * 0.018, 0), this.white);
            dot.position.set(Math.cos(a) * Math.cos(el) * cr, Math.sin(el) * cr * 0.6, Math.sin(a) * Math.cos(el) * cr);
            topper.add(dot);
          }
          this.topExtra = cr * 0.6;
          break;
        }
        case 'sprout': {
          topper.add(this.mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.2, 5).translate(0, 0.1, 0), this.accent));
          for (const s of [-1, 1]) {
            const leaf = this.mesh(new THREE.SphereGeometry(0.07, 8, 5).scale(1.3, 0.35, 0.7), this.accent);
            leaf.position.set(s * 0.07, 0.2, 0);
            leaf.rotation.z = s * 0.5;
            topper.add(leaf);
          }
          this.topExtra = 0.24;
          break;
        }
        case 'flame':
          for (let i = 0; i < 3; i++) {
            const f = this.mesh(new THREE.ConeGeometry(0.07 - i * 0.015, 0.26 - i * 0.05, 6).translate(0, 0.13, 0), this.glow);
            f.position.set((i - 1) * 0.06, 0, (i % 2) * 0.03);
            topper.add(f);
          }
          this.topExtra = 0.28;
          break;
        case 'cursor': {
          const shape = new THREE.Shape();
          [[0, 0], [0, -0.32], [0.08, -0.24], [0.14, -0.38], [0.19, -0.36], [0.13, -0.22], [0.24, -0.22]].forEach(([x, y], i) =>
            i ? shape.lineTo(x, y) : shape.moveTo(x, y)
          );
          shape.closePath();
          const g = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
          g.translate(-0.08, 0.2, -0.015).scale(1.2, 1.2, 1.2);
          const c = new THREE.Group();
          c.position.y = 0.42;
          c.add(this.mesh(g, this.black));
          const edge = this.mesh(g.clone().scale(1.12, 1.12, 0.5).translate(0.0, -0.005, -0.01), this.white);
          c.add(edge);
          topper.add(c);
          this.topExtra = 0.5;
          break;
        }
        case 'tophat': {
          const br = Math.max(0.16, W * 0.34);
          topper.add(this.mesh(new THREE.CylinderGeometry(br, br, 0.025, 16), this.black));
          topper.add(this.mesh(new THREE.CylinderGeometry(br * 0.62, br * 0.66, 0.3, 14).translate(0, 0.16, 0), this.black));
          topper.add(this.mesh(new THREE.CylinderGeometry(br * 0.67, br * 0.67, 0.05, 14).translate(0, 0.05, 0), this.accent));
          this.topExtra = 0.32;
          break;
        }
      }
    }

    // a generous invisible click box; the parts themselves are tiny targets
    const hit = this.mesh(new THREE.BoxGeometry(W * 1.25, legH + H + this.topExtra, W * 1.25), this.hidden);
    hit.position.y = (legH + H + this.topExtra) / 2;
    this.scaler.add(hit);
    // sorry, shadows: one per part would be a lot
    this.scaler.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o !== hit;
    });

    this.parts = { body, legs: legParts, arms, eyes, stalks, mouth, topper, visorDot, topperKind: spec.topper };
  }

  update(f: RigFrame, gait: Gait, stepRate: number) {
    const p = this.parts;
    if (!p) return;
    const { dt, time: t } = f;
    const spec = this.spec;
    const wob = spec.wobble;
    this.phase += dt * stepRate * Math.max(0.15, f.moving);
    const ph = this.phase;
    const mv = f.moving;

    // poke: decaying jelly squash + flash
    this.pokeT += dt;
    this.poke = Math.max(0, this.poke - dt * 1.6);
    this.u.poke.value = this.poke * this.poke;
    const jelly = Math.sin(this.pokeT * 26) * this.poke * 0.28;

    // breathing, with more jiggle the more wobble it has
    let sy = 1 + Math.sin(t * 2.2 + this.u.seed.value) * 0.025 * (1 + wob * 3) + jelly;
    let bob = 0;
    let roll = 0;
    let yaw = 0;
    let pitch = 0;
    let hover = 0;
    switch (gait) {
      case 'waddle':
        roll = Math.sin(ph) * 0.15 * mv;
        bob = Math.abs(Math.sin(ph)) * 0.05 * mv;
        break;
      case 'hop': {
        const hop = Math.abs(Math.sin(ph * 0.5));
        bob = hop * 0.32 * mv;
        sy += (hop < 0.25 ? -0.12 : 0.06) * mv;
        pitch = -Math.cos(ph * 0.5) * 0.12 * mv;
        break;
      }
      case 'float':
        hover = 0.28 + Math.sin(t * 2 + this.u.seed.value) * 0.07;
        pitch = 0.18 * mv;
        roll = Math.sin(t * 1.3) * 0.06;
        break;
      case 'scuttle':
        bob = Math.sin(ph * 2) * 0.015 * mv;
        roll = Math.sin(ph * 2) * 0.03 * mv;
        break;
      case 'slither':
        yaw = Math.sin(ph) * 0.35 * mv;
        sy += Math.sin(ph * 2) * 0.06 * mv;
        roll = Math.sin(ph + 1) * 0.08 * mv;
        break;
    }
    // secondary jiggle that lags behind the motion
    roll += Math.sin(t * 5.3 + 1.7) * 0.04 * wob * (0.3 + mv);
    this.hover = damp(this.hover, hover, 4, dt);
    this.scaler.position.y = this.hover;

    const b = p.body;
    b.position.y = this.legH + this.H / 2 + bob;
    b.rotation.set(pitch, yaw, roll);
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    b.scale.set(sxz, sy, sxz);

    // legs: alternate, ripple, or dangle when floating
    for (const leg of p.legs) {
      const swing = gait === 'float' ? Math.sin(t * 1.6 + leg.phase) * 0.18 : Math.sin(ph + leg.phase) * (gait === 'scuttle' ? 0.6 : 0.55) * mv;
      leg.pivot.rotation.x = swing;
    }

    // arms swing against the legs; the first one waves while it talks
    p.arms.forEach((arm, i) => {
      const swing = Math.sin(ph + (arm.side > 0 ? Math.PI : 0)) * 0.5 * mv + Math.sin(t * 1.7 + i) * 0.06 * (1 + wob * 2);
      const wave = f.talking && i === 0;
      arm.pivot.rotation.x = damp(arm.pivot.rotation.x, wave ? 0 : swing, 10, dt);
      const lift = wave ? arm.side * (2.5 + Math.sin(t * 12) * 0.35) : arm.rest;
      arm.pivot.rotation.z = damp(arm.pivot.rotation.z, lift, 8, dt);
    });

    // blink
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 1.5 + Math.random() * 4;
    const lid = this.blink < 0 ? 0.1 : 1;
    // eyes follow what it's looking at
    if (f.look) b.worldToLocal(tmp.copy(f.look));
    for (const eye of p.eyes) {
      eye.scale.y = damp(eye.scale.y, lid, 30, dt);
      let ty = 0;
      let tx = 0;
      if (f.look) {
        const dx = tmp.x - eye.position.x;
        const dy = tmp.y - eye.position.y;
        const dz = tmp.z - eye.position.z;
        ty = THREE.MathUtils.clamp(Math.atan2(dx, Math.max(0.05, dz)), -0.8, 0.8);
        tx = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.5);
      }
      eye.rotation.y = damp(eye.rotation.y, ty, 8, dt);
      eye.rotation.x = damp(eye.rotation.x, tx, 8, dt);
    }
    p.stalks.forEach((s, i) => (s.rotation.x = Math.sin(t * 2.1 + i * 1.3) * 0.15 * (1 + wob)));
    if (p.visorDot) p.visorDot.position.x = Math.sin(t * 2.4) * this.W * 0.3;

    if (p.mouth) {
      const open = f.talking ? 1 + Math.abs(Math.sin(t * 17)) * 1.4 : 1;
      p.mouth.scale.y = damp(p.mouth.scale.y, open, 25, dt);
    }

    if (p.topper) {
      switch (p.topperKind) {
        case 'antennae':
          p.topper.children.forEach((a, i) => (a.rotation.x = Math.sin(t * 3 + i * 2) * 0.25 * (0.5 + wob) + roll));
          break;
        case 'halo':
          p.topper.rotation.y = t * 1.2;
          p.topper.position.y = this.H / 2 + Math.sin(t * 2.4) * 0.03;
          break;
        case 'flame':
          p.topper.children.forEach((c, i) => c.scale.set(1, 0.8 + Math.abs(Math.sin(t * 13 + i * 2.1)) * 0.45, 1));
          break;
        case 'cursor':
          p.topper.rotation.y = Math.sin(t * 0.9) * 0.6;
          p.topper.position.y = this.H / 2 + Math.sin(t * 2) * 0.04;
          break;
        case 'sprout':
          p.topper.rotation.z = Math.sin(t * 2.3) * 0.15 * (1 + wob);
          break;
      }
    }
  }

  /** Frees GPU resources; a later setSpec() grows it back (React may remount the owner). */
  dispose() {
    this.clear();
    this.key = '';
    this.skinId = null;
    this.skin?.dispose();
    this.skin = null;
    this.accent.dispose();
    this.glow.dispose();
    this.white.dispose();
    this.black.dispose();
    this.hidden.dispose();
  }
}
