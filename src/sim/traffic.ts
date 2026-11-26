// Traffic: cars, lorries, buses, trams and fire engines that really drive from door to door. Each one looks
// for the quickest way, queues in its lane behind the one in front and waits its turn (or for green) at
// crossings, so jams build up where too many want through.
import { PLACE_BY_KIND, ROADS } from "./defs";
import type { City } from "./city";
import type { Lot } from "./lots";
import type { RNode, RSeg } from "./roads";
import type { Line } from "./transit";
import { clamp } from "./util";

export const enum Veh { Car = 0, Truck = 1, Bus = 2, Fire = 3, Tram = 4 }
const LENGTH = [6.5, 10, 11, 9, 17];
const SPEED = [1, 0.85, 0.8, 1.35, 0.85];
const CAR_COLORS = [0xd94a3d, 0x3d7fd9, 0xf2f2f2, 0x2f2f38, 0xe8c23a, 0x4caf6a, 0x9aa3ad, 0x7a4fd0, 0xe07a2f, 0x1fa3a3];
const TRUCK_COLORS = [0xf0f0f0, 0xd9a03d, 0x4a78b8, 0xb84a4a];
/** The lane slot trams use on roads with tracks. */
const TRACK = 3;
/** Traffic lights: seconds of green for each direction, then a moment of red all round. */
const GREEN = 7, CLEAR = 1.4;

export interface Agent {
  kind: Veh; segs: RSeg[]; dirs: number[]; i: number;
  /** How far along the current road, in the direction of travel. */
  s: number; end: number; v: number; vf: number; w: number; lane: number;
  from: Lot | null; to: Lot | null;
  time: number; free: number; wait: number; segTime: number;
  color: number; dead: boolean;
  line?: Line; stop?: number; dwell?: number;
  /** A visitor from out of town. */
  tourist?: boolean;
  done?: () => void;
  x: number; y: number; z: number; ang: number;
}
interface End { seg: RSeg; s: number }
interface Route { segs: RSeg[]; dirs: number[]; s0: number; end: number; free: number }
/** How a crossing lets traffic through. */
export interface Ctl {
  /** Has traffic lights. */
  lights: boolean;
  /** For lights: which of the two directions each road coming in belongs to. */
  group: Map<number, number>;
  /** Until when the crossing is taken, per direction (without lights only [0] is used). */
  busy: number[];
  /** Where the light cycle starts, so neighbouring lights are not all in step. */
  offset: number;
}

const P = { x: 0, y: 0, z: 0, dx: 0, dz: 0 };

/** How much people travel at each hour of the day (1 = average): two rush hours, quiet nights. */
export function dayProfile(hour: number): number {
  if (hour < 5) return 0.12;
  if (hour < 6.5) return 0.5;
  if (hour < 9) return 1.9;
  if (hour < 12) return 1.0;
  if (hour < 14) return 1.25;
  if (hour < 16) return 1.0;
  if (hour < 19) return 1.85;
  if (hour < 22) return 0.8;
  return 0.3;
}

/** Is this road one a vehicle may use in that direction? */
const allowed = (seg: RSeg, dir: number, tram: boolean) => (tram ? !!ROADS[seg.type].tram : !(ROADS[seg.type].oneway && dir === 1));

export class Traffic {
  agents: Agent[] = [];
  /** At most this many vehicles drive at once; in a big city each one stands for several. */
  cap = 1400;
  /** How well traffic moves in the whole city: 1 = nobody waits. */
  flow = 1;
  avgTrip = 30;
  /** Seconds of game time driven, for the traffic lights. */
  now = 0;
  ctls = new Map<number, Ctl>();
  private carAcc = 0;
  private truckAcc = 0;
  private tourAcc = 0;
  private dirty = false;
  // Search data, one slot per crossing.
  private index = new Map<number, number>();
  private nodes: RNode[] = [];
  private g = new Float64Array(0);
  private stamp = new Uint32Array(0);
  private prevSeg: (RSeg | null)[] = [];
  private prevNode = new Int32Array(0);
  private round = 0;
  private graphVersion = -1;
  private heap: number[] = [];
  private heapF: number[] = [];

  constructor(readonly city: City) {}

  roadsChanged() { this.dirty = true; }

  // ------------------------------------------------------------------ crossings

