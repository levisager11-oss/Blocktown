// The tools the player builds with: roads, zones, buildings, the bulldozer, bus, tram and metro lines.
// With a mouse things happen on click. With a finger, a tap shows what would happen first: a road gets
// handles to drag (its ends and its bend), a building a ghost to move, and a tick button builds it.
import { BUS, FEATURE_UNLOCK, Kind, PLACE_BY_KIND, ROADS, ROUNDABOUT, Road, TRAM, ZONES, Zone } from "../sim/defs";
import type { City, Placement, Tone } from "../sim/city";
import { Lot, isPlaced } from "../sim/lots";
import type { Anchor, RNode, RSeg, RoadPlan } from "../sim/roads";
import type { Stop } from "../sim/transit";
import { COLOR_BAD, COLOR_BLUE } from "../render/overlay";
import type { View } from "../render/view";
import type { Sfx } from "../audio/sound";

export type RoadMode = "straight" | "curve" | "upgrade" | "reverse" | "roundabout";
export type Tool =
  | { t: "inspect" }
  | { t: "road"; type: Road; mode: RoadMode; tunnel?: boolean }
  | { t: "zone"; zone: Zone }
  | { t: "place"; kind: Kind }
  | { t: "bulldoze" }
  | { t: "line"; metro: boolean; tram?: boolean };

export interface HintButton { label: string; icon?: string; primary?: boolean; danger?: boolean; act: () => void }
export interface Hint {
  key: string; args?: Record<string, string | number>; cost?: number; bad?: boolean; buttons: HintButton[];
  /** Where in the world the thing waiting for a yes is: the tick button is shown next to it. */
  at?: { x: number; y: number; z: number };
}
/** A round handle on the screen the player can drag: the ends and the bend of a road being drawn. */
export interface Handle { id: "a" | "b" | "c"; x: number; y: number; z: number; snapped: boolean }

export interface ToolHost {
  city: City;
  view: View;
  /** Is the player using a finger (no hovering, and things wait for a yes)? */
  touch: boolean;
  sound(name: Sfx): void;
  toast(key: string, tone: Tone, args?: Record<string, string | number>): void;
  inspect(target: { lot?: Lot; seg?: RSeg } | null): void;
  confirm(key: string, args: Record<string, string | number>, yes: () => void): void;
  /** Money was spent somewhere: show it floating up from there. */
  spent(cost: number, at: { x: number; y: number; z: number }): void;
  /** The line under the tools changed: draw it again. */
  hintChanged(): void;
  toolChanged(): void;
}

export const BRUSHES = [9, 20, 38];
/** The zone brush that paints a whole street at once. */
export const STREET_BRUSH = 3;

export class Tools {
  tool: Tool = { t: "inspect" };
  brush = 1;
  private pts: Anchor[] = [];
  private hoverPt: Anchor | null = null;
  /** A road drawn with a finger, waiting for a yes: its ends and the point it bends towards. */
  private draft: { a: Anchor; b: Anchor; c: { x: number; z: number } | null } | null = null;
  private plan: (RoadPlan & { hits: Lot[] }) | null = null;
  private spot: Placement | null = null;
  private pending = false;
  private target: { lot?: Lot; seg?: RSeg; node?: RNode } | null = null;
  private stops: Stop[] = [];
  private cursor: { x: number; y: number; z: number } | null = null;
  private dirty = true;
  private painted = 0;
  private paintedSegs = new Set<number>();
  private selected: Lot | null = null;
  private waiting: { x: number; y: number; z: number } | null = null;

  constructor(readonly host: ToolHost) {}

  set(tool: Tool) {
    this.tool = tool;
    this.reset();
    const v = this.host.view;
    v.showEmpty = tool.t === "zone" || tool.t === "place";
    v.showTransit = tool.t === "line";
    this.host.toolChanged();
    this.host.hintChanged();
  }

  private reset() {
    this.pts = [];
    this.hoverPt = null;
    this.draft = null;
    this.plan = null;
    this.spot = null;
    this.pending = false;
    this.target = null;
    this.stops = [];
    this.cursor = null;
    this.dirty = true;
  }

  /** How many points of the road being drawn are set. */
  get pointCount() { return this.pts.length + (this.draft ? 2 : 0); }
  /** Is something waiting for the player to say yes? */
  get waitingForYes() { return !!this.draft || this.pending; }

