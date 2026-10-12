/** Run with `node scripts/wall-sections-check.mjs`. Exercises the production
 * section topology at moving cut heights, including exact slab boundaries. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../app/otherworld/house/wallSections.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } });
const { wallSectionFaces } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const box = (lo, hi, surface = 'stone') => ({ lo, hi, surface });
const fixtures = [
  [box([0, 0, -.12], [8, 2.6, .12]), box([0, 2.5, -.15], [8, 2.6, .15], 'trim')],
  // Window: overlapping sill, jambs, lintel and cornice.
  [box([0, 0, -.12], [3, 2.6, .12]), box([5, 0, -.12], [8, 2.6, .12]),
    box([3, 0, -.12], [5, .85, .12]), box([3, 2, -.12], [5, 2.6, .12]),
    box([2.94, .8, -.2], [5.06, .88, .2], 'trim'),
    box([2.94, .85, -.16], [3.05, 2, .16], 'trim'),
    box([4.95, .85, -.16], [5.06, 2, .16], 'trim'),
    box([2.94, 1.97, -.16], [5.06, 2.06, .16], 'trim'),
    box([0, 2.5, -.15], [8, 2.6, .15], 'trim')],
  // Door: a lintel wholly above the cut must not leave a collapsed bottom.
  [box([0, 0, -.12], [3, 2.6, .12]), box([5, 0, -.12], [8, 2.6, .12]),
    box([3, 2.2, -.12], [5, 2.6, .12]), box([2.9, 0, -.17], [3.02, 2.28, .17], 'wood'),
    box([4.98, 0, -.17], [5.1, 2.28, .17], 'wood'), box([2.9, 2.18, -.17], [5.1, 2.3, .17], 'wood'),
    box([0, 2.5, -.15], [8, 2.6, .15], 'trim')],
];

let checks = 0;
for (const boxes of fixtures) {
  const faces = wallSectionFaces(boxes);
  // All quads wind outward and have positive area before clipping.
  for (const f of faces) {
    const [a, b, c] = f.corners;
    const u = b.map((v, i) => v - a[i]), v = c.map((w, i) => w - a[i]);
    const cross = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    assert(cross.reduce((s, n, i) => s + n * f.normal[i], 0) > 0);
  }
  const levels = [...new Set(boxes.flatMap((b) => [b.lo[1], b.hi[1]]))].sort((a, b) => a - b);
  const heights = [...levels, ...levels.slice(1).map((h, i) => (h + levels[i]) / 2), .1, .55, 1.402];
  const xs = [...new Set(boxes.flatMap((b) => [b.lo[0], b.hi[0]]))].sort((a, b) => a - b);
  const zs = [...new Set(boxes.flatMap((b) => [b.lo[2], b.hi[2]]))].sort((a, b) => a - b);
  for (const height of heights) {
    const visible = faces.filter((f) => height > f.lower && (!f.internalTop || height <= f.upper));
    const caps = visible.filter((f) => f.normal[1] === 1 && height <= f.upper);
    // At every footprint cell there is precisely one cap iff the solid exists
    // immediately below the plane. Compare with the original boxes' union.
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const x = (xs[i] + xs[i+1]) / 2, z = (zs[j] + zs[j+1]) / 2;
      const occupied = boxes.some((b) => x > b.lo[0] && x < b.hi[0] && z > b.lo[2] && z < b.hi[2] && height > b.lo[1] && height <= b.hi[1]);
      const count = caps.filter((f) => {
        const cx = f.corners.map((p) => p[0]), cz = f.corners.map((p) => p[2]);
        return x > Math.min(...cx) && x < Math.max(...cx) && z > Math.min(...cz) && z < Math.max(...cz);
      }).length;
      assert.equal(count, Number(occupied), `cap ownership at ${x},${height},${z}`);
      checks++;
    }
    for (const f of visible) assert(height > f.lower, 'collapsed slab survived');
  }
}
console.log(`Wall sections: ${checks} cap ownership checks passed (cornice, window, door; cutaway/build heights and boundaries).`);
