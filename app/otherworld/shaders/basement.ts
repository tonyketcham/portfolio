/** The basement floor: damp poured concrete in big slabs, with the shared tile overlays (TSL). */
import * as THREE from 'three/webgpu';
import { Fn, floor, fract, mix, output, positionWorld, step, texture, vec2, vec3, vec4 } from 'three/tsl';
import { globalUniforms } from '../scene/globals';
import { BASEMENT } from '../world/basement';
import { fbm } from './common';
import { tileOverlay } from './terrain';

export function createBasementFloorMaterial(tiles: THREE.Texture) {
  const m = new THREE.MeshLambertNodeMaterial();
  const lp = positionWorld.xz.sub(vec2(BASEMENT.ox, BASEMENT.oz));
  const slab = fract(lp.div(2));
  const seam = step(slab.x, 0.015).max(step(slab.y, 0.015));
  const grit = fbm(lp.mul(1.7)).mul(0.35).add(0.8);
  const damp = fbm(lp.mul(0.22).add(vec2(3.1, 7.4))).smoothstep(0.52, 0.66);
  const concrete = vec3(0.16, 0.155, 0.17).mul(grit);
  m.colorNode = mix(mix(concrete, concrete.mul(0.45), damp), vec3(0.035, 0.035, 0.04), seam);
  m.outputNode = Fn(() => {
    const st = texture(tiles, floor(lp).add(0.5).div(vec2(BASEMENT.w, BASEMENT.h)));
    return vec4(tileOverlay(output.rgb, st, fract(lp), globalUniforms.uAccent), output.a);
  })();
  return m;
}