  select(lot: Lot | null) { this.selected = lot; this.dirty = true; }

  // ------------------------------------------------------------------ snapping

  /** Turns a spot on the ground into a place a road can start or end: a crossing, a spot on a road, or open land. */
  private snap(x: number, z: number, type: Road): Anchor {
    const roads = this.host.city.roads, hw = ROADS[type].width / 2;
    const reach = this.host.touch ? 1.5 : 1;
    const node = roads.nearestNode(x, z, Math.max(9, hw + 5) * reach);
    if (node) return { x: node.x, z: node.z, node: node.id };
    const hit = roads.nearestSeg(x, z, (hw + 6) * reach);
    if (hit) {
      if (hit.s < 10) { const n = roads.nodes.get(hit.seg.a)!; return { x: n.x, z: n.z, node: n.id }; }
      if (hit.seg.len - hit.s < 10) { const n = roads.nodes.get(hit.seg.b)!; return { x: n.x, z: n.z, node: n.id }; }
      return { x: hit.x, z: hit.z, seg: hit.seg.id, t: hit.t };
    }
    return { x, z };
  }

  /** The directions roads already run in at a spot, so a new road can snap to a right angle. */
  private directionsAt(a: Anchor): number[][] {
    const roads = this.host.city.roads, out: number[][] = [];
    if (a.node !== undefined) {
      const node = roads.nodes.get(a.node);
      if (node) for (const id of node.segs) {
        const s = roads.segs.get(id)!, k = s.a === node.id ? 1 : s.n - 1;
        out.push([s.px[k] - node.x, s.pz[k] - node.z]);
      }
    } else if (a.seg !== undefined) {
      const s = roads.segs.get(a.seg);
      if (s) { const j = Math.min(s.n - 1, Math.floor((a.t ?? 0) * s.n)); out.push([s.px[j + 1] - s.px[j], s.pz[j + 1] - s.pz[j]]); }
    }
    return out;
  }

  /** Nudges a free end point so the road leaves at a right angle (or straight on) when it is nearly so. */
  private square(from: Anchor, to: Anchor): Anchor {
    if (to.node !== undefined || to.seg !== undefined) return to;
    const dx = to.x - from.x, dz = to.z - from.z, len = Math.hypot(dx, dz);
    if (len < 8) return to;
    for (const d of this.directionsAt(from)) {
      const dl = Math.hypot(d[0], d[1]) || 1, ux = d[0] / dl, uz = d[1] / dl;
      for (const [ax, az] of [[ux, uz], [-ux, -uz], [-uz, ux], [uz, -ux]]) {
        const cos = (dx * ax + dz * az) / len;
        if (cos > 0.985) return { x: from.x + ax * len, z: from.z + az * len };
      }
    }
    return to;
  }

  // ------------------------------------------------------------------ pointer

  private ground(x: number, y: number) { return this.host.view.groundAt(x, y); }

  /** The mouse moved without a button held. */
  hover(x: number, y: number) {
    const g = this.ground(x, y);
    this.cursor = g;
    this.dirty = true;
    if (!g) return;
    this.track(g, x, y, false);
  }

  /** Works out what the tool would do at this spot. */
  private track(g: { x: number; y: number; z: number }, sx: number, sy: number, touch: boolean) {
    const tool = this.tool, city = this.host.city;
    if (tool.t === "road") {
      if (tool.mode === "upgrade" || tool.mode === "reverse") {
        if (this.pending && touch) return;
        const hit = city.roads.nearestSeg(g.x, g.z, touch ? 18 : 12, (s) => s.type === Road.Ring);
        this.target = hit ? { seg: hit.seg } : null;
        this.host.hintChanged();
        return;
      }
      if (tool.mode === "roundabout") {
        if (this.pending && touch) return;
        const node = city.roads.nearestNode(g.x, g.z, touch ? 26 : 18);
        this.target = node && node.segs.length >= 3 ? { node } : null;
        this.host.hintChanged();
        return;
      }
      if (this.draft) return;
      let a = this.snap(g.x, g.z, tool.type);
      if (this.pts.length) a = this.square(this.pts[this.pts.length - 1], a);
      this.hoverPt = a;
      this.replan();
    } else if (tool.t === "place") {
      if (this.pending && !touch) return;
      this.spot = city.placement(tool.kind, g.x, g.z);
      this.host.hintChanged();
    } else if (tool.t === "bulldoze") {
      const lot = this.host.view.lotAt(sx, sy);
      if (lot && lot.kind) this.target = { lot };
      else {
        const hit = city.roads.nearestSeg(g.x, g.z, touch ? 13 : 9);
        this.target = hit ? { seg: hit.seg } : null;
      }
    }
  }

