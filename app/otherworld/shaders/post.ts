/**
 * The render pipeline (WebGPU / TSL).
 *
 *  1. The scene renders into a low-res, nearest-filtered pass with an extra
 *     normal target (MRT). That's the chunky old-school pixel.
 *  2. Pixel-art outlines: depth silhouettes darken, convex creases catch a
 *     highlight, computed per scene pixel from depth + normals.
 *  3. The Modyfi stack: the visitor's ordered effects, composed as a node
 *     chain. Reordering / toggling rebuilds the chain; amounts are uniforms.
 *  4. Mushroom warp, unfold glitch, VHS rewind, dithered location fades.
 *
 * Works on both WebGPU and the WebGL2 fallback backend.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  atan,
  cos,
  dot,
  float,
  floor,
  fract,
  mix,
  mod,
  mrt,
  normalView,
  output,
  pass,
  perspectiveDepthToViewZ,
  screenCoordinate,
  screenUV,
  sin,
  sRGBTransferOETF,
  step,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { Tweaks } from '../debug/tweaks';
import { globalUniforms } from '../scene/globals';
import type { EffectId, EffectLayer } from '../state/effects';
import { bayer4, falloff, gradient3, hash12, luma, rot2, v3, type F, type V2, type V3, type V4 } from './common';

const amountUniform = () => uniform(0);

export function createPostUniforms() {
  return {
    sceneRes: uniform(new THREE.Vector2(1, 1)),
    res: uniform(new THREE.Vector2(1, 1)),
    dpr: uniform(1),
    near: uniform(0.1),
    far: uniform(700),
    // outlines
    outline: uniform(0.55),
    crease: uniform(0.35),
    outlineColor: uniform(new THREE.Color('#0b0a12')),
    // stack amounts (by effect id) + params
    amount: {
      halftone: amountUniform(),
      dither: amountUniform(),
      gradient: amountUniform(),
      posterize: amountUniform(),
      chroma: amountUniform(),
      crt: amountUniform(),
      kaleido: amountUniform(),
    } satisfies Record<EffectId, ReturnType<typeof amountUniform>>,
    cell: uniform(5),
    angle: uniform(0.4),
    ditherLevels: uniform(6),
    posterLevels: uniform(5),
    scan: uniform(1),
    spread: uniform(1),
    gradA: uniform(new THREE.Color()),
    gradB: uniform(new THREE.Color()),
    gradC: uniform(new THREE.Color()),
    grain: uniform(0.05),
    vignette: uniform(0.3),
    glitch: uniform(0),
    rewind: uniform(0),
    flash: uniform(0),
    /** 0 → 1 dithers the frame out to the void (location changes). */
    fade: uniform(0),
  };
}
export type PostUniforms = ReturnType<typeof createPostUniforms>;

const sceneSRGB = (c: V3) => (sRGBTransferOETF(vec4(c, 1)) as V4).rgb;

