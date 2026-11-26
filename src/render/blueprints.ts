// Turns a building into a short list of simple shapes ("parts") for the renderer.
// Plot space: x along the road, z from the back (-) to the road (+), y up. The front faces +z.
import { Kind, Zone } from "../sim/defs";
import type { Part, Shape } from "./parts";

type Out = Part[];
type Rand = () => number;

// ---------------------------------------------------------------- randomness
/** A tiny seeded random number generator (same seed, same numbers). */
function mulberry32(seed: number): Rand {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick<T>(r: Rand, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length] as T;
}
/** A random number from a to b. */
function range(r: Rand, a: number, b: number): number {
  return a + (b - a) * r();
}
/** The list in a random order (does not change the original). */
function shuffled<T>(r: Rand, list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i] as T;
    a[i] = a[j] as T;
    a[j] = t;
  }
  return a;
}

// ---------------------------------------------------------------- colours
const WALL_HOME = [0xf4ead2, 0xf7f3ea, 0xf2d7b6, 0xd9e8f0, 0xeed9e0, 0xe6efd0, 0xf3e3a8];
const ROOF_HOME = [0xb5523a, 0x4a5568, 0x6b4a36, 0x8a3b32, 0x3f4f63];
const GREENS = [0x4a9d4f, 0x3f8f46, 0x5aa84f, 0x2f7d3e];
const PINES = [0x2f7d4a, 0x276b43, 0x35875a];
const TRUNK = 0x7a5232;
const GLASS = 0x9cc8e0;
const DARK = 0x39424e;
const WHITE = 0xf5f6f4;
const APT = [0xe9e3d6, 0xd9c8b0, 0xc9d8e6, 0xe6d0c4, 0xcfd9c2];
const SHOP = [0xe8553d, 0xf2b134, 0x3fa7d6, 0x59b36a, 0xd9569a];
const SHOP_WALL = [0xf3e6c8, 0xf6efe0, 0xe4efe9, 0xf1dcd0];
const COM_GLASS = [0x5fa8d3, 0x3f8fb5, 0x4aa3a3, 0x6bb5c9];
const COM_BASE = [0xe8553d, 0xf2b134, 0x2f6fb5, 0x3a9d8a];
const OFFICE_GLASS = [0x5aa2b8, 0x4f94b0, 0x58b1b0];
const OFFICE_STONE = [0xb9c4cc, 0xaebdc9, 0xc4cdd2];
const GREY = 0xa6adb3;
const CONCRETE = 0xb9bcbc;
const ASPHALT = 0x5b6168;
const CAR_COLORS = [0xd94f4f, 0x3f7fd0, 0xf0c64a, 0xeeeeee, 0x4aa86a];

// ---------------------------------------------------------------- shape helpers
interface Turn { ry?: number; rx?: number; rz?: number }
function add(o: Out, shape: Shape, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, t?: Turn): void {
  const p: Part = { shape, x, y, z, sx, sy, sz, color };
  if (t) {
    if (t.ry) p.ry = t.ry;
    if (t.rx) p.rx = t.rx;
    if (t.rz) p.rz = t.rz;
  }
  o.push(p);
}
const box = (o: Out, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, t?: Turn) => add(o, "box", x, y, z, sx, sy, sz, c, t);
const win = (o: Out, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number) => add(o, "win", x, y, z, sx, sy, sz, c);
const cyl = (o: Out, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, t?: Turn) => add(o, "cyl", x, y, z, sx, sy, sz, c, t);
const cone = (o: Out, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number) => add(o, "cone", x, y, z, sx, sy, sz, c);
const dome = (o: Out, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number) => add(o, "dome", x, y, z, sx, sy, sz, c);
const pyramid = (o: Out, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number) => add(o, "pyramid", x, y, z, sx, sy, sz, c);
/** A pitched roof. lenX and lenZ are its size in the plot; the ridge runs along z when alongZ is true. */
function gable(o: Out, x: number, y: number, z: number, lenX: number, h: number, lenZ: number, c: number, alongZ = false): void {
  if (alongZ) add(o, "gable", x, y, z, lenZ, h, lenX, c, { ry: Math.PI / 2 });
  else add(o, "gable", x, y, z, lenX, h, lenZ, c);
}
/** A flat patch on the ground (lawn, sand, paving, a car park). */
const patch = (o: Out, x: number, z: number, sx: number, sz: number, c: number, y = 0, h = 0.12) => box(o, x, y, z, sx, h, sz, c);

/** A round garden tree: trunk and a green cone or ball. */
function tree(o: Out, x: number, z: number, s: number, c: number, round: boolean): void {
  box(o, x, 0, z, 0.5 * s, 1.4 * s, 0.5 * s, TRUNK);
  if (round) dome(o, x, 0.9 * s, z, 2.8 * s, 2.6 * s, 2.8 * s, c);
  else cone(o, x, 1.0 * s, z, 2.8 * s, 3.6 * s, 2.8 * s, c);
}
/** A tall pointed fir tree. */
function pine(o: Out, x: number, z: number, s: number, c: number): void {
  box(o, x, 0, z, 0.5 * s, 1.2 * s, 0.5 * s, TRUNK);
  cone(o, x, 0.8 * s, z, 2.8 * s, 3.4 * s, 2.8 * s, c);
  cone(o, x, 2.8 * s, z, 2.0 * s, 2.8 * s, 2.0 * s, c);
}
/** A small car, standing on y. */
function car(o: Out, x: number, y: number, z: number, c: number, alongZ: boolean): void {
  if (alongZ) {
    box(o, x, y, z, 1.7, 0.9, 3.4, c);
    box(o, x, y + 0.9, z, 1.5, 0.6, 1.8, GLASS);
  } else {
    box(o, x, y, z, 3.4, 0.9, 1.7, c);
    box(o, x, y + 0.9, z, 1.8, 0.6, 1.5, GLASS);
  }
}
/** Small front windows of a house. */
function frontWindows(o: Out, xs: number[], y: number, z: number): void {
  for (const x of xs) box(o, x, y, z, 1.3, 1.5, 0.12, GLASS);
}
/** A red cross lying flat on a roof. */
function cross(o: Out, x: number, y: number, z: number, s: number): void {
  box(o, x, y, z, s, 0.4, s / 3, 0xd9363e);
  box(o, x, y, z, s / 3, 0.4, s, 0xd9363e);
}
/** A round landing pad with a white H. */
function helipad(o: Out, x: number, y: number, z: number, d: number): void {
  cyl(o, x, y, z, d, 0.3, d, 0x4c5663);
  const h = d * 0.42;
  box(o, x - h / 2, y + 0.3, z, 0.6, 0.1, h * 1.2, WHITE);
  box(o, x + h / 2, y + 0.3, z, 0.6, 0.1, h * 1.2, WHITE);
  box(o, x, y + 0.3, z, h, 0.1, 0.6, WHITE);
}
/** A flagpole with a little flag. */
function flag(o: Out, x: number, z: number, c: number): void {
  box(o, x, 0, z, 0.25, 9, 0.25, 0xd5d8dc);
  box(o, x + 0.75, 7.6, z, 1.4, 0.9, 0.1, c);
}

// ---------------------------------------------------------------- homes
function resLow(l: number, r: Rand): Out {
  const o: Out = [];
  const wall = pick(r, WALL_HOME);
  const roof = pick(r, ROOF_HOME);
  const green = pick(r, GREENS);
  const hip = r() < 0.35;
  const door = pick(r, [0x7a4a32, 0x2f5f8f, 0x9c3b30]);
  if (l === 1) {
    // a small cottage
    box(o, 0, 0, -1, 7, 3.2, 7, wall);
    if (hip) pyramid(o, 0, 3.2, -1, 8.4, 2.2, 8.4, roof);
    else gable(o, 0, 3.2, -1, 8.2, 2.2, 8, roof, r() < 0.5);
    box(o, 2, 3.0, -2.6, 0.9, 2.6, 0.9, 0xa9573f);
    box(o, 0, 0, 2.55, 1.3, 2.1, 0.15, door);
    frontWindows(o, [-2.2, 2.2], 1.2, 2.56);
    dome(o, -3.4, 0, 3.6, 1.8, 1.2, 1.5, green);
  } else if (l === 2) {
    // a two-storey house with a garage
    box(o, -1, 0, -2.5, 8, 6.2, 7, wall);
    if (hip) pyramid(o, -1, 6.2, -2.5, 9.2, 2.8, 8.2, roof);
    else gable(o, -1, 6.2, -2.5, 9, 2.6, 8, roof, false);
    box(o, 4.5, 0, -1.2, 3.6, 3, 5.5, pick(r, WALL_HOME));
    box(o, 4.5, 3, -1.2, 3.8, 0.3, 5.8, roof);
    box(o, 4.5, 0, 1.58, 2.6, 2.3, 0.12, 0xd7dbdf);
    box(o, -1, 0, 1.05, 1.3, 2.1, 0.15, door);
    frontWindows(o, [-3.4, 1.4], 1.2, 1.06);
    frontWindows(o, [-3.4, -1, 1.4], 4.0, 1.06);
    box(o, 0, 3.0, -2.5, 8.2, 0.25, 7.2, 0xe9e2d0);
    tree(o, -4.6, 5.2, 1, green, r() < 0.5);
    box(o, 1.2, 0, 4.4, 5, 0.9, 1, green);
  } else {
    // a villa with two wings, a porch and garden trees
    box(o, -2, 0, -2.5, 8, 6.4, 8, wall);
    pyramid(o, -2, 6.4, -2.5, 8.8, 3.2, 8.8, roof);
    box(o, 3.6, 0, -1, 4.8, 4.2, 6, pick(r, WALL_HOME));
    gable(o, 3.6, 4.2, -1, 5.6, 2.2, 6.6, roof, true);
    box(o, -2, 2.9, 3.0, 4, 0.3, 2.6, roof);
    box(o, -3.7, 0, 4, 0.3, 2.9, 0.3, WHITE);
    box(o, -0.3, 0, 4, 0.3, 2.9, 0.3, WHITE);
    box(o, -2, 0, 1.55, 1.4, 2.2, 0.15, door);
    frontWindows(o, [-4.8, 0.8], 1.3, 1.56);
    box(o, -4.6, 3.4, 1.56, 1.3, 1.6, 0.12, GLASS);
    box(o, 0.6, 3.4, 1.56, 1.3, 1.6, 0.12, GLASS);
    box(o, -4.5, 5.6, -5, 1, 3.2, 1, 0xa9573f);
    tree(o, -4.8, 5.6, 1.1, green, true);
    tree(o, 4.9, 4.8, 0.9, pick(r, GREENS), r() < 0.5);
  }
  return o;
}

