// The road network: crossings ("nodes") joined by straight or curved roads ("segments").
import { BRIDGE_COST, BRIDGE_HEIGHT, ROADS, Road, TUNNEL_COST, TUNNEL_DEPTH } from "./defs";
import { bezLength, bezPart, bezX, Box, crossing, distToBox, distToPiece } from "./geom";
import type { Terrain } from "./terrain";
import { Grid, clamp, smoothstep } from "./util";

export interface RNode { id: number; x: number; z: number; y: number; segs: number[]; outside: boolean }
export interface RSeg {
  id: number; a: number; b: number; cx: number; cz: number; type: Road; fixed: boolean;
  len: number;
  /** Number of straight pieces; the arrays hold n + 1 points. */
  n: number; px: Float32Array; pz: Float32Array; py: Float32Array; cum: Float32Array;
  bridgeLen: number;
  x0: number; z0: number; x1: number; z1: number;
  /** How well traffic moves, per direction (1 = free, 0 = standing). Direction 0 runs from a to b. */
  flow: Float32Array;
  /** How many vehicles are on it right now, per direction. */
  load: Float32Array;
  /** Vehicles counted over time, for noise and the traffic view. */
  vol: number;
  /** The vehicles on it, per direction and lane (index dir * 4 + lane; lane 3 is the tram track), front first. */
  q: any[][];
  /** Runs at an even slope from end to end: under hills (a tunnel) and over valleys. */
  tunnel: boolean;
}

/** Where a new road starts or ends: free land, an existing crossing, or a spot on an existing road. */
export interface Anchor { x: number; z: number; node?: number; seg?: number; t?: number }
interface Stop { t: number; x: number; z: number; node?: number; seg?: number; ts?: number }
export interface RoadPlan {
  ok: boolean;
  /** Why it can't be built: short, outside, tooClose, angle, sharp, steep, fixed. */
  reason: string;
  cost: number; len: number; type: Road;
  px: number[]; pz: number[]; py: number[];
  curve: number[]; stops: Stop[];
  tunnel: boolean;
  /** Which points lie deep underground (only in a tunnel). */
  deep: boolean[];
}
export interface Hit { seg: RSeg; d: number; s: number; t: number; x: number; z: number }

export class RoadNet {
  nodes = new Map<number, RNode>();
  segs = new Map<number, RSeg>();
  grid = new Grid<RSeg>(64);
  /** Goes up with every change, so others know when to look again. */
  version = 0;
  private nextNode = 1;
  private nextSeg = 1;
  private compVersion = -1;
  private comp = new Map<number, number>();
  private outsideComps = new Set<number>();

  constructor(readonly terrain: Terrain) {}

  /** How high a road lies at a point: on the ground, or lifted over water as a bridge. */
  deckAt(x: number, z: number): number {
    const h = this.terrain.heightAt(x, z);
    return Math.max(h, BRIDGE_HEIGHT * smoothstep(1.7, 0.3, h));
  }

  addNode(x: number, z: number, outside = false, id?: number): RNode {
    const node: RNode = { id: id ?? this.nextNode, x, z, y: this.deckAt(x, z), segs: [], outside };
    this.nextNode = Math.max(this.nextNode, node.id) + 1;
    this.nodes.set(node.id, node);
    this.version++;
    return node;
  }

  addSeg(a: number, b: number, cx: number, cz: number, type: Road, fixed = false, id?: number, tunnel = false): RSeg {
    const seg: RSeg = {
      id: id ?? this.nextSeg, a, b, cx, cz, type, fixed, len: 0, n: 0,
      px: new Float32Array(0), pz: new Float32Array(0), py: new Float32Array(0), cum: new Float32Array(0),
      bridgeLen: 0, x0: 0, z0: 0, x1: 0, z1: 0,
      flow: new Float32Array([1, 1]), load: new Float32Array(2), vol: 0, q: [[], [], [], [], [], [], [], []], tunnel,
    };
    this.nextSeg = Math.max(this.nextSeg, seg.id) + 1;
    this.segs.set(seg.id, seg);
    this.nodes.get(a)!.segs.push(seg.id);
    this.nodes.get(b)!.segs.push(seg.id);
    this.shape(seg);
    this.grid.add(seg, seg.x0, seg.z0, seg.x1, seg.z1);
    this.version++;
    return seg;
  }

