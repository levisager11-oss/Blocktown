// Plots: the pieces of land along roads where buildings stand. Zoned plots are made by the game along
// every road; buildings placed by hand (a school, a power plant) get a plot of their own size.
import { Kind, LOT_D, LOT_SETBACK, LOT_W, ROADS, Zone } from "./defs";
import { Box, boxCorners, boxesOverlap, distToBox } from "./geom";
import type { RNode, RSeg, RoadNet } from "./roads";
import type { Terrain } from "./terrain";
import { Grid } from "./util";

export const enum LF {
  Power = 1, Water = 2, Sewage = 4, Road = 8, Abandoned = 16, Fire = 32, Flooded = 64, Burnt = 128,
}

export interface Lot extends Box {
  id: number; y: number;
  /** The road it stands at (0 = none) and how far along that road. */
  seg: number; s: number;
  zone: Zone;
  /** What stands on it: 0 nothing, 1 to 10 a zoned building, 20 and up a building placed by hand. */
  kind: number;
  level: number; variant: number;
  /** How far it is built, 0 to 1. */
  built: number;
  custom: boolean;
  /** How full it is, 0 to 1 (people living or working there, of those who could). */
  occ: number;
  flags: number;
  happy: number;
  /** How well people get to and from it by road: 1 = no jams. */
  access: number;
  /** Hours without power or water, on fire, or standing empty. */
  trouble: number;
  fire: number;
  /** How well a workplace or service runs, 0 to 1. */
  eff: number;
  /** Value of the land, 0 to 1. */
  value: number;
}

const tmp = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };

export class LotStore {
  lots = new Map<number, Lot>();
  grid = new Grid<Lot>(48);
  version = 0;
  private next = 1;

  constructor(readonly terrain: Terrain, readonly roads: RoadNet) {}

  add(box: Box, seg: number, s: number, custom: boolean, id?: number): Lot {
    const lot: Lot = {
      ...box, id: id ?? this.next, y: this.groundFor(box), seg, s, zone: Zone.None, kind: 0, level: 0, variant: 0, built: 0, custom,
      occ: 0, flags: 0, happy: 0.6, access: 1, trouble: 0, fire: 0, eff: 1, value: 0.3,
    };
    this.next = Math.max(this.next, lot.id) + 1;
    this.lots.set(lot.id, lot);
    const r = Math.hypot(lot.w, lot.d) / 2;
    this.grid.add(lot, lot.x - r, lot.z - r, lot.x + r, lot.z + r);
    this.version++;
    return lot;
  }

  remove(lot: Lot) {
    if (!this.lots.delete(lot.id)) return;
    const r = Math.hypot(lot.w, lot.d) / 2;
    this.grid.remove(lot, lot.x - r, lot.z - r, lot.x + r, lot.z + r);
    this.version++;
  }

  /** The height a building stands at: the highest corner, so nothing is buried. */
  private groundFor(box: Box): number {
    const c = boxCorners(box);
    let y = this.terrain.heightAt(box.x, box.z);
    for (let i = 0; i < 8; i += 2) y = Math.max(y, this.terrain.heightAt(c[i], c[i + 1]));
    return y;
  }

  /** The plot at a point, if any. */
  at(x: number, z: number): Lot | null {
    for (const lot of this.grid.query(x, z, x, z)) if (distToBox(x, z, lot) === 0) return lot;
    return null;
  }

  near(x: number, z: number, r: number): Lot[] {
    return this.grid.query(x - r, z - r, x + r, z + r).filter((l) => distToBox(x, z, l) <= r);
  }

  overlapping(box: Box, shrink = 0.25): Lot[] {
    const r = Math.hypot(box.w, box.d) / 2;
    return this.grid.query(box.x - r, box.z - r, box.x + r, box.z + r).filter((l) => boxesOverlap(box, l, shrink));
  }

  /** Can something stand here? Returns "" or why not: water, steep, outside. */
  landCheck(box: Box, maxSpread: number): string {
    const T = this.terrain, c = boxCorners(box);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 8; i += 2) {
      if (!T.inside(c[i], c[i + 1], 2)) return "outside";
      const h = T.heightAt(c[i], c[i + 1]);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    const h = T.heightAt(box.x, box.z);
    lo = Math.min(lo, h);
    if (lo < 1) return "water";
    if (hi - lo > maxSpread) return "steep";
    return "";
  }

  /** The plot a building of this size would get at distance s along a road, on the given side (1 or -1). */
  boxAt(seg: RSeg, s: number, side: number, w: number, d: number): Box {
    this.roads.pos(seg, s, tmp);
    const nx = -tmp.dz * side, nz = tmp.dx * side;
    const off = LOT_SETBACK + d / 2;
    return { x: tmp.x + nx * off, z: tmp.z + nz * off, ang: Math.atan2(nx, -nz), w, d };
  }

  /** Lays out empty plots along both sides of a road wherever there is room. Safe to call again. */
  generateFor(seg: RSeg): number {
    if (!ROADS[seg.type].zones) return 0;
    let made = 0;
    for (const side of [1, -1]) {
      let s = 1;
      while (s + LOT_W <= seg.len - 1) {
        const mid = s + LOT_W / 2;
        const box = this.boxAt(seg, mid, side, LOT_W, LOT_D);
        this.roads.pos(seg, mid, tmp);
        const ok = !this.landCheck(box, 4.2) && Math.abs(tmp.y - this.terrain.heightAt(box.x, box.z)) < 3.2 &&
          this.terrain.heightAt(tmp.x, tmp.z) > 0.9 && !this.overlapping(box).length && this.roads.clearOf(box, 1);
        if (ok) {
          this.add(box, seg.id, mid, false);
          made++;
          s += LOT_W + 0.5;
        } else s += 2.5;
      }
    }
    return made;
  }

  /** Finds the road a plot stands at again (after roads were cut or removed). False if there is none. */
  reattach(lot: Lot): boolean {
    // The middle of the plot's front edge, a little towards the road.
    const fx = lot.x - Math.sin(lot.ang) * (lot.d / 2 + LOT_SETBACK), fz = lot.z + Math.cos(lot.ang) * (lot.d / 2 + LOT_SETBACK);
    const hit = this.roads.nearestSeg(fx, fz, 6);
    if (!hit) { lot.seg = 0; return false; }
    lot.seg = hit.seg.id;
    lot.s = hit.s;
    return true;
  }

  /** Plots a new road would run over. */
  under(px: number[], pz: number[], halfWidth: number): Lot[] {
    const out = new Set<Lot>();
    for (let i = 0; i < px.length; i++) {
      const r = halfWidth + 1;
      for (const lot of this.grid.query(px[i] - r, pz[i] - r, px[i] + r, pz[i] + r)) {
        if (!out.has(lot) && distToBox(px[i], pz[i], lot) < r) out.add(lot);
      }
    }
    return [...out];
  }

  /** The crossing nearest to a plot on its road, for power and water that run along roads. */
  nodeOf(lot: Lot): RNode | null {
    const seg = this.roads.segs.get(lot.seg);
    return seg ? this.roads.nodes.get(seg.a) ?? null : null;
  }
}

export const isZoned = (lot: Lot) => lot.kind >= 1 && lot.kind <= 10;
export const isPlaced = (lot: Lot) => lot.kind >= Kind.Wind;