  /** Works out which crossings get traffic lights: busy crossings of big roads. Roundabouts never do. */
  private controls() {
    const roads = this.city.roads, old = this.ctls;
    this.ctls = new Map();
    for (const node of roads.nodes.values()) {
      const segs = node.segs.map((id) => roads.segs.get(id)!).filter(Boolean);
      let big = 0, ring = 0;
      for (const s of segs) {
        const def = ROADS[s.type];
        if (def.oneway) ring++;
        if (def.lanes >= 2 && !def.oneway) big++;
        if (s.type === 2 /* highway */) big++;
      }
      const lights = segs.length >= 3 && big >= 2 && ring < 2;
      const ctl: Ctl = { lights, group: new Map(), busy: [0, 0], offset: ((node.id * 2654435761) >>> 0) % 1000 / 1000 * (GREEN + CLEAR) * 2 };
      const before = old.get(node.id);
      if (before) ctl.busy = before.busy;
      if (lights) {
        // Roads coming in from opposite sides share a green; the ones across get the other.
        const dirs = segs.map((s) => {
          const k = s.a === node.id ? 1 : s.n - 1;
          return Math.atan2(s.pz[k] - node.z, s.px[k] - node.x);
        });
        const axis = dirs[0];
        segs.forEach((s, i) => {
          const d = Math.abs(Math.sin(dirs[i] - axis));
          ctl.group.set(s.id, d < Math.SQRT1_2 ? 0 : 1);
        });
      }
      this.ctls.set(node.id, ctl);
    }
  }

  /** The light a road coming into a crossing sees: 0 red, 1 green, 2 amber. -1 when there is no light. */
  light(nodeId: number, segId: number): number {
    const ctl = this.ctls.get(nodeId);
    if (!ctl || !ctl.lights) return -1;
    const group = ctl.group.get(segId) ?? 0;
    const cycle = (GREEN + CLEAR) * 2;
    const t = (this.now + ctl.offset) % cycle;
    const mine = group === 0 ? t : (t + GREEN + CLEAR) % cycle;
    if (mine < GREEN - 1.2) return 1;
    if (mine < GREEN) return 2;
    return 0;
  }

  // ------------------------------------------------------------------ finding the way

  private prepare() {
    const roads = this.city.roads;
    if (this.graphVersion === roads.version) return;
    this.graphVersion = roads.version;
    this.index.clear();
    this.nodes = [...roads.nodes.values()];
    this.nodes.forEach((n, i) => this.index.set(n.id, i));
    const n = this.nodes.length;
    if (this.g.length < n) {
      this.g = new Float64Array(n + 64);
      this.stamp = new Uint32Array(n + 64);
      this.prevNode = new Int32Array(n + 64);
    }
    this.prevSeg.length = n;
    this.controls();
  }

