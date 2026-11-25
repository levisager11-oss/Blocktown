// One city: its land, roads, plots, money and everything the player can do to it.
import {
  BUDGET_CATS, CAT_UNLOCK, Cat, FEATURE_UNLOCK, HOURS_PER_SECOND, Kind, LOANS, MAP_SIZES, MODE, MapSize, Mode,
  PLACE_BY_KIND, ROADS, Road, START_MONEY, ZONES, Zone,
} from "./defs";
import { Disasters } from "./disasters";
import { census, decay, demand, budget, grow, utilities } from "./economy";
import { Box } from "./geom";
import { LF, Lot, LotStore, isPlaced, isZoned } from "./lots";
import { Maps } from "./maps";
import { progress } from "./progress";
import { Anchor, RSeg, RoadNet, RoadPlan } from "./roads";
import { Terrain } from "./terrain";
import { Traffic } from "./traffic";
import { Transit } from "./transit";
import { Weather } from "./weather";

export type Tone = "info" | "good" | "bad" | "warn";
export interface Notice { key: string; args?: Record<string, string | number>; x?: number; z?: number; tone: Tone }
export interface Loan { amount: number; left: number; perDay: number }
export interface CityOptions { name: string; seed: number; size: MapSize; mode: Mode }
export type Feature = keyof typeof FEATURE_UNLOCK;

export const TICK = 0.25; // seconds of game time per simulation step
export const TICK_HOURS = TICK * HOURS_PER_SECOND;

export interface Stats {
  pop: number; homes: number; workers: number; jobs: number; filled: number; unemployment: number; happy: number;
  cJobs: number; iJobs: number; oJobs: number; sJobs: number; cCap: number; iCap: number; oCap: number;
  buildings: number; problems: number; blocked: number;
  powerMake: number; powerNeed: number; waterMake: number; waterNeed: number; sewageCap: number; sewageNeed: number;
  garbageCap: number; garbageNeed: number; cleanPower: number;
  students: number[]; seats: number[]; beds: number;
  income: Record<string, number>; expense: Record<string, number>; net: number;
  flow: number; riders: number; cars: number;
  rawMake: number[]; rawNeed: number[]; goodsMake: number; goodsNeed: number; exports: number; imports: number;
  quality: number[]; score: number; land: number;
}

const blankStats = (): Stats => ({
  pop: 0, homes: 0, workers: 0, jobs: 0, filled: 0, unemployment: 0, happy: 0.7,
  cJobs: 0, iJobs: 0, oJobs: 0, sJobs: 0, cCap: 0, iCap: 0, oCap: 0, buildings: 0, problems: 0, blocked: 0,
  powerMake: 0, powerNeed: 0, waterMake: 0, waterNeed: 0, sewageCap: 0, sewageNeed: 0, garbageCap: 0, garbageNeed: 0, cleanPower: 1,
  students: [0, 0, 0], seats: [0, 0, 0], beds: 0,
  income: {}, expense: {}, net: 0, flow: 1, riders: 0, cars: 0,
  rawMake: [0, 0, 0, 0], rawNeed: [0, 0, 0, 0], goodsMake: 0, goodsNeed: 0, exports: 0, imports: 0,
  quality: [1, 1, 1, 1], score: 0, land: 0.3,
});

export interface Placement { ok: boolean; reason: string; box: Box | null; seg: RSeg | null; s: number; cost: number; clears: Lot[] }

export class City {
  name: string;
  seed: number;
  size: MapSize;
  mode: Mode;
  terrain: Terrain;
  roads: RoadNet;
  lots: LotStore;
  maps: Maps;
  traffic: Traffic;
  transit: Transit;
  weather: Weather;
  disasters: Disasters;

  /** Game time in hours since the city was founded. It starts at 8 in the morning. */
  hours = 8;
  /** Seconds of game time played (the speed buttons make it run faster). */
  simTime = 0;
  money: number;
  taxes = { r: 9, c: 9, i: 9, o: 9 };
  budget: Record<Cat, number>;
  loans: Loan[] = [];
  /** Shares of grown-ups by schooling: none, school, high school, university. */
  edu = [1, 0, 0, 0];
  demand = { r: 0.6, c: 0, i: 0, o: 0 };
  stats: Stats = blankStats();
  milestone = 0;
  /** The hour each milestone was reached. */
  reached: number[] = [0];
  /** Height of the water; it rises in a flood. */
  waterLevel = 0;
  disastersOn = true;
  /** Bankrupt in hard mode: the city no longer counts for high scores. */
  over = false;
  /** Things counted for achievements and the score lists. */
  count: Record<string, number> = {};
  best: Record<string, number> = {};
  history: { pop: number[]; money: number[]; happy: number[] } = { pop: [], money: [], happy: [] };
  notices: Notice[] = [];
  /** Goes up when buildings change how they look (a new level, a fire, a problem icon). */
  look = 0;
  /** Goes up when a building appears or goes, so trees under it can be hidden. */
  footprint = 0;
  zoneVersion = 0;
  /** Lists the simulation keeps for picking where trips go. */
  homes: Lot[] = [];
  works: Lot[] = [];
  shops: Lot[] = [];
  factories: Lot[] = [];
  raws: Lot[] = [];
  rising = new Set<Lot>();
  onAchievement: (id: string) => void = () => {};
  onScore: (board: string, value: number) => void = () => {};

