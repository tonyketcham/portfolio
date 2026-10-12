/** Paints the original homepage hero onto a canvas (the spawn floor + intro artboard). */
import * as THREE from 'three';
import { cssFont } from './textures';

/** Where the hero painting lies on the plaza, and its size in world units. */
export const HERO_CENTER = new THREE.Vector3(0, 0.2, 1.2);
export const HERO_SIZE = { w: 9, h: 5.625 };

export const HERO_W = 2048;
export const HERO_H = 1280;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function paintHero(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const mono = cssFont('--font-chivo-mono', 'ui-monospace, monospace');

  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, HERO_W, HERO_H);
  // soft radial lift + the classic site's dot grid
  const glow = ctx.createRadialGradient(HERO_W * 0.62, HERO_H * 0.42, 40, HERO_W * 0.62, HERO_H * 0.42, HERO_W * 0.6);
  glow.addColorStop(0, 'rgba(255,255,255,0.07)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, HERO_W, HERO_H);
  ctx.fillStyle = '#2a2a2e';
  for (let y = 16; y < HERO_H; y += 32) for (let x = 16; x < HERO_W; x += 32) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);

  // amanita portrait in its rounded frame
  const px = 150;
  const py = 300;
  const ps = 640;
  try {
    const portrait = await loadImage('/Amanita.webp');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(px, py, ps, ps, 150);
    ctx.clip();
    ctx.drawImage(portrait, px, py, ps, ps);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(px, py, ps, ps);
  }
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(px, py, ps, ps, 150);
  ctx.stroke();
  // containment guides
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, py + ps / 2);
  ctx.lineTo(px, py + ps / 2);
  ctx.moveTo(px + ps / 2, 0);
  ctx.lineTo(px + ps / 2, py);
  ctx.stroke();
  ctx.setLineDash([]);
  // "he / they" dimension pill
  ctx.font = `600 34px ${mono}`;
  const pill = 'he / they';
  const pw = ctx.measureText(pill).width + 36;
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.roundRect(px + ps / 2 - pw / 2, py + ps + 24, pw, 52, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(pill, px + ps / 2 - pw / 2 + 18, py + ps + 51);
  // handles
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 3;
  for (const [hx, hy] of [
    [px, py],
    [px + ps, py],
    [px, py + ps],
    [px + ps, py + ps],
  ]) {
    ctx.fillRect(hx - 9, hy - 9, 18, 18);
    ctx.strokeRect(hx - 9, hy - 9, 18, 18);
  }

  // the TONY wordmark, recoloured white
  try {
    const svg = await loadImage('/tony.svg');
    const lw = 1120;
    const lh = Math.round(lw * (157.03 / 304.88));
    const off = document.createElement('canvas');
    off.width = lw;
    off.height = lh;
    const o = off.getContext('2d')!;
    o.drawImage(svg, 0, 0, lw, lh);
    o.globalCompositeOperation = 'source-in';
    o.fillStyle = '#fafafa';
    o.fillRect(0, 0, lw, lh);
    ctx.drawImage(off, 860, 120);
  } catch {
    ctx.fillStyle = '#fafafa';
    ctx.font = `700 220px ${mono}`;
    ctx.fillText('Tony', 980, 380);
  }

  // the list
  const lines: [string, string, string][] = [
    ['.:', 'Design Engineer building design tools', '#fafafa'],
    [':.', 'Tea collector', '#848485'],
    [' .', 'Generative artist', '#848485'],
  ];
  ctx.font = `400 38px ${mono}`;
  lines.forEach(([dec, text, color], i) => {
    const y = 820 + i * 66;
    ctx.fillStyle = '#848485';
    ctx.fillText(dec, 1040, y);
    ctx.fillStyle = color;
    ctx.fillText(text, 1110, y);
  });

  // crop marks
  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 3;
  const m = 34;
  for (const [cx, cy, sx, sy] of [
    [0, 0, 1, 1],
    [HERO_W, 0, -1, 1],
    [0, HERO_H, 1, -1],
    [HERO_W, HERO_H, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * m, cy);
    ctx.lineTo(cx + sx * m, cy + sy * m * 0.6);
    ctx.moveTo(cx, cy + sy * m);
    ctx.lineTo(cx + sx * m * 0.6, cy + sy * m);
    ctx.stroke();
  }
}