function resHigh(l: number, r: Rand): Out {
  const o: Out = [];
  const wall = pick(r, APT);
  const trim = pick(r, [0x8c97a3, 0xb08a6a, 0x6f8fa8]);
  if (l === 1) {
    win(o, 0, 0, -1, 10, 12, 11, wall);
    box(o, 0, 12, -1, 10.6, 0.5, 11.6, trim);
    box(o, -1.5, 12.5, -2.5, 3, 1.4, 3, GREY);
    box(o, 0, 2.8, 5.4, 4.4, 0.3, 1.8, trim);
    box(o, 0, 0, 4.55, 2, 2.6, 0.12, DARK);
    tree(o, -5.2, 6, 0.8, pick(r, GREENS), true);
  } else if (l === 2) {
    win(o, 0, 0, -1, 10, 24, 10, wall);
    for (const y of [6, 12, 18]) box(o, 0, y, 4.6, 8, 0.3, 1.2, trim);
    box(o, 0, 24, -1, 10.6, 0.6, 10.6, trim);
    box(o, -2, 24.6, -3, 4, 2.4, 4, GREY);
    box(o, 2.5, 24.6, 1, 2, 1.2, 2, wall);
    box(o, 0, 3, 5.6, 5, 0.3, 2.2, trim);
    box(o, 0, 0, 4.05, 2.2, 2.7, 0.12, DARK);
  } else {
    // a tower with a wide base and a stepped top
    win(o, 0, 0, -1, 12, 6, 12, wall);
    box(o, 0, 3, 5.4, 5, 0.3, 2, trim);
    win(o, 0, 6, -2, 9, 24, 9, pick(r, APT));
    win(o, 0, 30, -2, 6.4, 9, 6.4, wall);
    box(o, 0, 39, -2, 7, 0.8, 7, trim);
    box(o, -1.3, 39.8, -3, 2.4, 1.6, 2.4, GREY);
    box(o, 1.6, 39.8, -1, 0.4, 4, 0.4, 0xc4c9ce);
    box(o, 2, 39.8, -3.4, 1.6, 1, 1.6, GREY);
  }
  return o;
}

// ---------------------------------------------------------------- shops
function comLow(l: number, r: Rand): Out {
  const o: Out = [];
  const accent = pick(r, SHOP);
  const accent2 = pick(r, SHOP);
  if (l === 1) {
    box(o, 0, 0, -1.5, 10, 3.8, 8, pick(r, SHOP_WALL));
    box(o, 0, 3.8, -1.5, 10.4, 0.4, 8.4, accent);
    // striped awning
    for (let i = 0; i < 4; i++) box(o, -3.45 + i * 2.3, 2.5, 3.2, 2.3, 0.45, 1.4, i % 2 ? WHITE : accent);
    box(o, 1.5, 4.2, -4.2, 4.4, 1.6, 0.6, accent2);
    box(o, 2.8, 0, 2.55, 1.4, 2.2, 0.12, DARK);
    box(o, -2.2, 0.7, 2.55, 4, 1.7, 0.1, GLASS);
  } else if (l === 2) {
    // two shops side by side, two storeys high
    const cols: number[] = [accent, accent2];
    for (let i = 0; i < 2; i++) {
      const xc = i === 0 ? -3.3 : 3.3;
      box(o, xc, 0, -1.5, 6.2, 6.4, 8, pick(r, SHOP_WALL));
      box(o, xc, 6.4, -1.5, 6.2, 0.4, 8.2, cols[i] as number);
      box(o, xc, 3.1, 3.2, 5.4, 0.45, 1.4, cols[i] as number);
      box(o, xc, 0.6, 2.55, 4.2, 1.7, 0.1, GLASS);
      box(o, xc, 4.1, 2.55, 4.2, 1.5, 0.1, GLASS);
      box(o, xc, 6.8, 2.6, 4.2, 1.1, 0.5, cols[i] as number);
    }
  } else {
    // a small mall with a glass entrance, a canopy and a car park
    box(o, 0, 0, -3.4, 12.4, 5.6, 7.8, pick(r, SHOP_WALL));
    box(o, 0, 5.6, -3.4, 12.6, 0.5, 7.9, accent);
    win(o, 0, 0, 1.0, 5.4, 4.4, 2, 0x7fb6d6);
    box(o, 0, 4.4, 2.8, 6.4, 0.4, 3.4, accent2);
    box(o, -2.8, 0, 4.2, 0.4, 4.4, 0.4, WHITE);
    box(o, 2.8, 0, 4.2, 0.4, 4.4, 0.4, WHITE);
    box(o, -3, 6.1, -3.4, 5, 1.6, 0.6, accent);
    patch(o, 0, 5.2, 12.8, 4.2, ASPHALT);
    car(o, -4.8, 0.12, 5.3, pick(r, CAR_COLORS), true);
    car(o, -1.2, 0.12, 5.5, pick(r, CAR_COLORS), true);
    car(o, 4.8, 0.12, 5.3, pick(r, CAR_COLORS), true);
  }
  return o;
}

function comHigh(l: number, r: Rand): Out {
  const o: Out = [];
  const base = pick(r, COM_BASE);
  const glass = pick(r, COM_GLASS);
  if (l === 1) {
    box(o, 0, 0, -1, 11, 3.2, 10, base);
    win(o, 0, 3.2, -1, 10.4, 12, 9.4, glass);
    box(o, 0, 2.4, 4.7, 9, 0.4, 1.4, WHITE);
    box(o, 0, 15.2, -1, 10.8, 0.5, 9.8, 0xe8ecef);
    box(o, -2, 15.7, -3, 3, 1.6, 3, GREY);
    box(o, 0, 0.6, 4.05, 5, 1.7, 0.1, GLASS);
  } else if (l === 2) {
    box(o, 0, 0, -1, 12, 3, 11, base);
    win(o, 0, 3, -1.5, 10.4, 27, 9.6, glass);
    box(o, 0, 30, -1.5, 11, 0.6, 10.2, 0xe8ecef);
    box(o, 2, 30.6, -3, 4, 2, 4, GREY);
    box(o, 0, 2.4, 5.2, 10, 0.4, 1.6, WHITE);
    box(o, -3.5, 31, 1, 3, 1.2, 0.5, base);
  } else {
    // a glass tower with a crown
    box(o, 0, 0, -1, 12.6, 3.6, 12, base);
    win(o, 0, 3.6, -2, 10, 24, 9, glass);
    win(o, 0, 27.6, -2, 8, 12, 7, pick(r, COM_GLASS));
    win(o, 0, 39.6, -2, 6, 3, 5, glass);
    pyramid(o, 0, 42.6, -2, 6.4, 3.6, 5.4, 0xf2b134);
    box(o, 0, 46.2, -2, 0.4, 3, 0.4, 0xc4c9ce);
    box(o, 0, 3.2, 5.4, 6, 0.4, 1.8, WHITE);
  }
  return o;
}

// ---------------------------------------------------------------- industry
function industry(l: number, r: Rand): Out {
  const o: Out = [];
  const metal = pick(r, [0xb8bcc0, 0xaeb7be, 0xc9b79c]);
  const rust = 0xb4562f;
  const yellow = 0xe8b23a;
  if (l === 1) {
    box(o, -1.5, 0, -1, 9, 4, 9, metal);
    gable(o, -1.5, 4, -1, 9.4, 1.6, 9.4, pick(r, [0x8c6a55, 0x6f7c88]), r() < 0.5);
    box(o, -1.5, 0, 3.55, 4, 3, 0.2, rust);
    cyl(o, 4.8, 0, -4, 1.6, 9, 1.6, 0xa9573f);
    cyl(o, 4.8, 8.2, -4, 1.8, 0.8, 1.8, DARK);
    box(o, 4.8, 0, 2.5, 1.6, 1.4, 1.6, 0xb98a4e);
    box(o, 4.8, 0, 4.5, 1.6, 1.4, 1.6, yellow);
    box(o, 4.8, 1.4, 3.5, 1.2, 1.2, 1.2, 0xb98a4e);
  } else if (l === 2) {
    // a hall with a sawtooth roof, a tank and a chimney
    box(o, -0.9, 0, -2.5, 11, 5.5, 9, metal);
    for (const z of [-5.5, -2.5, 0.5]) gable(o, -0.9, 5.5, z, 11, 1.8, 3.2, 0x7d8a96);
    cyl(o, 4.5, 0, 3.5, 3.2, 6, 3.2, 0xd8dcdf);
    dome(o, 4.5, 6, 3.5, 3.2, 1, 3.2, 0xb8bcc0);
    cyl(o, -4.8, 0, 4.5, 1.6, 10, 1.6, 0xa9573f);
    cyl(o, -4.8, 9.2, 4.5, 1.8, 0.8, 1.8, DARK);
    box(o, -1.5, 0, 2.05, 4, 3.4, 0.2, rust);
    box(o, -1.2, 0, 4.6, 1.6, 1.4, 1.6, yellow);
    box(o, 1.2, 0, 4.6, 1.6, 1.4, 1.6, 0xb98a4e);
  } else {
    // a clean modern factory with a blue stripe
    box(o, -1.2, 0, -2.5, 10, 6, 9, WHITE);
    box(o, -1.2, 2.4, -2.5, 10.3, 1, 9.3, 0x2f6fb5);
    box(o, -1.2, 6, -2.5, 10.4, 0.4, 9.4, 0xaeb7be);
    win(o, -3.5, 0, 4.4, 5, 6, 4, 0xdfe9ef);
    box(o, -3.5, 6, 4.4, 5.4, 0.4, 4.4, 0x2f6fb5);
    cyl(o, 4.8, 0, -3, 2.8, 5.5, 2.8, 0xe6eaec);
    dome(o, 4.8, 5.5, -3, 2.8, 0.9, 2.8, 0xb8c2c9);
    cyl(o, 4.8, 0, 0.6, 2.8, 5.5, 2.8, 0xe6eaec);
    dome(o, 4.8, 5.5, 0.6, 2.8, 0.9, 2.8, 0xb8c2c9);
    box(o, 3.2, 3.6, -1.2, 0.5, 0.5, 3.6, GREY);
    box(o, 1.5, 0, 2.55, 3.6, 3.2, 0.2, 0x2f6fb5);
  }
  return o;
}