  private replan() {
    const tool = this.tool;
    if (tool.t !== "road") { this.plan = null; this.host.hintChanged(); return; }
    const city = this.host.city;
    if (this.draft) {
      const d = this.draft;
      this.plan = city.planRoad(d.a, d.b, d.c, tool.type, !!tool.tunnel);
    } else if (!this.pts.length || !this.hoverPt) this.plan = null;
    else if (tool.mode === "curve" && this.pts.length === 1) {
      // First leg of a curve: show a straight line to the bend point.
      this.plan = city.planRoad(this.pts[0], this.hoverPt, null, tool.type, !!tool.tunnel);
    } else if (tool.mode === "curve") {
      this.plan = city.planRoad(this.pts[0], this.hoverPt, { x: this.pts[1].x, z: this.pts[1].z }, tool.type, !!tool.tunnel);
    } else this.plan = city.planRoad(this.pts[0], this.hoverPt, null, tool.type, !!tool.tunnel);
    this.dirty = true;
    this.host.hintChanged();
  }

  /** A press. Returns true when the tool wants the drag for itself (otherwise the camera moves). */
  down(x: number, y: number, touch: boolean): boolean {
    const tool = this.tool;
    if (tool.t === "inspect" || tool.t === "line" || tool.t === "bulldoze") return false;
    const g = this.ground(x, y);
    if (!g) return false;
    this.cursor = g;
    this.dirty = true;
    if (tool.t === "zone") {
      this.painted = 0;
      this.paintedSegs.clear();
      // A finger may be the start of a two-finger move: wait until it drags or lifts before painting.
      if (touch) this.waiting = g; else this.paint(g);
      return true;
    }
    if (tool.t === "road") {
      if (tool.mode === "upgrade" || tool.mode === "reverse" || tool.mode === "roundabout") return false;
      // With a road waiting for a yes, the map moves; the handles change it.
      if (this.draft) return false;
      if (!this.pts.length) {
        this.pts.push(this.snap(g.x, g.z, tool.type));
        this.hoverPt = null;
        this.plan = null;
        this.host.sound("click");
        this.host.hintChanged();
      }
      return true;
    }
    if (tool.t === "place") {
      // A finger on the waiting ghost drags it; elsewhere the map moves.
      if (touch && this.pending && this.spot?.box && Math.hypot(g.x - this.spot.box.x, g.z - this.spot.box.z) > Math.max(this.spot.box.w, this.spot.box.d) * 0.8) return false;
      this.track(g, x, y, touch);
      return true;
    }
    return false;
  }

  drag(x: number, y: number, touch: boolean) {
    const g = this.ground(x, y);
    this.cursor = g;
    this.dirty = true;
    if (!g) return;
    if (this.tool.t === "zone") {
      if (this.waiting) { this.paint(this.waiting); this.waiting = null; }
      this.paint(g);
    } else this.track(g, x, y, touch);
  }

