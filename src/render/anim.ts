// Landmarks that move: the big wheel turns, planes take off and land at the airport, a ship sails from the
// harbour, and now and then a rocket lifts off from the space centre.
import * as THREE from "three";
import { Kind } from "../sim/defs";
import type { City } from "../sim/city";
import type { Lot } from "../sim/lots";
import { plane, rocket, wheelParts } from "./blueprints";
import { shapeGeometry } from "./lotsMesh";
import type { Part, Shape } from "./parts";

const geos = new Map<Shape, THREE.BufferGeometry>();
const mats = new Map<number, THREE.MeshLambertMaterial>();
const geo = (s: Shape) => { let g = geos.get(s); if (!g) { g = shapeGeometry(s); geos.set(s, g); } return g; };
const mat = (c: number) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, flatShading: true }); mats.set(c, m); } return m; };

/** Turns a list of parts into a group of meshes (in the parts' own space). */
function build(parts: Part[], dx = 0, dy = 0, dz = 0): THREE.Group {
  const g = new THREE.Group();
  const e = new THREE.Euler();
  for (const p of parts) {
    const m = new THREE.Mesh(geo(p.shape), mat(p.color));
    m.position.set(p.x - dx, p.y - dy, p.z - dz);
    m.scale.set(p.sx, p.sy, p.sz);
    e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, "YXZ");
    m.rotation.copy(e);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

interface Thing { lot: Lot; root: THREE.Group; update(dt: number, t: number): void }

export class Animations {
  group = new THREE.Group();
  private things = new Map<number, Thing>();
  private key = "";
  private t = 0;

  update(city: City, dt: number) {
    this.t += dt;
    const key = city.lots.version + ":" + city.look;
    if (key !== this.key) {
      this.key = key;
      this.sync(city);
    }
    for (const th of this.things.values()) th.update(dt, this.t);
  }

  /** Makes the moving things of new landmarks, and takes away those of landmarks that are gone. */
  private sync(city: City) {
    const seen = new Set<number>();
    for (const lot of city.lots.lots.values()) {
      if (lot.built < 1 || lot.flags & (16 | 128)) continue; // abandoned or burnt
      if (lot.kind !== Kind.Ferris && lot.kind !== Kind.Airport && lot.kind !== Kind.Harbour && lot.kind !== Kind.Space) continue;
      seen.add(lot.id);
      if (this.things.has(lot.id)) continue;
      const th = this.make(city, lot);
      if (!th) continue;
      th.root.position.set(lot.x, lot.y, lot.z);
      th.root.rotation.y = -lot.ang;
      this.group.add(th.root);
      this.things.set(lot.id, th);
    }
    for (const [id, th] of this.things) if (!seen.has(id)) { this.group.remove(th.root); this.things.delete(id); }
  }

  private make(city: City, lot: Lot): Thing | null {
    const root = new THREE.Group();
    if (lot.kind === Kind.Ferris) {
      // The same wheel as in the model, turning round its hub; the cabins hang straight down.
      const hub = 15, R = 12.5, z = 0.4;
      const parts: Part[] = [];
      wheelParts(parts, 0, z, hub, R, 0);
      const cabins = parts.filter((p) => p.shape === "box" && p.sx > 1.2);
      const frame = build(parts.filter((p) => !cabins.includes(p)), 0, hub, 0);
      frame.position.y = hub;
      root.add(frame);
      const cabinObjs = cabins.map((c) => { const g = build([{ ...c, x: 0, y: -2.1, z: 0 }]); root.add(g); return g; });
      return { lot, root, update: (dt, t) => {
        const a = t * 0.12;
        frame.rotation.z = a;
        cabinObjs.forEach((g, i) => {
          const b = a + (i / cabinObjs.length) * Math.PI * 2;
          g.position.set(Math.cos(b) * R, hub + Math.sin(b) * R, z);
        });
      } };
    }
    if (lot.kind === Kind.Space) {
      const parts: Part[] = [];
      rocket(parts, 0, 0, 0);
      const r = build(parts);
      r.position.set(-24, 1.5, -14);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 8).rotateX(Math.PI).translate(0, -4.5, 0), new THREE.MeshBasicMaterial({ color: 0xffb03a }));
      flame.visible = false;
      r.add(flame);
      root.add(r);
      // A launch every few minutes: up, faster and faster, then a new rocket stands on the pad.
      const period = 150, offset = (lot.id * 37) % period;
      return { lot, root, update: (_dt, t) => {
        const k = (t + offset) % period;
        const fly = Math.max(0, k - (period - 22));
        r.position.y = 1.5 + fly * fly * 3;
        flame.visible = fly > 0;
        flame.scale.y = 1 + Math.sin(t * 40) * 0.25;
        r.visible = r.position.y < 1600;
      } };
    }
    if (lot.kind === Kind.Airport) {
      const parts: Part[] = [];
      plane(parts, 0, 0, 1.1, 0, 0xf5f6f4);
      const p = build(parts);
      root.add(p);
      // Take off along the runway and climb away; later come back and land.
      const period = 70, offset = (lot.id * 13) % period;
      return { lot, root, update: (_dt, t) => {
        const k = (t + offset) % period;
        if (k < 30) {
          // Taking off: roll, lift off, climb.
          const x = -50 + 2 * k * k * 0.5 + k * 2;
          const up = Math.max(0, x - 10);
          p.position.set(x, up * 0.22, -24);
          p.rotation.set(0, 0, up > 0 ? 0.18 : 0);
          p.visible = x < 1200;
        } else if (k < 40) p.visible = false;
        else {
          // Landing: come down to the runway from the far end, then roll to a stop.
          const s = (k - 40) / 30;
          const x = 900 - 950 * Math.min(1, s * 1.1);
          const h = Math.max(0, (x + 10) * 0.12);
          p.position.set(x, h, -24);
          p.rotation.set(0, Math.PI, h > 0 ? 0.08 : 0);
          p.visible = true;
        }
      } };
    }
    if (lot.kind === Kind.Harbour) {
      // A ship sails out across the water and back. Find which way the water lies.
      const T = city.terrain;
      const cos = Math.cos(-lot.ang), sin = Math.sin(-lot.ang);
      const world = (px: number, pz: number) => ({ x: lot.x + px * cos + pz * sin, z: lot.z - px * sin + pz * cos });
      let best: { dx: number; dz: number; len: number } | null = null;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
        let start = -1, len = 0;
        for (let d = 10; d < 420; d += 6) {
          const w = world(dx * d, dz * d);
          const wet = T.inside(w.x, w.z, 4) && T.heightAt(w.x, w.z) < -1.2;
          if (wet && start < 0) start = d;
          if (start >= 0) { if (wet) len = d - start; else break; }
        }
        if (start >= 0 && start < 90 && len > 60 && (!best || len > best.len)) best = { dx, dz, len: Math.min(len, 320) };
      }
      if (!best) return null;
      const parts: Part[] = [
        { shape: "box", x: 0, y: -1.5, z: 0, sx: 7, sy: 3.4, sz: 26, color: 0x2f4b7c },
        { shape: "box", x: 0, y: 1.9, z: -8.5, sx: 6, sy: 4.5, sz: 5, color: 0xf5f6f4 },
        { shape: "box", x: 0, y: 6.4, z: -8.5, sx: 1.2, sy: 2.5, sz: 1.2, color: 0xd94f4f },
        { shape: "box", x: 0, y: 1.9, z: 1, sx: 5.4, sy: 2.4, sz: 5.5, color: 0xe07a2f },
        { shape: "box", x: 0, y: 1.9, z: 7, sx: 5.4, sy: 2.4, sz: 5.5, color: 0x3f7fd0 },
        { shape: "box", x: 0, y: 4.3, z: 4, sx: 5.4, sy: 2.4, sz: 5.5, color: 0x4aa86a },
      ];
      const ship = build(parts);
      root.add(ship);
      const { dx, dz, len } = best;
      const startD = 40;
      return { lot, root, update: (_dt, t) => {
        const k = ((t * 6 + lot.id * 50) % (len * 2)) / len;
        const out = k < 1;
        const d = startD + (out ? k : 2 - k) * (len - 20);
        const w = world(dx * d, dz * d);
        const y = T.heightAt(w.x, w.z);
        ship.visible = y < -1;
        // Back into plot space, since the root stands on the plot.
        ship.position.set(dx * d, city.waterLevel - lot.y + Math.sin(t * 1.3) * 0.25, dz * d);
        ship.rotation.y = Math.atan2(dx, dz) + (out ? 0 : Math.PI);
      } };
    }
    return null;
  }

  clear() {
    for (const th of this.things.values()) this.group.remove(th.root);
    this.things.clear();
    this.key = "";
  }
}
