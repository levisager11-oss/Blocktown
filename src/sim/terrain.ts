// The land: hills, a river, maybe a coast, forests and what lies in the ground. All from one seed.
import { CELL } from "./defs";
import { clamp01, fbm, lerp, noise2, rng, smoothstep } from "./util";

export interface Tree { x: number; z: number; s: number; kind: number }

export class Terrain {
  /** Squares along one side. */
  readonly n: number;
  /** Length of one side in world units. */
  readonly size: number;
  /** Heights at the corners of the squares, (n+1) x (n+1). Water is at height 0. */
  readonly h: Float32Array;
  /** What the land is good for, per square, 0 to 255: [fertile soil, forest, ore, oil]. */
  readonly res: Uint8Array[];
  readonly trees: Tree[] = [];
  /** Where the highway enters and leaves the map, as way points for the road builder. */
  highway: number[][] = [];

  constructor(readonly seed: number, n: number) {
    this.n = n;
    this.size = n * CELL;
    this.h = new Float32Array((n + 1) * (n + 1));
    this.res = [0, 1, 2, 3].map(() => new Uint8Array(n * n));
    this.generate();
  }

  heightAt(x: number, z: number): number {
    const n = this.n;
    let gx = x / CELL, gz = z / CELL;
    gx = gx < 0 ? 0 : gx > n - 0.0001 ? n - 0.0001 : gx;
    gz = gz < 0 ? 0 : gz > n - 0.0001 ? n - 0.0001 : gz;
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
    const i = iz * (n + 1) + ix;
    const h = this.h;
    // The same two triangles per square as the drawn land, so things stand exactly on it.
    if (fx + fz <= 1) return h[i] + (h[i + 1] - h[i]) * fx + (h[i + n + 1] - h[i]) * fz;
    return h[i + n + 2] + (h[i + n + 1] - h[i + n + 2]) * (1 - fx) + (h[i + 1] - h[i + n + 2]) * (1 - fz);
  }

  /** How steep the land is at a point (0 flat, 1 = 45 degrees). */
  slopeAt(x: number, z: number): number {
    const e = CELL * 0.75;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  /** What the land holds at a point: 0 to 1. kind: 0 soil, 1 forest, 2 ore, 3 oil. */
  resourceAt(kind: number, x: number, z: number): number {
    const n = this.n;
    const ix = Math.min(n - 1, Math.max(0, (x / CELL) | 0)), iz = Math.min(n - 1, Math.max(0, (z / CELL) | 0));
    return this.res[kind][iz * n + ix] / 255;
  }

  inside(x: number, z: number, margin = 0): boolean {
    return x >= margin && z >= margin && x <= this.size - margin && z <= this.size - margin;
  }

  /** Is there open water within `r` of a point? */
  nearWater(x: number, z: number, r: number): boolean {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      for (let d = r / 3; d <= r + 0.01; d += r / 3) {
        const px = x + Math.cos(ang) * d, pz = z + Math.sin(ang) * d;
        if (this.inside(px, pz) && this.heightAt(px, pz) < -0.4) return true;
      }
    }
    return false;
  }

  private generate() {
    const { n, size, seed, h } = this;
    const r = rng(seed * 7 + 13);
    const coastSide = r() < 0.6 ? Math.floor(r() * 4) : -1;
    const riverOn = coastSide < 0 || r() < 0.75;
    const riverVertical = r() < 0.5;
    const riverPos = 0.3 + r() * 0.4, riverAmp = 0.06 + r() * 0.1, riverFreq = 1 + r() * 1.5, riverPhase = r() * 6.28;
    const riverW = 16 + r() * 12;
    const relief = 58 + r() * 30;
    // The river as a wavy line across the whole map.
    const riverAt = (along: number) =>
      (riverPos + Math.sin(along * riverFreq * 3.1 + riverPhase) * riverAmp + (noise2(along * 5, 3.3, seed + 5) - 0.5) * 0.12) * size;

    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const x = i * CELL, z = j * CELL;
        let v = (fbm(x / 560, z / 560, seed, 4) - 0.44) * relief + (fbm(x / 120, z / 120, seed + 9, 3) - 0.5) * 6;
        v = v > 0 ? v * 0.85 + 2.4 : v + 2.4;
        if (coastSide >= 0) {
          const d = [x, size - x, z, size - z][coastSide] / size;
          const wob = (fbm((coastSide < 2 ? z : x) / 260, 1.7, seed + 21, 3) - 0.5) * 0.22;
          const k = smoothstep(0.34 + wob, 0.1 + wob, d);
          v = lerp(v, -10, k);
        }
        if (riverOn) {
          const along = (riverVertical ? z : x) / size, across = riverVertical ? x : z;
          const d = Math.abs(across - riverAt(along));
          // A wide flat valley with the river bed in the middle.
          v = lerp(v, Math.min(v, 2.4), smoothstep(riverW * 7, riverW * 2, d));
          v = lerp(v, -5, smoothstep(riverW * 1.25, riverW * 0.45, d));
        }
        // Lakes are fine, but no deep holes far inland.
        if (v < -9) v = -9 - (-9 - v) * 0.2;
        h[j * (n + 1) + i] = v;
      }

