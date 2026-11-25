// Bus and metro lines. People who live and work near stops of the same line (or of two lines that meet)
// leave the car at home.
import { BUS, Kind, METRO } from "./defs";
import type { City } from "./city";
import { LF, Lot } from "./lots";
import { clamp01 } from "./util";

export interface Stop { x: number; z: number; seg: number; s: number; lot?: number }
export interface Line {
  id: number; metro: boolean; stops: Stop[]; vehicles: number; color: number;
  /** Passengers yesterday and so far today. */
  riders: number; today: number; dead: boolean;
}
export const LINE_COLORS = [0xe6492d, 0x2d7de6, 0x2db34a, 0xe6a82d, 0x9b3de6, 0x1fb5b5, 0xe62d8f, 0x7a5a3a, 0x5d6bd8, 0x88b020, 0xd8563a, 0x3a8a8a];
export const MAX_LINES = 24;
/** One simulated trip stands for this many passengers a day. */
const RIDERS_PER_TRIP = 6;

export class Transit {
  lines: Line[] = [];
  version = 0;
  private next = 1;
  private masks = new Map<number, number>();
  private maskKey = "";
  private links: number[] = [];

  constructor(readonly city: City) {}

  depots(): number {
    let n = 0;
    for (const lot of this.city.lots.lots.values()) if (lot.kind === Kind.BusDepot && lot.built >= 1 && lot.flags & LF.Road) n++;
    return n;
  }
  busesInUse(): number { return this.lines.reduce((s, l) => s + (l.metro ? 0 : l.vehicles), 0); }
  busesFree(): number { return this.depots() * BUS.busesPerDepot - this.busesInUse(); }

  lineCost(metro: boolean, stops: Stop[]): number {
    if (!metro) return stops.length * BUS.stopCost;
    let len = 0;
    for (let i = 0; i + 1 < stops.length; i++) len += Math.hypot(stops[i + 1].x - stops[i].x, stops[i + 1].z - stops[i].z);
    return Math.round(len * METRO.trackCost);
  }

  /** Opens a line. Returns it, or why not: stops, lines, depot, buses, money. */
  addLine(metro: boolean, stops: Stop[]): Line | string {
    if (stops.length < 2) return "stops";
    if (this.lines.length >= MAX_LINES) return "lines";
    if (!metro && !this.depots()) return "depot";
    if (!metro && this.busesFree() < 1) return "buses";
    if (!this.city.spend(this.lineCost(metro, stops))) return "money";
    const line: Line = {
      id: this.next++, metro, stops, vehicles: metro ? 2 : Math.min(2, this.busesFree()), color: LINE_COLORS[(this.next + 6) % LINE_COLORS.length],
      riders: 0, today: 0, dead: false,
    };
    this.lines.push(line);
    this.version++;
    this.city.bump(metro ? "metroLines" : "busLines");
    return line;
  }

  removeLine(line: Line) {
    line.dead = true;
    this.lines = this.lines.filter((l) => l !== line);
    this.version++;
  }

  setVehicles(line: Line, n: number): boolean {
    n = Math.max(1, Math.min(line.metro ? 8 : 12, n));
    if (!line.metro && n > line.vehicles && this.busesFree() < n - line.vehicles) return false;
    line.vehicles = n;
    this.version++;
    return true;
  }

  /** How many passengers a line can carry a day. */
  capacity(line: Line): number {
    return line.vehicles * (line.metro ? METRO.trainSeats : BUS.busSeats) * this.city.budgetPower("transit");
  }

  /** Which lines stop within reach of a plot, as bits. */
  private maskOf(lot: Lot): number {
    const key = this.version + ":" + this.city.lots.version;
    if (key !== this.maskKey) {
      this.maskKey = key;
      this.masks.clear();
      // Lines that share a stop let people change from one to the other.
      this.links = this.lines.map((a, i) => {
        let m = 1 << i;
        this.lines.forEach((b, j) => {
          if (i !== j && a.stops.some((p) => b.stops.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 60))) m |= 1 << j;
        });
        return m;
      });
    }
    let m = this.masks.get(lot.id);
    if (m === undefined) {
      m = 0;
      this.lines.forEach((line, i) => {
        const reach = line.metro ? METRO.reach : BUS.reach;
        if (line.stops.some((p) => Math.hypot(p.x - lot.x, p.z - lot.z) < reach)) m! |= 1 << i;
      });
      this.masks.set(lot.id, m);
    }
    return m;
  }

  /** Does this trip go by bus or metro? Counts the passengers if so. */
  ride(a: Lot, b: Lot, w: number, dist: number): boolean {
    if (!this.lines.length || dist < 130) return false;
    const ma = this.maskOf(a), mb = this.maskOf(b);
    if (!ma || !mb) return false;
    let direct = ma & mb, change = false;
    if (!direct) {
      let reach = 0;
      for (let i = 0; i < this.lines.length; i++) if (ma & (1 << i)) reach |= this.links[i];
      direct = reach & mb;
      change = true;
      if (!direct) return false;
    }
    // Take the first line that has room.
    for (let i = 0; i < this.lines.length; i++) {
      if (!(direct & (1 << i))) continue;
      const line = this.lines[i];
      const full = line.today / Math.max(1, this.capacity(line) * clamp01(this.city.hour / 24 + 0.08));
      if (full > 1.15) continue;
      const share = (line.metro ? 0.58 : 0.36) * (change ? 0.6 : 1) * (dist > 400 ? 1.15 : 1);
      if (Math.random() > share) return false;
      line.today += w * RIDERS_PER_TRIP;
      return true;
    }
    return false;
  }

  hourly() {
    this.city.stats.riders = this.lines.reduce((s, l) => s + Math.max(l.riders, l.today), 0);
  }
  daily() {
    for (const line of this.lines) { line.riders = line.today; line.today = 0; }
    this.city.best.riders = Math.max(this.city.best.riders ?? 0, this.lines.reduce((s, l) => s + l.riders, 0));
  }

  /** Bus stops stay on their road when it is cut; they go when it is torn down. */
  roadsChanged() {
    const roads = this.city.roads;
    let changed = false;
    for (const line of this.lines) {
      if (line.metro) continue;
      line.stops = line.stops.filter((stop) => {
        const hit = roads.nearestSeg(stop.x, stop.z, 5);
        if (!hit) { changed = true; return false; }
        stop.seg = hit.seg.id;
        stop.s = hit.s;
        return true;
      });
    }
    const before = this.lines.length;
    for (const line of this.lines) if (line.stops.length < 2) line.dead = true;
    this.lines = this.lines.filter((l) => !l.dead);
    if (changed || before !== this.lines.length) this.version++;
  }

  lotRemoved(lot: Lot) {
    if (lot.kind !== Kind.Metro) return;
    for (const line of this.lines) if (line.metro) line.stops = line.stops.filter((s) => s.lot !== lot.id);
    for (const line of this.lines) if (line.stops.length < 2) line.dead = true;
    this.lines = this.lines.filter((l) => !l.dead);
    this.version++;
  }
}