  private acc = 0;
  private ticks = 0;

  constructor(opts: CityOptions, empty = false) {
    this.name = opts.name;
    this.seed = opts.seed;
    this.size = opts.size;
    this.mode = opts.mode;
    this.money = START_MONEY[opts.mode];
    this.budget = Object.fromEntries(BUDGET_CATS.map((c) => [c, 1])) as Record<Cat, number>;
    this.terrain = new Terrain(opts.seed, MAP_SIZES[opts.size]);
    this.roads = new RoadNet(this.terrain);
    this.lots = new LotStore(this.terrain, this.roads);
    this.maps = new Maps(this.terrain.size);
    this.traffic = new Traffic(this);
    this.transit = new Transit(this);
    this.weather = new Weather(this);
    this.disasters = new Disasters(this);
    if (!empty) this.buildHighway();
  }

  /** The highway that was there before the city: it brings people and goods in and out. */
  private buildHighway() {
    const p = this.terrain.highway;
    if (p.length < 4) return;
    const m = 2.5, S = this.terrain.size;
    const fix = (q: number[]) => [Math.min(S - m, Math.max(m, q[0])), Math.min(S - m, Math.max(m, q[1]))];
    const p0 = fix(p[0]), p3 = fix(p[3]);
    const mid = [(p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2];
    const first = this.forceRoad(p0, p[1], mid, Road.Highway);
    const second = this.forceRoad(mid, p[2], p3, Road.Highway, first.end);
    this.roads.nodes.get(first.start)!.outside = true;
    this.roads.nodes.get(second.end)!.outside = true;
    this.roads.version++;
  }

  private forceRoad(a: number[], c: number[], b: number[], type: Road, startNode?: number) {
    const plan: RoadPlan = {
      ok: true, reason: "", cost: 0, type, px: [], pz: [], py: [],
      len: 0, curve: [a[0], a[1], c[0], c[1], b[0], b[1]],
      stops: [{ t: 0, x: a[0], z: a[1], node: startNode }, { t: 1, x: b[0], z: b[1] }],
    };
    let px = a[0], pz = a[1];
    for (let i = 1; i <= 40; i++) {
      const t = i / 40, u = 1 - t;
      const x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], z = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
      plan.len += Math.hypot(x - px, z - pz);
      px = x; pz = z;
    }
    const { made } = this.roads.commit(plan, true);
    return { start: made[0].a, end: made[made.length - 1].b };
  }

  // ------------------------------------------------------------------ rules of the mode

  get chill() { return this.mode === "chill"; }
  get day() { return Math.floor(this.hours / 24); }
  get hour() { return this.hours % 24; }
  /** Is something that needs milestone `level` unlocked? In chill mode everything is. */
  unlocked(level: number): boolean { return this.chill || this.milestone >= level; }
  /** Does the city have to take care of this yet? New duties start three days after they unlock. */
  active(f: Feature): boolean {
    if (this.chill) return true;
    const level = FEATURE_UNLOCK[f];
    return this.milestone >= level && this.hours >= (this.reached[level] ?? 0) + 72;
  }
  canAfford(cost: number) { return this.chill || this.money >= cost; }
  spend(cost: number): boolean {
    if (this.chill) return true;
    if (this.money < cost) return false;
    this.money -= cost;
    return true;
  }
  /** Do scores and achievements count? Not in chill mode and not after going bankrupt. */
  get ranked() { return !this.chill && !this.over; }
  emit(key: string, tone: Tone = "info", args?: Record<string, string | number>, at?: { x: number; z: number }) {
    this.notices.push({ key, tone, args, x: at?.x, z: at?.z });
    if (this.notices.length > 40) this.notices.shift();
  }
  bump(name: string, by = 1) { this.count[name] = (this.count[name] ?? 0) + by; }

