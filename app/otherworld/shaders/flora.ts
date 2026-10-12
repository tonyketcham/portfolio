/**
 * Flora builders: instanced trees (round, pine, iridescent shader canopies),
 * grass tufts and rocks, with reveal pop-in + wind sway injected into stock
 * materials. Pure three.js.
 */
import * as THREE from 'three';
import { heightAt, type TreeProp, type WorldMap } from '../world/map';
import { globalUniforms, glslReveal } from '../scene/globals';
import { glslCommon, glslGlobals } from './common';

export const swayUniform = { value: 1 };

/** Inject reveal pop-in + wind sway into a stock material used on an InstancedMesh. */
export function patchInstanced<M extends THREE.Material>(material: M, sway: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globalUniforms.uTime;
    shader.uniforms.uReveal = globalUniforms.uReveal;
    shader.uniforms.uSway = swayUniform;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uSway;\n${glslReveal}\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec2 ixz = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  transformed *= revealScale(ixz);
  float hh = max(position.y, 0.0);
  float w = ${sway.toFixed(3)} * uSway;
  transformed.x += sin(uTime * 1.7 + ixz.x * 0.5 + ixz.y * 0.3) * hh * hh * w;
  transformed.z += cos(uTime * 1.3 + ixz.y * 0.5) * hh * hh * w * 0.7;
#endif`
      );
  };
  material.customProgramCacheKey = () => `instanced-sway-${sway}`;
  return material;
}

export const shaderCanopyVertex = /* glsl */ `
${glslReveal}
uniform float uTime;
uniform float uSway;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDist;
varying vec3 vTint;
void main() {
  vec3 p = position;
  vec2 ixz = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  p *= revealScale(ixz);
  p.x += sin(uTime * 1.4 + ixz.x) * 0.06 * uSway * (p.y + 1.0);
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3(1.0);
  #endif
  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
export const shaderCanopyFragment = /* glsl */ `
${glslGlobals}
${glslCommon}
varying vec3 vWorld;
varying vec3 vNormal;
varying float vDist;
varying vec3 vTint;
void main() {
  float t = uTime * 0.25;
  float h = vWorld.y * 0.35 + vWorld.x * 0.05 + t + vTint.r * 3.0;
  vec3 a = vec3(0.56, 0.2, 0.9);
  vec3 b = vec3(0.1, 0.72, 0.88);
  vec3 c = vec3(0.98, 0.5, 0.74);
  vec3 col = gradient3(fract(h), a, b, c);
  float ndl = max(dot(normalize(vNormal), normalize(uSunDir)), 0.0);
  col *= 0.42 + ndl * 0.65 + uNight * 0.3;
  vec2 cell = fract(vec2(vWorld.x + vWorld.z, vWorld.y) * 3.2) - 0.5;
  float dots = 1.0 - smoothstep(0.22, 0.28, length(cell));
  col = mix(col, col * 1.35, dots * 0.5);
  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld))), 2.0);
  col += rim * 0.25;
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogColor, fog);
  col = mix(col, hueShift(col, uTime + vWorld.x), uMushroom * 0.7);
  gl_FragColor = vec4(toLinear(col), 1.0);
}
`;

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
      trunk: patchInstanced(new THREE.MeshLambertMaterial({ color: '#6b4f3a', flatShading: true }), 0.0),
      leaf: patchInstanced(new THREE.MeshLambertMaterial({ flatShading: true }), 0.05),
      shader: new THREE.ShaderMaterial({
        vertexShader: shaderCanopyVertex,
        fragmentShader: shaderCanopyFragment,
        uniforms: { ...globalUniforms, uSway: swayUniform },
      }),
    },
  };
}

export function layoutTrees(
  world: WorldMap,
  meshes: { trunks: THREE.InstancedMesh | null; round: THREE.InstancedMesh | null; pine: THREE.InstancedMesh | null; shader: THREE.InstancedMesh | null }
) {
  const trees = world.props.trees;
  const groups = groupTrees(trees);
  trees.forEach((t, i) => {
    const y = heightAt(world, t.x, t.z) - 0.05;
    const trunkH = (t.kind === 'pine' ? 0.7 : 1.1) * t.scale;
    dummy.position.set(t.x, y, t.z);
    dummy.rotation.set(0, t.rot, 0);
    dummy.scale.set(t.scale, trunkH, t.scale);
    dummy.updateMatrix();
    meshes.trunks?.setMatrixAt(i, dummy.matrix);
  });
  if (meshes.trunks) meshes.trunks.instanceMatrix.needsUpdate = true;

  const place = (mesh: THREE.InstancedMesh | null, list: TreeProp[], kind: string) => {
    if (!mesh) return;
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
        color.setRGB(t.hue, t.hue, t.hue);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
  const material = patchInstanced(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.9);
  return { geometry, material };
}

export function layoutGrass(world: WorldMap, mesh: THREE.InstancedMesh) {
  world.props.grass.forEach((g, i) => {
    dummy.position.set(g.x, heightAt(world, g.x, g.z) - 0.02, g.z);
    dummy.rotation.set(0, g.rot, 0);
    dummy.scale.setScalar(g.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.22 + ((i * 0.618) % 1) * 0.06, 0.5, 0.55 + ((i * 0.37) % 1) * 0.15, THREE.SRGBColorSpace);
    mesh.setColorAt(i, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function createRockAssets() {
  return {
    geometry: new THREE.DodecahedronGeometry(1, 0),
    material: patchInstanced(new THREE.MeshLambertMaterial({ color: '#8a8780', flatShading: true }), 0),
  };
}

export function layoutRocks(world: WorldMap, mesh: THREE.InstancedMesh) {
  world.props.rocks.forEach((r, i) => {
    dummy.position.set(r.x, heightAt(world, r.x, r.z) + r.scale * 0.25, r.z);
    dummy.rotation.set(r.rot, r.rot * 2, r.rot * 0.5);
    dummy.scale.set(r.scale, r.scale * 0.7, r.scale * 0.9);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