  /** The press ended. `moved` says whether it was a drag rather than a tap. */
  up(x: number, y: number, moved: boolean, touch: boolean, startedHere: boolean) {
    const tool = this.tool, city = this.host.city;
    const g = this.ground(x, y);
    this.dirty = true;
    if (tool.t === "zone") {
      if (this.waiting) { this.paint(this.waiting); this.waiting = null; }
      if (this.painted) this.host.sound("zone");
      return;
    }
    if (!g) return;
    if (tool.t === "inspect") {
      if (moved) return;
      const lot = this.host.view.lotAt(x, y);
      if (lot && lot.kind) { this.host.inspect({ lot }); this.host.sound("click"); return; }
      const hit = city.roads.nearestSeg(g.x, g.z, touch ? 12 : 9);
      this.host.inspect(hit ? { seg: hit.seg } : lot && lot.zone ? { lot } : null);
      return;
    }
    if (tool.t === "road") {
      if (tool.mode === "upgrade" || tool.mode === "reverse" || tool.mode === "roundabout") {
        if (moved) return;
        const before = this.target;
        this.track(g, x, y, touch);
        if (!this.target) return;
        // A finger picks first; the tick (or a second tap on the same thing) does it.
        if (touch && !(this.pending && before && before.seg === this.target.seg && before.node === this.target.node)) { this.pending = true; this.host.hintChanged(); return; }
        this.edit();
        return;
      }
      if (this.draft) return;
      // A press that only set the start point: wait for the next one, unless it was a drag to the end point.
      if (startedHere && !moved) return;
      let a = this.snap(g.x, g.z, tool.type);
      if (this.pts.length) a = this.square(this.pts[this.pts.length - 1], a);
      this.hoverPt = a;
      if (touch) {
        // Both ends are set: show the road with handles and wait for a yes.
        this.draft = { a: this.pts[0], b: a, c: null };
        this.pts = [];
        this.replan();
        this.host.sound("click");
        return;
      }
      const need = tool.mode === "curve" ? 3 : 2;
      if (this.pts.length + 1 < need) {
        this.pts.push(a);
        this.host.sound("click");
        this.replan();
        return;
      }
      this.replan();
      this.buildRoad();
      return;
    }
    if (tool.t === "place") {
      this.track(g, x, y, touch);
      if (!this.spot) return;
      if (touch) { this.pending = true; this.host.hintChanged(); return; }
      this.buildPlace();
      return;
    }
    if (tool.t === "bulldoze") {
      if (moved) return;
      const before = this.target;
      this.track(g, x, y, touch);
      // With a finger there is no hovering first: the first tap picks, the second (or the button) removes.
      if (touch && this.target && !(this.pending && before && before.lot === this.target.lot && before.seg === this.target.seg)) {
        this.pending = true;
        this.host.hintChanged();
        return;
      }
      this.pending = false;
      this.bulldoze();
      this.host.hintChanged();
      return;
    }
    if (tool.t === "line") {
      if (moved) return;
      this.addStop(g, x, y);
    }
  }

  // ------------------------------------------------------------------ handles of a road being drawn

  handles(): Handle[] {
    const d = this.draft, city = this.host.city;
    if (!d) return [];
    const y = (p: { x: number; z: number }) => city.roads.deckAt(p.x, p.z);
    const c = d.c ?? { x: (d.a.x + d.b.x) / 2, z: (d.a.z + d.b.z) / 2 };
    // The middle handle sits on the road (halfway along the curve), not on the point it bends towards.
    const mx = 0.25 * d.a.x + 0.5 * c.x + 0.25 * d.b.x, mz = 0.25 * d.a.z + 0.5 * c.z + 0.25 * d.b.z;
    const snapped = (p: Anchor) => p.node !== undefined || p.seg !== undefined;
    return [
      { id: "a", x: d.a.x, y: y(d.a), z: d.a.z, snapped: snapped(d.a) },
      { id: "b", x: d.b.x, y: y(d.b), z: d.b.z, snapped: snapped(d.b) },
      { id: "c", x: mx, y: y({ x: mx, z: mz }), z: mz, snapped: false },
    ];
  }

  /** A handle is dragged to a point of the screen. */
  dragHandle(id: Handle["id"], sx: number, sy: number) {
    const d = this.draft, tool = this.tool;
    if (!d || tool.t !== "road") return;
    const g = this.ground(sx, sy);
    if (!g) return;
    if (id === "c") {
      // The handle is on the curve: the point it bends towards is twice as far out from the middle of the ends.
      const ex = (d.a.x + d.b.x) / 2, ez = (d.a.z + d.b.z) / 2;
      const cx = 2 * g.x - ex, cz = 2 * g.z - ez;
      d.c = Math.hypot(g.x - ex, g.z - ez) < 4 ? null : { x: cx, z: cz };
    } else {
      const other = id === "a" ? d.b : d.a;
      const p = this.square(other, this.snap(g.x, g.z, tool.type));
      if (id === "a") d.a = p; else d.b = p;
    }
    this.replan();
  }

  // ------------------------------------------------------------------ doing things