  /** How much a service gets done with its budget: 0.7 at half the money, 1.25 at one and a half times. */
  budgetPower(cat: Cat): number {
    const b = this.budget[cat];
    return b <= 1 ? 0.4 + 0.6 * b : 1 + (b - 1) * 0.5;
  }
  /** How well a building placed by hand works right now: 0 when it stands alone or has no power. */
  serviceStrength(lot: Lot): number {
    const def = PLACE_BY_KIND.get(lot.kind);
    if (!def || lot.built < 1 || !(lot.flags & LF.Road) || lot.flags & (LF.Fire | LF.Burnt)) return 0;
    const powered = !def.power || lot.flags & LF.Power ? 1 : 0.25;
    return this.budgetPower(def.cat) * powered * (0.6 + 0.4 * lot.eff);
  }

  // ------------------------------------------------------------------ time

  /** Lets `dt` seconds of game time pass. */
  step(dt: number) {
    this.simTime += dt;
    this.acc += dt;
    let guard = 0;
    while (this.acc >= TICK && guard++ < 12) {
      this.acc -= TICK;
      this.tick();
    }
    if (this.acc > TICK * 2) this.acc = 0;
    this.traffic.update(dt);
  }

  private tick() {
    this.ticks++;
    const hourBefore = Math.floor(this.hours);
    this.hours += TICK_HOURS;
    this.weather.update(TICK_HOURS);
    this.disasters.update(TICK);
    if (this.rising.size) {
      for (const lot of this.rising) {
        lot.built = Math.min(1, lot.built + TICK_HOURS / 3.2);
        if (lot.built >= 1) { this.rising.delete(lot); this.maps.dirty = true; }
      }
      this.look++;
    }
    if (this.ticks % 3 === 0) grow(this);
    this.traffic.spawn(TICK);
    if (Math.floor(this.hours) !== hourBefore) this.hourly();
  }

  /** Everything that is worked out once a game hour. */
  hourly() {
    const hourNumber = Math.floor(this.hours);
    if (this.maps.dirty || hourNumber % 4 === 0) this.maps.recompute(this);
    utilities(this);
    census(this);
    demand(this);
    budget(this);
    decay(this);
    this.transit.hourly();
    this.traffic.hourly();
    progress(this);
    if (hourNumber % 24 === 0) this.daily();
    this.look++;
  }

  private daily() {
    const h = this.history;
    h.pop.push(Math.round(this.stats.pop));
    h.money.push(Math.round(this.money));
    h.happy.push(Math.round(this.stats.happy * 100));
    for (const list of [h.pop, h.money, h.happy]) if (list.length > 96) list.splice(0, list.length - 96);
    this.bump("days");
    this.transit.daily();
  }

  // ------------------------------------------------------------------ roads

  planRoad(a: Anchor, b: Anchor, ctrl: { x: number; z: number } | null, type: Road): RoadPlan & { hits: Lot[] } {
    const plan = this.roads.plan(a, b, ctrl, type) as RoadPlan & { hits: Lot[] };
    plan.hits = [];
    if (!plan.ok) return plan;
    plan.hits = this.lots.under(plan.px, plan.pz, ROADS[type].width / 2);
    if (plan.hits.some((l) => l.custom)) { plan.ok = false; plan.reason = "building"; }
    else if (!this.unlocked(ROADS[type].unlock)) { plan.ok = false; plan.reason = "locked"; }
    else if (!this.canAfford(plan.cost)) { plan.ok = false; plan.reason = "money"; }
    return plan;
  }

  buildRoad(plan: RoadPlan & { hits: Lot[] }): boolean {
    if (!plan.ok || !this.spend(plan.cost)) return false;
    for (const lot of plan.hits) this.lots.remove(lot);
    const { made, cut } = this.roads.commit(plan);
    this.afterRoadChange([...made, ...cut]);
    this.bump("roads");
    this.bump("roadLength", plan.len);
    const c = plan.curve;
    const bend = Math.hypot(c[2] - (c[0] + c[4]) / 2, c[3] - (c[1] + c[5]) / 2);
    if (bend > 6) this.bump("curves");
    if (made.some((s) => s.bridgeLen > 10)) this.bump("bridges");
    return true;
  }

