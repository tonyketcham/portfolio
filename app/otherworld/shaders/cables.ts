/** The web: merged node-graph cable geometry + its flowing-pulse material (TSL). */
import * as THREE from 'three/webgpu';
import { abs, attribute, float, fract, mix, output, positionWorld, texture, uv, vec2, vec3, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, type WorldMap } from '../world/map';
import { globalUniforms } from '../scene/globals';
import { hueShift } from './common';

export const MAX_EDGES = 256;

export const hiData = new Uint8Array(MAX_EDGES * 4);
export const hiTexture = new THREE.DataTexture(hiData, MAX_EDGES, 1, THREE.RGBAFormat);
hiTexture.magFilter = THREE.NearestFilter;
hiTexture.minFilter = THREE.NearestFilter;
hiTexture.needsUpdate = true;

function fill(geo: THREE.BufferGeometry, index: number, length: number, color: THREE.Color) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(new Float32Array(n).fill(index), 1));
  geo.setAttribute('aLen', new THREE.Float32BufferAttribute(new Float32Array(n).fill(length), 1));
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
}

export function buildCableGeometry(world: WorldMap) {
  const parts: THREE.BufferGeometry[] = [];
  world.edges.slice(0, MAX_EDGES).forEach((edge, index) => {
    const lift = edge.kind === 'road' ? 0.08 : 0.07;
    const pts = edge.points.map(([x, z]) => new THREE.Vector3(x, heightAt(world, x, z) + lift, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const length = curve.getLength();
    const radius = edge.kind === 'road' ? 0.1 : 0.045;
    const tube = new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(length * 3)), radius, edge.kind === 'road' ? 6 : 4, false);
    const color = new THREE.Color(edge.color);
    const flat = tube.index ? tube.toNonIndexed() : tube;
    fill(flat, index, length, color);
    parts.push(flat);
    // node-graph ports: a plug at each end of the wire
    for (const [end, t] of [
      [pts[0], 0],
      [pts[pts.length - 1], 1],
    ] as const) {
      const plug = new THREE.SphereGeometry(radius * 2.1, 8, 6).toNonIndexed();
      plug.translate(end.x, end.y, end.z);
      fill(plug, index, length, color);
      const uvs = plug.attributes.uv.array as Float32Array;
      for (let i = 0; i < plug.attributes.position.count; i++) uvs[i * 2] = t;
      parts.push(plug);
    }
  });
  const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
  parts.forEach((p) => p.dispose());
  return merged;
}

export function createCableMaterial() {
  const U = globalUniforms;
  const m = new THREE.MeshLambertNodeMaterial();
  const aEdge = attribute<'float'>('aEdge', 'float');
  const aLen = attribute<'float'>('aLen', 'float');
  const aColor = attribute<'vec3'>('aColor', 'vec3');
  const hi = texture(hiTexture, vec2(aEdge.add(0.5).div(MAX_EDGES), 0.5)).r;
  const flow = fract(uv().x.mul(aLen).mul(0.32).sub(U.uTime.mul(hi.mul(1.4).add(0.7))));
  const pulse = flow.smoothstep(0.82, 0.97).mul(float(1).sub(flow.smoothstep(0.97, 1.0)));
  const stripe = abs(fract(uv().y.mul(2)).sub(0.5)).smoothstep(0.3, 0.36);
  m.maskNode = positionWorld.xz.length().lessThan(U.uReveal.sub(5));
  m.colorNode = mix(aColor.mul(0.3), aColor.mul(0.6), stripe);
  // The pulse is light, not paint: add it after lighting so it glows at night.
  m.outputNode = vec4(
    mix(
      output.rgb.add(aColor.mul(pulse).mul(hi.add(0.9))).add(vec3(1).mul(pulse).mul(hi).mul(0.5)),
      hueShift(output.rgb, U.uTime.mul(2).add(uv().x.mul(6))),
      U.uMushroom.mul(0.8)
    ).add(aColor.mul(hi).mul(0.25)),
    output.a
  );
  return m;
}