  /** Works out the points of a segment from its two ends and its bend. */
  private shape(seg: RSeg) {
    const A = this.nodes.get(seg.a)!, B = this.nodes.get(seg.b)!;
    const rough = bezLength(A.x, A.z, seg.cx, seg.cz, B.x, B.z);
    const n = clamp(Math.ceil(rough / 3.2), 3, 240);
    seg.n = n;
    seg.px = new Float32Array(n + 1);
    seg.pz = new Float32Array(n + 1);
    seg.py = new Float32Array(n + 1);
    seg.cum = new Float32Array(n + 1);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity, bridge = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = bezX(A.x, seg.cx, B.x, t), z = bezX(A.z, seg.cz, B.z, t);
      seg.px[i] = x;
      seg.pz[i] = z;
      seg.py[i] = this.deckAt(x, z);
      if (i > 0) {
        const d = Math.hypot(x - seg.px[i - 1], z - seg.pz[i - 1]);
        seg.cum[i] = seg.cum[i - 1] + d;
        if (this.terrain.heightAt(x, z) < 0.3 && !seg.tunnel) bridge += d;
      }
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    seg.len = seg.cum[n];
    if (seg.tunnel) {
      // An even slope from one end to the other.
      for (let i = 0; i <= n; i++) seg.py[i] = A.y + (B.y - A.y) * (seg.cum[i] / (seg.len || 1));
      for (let i = 1; i <= n; i++) if (seg.py[i] > this.terrain.heightAt(seg.px[i], seg.pz[i]) + 1.5) bridge += seg.cum[i] - seg.cum[i - 1];
    }
    seg.bridgeLen = bridge;
    const hw = ROADS[seg.type].width / 2 + 2;
    seg.x0 = x0 - hw; seg.z0 = z0 - hw; seg.x1 = x1 + hw; seg.z1 = z1 + hw;
  }

  removeSeg(id: number): boolean {
    const seg = this.segs.get(id);
    if (!seg) return false;
    this.grid.remove(seg, seg.x0, seg.z0, seg.x1, seg.z1);
    this.segs.delete(id);
    for (const nid of [seg.a, seg.b]) {
      const node = this.nodes.get(nid);
      if (!node) continue;
      node.segs = node.segs.filter((s) => s !== id);
      if (!node.segs.length && !node.outside) this.nodes.delete(nid);
    }
    this.version++;
    return true;
  }

  /** Is point i of a segment deep under the ground (inside a tunnel)? */
  deepAt(seg: RSeg, i: number): boolean {
    return seg.tunnel && this.terrain.heightAt(seg.px[i], seg.pz[i]) - seg.py[i] > TUNNEL_DEPTH;
  }

  /** Turns a road round: a one-way road then runs the other way. */
  reverse(seg: RSeg) {
    this.grid.remove(seg, seg.x0, seg.z0, seg.x1, seg.z1);
    const a = seg.a;
    seg.a = seg.b;
    seg.b = a;
    this.shape(seg);
    for (const q of seg.q) q.length = 0;
    seg.flow[0] = seg.flow[1] = 1;
    this.grid.add(seg, seg.x0, seg.z0, seg.x1, seg.z1);
    this.version++;
  }

  setType(seg: RSeg, type: Road) {
    this.grid.remove(seg, seg.x0, seg.z0, seg.x1, seg.z1);
    seg.type = type;
    this.shape(seg);
    this.grid.add(seg, seg.x0, seg.z0, seg.x1, seg.z1);
    this.version++;
  }

  /** Cuts a segment in two at t (0 to 1) and puts a crossing there. Returns the crossing and the new second half. */
  splitSeg(id: number, t: number): { node: RNode; rest: RSeg } {
    const seg = this.segs.get(id)!;
    const A = this.nodes.get(seg.a)!, B = this.nodes.get(seg.b)!;
    const first = bezPart(A.x, A.z, seg.cx, seg.cz, B.x, B.z, 0, t);
    const second = bezPart(A.x, A.z, seg.cx, seg.cz, B.x, B.z, t, 1);
    const node = this.addNode(first[4], first[5]);
    if (seg.tunnel) {
      const k = Math.min(seg.n, Math.round(t * seg.n));
      node.y = seg.py[k];
    }
    // The first half keeps the segment's number.
    this.grid.remove(seg, seg.x0, seg.z0, seg.x1, seg.z1);
    B.segs = B.segs.filter((s) => s !== id);
    seg.b = node.id;
    seg.cx = first[2];
    seg.cz = first[3];
    node.segs.push(id);
    this.shape(seg);
    this.grid.add(seg, seg.x0, seg.z0, seg.x1, seg.z1);
    const rest = this.addSeg(node.id, B.id, second[2], second[3], seg.type, seg.fixed, undefined, seg.tunnel);
    return { node, rest };
  }