    // Make sure most of the map is land.
    for (let tries = 0; tries < 8; tries++) {
      let land = 0;
      for (let k = 0; k < h.length; k++) if (h[k] > 1) land++;
      if (land / h.length > 0.62) break;
      for (let k = 0; k < h.length; k++) h[k] += 1.4;
    }
    // What the land is good for.
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, k = j * n + i;
        const hh = this.heightAt(x, z), slope = this.slopeAt(x, z);
        const land = hh > 0.8 ? 1 : 0;
        const fert = smoothstep(0.5, 0.72, fbm(x / 260, z / 260, seed + 31, 3)) * smoothstep(16, 6, hh) * (1 - smoothstep(0.08, 0.2, slope));
        const forest = smoothstep(0.52, 0.66, fbm(x / 210, z / 210, seed + 47, 4)) * smoothstep(1.2, 3, hh);
        const ore = smoothstep(0.6, 0.76, fbm(x / 190, z / 190, seed + 63, 3)) * smoothstep(4, 12, hh);
        const oil = smoothstep(0.63, 0.78, fbm(x / 230, z / 230, seed + 77, 3)) * smoothstep(14, 5, hh);
        this.res[0][k] = Math.round(clamp01(fert * (1 - forest * 0.7)) * 255 * land);
        this.res[1][k] = Math.round(clamp01(forest) * 255 * land);
        this.res[2][k] = Math.round(clamp01(ore) * 255 * land);
        this.res[3][k] = Math.round(clamp01(oil) * 255 * land);
      }

    // Trees: thick in forests, a few everywhere else.
    const tr = rng(seed * 3 + 5);
    const step = 6.5;
    for (let z = 4; z < size - 4; z += step)
      for (let x = 4; x < size - 4; x += step) {
        const jx = x + (tr() - 0.5) * step, jz = z + (tr() - 0.5) * step;
        const forest = this.resourceAt(1, jx, jz);
        const chance = forest > 0.25 ? 0.25 + forest * 0.6 : 0.012;
        const roll = tr(), s = tr(), k = tr();
        if (roll > chance) continue;
        const hh = this.heightAt(jx, jz);
        if (hh < 1.1 || this.slopeAt(jx, jz) > 0.5) continue;
        this.trees.push({ x: jx, z: jz, s: 0.75 + s * 0.7, kind: k < 0.6 ? 0 : 1 });
      }

    this.highway = this.planHighway(r);
  }

  /** Way points of the highway that crosses the map: the gentlest of a few tries, with the least water. */
  private planHighway(r: () => number): number[][] {
    const size = this.size;
    let best: number[][] = [], bestCost = Infinity;
    for (let tries = 0; tries < 10; tries++) {
      const vertical = r() < 0.5;
      const a = 0.22 + r() * 0.56, b = 0.22 + r() * 0.56;
      const m1 = lerp(a, b, 0.33) + (r() - 0.5) * 0.16, m2 = lerp(a, b, 0.66) + (r() - 0.5) * 0.16;
      const pts = [[0, a], [0.33, m1], [0.66, m2], [1, b]].map(([t, o]) => (vertical ? [o * size, t * size] : [t * size, o * size]));
      let cost = 0;
      for (let i = 0; i < 3; i++)
        for (let k = 0; k <= 20; k++) {
          const x = lerp(pts[i][0], pts[i + 1][0], k / 20), z = lerp(pts[i][1], pts[i + 1][1], k / 20);
          const hh = this.heightAt(x, z);
          cost += hh < 0.6 ? 3 : 0;
          cost += this.slopeAt(x, z) * 6;
        }
      if (cost < bestCost) { bestCost = cost; best = pts; }
    }
    return best;
  }
}
