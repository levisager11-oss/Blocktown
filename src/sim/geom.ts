// Geometry for curved roads and building plots, all in the flat x/z plane.

/** A point on a curve from p0 to p1 that bends towards c (a quadratic Bezier curve). */
export function bezX(p0: number, c: number, p1: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * c + t * t * p1;
}

/** Rough length of a curve, by walking along it. */
export function bezLength(x0: number, z0: number, cx: number, cz: number, x1: number, z1: number): number {
  let len = 0, px = x0, pz = z0;
  for (let i = 1; i <= 16; i++) {
    const t = i / 16, x = bezX(x0, cx, x1, t), z = bezX(z0, cz, z1, t);
    len += Math.hypot(x - px, z - pz);
    px = x; pz = z;
  }
  return len;
}

/** The part of a curve between t0 and t1, as its own curve: [x0, z0, cx, cz, x1, z1]. */
export function bezPart(x0: number, z0: number, cx: number, cz: number, x1: number, z1: number, t0: number, t1: number): number[] {
  // The control point of a part of a quadratic curve is where the two end tangents meet.
  const ax = bezX(x0, cx, x1, t0), az = bezX(z0, cz, z1, t0);
  const bx = bezX(x0, cx, x1, t1), bz = bezX(z0, cz, z1, t1);
  const u0 = 1 - t0, u1 = 1 - t1;
  const ncx = u0 * u1 * x0 + (u0 * t1 + t0 * u1) * cx + t0 * t1 * x1;
  const ncz = u0 * u1 * z0 + (u0 * t1 + t0 * u1) * cz + t0 * t1 * z1;
  return [ax, az, ncx, ncz, bx, bz];
}

/** Where two straight pieces cross: how far along each (0 to 1), or null. */
export function crossing(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): { t: number; u: number } | null {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Distance from a point to a straight piece, and how far along the piece the nearest spot is. */
export function distToPiece(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d: number; f: number } {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let f = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  return { d: Math.hypot(px - (ax + dx * f), pz - (az + dz * f)), f };
}

/** A rectangle that can be turned: centre, direction (angle of its front), width and depth. */
export interface Box { x: number; z: number; ang: number; w: number; d: number }

/** Distance from a point to a turned rectangle (0 inside it). */
export function distToBox(px: number, pz: number, b: Box, grow = 0): number {
  const c = Math.cos(b.ang), s = Math.sin(b.ang);
  const dx = px - b.x, dz = pz - b.z;
  // Local axes: "side" runs along the road, "front" points to the road.
  const lx = Math.abs(dx * c + dz * s) - b.w / 2 - grow;
  const lz = Math.abs(-dx * s + dz * c) - b.d / 2 - grow;
  const ox = Math.max(lx, 0), oz = Math.max(lz, 0);
  return Math.hypot(ox, oz);
}

export function boxCorners(b: Box, grow = 0): number[] {
  const c = Math.cos(b.ang), s = Math.sin(b.ang);
  const hw = b.w / 2 + grow, hd = b.d / 2 + grow;
  const out: number[] = [];
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    out.push(b.x + c * u * hw - s * v * hd, b.z + s * u * hw + c * v * hd);
  }
  return out;
}

/** Do two turned rectangles overlap? (Separating axes.) `shrink` lets them touch a little. */
export function boxesOverlap(a: Box, b: Box, shrink = 0): boolean {
  const ca = boxCorners(a, -shrink), cb = boxCorners(b, -shrink);
  const axes = [Math.cos(a.ang), Math.sin(a.ang), -Math.sin(a.ang), Math.cos(a.ang), Math.cos(b.ang), Math.sin(b.ang), -Math.sin(b.ang), Math.cos(b.ang)];
  for (let i = 0; i < 8; i += 2) {
    const ax = axes[i], az = axes[i + 1];
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (let k = 0; k < 8; k += 2) {
      const pa = ca[k] * ax + ca[k + 1] * az, pb = cb[k] * ax + cb[k + 1] * az;
      if (pa < amin) amin = pa;
      if (pa > amax) amax = pa;
      if (pb < bmin) bmin = pb;
      if (pb > bmax) bmax = pb;
    }
    if (amax <= bmin || bmax <= amin) return false;
  }
  return true;
}

/** The radius of the circle around a turned rectangle. */
export const boxRadius = (b: Box) => Math.hypot(b.w, b.d) / 2;