// ---------------------------------------------------------------- offices
function office(l: number, r: Rand): Out {
  const o: Out = [];
  const glass = pick(r, OFFICE_GLASS);
  const stone = pick(r, OFFICE_STONE);
  if (l === 1) {
    win(o, 0, 0, -1, 11, 15, 10, glass);
    box(o, 0, 15, -1, 11.4, 0.5, 10.4, stone);
    box(o, 2, 15.5, -3, 3, 1.4, 3, GREY);
    box(o, 0, 3.4, 5, 5, 0.3, 1.8, stone);
    box(o, 0, 0, 4.05, 3, 2.8, 0.12, DARK);
    tree(o, -5, 6, 0.8, pick(r, GREENS), true);
  } else if (l === 2) {
    win(o, 0, 0, -0.5, 12.4, 3, 11, stone);
    win(o, 0, 3, -2, 9, 24, 8, glass);
    win(o, 0, 27, -2, 6.5, 6, 5.5, glass);
    box(o, 0, 33, -2, 7, 0.5, 6, stone);
    box(o, 1.2, 33.5, -3, 2.4, 1.4, 2.4, GREY);
    box(o, 0, 3, 5.3, 5, 0.3, 1.8, stone);
  } else {
    // a slim tower with an antenna
    win(o, 0, 0, -1, 11, 6, 11, stone);
    box(o, 0, 3, 5, 5, 0.3, 1.8, 0x7e8c97);
    win(o, 0, 6, -2, 8, 48, 8, glass);
    win(o, 0, 54, -2, 5.5, 3, 5.5, stone);
    box(o, 0, 57, -2, 6, 0.5, 6, 0x7e8c97);
    box(o, -1.2, 57.5, -3, 2, 1.4, 2, GREY);
    box(o, 1, 57.5, -1, 0.4, 4.5, 0.4, 0xd34a4a);
  }
  return o;
}

// ---------------------------------------------------------------- the land
function farm(r: Rand): Out {
  const o: Out = [];
  box(o, -2.4, 0, -4.4, 7.6, 4.4, 5.6, 0xb8402f);
  gable(o, -2.4, 4.4, -4.4, 8, 2.6, 5.9, pick(r, [0x6b4a36, 0x59606a]));
  box(o, -2.4, 0, -1.55, 2.6, 3, 0.15, WHITE);
  box(o, -2.4, 0, -1.5, 0.3, 3, 0.2, 0xb8402f);
  cyl(o, 4.6, 0, -4.8, 3, 8, 3, 0xd5dce0);
  cone(o, 4.6, 8, -4.8, 3.2, 1.8, 3.2, 0x9aa4ab);
  const fields = [0x7cc14f, 0xe4c64a, 0x5aa84f, 0x8a6a45, 0xb7d053];
  for (let i = 0; i < 3; i++) box(o, 0, 0, 0.2 + i * 2.6, 12.4, 0.16, 2.4, pick(r, fields));
  return o;
}

function forestry(r: Rand): Out {
  const o: Out = [];
  box(o, -2, 0, -4, 7, 3.2, 5, 0xb98a4e);
  gable(o, -2, 3.2, -4, 7.6, 1.8, 5.6, 0x6b4a36);
  box(o, -2, 0, -1.45, 1.8, 2.3, 0.12, 0x5b3d28);
  box(o, -3, 0, 1.6, 5, 1.1, 1.1, 0x8a5a32);
  box(o, -3, 1.1, 1.6, 4.2, 1, 1, 0x7a4a2a);
  box(o, -3, 0, 3.3, 5, 1.1, 1.1, 0x9a6a3a);
  box(o, -3, 1.1, 3.3, 3.6, 0.9, 1, 0x8a5a32);
  pine(o, 4.6, -4.8, 1.2, pick(r, PINES));
  pine(o, 4.9, 0, 1, pick(r, PINES));
  pine(o, 3.2, 4.8, 1.1, pick(r, PINES));
  pine(o, -5, 5.6, 0.9, pick(r, PINES));
  return o;
}

function ore(r: Rand): Out {
  const o: Out = [];
  const steel = 0x6b7480;
  box(o, -4.2, 0, -4.5, 0.8, 12, 0.8, steel);
  box(o, -1.8, 0, -4.5, 0.8, 12, 0.8, steel);
  box(o, -3, 11.2, -4.5, 3.6, 0.8, 1, steel);
  box(o, -3, 9.4, -4.5, 2, 2, 0.5, 0x3d444c);
  box(o, -3, 0, -1.4, 5, 3, 3, pick(r, [0xb0885a, 0xc0a07a]));
  box(o, -3, 3, -1.4, 5.4, 0.3, 3.4, 0x7d4a36);
  cone(o, 3.5, 0, -3, 5, 2.6, 5, pick(r, [0x8a8f94, 0x7d8388]));
  cone(o, 4.2, 0, 2.8, 4, 1.9, 4, 0x9a9fa4);
  box(o, 1.2, 2.2, -1.4, 5.5, 0.6, 1.2, 0x3d444c);
  box(o, 0.2, 0, -1.4, 0.4, 2.2, 0.4, steel);
  box(o, 2.8, 0, -1.4, 0.4, 2.2, 0.4, steel);
  box(o, -5, 0, 3.5, 2, 1.2, 1.6, 0xb4562f);
  return o;
}

function oil(r: Rand): Out {
  const o: Out = [];
  const steel = pick(r, [0x6b7480, 0x7a828c]);
  box(o, -2, 0, -3, 5, 0.5, 5, 0x4a5058);
  pyramid(o, -2, 0.5, -3, 3.6, 13.5, 3.6, steel);
  box(o, -2, 14, -3, 1.2, 0.8, 1.2, DARK);
  cyl(o, 3.8, 0, -4.6, 4, 4.4, 4, 0xd8dcdf);
  dome(o, 3.8, 4.4, -4.6, 4, 1, 4, 0xb8bcc0);
  cyl(o, 3.8, 0, 0.2, 4, 4.4, 4, 0xcfd6dc);
  dome(o, 3.8, 4.4, 0.2, 4, 1, 4, 0xb8bcc0);
  box(o, -3.5, 0, 3.5, 4, 2.8, 3.4, 0xb98a4e);
  gable(o, -3.5, 2.8, 3.5, 4.4, 1.2, 3.8, 0x6b4a36);
  box(o, 1, 0.7, -3, 4, 0.5, 0.5, 0x3f7fd0);
  box(o, 3.8, 0.7, -2.2, 0.5, 0.5, 3.6, 0x3f7fd0);
  return o;
}

// ---------------------------------------------------------------- power
function wind(): Out {
  const o: Out = [];
  box(o, 0, 0, 0, 3.2, 0.4, 3.2, CONCRETE);
  cyl(o, 0, 0.4, 0, 1.4, 25.6, 1.4, WHITE);
  box(o, 0, 26, -0.3, 1.8, 1.8, 3.4, 0xeceeed);
  const hubY = 26.9;
  box(o, 0, hubY - 0.6, 1.7, 1.2, 1.2, 0.8, 0xd5d8dc);
  for (const a of [0, 2.09, 4.19]) box(o, 0, hubY, 2.3, 0.7, 5, 0.2, WHITE, { rz: a });
  return o;
}

function coal(r: Rand): Out {
  const o: Out = [];
  const hall = pick(r, [0x4a4f57, 0x55504c]);
  box(o, -5, 0, -4, 20, 10, 12, hall);
  box(o, -5, 10, -4, 20.4, 0.5, 12.4, 0x2f343a);
  box(o, -9, 10.5, -8, 8, 6, 8, 0x3d434b);
  for (const x of [9, 14.5]) {
    cyl(o, x, 0, -10, 3.4, 36, 3.4, 0xcdd1d4);
    cyl(o, x, 27, -10, 3.7, 3, 3.7, 0xc23b32);
    cyl(o, x, 33, -10, 3.7, 3, 3.7, 0xc23b32);
  }
  cone(o, -13.5, 0, 8, 10, 6, 10, 0x25282c);
  cone(o, -9.5, 0, 12, 5, 3, 4.5, 0x31353a);
  box(o, -5, 3, 6.5, 1.4, 0.8, 9, 0x6b7480);
  box(o, -5, 0, 3.5, 0.4, 3, 0.4, 0x6b7480);
  box(o, -5, 0, 9.5, 0.4, 3, 0.4, 0x6b7480);
  box(o, 12, 0, 6, 3, 2.4, 3, 0x8c959c);
  box(o, 16, 0, 6, 3, 3.2, 3, 0x8c959c);
  box(o, 12, 0, 10.5, 3, 2.4, 3, 0xb4562f);
  return o;
}

