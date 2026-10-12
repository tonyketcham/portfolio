/**
 * Flora builders: instanced trees (round, pine, iridescent shader canopies),
 * grass tufts and rocks, with reveal pop-in + wind sway as TSL position nodes.
 * Pure three.js (WebGPU), so it renders headless.
 */
import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cos,
  dot,
  float,
  fract,
  mix,
  normalWorld,
  normalize,
  output,
  positionLocal,
  positionWorld,
  pow,
  sin,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { heightAt, type TreeProp, type WorldMap } from '../world/map';
import { globalUniforms, revealScaleNode } from '../scene/globals';
import { falloff, gradient3, hueShift } from './common';

export const swayUniform = uniform(1);

/**
 * Per-instance root (x, y, z, phase). Instanced position nodes need the
 * instance origin, and positionLocal is already instance-transformed.
 */
export function setRoots(mesh: THREE.InstancedMesh, roots: number[]) {
  const n = Math.max(1, mesh.count);
  const data = new Float32Array(n * 4);
  data.set(roots.slice(0, n * 4));
  mesh.geometry.setAttribute('aRoot', new THREE.InstancedBufferAttribute(data, 4));
}

/** Reveal pop-in + wind sway for instanced flora. */
export function swayPosition(amount: number) {
  const U = globalUniforms;
  const root = attribute<'vec4'>('aRoot', 'vec4');
  const s = revealScaleNode(root.xz);
  const local = positionLocal.sub(root.xyz).mul(s);
  if (amount === 0) return root.xyz.add(local);
  const hh = local.y.max(0);
  const w = hh.mul(hh).mul(amount).mul(swayUniform);
  const ph = root.x.mul(0.5).add(root.z.mul(0.3));
  return root.xyz.add(local).add(
    vec3(sin(U.uTime.mul(1.7).add(ph)).mul(w), 0, cos(U.uTime.mul(1.3).add(root.z.mul(0.5))).mul(w).mul(0.7))
  );
}

function instancedLambert(params: THREE.MeshLambertNodeMaterialParameters, sway: number) {
  const m = new THREE.MeshLambertNodeMaterial(params);
  m.positionNode = swayPosition(sway);
  return m;
}

function shaderCanopyMaterial() {
  const U = globalUniforms;
  const m = new THREE.MeshLambertNodeMaterial({ flatShading: true });
  const root = attribute<'vec4'>('aRoot', 'vec4');
  const s = revealScaleNode(root.xz);
  const local = positionLocal.sub(root.xyz).mul(s);
  m.positionNode = root.xyz.add(local).add(vec3(sin(U.uTime.mul(1.4).add(root.x)).mul(0.06).mul(swayUniform).mul(local.y.add(1)), 0, 0));
  const h = positionWorld.y.mul(0.35).add(positionWorld.x.mul(0.05)).add(U.uTime.mul(0.25)).add(root.w.mul(3));
  const base = gradient3(fract(h), vec3(0.27, 0.03, 0.78), vec3(0.01, 0.48, 0.74), vec3(0.96, 0.21, 0.51));
  const cell = fract(vec2(positionWorld.x.add(positionWorld.z), positionWorld.y).mul(3.2)).sub(0.5);
  const dots = falloff(cell.length(), 0.22, 0.28);
  m.colorNode = mix(base, base.mul(1.5), dots.mul(0.5));
  // Iridescent rim + mushroom hue drift, after lighting.
  const rim = pow(float(1).sub(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))).abs()), 2);
  m.outputNode = vec4(
    mix(output.rgb.add(base.mul(rim).mul(0.35)).add(base.mul(U.uNight).mul(0.25)), hueShift(output.rgb, U.uTime.add(positionWorld.x)), U.uMushroom.mul(0.7)),
    output.a
  );
  return m;
}

const dummy = new THREE.Object3D();
const color = new THREE.Color();

export function groupTrees(trees: TreeProp[]) {
  return {
    round: trees.filter((t) => t.kind === 'round'),
    pine: trees.filter((t) => t.kind === 'pine'),
    shader: trees.filter((t) => t.kind === 'shader'),
  };
}

export function createTreeAssets() {
  const trunk = new THREE.CylinderGeometry(0.09, 0.15, 1, 5).translate(0, 0.5, 0);
  const blob = new THREE.IcosahedronGeometry(1, 0);
  const cone1 = new THREE.ConeGeometry(0.85, 1.3, 6).translate(0, 0.45, 0).toNonIndexed();
  const cone2 = new THREE.ConeGeometry(0.62, 1.1, 6).translate(0, 1.15, 0).toNonIndexed();
  const pine = new THREE.BufferGeometry();
  pine.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([...cone1.attributes.position.array, ...cone2.attributes.position.array]), 3)
  );
  pine.computeVertexNormals();
  const shaderBlob = new THREE.IcosahedronGeometry(1, 1);
  return {
    geos: { trunk, blob, pine, shaderBlob },
    mats: {
      trunk: instancedLambert({ color: '#6b4f3a', flatShading: true }, 0),
      leaf: instancedLambert({ flatShading: true }, 0.05),
      shader: shaderCanopyMaterial(),
    },
  };
}