  private paint(g: { x: number; z: number }) {
    if (this.tool.t !== "zone") return;
    const city = this.host.city;
    let n = 0;
    if (this.brush === STREET_BRUSH) {
      // The whole street: every plot along the road under the finger, on both sides.
      const hit = city.roads.nearestSeg(g.x, g.z, 14, (s) => !ROADS[s.type].zones);
      if (!hit || this.paintedSegs.has(hit.seg.id)) return;
      this.paintedSegs.add(hit.seg.id);
      const s = hit.seg;
      for (const lot of city.lots.grid.query(s.x0 - 30, s.z0 - 30, s.x1 + 30, s.z1 + 30)) if (lot.seg === s.id && city.setZone(lot, this.tool.zone)) n++;
      if (n) city.bump("zoned", n);
    } else n = city.paintZone(g.x, g.z, BRUSHES[this.brush], this.tool.zone);
    if (n && !this.painted) this.host.sound("zone");
    this.painted += n;
  }

  /** Builds the road waiting for a yes (or drawn with the mouse). */
  buildRoad() {
    const plan = this.plan, city = this.host.city, tool = this.tool;
    if (!plan || tool.t !== "road") return;
    if (!plan.ok) {
      this.host.toast("why." + plan.reason, "bad");
      this.host.sound("error");
      return;
    }
    const end = this.draft ? this.draft.b : this.hoverPt!;
    const mid = Math.floor(plan.px.length / 2);
    const at = { x: plan.px[mid], y: plan.py[mid], z: plan.pz[mid] };
    if (city.buildRoad(plan)) {
      this.host.sound("road");
      if (!city.chill) this.host.spent(plan.cost, at);
      // Carry on from the end, like drawing a line without lifting the pen.
      this.pts = [this.snap(end.x, end.z, plan.type)];
      this.draft = null;
      this.hoverPt = null;
      this.plan = null;
      this.dirty = true;
      this.host.hintChanged();
    }
  }

  private buildPlace() {
    const tool = this.tool, city = this.host.city;
    if (tool.t !== "place" || !this.spot) return;
    if (!this.spot.ok) {
      this.host.toast("why." + this.spot.reason, "bad");
      this.host.sound("error");
      return;
    }
    const box = this.spot.box!;
    if (city.place(tool.kind, this.spot)) {
      this.host.sound("place");
      if (!city.chill) this.host.spent(PLACE_BY_KIND.get(tool.kind)!.cost, { x: box.x, y: city.terrain.heightAt(box.x, box.z) + 8, z: box.z });
      this.spot = null;
      this.pending = false;
      this.dirty = true;
      // Landmarks stand alone: after one, go back to looking.
      if (PLACE_BY_KIND.get(tool.kind)!.unique) this.set({ t: "inspect" });
      else this.host.hintChanged();
    }
  }

  /** Changes a road's type, turns a one-way road round, or makes a roundabout. */
  private edit() {
    const tool = this.tool, city = this.host.city, t = this.target;
    this.pending = false;
    if (tool.t !== "road" || !t) return;
    let why = "";
    if (tool.mode === "upgrade" && t.seg) {
      const cost = city.upgradeCost(t.seg, tool.type);
      why = city.upgradeRoad(t.seg, tool.type);
      if (!why && !city.chill) this.host.spent(cost, { x: t.seg.px[t.seg.n >> 1], y: t.seg.py[t.seg.n >> 1], z: t.seg.pz[t.seg.n >> 1] });
    } else if (tool.mode === "reverse" && t.seg) why = ROADS[t.seg.type].oneway ? (city.reverseRoad(t.seg) ? "" : "fixed") : "notOneWay";
    else if (tool.mode === "roundabout" && t.node) {
      const at = { x: t.node.x, y: t.node.y, z: t.node.z };
      why = city.buildRoundabout(t.node.id);
      if (!why && !city.chill) this.host.spent(ROUNDABOUT.cost, at);
    }
    if (why && why !== "same") { this.host.toast("why." + why, "bad"); this.host.sound("error"); }
    else if (!why) this.host.sound("road");
    this.target = null;
    this.dirty = true;
    this.host.hintChanged();
  }

