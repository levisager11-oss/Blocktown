// A simple automatic mayor, used by tests to grow a city and see whether the numbers hold up.
import { City } from "../src/sim/city";
import { Kind, PLACE_BY_KIND, Road, Zone, ZONES } from "../src/sim/defs";
import { placeNear, road, run, startSpot } from "./helpers";

export interface BotLog { day: number; pop: number; money: number; net: number; happy: number; flow: number; milestone: number; cars: number; lots: number; segs: number; problems: number }

export class Bot {
  origin: { x: number; z: number; ux: number; uz: number; vx: number; vz: number };
  rows = 0;
  cols = 3;
  wide = 102;
  deep = 54;
  log: BotLog[] = [];
  placed = new Map<number, number>();
  failed = 0;

  constructor(readonly city: City) {
    const s = startSpot(city, 500);
    this.origin = { x: s.x, z: s.z, ux: -s.dz, uz: s.dx, vx: s.dx, vz: s.dz };
    const a = this.P(0, 0);
    if (!road(city, s.x, s.z, a.x, a.z).ok) this.failed++;
    this.addRow();
    this.addRow();
  }

  P(i: number, j: number) {
    const o = this.origin;
    return { x: o.x + o.ux * (34 + i * this.deep) + o.vx * j * this.wide, z: o.z + o.uz * (34 + i * this.deep) + o.vz * j * this.wide };
  }

  /** One more street parallel to the highway, joined to the one before. */
  addRow() {
    const i = this.rows, c = this.cols, type = i % 4 === 0 ? (this.city.unlocked(3) ? Road.Avenue : Road.Street) : Road.Street;
    for (let j = -c; j < c; j++) {
      const a = this.P(i, j), b = this.P(i, j + 1);
      if (!road(this.city, a.x, a.z, b.x, b.z, type).ok) this.failed++;
    }
    if (i > 0) for (let j = -c; j <= c; j += 1) {
      const a = this.P(i - 1, j), b = this.P(i, j);
      if (!road(this.city, a.x, a.z, b.x, b.z, j === 0 && this.city.unlocked(3) ? Road.Avenue : Road.Street).ok) this.failed++;
    }
    this.rows++;
  }

  /** Zones empty plots for whatever the city wants most. Industry goes to one side. */
  zone() {
    const city = this.city, d = city.demand, o = this.origin;
    const empty = [...city.lots.lots.values()].filter((l) => !l.zone && !l.custom);
    let budget = { r: d.r > 0.1 ? Math.ceil(d.r * 14) : 0, c: d.c > 0.1 ? Math.ceil(d.c * 5) : 0, i: d.i > 0.1 ? Math.ceil(d.i * 5) : 0, o: d.o > 0.1 ? Math.ceil(d.o * 4) : 0 };
    const high = city.unlocked(ZONES[Zone.ResHigh].unlock);
    for (const lot of empty) {
      const v = (lot.x - o.x) * o.vx + (lot.z - o.z) * o.vz;
      const far = v > this.cols * this.wide * 0.45;
      if (far && budget.i > 0) { city.setZone(lot, Zone.Industry); budget.i--; }
      else if (!far && budget.r > 0) { city.setZone(lot, high && Math.random() < 0.35 ? Zone.ResHigh : Zone.ResLow); budget.r--; }
      else if (!far && budget.c > 0) { city.setZone(lot, high && Math.random() < 0.3 ? Zone.ComHigh : Zone.ComLow); budget.c--; }
      else if (!far && budget.o > 0 && city.unlocked(ZONES[Zone.Office].unlock)) { city.setZone(lot, Zone.Office); budget.o--; }
    }
    // Plots still free for what is wanted most.
    const wantsIndustry = d.i > d.r && d.i > d.c;
    return empty.filter((lot) => ((lot.x - o.x) * o.vx + (lot.z - o.z) * o.vz > this.cols * this.wide * 0.45) === wantsIndustry && !lot.zone).length;
  }

  private want(kind: Kind, count: number, where = 0.2) {
    const city = this.city, def = PLACE_BY_KIND.get(kind)!;
    const have = this.placed.get(kind) ?? 0;
    if (have >= count || !city.unlocked(def.unlock) || !city.canAfford(def.cost * 1.3)) return false;
    const o = this.origin;
    const j = (have % 2 ? -1 : 1) * (0.5 + Math.floor(have / 2)) * (where > 0.5 ? 1.6 : 1), i = Math.max(0, this.rows - 1) * (0.3 + 0.4 * ((have * 0.37) % 1));
    const p = this.P(i, where > 0.5 ? this.cols * where * 1.6 : j);
    void o;
    if (placeNear(city, kind, p.x, p.z)) { this.placed.set(kind, have + 1); return true; }
    return false;
  }

  /** What a careful mayor does once a day. */
  day() {
    const city = this.city, st = city.stats;
    if (st.powerNeed > st.powerMake * 0.85 || st.powerMake === 0) this.want(Kind.Coal, 99, 0.9);
    if (city.unlocked(1) && st.waterNeed > st.waterMake * 0.85) this.want(Kind.Tower, 99);
    if (city.unlocked(1) && st.sewageNeed > st.sewageCap * 0.85) this.want(city.unlocked(5) ? Kind.Treatment : Kind.Septic, 99, 0.9);
    const pop = st.pop;
    this.want(Kind.Clinic, 1 + Math.floor(pop / 1600));
    this.want(Kind.School, 1 + Math.floor(pop / 2400));
    if (st.garbageNeed > st.garbageCap * 0.9) this.want(Kind.Landfill, 99, 0.9);
    this.want(Kind.Police, 1 + Math.floor(pop / 5000));
    this.want(Kind.Fire, 1 + Math.floor(pop / 5000));
    this.want(Kind.Park, 2 + Math.floor(pop / 500));
    this.want(Kind.HighSchool, 1 + Math.floor(pop / 6000));
    this.want(Kind.University, pop > 7000 ? 1 : 0);
    this.want(Kind.Hospital, pop > 6000 ? 1 + Math.floor(pop / 12000) : 0);
    const empty = this.zone();
    const d = city.demand;
    if (empty < 12 && (d.r > 0.2 || d.c > 0.2 || d.i > 0.2) && city.canAfford(9000)) {
      if (this.rows > this.cols * 3.2) this.cols++;
      this.addRow();
    }
  }

  play(days: number, every = 10) {
    for (let d = 1; d <= days; d++) {
      this.day();
      run(this.city, 1);
      const c = this.city, s = c.stats;
      if (d % every === 0) this.log.push({ day: d, pop: Math.round(s.pop), money: Math.round(c.money), net: Math.round(s.net), happy: +s.happy.toFixed(2), flow: +s.flow.toFixed(2), milestone: c.milestone, cars: c.traffic.agents.length, lots: c.lots.lots.size, segs: c.roads.segs.size, problems: s.problems });
    }
  }
}
