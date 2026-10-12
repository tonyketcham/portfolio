'use client';

/**
 * Art + label textures. Art is downscaled on load (≤1280px) so a forest of
 * pieces stays cheap on phones; labels are canvas-rendered text in the page's
 * own fonts.
 */
import * as THREE from 'three';

const MAX_ART = 1280;
const artCache = new Map<string, Promise<THREE.Texture>>();

export function loadArt(src: string): Promise<THREE.Texture> {
  const cached = artCache.get(src);
  if (cached) return cached;
  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      let source: HTMLImageElement | HTMLCanvasElement = img;
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (longest > MAX_ART) {
        const s = MAX_ART / longest;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * s);
        canvas.height = Math.round(img.naturalHeight * s);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        source = canvas;
      }
      const tex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.userData.naturalWidth = img.naturalWidth;
      tex.userData.naturalHeight = img.naturalHeight;
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => {
      // Don't cache failures: a network hiccup shouldn't blank the piece for the session.
      artCache.delete(src);
      reject(new Error(`Could not load ${src}`));
    };
    img.src = encodeURI(src);
  });
  artCache.set(src, promise);
  return promise;
}

export function cssFont(variable: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.body).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

export interface LabelOptions {
  font?: string;
  size?: number;
  color?: string;
  background?: string;
  padding?: number;
  radius?: number;
  weight?: string;
}

/** Renders a single line of text into a texture. Returns texture + world aspect. */
export function makeLabel(text: string, opts: LabelOptions = {}) {
  const size = opts.size ?? 64;
  const pad = opts.padding ?? 0;
  const font = `${opts.weight ?? '400'} ${size}px ${opts.font ?? cssFont('--font-chivo-mono', 'monospace')}`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + pad * 2 + 4);
  const h = Math.ceil(size * 1.35 + pad * 2);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    const r = opts.radius ?? 0;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = opts.color ?? '#848485';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad + 2, h / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { texture: tex, aspect: w / h };
}
