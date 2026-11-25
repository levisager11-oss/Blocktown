// Helpers that build a small test city the way a player would.
import { City, CityOptions } from "../src/sim/city";
import { Kind, Road, Zone } from "../src/sim/defs";
import type { Anchor } from "../src/sim/roads";

export function anchorAt(city: City, x: number, z: number): Anchor {
  const node = city.roads.nearestNode(x, z, 7);
  if (node) return { x: node.x, z: node.z, node: node.id };
  const hit = city.roads.nearestSeg(x, z, 6);
  if (hit) return { x: hit.x, z: hit.z, seg: hit.seg.id, t: hit.t };
  return { x, z };
}

export function road(city: City, x0: number, z0: number, x1: number, z1: number, type = Road.Street, ctrl: { x: number; z: number } | null = null) {
  const plan = city.planRoad(anchorAt(city, x0, z0), anchorAt(city, x1, z1), ctrl, type);
  return { ok: plan.ok && city.buildRoad(plan), reason: plan.reason };
}

/** A flat, dry spot on the highway to start a town from, and the side of the highway to build on. */
export function startSpot(city: City, reach = 260): { x: number; z: number; dx: number; dz: number } {
  let best = { x: 0, z: 0, dx: 1, dz: 0 }, score = -Infinity;
  const p = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
  const T = city.terrain;
  for (const seg of city.roads.segs.values()) {
    for (const side of [1, -1]) {
      city.roads.pos(seg, seg.len / 2, p);
      const ux = -p.dz * side, uz = p.dx * side;
      let s = 0;
      for (let u = 0; u <= reach; u += 20)
        for (let v = -reach / 2; v <= reach / 2; v += 20) {
          const x = p.x + ux * u + p.dx * v, z = p.z + uz * u + p.dz * v;
          if (!T.inside(x, z, 12) || T.heightAt(x, z) < 3.2) s -= 5;
          else s -= T.slopeAt(x, z) * 12;
        }
      if (s > score) { score = s; best = { x: p.x, z: p.z, dx: p.dx * side, dz: p.dz * side }; }
    }
  }
  return best;
}

/** Builds a grid of streets next to the highway and zones it. Returns how many roads could not be built. */
export function buildTown(city: City, cols = 3, rows = 3, block = 54, wide = 102): { failed: string[]; origin: { x: number; z: number } } {
  const s = startSpot(city);
  // Axes: u runs away from the highway, v along it.
  const ux = -s.dz, uz = s.dx, vx = s.dx, vz = s.dz;
  const failed: string[] = [];
  const P = (i: number, j: number) => ({ x: s.x + ux * (30 + i * block) + vx * (j - cols / 2) * wide, z: s.z + uz * (30 + i * block) + vz * (j - cols / 2) * wide });
  // The access road from the highway.
  const a0 = P(0, Math.floor(cols / 2));
  let r = road(city, s.x, s.z, a0.x, a0.z, Road.Street);
  if (!r.ok) failed.push("access:" + r.reason);
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = P(i, j), b = P(i, j + 1);
      r = road(city, a.x, a.z, b.x, b.z);
      if (!r.ok) failed.push(`row${i},${j}:${r.reason}`);
    }
  }
  for (let j = 0; j <= cols; j++) {
    for (let i = 0; i < rows; i++) {
      const a = P(i, j), b = P(i + 1, j);
      r = road(city, a.x, a.z, b.x, b.z);
      if (!r.ok) failed.push(`col${j},${i}:${r.reason}`);
    }
  }
  return { failed, origin: P(0, 0) };
}

/** Zones every empty plot: mostly homes, some shops and industry. */
export function zoneAll(city: City, share = { r: 0.6, c: 0.15, i: 0.25 }) {
  let n = 0;
  for (const lot of city.lots.lots.values()) {
    if (lot.zone || lot.custom) continue;
    const k = (n * 0.61803) % 1;
    city.setZone(lot, k < share.r ? Zone.ResLow : k < share.r + share.c ? Zone.ComLow : Zone.Industry);
    n++;
  }
  return n;
}

export function placeNear(city: City, kind: Kind, x: number, z: number): boolean {
  for (let r = 0; r < 400; r += 12) {
    for (let a = 0; a < 6.28; a += 0.5) {
      const p = city.placement(kind, x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (p.ok) return !!city.place(kind, p);
    }
  }
  return false;
}

export function run(city: City, days: number) {
  const steps = Math.round((days * 60) / 0.25);
  for (let i = 0; i < steps; i++) city.step(0.25);
}

export const newCity = (o: Partial<CityOptions> = {}) => new City({ name: "Test", seed: 1234, size: "small", mode: "normal", ...o });

/** Builds a street from the town to the nearest water and puts a pump and a sewage outlet there. */
export function addWater(city: City, from: { x: number; z: number }): boolean {
  const T = city.terrain;
  let best: { x: number; z: number } | null = null, bd = Infinity;
  for (let z = 8; z < T.size; z += 16)
    for (let x = 8; x < T.size; x += 16) {
      if (T.heightAt(x, z) > -0.5) continue;
      const d = Math.hypot(x - from.x, z - from.z);
      if (d < bd) { bd = d; best = { x, z }; }
    }
  if (!best) return false;
  const node = city.roads.nearestNode(from.x, from.z, 400);
  if (!node) return false;
  // Stop on dry land just before the shore.
  let ex = node.x, ez = node.z;
  for (let t = 0; t <= 1; t += 0.01) {
    const x = node.x + (best.x - node.x) * t, z = node.z + (best.z - node.z) * t;
    if (T.heightAt(x, z) < 1.6) break;
    ex = x; ez = z;
  }
  if (Math.hypot(ex - node.x, ez - node.z) > 12) road(city, node.x, node.z, ex, ez);
  return placeNear(city, Kind.Pump, ex, ez) && placeNear(city, Kind.Outlet, ex, ez);
}
