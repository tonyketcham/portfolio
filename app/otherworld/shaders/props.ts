/** Prop geometry builders that don't need React (amanitas). */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../lib/random';

function colored(geo: THREE.BufferGeometry, hex: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function buildShroom(seed: number) {
  const rand = mulberry32(seed);
  const parts = [
    colored(new THREE.CylinderGeometry(0.11, 0.15, 0.55, 8).translate(0, 0.275, 0), '#f3ead8'),
    colored(
      new THREE.SphereGeometry(0.42, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.72, 1).translate(0, 0.5, 0),
      '#dc2626'
    ),
    colored(new THREE.CircleGeometry(0.41, 14).rotateX(Math.PI / 2).translate(0, 0.5, 0), '#efe2c4'),
  ];
  for (let s = 0; s < 9; s++) {
    const a = rand() * Math.PI * 2;
    const el = 0.25 + rand() * 1.05;
    const x = Math.cos(a) * Math.cos(el) * 0.42;
    const z = Math.sin(a) * Math.cos(el) * 0.42;
    const y = 0.5 + Math.sin(el) * 0.42 * 0.72;
    parts.push(colored(new THREE.IcosahedronGeometry(0.045 + rand() * 0.03, 0).translate(x, y, z), '#fafafa'));
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeVertexNormals();
  return merged;
}

export const shroomMaterial = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true });
