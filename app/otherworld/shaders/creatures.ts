/**
 * Skins for visitor-made creatures (TSL). Each creature owns a handful of
 * uniforms (its three colours, wobble, a poke flash) so recolouring in the lab
 * never recompiles anything; picking a different skin swaps the material.
 */
import * as THREE from 'three/webgpu';
import {
  abs,
  cos,
  dot,
  float,
  floor,
  fract,
  mix,
  mod,
  normalView,
  positionLocal,
  positionViewDirection,
  positionWorld,
  screenCoordinate,
  screenUV,
  select,
  sin,
  step,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import type { Skin } from '../creatures/spec';
import { globalUniforms } from '../scene/globals';
import { hash12, hueShift, v3, vnoise, type F, type V3 } from './common';

export function creatureUniforms() {
  return {
    body: uniform(new THREE.Color()),
    accent: uniform(new THREE.Color()),
    glow: uniform(new THREE.Color()),
    /** 0 … 1 from the lab. */
    wobble: uniform(0),
    /** 1 when poked, decays to 0: everything flashes. */
    poke: uniform(0),
    /** Per-creature offset so two of the same skin don't flash in sync. */
    seed: uniform(0),
  };
}
export type CreatureUniforms = ReturnType<typeof creatureUniforms>;

export function writeCreatureColors(u: CreatureUniforms, colors: [string, string, string]) {
  u.body.value.set(colors[0]);
  u.accent.value.set(colors[1]);
  u.glow.value.set(colors[2]);
}

const T = globalUniforms.uTime;
/** 0 facing the camera → 1 at grazing angles. */
const fresnel = (): F => float(1).sub(abs(dot(normalView, positionViewDirection))).clamp(0, 1);

/** Every node material adds an emissiveNode in setupLighting; the types only admit it on standard. */
const setEmissive = (m: THREE.NodeMaterial, node: V3) => ((m as unknown as { emissiveNode: V3 | null }).emissiveNode = node);

const lambert = (opts: { color: V3; emissive?: V3; position?: V3; flat?: boolean }, u: CreatureUniforms) => {
  const m = new THREE.MeshLambertNodeMaterial({ flatShading: opts.flat ?? true });
  m.colorNode = opts.color;
  setEmissive(m, (opts.emissive ?? vec3(0)).add(vec3(u.poke.mul(0.8))));
  if (opts.position) m.positionNode = opts.position;
  return m;
};

const SKINS: Record<Skin, (u: CreatureUniforms) => THREE.Material> = {
  clay: (u) => {
    const p = positionLocal;
    const grad = p.y.smoothstep(-0.6, 0.9).mul(0.35);
    const speckle = step(0.94, hash12(floor(p.xz.mul(28)).add(floor(p.y.mul(28)).mul(7.1))));
    return lambert({ color: mix(v3(u.body), v3(u.accent), grad).mul(float(1).sub(speckle.mul(0.35))) }, u);
  },
  toon: (u) => {
    const m = new THREE.MeshToonNodeMaterial();
    m.colorNode = v3(u.body);
    setEmissive(m, v3(u.glow).mul(fresnel().smoothstep(0.45, 0.7).mul(0.8)).add(vec3(u.poke.mul(0.8))));
    return m;
  },
  holo: (u) => {
    const f = fresnel();
    const rainbow = hueShift(v3(u.glow), f.mul(4).add(T).add(positionWorld.y.mul(2)));
    const scan = step(0.5, fract(positionWorld.y.mul(14).sub(T.mul(1.5))));
    const flicker = sin(T.mul(31).add(u.seed)).mul(0.5).add(0.5).mul(0.15).add(0.85);
    return lambert({ color: v3(u.body).mul(0.25), emissive: rainbow.mul(f.mul(1.1).add(0.15)).add(v3(u.glow).mul(scan).mul(0.3)).mul(flicker) }, u);
  },
  iridescent: (u) => {
    const shifted = hueShift(v3(u.body), fresnel().mul(5).add(T.mul(0.4)).add(positionLocal.y.mul(2)));
    return lambert({ color: shifted, emissive: shifted.mul(0.25), flat: false }, u);
  },
  goo: (u) => {
    const p = positionLocal;
    const amp = u.wobble.mul(0.7).add(0.3).mul(0.04);
    const jelly = vec3(sin(p.y.mul(7).add(T.mul(3))), sin(p.x.mul(6).add(T.mul(2.3))).mul(0.5), cos(p.y.mul(6).add(T.mul(2.7)))).mul(amp);
    const blobs = vnoise(p.xy.mul(4).add(vec2(T.mul(0.4), p.z.mul(3)))).smoothstep(0.55, 0.7);
    const shine = fresnel().pow(3).mul(0.5);
    return lambert({ color: mix(v3(u.body), v3(u.accent), blobs), emissive: vec3(shine).add(v3(u.glow).mul(0.08)), position: p.add(jelly), flat: false }, u);
  },
  static: (u) => {
    const cell = floor(screenCoordinate.xy.div(3));
    const n = hash12(cell.add(floor(T.mul(20)).mul(vec2(13.1, 7.7))));
    const roll = step(0.92, fract(screenUV.y.mul(3).sub(T.mul(0.7))));
    return lambert({ color: v3(u.body).mul(0.2), emissive: mix(v3(u.body), vec3(n), 0.75).mul(0.9).add(vec3(roll.mul(0.25))) }, u);
  },
  missing: (u) => {
    const p = positionLocal.mul(6);
    const check = mod(floor(p.x).add(floor(p.y)).add(floor(p.z)), 2);
    const c = mix(v3(u.body), vec3(0.02), check);
    return lambert({ color: c, emissive: c.mul(0.3) }, u);
  },
  disco: (u) => {
    const p = positionLocal;
    const facet = hash12(floor(p.xy.mul(6)).add(floor(p.z.mul(6)).mul(vec2(1.7, 3.1))));
    const flash = step(0.8, fract(facet.add(T.mul(0.9)).add(u.seed)));
    return lambert({ color: v3(u.body).mul(0.6).add(v3(u.accent).mul(facet.mul(0.3))), emissive: v3(u.glow).mul(flash).mul(1.3) }, u);
  },
  void: (u) => {
    const m = new THREE.MeshBasicNodeMaterial();
    const h = hash12(floor(screenCoordinate.xy.div(4)));
    const star = step(0.982, h).mul(sin(T.mul(3).add(h.mul(40))).mul(0.5).add(0.5));
    const nebula = v3(u.glow).mul(vnoise(screenUV.mul(6).add(T.mul(0.05))).mul(0.18));
    const rim = v3(u.glow).mul(fresnel().smoothstep(0.4, 0.85).mul(1.5));
    m.colorNode = vec3(0.01, 0.0, 0.03).add(nebula).add(vec3(star)).add(rim).add(vec3(u.poke));
    return m;
  },
  glitch: (u) => {
    const p = positionLocal;
    const band = floor(p.y.mul(9));
    const tick = floor(T.mul(7).add(u.seed));
    const torn = step(0.8, hash12(vec2(band, tick)));
    const shove = hash12(vec2(band.add(3.3), tick)).sub(0.5).mul(0.35).mul(u.wobble.add(0.4)).mul(torn);
    const tint = select(torn.greaterThan(0.5), v3(u.accent), v3(u.body));
    return lambert({ color: tint, emissive: v3(u.glow).mul(torn).mul(0.6), position: p.add(vec3(shove, 0, 0)) }, u);
  },
};

export const skinMaterial = (skin: Skin, u: CreatureUniforms) => SKINS[skin](u);

/** Hands, feet, horns, beaks: the accent colour, lit. */
export function accentMaterial(u: CreatureUniforms) {
  return lambert({ color: v3(u.accent) }, u);
}

/** Antenna tips, halos, visors, flames: unlit and a touch over-bright. */
export function glowMaterial(u: CreatureUniforms) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = v3(u.glow).mul(sin(T.mul(4).add(u.seed)).mul(0.12).add(1.25)).add(vec3(u.poke));
  return m;
}