function solar(r: Rand): Out {
  const o: Out = [];
  const panel = pick(r, [0x1f3f7a, 0x223f6e, 0x2a4a85]);
  for (const z of [-9, -3, 3, 9]) {
    box(o, 0, 0, z, 31, 1.2, 0.5, 0x8c959c);
    for (const x of [-13.5, -4.5, 4.5, 13.5]) box(o, x, 1.6, z, 7.5, 0.2, 3.2, panel, { rx: -0.45 });
  }
  box(o, -15, 0, 12.5, 4, 3, 3, 0xe4e7e9);
  box(o, -15, 3, 12.5, 4.3, 0.3, 3.3, 0x8c959c);
  box(o, -8, 0, 12.5, 3, 2, 2, 0x8c959c);
  return o;
}

function nuclear(r: Rand): Out {
  const o: Out = [];
  const grey = pick(r, [0xcfd3d6, 0xd8dcdf]);
  add(o, "tower", -14, 0, -9, 16, 30, 16, grey);
  add(o, "tower", 4, 0, -9, 16, 30, 16, grey);
  cyl(o, 18, 0, -4, 12, 14, 12, 0xd9dcdd);
  dome(o, 18, 14, -4, 12, 6, 12, 0xb8c0c6);
  box(o, -4, 0, 8, 26, 9, 10, 0xb9c1c7);
  box(o, -4, 9, 8, 26.4, 0.5, 10.4, 0x7e8c97);
  win(o, 19, 0, 10, 8, 6, 8, 0xdfe9ef);
  cyl(o, 24, 0, -14, 1.6, 16, 1.6, 0xd34a4a);
  box(o, -16, 0, 16, 4, 2.4, 3, 0x8c959c);
  box(o, 8, 0, 16.5, 4, 2.4, 3, 0x8c959c);
  return o;
}

// ---------------------------------------------------------------- water and waste
function pump(): Out {
  const o: Out = [];
  box(o, -2.4, 0, -2.5, 5, 3.2, 4.5, 0xdfe3e6);
  gable(o, -2.4, 3.2, -2.5, 5.6, 1.4, 5.1, 0x4a6a8c);
  box(o, -2.4, 0, -0.2, 1.2, 2.1, 0.12, 0x2f5f8f);
  box(o, -1, 1, 3.4, 8, 0.9, 0.9, 0x3f8fd0);
  box(o, 3.4, 0, 2.2, 0.9, 2.2, 0.9, 0x3f8fd0);
  cyl(o, 3.6, 0, -3, 4, 4, 4, 0xc9d3da);
  dome(o, 3.6, 4, -3, 4, 1, 4, 0x3f8fd0);
  return o;
}

function waterTower(): Out {
  const o: Out = [];
  box(o, 0, 0, 0, 4, 0.4, 4, CONCRETE);
  cyl(o, 0, 0.4, 0, 1.6, 11.6, 1.6, 0xb9c4cc);
  cyl(o, 0, 12, 0, 8, 4, 8, 0xdfeaf2);
  cyl(o, 0, 13.4, 0, 8.3, 1, 8.3, 0x3f8fd0);
  cone(o, 0, 16, 0, 8.4, 2.6, 8.4, 0x3f8fd0);
  box(o, 4.6, 0, 3.6, 2.6, 2.4, 2.6, 0xdfe3e6);
  return o;
}

function outlet(): Out {
  const o: Out = [];
  box(o, 0, 0, 3.2, 9, 3, 6, CONCRETE);
  box(o, 0, 3, 3.2, 9.3, 0.3, 6.3, 0x9aa0a6);
  cyl(o, 0, 1.5, 0.4, 2.2, 6, 2.2, 0x7d8a96, { rx: -Math.PI / 2 });
  box(o, -3.6, 3.3, 5.2, 1.6, 1.2, 1.6, 0x3f8fd0);
  box(o, 3.6, 3.3, 5.2, 1.6, 1.2, 1.6, 0x3f8fd0);
  return o;
}

/** A buried tank: a low concrete lid with two hatches, a vent pipe and a small hut. */
function septic(): Out {
  const o: Out = [];
  box(o, -1.5, 0, 0.5, 8, 0.7, 9, CONCRETE);
  cyl(o, -3, 0.7, -1.5, 2.2, 0.35, 2.2, 0x5f6a72);
  cyl(o, 0.2, 0.7, 2.5, 2.2, 0.35, 2.2, 0x5f6a72);
  cyl(o, -4.6, 0.7, 3.8, 0.5, 3, 0.5, 0x8a949c);
  box(o, 4.2, 0, -3.2, 3.2, 2.6, 3.6, 0xd9d2c0);
  box(o, 4.2, 2.6, -3.2, 3.6, 0.3, 4, 0x7a5a48);
  return o;
}

function treatment(): Out {
  const o: Out = [];
  box(o, 0, 0, -8.8, 26, 6, 7, 0xdfe3e6);
  gable(o, 0, 6, -8.8, 26.4, 1.8, 7.2, 0x5a7a96);
  win(o, 11.5, 0, -8.8, 6, 6, 6, 0xe9eef1);
  for (const x of [-9.5, 0, 9.5]) {
    cyl(o, x, 0, 3, 8, 2.2, 8, 0xb9c4cc);
    cyl(o, x, 2.2, 3, 7, 0.25, 7, 0x3fa7a0);
  }
  box(o, 0, 2.2, 3, 22, 0.25, 0.8, 0x6b7480);
  box(o, -13, 0, -2.5, 2, 2, 2, 0x3f8fd0);
  return o;
}

function landfill(r: Rand): Out {
  const o: Out = [];
  cone(o, -8, 0, -5, 14, 4, 12, pick(r, [0x7d6a55, 0x6f6a60]));
  cone(o, 6, 0, -7, 10, 3, 9, 0x8a8f94);
  cone(o, 8, 0, 3, 8, 2.5, 7, 0x6f5a45);
  box(o, -8, 0, 6, 12, 1.2, 8, 0x5c4a3a);
  box(o, -13, 0, 11, 5, 3, 4, 0xdfe3e6);
  gable(o, -13, 3, 11, 5.6, 1.2, 4.6, 0x6b4a36);
  box(o, 0, 0, -14, 34, 1, 0.5, 0x8c959c);
  box(o, -17, 0, 0, 0.5, 1, 28, 0x8c959c);
  box(o, 17, 0, 0, 0.5, 1, 28, 0x8c959c);
  box(o, -8.6, 0, 14, 17, 1, 0.5, 0x8c959c);
  box(o, 8.6, 0, 14, 17, 1, 0.5, 0x8c959c);
  return o;
}

function recycling(r: Rand): Out {
  const o: Out = [];
  box(o, -3, 0, -6.5, 18, 6, 9, 0xdfe3e6);
  gable(o, -3, 6, -6.5, 18.4, 2, 9.4, 0x3f9a6a);
  box(o, -3, 0, -1.95, 5, 3.6, 0.2, 0x3f7fd0);
  win(o, 10, 0, -6, 5, 6, 5, 0xe9eef1);
  const cols = [0x3f7fd0, 0x4aa86a, 0xf0c64a];
  let i = 0;
  for (const z of [4, 8]) {
    for (const x of [-9, -4.5, 0, 4.5]) {
      box(o, x, 0, z, 3, 2, 2, cols[(i++ + Math.floor(r() * 3)) % 3] as number);
    }
  }
  return o;
}

function incinerator(): Out {
  const o: Out = [];
  box(o, -4, 0, -5, 20, 9, 12, 0xb9c1c7);
  box(o, -4, 9, -5, 20.4, 0.5, 12.4, 0x6b7480);
  cyl(o, 10, 0, -8, 3, 30, 3, WHITE);
  cyl(o, 10, 20, -8, 3.2, 3, 3.2, 0xc23b32);
  cyl(o, 10, 26, -8, 3.2, 3, 3.2, 0xc23b32);
  box(o, 10, 0, 6, 8, 4, 8, 0x8c959c);
  box(o, 10, 4, 6, 8.4, 0.4, 8.4, 0x5c6670);
  box(o, -4, 0, 2.5, 7, 0.8, 3.5, 0x9aa0a6);
  box(o, -4, 0, 5.5, 7, 0.5, 3, 0x9aa0a6);
  box(o, -4, 0, 8.2, 7, 0.25, 2.5, 0x9aa0a6);
  box(o, -12, 0, 8, 4, 2.4, 3, 0xb4562f);
  return o;
}

// ---------------------------------------------------------------- police and fire
function police(l: number): Out {
  const o: Out = [];
  const big = l === 2;
  if (!big) {
    win(o, -1.5, 0, -3.5, 14, 6, 9, 0xe6edf3);
    box(o, -1.5, 6, -3.5, 14.4, 0.6, 9.4, 0x2f6fb5);
    box(o, 2, 6.6, -3, 2, 0.9, 1, 0x3f7fd0);
    box(o, -1.5, 0, 1.55, 3, 3.2, 1.2, 0xdfe6ec);
    patch(o, 0, 6.3, 18, 5.6, ASPHALT);
    car(o, -5, 0.12, 6.3, 0xeeeeee, false);
    car(o, 0, 0.12, 6.3, 0x2f6fb5, false);
    car(o, 5, 0.12, 6.3, 0xeeeeee, false);
  } else {
    win(o, -3, 0, -7, 22, 15, 12, 0xe6edf3);
    box(o, -3, 15, -7, 22.4, 0.6, 12.4, 0x2f6fb5);
    win(o, 11, 0, -5, 10, 6, 10, 0xdfe6ec);
    box(o, 11, 6, -5, 10.4, 0.5, 10.4, 0x2f6fb5);
    helipad(o, -9, 15.6, -7, 8);
    box(o, 0, 15.6, -7, 2, 1, 1, 0x3f7fd0);
    box(o, 5, 15.6, -11, 0.4, 5, 0.4, 0xc4c9ce);
    box(o, -3, 0, -0.7, 6, 3.4, 1.4, 0xdfe6ec);
    patch(o, 0, 10, 26, 7, ASPHALT);
    car(o, -8, 0.12, 10, 0xeeeeee, false);
    car(o, -2, 0.12, 10, 0x2f6fb5, false);
    car(o, 4, 0.12, 10, 0xeeeeee, false);
  }
  return o;
}