  /** After roads were added, cut or removed: plots find their road again and new plots are laid out. */
  private afterRoadChange(segs: RSeg[]) {
    const seen = new Set<Lot>();
    for (const seg of segs) {
      for (const lot of this.lots.grid.query(seg.x0 - 30, seg.z0 - 30, seg.x1 + 30, seg.z1 + 30)) {
        if (seen.has(lot)) continue;
        seen.add(lot);
        if (!this.roads.segs.has(lot.seg) || segs.some((s) => s.id === lot.seg) || lot.seg === 0) {
          const ok = this.lots.reattach(lot);
          if (!ok && !lot.custom) this.lots.remove(lot);
        }
      }
    }
    for (const seg of segs) if (this.roads.segs.has(seg.id)) this.lots.generateFor(seg);
    this.maps.dirty = true;
    this.zoneVersion++;
    this.look++;
    this.traffic.roadsChanged();
    this.transit.roadsChanged();
  }

  bulldozeRoad(seg: RSeg): boolean {
    if (seg.fixed || !this.roads.segs.has(seg.id)) return false;
    const around = this.roads.grid.query(seg.x0 - 30, seg.z0 - 30, seg.x1 + 30, seg.z1 + 30).filter((s) => s !== seg);
    const mine = this.lots.grid.query(seg.x0 - 30, seg.z0 - 30, seg.x1 + 30, seg.z1 + 30).filter((l) => l.seg === seg.id);
    this.roads.removeSeg(seg.id);
    for (const lot of mine) {
      if (this.lots.reattach(lot)) continue;
      if (!lot.custom) this.lots.remove(lot);
    }
    this.afterRoadChange(around);
    return true;
  }

  upgradeCost(seg: RSeg, type: Road): number {
    return Math.max(0, Math.round(seg.len * (ROADS[type].cost - ROADS[seg.type].cost * 0.6) * (seg.bridgeLen > 6 ? 2 : 1)));
  }

  upgradeRoad(seg: RSeg, type: Road): string {
    if (seg.fixed) return "fixed";
    if (seg.type === type) return "same";
    if (!this.unlocked(ROADS[type].unlock)) return "locked";
    if (!ROADS[type].zones) {
      const hits = this.lots.grid.query(seg.x0 - 30, seg.z0 - 30, seg.x1 + 30, seg.z1 + 30).filter((l) => l.seg === seg.id);
      if (hits.some((l) => l.custom)) return "building";
    }
    if (!this.spend(this.upgradeCost(seg, type))) return "money";
    this.roads.setType(seg, type);
    if (!ROADS[type].zones) {
      for (const lot of this.lots.grid.query(seg.x0 - 30, seg.z0 - 30, seg.x1 + 30, seg.z1 + 30)) if (lot.seg === seg.id) this.lots.remove(lot);
    }
    this.afterRoadChange([seg]);
    return "";
  }

  // ------------------------------------------------------------------ zones and buildings

  setZone(lot: Lot, zone: Zone): boolean {
    if (lot.custom || lot.zone === zone) return false;
    if (zone !== Zone.None && !this.unlocked(ZONES[zone].unlock)) return false;
    if (lot.kind && lot.kind !== zone) this.clearBuilding(lot);
    lot.zone = zone;
    this.zoneVersion++;
    this.look++;
    return true;
  }

  /** Paints every plot within `r` of a point. Returns how many changed. */
  paintZone(x: number, z: number, r: number, zone: Zone): number {
    let n = 0;
    for (const lot of this.lots.near(x, z, r)) if (this.setZone(lot, zone)) n++;
    if (n) this.bump("zoned", n);
    return n;
  }

  clearBuilding(lot: Lot) {
    this.rising.delete(lot);
    lot.kind = 0; lot.level = 0; lot.built = 0; lot.occ = 0; lot.flags = 0; lot.fire = 0; lot.trouble = 0;
    this.maps.dirty = true;
    this.footprint++;
    this.look++;
  }

  /** Puts up a zoned building on an empty plot. */
  raise(lot: Lot, level = 1) {
    lot.kind = lot.zone;
    lot.level = level;
    lot.variant = Math.floor(Math.random() * 256);
    lot.built = 0.02;
    lot.occ = 0;
    lot.flags = 0;
    lot.trouble = 0;
    lot.happy = 0.65;
    this.rising.add(lot);
    this.footprint++;
    this.look++;
  }

