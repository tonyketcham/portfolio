/**
 * 8-directional A* over a tile grid, old-school style: diagonals are allowed
 * only when both orthogonal neighbours are free (no corner cutting). Works on
 * any Grid: the island's heightfield tiles or the house's rooms (whose walls
 * sit on tile edges, so steps are checked edge by edge).
 */
export type TilePos = [number, number];

export interface Grid {
  width: number;
  height: number;
  inBounds(i: number, j: number): boolean;
  walkable(i: number, j: number): boolean;
  /** Can you step from (i, j) by (di, dj)? Must include the target's walkability. */
  canStep(i: number, j: number, di: number, dj: number): boolean;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

const octile = (ai: number, aj: number, bi: number, bj: number) => {
  const dx = Math.abs(ai - bi);
  const dy = Math.abs(aj - bj);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
};

/** Binary min-heap keyed by f-score; stores tile indices. */
class Heap {
  private items: number[] = [];
  constructor(private score: Float32Array) {}
  get size() {
    return this.items.length;
  }
  push(v: number) {
    const a = this.items;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Returns the tiles to step through (excluding `from`). If `to` is blocked the
 * path ends on the reachable tile nearest to it, like clicking a tree.
 */
export function findPath(grid: Grid, from: TilePos, to: TilePos, maxNodes = 6000): TilePos[] {
  if (!grid.inBounds(to[0], to[1]) || !grid.inBounds(from[0], from[1])) return [];
  const W = grid.width;
  const tileIndex = (i: number, j: number) => j * W + i;
  const n = W * grid.height;
  const g = new Float32Array(n).fill(Infinity);
  const f = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = tileIndex(from[0], from[1]);
  const goalWalkable = grid.walkable(to[0], to[1]);

  g[start] = 0;
  f[start] = octile(from[0], from[1], to[0], to[1]);
  const open = new Heap(f);
  open.push(start);

  let best = start;
  let bestH = f[start];
  let visited = 0;

  while (open.size && visited++ < maxNodes) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % W;
    const cj = (cur / W) | 0;
    const h = octile(ci, cj, to[0], to[1]);
    if (h < bestH) {
      bestH = h;
      best = cur;
    }
    if (ci === to[0] && cj === to[1]) {
      best = cur;
      break;
    }
    // Reached the tile adjacent to a blocked target: good enough.
    if (!goalWalkable && Math.max(Math.abs(ci - to[0]), Math.abs(cj - to[1])) <= 1) {
      best = cur;
      break;
    }
    for (const [di, dj, cost] of DIRS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (!grid.canStep(ci, cj, di, dj)) continue;
      const k = tileIndex(ni, nj);
      if (closed[k]) continue;
      const tentative = g[cur] + cost;
      if (tentative < g[k]) {
        g[k] = tentative;
        came[k] = cur;
        f[k] = tentative + octile(ni, nj, to[0], to[1]);
        open.push(k);
      }
    }
  }

  const path: TilePos[] = [];
  let k = best;
  while (k !== start && k !== -1) {
    path.push([k % W, (k / W) | 0]);
    k = came[k];
  }
  return path.reverse();
}