function fire(l: number): Out {
  const o: Out = [];
  const red = 0xc23b32;
  if (l === 1) {
    box(o, -2.5, 0, -4, 16, 6, 10, red);
    box(o, -2.5, 6, -4, 16.4, 0.5, 10.4, WHITE);
    for (const x of [-7, -2.5, 2]) box(o, x, 0, 1.15, 3.8, 4, 0.3, 0xe9eaec);
    box(o, 8, 0, -6, 3, 12, 3, 0xa8302b);
    box(o, 8, 12, -6, 3.4, 0.5, 3.4, WHITE);
    patch(o, -1, 5.8, 20, 5.2, 0x8c959c);
    box(o, -2.5, 0.12, 5.8, 8, 2.4, 3, red);
  } else {
    box(o, -3, 0, -6, 26, 7, 12, red);
    win(o, -3, 7, -7, 14, 6, 9, 0xe9d9d2);
    box(o, -3, 13, -7, 14.4, 0.5, 9.4, WHITE);
    box(o, -3, 7, -6, 26.4, 0.5, 12.4, WHITE);
    for (const x of [-13, -8, -3, 2, 7]) box(o, x, 0, 0.15, 4, 4.5, 0.3, 0xe9eaec);
    box(o, 13, 0, -8, 4, 20, 4, 0xa8302b);
    box(o, 13, 20, -8, 4.4, 0.5, 4.4, WHITE);
    patch(o, -2, 8, 30, 8, 0x8c959c);
    box(o, -8, 0.12, 8, 8, 2.4, 3, red);
    box(o, 2, 0.12, 8, 8, 2.4, 3, red);
  }
  return o;
}

// ---------------------------------------------------------------- health
function clinic(): Out {
  const o: Out = [];
  win(o, 0, 0, -4, 14, 6, 9, WHITE);
  box(o, 0, 6, -4, 14.4, 0.5, 9.4, 0x8fb4cf);
  cross(o, 0, 6.5, -4, 3.6);
  box(o, 0, 0, 1.4, 4, 3.2, 1.8, 0xdfe9ef);
  box(o, 0, 3.2, 2.6, 5.4, 0.3, 2.4, 0x8fb4cf);
  patch(o, -3.5, 6.8, 11, 4.4, ASPHALT);
  tree(o, 8.6, 6.4, 0.9, 0x4a9d4f, true);
  car(o, -6, 0.12, 6.8, 0xeeeeee, false);
  return o;
}

function hospital(r: Rand): Out {
  const o: Out = [];
  const hl = r() < 0.5 ? 18 : 21;
  const hr = hl === 18 ? 21 : 18;
  win(o, -12, 0, 0, 10, hl, 26, WHITE);
  win(o, 12, 0, 0, 10, hr, 26, WHITE);
  win(o, 0, 0, 0, 14, 12, 8, 0xeef2f5);
  cross(o, 0, 12, 0, 5);
  helipad(o, hl > hr ? -12 : 12, hl > hr ? hl : hr, 0, 8);
  box(o, 0, 0, 6.5, 6, 3.6, 5, 0xdfe9ef);
  box(o, 0, 3.6, 9.4, 7.4, 0.35, 2.6, 0xd9363e);
  box(o, -3.2, 0, 10.2, 0.4, 3.6, 0.4, WHITE);
  box(o, 3.2, 0, 10.2, 0.4, 3.6, 0.4, WHITE);
  patch(o, 0, 12.8, 12, 4.2, ASPHALT);
  box(o, 4.5, 0.12, 12.8, 1.8, 1.8, 4, WHITE);
  return o;
}

// ---------------------------------------------------------------- schools
function school(r: Rand): Out {
  const o: Out = [];
  const brick = pick(r, [0xc2704f, 0xb5604a, 0xc98a5a]);
  win(o, -2, 0, -6.9, 22, 6, 6.8, brick);
  win(o, -9.5, 0, 3.3, 7, 6, 13.8, brick);
  box(o, -2, 6, -6.9, 22.4, 0.5, 7, 0x6b4a36);
  box(o, -9.5, 6, 3.3, 7.4, 0.5, 14.2, 0x6b4a36);
  box(o, -4.5, 0, -3.1, 3.6, 3.4, 1.4, 0xe9e2d0);
  patch(o, 4, 4, 12, 10, 0xd9cfae);
  flag(o, 9.5, 8.5, 0xd9363e);
  tree(o, 10.4, -1, 0.9, pick(r, GREENS), true);
  tree(o, -3, 9, 0.8, pick(r, GREENS), false);
  return o;
}

function highSchool(r: Rand): Out {
  const o: Out = [];
  const brick = pick(r, [0xc2704f, 0xb5604a, 0xc98a5a]);
  win(o, -6, 0, -8.5, 22, 9, 8, brick);
  win(o, -14, 0, 0, 6, 9, 14, brick);
  box(o, -6, 9, -8.5, 22.4, 0.5, 8.4, 0x6b4a36);
  box(o, -14, 9, 0, 6.4, 0.5, 14.4, 0x6b4a36);
  box(o, 11, 0, -5, 11, 7, 14, 0xe4dccb);
  gable(o, 11, 7, -5, 11.6, 3, 14.6, 0x4a6a8c, true);
  box(o, -6, 0, -3.8, 4, 3.4, 1.6, 0xe9e2d0);
  patch(o, -2, 7.5, 16, 9, 0x6cc24a);
  patch(o, -2, 7.5, 17, 10, 0xd9cfae, 0, 0.06);
  flag(o, 9, 8.5, 0x2f6fb5);
  tree(o, 14.5, 8, 0.9, pick(r, GREENS), true);
  return o;
}

function university(r: Rand): Out {
  const o: Out = [];
  const brick = pick(r, [0xc2704f, 0xc9a77c, 0xd8cdb4]);
  win(o, 0, 0, -14, 28, 12, 9, brick);
  box(o, 0, 12, -14, 28.4, 0.5, 9.4, 0x6b4a36);
  cyl(o, 0, 12.5, -14, 10, 3, 10, 0xe4dccb);
  dome(o, 0, 15.5, -14, 10, 5, 10, 0x3f9a8a);
  win(o, -19, 0, 2, 10, 15, 16, pick(r, [0xc2704f, 0xc9a77c, 0xd8cdb4]));
  box(o, -19, 15, 2, 10.4, 0.5, 16.4, 0x6b4a36);
  win(o, 19, 0, 3, 10, 9, 14, pick(r, [0xc2704f, 0xc9a77c, 0xd8cdb4]));
  box(o, 19, 9, 3, 10.4, 0.5, 14.4, 0x6b4a36);
  box(o, 0, 0, 14, 18, 6, 6, 0xe4dccb);
  gable(o, 0, 6, 14, 19, 2.4, 6.6, 0x8a3b32);
  patch(o, 0, 2.5, 24, 14.5, 0x6cc24a);
  box(o, 0, 0.12, 0.75, 2.4, 0.05, 20.5, 0xe4dccb);
  box(o, 0, 0.12, 2.5, 30, 0.05, 2.4, 0xe4dccb);
  for (const x of [-9, 9]) {
    tree(o, x, -2, 1, pick(r, GREENS), true);
    tree(o, x, 7, 1, pick(r, GREENS), r() < 0.5);
  }
  return o;
}

// ---------------------------------------------------------------- parks
function park(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 0, 12.6, 14.6, 0x6cc24a);
  box(o, 0, 0.12, 2, 1.6, 0.06, 10, 0xe4dccb);
  box(o, 0, 0.12, -3, 9, 0.06, 1.6, 0xe4dccb);
  box(o, 2.2, 0.12, 3.5, 2.2, 0.5, 0.8, 0x8a5a32);
  box(o, 2.2, 0.62, 3.9, 2.2, 0.5, 0.15, 0x8a5a32);
  const slots: [number, number][] = [[-4.4, -5], [4.4, -4.8], [-4.4, 4.8], [4.4, 5.2]];
  const n = 3 + Math.floor(r() * 2);
  for (const [x, z] of shuffled(r, slots).slice(0, n)) tree(o, x + range(r, -0.2, 0.2), z + range(r, -0.3, 0.3), range(r, 0.9, 1.2), pick(r, GREENS), r() < 0.5);
  return o;
}

function playground(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 1, 11, 11, 0xecd9a0);
  box(o, -2.2, 2.6, -3, 4.4, 0.3, 0.3, 0xd9363e);
  box(o, -4.2, 0, -3, 0.3, 2.9, 0.3, 0xd9363e);
  box(o, -0.2, 0, -3, 0.3, 2.9, 0.3, 0xd9363e);
  for (const x of [-3.2, -1.2]) {
    box(o, x, 0.9, -3, 0.08, 1.7, 0.08, 0x6b7480);
    box(o, x, 0.8, -3, 0.8, 0.12, 0.5, pick(r, [0x3f7fd0, 0xf0c64a]));
  }
  box(o, 3.2, 0, -1.2, 1.4, 2.4, 1.4, 0x3f7fd0);
  box(o, 3.2, 0, 0.2, 0.9, 1.6, 1.6, 0xf0c64a);
  box(o, 3.2, 0, 1.8, 0.9, 0.9, 1.6, 0xf0c64a);
  box(o, 3.2, 0, 3.2, 0.9, 0.4, 1.4, 0xf0c64a);
  tree(o, -4.8, 5.2, 0.9, pick(r, GREENS), true);
  if (r() < 0.6) tree(o, 4.8, 5.6, 0.8, pick(r, GREENS), false);
  return o;
}