  /** Where a building placed by hand would go for a point near a road, and whether it fits there. */
  placement(kind: Kind, x: number, z: number): Placement {
    const def = PLACE_BY_KIND.get(kind)!;
    const out: Placement = { ok: false, reason: "noRoad", box: null, seg: null, s: 0, cost: def.cost, clears: [] };
    const hit = this.roads.nearestSeg(x, z, 60 + def.d, (s) => !ROADS[s.type].zones);
    if (!hit) return out;
    const seg = hit.seg;
    const p = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };
    const s = seg.len > def.w + 4 ? Math.min(seg.len - def.w / 2 - 1, Math.max(def.w / 2 + 1, hit.s)) : seg.len / 2;
    this.roads.pos(seg, s, p);
    const side = (x - p.x) * -p.dz + (z - p.z) * p.dx >= 0 ? 1 : -1;
    const box = this.lots.boxAt(seg, s, side, def.w, def.d);
    out.box = box; out.seg = seg; out.s = s;
    const land = this.lots.landCheck(box, 5 + def.d * 0.12);
    const clears = this.lots.overlapping(box, 0.1);
    out.clears = clears;
    if (!this.unlocked(def.unlock)) out.reason = "locked";
    else if (land) out.reason = land;
    else if (this.terrain.heightAt(p.x, p.z) < 0.9) out.reason = "water";
    else if (!this.roads.clearOf(box, 1)) out.reason = "tooClose";
    else if (clears.some((l) => l.custom)) out.reason = "building";
    else if (def.shore && !this.terrain.nearWater(box.x, box.z, 95)) out.reason = "shore";
    else if (!this.canAfford(def.cost)) out.reason = "money";
    else { out.ok = true; out.reason = ""; }
    return out;
  }

  place(kind: Kind, p: Placement): Lot | null {
    const def = PLACE_BY_KIND.get(kind)!;
    if (!p.ok || !p.box || !p.seg || !this.spend(def.cost)) return null;
    for (const lot of p.clears) this.lots.remove(lot);
    const lot = this.lots.add(p.box, p.seg.id, p.s, true);
    lot.kind = kind;
    lot.level = 1;
    lot.variant = Math.floor(Math.random() * 256);
    lot.built = 0.02;
    lot.flags = LF.Road;
    this.rising.add(lot);
    this.maps.dirty = true;
    this.zoneVersion++;
    this.footprint++;
    this.look++;
    this.bump("placed");
    this.bump("placed" + kind);
    return lot;
  }

  /** Tears down what stands on a plot. A building placed by hand goes with its plot; a zoned one may grow back. */
  bulldozeLot(lot: Lot): boolean {
    if (!lot.kind) return false;
    if (lot.custom) {
      this.transit.lotRemoved(lot);
      this.rising.delete(lot);
      this.lots.remove(lot);
      const r = Math.hypot(lot.w, lot.d) / 2 + 20;
      for (const seg of this.roads.grid.query(lot.x - r, lot.z - r, lot.x + r, lot.z + r)) this.lots.generateFor(seg);
      this.maps.dirty = true;
      this.zoneVersion++;
      this.look++;
    } else this.clearBuilding(lot);
    return true;
  }

  // ------------------------------------------------------------------ money

  loanOffers() { return LOANS.filter((l) => this.unlocked(l.unlock)); }
  takeLoan(index: number): boolean {
    const offer = LOANS[index];
    if (!offer || this.chill || !this.unlocked(offer.unlock) || this.loans.length >= 3) return false;
    const rate = offer.rate * (this.mode === "hard" ? 1.4 : 1);
    const total = offer.amount * (1 + rate);
    this.loans.push({ amount: offer.amount, left: total, perDay: total / offer.days });
    this.money += offer.amount;
    this.bump("loans");
    return true;
  }
  /** Pays a loan back early, all at once. */
  repayLoan(i: number): boolean {
    const loan = this.loans[i];
    if (!loan || this.money < loan.left) return false;
    this.money -= loan.left;
    this.loans.splice(i, 1);
    this.bump("loansRepaid");
    return true;
  }

  /** What is wrong with a building, for the icon over it: "" if nothing. */
  problem(lot: Lot): string {
    if (!lot.kind || lot.built < 1) return "";
    const f = lot.flags;
    if (f & LF.Fire) return "fire";
    if (f & LF.Burnt) return "burnt";
    if (f & LF.Flooded) return "flood";
    if (f & LF.Abandoned) return "abandoned";
    if (!(f & LF.Road)) return "noRoad";
    if (isPlaced(lot)) {
      const def = PLACE_BY_KIND.get(lot.kind)!;
      return def.power && !(f & LF.Power) ? "noPower" : "";
    }
    if (!(f & LF.Power)) return "noPower";
    if (this.active("water") && !(f & LF.Water)) return "noWater";
    if (this.active("water") && !(f & LF.Sewage)) return "sewage";
    if (isZoned(lot) && ZONES[lot.kind].group === "r" && lot.happy < 0.3) return "unhappy";
    return "";
  }

  catUnlocked(cat: Cat) { return this.unlocked(CAT_UNLOCK[cat]); }
  modeRules() { return MODE[this.mode]; }
}
