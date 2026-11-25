// The tools the player builds with: roads, zones, buildings, the bulldozer, bus and metro lines.
import { BUS, Kind, PLACE_BY_KIND, ROADS, Road, ZONES, Zone } from "../sim/defs";
import type { City, Placement, Tone } from "../sim/city";
import { Lot, isPlaced } from "../sim/lots";
import type { Anchor, RSeg, RoadPlan } from "../sim/roads";
import type { Stop } from "../sim/transit";
import { COLOR_BAD, COLOR_BLUE } from "../render/overlay";
import type { View } from "../render/view";
import type { Sfx } from "../audio/sound";

export type Tool =
  | { t: "inspect" }
  | { t: "road"; type: Road; mode: "straight" | "curve" | "upgrade" }
  | { t: "zone"; zone: Zone }
  | { t: "place"; kind: Kind }
  | { t: "bulldoze" }
  | { t: "line"; metro: boolean };

export interface HintButton { label: string; primary?: boolean; act: () => void }
export interface Hint { key: string; args?: Record<string, string | number>; cost?: number; bad?: boolean; buttons: HintButton[] }

export interface ToolHost {
  city: City;
  view: View;
  sound(name: Sfx): void;
  toast(key: string, tone: Tone, args?: Record<string, string | number>): void;
  inspect(target: { lot?: Lot; seg?: RSeg } | null): void;
  confirm(key: string, args: Record<string, string | number>, yes: () => void): void;
  /** The line under the tools changed: draw it again. */
  hintChanged(): void;
  toolChanged(): void;
}

export const BRUSHES = [9, 20, 38];