function plaza(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 0, 20.6, 18.6, 0xe0d8c4);
  cyl(o, 0, 0.12, 0, 8, 0.9, 8, 0xd5d8dc);
  cyl(o, 0, 0.12, 0, 6.8, 0.95, 6.8, 0x4aa3e0);
  cyl(o, 0, 0.12, 0, 1, 2.8, 1, 0xd5d8dc);
  dome(o, 0, 2.9, 0, 2.2, 0.8, 2.2, 0x4aa3e0);
  for (const [x, z] of [[-8.8, -7.4], [8.8, -7.4], [-8.8, 7.4], [8.8, 7.4]] as [number, number][]) tree(o, x, z, 1, pick(r, GREENS), true);
  box(o, 0, 0.12, -6.6, 2.6, 0.5, 0.8, 0x8a5a32);
  box(o, 0, 0.12, 6.6, 2.6, 0.5, 0.8, 0x8a5a32);
  return o;
}

function bigPark(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 0, 42.8, 32.6, 0x6cc24a);
  cyl(o, -9, 0.12, -4, 14, 0.12, 9, 0x4aa3e0);
  box(o, 2, 0.12, 0, 2, 0.06, 30, 0xe4dccb);
  box(o, 0, 0.12, 8, 36, 0.06, 2, 0xe4dccb);
  box(o, 8, 0.12, -1, 12, 0.06, 1.6, 0xe4dccb);
  // a pavilion
  box(o, 11, 0.12, -7, 7, 0.3, 7, 0xe4dccb);
  for (const [x, z] of [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]] as [number, number][]) box(o, 11 + x, 0.42, -7 + z, 0.5, 3, 0.5, WHITE);
  pyramid(o, 11, 3.4, -7, 8.4, 2.4, 8.4, pick(r, ROOF_HOME));
  const slots: [number, number][] = [
    [-18.5, -13], [-11, -13.5], [-4, -13], [6, -14], [15, -14], [19, -10], [19, -1], [14, 3.5],
    [7.5, 3.5], [-19, -3], [-19, 3], [-12, 4], [-15, 12.5], [-3, 12.5], [8, 12.5], [17, 12.5], [-8, 4.5], [19.5, 8],
  ];
  for (const [x, z] of shuffled(r, slots).slice(0, 12)) tree(o, x, z, range(r, 0.9, 1.3), pick(r, GREENS), r() < 0.5);
  return o;
}

function stadium(r: Rand): Out {
  const o: Out = [];
  const stand = pick(r, [0xb9bcbc, 0xc4c9ce, 0xaeb7be]);
  const a = 21.5;
  const b = 17;
  const n = 14;
  // the stands: boxes placed round an oval, each turned to follow it
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = a * Math.cos(t);
    const z = b * Math.sin(t);
    const tx = -a * Math.sin(t);
    const tz = b * Math.cos(t);
    const ry = Math.atan2(-tz, tx);
    box(o, x, 0, z, 9.6, 9, 6.5, i % 2 ? stand : 0xd2d6d9, { ry });
  }
  cyl(o, 0, 0, 0, 36, 0.12, 26, 0xc2704f);
  cyl(o, 0, 0.12, 0, 32, 0.1, 22, 0x4fb04f);
  for (const [x, z] of [[-21.5, -17], [21.5, -17], [-21.5, 17], [21.5, 17]] as [number, number][]) {
    box(o, x, 0, z, 0.8, 20, 0.8, 0x9aa0a6);
    box(o, x, 20, z, 3, 1.2, 1, 0xfff3b0);
  }
  return o;
}

// ---------------------------------------------------------------- transit
function busDepot(r: Rand): Out {
  const o: Out = [];
  box(o, -1.4, 0, -7, 22, 5, 8, 0xdfe3e6);
  box(o, -1.4, 5, -7, 22.4, 0.5, 8.4, 0x4aa86a);
  for (const x of [-7, -1.4, 4.2]) box(o, x, 0, -2.9, 5, 3.6, 0.2, 0x8a959f);
  win(o, 12, 0, -7, 4.6, 6, 5, 0xe9eef1);
  patch(o, 0, 3.5, 26, 13, ASPHALT);
  for (const x of [-8, -2, 4]) {
    box(o, x, 0.12, 5, 2.8, 2.8, 9, 0x3f9a5a);
    box(o, x, 1.2, 5, 2.9, 0.9, 7, 0x2f3d4a);
  }
  box(o, 10.5, 0, 6, 0.3, 4, 0.3, 0x6b7480);
  box(o, 10.5, 3.6, 6, 2, 1, 0.3, pick(r, [0xf0c64a, 0xe8553d]));
  return o;
}

function metro(): Out {
  const o: Out = [];
  win(o, -1, 0, -1, 9, 3.8, 7, 0x7fb6d6);
  box(o, -1, 3.8, -1, 10, 0.4, 8, 0x39424e);
  box(o, -1, 4.2, 2.2, 3.6, 1.3, 0.5, 0x2f6fb5);
  box(o, -1, 0, 2.6, 3.2, 2.8, 0.2, DARK);
  box(o, -1, 0, 3.4, 3.6, 0.3, 1.6, 0xb9bcbc);
  cyl(o, 5, 0, 3, 1.2, 6, 1.2, 0xd5d8dc);
  box(o, 5, 6, 3, 2.6, 2, 0.5, 0x2f6fb5);
  return o;
}


// ---------------------------------------------------------------- trams and landmarks
function tramDepot(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 2, 32, 21, ASPHALT);
  box(o, -3, 0, -6, 24, 6.5, 11, 0xe4ddd0);
  gable(o, -3, 6.5, -6, 24.6, 3.2, 11.6, 0x8a3b32);
  for (const x of [-11, -3, 5]) box(o, x, 0, -0.45, 6, 5, 0.2, 0x6b7480);
  win(o, 12.5, 0, -6, 5, 7, 8, 0xe9eef1);
  // tracks and two trams
  for (const x of [-11, -3, 5]) patch(o, x, 6, 1.8, 13, 0x8d8579, 0.12, 0.1);
  for (const x of [-11, 5]) {
    box(o, x, 0.25, 6.5, 2.6, 3.1, 11, pick(r, [0xe8c23a, 0xd94f4f]));
    box(o, x, 1.6, 6.5, 2.7, 1.1, 9.5, 0x2f3d4a);
    box(o, x, 3.35, 6.5, 0.2, 0.9, 0.2, 0x39424e);
  }
  box(o, 13, 0, 9, 0.3, 4.5, 0.3, 0x6b7480);
  box(o, 13, 4.1, 9, 2.2, 1.1, 0.3, 0xe8c23a);
  return o;
}

function monument(r: Rand): Out {
  const o: Out = [];
  const stone = 0xe9e4d8, gold = 0xf2c14e;
  patch(o, 0, 0, 17, 17, 0xd9d4c7);
  patch(o, 0, 0, 11, 11, 0xcac3b2, 0.12, 0.3);
  box(o, 0, 0.4, 0, 7, 1.2, 7, stone);
  box(o, 0, 1.6, 0, 5, 1.2, 5, stone);
  box(o, 0, 2.8, 0, 2.6, 18, 2.6, 0xf3efe6);
  pyramid(o, 0, 20.8, 0, 2.6, 2.4, 2.6, gold);
  box(o, 0, 3.6, 1.36, 1.6, 1.6, 0.1, gold);
  for (const [x, z] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]] as [number, number][]) tree(o, x, z, 0.9, pick(r, GREENS), true);
  for (const [x, z] of [[0, -6.8], [-6.8, 0], [6.8, 0]] as [number, number][]) patch(o, x, z, 3, 1.4, 0xe0679a, 0.12, 0.5);
  return o;
}

function cityHall(r: Rand): Out {
  const o: Out = [];
  const stone = 0xeee6d6, roof = 0x5f7d8c;
  patch(o, 0, 0, 31, 25, 0xd9d4c7);
  patch(o, -10, 8, 7, 7, 0x6fb35a, 0.12, 0.2);
  patch(o, 10, 8, 7, 7, 0x6fb35a, 0.12, 0.2);
  win(o, 0, 0, -3, 26, 9, 12, stone);
  box(o, 0, 9, -3, 26.6, 0.8, 12.6, 0xd8cfbd);
  box(o, 0, 0, 4.2, 12, 0.6, 3, 0xd8cfbd);
  box(o, 0, 0.6, 4.4, 12, 0.6, 2, 0xd8cfbd);
  for (let i = 0; i < 6; i++) cyl(o, -5 + i * 2, 1.2, 4.2, 0.9, 7.8, 0.9, 0xfaf6ee);
  box(o, 0, 9, 4.2, 12.4, 0.8, 1.6, 0xd8cfbd);
  gable(o, 0, 9.8, 4.2, 12.4, 2.6, 1.6, stone);
  box(o, 0, 9.8, -3, 7, 5, 7, stone);
  cyl(o, 0, 14.8, -3, 5.6, 3, 5.6, 0xfaf6ee);
  dome(o, 0, 17.8, -3, 5.6, 2.8, 5.6, roof);
  box(o, 0, 23.2, -3, 0.3, 2.6, 0.3, 0xf2c14e);
  cyl(o, 0, 12, 0.55, 2.2, 2.2, 0.2, 0xffffff, { rx: Math.PI / 2 });
  flag(o, -12.5, 9.5, pick(r, [0xd94f4f, 0x3f7fd0, 0x4aa86a]));
  flag(o, 12.5, 9.5, 0xf2c14e);
  return o;
}