  private bulldoze() {
    const t = this.target, city = this.host.city;
    if (!t) return;
    if (t.lot) {
      const lot = t.lot;
      if (isPlaced(lot)) {
        const def = PLACE_BY_KIND.get(lot.kind);
        this.host.confirm("confirm.demolish", { name: "@b." + (def?.key ?? "") }, () => { city.bulldozeLot(lot); this.host.sound("bulldoze"); this.host.inspect(null); });
      } else if (city.bulldozeLot(lot)) this.host.sound("bulldoze");
    } else if (t.seg) {
      if (t.seg.fixed) { this.host.toast("why.fixed", "bad"); this.host.sound("error"); }
      else if (city.bulldozeRoad(t.seg)) this.host.sound("bulldoze");
    }
    this.target = null;
  }

  private addStop(g: { x: number; z: number }, sx: number, sy: number) {
    const tool = this.tool, city = this.host.city;
    if (tool.t !== "line") return;
    if (tool.metro) {
      const lot = this.host.view.lotAt(sx, sy);
      if (!lot || lot.kind !== Kind.Metro) { this.host.toast("why.needStation", "warn"); return; }
      if (this.stops.some((s) => s.lot === lot.id)) return;
      this.stops.push({ x: lot.x, z: lot.z, seg: lot.seg, s: lot.s, lot: lot.id });
    } else {
      const hit = city.roads.nearestSeg(g.x, g.z, 16, (s) => (tool.tram ? !ROADS[s.type].tram : !ROADS[s.type].zones));
      if (!hit) { this.host.toast(tool.tram ? "why.needTracks" : "why.needRoad", "warn"); return; }
      if (this.stops.some((s) => Math.hypot(s.x - hit.x, s.z - hit.z) < 25)) return;
      this.stops.push({ x: hit.x, z: hit.z, seg: hit.seg.id, s: hit.s });
    }
    this.host.sound("click");
    this.dirty = true;
    this.host.hintChanged();
  }

  private finishLine() {
    const tool = this.tool;
    if (tool.t !== "line") return;
    const r = this.host.city.transit.addLine(tool.metro, this.stops, !!tool.tram);
    if (typeof r === "string") { this.host.toast("why." + r, "bad"); this.host.sound("error"); return; }
    this.host.sound("place");
    this.host.toast("note.lineOpen", "good");
    this.stops = [];
    this.dirty = true;
    this.host.hintChanged();
  }

  /** A second finger came down: what the first one began was not meant for the tool. */
  interrupted(startedPoint: boolean) {
    this.waiting = null;
    if (startedPoint && this.pts.length === 1) { this.pts = []; this.plan = null; this.host.hintChanged(); }
    if (this.tool.t === "place" && !this.pending) this.spot = null;
    this.dirty = true;
  }

  /** Right click or Escape: steps back. Returns false when there was nothing to undo. */
  cancel(): boolean {
    this.dirty = true;
    if (this.pts.length || this.pending || this.stops.length || this.draft) {
      this.target = null;
      this.pts = [];
      this.draft = null;
      this.plan = null;
      this.pending = false;
      this.spot = null;
      this.stops = [];
      this.host.hintChanged();
      return true;
    }
    if (this.tool.t !== "inspect") { this.set({ t: "inspect" }); return true; }
    return false;
  }

  /** The tick: does whatever is waiting for a yes. */
  yes() {
    const tool = this.tool;
    if (this.draft) this.buildRoad();
    else if (tool.t === "place" && this.pending) this.buildPlace();
    else if (tool.t === "bulldoze" && this.pending) { this.pending = false; this.bulldoze(); this.dirty = true; this.host.hintChanged(); }
    else if (tool.t === "road" && this.pending) this.edit();
    else if (tool.t === "line" && this.stops.length >= 2) this.finishLine();
  }

  // ------------------------------------------------------------------ what the player is told