export function createPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const P = createPostUniforms();
  const U = globalUniforms;
  const scenePass = pass(scene, camera, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
  scenePass.setMRT(mrt({ output, normal: normalView.mul(0.5).add(0.5) }));
  const colorTex = scenePass.getTextureNode('output');
  const normalTex = scenePass.getTextureNode('normal');
  const depthTex = scenePass.getTextureNode('depth');

  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;

  const texel = vec2(1).div(P.sceneRes);
  const viewZ = (uv: V2) => perspectiveDepthToViewZ(depthTex.sample(uv).r, P.near, P.far).negate();
  const nrm = (uv: V2) => normalTex.sample(uv).rgb.mul(2).sub(1);

  /** Scene colour (sRGB) with pixel-art outlines, at a snapped scene-pixel uv. */
  const shaded = (uv: V2) => {
    const c = sceneSRGB(colorTex.sample(uv).rgb).toVar();
    const d0 = viewZ(uv);
    const n0 = nrm(uv);
    const offs = [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1)];
    const depthEdge = float(0).toVar();
    const creaseEdge = float(0).toVar();
    for (const o of offs) {
      const uvn = uv.add(o.mul(texel));
      const dn = viewZ(uvn);
      // silhouette: a neighbour noticeably further away
      depthEdge.addAssign(dn.sub(d0).div(d0.max(0.5)).sub(0.035).max(0).mul(18).clamp(0, 1));
      // crease: normals diverge while depth stays close, only on the lit side
      const nn = nrm(uvn);
      const nd = float(1).sub(dot(n0, nn)).clamp(0, 1);
      const sameSurface = step(abs(dn.sub(d0)).div(d0.max(0.5)), 0.03);
      const bias = step(0, dot(n0.sub(nn), vec3(-0.6, 0.8, 0.4)));
      creaseEdge.addAssign(nd.mul(sameSurface).mul(bias));
    }
    const de = depthEdge.min(1).mul(P.outline);
    const ce = creaseEdge.smoothstep(0.08, 0.4).mul(P.crease).mul(float(1).sub(de));
    const outlined = mix(c, mix(c.mul(0.35), v3(P.outlineColor), 0.35), de);
    return outlined.add(outlined.mul(ce).mul(0.55)).add(vec3(ce.mul(0.04)));
  };

  const dotScreen = (px: V2, angle: F | number, value: F) => {
    const q = rot2(angle).mul(px).div(P.cell);
    const f = fract(q).sub(0.5);
    const r = value.clamp(0, 1).sqrt().mul(0.7);
    return falloff(f.length(), r.sub(0.08), r.add(0.08));
  };

  const effects: Record<Exclude<EffectId, 'chroma' | 'kaleido'>, (c: V3, px: V2, spx: V2) => V3> = {
    halftone: (c, px) => {
      const a = P.amount.halftone;
      const h = vec3(dotScreen(px, P.angle, c.r), dotScreen(px, P.angle.add(0.52), c.g), dotScreen(px, P.angle.add(1.05), c.b));
      return mix(c, h.mul(c.mul(0.4).add(0.6)).add(c.mul(0.15)), a);
    },
    dither: (c, _px, spx) => {
      const L = P.ditherLevels.sub(1);
      return mix(c, floor(c.mul(L).add(bayer4(spx))).div(L), P.amount.dither);
    },
    gradient: (c) => mix(c, gradient3(luma(c).clamp(0, 1), v3(P.gradA), v3(P.gradB), v3(P.gradC)), P.amount.gradient),
    posterize: (c) => mix(c, floor(c.mul(P.posterLevels).add(0.5)).div(P.posterLevels), P.amount.posterize),
    crt: (c, px) => {
      const a = P.amount.crt;
      const line = sin(px.y.mul(Math.PI).mul(P.scan)).mul(0.5).add(0.5);
      const mask = sin(px.x.mul(Math.PI * 0.66)).mul(0.5).add(0.5);
      const k = c.mul(float(1).sub(a.mul(0.3).mul(line))).mul(float(1).sub(a.mul(0.08).mul(mask)));
      return k.add(k.mul(k).mul(a.mul(0.04)));
    },
  };

  function build(stack: EffectLayer[]) {
    const order = stack.filter((l) => l.enabled).map((l) => l.id);
    pipeline.outputNode = Fn(() => {
      const uv = screenUV.toVar();
      const aspect = P.res.x.div(P.res.y);

      // Unfold glitch: torn rows.
      const rows = hash12(vec2(floor(U.uTime.mul(12)), 3)).mul(30).add(18);
      const n = hash12(vec2(floor(uv.y.mul(rows)), floor(U.uTime.mul(24))));
      uv.x.addAssign(n.sub(0.5).mul(0.18).mul(P.glitch).mul(step(0.78, n)));
      // VHS rewind: wobble + tracking band.
      uv.x.addAssign(sin(uv.y.mul(48).add(U.uTime.mul(40))).mul(0.003).mul(P.rewind));
      const band = abs(fract(uv.y.sub(U.uTime.mul(1.7))).sub(0.5)).sub(0.42).smoothstep(0, 0.04);
      uv.x.addAssign(band.oneMinus().mul(0.02).mul(P.rewind));
      // Mushroom: the pixels breathe.
      const c0 = uv.sub(0.5);
      uv.addAssign(c0.mul(sin(U.uTime.mul(1.3).sub(c0.length().mul(9)))).mul(0.025).mul(U.uMushroom));
      uv.addAssign(vec2(sin(uv.y.mul(11).add(U.uTime.mul(1.7))), cos(uv.x.mul(9).sub(U.uTime.mul(1.2)))).mul(0.006).mul(U.uMushroom));

      if (order.includes('kaleido')) {
        const c = uv.sub(0.5).mul(vec2(aspect, 1));
        const seg = Math.PI / 3;
        const a = abs(mod(atan(c.y, c.x).add(U.uTime.mul(0.05)), seg * 2).sub(seg));
        const k = vec2(cos(a), sin(a)).mul(c.length()).div(vec2(aspect, 1)).add(0.5);
        uv.assign(mix(uv, k, P.amount.kaleido));
      }

      // Snap to scene pixels, then chromatic split (sampling-time), stronger toward edges.
      const snap = (q: V2) => floor(q.clamp(0.0005, 0.9995).mul(P.sceneRes)).add(0.5).div(P.sceneRes);
      const chroma = P.amount.chroma.add(U.uMushroom.mul(0.6)).add(P.rewind.mul(0.8));
      const off = uv.sub(0.5).mul(chroma.mul(0.009).mul(P.spread));
      const base = shaded(snap(uv)).toVar();
      const col = vec3(
        mix(base.r, sceneSRGB(colorTex.sample(snap(uv.add(off))).rgb).r, step(0.0001, chroma)),
        base.g,
        mix(base.b, sceneSRGB(colorTex.sample(snap(uv.sub(off))).rgb).b, step(0.0001, chroma))
      ).toVar();

      const px = screenCoordinate.xy.div(P.dpr);
      const spx = floor(uv.mul(P.sceneRes));
      for (const id of order) {
        if (id === 'chroma' || id === 'kaleido') continue;
        col.assign(effects[id](col, px, spx));
      }

      const vig = uv.sub(0.5).mul(vec2(aspect, 1)).length().mul(1.15).smoothstep(0.35, 1.05);
      col.mulAssign(float(1).sub(P.vignette.mul(vig)));
      col.addAssign(hash12(screenCoordinate.xy.add(fract(U.uTime).mul(91.7))).sub(0.5).mul(P.grain));
      col.assign(mix(col, vec3(1), P.flash));
      col.assign(mix(col, vec3(luma(col)).mul(vec3(0.85, 0.95, 1.1)), P.rewind.mul(0.35)));
      // Location change: ordered-dither the frame into the void.
      const fadeMask = step(bayer4(spx), P.fade.mul(1.02));
      col.assign(mix(col, vec3(0.035, 0.035, 0.043), fadeMask));
      return vec4(col.clamp(0, 1), 1);
    })();
    pipeline.needsUpdate = true;
  }

  return {
    pipeline,
    scenePass,
    uniforms: P,
    build,
    /** Fraction of the drawing buffer the scene renders at. */
    setPixelScale(scale: number) {
      scenePass.setResolutionScale(scale);
    },
    updateSizes(width: number, height: number, dpr: number, scale: number) {
      P.res.value.set(width * dpr, height * dpr);
      P.sceneRes.value.set(Math.max(1, Math.floor(width * dpr * scale)), Math.max(1, Math.floor(height * dpr * scale)));
      P.dpr.value = dpr;
    },
  };
}
export type Post = ReturnType<typeof createPost>;