/** A big wheel standing in the x-y plane, its hub at height h. */
function wheel(o: Out, x: number, z: number, h: number, R: number, turn = 0): void {
  const first = o.length;
  wheelParts(o, x, z, h, R, turn);
  for (let i = first; i < o.length; i++) o[i].tag = "wheel";
}
export function wheelParts(o: Out, x: number, z: number, h: number, R: number, turn: number): void {
  const n = 16, seg = (2 * Math.PI * R) / n;
  const cabins = [0xe8553d, 0xf2b134, 0x3fa7d6, 0x59b36a, 0xd9569a, 0x9b6bd6];
  for (let i = 0; i < n; i++) {
    const t = turn + (i / n) * Math.PI * 2;
    const px = x + Math.cos(t) * R, py = h + Math.sin(t) * R;
    // a piece of the rim, along the circle
    box(o, px + Math.sin(t) * seg * 0.5, py - Math.cos(t) * seg * 0.5, z, 0.5, seg * 1.02, 0.5, 0xf5f6f4, { rz: t });
    // a spoke from the hub
    if (i % 2 === 0) box(o, x, h, z, 0.25, R, 0.25, 0xdfe3e6, { rz: t - Math.PI / 2 });
    if (i % 2 === 0) box(o, px, py - 2.1, z, 1.6, 1.7, 1.6, cabins[(i / 2) % cabins.length]);
  }
  cyl(o, x, h - 0.9, z - 0.6, 1.8, 1.8, 1.8, 0x9aa0a6, { rx: Math.PI / 2 });
}

function ferris(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 0, 39, 31, 0xd9cfb4);
  patch(o, -12, -8, 12, 12, 0x6fb35a, 0.12, 0.2);
  const hub = 15, R = 12.5;
  // two A-frames holding the hub
  for (const z of [-2.2, 1.6]) {
    box(o, -5, 0, z, 0.8, hub / Math.cos(0.33), 0.8, 0xc8ccd0, { rz: -0.33 });
    box(o, 5, 0, z, 0.8, hub / Math.cos(0.33), 0.8, 0xc8ccd0, { rz: 0.33 });
  }
  wheel(o, 0, 0.4, hub, R);
  // a carousel, stalls and trees
  cyl(o, 13, 0, -6, 8, 0.6, 8, 0xe8d9b5);
  for (let i = 0; i < 8; i++) { const t = (i / 8) * Math.PI * 2; cyl(o, 13 + Math.cos(t) * 3, 0.6, -6 + Math.sin(t) * 3, 0.3, 3, 0.3, 0xf2c14e); }
  cone(o, 13, 3.6, -6, 9, 3, 9, 0xd94f4f);
  for (const [x, c] of [[-13, 0xe8553d], [-8, 0x3fa7d6], [9, 0x59b36a]] as [number, number][]) {
    box(o, x, 0, 11, 3.4, 2.6, 3, 0xf6efe0);
    box(o, x, 2.6, 11, 3.8, 0.5, 3.6, c);
  }
  for (const [x, z] of [[-16, -12], [-9, -12], [-16, -5], [17, 9], [17, 3]] as [number, number][]) tree(o, x, z, 1, pick(r, GREENS), r() < 0.6);
  return o;
}

function tvTower(): Out {
  const o: Out = [];
  patch(o, 0, 0, 21, 21, 0xd9d4c7);
  box(o, 0, 0, 0, 14, 5, 14, 0xdfe3e6);
  win(o, 0, 0, 7.2, 10, 4, 0.4, 0xe9eef1);
  add(o, "tower", 0, 5, 0, 6, 62, 6, 0xe9ecef);
  cyl(o, 0, 50, 0, 12, 3, 12, 0xdfe3e6);
  win(o, 0, 53, 0, 10, 4, 10, 0xc9d8e6);
  cyl(o, 0, 57, 0, 11, 1.2, 11, 0xdfe3e6);
  dome(o, 0, 58.2, 0, 7, 3, 7, 0xd94f4f);
  box(o, 0, 61, 0, 0.8, 9, 0.8, 0xf5f6f4);
  box(o, 0, 70, 0, 0.5, 5, 0.5, 0xd94f4f);
  return o;
}

function harbour(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 0, 51, 35, 0xb9bcbc);
  // a warehouse
  box(o, -14, 0, 8, 20, 8, 12, 0xd7c3a3);
  gable(o, -14, 8, 8, 20.4, 2.4, 12.4, 0x6b7480);
  for (const x of [-20, -14, -8]) box(o, x, 0, 14.1, 4, 5, 0.2, 0x8a959f);
  // stacks of containers
  const colors = [0xd94f4f, 0x3f7fd0, 0xf2b134, 0x4aa86a, 0xe07a2f, 0x7a4fd0, 0xeeeeee];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++) {
      const hgt = 1 + Math.floor(r() * 3);
      for (let k = 0; k < hgt; k++) box(o, 4 + i * 3.1, k * 2.6, 6 + j * 6.6, 2.6, 2.5, 6.2, pick(r, colors));
    }
  // two cranes at the quay
  for (const x of [-6, 14]) {
    box(o, x - 3, 0, -10, 1, 20, 1, 0xe8b23a);
    box(o, x + 3, 0, -10, 1, 20, 1, 0xe8b23a);
    box(o, x, 20, -9, 8, 2, 2, 0xe8b23a);
    box(o, x, 21, -12, 1.4, 1.4, 22, 0xe8b23a);
    box(o, x, 18, -16, 0.2, 3, 0.2, 0x39424e);
  }
  for (let x = -22; x <= 22; x += 6) cyl(o, x, 0, -16.5, 0.9, 1, 0.9, 0x39424e);
  return o;
}

function cathedral(): Out {
  const o: Out = [];
  const stone = 0xdcd2bf, roof = 0x5fa08a;
  patch(o, 0, 0, 33, 43, 0xd9d4c7);
  // the nave and the crossing
  box(o, 0, 0, -2, 12, 13, 30, stone);
  gable(o, 0, 13, -2, 12.4, 6, 30.4, roof, true);
  box(o, 0, 0, -6, 26, 11, 9, stone);
  gable(o, 0, 11, -6, 26.4, 5, 9.4, roof);
  cyl(o, 0, 0, -17, 12, 10, 8, stone);
  dome(o, 0, 10, -17, 12, 3, 8, roof);
  // a tower over the crossing
  box(o, 0, 13, -6, 5, 8, 5, stone);
  add(o, "cone", 0, 21, -6, 5.6, 10, 5.6, roof);
  // the front with two towers and a round window
  for (const x of [-7.5, 7.5]) {
    box(o, x, 0, 14.5, 5.5, 22, 5.5, stone);
    pyramid(o, x, 22, 14.5, 5.6, 9, 5.6, roof);
    box(o, x, 14, 17.3, 1.6, 4, 0.1, 0x5a6b8c);
  }
  box(o, 0, 0, 14.5, 9.5, 16, 5, stone);
  gable(o, 0, 16, 14.5, 9.8, 4, 5.2, stone);
  cyl(o, 0, 10.5, 17.05, 4.2, 4.2, 0.2, 0x7a5ad8, { rx: Math.PI / 2 });
  box(o, 0, 0, 17.1, 3.2, 5.2, 0.2, 0x6b4a36);
  for (const x of [-10, 10]) for (const z of [-12, 2]) tree(o, x + (x < 0 ? -4 : 4), z, 1, GREENS[1], true);
  return o;
}

/** A rocket standing at (x, y, z) with its two boosters. */
export function rocket(o: Out, x: number, y: number, z: number): void {
  cyl(o, x, y, z, 4.2, 40, 4.2, 0xf5f6f4);
  cone(o, x, y + 40, z, 4.2, 7, 4.2, 0xd94f4f);
  for (const dx of [-3.1, 3.1]) {
    cyl(o, x + dx, y, z, 2, 20, 2, 0xe9ecef);
    cone(o, x + dx, y + 20, z, 2, 3, 2, 0xe9ecef);
  }
}

/** A plane standing on the ground, nose pointing along +x (or turned by ry). */
export function plane(o: Out, x: number, z: number, s: number, ry: number, c: number): void {
  const t = { ry };
  const cx = Math.cos(ry), sz = -Math.sin(ry);
  cyl(o, x - cx * 8 * s, 1.2 * s, z - sz * 8 * s, 2.4 * s, 16 * s, 2.4 * s, c, { ry, rz: -Math.PI / 2 });
  cone(o, x + cx * 8 * s, 1.2 * s, z + sz * 8 * s, 2.4 * s, 3 * s, 2.4 * s, 0xdfe3e6);
  box(o, x, 1.9 * s, z, 4 * s, 0.4 * s, 16 * s, 0xdfe3e6, t);
  box(o, x - cx * 7 * s, 2.4 * s, z - sz * 7 * s, 2.2 * s, 3.6 * s, 0.4 * s, c, t);
  box(o, x - cx * 7.2 * s, 2.2 * s, z - sz * 7.2 * s, 1.8 * s, 0.3 * s, 6 * s, 0xdfe3e6, t);
  box(o, x, 0, z, 1 * s, 1.2 * s, 6 * s, 0x39424e, t);
}

function airport(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 0, 119, 71, 0x8fbf6a);
  // the runway with its markings
  patch(o, 0, -24, 116, 12, 0x4b4e56, 0.12, 0.15);
  for (let x = -50; x <= 50; x += 10) patch(o, x, -24, 5, 0.6, 0xf5f6f4, 0.27, 0.05);
  for (const x of [-55, 55]) for (let k = -2; k <= 2; k++) patch(o, x, -24 + k * 2, 3, 0.8, 0xf5f6f4, 0.27, 0.05);
  // taxiway and apron
  patch(o, 0, -10, 90, 5, 0x5b6168, 0.12, 0.14);
  patch(o, 10, 6, 76, 18, 0x6b7178, 0.12, 0.14);
  // the terminal
  win(o, 10, 0, 22, 70, 8, 10, 0xd9e8f0);
  cyl(o, 10, 6.5, 22, 70, 6, 11, 0xe9ecef, { rz: Math.PI / 2 });
  for (const x of [-10, 10, 30]) {
    box(o, x, 3, 13, 2.4, 2.6, 8, 0xc4cdd2);
  }
  // the control tower
  cyl(o, -40, 0, 16, 4, 22, 4, 0xe9ecef);
  win(o, -40, 22, 16, 7, 4, 7, 0x7fb6d6);
  box(o, -40, 26, 16, 8, 0.8, 8, 0x39424e);
  // a hangar
  box(o, -44, 0, 0, 18, 9, 14, 0xc4cdd2);
  cyl(o, -44, 5, 0, 18, 8, 14.4, 0xb9c4cc, { rz: Math.PI / 2 });
  plane(o, -10, 6, 1, 0, pick(r, [0x3f7fd0, 0xd94f4f]));
  plane(o, 26, 6, 1, 0, pick(r, [0x4aa86a, 0xe8b23a]));
  plane(o, 30, -24, 1.1, Math.PI, 0xf5f6f4);
  return o;
}