  hint(): Hint | null {
    const tool = this.tool, city = this.host.city;
    const cancel: HintButton = { label: "ui.cancel", icon: "close", danger: true, act: () => this.cancel() };
    const yes = (label: string, icon = "check"): HintButton => ({ label, icon, primary: true, act: () => this.yes() });
    if (tool.t === "inspect") return null;
    if (tool.t === "road") {
      if (tool.mode === "upgrade" || tool.mode === "reverse") {
        const seg = this.target?.seg;
        const at = seg ? { x: seg.px[seg.n >> 1], y: seg.py[seg.n >> 1], z: seg.pz[seg.n >> 1] } : undefined;
        if (tool.mode === "reverse") {
          if (seg && this.pending) return { key: "hint.reverseThis", buttons: [yes("ui.reverse", "reverse"), cancel], at };
          return { key: "hint.reverse", buttons: [] };
        }
        if (seg && !seg.fixed && seg.type !== tool.type) return { key: "hint.upgradeCost", cost: city.upgradeCost(seg, tool.type), buttons: this.pending ? [yes("ui.change", "upgrade"), cancel] : [], at };
        return { key: "hint.upgrade", buttons: [] };
      }
      if (tool.mode === "roundabout") {
        const node = this.target?.node;
        if (node) {
          const r = city.roundaboutCost(node.id);
          const at = { x: node.x, y: node.y, z: node.z };
          if (r.reason) return { key: "why." + r.reason, bad: true, cost: r.cost, buttons: this.pending ? [cancel] : [], at };
          return { key: "hint.roundaboutHere", cost: r.cost, buttons: this.pending ? [yes("ui.build"), cancel] : [], at };
        }
        return { key: "hint.roundabout", cost: ROUNDABOUT.cost, buttons: [] };
      }
      if (this.draft && this.plan) {
        const mid = Math.floor(this.plan.px.length / 2);
        const at = { x: this.plan.px[mid], y: this.plan.py[mid], z: this.plan.pz[mid] };
        if (!this.plan.ok) return { key: "why." + this.plan.reason, bad: true, cost: this.plan.cost, buttons: [cancel], at };
        return { key: "hint.roadDraft", args: { len: Math.round(this.plan.len) }, cost: this.plan.cost, buttons: [yes("ui.build"), cancel], at };
      }
      if (!this.pts.length) return { key: tool.tunnel ? "hint.tunnelStart" : "hint.roadStart", buttons: [] };
      if (this.plan && this.hoverPt) {
        if (!this.plan.ok) return { key: "why." + this.plan.reason, bad: true, cost: this.plan.cost, buttons: [cancel] };
        if (tool.mode === "curve" && this.pts.length === 1) return { key: "hint.roadBend", buttons: [cancel] };
        return { key: "hint.roadEnd", args: { len: Math.round(this.plan.len) }, cost: this.plan.cost, buttons: [cancel] };
      }
      return { key: tool.mode === "curve" && this.pts.length === 1 && !this.host.touch ? "hint.roadBend" : "hint.roadNext", buttons: [cancel] };
    }
    if (tool.t === "zone") return { key: tool.zone === Zone.None ? "hint.dezone" : this.brush === STREET_BRUSH ? "hint.zoneStreet" : "hint.zone", buttons: [] };
    if (tool.t === "place") {
      const def = PLACE_BY_KIND.get(tool.kind)!;
      const s = this.spot, at = s?.box ? { x: s.box.x, y: city.terrain.heightAt(s.box.x, s.box.z) + 4, z: s.box.z } : undefined;
      if (s && !s.ok && s.box) return { key: "why." + s.reason, bad: true, cost: def.cost, buttons: this.pending ? [cancel] : [], at: this.pending ? at : undefined };
      if (this.pending && s?.ok) return { key: "hint.confirmPlace", cost: def.cost, buttons: [yes("ui.build"), cancel], at };
      return { key: def.shore ? "hint.placeShore" : "hint.place", cost: def.cost, buttons: [] };
    }
    if (tool.t === "bulldoze") {
      const t = this.target;
      if (this.pending && t) {
        const at = t.lot ? { x: t.lot.x, y: t.lot.y + this.host.view.heightOf(t.lot) + 2, z: t.lot.z } : t.seg ? { x: t.seg.px[t.seg.n >> 1], y: t.seg.py[t.seg.n >> 1], z: t.seg.pz[t.seg.n >> 1] } : undefined;
        return { key: "hint.confirmBulldoze", bad: true, buttons: [{ label: "ui.demolish", icon: "dozer", primary: true, danger: true, act: () => this.yes() }, { ...cancel, danger: false }], at };
      }
      return { key: "hint.bulldoze", buttons: [] };
    }
    if (tool.t === "line") {
      const n = this.stops.length;
      const buttons: HintButton[] = [];
      if (n >= 2) buttons.push(yes("ui.openLine"));
      if (n) buttons.push({ label: "ui.undo", icon: "undo", act: () => { this.stops.pop(); this.dirty = true; this.host.hintChanged(); } });
      const cost = n ? city.transit.lineCost(tool.metro, this.stops, !!tool.tram) : tool.metro ? undefined : tool.tram ? TRAM.stopCost : BUS.stopCost;
      return { key: tool.metro ? "hint.metro" : tool.tram ? "hint.tram" : "hint.bus", args: { n }, cost, buttons };
    }
    return null;
  }

