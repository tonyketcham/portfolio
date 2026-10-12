/** The web: merged node-graph cable geometry + its flowing-pulse material. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, type WorldMap } from '../world/map';
import { globalUniforms, srgb } from '../scene/globals';
import { glslCommon, glslGlobals } from './common';

export const MAX_EDGES = 256;

export const cableVertex = /* glsl */ `
attribute float aEdge;
attribute float aLen;
attribute vec3 aColor;
varying vec2 vUv;
varying float vEdge;
varying float vLen;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDist;
void main() {
  vUv = uv;
  vEdge = aEdge;
  vLen = aLen;
  vColor = aColor;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const cableFragment = /* glsl */ `
${glslGlobals}
${glslCommon}
uniform float uReveal;
uniform sampler2D uHi;
varying vec2 vUv;
varying float vEdge;
varying float vLen;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDist;
void main() {
  if (length(vWorld.xz) > uReveal - 5.0) discard;
  float hi = texture2D(uHi, vec2((vEdge + 0.5) / ${MAX_EDGES}.0, 0.5)).r;
  float flow = fract(vUv.x * vLen * 0.32 - uTime * (0.7 + hi * 1.4));
  float pulse = smoothstep(0.82, 0.97, flow) * (1.0 - smoothstep(0.97, 1.0, flow));
  float stripe = smoothstep(0.3, 0.36, abs(fract(vUv.y * 2.0) - 0.5));
  vec3 base = mix(vColor * 0.42, vColor * 0.72, stripe);
  vec3 col = base + vColor * pulse * (0.9 + hi) + vec3(1.0) * pulse * hi * 0.5;
  col = mix(col, vColor * 1.15, hi * 0.35);
  float ndl = max(dot(vNormal, normalize(uSunDir)), 0.0);
  col *= mix(0.7 + 0.45 * ndl, 1.15, uNight * 0.7);
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogColor, fog);
  col = mix(col, hueShift(col, uTime * 2.0 + vUv.x * 6.0), uMushroom * 0.8);
  gl_FragColor = vec4(toLinear(col), 1.0);
}
`;

export const hiData = new Uint8Array(MAX_EDGES * 4);
export const hiTexture = new THREE.DataTexture(hiData, MAX_EDGES, 1, THREE.RGBAFormat);
hiTexture.needsUpdate = true;

export function buildCableGeometry(world: WorldMap) {
    const parts: THREE.BufferGeometry[] = [];
    world.edges.slice(0, MAX_EDGES).forEach((edge, index) => {
      const lift = edge.kind === 'road' ? 0.08 : 0.07;
      // Wires tuck under the hero painting instead of crossing it.
      const underHero = (x: number, z: number) => Math.abs(x) < 4.7 && Math.abs(z - 1.2) < 3;
      const pts = edge.points.map(
        ([x, z]) => new THREE.Vector3(x, heightAt(world, x, z) + (underHero(x, z) ? -0.25 : lift), z)
      );
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const length = curve.getLength();
      const radius = edge.kind === 'road' ? 0.1 : 0.045;
      const tube = new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(length * 3)), radius, edge.kind === 'road' ? 6 : 4, false);
      const n = tube.attributes.position.count;
      const color = srgb(edge.color);
      tube.setAttribute('aEdge', new THREE.Float32BufferAttribute(new Float32Array(n).fill(index), 1));
      tube.setAttribute('aLen', new THREE.Float32BufferAttribute(new Float32Array(n).fill(length), 1));
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([color.x, color.y, color.z], i * 3);
      tube.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
      parts.push(tube.index ? tube.toNonIndexed() : tube);
      // node-graph ports: a plug at each end of the wire
      for (const [end, t] of [
        [pts[0], 0],
        [pts[pts.length - 1], 1],
      ] as const) {
        const plug = new THREE.SphereGeometry(radius * 2.1, 8, 6).toNonIndexed();
        plug.translate(end.x, end.y, end.z);
        const m = plug.attributes.position.count;
        plug.setAttribute('aEdge', new THREE.Float32BufferAttribute(new Float32Array(m).fill(index), 1));
        plug.setAttribute('aLen', new THREE.Float32BufferAttribute(new Float32Array(m).fill(length), 1));
        const pc = new Float32Array(m * 3);
        for (let i = 0; i < m; i++) pc.set([color.x, color.y, color.z], i * 3);
        plug.setAttribute('aColor', new THREE.Float32BufferAttribute(pc, 3));
        const uv = plug.attributes.uv.array as Float32Array;
        for (let i = 0; i < m; i++) uv[i * 2] = t;
        parts.push(plug);
      }
    });
    const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
    parts.forEach((p) => p.dispose());
    return merged;
}

export function createCableMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: cableVertex,
    fragmentShader: cableFragment,
    uniforms: { ...globalUniforms, uHi: { value: hiTexture } },
  });
}