function opera(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 0, 43, 35, 0xd9d4c7);
  box(o, 0, 0, -4, 34, 4, 24, 0xc9b79c);
  // three white shells
  dome(o, -9, 4, -4, 14, 9, 20, 0xf5f6f4);
  dome(o, 3, 4, -6, 12, 7.5, 17, 0xf2f2ee);
  dome(o, 12, 4, -2, 9, 5.5, 12, 0xf5f6f4);
  // the glass foyer
  win(o, 0, 0, 10, 28, 7, 6, 0xb8d4e6);
  box(o, 0, 7, 10, 29, 0.6, 7, 0xe9ecef);
  for (let i = 0; i < 8; i++) cyl(o, -12.6 + i * 3.6, 0, 13.6, 0.6, 7, 0.6, 0xfaf6ee);
  // a fountain
  cyl(o, -15, 0, 14, 5, 0.6, 5, 0xb9bcbc);
  cyl(o, -15, 0.6, 14, 4, 0.2, 4, 0x5aa9e6);
  cyl(o, -15, 0.6, 14, 0.5, 2.4, 0.5, 0xd5e9f7);
  for (const [x, z] of [[17, 14], [19, 6], [-19, 4]] as [number, number][]) tree(o, x, z, 1, pick(r, GREENS), true);
  return o;
}

function spire(): Out {
  const o: Out = [];
  const glass = 0x6aa8c8, steel = 0xc4cdd2, gold = 0xf2c14e;
  patch(o, 0, 0, 29, 29, 0xd9d4c7);
  box(o, 0, 0, 0, 24, 8, 24, steel);
  win(o, 0, 8, 0, 20, 46, 20, glass);
  box(o, 0, 54, 0, 21, 1.2, 21, steel);
  win(o, 0, 55.2, 0, 16, 40, 16, glass);
  box(o, 0, 95.2, 0, 17, 1.2, 17, steel);
  win(o, 0, 96.4, 0, 11, 26, 11, glass);
  box(o, 0, 122.4, 0, 12, 1.2, 12, gold);
  pyramid(o, 0, 123.6, 0, 11, 10, 11, 0x9cc8e0);
  box(o, 0, 133.6, 0, 0.6, 16, 0.6, 0xf5f6f4);
  box(o, 0, 0, 12.2, 8, 5, 0.4, gold);
  return o;
}

function space(r: Rand): Out {
  const o: Out = [];
  patch(o, 0, 0, 91, 69, 0xc9c3a8);
  // the launch pad with its rocket and tower
  cyl(o, -24, 0, -14, 22, 1.5, 22, 0x9aa0a6);
  const first = o.length;
  rocket(o, -24, 1.5, -14);
  for (let i = first; i < o.length; i++) o[i].tag = "rocket";
  box(o, -24, 30, -14, 0.6, 0.6, 1, 0x39424e);
  for (const [dx, dz] of [[-2.2, -9], [2.2, -9]] as [number, number][]) box(o, -24 + dx, 1.5, -14 + dz, 1.2, 46, 1.2, 0xd94f4f);
  box(o, -24, 1.5, -23, 5.6, 1, 1.2, 0xd94f4f);
  for (let h = 8; h < 46; h += 9) box(o, -24, 1.5 + h, -23, 5.6, 0.6, 1.2, 0xd94f4f);
  // the assembly hall and mission control
  win(o, 20, 0, -12, 30, 30, 24, 0xe9ecef);
  box(o, 20, 26, 0.4, 14, 3, 0.4, 0x3f7fd0);
  win(o, 22, 0, 22, 34, 6, 14, 0xb8d4e6);
  box(o, 22, 6, 22, 35, 0.6, 15, 0xc4cdd2);
  // a dish
  cyl(o, -30, 0, 22, 1.2, 8, 1.2, 0xdfe3e6);
  dome(o, -30, 8, 22, 12, 4, 12, 0xf5f6f4);
  for (const [x, z] of [[-42, 30], [-10, 30], [42, 30]] as [number, number][]) tree(o, x, z, 1.1, pick(r, GREENS), r() < 0.5);
  return o;
}

// ---------------------------------------------------------------- the plan for each kind
function build(kind: number, level: number, r: Rand): Out | null {
  const l = Math.min(3, Math.max(1, Math.round(level) || 1));
  switch (kind) {
    case Zone.ResLow: return resLow(l, r);
    case Zone.ResHigh: return resHigh(l, r);
    case Zone.ComLow: return comLow(l, r);
    case Zone.ComHigh: return comHigh(l, r);
    case Zone.Industry: return industry(l, r);
    case Zone.Office: return office(l, r);
    case Zone.Farm: return farm(r);
    case Zone.Forestry: return forestry(r);
    case Zone.Ore: return ore(r);
    case Zone.Oil: return oil(r);
    case Kind.Wind: return wind();
    case Kind.Coal: return coal(r);
    case Kind.Solar: return solar(r);
    case Kind.Nuclear: return nuclear(r);
    case Kind.Pump: return pump();
    case Kind.Tower: return waterTower();
    case Kind.Outlet: return outlet();
    case Kind.Septic: return septic();
    case Kind.Treatment: return treatment();
    case Kind.Landfill: return landfill(r);
    case Kind.Incinerator: return incinerator();
    case Kind.Recycling: return recycling(r);
    case Kind.Police: return police(1);
    case Kind.PoliceHQ: return police(2);
    case Kind.Fire: return fire(1);
    case Kind.FireHQ: return fire(2);
    case Kind.Clinic: return clinic();
    case Kind.Hospital: return hospital(r);
    case Kind.School: return school(r);
    case Kind.HighSchool: return highSchool(r);
    case Kind.University: return university(r);
    case Kind.Park: return park(r);
    case Kind.Playground: return playground(r);
    case Kind.Plaza: return plaza(r);
    case Kind.BigPark: return bigPark(r);
    case Kind.Stadium: return stadium(r);
    case Kind.BusDepot: return busDepot(r);
    case Kind.Metro: return metro();
    case Kind.TramDepot: return tramDepot(r);
    case Kind.Monument: return monument(r);
    case Kind.CityHall: return cityHall(r);
    case Kind.Ferris: return ferris(r);
    case Kind.TvTower: return tvTower();
    case Kind.Harbour: return harbour(r);
    case Kind.Cathedral: return cathedral();
    case Kind.Airport: return airport(r);
    case Kind.Opera: return opera(r);
    case Kind.Spire: return spire();
    case Kind.Space: return space(r);
    default: return null;
  }
}

// ---------------------------------------------------------------- finishing touches
/** Swap left and right. */
function mirror(parts: Part[]): void {
  for (const p of parts) {
    p.x = -p.x;
    if (p.ry) p.ry = -p.ry;
    if (p.rz) p.rz = -p.rz;
  }
}

/** How far a part reaches sideways (x) and in depth (z) from the middle of the plot, turns included. */
function reach(p: Part): { x: number; z: number } {
  const ry = p.ry ?? 0, rx = p.rx ?? 0, rz = p.rz ?? 0;
  let mx = 0, mz = 0;
  for (const cx of [-0.5, 0.5]) for (const cy of [0, 1]) for (const cz of [-0.5, 0.5]) {
    let x = cx * p.sx, y = cy * p.sy, z = cz * p.sz;
    let t = x * Math.cos(ry) + z * Math.sin(ry);
    z = -x * Math.sin(ry) + z * Math.cos(ry); x = t;
    t = y * Math.cos(rx) - z * Math.sin(rx);
    z = y * Math.sin(rx) + z * Math.cos(rx); y = t;
    t = x * Math.cos(rz) - y * Math.sin(rz);
    x = t;
    mx = Math.max(mx, Math.abs(p.x + x));
    mz = Math.max(mz, Math.abs(p.z + z));
  }
  return { x: mx, z: mz };
}

/** If the plot is smaller than the plan expects, shrink the plan sideways so nothing pokes out. */
function fit(parts: Part[], w: number, d: number): void {
  let f = 1;
  for (const p of parts) {
    const e = reach(p);
    if (e.x > 1e-6) f = Math.min(f, Math.max(0.2, (w / 2 - 0.6)) / e.x);
    if (e.z > 1e-6) f = Math.min(f, Math.max(0.2, (d / 2 - 0.6)) / e.z);
  }
  if (f >= 1) return;
  for (const p of parts) {
    p.x *= f; p.z *= f; p.sx *= f; p.sz *= f;
  }
}

/** The parts of a building. Same arguments, same result (the variant gives the randomness). */
export function blueprint(kind: number, level: number, variant: number, w: number, d: number): Part[] {
  const r = mulberry32(((variant & 255) + 1) * 2654435761 + kind * 40503);
  const flip = r() < 0.5;
  const parts = build(kind, level, r);
  if (!parts) {
    return [{ shape: "box", x: 0, y: 0, z: 0, sx: Math.max(1, Math.min(6, w - 1.2)), sy: 4, sz: Math.max(1, Math.min(6, d - 1.2)), color: 0x9aa0a6 }];
  }
  if (flip) mirror(parts);
  fit(parts, w, d);
  return parts;
}
