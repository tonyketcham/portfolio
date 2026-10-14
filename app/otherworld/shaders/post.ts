/**
 * The render pipeline (WebGPU / TSL).
 *
 *  1. The scene renders into a low-res, nearest-filtered pass with an extra
 *     normal target (MRT). That's the chunky old-school pixel.
 *  2. Pixel-art outlines: depth silhouettes darken, convex creases catch a
 *     highlight, computed per scene pixel from depth + normals.
 *  3. The Modyfi stack: the visitor's ordered effects, composed as a node
 *     chain. Reordering / toggling rebuilds the chain; amounts are uniforms.
 *     Some layers bend *where* the frame is sampled (kaleido, melt, liquify),
 *     one feeds the frame back into itself (echo), the rest recolour it.
 *  4. Mushroom warp, unfold glitch, VHS rewind, dithered location fades.
 *
 * Works on both WebGPU and the WebGL2 fallback backend.
 */
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { afterImage } from 'three/examples/jsm/tsl/display/AfterImageNode.js';
import {
  Fn,
  abs,
  atan,
  cos,
  dot,
  float,
  floor,
  fract,
  int,
  mix,
  mod,
  mrt,
  normalView,
  output,
  pass,
  perspectiveDepthToViewZ,
  screenCoordinate,
  screenUV,
  select,
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
import { bayer4, falloff, gradient3, hash12, hueShift, luma, rot2, v3, vnoise, type F, type V2, type V3, type V4 } from './common';

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
      echo: amountUniform(),
      melt: amountUniform(),
      liquify: amountUniform(),
      pixelsort: amountUniform(),
      ascii: amountUniform(),
      neon: amountUniform(),
      thermal: amountUniform(),
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
    /** How long the echo's ghosts hang around (0.8 … 0.97). */
    echoDamp: uniform(0.9),
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
/** The stack works on sRGB values, so its constant colours are sRGB triples too. */
const srgb3 = (hex: string) => {
  const c = new THREE.Color(hex).convertLinearToSRGB();
  return vec3(c.r, c.g, c.b);
};

/** Layers that move where the frame is sampled rather than recolouring it. */
const UV_EFFECTS = new Set<EffectId>(['kaleido', 'melt', 'liquify']);
/** Layers handled outside the recolour chain. */
const SOURCE_EFFECTS = new Set<EffectId>(['chroma', 'echo']);

/** 5×5 glyph bitmaps, darkest → brightest, packed into ints (bit = row * 5 + col). */
const GLYPHS = [
  ['.....', '.....', '.....', '.....', '.....'],
  ['.....', '.....', '..#..', '.....', '.....'],
  ['.....', '..#..', '.....', '..#..', '.....'],
  ['.....', '..#..', '.###.', '..#..', '.....'],
  ['.....', '.#.#.', '..#..', '.#.#.', '.....'],
  ['.....', '.###.', '.###.', '.###.', '.....'],
  ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'],
  ['.###.', '#...#', '#.###', '#.##.', '.###.'],
  ['#####', '#####', '#####', '#####', '#####'],
].map((rows) => rows.join('').split('').reduce((bits, ch, i) => (ch === '#' ? bits | (1 << i) : bits), 0));

/** Heat camera: cold → hot. */
const THERMAL = ['#05030f', '#2a0b5e', '#8a1d8f', '#e0393e', '#f8902c', '#fde68a', '#ffffff'].map(srgb3);

/** Piecewise-linear ramp through evenly spaced stops. */
const ramp = (t: F, stops: V3[]) => {
  const n = stops.length - 1;
  const c = stops[0].toVar();
  for (let i = 0; i < n; i++) c.assign(mix(c, stops[i + 1], t.mul(n).sub(i).clamp(0, 1)));
  return c;
};

export interface StackCtx {
  /** Screen position in CSS pixels. */
  px: V2;
  /** Integer scene-pixel coordinate. */
  spx: V2;
  /** The (already warped) sampling uv. */
  uv: V2;
}

export function createPost(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const P = createPostUniforms();
  const U = globalUniforms;
  const scenePass = pass(scene, camera, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
  scenePass.setMRT(mrt({ output, normal: normalView.mul(0.5).add(0.5) }));
  const colorTex = scenePass.getTextureNode('output');
  const normalTex = scenePass.getTextureNode('normal');
  const depthTex = scenePass.getTextureNode('depth');
  // Feedback buffer for the echo layer; only rendered while echo is in the graph.
  const echo = afterImage(colorTex, P.echoDamp);
  const echoTex = echo.getTextureNode();

  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;

  const texel = vec2(1).div(P.sceneRes);
  const viewZ = (uv: V2) => perspectiveDepthToViewZ(depthTex.sample(uv).r, P.near, P.far).negate();
  const nrm = (uv: V2) => normalTex.sample(uv).rgb.mul(2).sub(1);
  const snap = (q: V2) => floor(q.clamp(0.0005, 0.9995).mul(P.sceneRes)).add(0.5).div(P.sceneRes);

  /** Rebuilt with the graph: echo swaps the scene source for its feedback buffer. */
  let source = (uv: V2): V3 => colorTex.sample(uv).rgb;
  const sceneAt = (uv: V2) => sceneSRGB(source(uv));

  /** Scene colour (sRGB) with pixel-art outlines, at a snapped scene-pixel uv. */
  const shaded = (uv: V2) => {
    const c = sceneAt(uv).toVar();
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

  /** Depth discontinuity around a uv, `reach` scene pixels out. Both sides count, unlike the outline. */
  const edgeAt = (uv: V2, reach: number) => {
    const d0 = viewZ(uv);
    const e = float(0).toVar();
    for (const o of [vec2(1, 0), vec2(-1, 0), vec2(0, 1), vec2(0, -1)]) {
      e.addAssign(abs(viewZ(uv.add(o.mul(texel).mul(reach))).sub(d0)).div(d0.max(0.5)).sub(0.02).max(0).mul(14));
    }
    return e.clamp(0, 1);
  };

  const dotScreen = (px: V2, angle: F | number, value: F) => {
    const q = rot2(angle).mul(px).div(P.cell);
    const f = fract(q).sub(0.5);
    const r = value.clamp(0, 1).sqrt().mul(0.7);
    return falloff(f.length(), r.sub(0.08), r.add(0.08));
  };

  const uvEffects: Record<'kaleido' | 'melt' | 'liquify', (uv: V2) => V2> = {
    kaleido: (uv) => {
      const aspect = P.res.x.div(P.res.y);
      const c = uv.sub(0.5).mul(vec2(aspect, 1));
      const seg = Math.PI / 3;
      const a = abs(mod(atan(c.y, c.x).add(U.uTime.mul(0.05)), seg * 2).sub(seg));
      const k = vec2(cos(a), sin(a)).mul(c.length()).div(vec2(aspect, 1)).add(0.5);
      return mix(uv, k, P.amount.kaleido);
    },
    // Columns of the frame slide down at their own pace, like wet paint.
    melt: (uv) => {
      const col = floor(uv.x.mul(P.sceneRes.x).div(3));
      const h = hash12(vec2(col, 7.3));
      const drip = h.mul(h).mul(0.22).add(0.02).mul(sin(U.uTime.mul(0.5).add(h.mul(6.28))).mul(0.5).add(0.5));
      // drips get heavier toward the bottom of the screen
      const sag = drip.mul(uv.y.mul(0.8).add(0.2));
      return vec2(uv.x, uv.y.sub(sag.mul(P.amount.melt)));
    },
    // Noise flow plus a ripple out from the middle (where you're standing).
    liquify: (uv) => {
      const a = P.amount.liquify;
      const t = U.uTime.mul(0.35);
      const q = uv.mul(vec2(P.res.x.div(P.res.y), 1)).mul(3.5);
      const flow = vec2(vnoise(q.add(vec2(t, 0))), vnoise(q.add(vec2(5.2, t.negate())))).sub(0.5);
      const c = uv.sub(0.5).mul(vec2(P.res.x.div(P.res.y), 1));
      const r = c.length();
      const ripple = sin(r.mul(46).sub(U.uTime.mul(5))).mul(falloff(r, 0.05, 0.6)).mul(0.006);
      return uv.add(flow.mul(0.05).mul(a)).add(c.div(r.max(0.001)).mul(ripple).mul(a));
    },
  };

  const effects: Record<Exclude<EffectId, 'chroma' | 'echo' | 'kaleido' | 'melt' | 'liquify'>, (c: V3, x: StackCtx) => V3> = {
    halftone: (c, { px }) => {
      const a = P.amount.halftone;
      const h = vec3(dotScreen(px, P.angle, c.r), dotScreen(px, P.angle.add(0.52), c.g), dotScreen(px, P.angle.add(1.05), c.b));
      return mix(c, h.mul(c.mul(0.4).add(0.6)).add(c.mul(0.15)), a);
    },
    dither: (c, { spx }) => {
      const L = P.ditherLevels.sub(1);
      return mix(c, floor(c.mul(L).add(bayer4(spx))).div(L), P.amount.dither);
    },
    gradient: (c) => mix(c, gradient3(luma(c).clamp(0, 1), v3(P.gradA), v3(P.gradB), v3(P.gradC)), P.amount.gradient),
    posterize: (c) => mix(c, floor(c.mul(P.posterLevels).add(0.5)).div(P.posterLevels), P.amount.posterize),
    crt: (c, { px }) => {
      const a = P.amount.crt;
      const line = sin(px.y.mul(Math.PI).mul(P.scan)).mul(0.5).add(0.5);
      const mask = sin(px.x.mul(Math.PI * 0.66)).mul(0.5).add(0.5);
      const k = c.mul(float(1).sub(a.mul(0.3).mul(line))).mul(float(1).sub(a.mul(0.08).mul(mask)));
      return k.add(k.mul(k).mul(a.mul(0.04)));
    },
    // Bright pixels bleed downward in streaks, column by column.
    pixelsort: (c, { uv, spx }) => {
      const a = P.amount.pixelsort;
      const len = hash12(vec2(spx.x, 1.7)).mul(0.6).add(0.4).mul(a).mul(3);
      const acc = c.toVar();
      const steps = 10;
      for (let k = 1; k <= steps; k++) {
        const s = sceneAt(snap(uv.sub(vec2(0, texel.y.mul(k * k * 0.5).mul(len)))));
        const w = luma(s).smoothstep(0.55, 0.75).mul(1 - k / (steps + 1));
        acc.assign(acc.max(s.mul(w)));
      }
      return mix(c, acc, a);
    },
    // The frame as text: each 12 px cell becomes a glyph picked by its brightness.
    ascii: (c, { px }) => {
      const cellPx = 12;
      const cell = floor(px.div(cellPx));
      const centre = cell.add(0.5).mul(cellPx).mul(P.dpr).div(P.res);
      const src = sceneAt(snap(centre));
      // sqrt lifts the shadows so night scenes still read as text
      const level = luma(src).clamp(0, 0.999).sqrt().mul(GLYPHS.length);
      let glyph: Node<'int'> = int(GLYPHS[GLYPHS.length - 1]);
      for (let i = GLYPHS.length - 2; i >= 0; i--) glyph = select(level.lessThan(i + 1), int(GLYPHS[i]), glyph);
      // 2 px glyph pixels with a 1 px gutter round the cell
      const g = floor(fract(px.div(cellPx)).mul(cellPx).sub(1).div(2));
      const inside = step(0, g.x).mul(step(g.x, 4)).mul(step(0, g.y)).mul(step(g.y, 4));
      const bit = float(glyph.shiftRight(int(g.y.mul(5).add(g.x).clamp(0, 24))).bitAnd(1)).mul(inside);
      const ink = src.mul(1.25).add(0.08).clamp(0, 1);
      return mix(c, mix(src.mul(0.08), ink, bit), P.amount.ascii);
    },
    // Silhouettes light up in cycling neon over a darkened frame.
    neon: (c, { uv }) => {
      const a = P.amount.neon;
      const edge = edgeAt(uv, 1).add(edgeAt(uv, 3).mul(0.45)).clamp(0, 1.4);
      const hue = U.uTime.mul(0.8).add(uv.x.mul(4)).add(uv.y.mul(2.5)).add(viewZ(uv).mul(0.08));
      const tube = hueShift(vec3(1, 0.15, 0.75), hue);
      return mix(c, c.mul(0.22).add(tube.mul(edge).mul(1.4)), a);
    },
    // Heat camera: brightness plus nearness.
    thermal: (c, { uv }) => {
      const near = float(1).sub(viewZ(uv).smoothstep(3, 45));
      const heat = luma(c).mul(0.75).add(near.mul(0.35)).clamp(0, 1);
      return mix(c, ramp(heat, THERMAL), P.amount.thermal);
    },
  };

  function build(stack: EffectLayer[]) {
    const order = stack.filter((l) => l.enabled).map((l) => l.id);
    source = order.includes('echo')
      ? (uv) => mix(colorTex.sample(uv).rgb, echoTex.sample(uv).rgb, P.amount.echo)
      : (uv) => colorTex.sample(uv).rgb;

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

      // Sampling warps, in stack order.
      for (const id of order) {
        if (UV_EFFECTS.has(id)) uv.assign(uvEffects[id as keyof typeof uvEffects](uv));
      }

      // Snap to scene pixels, then chromatic split (sampling-time), stronger toward edges.
      const chroma = P.amount.chroma.add(U.uMushroom.mul(0.6)).add(P.rewind.mul(0.8));
      const off = uv.sub(0.5).mul(chroma.mul(0.009).mul(P.spread));
      const base = shaded(snap(uv)).toVar();
      const col = vec3(
        mix(base.r, sceneAt(snap(uv.add(off))).r, step(0.0001, chroma)),
        base.g,
        mix(base.b, sceneAt(snap(uv.sub(off))).b, step(0.0001, chroma))
      ).toVar();

      const ctx: StackCtx = { px: screenCoordinate.xy.div(P.dpr), spx: floor(uv.mul(P.sceneRes)), uv: snap(uv) };
      for (const id of order) {
        if (UV_EFFECTS.has(id) || SOURCE_EFFECTS.has(id)) continue;
        col.assign(effects[id as keyof typeof effects](col, ctx));
      }

      const vig = uv.sub(0.5).mul(vec2(aspect, 1)).length().mul(1.15).smoothstep(0.35, 1.05);
      col.mulAssign(float(1).sub(P.vignette.mul(vig)));
      col.addAssign(hash12(screenCoordinate.xy.add(fract(U.uTime).mul(91.7))).sub(0.5).mul(P.grain));
      col.assign(mix(col, vec3(1), P.flash));
      col.assign(mix(col, vec3(luma(col)).mul(vec3(0.85, 0.95, 1.1)), P.rewind.mul(0.35)));
      // Location change: ordered-dither the frame into the void.
      const fadeMask = step(bayer4(ctx.spx), P.fade.mul(1.02));
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
    dispose() {
      echo.dispose();
      pipeline.dispose();
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
  const echo = effects.find((l) => l.id === 'echo');
  P.echoDamp.value = 0.8 + 0.17 * (echo?.amount ?? 0);
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