type TreeMeshes = {
  trunks: THREE.InstancedMesh | null;
  round: THREE.InstancedMesh | null;
  pine: THREE.InstancedMesh | null;
  shader: THREE.InstancedMesh | null;
};

export function layoutTrees(world: WorldMap, meshes: TreeMeshes) {
  const trees = world.props.trees;
  const groups = groupTrees(trees);
  const trunkRoots: number[] = [];
  trees.forEach((t, i) => {
    const y = heightAt(world, t.x, t.z) - 0.05;
    const trunkH = (t.kind === 'pine' ? 0.7 : 1.1) * t.scale;
    dummy.position.set(t.x, y, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.set(t.scale, trunkH, t.scale);
    dummy.updateMatrix();
    meshes.trunks?.setMatrixAt(i, dummy.matrix);
    trunkRoots.push(t.x, y, t.z, t.hue);
  });
  if (meshes.trunks) {
    meshes.trunks.instanceMatrix.needsUpdate = true;
    setRoots(meshes.trunks, trunkRoots);
  }

  const place = (mesh: THREE.InstancedMesh | null, list: TreeProp[], kind: string) => {
    if (!mesh) return;
    const roots: number[] = [];
    list.forEach((t, i) => {
      const y = heightAt(world, t.x, t.z);
      if (kind === 'round') {
        dummy.position.set(t.x, y + 1.1 * t.scale + 0.55 * t.scale, t.z);
        dummy.rotation.set(t.hue * 3, t.rot, t.hue * 2);
        dummy.scale.set(0.95 * t.scale, 0.8 * t.scale, 0.95 * t.scale);
        color.setHSL(0.25 + t.hue * 0.08, 0.45 + t.hue * 0.15, 0.3 + t.hue * 0.08, THREE.SRGBColorSpace);
      } else if (kind === 'pine') {
        dummy.position.set(t.x, y + 0.6 * t.scale, t.z);
        dummy.rotation.set(0, t.rot, 0);
        dummy.scale.setScalar(t.scale);
        color.setHSL(0.36 + t.hue * 0.05, 0.42, 0.22 + t.hue * 0.06, THREE.SRGBColorSpace);
      } else {
        dummy.position.set(t.x, y + 1.1 * t.scale + 0.55 * t.scale, t.z);
        dummy.rotation.set(t.hue, t.rot, 0);
        dummy.scale.set(0.72 * t.scale, 0.66 * t.scale, 0.72 * t.scale);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (kind !== 'shader') mesh.setColorAt(i, color);
      roots.push(t.x, y, t.z, t.hue);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    setRoots(mesh, roots);
  };
  place(meshes.round, groups.round, 'round');
  place(meshes.pine, groups.pine, 'pine');
  place(meshes.shader, groups.shader, 'shader');
}

export function createGrassAssets() {
  const positions: number[] = [];
  const colors: number[] = [];
  const base = new THREE.Color('#2f5a24');
  const tip = new THREE.Color('#9ccc5a');
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.3;
    const ox = Math.cos(a) * 0.05;
    const oz = Math.sin(a) * 0.05;
    const lean = 0.08;
    const w = 0.045;
    const px = Math.cos(a + Math.PI / 2) * w;
    const pz = Math.sin(a + Math.PI / 2) * w;
    positions.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox + Math.cos(a) * lean, 0.34 + b * 0.04, oz + Math.sin(a) * lean);
    colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = instancedLambert({ vertexColors: true, side: THREE.DoubleSide }, 0.9);
  return { geometry, material };
}

export function layoutGrass(world: WorldMap, mesh: THREE.InstancedMesh) {
  const roots: number[] = [];
  world.props.grass.forEach((g, i) => {
    const y = heightAt(world, g.x, g.z) - 0.02;
    dummy.position.set(g.x, y, g.z);
    dummy.rotation.set(0, g.rot, 0);
    dummy.scale.setScalar(g.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.22 + ((i * 0.618) % 1) * 0.06, 0.5, 0.55 + ((i * 0.37) % 1) * 0.15, THREE.SRGBColorSpace);
    mesh.setColorAt(i, color);
    roots.push(g.x, y, g.z, 0);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  setRoots(mesh, roots);
}

export function createRockAssets() {
  return {
    geometry: new THREE.DodecahedronGeometry(1, 0),
    material: instancedLambert({ color: '#8a8780', flatShading: true }, 0),
  };
}

export function layoutRocks(world: WorldMap, mesh: THREE.InstancedMesh) {
  const roots: number[] = [];
  world.props.rocks.forEach((r, i) => {
    const y = heightAt(world, r.x, r.z) + r.scale * 0.25;
    dummy.position.set(r.x, y, r.z);
    dummy.rotation.set(r.rot, r.rot * 2, r.rot * 0.5);
    dummy.scale.set(r.scale, r.scale * 0.7, r.scale * 0.9);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    roots.push(r.x, y, r.z, 0);
  });
  mesh.instanceMatrix.needsUpdate = true;
  setRoots(mesh, roots);
}
