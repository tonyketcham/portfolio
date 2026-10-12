/**
 * The artwork material (TSL). One node graph for every framed piece:
 *  - cover-fits a texture (image / video poster / live video), or renders a
 *    seeded procedural pattern when there's no art yet
 *  - applies the piece's own mini "Modyfi stack" (displace, chroma, gradient
 *    map, halftone, dither, scanlines), all live-tweakable from the inspector
 *  - draws the design-tool frame border and hover/selection state
 *  - optional circular leafy mask (art-tree canopies), optional stained-glass
 *    leading (chapel windows)
 *
 * The pattern is chosen at build time (one pipeline per pattern), everything
 * else is a uniform.
 */
import * as THREE from 'three/webgpu';
import {
  Break,
  Fn,
  Loop,
  If,
  abs,
  atan,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  mod,
  screenCoordinate,
  sin,
  sqrt,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { ArtFx, ProceduralPattern } from '@/content/works';
import { globalUniforms } from '../scene/globals';
import { bayer4, falloff, fbm, gradient3, hash22, hueShift, luma, rot2, v3, vnoise, type F, type V2 } from './common';

export const PATTERN_CODES: Record<ProceduralPattern, number> = {
  'halftone-bloom': 0,
  contour: 1,
  moire: 2,
  flow: 3,
  kaleido: 4,
  dots: 5,
  fractal: 6,
};

const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
blank.needsUpdate = true;

export interface ArtMaterialOptions {
  seed: number;
  pattern?: ProceduralPattern;
  palette?: [string, string, string];
  fx?: ArtFx;
  circle?: boolean;
  /** Voronoi lead lines, for stained-glass windows. */
  leaded?: boolean;
  /** Lit by the scene (portraits on walls) instead of self-lit (screens). */
  lit?: boolean;
}

function artUniforms(opts: ArtMaterialOptions) {
  const pal = opts.palette ?? opts.fx?.palette ?? ['#09090b', '#3b82f6', '#fafafa'];
  return {
    map: texture(blank),
    uHasMap: uniform(0),
    uTexAspect: uniform(1.5),
    uSize: uniform(new THREE.Vector2(3, 2)),
    uSeed: uniform(opts.seed),
    uPalA: uniform(new THREE.Color(pal[0])),
    uPalB: uniform(new THREE.Color(pal[1])),
    uPalC: uniform(new THREE.Color(pal[2])),
    uHalftone: uniform(opts.fx?.halftone ?? 0),
    uDotScale: uniform(opts.fx?.dotScale ?? 6),
    uGradient: uniform(opts.fx?.gradient ?? 0),
    uDisplace: uniform(opts.fx?.displace ?? 0),
    uDither: uniform(opts.fx?.dither ?? 0),
    uChromaFx: uniform(opts.fx?.chroma ?? 0),
    uScan: uniform(opts.fx?.scan ?? 0),
    uFx: uniform(1),
    uHover: uniform(0),
    uSelected: uniform(0),
    uBreathe: uniform(1),
    uAccent: uniform(new THREE.Color('#3b82f6')),
    /** 0 = no frame border (e.g. framed by geometry already). */
    uBorder: uniform(1),
  };
}
export type ArtUniforms = ReturnType<typeof artUniforms>;

function procedural(code: number, p0: V2, u: ArtUniforms): F {
  const t = globalUniforms.uTime.mul(0.15).mul(u.uBreathe);
  const aspect = u.uSize.x.div(u.uSize.y);
  const p = p0.add(u.uSeed.mul(0.137));
  const centre = vec2(aspect.mul(0.5), 0.5);
  switch (code) {
    case 0: {
      const c = p.sub(centre);
      const f = fbm(p.mul(2).add(t));
      const cell = fract(p.mul(14)).sub(0.5);
      const size = float(0.55).sub(c.length().mul(0.6)).add(f.mul(0.35)).clamp(0, 0.5);
      return falloff(cell.length(), size.sub(0.05), size.add(0.05)).mul(f.mul(0.6).add(0.6));
    }
    case 1: {
      const h = fbm(p.mul(2.2).add(vec2(t, t.mul(-0.7))));
      return abs(fract(h.mul(9)).sub(0.5)).mul(2).smoothstep(0.42, 0.5).mul(0.8).add(h.mul(0.3));
    }
    case 2: {
      const a = sin(rot2(t.mul(0.2).add(0.1)).mul(p).x.mul(60));
      const b = sin(rot2(-0.12).mul(p).x.mul(62).add(t.mul(2)));
      return a.add(b).mul(0.25).add(0.5);
    }
    case 4: {
      const c = p.sub(centre);
      const seg = 6.2831 / 8;
      const a = abs(mod(atan(c.y, c.x).add(t), seg).sub(seg * 0.5));
      const k = vec2(a.cos(), a.sin()).mul(c.length());
      return fbm(k.mul(6).add(t));
    }
    case 5: {
      const g = p.mul(10);
      const cell = fract(g).sub(0.5);
      const w = sin(floor(g.x).mul(0.6).add(floor(g.y).mul(0.4)).add(globalUniforms.uTime.mul(1.2).mul(u.uBreathe))).mul(0.5).add(0.5);
      return falloff(cell.length(), w.mul(0.25).add(0.12), w.mul(0.25).add(0.16));
    }
    case 6: {
      const z = p.sub(centre).mul(2.6).toVar();
      const c = vec2(sin(t.mul(2)).mul(0.08).sub(0.75), t.mul(1.7).cos().mul(0.06).add(0.12));
      const trap = float(10).toVar();
      Loop(22, () => {
        z.assign(vec2(z.x.mul(z.x).sub(z.y.mul(z.y)), z.x.mul(z.y).mul(2)).add(c));
        trap.assign(min(trap, abs(z.y).add(abs(z.x).mul(0.2))));
        If(z.dot(z).greaterThan(16), () => {
          Break();
        });
      });
      return float(1).sub(trap.mul(1.6)).clamp(0, 1);
    }
    default: {
      const q = vec2(fbm(p.mul(1.6).add(t)), fbm(p.mul(1.6).sub(t).add(4)));
      return fbm(p.mul(1.8).add(q.mul(2.4)));
    }
  }
}

/** Voronoi cell-edge distance (for stained-glass leading). */
const voronoiEdge = Fn(([p]: [V2]) => {
  const n = floor(p);
  const f = fract(p);
  const d1 = float(8).toVar();
  const d2 = float(8).toVar();
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const g = vec2(i, j);
      const o = hash22(n.add(g));
      const r = g.add(o).sub(f);
      const d = r.dot(r);
      If(d.lessThan(d1), () => {
        d2.assign(d1);
        d1.assign(d);
      }).ElseIf(d.lessThan(d2), () => {
        d2.assign(d);
      });
    }
  }
  return sqrt(d2).sub(sqrt(d1));
});

