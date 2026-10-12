/** Exact rectilinear union of a wall's masonry and trim, split at each height
 * where its footprint changes. The shader clips one slab at a time; internal
 * tops become section caps only while the cut passes through their slab. */
export type Point3 = [number, number, number];
export interface WallBox<T> {
  lo: Point3;
  hi: Point3;
  surface: T;
}
export interface WallFace<T> {
  corners: [Point3, Point3, Point3, Point3];
  normal: Point3;
  lower: number;
  upper: number;
  /** A top covered by the next slab, visible only as a moving section cap. */
  internalTop: boolean;
  surface: T;
}

export function wallSectionFaces<T>(boxes: WallBox<T>[]): WallFace<T>[] {
  if (!boxes.length) return [];
  const axes = [0, 1, 2].map((axis) =>
    [...new Set(boxes.flatMap((b) => [b.lo[axis], b.hi[axis]]))].sort((a, b) => a - b)
  );
  const [xs, ys, zs] = axes;
  const nx = xs.length - 1, ny = ys.length - 1, nz = zs.length - 1;
  const cells = new Int32Array(nx * ny * nz).fill(-1);
  const index = (x: number, y: number, z: number) => (y * nz + z) * nx + x;
  const owner = (x: number, y: number, z: number) =>
    x < 0 || x >= nx || y < 0 || y >= ny || z < 0 || z >= nz ? -1 : cells[index(x, y, z)];
  // Later trim owns occupied cells, preserving its authored material on the
  // exterior while removing all coincident/internal box faces.
  boxes.forEach((box, i) => {
    const lo = axes.map((a, k) => a.indexOf(box.lo[k]));
    const hi = axes.map((a, k) => a.indexOf(box.hi[k]));
    for (let y = lo[1]; y < hi[1]; y++)
      for (let z = lo[2]; z < hi[2]; z++)
        for (let x = lo[0]; x < hi[0]; x++) cells[index(x, y, z)] = i;
  });
  const faces: WallFace<T>[] = [];
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const i = owner(x, y, z);
    if (i < 0) continue;
    const x0 = xs[x], x1 = xs[x + 1], y0 = ys[y], y1 = ys[y + 1], z0 = zs[z], z1 = zs[z + 1];
    const face = (normal: Point3, corners: WallFace<T>['corners'], internalTop = false) =>
      faces.push({ normal, corners, lower: y0, upper: y1, internalTop, surface: boxes[i].surface });
    if (owner(x - 1, y, z) < 0) face([-1, 0, 0], [[x0,y0,z0], [x0,y0,z1], [x0,y1,z1], [x0,y1,z0]]);
    if (owner(x + 1, y, z) < 0) face([1, 0, 0], [[x1,y0,z1], [x1,y0,z0], [x1,y1,z0], [x1,y1,z1]]);
    if (owner(x, y, z - 1) < 0) face([0, 0, -1], [[x1,y0,z0], [x0,y0,z0], [x0,y1,z0], [x1,y1,z0]]);
    if (owner(x, y, z + 1) < 0) face([0, 0, 1], [[x0,y0,z1], [x1,y0,z1], [x1,y1,z1], [x0,y1,z1]]);
    if (owner(x, y - 1, z) < 0) face([0, -1, 0], [[x0,y0,z0], [x1,y0,z0], [x1,y0,z1], [x0,y0,z1]]);
    face([0, 1, 0], [[x0,y1,z1], [x1,y1,z1], [x1,y1,z0], [x0,y1,z0]], owner(x, y + 1, z) >= 0);
  }
  return faces;
}