/** Write the visitor's effect amounts + tweak params into the post uniforms. */
export function writeStackUniforms(
  P: PostUniforms,
  effects: EffectLayer[],
  worldness: number,
  stack: Tweaks['Modyfi stack'],
  palette?: [string, string, string] | null
) {
  for (const layer of effects) P.amount[layer.id].value = layer.enabled ? layer.amount * worldness : 0;
  P.grain.value = stack.grain * (0.4 + 0.6 * worldness);
  P.vignette.value = stack.vignette * worldness;
  P.cell.value = stack.halftone.cell;
  P.angle.value = stack.halftone.angle;
  P.ditherLevels.value = stack.dither.levels;
  P.posterLevels.value = stack.posterize.levels;
  P.scan.value = stack.scanlines.density;
  P.spread.value = stack.chroma.spread;
  const [dark, mid, light] = palette ?? [stack.gradientMap.dark, stack.gradientMap.mid, stack.gradientMap.light];
  // The gradient map works on sRGB values, so store sRGB triples.
  P.gradA.value.set(dark).convertLinearToSRGB();
  P.gradB.value.set(mid).convertLinearToSRGB();
  P.gradC.value.set(light).convertLinearToSRGB();
}

/** Stable key for the parts of the stack that change the node graph. */
export const stackKey = (effects: EffectLayer[]) =>
  effects
    .filter((l) => l.enabled)
    .map((l) => l.id)
    .join(',');