  private push(i: number, f: number) {
    const h = this.heap, hf = this.heapF;
    let k = h.length;
    h.push(i); hf.push(f);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p] <= f) break;
      h[k] = h[p]; hf[k] = hf[p];
      k = p;
    }
    h[k] = i; hf[k] = f;
  }
  private pop(): number {
    const h = this.heap, hf = this.heapF;
    const top = h[0];
    const li = h.pop()!, lf = hf.pop()!;
    const n = h.length;
    if (n) {
      let k = 0;
      for (;;) {
        let c = k * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        h[k] = h[c]; hf[k] = hf[c];
        k = c;
      }
      h[k] = li; hf[k] = lf;
    }
    return top;
  }

  private timeOn(seg: RSeg, dir: number, dist: number, hurry: boolean): number {
    return dist / (ROADS[seg.type].speed * (hurry ? 1 : Math.max(0.08, seg.flow[dir])));
  }

  /** The quickest way from one spot on a road to another, taking jams and one-way roads into account. Trams keep to their tracks. */
  route(from: End, to: End, hurry = false, tram = false): Route | null {
    const roads = this.city.roads;
    if (!roads.segs.has(from.seg.id) || !roads.segs.has(to.seg.id)) return null;
    if (tram && (!ROADS[from.seg.type].tram || !ROADS[to.seg.type].tram)) return null;
    const fs = from.seg, ts = to.seg;
    if (fs === ts) {
      const dir = to.s >= from.s ? 0 : 1, L = fs.len;
      if (allowed(fs, dir, tram)) return { segs: [fs], dirs: [dir], s0: dir ? L - from.s : from.s, end: dir ? L - to.s : to.s, free: Math.abs(to.s - from.s) / ROADS[fs.type].speed };
      // The wrong way down a one-way road: drive round the block.
    }
    this.prepare();
    const round = ++this.round;
    const { g, stamp, prevNode, prevSeg, index, nodes } = this;
    this.heap.length = 0;
    this.heapF.length = 0;
    const tx = (roads.nodes.get(ts.a)!.x + roads.nodes.get(ts.b)!.x) / 2, tz = (roads.nodes.get(ts.a)!.z + roads.nodes.get(ts.b)!.z) / 2;
    const heur = (n: RNode) => Math.max(0, Math.hypot(n.x - tx, n.z - tz) - ts.len) / 32;
    const start = (nodeId: number, cost: number) => {
      const i = index.get(nodeId);
      if (i === undefined) return;
      if (stamp[i] === round && g[i] <= cost) return;
      stamp[i] = round; g[i] = cost; prevNode[i] = -1; prevSeg[i] = null;
      this.push(i, cost + heur(nodes[i]));
    };
    if (allowed(fs, 0, tram)) start(fs.b, this.timeOn(fs, 0, fs.len - from.s, hurry));
    if (allowed(fs, 1, tram)) start(fs.a, this.timeOn(fs, 1, from.s, hurry));
    const ia = allowed(ts, 0, tram) ? index.get(ts.a) : -2, ib = allowed(ts, 1, tram) ? index.get(ts.b) : -2;
    const tailA = this.timeOn(ts, 0, to.s, hurry), tailB = this.timeOn(ts, 1, ts.len - to.s, hurry);
    let best = Infinity, via = -1;
    while (this.heap.length) {
      const f = this.heapF[0];
      if (f >= best) break;
      const i = this.pop();
      const cost = g[i];
      if (cost + heur(nodes[i]) < f - 1e-9) continue; // an old entry
      if (i === ia && cost + tailA < best) { best = cost + tailA; via = i; }
      if (i === ib && cost + tailB < best) { best = cost + tailB; via = i; }
      const node = nodes[i];
      const ctl = this.ctls.get(node.id);
      const turn = node.segs.length > 2 ? (ctl?.lights ? 3 : 1.2) : 0;
      for (const sid of node.segs) {
        const seg = roads.segs.get(sid)!;
        if (seg === fs && prevNode[i] < 0) continue;
        const dir = seg.a === node.id ? 0 : 1;
        if (!allowed(seg, dir, tram)) continue;
        const j = index.get(dir ? seg.a : seg.b)!;
        const c = cost + this.timeOn(seg, dir, seg.len, hurry) + turn;
        if (stamp[j] === round && g[j] <= c) continue;
        stamp[j] = round; g[j] = c; prevNode[j] = i; prevSeg[j] = seg;
        this.push(j, c + heur(nodes[j]));
      }
    }
    if (via < 0) return null;
    const segs: RSeg[] = [ts], dirs: number[] = [via === ia ? 0 : 1];
    let k = via, guard = 0;
    while (prevNode[k] >= 0 && guard++ < 100000) {
      const seg = prevSeg[k]!;
      segs.push(seg);
      dirs.push(seg.b === nodes[k].id ? 0 : 1);
      k = prevNode[k];
    }
    const firstDir = nodes[k].id === fs.b ? 0 : 1;
    segs.push(fs);
    dirs.push(firstDir);
    segs.reverse();
    dirs.reverse();
    let free = 0;
    for (let q = 1; q < segs.length - 1; q++) free += segs[q].len / ROADS[segs[q].type].speed;
    const s0 = firstDir ? fs.len - from.s : from.s;
    const lastDir = dirs[dirs.length - 1];
    const end = lastDir ? ts.len - to.s : to.s;
    free += (fs.len - s0) / ROADS[fs.type].speed + end / ROADS[ts.type].speed;
    return { segs, dirs, s0, end, free };
  }

  private endOf(lot: Lot): End | null {
    const seg = this.city.roads.segs.get(lot.seg);
    return seg ? { seg, s: clamp(lot.s, 0.5, seg.len - 0.5) } : null;
  }
  /** A spot where the highway leaves the map. */
  private outside(): End | null {
    const outs: RNode[] = [];
    for (const n of this.city.roads.nodes.values()) if (n.outside && n.segs.length) outs.push(n);
    if (!outs.length) return null;
    const node = outs[Math.floor(Math.random() * outs.length)];
    const seg = this.city.roads.segs.get(node.segs[0])!;
    return { seg, s: seg.a === node.id ? 0.5 : seg.len - 0.5 };
  }

  // ------------------------------------------------------------------ lanes

  private queue(a: Agent): Agent[] { return a.segs[a.i].q[a.dirs[a.i] * 4 + a.lane] as Agent[]; }

  /** Puts a vehicle into the queue of its lane, in order (the queue runs from the front to the back). */
  private enqueue(a: Agent) {
    const q = this.queue(a);
    let k = q.length;
    while (k > 0 && q[k - 1].s < a.s) k--;
    q.splice(k, 0, a);
  }
  private dequeue(a: Agent) {
    const seg = a.segs[a.i];
    if (!seg) return;
    const q = seg.q[a.dirs[a.i] * 4 + a.lane] as Agent[];
    const k = q.indexOf(a);
    if (k >= 0) q.splice(k, 1);
  }
  /** How far the last vehicle in a lane is from its start (Infinity when the lane is empty). */
  private room(seg: RSeg, dir: number, lane: number): number {
    const q = seg.q[dir * 4 + lane] as Agent[];
    const last = q[q.length - 1];
    return last ? last.s - LENGTH[last.kind] : Infinity;
  }
  /** Is there room for a vehicle at distance s in a lane? */
  private free(seg: RSeg, dir: number, lane: number, s: number, need: number): boolean {
    for (const o of seg.q[dir * 4 + lane] as Agent[]) if (o.s > s - need && o.s - LENGTH[o.kind] < s + need) return false;
    return true;
  }

  private launch(kind: Veh, from: End, to: End, w: number, a: Lot | null, b: Lot | null, hurry = false): Agent | null {
    const tram = kind === Veh.Tram;
    const r = this.route(from, to, hurry, tram);
    if (!r) return null;
    const colors = kind === Veh.Truck ? TRUCK_COLORS : CAR_COLORS;
    const agent: Agent = {
      kind, segs: r.segs, dirs: r.dirs, i: 0, s: r.s0, end: r.end, v: 0, vf: 0.9 + Math.random() * 0.2, w, lane: 0,
      from: a, to: b, time: 0, free: Math.max(1, r.free), wait: 0, segTime: 0,
      color: kind === Veh.Bus ? 0x2a9d5c : kind === Veh.Fire ? 0xd0281f : kind === Veh.Tram ? 0xe8c23a : colors[Math.floor(Math.random() * colors.length)],
      dead: false, x: 0, y: 0, z: 0, ang: 0,
    };
    const seg = r.segs[0], dir = r.dirs[0];
    if (tram) agent.lane = TRACK;
    else {
      // Pull out only where the lane has room, as from a driveway.
      const lanes = ROADS[seg.type].lanes, first = Math.floor(Math.random() * lanes);
      agent.lane = -1;
      for (let k = 0; k < lanes && agent.lane < 0; k++) {
        const l = (first + k) % lanes;
        if (this.free(seg, dir, l, agent.s, LENGTH[kind] + 2) || kind === Veh.Fire) agent.lane = l;
      }
      if (agent.lane < 0) return null;
    }
    if (!tram) { seg.load[dir] += w; seg.vol += w; }
    this.enqueue(agent);
    this.place(agent);
    this.agents.push(agent);
    return agent;
  }

  // ------------------------------------------------------------------ who drives where

  private pickNear(list: Lot[], from: Lot): Lot | null {
    if (!list.length) return null;
    let best: Lot | null = null, bw = -1;
    for (let k = 0; k < 4; k++) {
      const lot = list[Math.floor(Math.random() * list.length)];
      const w = Math.random() / (1 + Math.hypot(lot.x - from.x, lot.z - from.z) / 350);
      if (w > bw) { bw = w; best = lot; }
    }
    return best;
  }

  /** New trips start, more of them in the rush hours. */
  spawn(dt: number) {
    const city = this.city, st = city.stats;
    if (!city.homes.length) return;
    const profile = dayProfile(city.hour);
    // When the roads are jammed, more people stay home or walk.
    const rate = st.pop * 0.0013 * profile * (0.45 + 0.55 * Math.min(1, this.flow * 1.25));
    const w = clamp((rate * this.avgTrip) / this.cap, 1, 7);
    this.carAcc += (rate * dt) / w;
    let guard = 0;
    while (this.carAcc >= 1 && guard++ < 40) {
      this.carAcc -= 1;
      if (this.agents.length < this.cap * 1.15) this.trip(w);
    }
    const freight = (st.iJobs + st.cJobs * 0.5) * 0.0003 * (0.4 + 0.6 * Math.min(1.3, profile));
    const tw = clamp(w * 0.7, 1, 5);
    this.truckAcc += (freight * dt) / tw;
    guard = 0;
    while (this.truckAcc >= 1 && guard++ < 10) {
      this.truckAcc -= 1;
      if (this.agents.length < this.cap * 1.2) this.haul(tw);
    }
    // Visitors drive in over the highway to see the sights, mostly by day.
    const tour = st.tourists * 0.0025 * (city.hour > 7 && city.hour < 21 ? 1.4 : 0.2);
    this.tourAcc += (tour * dt) / w;
    guard = 0;
    while (this.tourAcc >= 1 && guard++ < 10) {
      this.tourAcc -= 1;
      if (this.agents.length < this.cap * 1.2) this.visit(w);
    }
  }

  private trip(w: number) {
    const city = this.city;
    const home = city.homes[Math.floor(Math.random() * city.homes.length)];
    const r = Math.random();
    let other: Lot | null, outbound: boolean;
    if (r < 0.55) { other = this.pickNear(city.works, home); outbound = city.hour < 13; }
    else if (r < 0.85) { other = this.pickNear(city.shops, home); outbound = Math.random() < 0.5; }
    else { other = city.homes[Math.floor(Math.random() * city.homes.length)]; outbound = true; }
    if (!other || other === home) return;
    const dist = Math.hypot(other.x - home.x, other.z - home.z);
    if (dist < 70) return; // a walk
    const a = outbound ? home : other, b = outbound ? other : home;
    if (city.transit.ride(a, b, w, dist)) return;
    const from = this.endOf(a), to = this.endOf(b);
    if (!from || !to) return;
    if (!this.launch(Veh.Car, from, to, w, a, b) && !this.route(from, to)) {
      // No way there at all.
      a.access += (0.2 - a.access) * 0.2;
      b.access += (0.2 - b.access) * 0.2;
    }
  }

  /** Lorries carry materials to factories, goods to shops, and what is left over out of town. */
  private haul(w: number) {
    const city = this.city;
    const any = (list: Lot[]) => (list.length ? list[Math.floor(Math.random() * list.length)] : null);
    const r = Math.random();
    let a: Lot | null = null, b: Lot | null = null, aOut = false, bOut = false;
    const factory = any(city.factories), shop = any(city.shops), raw = any(city.raws);
    if (r < 0.3 && factory) { if (raw && Math.random() < 0.7) a = raw; else aOut = true; b = factory; }
    else if (r < 0.65 && shop) { if (factory && Math.random() < 0.75) a = factory; else aOut = true; b = shop; }
    else if (factory || raw) { a = Math.random() < 0.6 ? factory ?? raw : raw ?? factory; bOut = true; }
    else return;
    const from = aOut ? this.outside() : a && this.endOf(a), to = bOut ? this.outside() : b && this.endOf(b);
    if (!from || !to) return;
    this.launch(Veh.Truck, from, to, w, a, b);
  }

  /** A carload of visitors drives from the highway to a landmark, or home again. */
  private visit(w: number) {
    const sights = this.city.sights;
    if (!sights.length) return;
    let total = 0;
    for (const lot of sights) total += PLACE_BY_KIND.get(lot.kind)?.tourism ?? 0;
    let r = Math.random() * total, lot = sights[0];
    for (const l of sights) { r -= PLACE_BY_KIND.get(l.kind)?.tourism ?? 0; if (r <= 0) { lot = l; break; } }
    const out = this.outside(), at = this.endOf(lot);
    if (!out || !at) return;
    const coming = Math.random() < 0.55;
    const agent = this.launch(Veh.Car, coming ? out : at, coming ? at : out, w, coming ? null : lot, coming ? lot : null);
    if (agent) agent.tourist = true;
    else lot.access += (0.2 - lot.access) * 0.2;
  }

  /** Sends a fire engine from a station to a burning building. */
  dispatch(station: Lot, target: Lot, done: () => void): boolean {
    const from = this.endOf(station), to = this.endOf(target);
    if (!from || !to) return false;
    const agent = this.launch(Veh.Fire, from, to, 1, station, target, true);
    if (!agent) return false;
    agent.done = done;
    return true;
  }

  /** Keeps the right number of buses and trams on every line. */
  private buses() {
    for (const line of this.city.transit.lines) {
      if (line.metro || line.dead || line.stops.length < 2) continue;
      let have = 0;
      for (const a of this.agents) if (a.line === line && !a.dead) have++;
      if (have > line.vehicles) {
        for (const a of this.agents) if (a.line === line && !a.dead && have > line.vehicles) { this.kill(a); have--; }
      }
      if (have < line.vehicles) {
        const k = Math.floor(Math.random() * line.stops.length);
        const agent = this.busLeg(line, k, null);
        if (agent) { agent.line = line; agent.stop = (k + 1) % line.stops.length; }
      }
    }
  }
  private busLeg(line: Line, fromStop: number, reuse: Agent | null): Agent | null {
    const roads = this.city.roads;
    const n = line.stops.length, tram = !!line.tram;
    for (let tries = 1; tries < n + 1; tries++) {
      const a = line.stops[fromStop], b = line.stops[(fromStop + tries) % n];
      const sa = roads.segs.get(a.seg), sb = roads.segs.get(b.seg);
      if (!sa || !sb) continue;
      if (reuse) {
        const r = this.route({ seg: sa, s: a.s }, { seg: sb, s: b.s }, false, tram);
        if (!r) continue;
        this.dequeue(reuse);
        if (!tram) { const seg = reuse.segs[reuse.i]; seg.load[reuse.dirs[reuse.i]] = Math.max(0, seg.load[reuse.dirs[reuse.i]] - reuse.w); }
        reuse.segs = r.segs; reuse.dirs = r.dirs; reuse.i = 0; reuse.s = r.s0; reuse.end = r.end; reuse.segTime = 0;
        reuse.stop = (fromStop + tries) % n;
        if (!tram) {
          reuse.lane = Math.min(reuse.lane, ROADS[r.segs[0].type].lanes - 1);
          r.segs[0].load[r.dirs[0]] += reuse.w;
        }
        this.enqueue(reuse);
        return reuse;
      }
      const agent = this.launch(tram ? Veh.Tram : Veh.Bus, { seg: sa, s: a.s }, { seg: sb, s: b.s }, 2, null, null);
      if (agent) { agent.stop = (fromStop + tries) % n; return agent; }
    }
    return null;
  }

  // ------------------------------------------------------------------ driving

  private leave(a: Agent) {
    const seg = a.segs[a.i];
    if (!seg) return;
    this.dequeue(a);
    if (a.kind !== Veh.Tram) seg.load[a.dirs[a.i]] = Math.max(0, seg.load[a.dirs[a.i]] - a.w);
  }
  private kill(a: Agent) {
    if (a.dead) return;
    this.leave(a);
    a.dead = true;
  }

  /** Works out where a vehicle stands in the world from where it is on its road. */
  private place(a: Agent) {
    const seg = a.segs[a.i], dir = a.dirs[a.i], def = ROADS[seg.type];
    this.city.roads.pos(seg, dir ? seg.len - a.s : a.s, P);
    const sx = dir ? -P.dx : P.dx, sz = dir ? -P.dz : P.dz;
    const hw = def.width / 2;
    let off: number;
    if (a.lane === TRACK) off = 1.7;
    else if (def.oneway) off = -hw + 1 + (a.lane + 0.5) * ((def.width - 2) / def.lanes);
    else {
      const inner = def.tram ? 3.4 : 0.25;
      off = inner + (a.lane + 0.5) * ((hw - 0.5 - inner) / def.lanes);
    }
    a.x = P.x - sz * off;
    a.z = P.z + sx * off;
    a.y = P.y;
    a.ang = Math.atan2(sx, sz);
  }

  /** Checks every vehicle's way after roads changed; whoever can't go on finds a new way or is taken off. */
  private revalidate() {
    this.dirty = false;
    const roads = this.city.roads;
    this.prepare();
    for (const a of this.agents) {
      if (a.dead) continue;
      if (a.lane !== TRACK) a.lane = Math.min(a.lane, ROADS[a.segs[a.i].type].lanes - 1);
      let ok = true;
      for (let k = a.i; k < a.segs.length && ok; k++) {
        const seg = a.segs[k];
        if (roads.segs.get(seg.id) !== seg || !allowed(seg, a.dirs[k], a.kind === Veh.Tram)) { ok = false; break; }
        if (k + 1 < a.segs.length) {
          const next = a.segs[k + 1];
          const endNode = a.dirs[k] ? seg.a : seg.b, startNode = a.dirs[k + 1] ? next.b : next.a;
          if (endNode !== startNode) ok = false;
        }
      }
      const cur = a.segs[a.i];
      if (ok && a.s <= cur.len + 0.5 && (a.i < a.segs.length - 1 || a.end <= cur.len + 0.5)) continue;
      // Find a new way from where it is now.
      const still = roads.segs.get(cur.id) === cur;
      let fixed = false;
      if (still && a.kind !== Veh.Bus && a.kind !== Veh.Tram && a.to) {
        const to = this.endOf(a.to);
        const here = { seg: cur, s: clamp(a.dirs[a.i] ? cur.len - a.s : a.s, 0.5, Math.max(0.5, cur.len - 0.5)) };
        const r = to && this.route(here, to, a.kind === Veh.Fire);
        if (r) {
          a.segs = r.segs; a.dirs = r.dirs; a.i = 0; a.s = r.s0; a.end = r.end;
          a.lane = Math.min(a.lane, ROADS[r.segs[0].type].lanes - 1);
          fixed = true;
        }
      }
      if (!fixed) {
        if (a.kind === Veh.Fire && a.done) a.done();
        a.dead = true;
      }
    }
    // Loads and lanes are counted afresh, since roads were cut and joined.
    for (const seg of roads.segs.values()) { seg.load[0] = seg.load[1] = 0; for (const q of seg.q) q.length = 0; }
    this.agents = this.agents.filter((a) => !a.dead);
    for (const a of this.agents) {
      if (a.kind !== Veh.Tram) a.segs[a.i].load[a.dirs[a.i]] += a.w;
      this.enqueue(a);
    }
  }

  update(dt: number) {
    if (dt <= 0) return;
    if (this.dirty) this.revalidate();
    this.prepare();
    // Small steps, so that even at the highest speed nobody jumps through the car in front.
    const steps = Math.ceil(dt / 0.05);
    for (let k = 0; k < steps; k++) this.step(dt / steps);
    for (const a of this.agents) this.place(a);
  }

  private step(dt: number) {
    this.now += dt;
    const now = this.now, agents = this.agents, roads = this.city.roads;
    const weather = this.city.weather.roadSpeed;
    let alive = 0;
    for (let n = 0; n < agents.length; n++) {
      const a = agents[n];
      if (a.dead) continue;
      if (a.dwell !== undefined && a.dwell > 0) {
        // A bus or tram at its stop.
        a.dwell -= dt;
        agents[alive++] = a;
        continue;
      }
      a.time += dt;
      a.segTime += dt;
      let seg = a.segs[a.i], dir = a.dirs[a.i];
      const def = ROADS[seg.type];
      const last = a.i === a.segs.length - 1;
      const limit = last ? a.end : seg.len;
      const v0 = def.speed * SPEED[a.kind] * a.vf * weather;
      let vt = v0;
      // Keep a safe distance to the one in front.
      const q = seg.q[dir * 4 + a.lane] as Agent[];
      const k = q.indexOf(a);
      if (k > 0) {
        const lead = q[k - 1];
        const gap = lead.s - a.s - (LENGTH[lead.kind] + 1.5 + (a.w - 1) * 2);
        vt = Math.min(vt, Math.max(0, gap) * 1.6);
      }
      // Slow down for the crossing or the stop ahead, and stop at a red light.
      const left = limit - a.s;
      const node = roads.nodes.get(dir ? seg.a : seg.b)!;
      if (left < 16) {
        if (last) vt = Math.min(vt, 6 + left * 1.1);
        else if (node.segs.length > 2) vt = Math.min(vt, 3 + left * 1.1);
        if (!last && a.kind !== Veh.Fire) {
          const l = this.light(node.id, seg.id);
          if (l === 0 || (l === 2 && left > 5)) vt = Math.min(vt, Math.max(0, left - 1.5) * 1.2);
        }
      }
      a.v += clamp(vt - a.v, -34 * dt, 7.5 * dt);
      if (a.v < 0) a.v = 0;
      a.s = Math.min(a.s + a.v * dt, limit);
      if (k > 0) {
        // Never closer than touching, whatever happened.
        const lead = q[k - 1];
        a.s = Math.min(a.s, Math.max(a.s - a.v * dt, lead.s - LENGTH[lead.kind] - 0.5));
      }

      if (a.s >= limit - (last ? 2.5 : 0.01)) {
        if (last) {
          this.arrive(a);
          if (!a.dead) agents[alive++] = a;
          continue;
        }
        if (k > 0) { agents[alive++] = a; continue; } // someone is still in front at the line
        // Into the next road, if the crossing lets us and there is room.
        const next = a.segs[a.i + 1], nd = a.dirs[a.i + 1];
        const ctl = this.ctls.get(node.id);
        const crossing = node.segs.length > 2;
        const fire = a.kind === Veh.Fire;
        const stuck = a.wait > 20;
        let go = true;
        if (ctl && crossing && !fire) {
          if (ctl.lights) {
            const group = ctl.group.get(seg.id) ?? 0;
            go = (this.light(node.id, seg.id) !== 0 || stuck) && ctl.busy[group] <= now;
          } else go = ctl.busy[0] <= now || stuck;
        }
        let lane = -1, entry = 0;
        if (go) {
          if (a.kind === Veh.Tram) lane = this.room(next, nd, TRACK) > LENGTH[a.kind] + 2 ? TRACK : -1;
          else {
            const lanes = ROADS[next.type].lanes;
            let best = -Infinity;
            for (let l = 0; l < lanes; l++) {
              const room = this.room(next, nd, l) + (l === Math.min(a.lane, lanes - 1) ? 3 : 0);
              if (room > best) { best = room; lane = l; }
            }
            const need = 2.5 + (a.w - 1) * 2;
            if (best < need) {
              // Long stuck (or a fire engine): squeeze in and wait in the crossing, so a ring of full roads can't lock up for good.
              if ((a.wait > 14 || (fire && a.wait > 2)) && best > -LENGTH[a.kind] * 0.6) entry = Math.min(0, best - 3 - 0.5);
              else lane = -1;
            }
          }
        }
        if (lane < 0) {
          a.v = 0;
          a.wait += dt;
          if (a.kind !== Veh.Tram) seg.flow[dir] = Math.max(0.06, seg.flow[dir] - dt * 0.03);
          if (a.time > 180 && a.kind !== Veh.Bus && a.kind !== Veh.Tram) { this.finish(a, 0.1); this.kill(a); continue; }
          if (a.wait > 60 && (a.kind === Veh.Bus || a.kind === Veh.Tram)) { this.kill(a); continue; }
          // The way ahead is full: look for another one now and then.
          if (a.wait > 5 && a.wait - dt <= 5 || a.wait > 16 && a.wait - dt <= 16) this.detour(a);
        } else {
          if (ctl && crossing) {
            const headway = (def.lanes > 1 ? 0.17 : 0.3) * Math.sqrt(a.w) * (def.speed > 20 ? 0.5 : 1);
            if (ctl.lights) ctl.busy[ctl.group.get(seg.id) ?? 0] = now + headway * 0.7;
            else ctl.busy[0] = now + headway;
          }
          if (a.kind !== Veh.Tram) {
            const ideal = seg.len / v0;
            seg.flow[dir] += (clamp(ideal / Math.max(0.05, a.segTime), 0.05, 1) - seg.flow[dir]) * 0.3;
            seg.load[dir] = Math.max(0, seg.load[dir] - a.w);
          }
          q.splice(k, 1);
          a.i++;
          a.s = entry;
          a.segTime = 0;
          a.wait = 0;
          a.lane = lane;
          (next.q[nd * 4 + lane] as Agent[]).push(a);
          if (a.kind !== Veh.Tram) { next.load[nd] += a.w; next.vol += a.w; }
          seg = next;
          dir = nd;
        }
      }
      agents[alive++] = a;
    }
    agents.length = alive;
  }

  /** A vehicle stuck at a crossing tries another way to where it is going. */
  private detour(a: Agent) {
    if (a.kind === Veh.Bus || a.kind === Veh.Tram || a.i >= a.segs.length - 1) return;
    const cur = a.segs[a.i], dir = a.dirs[a.i];
    const last = a.segs[a.segs.length - 1], ld = a.dirs[a.dirs.length - 1];
    const blocked = a.segs[a.i + 1];
    // Count the full road as slow for this search.
    const before = blocked.flow[a.dirs[a.i + 1]];
    blocked.flow[a.dirs[a.i + 1]] = Math.min(before, 0.08);
    const r = this.route({ seg: cur, s: dir ? 0.01 : cur.len - 0.01 }, { seg: last, s: ld ? last.len - a.end : a.end }, a.kind === Veh.Fire);
    blocked.flow[a.dirs[a.i + 1]] = before;
    if (!r || r.segs[0] !== cur || r.dirs[0] !== dir || r.segs.length < 2 || r.segs[1] === blocked) return;
    a.segs = [...a.segs.slice(0, a.i), ...r.segs];
    a.dirs = [...a.dirs.slice(0, a.i), ...r.dirs];
    a.end = r.end;
  }

  private finish(a: Agent, ratio: number) {
    this.flow += (ratio - this.flow) * 0.012 * Math.min(3, a.w);
    this.avgTrip += (Math.min(120, a.time) - this.avgTrip) * 0.02;
    if (a.from) a.from.access += (ratio - a.from.access) * 0.18;
    if (a.to) a.to.access += (ratio - a.to.access) * 0.18;
  }

  private arrive(a: Agent) {
    if ((a.kind === Veh.Bus || a.kind === Veh.Tram) && a.line && !a.line.dead && a.line.stops.length > 1) {
      const line = a.line;
      const here = a.stop ?? 0;
      a.dwell = a.kind === Veh.Tram ? 2.2 : 1.6;
      if (!this.busLeg(line, here % line.stops.length, a)) this.kill(a);
      return;
    }
    if (a.kind !== Veh.Bus && a.kind !== Veh.Tram) this.finish(a, clamp((a.free * 1.25 + 2) / Math.max(1, a.time), 0.05, 1));
    if (a.done) a.done();
    this.kill(a);
  }

  /** Once a game hour: empty roads forget old jams, and bus and tram lines get their vehicles. */
  hourly() {
    for (const seg of this.city.roads.segs.values()) {
      seg.vol *= 0.8;
      for (let d = 0; d < 2; d++) if (seg.load[d] < 0.5) seg.flow[d] += (1 - seg.flow[d]) * 0.5;
    }
    // With little traffic the city figure drifts back up.
    if (this.agents.length < 5) this.flow += (1 - this.flow) * 0.2;
    this.buses();
    for (const a of this.agents) if (a.line && (a.line.dead || a.line.metro)) this.kill(a);
  }

  /** How jammed a road is, 0 (free) to 1 (standing), for the traffic view. */
  jam(seg: RSeg): number {
    return ROADS[seg.type].oneway ? 1 - seg.flow[0] : 1 - Math.min(seg.flow[0], seg.flow[1]);
  }

  clear() {
    for (const a of this.agents) a.dead = true;
    this.agents.length = 0;
    for (const seg of this.city.roads.segs.values()) for (const q of seg.q) q.length = 0;
  }
}