  /** The point at distance s along a segment, with the direction the road runs there. */
  pos(seg: RSeg, s: number, out: { x: number; y: number; z: number; dx: number; dz: number }) {
    const cum = seg.cum, n = seg.n;
    s = s < 0 ? 0 : s > seg.len ? seg.len : s;
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid; else hi = mid;
    }
    const d = cum[lo + 1] - cum[lo] || 1;
    const f = (s - cum[lo]) / d;
    const dx = seg.px[lo + 1] - seg.px[lo], dz = seg.pz[lo + 1] - seg.pz[lo];
    out.x = seg.px[lo] + dx * f;
    out.z = seg.pz[lo] + dz * f;
    out.y = seg.py[lo] + (seg.py[lo + 1] - seg.py[lo]) * f;
    out.dx = dx / d;
    out.dz = dz / d;
    return out;
  }

  /** The road nearest to a point. Tunnels are only found near their ends, where they come out of the ground. */
  nearestSeg(x: number, z: number, maxD: number, skip?: (s: RSeg) => boolean): Hit | null {
    let best: Hit | null = null;
    for (const seg of this.grid.query(x - maxD, z - maxD, x + maxD, z + maxD)) {
      if (skip && skip(seg)) continue;
      if (x < seg.x0 - maxD || x > seg.x1 + maxD || z < seg.z0 - maxD || z > seg.z1 + maxD) continue;
      for (let i = 0; i < seg.n; i++) {
        if (seg.tunnel && this.deepAt(seg, i) && this.deepAt(seg, i + 1)) continue;
        const r = distToPiece(x, z, seg.px[i], seg.pz[i], seg.px[i + 1], seg.pz[i + 1]);
        if (r.d <= maxD && (!best || r.d < best.d)) {
          best = {
            seg, d: r.d, s: seg.cum[i] + (seg.cum[i + 1] - seg.cum[i]) * r.f, t: (i + r.f) / seg.n,
            x: seg.px[i] + (seg.px[i + 1] - seg.px[i]) * r.f, z: seg.pz[i] + (seg.pz[i + 1] - seg.pz[i]) * r.f,
          };
        }
      }
    }
    return best;
  }

  nearestNode(x: number, z: number, maxD: number): RNode | null {
    let best: RNode | null = null, bd = maxD;
    for (const seg of this.grid.query(x - maxD, z - maxD, x + maxD, z + maxD)) {
      for (const nid of [seg.a, seg.b]) {
        const node = this.nodes.get(nid)!;
        const d = Math.hypot(node.x - x, node.z - z);
        if (d <= bd) { bd = d; best = node; }
      }
    }
    return best;
  }

  /** Is the land under a turned rectangle free of roads (with `margin` to spare)? */
  clearOf(box: Box, margin: number): boolean {
    const r = Math.hypot(box.w, box.d) / 2 + 12;
    for (const seg of this.grid.query(box.x - r, box.z - r, box.x + r, box.z + r)) {
      const lim = ROADS[seg.type].width / 2 + margin;
      for (let i = 0; i < seg.n; i++) {
        if (seg.tunnel && this.deepAt(seg, i) && this.deepAt(seg, i + 1)) continue;
        const ax = seg.px[i], az = seg.pz[i], bx = seg.px[i + 1], bz = seg.pz[i + 1];
        if (distToBox(ax, az, box) < lim || distToBox((ax + bx) / 2, (az + bz) / 2, box) < lim) return false;
      }
      if (distToBox(seg.px[seg.n], seg.pz[seg.n], box) < lim) return false;
    }
    return true;
  }

  /** Which part of the network each crossing belongs to, and whether that part reaches the highway out of town. */
  private components() {
    if (this.compVersion === this.version) return;
    this.compVersion = this.version;
    this.comp.clear();
    this.outsideComps.clear();
    let c = 0;
    for (const start of this.nodes.values()) {
      if (this.comp.has(start.id)) continue;
      c++;
      const stack = [start];
      this.comp.set(start.id, c);
      while (stack.length) {
        const node = stack.pop()!;
        if (node.outside) this.outsideComps.add(c);
        for (const sid of node.segs) {
          const seg = this.segs.get(sid)!;
          const other = seg.a === node.id ? seg.b : seg.a;
          if (!this.comp.has(other)) {
            this.comp.set(other, c);
            stack.push(this.nodes.get(other)!);
          }
        }
      }
    }
  }
  /** The part of the network a segment belongs to (0 = none). */
  componentOf(segId: number): number {
    this.components();
    const seg = this.segs.get(segId);
    return seg ? this.comp.get(seg.a) ?? 0 : 0;
  }
  reachesOutside(component: number): boolean {
    this.components();
    return this.outsideComps.has(component);
  }

  // ------------------------------------------------------------------ planning a new road

  plan(a: Anchor, b: Anchor, ctrl: { x: number; z: number } | null, type: Road, tunnel = false): RoadPlan {
    const def = ROADS[type], hw = def.width / 2;
    const cx = ctrl ? ctrl.x : (a.x + b.x) / 2, cz = ctrl ? ctrl.z : (a.z + b.z) / 2;
    const curve = [a.x, a.z, cx, cz, b.x, b.z];
    const len = bezLength(a.x, a.z, cx, cz, b.x, b.z);
    const plan: RoadPlan = { ok: false, reason: "", cost: 0, len, type, px: [], pz: [], py: [], curve, stops: [], tunnel, deep: [] };
    const N = clamp(Math.ceil(len / 3), 4, 320);
    const T = this.terrain;
    let outside = false;
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = bezX(a.x, cx, b.x, t), z = bezX(a.z, cz, b.z, t);
      plan.px.push(x);
      plan.pz.push(z);
      plan.py.push(this.deckAt(x, z));
      if (!T.inside(x, z, 3)) outside = true;
    }
    if (tunnel) {
      // An even slope between the two ends, under hills and over valleys.
      const cum = [0];
      for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(plan.px[i] - plan.px[i - 1], plan.pz[i] - plan.pz[i - 1]));
      const ya = plan.py[0], yb = plan.py[N], L = cum[N] || 1;
      for (let i = 0; i <= N; i++) plan.py[i] = ya + (yb - ya) * (cum[i] / L);
    }
    let cost = 0, under = 0;
    for (let i = 0; i <= N; i++) {
      const g = T.inside(plan.px[i], plan.pz[i]) ? T.heightAt(plan.px[i], plan.pz[i]) : 0;
      plan.deep.push(tunnel && g - plan.py[i] > TUNNEL_DEPTH);
      if (i === 0) continue;
      const d = Math.hypot(plan.px[i] - plan.px[i - 1], plan.pz[i] - plan.pz[i - 1]);
      const below = tunnel && g - plan.py[i] > 0.8, lifted = (!tunnel && g < 0.3) || (tunnel && plan.py[i] > g + 1.5);
      if (below) under += d;
      cost += d * def.cost * (below ? TUNNEL_COST : lifted ? BRIDGE_COST : 1);
    }
    plan.cost = Math.round(cost);
    const fail = (reason: string) => { plan.reason = reason; return plan; };
    if (len < 7) return fail("short");
    if (outside) return fail("outside");
    if (a.node !== undefined && a.node === b.node) return fail("short");
    if (tunnel && under < 12) return fail("noTunnel");
    const deep = plan.deep;
    /** Is piece j of an existing road deep under the ground? Then it passes under, it doesn't meet. */
    const segDeep = (seg: RSeg, j: number) => seg.tunnel && (this.deepAt(seg, j) || this.deepAt(seg, Math.min(seg.n, j + 1)));

    // Where the new road crosses roads that are already there.
    const { px, pz } = plan;
    const stops: Stop[] = [{ t: 0, x: a.x, z: a.z, node: a.node, seg: a.seg, ts: a.t }, { t: 1, x: b.x, z: b.z, node: b.node, seg: b.seg, ts: b.t }];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i <= N; i++) {
      x0 = Math.min(x0, px[i]); x1 = Math.max(x1, px[i]); z0 = Math.min(z0, pz[i]); z1 = Math.max(z1, pz[i]);
    }
    const near = this.grid.query(x0 - 20, z0 - 20, x1 + 20, z1 + 20);
    const touches = (anchor: Anchor, seg: RSeg) => anchor.seg === seg.id || (anchor.node !== undefined && (anchor.node === seg.a || anchor.node === seg.b));
    for (const seg of near) {
      if (seg.x1 < x0 || seg.x0 > x1 || seg.z1 < z0 || seg.z0 > z1) continue;
      const shw = ROADS[seg.type].width / 2;
      for (let i = 0; i < N; i++) {
        if (deep[i] || deep[i + 1]) continue;
        for (let j = 0; j < seg.n; j++) {
          if (segDeep(seg, j)) continue;
          const c = crossing(px[i], pz[i], px[i + 1], pz[i + 1], seg.px[j], seg.pz[j], seg.px[j + 1], seg.pz[j + 1]);
          if (!c) continue;
          const x = px[i] + (px[i + 1] - px[i]) * c.t, z = pz[i] + (pz[i + 1] - pz[i]) * c.t;
          const own = (hw + shw) * 0.75 + 1;
          if (touches(a, seg) && Math.hypot(x - a.x, z - a.z) < own) continue;
          if (touches(b, seg) && Math.hypot(x - b.x, z - b.z) < own) continue;
          const stop: Stop = { t: (i + c.t) / N, x, z, seg: seg.id, ts: (j + c.u) / seg.n };
          // Close to one of its ends: go through that crossing instead of making a new one right next to it.
          const sAt = seg.cum[j] + (seg.cum[j + 1] - seg.cum[j]) * c.u;
          const endNode = sAt < 9 ? seg.a : seg.len - sAt < 9 ? seg.b : 0;
          if (endNode) {
            const node = this.nodes.get(endNode)!;
            stop.node = node.id; stop.seg = undefined; stop.ts = undefined; stop.x = node.x; stop.z = node.z;
          }
          stops.push(stop);
        }
      }
    }
    // Crossings and road ends the new road runs right past (without quite crossing): go through them too.
    const seenNodes = new Set<number>();
    for (const s of stops) if (s.node !== undefined) seenNodes.add(s.node);
    for (const seg of near) {
      for (const nid of [seg.a, seg.b]) {
        if (seenNodes.has(nid)) continue;
        seenNodes.add(nid);
        const node = this.nodes.get(nid)!;
        if (node.x < x0 - 6 || node.x > x1 + 6 || node.z < z0 - 6 || node.z > z1 + 6) continue;
        let bd = 5.5, bt = -1;
        for (let i = 0; i < N; i++) {
          if (deep[i] || deep[i + 1]) continue;
          const r = distToPiece(node.x, node.z, px[i], pz[i], px[i + 1], pz[i + 1]);
          if (r.d < bd) { bd = r.d; bt = (i + r.f) / N; }
        }
        if (bt > 0.001 && bt < 0.999) stops.push({ t: bt, x: node.x, z: node.z, node: nid });
      }
    }
    stops.sort((p, q) => p.t - q.t);
    const chain: Stop[] = [];
    for (const s of stops) {
      const last = chain[chain.length - 1];
      if (last && s.node !== undefined && last.node === s.node) continue;
      if (last && Math.hypot(last.x - s.x, last.z - s.z) < 6.5) {
        // Two stops almost on top of each other: an existing crossing wins over a new cut next to it.
        const inner = (q: Stop) => q.t > 0 && q.t < 1;
        if (s.node === undefined && last.node !== undefined && inner(s)) continue;
        if (last.node === undefined && s.node !== undefined && inner(last)) { chain[chain.length - 1] = s; continue; }
        return fail("tooClose");
      }
      chain.push(s);
    }
    if (chain.length < 2) return fail("short");
    plan.stops = chain;

    // No fixed road may be built over, and none may run right beside another one.
    const stopOn = (seg: RSeg) => chain.filter((s) => s.seg === seg.id || (s.node !== undefined && (s.node === seg.a || s.node === seg.b)));
    for (const seg of near) {
      const shw = ROADS[seg.type].width / 2, lim = (hw + shw) * 0.92, free = (hw + shw) * 2.4 + 2;
      let mine: Stop[] | null = null;
      for (let i = 0; i <= N; i++) {
        const x = px[i], z = pz[i];
        if (deep[i]) continue;
        if (x < seg.x0 - lim || x > seg.x1 + lim || z < seg.z0 - lim || z > seg.z1 + lim) continue;
        let close = false;
        for (let j = 0; j < seg.n && !close; j++) close = !segDeep(seg, j) && distToPiece(x, z, seg.px[j], seg.pz[j], seg.px[j + 1], seg.pz[j + 1]).d < lim;
        if (!close) continue;
        mine = mine ?? stopOn(seg);
        if (!mine.some((s) => Math.hypot(s.x - x, s.z - z) < free)) return fail("tooClose");
      }
    }

    // Roads must not meet at a very flat angle.
    for (const s of chain) {
      const dirs: number[][] = [];
      const e = 0.02;
      if (s.t < 1) dirs.push([bezX(a.x, cx, b.x, Math.min(1, s.t + e)) - bezX(a.x, cx, b.x, s.t), bezX(a.z, cz, b.z, Math.min(1, s.t + e)) - bezX(a.z, cz, b.z, s.t)]);
      if (s.t > 0) dirs.push([bezX(a.x, cx, b.x, Math.max(0, s.t - e)) - bezX(a.x, cx, b.x, s.t), bezX(a.z, cz, b.z, Math.max(0, s.t - e)) - bezX(a.z, cz, b.z, s.t)]);
      const others: number[][] = [];
      if (s.node !== undefined) {
        const node = this.nodes.get(s.node)!;
        for (const sid of node.segs) {
          const seg = this.segs.get(sid)!;
          const k = seg.a === node.id ? 1 : seg.n - 1;
          others.push([seg.px[k] - node.x, seg.pz[k] - node.z]);
        }
      } else if (s.seg !== undefined) {
        const seg = this.segs.get(s.seg)!;
        const j = clamp(Math.floor((s.ts ?? 0) * seg.n), 0, seg.n - 1);
        const dx = seg.px[j + 1] - seg.px[j], dz = seg.pz[j + 1] - seg.pz[j];
        others.push([dx, dz], [-dx, -dz]);
      }
      for (const d of dirs)
        for (const o of others) {
          const cos = (d[0] * o[0] + d[1] * o[1]) / ((Math.hypot(d[0], d[1]) || 1) * (Math.hypot(o[0], o[1]) || 1));
          if (cos > 0.9) return fail("angle");
        }
    }

    // Not too sharp a bend and not too steep.
    for (let i = 1; i < N; i++) {
      const ax = px[i] - px[i - 1], az = pz[i] - pz[i - 1], bx = px[i + 1] - px[i], bz = pz[i + 1] - pz[i];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la < 0.01 || lb < 0.01) continue;
      const turn = Math.acos(clamp((ax * bx + az * bz) / (la * lb), -1, 1));
      if (turn > 0.001 && (la + lb) / 2 / turn < def.minRadius) return fail("sharp");
    }
    for (let i = 2; i <= N; i += 2) {
      const d = Math.hypot(px[i] - px[i - 2], pz[i] - pz[i - 2]);
      if (d > 0.5 && Math.abs(plan.py[i] - plan.py[i - 2]) / d > 0.3) return fail("steep");
    }
    plan.ok = true;
    return plan;
  }

  /** Builds a planned road. Returns the new segments and the segments that were cut by it. */
  commit(plan: RoadPlan, fixed = false): { made: RSeg[]; cut: RSeg[] } {
    const stops = plan.stops;
    const cut: RSeg[] = [];
    // Cut existing roads where the new one meets them, from the far end first so the numbers stay right.
    const bySeg = new Map<number, Stop[]>();
    for (const s of stops) if (s.node === undefined && s.seg !== undefined) {
      const list = bySeg.get(s.seg);
      if (list) list.push(s); else bySeg.set(s.seg, [s]);
    }
    for (const [segId, list] of bySeg) {
      list.sort((p, q) => (q.ts ?? 0) - (p.ts ?? 0));
      let upper = 1;
      const seg = this.segs.get(segId);
      if (!seg) continue;
      for (const s of list) {
        const t = clamp((s.ts ?? 0) / upper, 0.02, 0.98);
        const { node, rest } = this.splitSeg(segId, t);
        s.node = node.id;
        upper = s.ts ?? upper;
        cut.push(rest);
      }
      cut.push(seg);
    }
    for (const s of stops) if (s.node === undefined) s.node = this.addNode(s.x, s.z).id;

    const made: RSeg[] = [];
    const c = plan.curve;
    for (let i = 0; i + 1 < stops.length; i++) {
      const p = stops[i], q = stops[i + 1];
      if (p.node === q.node) continue;
      // Long stretches get crossings in between, so plots and traffic have something to hold on to.
      const partLen = plan.len * (q.t - p.t);
      // Tunnels stay in one piece: a crossing in the middle would come up out of the ground.
      const parts = plan.tunnel ? 1 : Math.max(1, Math.ceil(partLen / 190));
      let from = p.node!;
      for (let k = 0; k < parts; k++) {
        const t0 = p.t + ((q.t - p.t) * k) / parts, t1 = p.t + ((q.t - p.t) * (k + 1)) / parts;
        const part = bezPart(c[0], c[1], c[2], c[3], c[4], c[5], t0, t1);
        const to = k === parts - 1 ? q.node! : this.addNode(part[4], part[5]).id;
        made.push(this.addSeg(from, to, part[2], part[3], plan.type, fixed, undefined, plan.tunnel));
        from = to;
      }
    }
    return { made, cut };
  }

  // ------------------------------------------------------------------ roundabouts

  /** Turns a crossing into a roundabout: the roads stop at a ring that traffic drives round one way. */
  roundabout(nodeId: number, r: number): { made: RSeg[]; cut: RSeg[]; len: number } | string {
    const N = this.nodes.get(nodeId);
    if (!N || N.outside) return "fixed";
    if (N.segs.length < 3) return "ringSpokes";
    if (N.segs.length > 6) return "ringSpokes";
    const segs = N.segs.map((id) => this.segs.get(id)!);
    if (segs.some((s) => s.fixed)) return "fixed";
    if (segs.some((s) => s.type === Road.Ring || s.tunnel)) return "ringSpokes";
    if (segs.some((s) => s.len < r + 12)) return "short";
    // Where each road meets the ring, and in which direction it leaves the crossing.
    const cuts: { seg: RSeg; t: number; ang: number; fromA: boolean }[] = [];
    for (const seg of segs) {
      const fromA = seg.a === N.id;
      const want = fromA ? r : seg.len - r;
      let i = 0;
      while (i < seg.n && seg.cum[i + 1] < want) i++;
      const f = (want - seg.cum[i]) / ((seg.cum[i + 1] - seg.cum[i]) || 1);
      const t = (i + f) / seg.n;
      const x = seg.px[i] + (seg.px[i + 1] - seg.px[i]) * f, z = seg.pz[i] + (seg.pz[i + 1] - seg.pz[i]) * f;
      cuts.push({ seg, t, ang: Math.atan2(z - N.z, x - N.x), fromA });
    }
    cuts.sort((p, q) => q.ang - p.ang);
    for (let k = 0; k < cuts.length; k++) {
      const gap = (cuts[k].ang - cuts[(k + 1) % cuts.length].ang + Math.PI * 4) % (Math.PI * 2);
      if (gap < 0.45) return "angle";
    }
    const cx = N.x, cz = N.z;
    const cut: RSeg[] = [];
    const ring: { node: RNode; ang: number }[] = [];
    for (const c of cuts) {
      const { node, rest } = this.splitSeg(c.seg.id, c.t);
      // Take away the piece between the old crossing and the ring.
      if (c.fromA) { this.removeSeg(c.seg.id); cut.push(rest); }
      else { this.removeSeg(rest.id); cut.push(c.seg); }
      ring.push({ node, ang: Math.atan2(node.z - cz, node.x - cx) });
    }
    const made: RSeg[] = [];
    let len = 0;
    const third = (Math.PI * 2) / 3;
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k], q = ring[(k + 1) % ring.length];
      const sweep = ((p.ang - q.ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
      const pieces = Math.ceil(sweep / third - 1e-6);
      let from = p.node;
      for (let m = 1; m <= pieces; m++) {
        const a0 = p.ang - (sweep * (m - 1)) / pieces, a1 = p.ang - (sweep * m) / pieces, mid = (a0 + a1) / 2, half = (a0 - a1) / 2;
        const to = m === pieces ? q.node : this.addNode(cx + Math.cos(a1) * r, cz + Math.sin(a1) * r);
        const k2 = r / Math.cos(half);
        const seg = this.addSeg(from.id, to.id, cx + Math.cos(mid) * k2, cz + Math.sin(mid) * k2, Road.Ring);
        made.push(seg);
        len += seg.len;
        from = to;
      }
    }
    return { made, cut, len };
  }

  /** Total length of all roads of one kind. */
  lengthOf(type: Road): number {
    let sum = 0;
    for (const s of this.segs.values()) if (s.type === type && !s.fixed) sum += s.len;
    return sum;
  }
}
