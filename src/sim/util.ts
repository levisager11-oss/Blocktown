// Small maths helpers shared by the simulation and the renderer.

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A seeded random number generator (mulberry32): the same seed always gives the same map. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from 0 to 1 for a grid point: always the same for the same point and seed. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth noise from 0 to 1. */
export function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Several layers of noise on top of each other, from 0 to 1. */
export function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise2(x, y, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / norm;
}

/** Turns words into a seed number, so players can share a map as a word. */
export function seedFromText(text: string): number {
  const t = text.trim();
  if (/^\d{1,9}$/.test(t)) return Number(t);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000000000;
}

/** Shortest way from angle a to angle b, from -PI to PI. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A spatial hash: finds things near a point without looking at all of them. */
export class Grid<T> {
  private cells = new Map<number, T[]>();
  constructor(readonly size: number) {}
  private key(cx: number, cz: number) { return (cx + 4096) * 16384 + (cz + 4096); }
  add(item: T, x0: number, z0: number, x1: number, z1: number) {
    const s = this.size;
    for (let cx = Math.floor(x0 / s); cx <= Math.floor(x1 / s); cx++)
      for (let cz = Math.floor(z0 / s); cz <= Math.floor(z1 / s); cz++) {
        const k = this.key(cx, cz);
        const list = this.cells.get(k);
        if (list) list.push(item); else this.cells.set(k, [item]);
      }
  }
  remove(item: T, x0: number, z0: number, x1: number, z1: number) {
    const s = this.size;
    for (let cx = Math.floor(x0 / s); cx <= Math.floor(x1 / s); cx++)
      for (let cz = Math.floor(z0 / s); cz <= Math.floor(z1 / s); cz++) {
        const k = this.key(cx, cz);
        const list = this.cells.get(k);
        if (!list) continue;
        const i = list.indexOf(item);
        if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); }
        if (!list.length) this.cells.delete(k);
      }
  }
  /** Everything whose box touches the given box (each thing once). */
  query(x0: number, z0: number, x1: number, z1: number, out: T[] = []): T[] {
    const s = this.size;
    const c0 = Math.floor(x0 / s), c1 = Math.floor(x1 / s), d0 = Math.floor(z0 / s), d1 = Math.floor(z1 / s);
    const single = c0 === c1 && d0 === d1;
    for (let cx = c0; cx <= c1; cx++)
      for (let cz = d0; cz <= d1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const it of list) if (single || !out.includes(it)) out.push(it);
      }
    return out;
  }
  clear() { this.cells.clear(); }
}
