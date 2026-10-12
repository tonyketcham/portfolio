/**
 * Shared house materials (TSL): the vertex-coloured furniture material, plus
 * the few things that need a shader of their own: gradient-map fire, portal
 * surfaces, glass, glow and the build-mode hotspot ghosts.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  atan,
  cameraPosition,
  dot,
  float,
  floor,
  fract,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  sin,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { globalUniforms } from '../scene/globals';
import { falloff, fbm, gradient3, hash12, hex3, v3 } from '../shaders/common';

export const houseUniforms = {
  /** 0 → 1: blueprint → built (drives floors/walls in the intro). */
  built: uniform(1),
  /** Build mode: ghosts visible, walls cut lower. */
  buildMode: uniform(0),
  ghostColor: uniform(new THREE.Color('#3b82f6')),
};

/** The one material almost every piece of furniture shares. */
export const furnitureMaterial = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true });

const cache = new Map<string, THREE.NodeMaterial>();
const cached = <M extends THREE.NodeMaterial>(key: string, make: () => M): M => {
  let m = cache.get(key) as M | undefined;
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
};

/** Self-lit flat colour (screens, LEDs, ember cores). */
export const glowMaterial = (hex: string, strength = 1) =>
  cached(`glow:${hex}:${strength}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ color: hex });
    m.colorNode = hex3(hex).mul(strength);
    return m;
  });

export const glassMaterial = (hex = '#bfdbfe', opacity = 0.35) =>
  cached(`glass:${hex}:${opacity}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const fres = float(1).sub(abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))))).pow(2);
    m.colorNode = mix(hex3(hex).mul(0.6), vec3(1), fres.mul(0.6));
    m.opacityNode = fres.mul(0.5).add(opacity);
    return m;
  });

/**
 * Fire, but it's a gradient map: noise flames posterized into a few hard
 * bands and mapped through a three-stop palette. Used on crossed quads.
 */
export const fireMaterial = (palette: [string, string, string] = ['#7c2d12', '#f97316', '#fde68a'], bands = 4) =>
  cached(`fire:${palette.join()}:${bands}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
    const [a, b, c] = palette.map((h) => hex3(h));
    const t = globalUniforms.uTime;
    const shape = Fn(() => {
      const p = uv().toVar();
      const n = fbm(vec2(p.x.mul(3), p.y.mul(2).sub(t.mul(1.6)))).toVar();
      // teardrop: narrow at the top, wobbling sideways
      const x = abs(p.x.sub(0.5).add(n.sub(0.5).mul(0.35).mul(p.y))).mul(2);
      const width = float(1).sub(p.y).pow(0.7).mul(0.95);
      const body = width.sub(x).add(n.mul(0.35)).sub(0.1);
      return body.mul(1.6).clamp(0, 1);
    })();
    const q = floor(shape.mul(bands)).div(bands - 1).clamp(0, 1);
    m.colorNode = gradient3(q, a, b, c).mul(1.4);
    m.opacityNode = shape.greaterThan(0.02).select(float(1), float(0));
    m.alphaTest = 0.5;
    return m;
  });

/**
 * A portal surface: a rotating, domain-warped swirl in the destination's
 * palette, dithered in hard bands like a cheap print.
 */
export const portalMaterial = (palette: [string, string, string], seed = 0) =>
  cached(`portal:${palette.join()}:${seed}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const [a, b, c] = palette.map((h) => hex3(h));
    const t = globalUniforms.uTime;
    m.colorNode = Fn(() => {
      const p = uv().sub(0.5).mul(vec2(1, 1.25));
      const r = p.length();
      const ang = atan(p.y, p.x);
      const swirl = ang.add(r.mul(7)).sub(t.mul(1.3)).add(seed);
      const q = vec2(swirl.cos(), swirl.sin()).mul(r.mul(3)).add(seed);
      const n = fbm(q.add(vec2(t.mul(0.2), 0)));
      const rings = sin(r.mul(26).sub(t.mul(4))).mul(0.5).add(0.5);
      const v = n.mul(0.75).add(rings.mul(0.25)).add(r.mul(-0.4)).add(0.25);
      const dither = hash12(floor(uv().mul(64))).sub(0.5).mul(0.18);
      const band = floor(v.add(dither).clamp(0, 0.999).mul(5)).div(4);
      const col = gradient3(band, a, b, c);
      const core = falloff(r, 0.0, 0.18).mul(sin(t.mul(3)).mul(0.15).add(0.35));
      return vec4(col.add(core).mul(1.25), 1);
    })();
    return m;
  });

/** Build-mode hotspot ghost: a translucent, scanlined silhouette. */
export const ghostMaterial = cached('ghost', () => {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const lines = fract(positionWorld.y.mul(14).sub(globalUniforms.uTime.mul(0.8))).step(0.5);
  const fres = float(1).sub(abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))))).pow(1.5);
  m.colorNode = mix(v3(houseUniforms.ghostColor), vec3(1), fres.mul(0.5));
  m.opacityNode = lines.mul(0.18).add(fres.mul(0.45)).add(0.08).mul(houseUniforms.buildMode);
  return m;
});