export function createArtMaterial(opts: ArtMaterialOptions) {
  const u = artUniforms(opts);
  const U = globalUniforms;
  const code = PATTERN_CODES[opts.pattern ?? 'flow'];
  const m = (opts.lit
    ? new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide })
    : new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide })) as unknown as THREE.NodeMaterial & { uniforms: ArtUniforms };
  m.uniforms = u;

  if (opts.circle) {
    const c = uv().sub(0.5);
    const a = atan(c.y, c.x);
    const edge = sin(a.mul(9).add(u.uSeed)).mul(0.035).add(0.47).add(sin(a.mul(23).sub(U.uTime.mul(0.6).mul(u.uBreathe))).mul(0.025));
    const th = bayer4(screenCoordinate.xy);
    m.maskNode = c.length().lessThanEqual(edge.add(th.sub(0.5).mul(0.03)));
  }

  m.colorNode = Fn(() => {
    const fx = u.uFx;
    const uv0 = uv();
    const st = uv0
      .add(vec2(vnoise(uv0.mul(5).add(U.uTime.mul(0.3))), vnoise(uv0.mul(5).sub(U.uTime.mul(0.27)).add(9))).sub(0.5).mul(0.05).mul(u.uDisplace).mul(fx))
      .toVar();

    // cover-fit
    const planeAspect = u.uSize.x.div(u.uSize.y);
    const r = planeAspect.div(u.uTexAspect);
    const cu = vec2(
      r.greaterThan(1).select(st.x, st.x.sub(0.5).mul(r).add(0.5)),
      r.greaterThan(1).select(st.y.sub(0.5).div(r).add(0.5), st.y)
    );
    const off = vec2(0.006, 0).mul(u.uChromaFx).mul(fx);
    const img = vec3(u.map.sample(cu.add(off)).r, u.map.sample(cu).g, u.map.sample(cu.sub(off)).b);

    const pal = (x: F) => gradient3(x.clamp(0, 1), v3(u.uPalA), v3(u.uPalB), v3(u.uPalC));
    const proc = pal(procedural(code, st.mul(vec2(planeAspect, 1)), u));
    const col = mix(proc, img, u.uHasMap).toVar();

    col.assign(mix(col, pal(luma(col)), u.uGradient.mul(fx)));

    // halftone
    const g = rot2(0.5).mul(st.mul(u.uSize)).mul(float(40).div(max(1, u.uDotScale)));
    const cell = fract(g).sub(0.5);
    const rr = sqrt(luma(col).clamp(0, 1)).mul(0.62);
    const dotMask = falloff(cell.length(), rr.sub(0.07), rr.add(0.07));
    col.assign(mix(col, col.mul(dotMask).mul(1.25), u.uHalftone.mul(fx)));

    // dither
    const dp = floor(st.mul(u.uSize).mul(90));
    const dq = floor(col.mul(4).add(bayer4(dp))).div(4);
    col.assign(mix(col, dq, u.uDither.mul(fx)));

    // scanlines
    col.mulAssign(float(1).sub(u.uScan.mul(fx).mul(0.35).mul(sin(st.y.mul(u.uSize.y).mul(220)).mul(0.5).add(0.5))));

    if (opts.leaded) {
      const e = voronoiEdge(uv0.mul(u.uSize).mul(2.2).add(u.uSeed));
      const lead = falloff(e, 0.04, 0.09);
      col.assign(mix(col.mul(1.15), vec3(0.02, 0.018, 0.016), lead));
    }

    // Frame border (design-tool style), thicker + accent when hovered / selected.
    const e2 = uv0.min(uv0.oneMinus()).mul(u.uSize);
    const e = min(e2.x, e2.y);
    const sel = max(u.uHover, u.uSelected);
    if (opts.circle) {
      col.assign(mix(col, v3(u.uAccent), uv0.sub(0.5).length().smoothstep(0.38, 0.47).mul(sel).mul(0.9)));
    } else {
      const bw = mix(float(0.018), float(0.045), sel);
      const border = falloff(e, bw.sub(0.006), bw).mul(u.uBorder.max(sel));
      col.assign(mix(col, mix(vec3(0.02, 0.02, 0.024), v3(u.uAccent), sel), border));
    }

    // Screens glow a touch at night.
    if (!opts.lit) col.mulAssign(U.uNight.mul(0.15).add(1));
    col.assign(mix(col, hueShift(col, sin(U.uTime.add(u.uSeed)).mul(2)), U.uMushroom.mul(0.6)));
    return vec4(col, 1);
  })();
  return m;
}

export type ArtMaterial = ReturnType<typeof createArtMaterial>;