  /** Is a feature of the road tool open yet? */
  roadFeature(f: "tunnel" | "roundabout"): boolean { return this.host.city.unlocked(FEATURE_UNLOCK[f]); }

  // ------------------------------------------------------------------ what is drawn

  /** Draws the tool's preview. Called every frame; only does work when something changed. */
  frame() {
    const view = this.host.view, city = this.host.city, P = view.preview;
    P.transit(city, view.showTransit, this.tool.t === "line" ? this.stops : null, this.tool.t === "line" && this.tool.metro);
    if (!this.dirty) return;
    this.dirty = false;
    P.clear();
    const tool = this.tool, c = this.cursor;
    if (tool.t === "inspect") {
      if (this.selected && city.lots.lots.has(this.selected.id)) P.block(this.selected, this.selected.y, view.heightOf(this.selected) + 1, true, COLOR_BLUE);
      return;
    }
    if (tool.t === "road") {
      const hw = ROADS[tool.type].width / 2;
      if (tool.mode === "upgrade" || tool.mode === "reverse") {
        const seg = this.target?.seg;
        const bad = !!seg && (seg.fixed || (tool.mode === "upgrade" ? seg.type === tool.type : !ROADS[seg.type].oneway));
        if (seg) P.segment(seg, ROADS[seg.type].width / 2 + 0.5, bad ? COLOR_BAD : COLOR_BLUE);
        return;
      }
      if (tool.mode === "roundabout") {
        const node = this.target?.node;
        if (node) P.ring(city, node.x, node.z, ROUNDABOUT.radius, city.roundaboutCost(node.id).reason ? COLOR_BAD : 0xffffff);
        return;
      }
      const dot = (p: Anchor, big: number) => {
        const snapped = p.node !== undefined || p.seg !== undefined;
        P.dot(p.x, city.roads.deckAt(p.x, p.z), p.z, snapped ? 4 : big, snapped ? 0xffd34d : 0xffffff);
      };
      if (!this.draft) {
        for (const p of this.pts) dot(p, 3);
        const h = this.hoverPt;
        if (h) dot(h, 2.4);
        else if (c && !this.pts.length) dot(this.snap(c.x, c.z, tool.type), 2.4);
      }
      if (this.plan) P.strip(this.plan.px, this.plan.pz, this.plan.py, hw, this.plan.ok);
      return;
    }
    if (tool.t === "zone") {
      if (c && this.brush !== STREET_BRUSH) P.ring(city, c.x, c.z, BRUSHES[this.brush], tool.zone ? ZONES[tool.zone].color : 0xffffff);
      else if (c) {
        const hit = city.roads.nearestSeg(c.x, c.z, 14, (s) => !ROADS[s.type].zones);
        if (hit) P.segment(hit.seg, ROADS[hit.seg.type].width / 2 + 14, tool.zone ? ZONES[tool.zone].color : 0xffffff);
      }
      return;
    }
    if (tool.t === "place") {
      const s = this.spot, def = PLACE_BY_KIND.get(tool.kind)!;
      if (s && s.box) {
        P.block(s.box, city.terrain.heightAt(s.box.x, s.box.z), 7, s.ok);
        if (def.radius) P.ring(city, s.box.x, s.box.z, def.radius, s.ok ? 0xffffff : COLOR_BAD);
      }
      return;
    }
    if (tool.t === "bulldoze") {
      const t = this.target;
      if (t?.lot) P.block(t.lot, t.lot.y, view.heightOf(t.lot) + 1, false);
      else if (t?.seg) P.segment(t.seg, ROADS[t.seg.type].width / 2 + 0.6, COLOR_BAD);
    }
  }

  /** Something in the city changed under the tool (a milestone, a load): look again. */
  refresh() { this.dirty = true; }
}