export class Tools {
  tool: Tool = { t: "inspect" };
  brush = 1;
  private pts: Anchor[] = [];
  private hoverPt: Anchor | null = null;
  private plan: (RoadPlan & { hits: Lot[] }) | null = null;
  private spot: Placement | null = null;
  private pending = false;
  private target: { lot?: Lot; seg?: RSeg } | null = null;
  private stops: Stop[] = [];
  private cursor: { x: number; y: number; z: number } | null = null;
  private dirty = true;
  private painted = 0;
  private selected: Lot | null = null;

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
    this.plan = null;
    this.spot = null;
    this.pending = false;
    this.target = null;
    this.stops = [];
    this.cursor = null;
    this.dirty = true;
  }

  /** How many points of the road being drawn are set. */
  get pointCount() { return this.pts.length; }

  select(lot: Lot | null) { this.selected = lot; this.dirty = true; }

  // ------------------------------------------------------------------ snapping

  /** Turns a spot on the ground into a place a road can start or end: a crossing, a spot on a road, or open land. */
  private snap(x: number, z: number, type: Road): Anchor {
    const roads = this.host.city.roads, hw = ROADS[type].width / 2;
    const node = roads.nearestNode(x, z, Math.max(9, hw + 5));
    if (node) return { x: node.x, z: node.z, node: node.id };
    const hit = roads.nearestSeg(x, z, hw + 6);
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
      if (tool.mode === "upgrade") {
        const hit = city.roads.nearestSeg(g.x, g.z, 12);
        this.target = hit ? { seg: hit.seg } : null;
        this.host.hintChanged();
        return;
      }
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
        const hit = city.roads.nearestSeg(g.x, g.z, 9);
        this.target = hit ? { seg: hit.seg } : null;
      }
    }
  }

  private replan() {
    const tool = this.tool;
    if (tool.t !== "road" || !this.pts.length || !this.hoverPt) { this.plan = null; this.host.hintChanged(); return; }
    const city = this.host.city;
    if (tool.mode === "curve" && this.pts.length === 1) {
      // First leg of a curve: show a straight line to the bend point.
      this.plan = city.planRoad(this.pts[0], this.hoverPt, null, tool.type);
    } else if (tool.mode === "curve") {
      this.plan = city.planRoad(this.pts[0], this.hoverPt, { x: this.pts[1].x, z: this.pts[1].z }, tool.type);
    } else this.plan = city.planRoad(this.pts[0], this.hoverPt, null, tool.type);
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
    if (tool.t === "zone") { this.painted = 0; this.paint(g); return true; }
    if (tool.t === "road") {
      if (tool.mode === "upgrade") return false;
      if (!this.pts.length) {
        this.pts.push(this.snap(g.x, g.z, tool.type));
        this.hoverPt = null;
        this.plan = null;
        this.host.sound("click");
        this.host.hintChanged();
      }
      return true;
    }
    if (tool.t === "place") { this.pending = false; this.track(g, x, y, touch); return true; }
    return false;
  }

  drag(x: number, y: number, touch: boolean) {
    const g = this.ground(x, y);
    this.cursor = g;
    this.dirty = true;
    if (!g) return;
    if (this.tool.t === "zone") this.paint(g);
    else this.track(g, x, y, touch);
  }

  /** The press ended. `moved` says whether it was a drag rather than a tap. */
  up(x: number, y: number, moved: boolean, touch: boolean, startedHere: boolean) {
    const tool = this.tool, city = this.host.city;
    const g = this.ground(x, y);
    this.dirty = true;
    if (tool.t === "zone") {
      if (this.painted) this.host.sound("zone");
      return;
    }
    if (!g) return;
    if (tool.t === "inspect") {
      if (moved) return;
      const lot = this.host.view.lotAt(x, y);
      if (lot && lot.kind) { this.host.inspect({ lot }); this.host.sound("click"); return; }
      const hit = city.roads.nearestSeg(g.x, g.z, 9);
      this.host.inspect(hit ? { seg: hit.seg } : lot && lot.zone ? { lot } : null);
      return;
    }
    if (tool.t === "road") {
      if (tool.mode === "upgrade") {
        if (moved) return;
        const hit = city.roads.nearestSeg(g.x, g.z, 12);
        if (!hit) return;
        const why = city.upgradeRoad(hit.seg, tool.type);
        if (why && why !== "same") { this.host.toast("why." + why, "bad"); this.host.sound("error"); }
        else if (!why) this.host.sound("road");
        return;
      }
      // A press that only set the start point: wait for the next one, unless it was a drag to the end point.
      if (startedHere && !moved) return;
      let a = this.snap(g.x, g.z, tool.type);
      if (this.pts.length) a = this.square(this.pts[this.pts.length - 1], a);
      this.hoverPt = a;
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
      this.track(g, x, y, touch);
      this.bulldoze();
      return;
    }
    if (tool.t === "line") {
      if (moved) return;
      this.addStop(g, x, y);
    }
  }

  // ------------------------------------------------------------------ doing things

  private paint(g: { x: number; z: number }) {
    if (this.tool.t !== "zone") return;
    const n = this.host.city.paintZone(g.x, g.z, BRUSHES[this.brush], this.tool.zone);
    if (n && !this.painted) this.host.sound("zone");
    this.painted += n;
  }

  private buildRoad() {
    const plan = this.plan, city = this.host.city;
    if (!plan) return;
    if (!plan.ok) {
      this.host.toast("why." + plan.reason, "bad");
      this.host.sound("error");
      return;
    }
    const end = this.hoverPt!;
    if (city.buildRoad(plan)) {
      this.host.sound("road");
      // Carry on from the end, like drawing a line without lifting the pen.
      this.pts = [this.snap(end.x, end.z, plan.type)];
      this.hoverPt = null;
      this.plan = null;
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
    if (city.place(tool.kind, this.spot)) {
      this.host.sound("place");
      this.spot = null;
      this.pending = false;
      this.host.hintChanged();
    }
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
      const hit = city.roads.nearestSeg(g.x, g.z, 16, (s) => !ROADS[s.type].zones);
      if (!hit) { this.host.toast("why.needRoad", "warn"); return; }
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
    const r = this.host.city.transit.addLine(tool.metro, this.stops);
    if (typeof r === "string") { this.host.toast("why." + r, "bad"); this.host.sound("error"); return; }
    this.host.sound("place");
    this.host.toast("note.lineOpen", "good");
    this.stops = [];
    this.dirty = true;
    this.host.hintChanged();
  }

  /** Right click or Escape: steps back. Returns false when there was nothing to undo. */
  cancel(): boolean {
    this.dirty = true;
    if (this.pts.length || this.pending || this.stops.length) {
      this.pts = [];
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

  // ------------------------------------------------------------------ what the player is told

  hint(): Hint | null {
    const tool = this.tool, city = this.host.city;
    const cancel: HintButton = { label: "ui.cancel", act: () => this.cancel() };
    if (tool.t === "inspect") return null;
    if (tool.t === "road") {
      if (tool.mode === "upgrade") {
        const seg = this.target?.seg;
        if (seg && !seg.fixed && seg.type !== tool.type) return { key: "hint.upgradeCost", cost: city.upgradeCost(seg, tool.type), buttons: [] };
        return { key: "hint.upgrade", buttons: [] };
      }
      if (!this.pts.length) return { key: "hint.roadStart", buttons: [] };
      if (this.plan && this.hoverPt) {
        if (!this.plan.ok) return { key: "why." + this.plan.reason, bad: true, cost: this.plan.cost, buttons: [cancel] };
        if (tool.mode === "curve" && this.pts.length === 1) return { key: "hint.roadBend", buttons: [cancel] };
        return { key: "hint.roadEnd", args: { len: Math.round(this.plan.len) }, cost: this.plan.cost, buttons: [cancel] };
      }
      return { key: tool.mode === "curve" && this.pts.length === 1 ? "hint.roadBend" : "hint.roadNext", buttons: [cancel] };
    }
    if (tool.t === "zone") return { key: tool.zone === Zone.None ? "hint.dezone" : "hint.zone", buttons: [] };
    if (tool.t === "place") {
      const def = PLACE_BY_KIND.get(tool.kind)!;
      if (this.spot && !this.spot.ok && this.spot.box) return { key: "why." + this.spot.reason, bad: true, cost: def.cost, buttons: this.pending ? [cancel] : [] };
      if (this.pending && this.spot?.ok) return { key: "hint.confirmPlace", cost: def.cost, buttons: [{ label: "ui.build", primary: true, act: () => this.buildPlace() }, cancel] };
      return { key: def.shore ? "hint.placeShore" : "hint.place", cost: def.cost, buttons: [] };
    }
    if (tool.t === "bulldoze") return { key: "hint.bulldoze", buttons: [] };
    if (tool.t === "line") {
      const n = this.stops.length;
      const buttons: HintButton[] = [];
      if (n >= 2) buttons.push({ label: "ui.openLine", primary: true, act: () => this.finishLine() });
      if (n) buttons.push({ label: "ui.undo", act: () => { this.stops.pop(); this.dirty = true; this.host.hintChanged(); } });
      const cost = n ? city.transit.lineCost(tool.metro, this.stops) : tool.metro ? undefined : BUS.stopCost;
      return { key: tool.metro ? "hint.metro" : "hint.bus", args: { n }, cost, buttons };
    }
    return null;
  }

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
      if (tool.mode === "upgrade") {
        const seg = this.target?.seg;
        if (seg) P.segment(seg, hw + 0.5, seg.fixed || seg.type === tool.type ? COLOR_BAD : COLOR_BLUE);
        return;
      }
      for (const p of this.pts) P.dot(p.x, city.roads.deckAt(p.x, p.z), p.z, p.node !== undefined || p.seg !== undefined ? 4 : 3, p.node !== undefined || p.seg !== undefined ? 0xffd34d : 0xffffff);
      const h = this.hoverPt;
      if (h) P.dot(h.x, city.roads.deckAt(h.x, h.z), h.z, h.node !== undefined || h.seg !== undefined ? 4 : 2.4, h.node !== undefined || h.seg !== undefined ? 0xffd34d : 0xffffff);
      else if (c && !this.pts.length) {
        const s = this.snap(c.x, c.z, tool.type);
        P.dot(s.x, city.roads.deckAt(s.x, s.z), s.z, s.node !== undefined || s.seg !== undefined ? 4 : 2.4, s.node !== undefined || s.seg !== undefined ? 0xffd34d : 0xffffff);
      }
      if (this.plan) P.strip(this.plan.px, this.plan.pz, this.plan.py, hw, this.plan.ok);
      return;
    }
    if (tool.t === "zone") {
      if (c) P.ring(city, c.x, c.z, BRUSHES[this.brush], tool.zone ? ZONES[tool.zone].color : 0xffffff);
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
