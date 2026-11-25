// Things drawn over the city: the info views (a coloured layer on the land) and the previews of the tools.
import * as THREE from "three";
import type { City } from "../sim/city";
import type { Box } from "../sim/geom";
import { MAP_CELL, MapName } from "../sim/maps";
import type { RSeg } from "../sim/roads";
import type { Line, Stop } from "../sim/transit";

export type InfoView = "" | "traffic" | "value" | "pollution" | "noise" | "police" | "fire" | "health" | "school" | "charm" | "soil" | "forest" | "ore" | "oil" | "flood";
const RES: Record<string, number> = { soil: 0, forest: 1, ore: 2, oil: 3 };
const TINT: Record<string, number[]> = {
  pollution: [120, 60, 130], noise: [235, 130, 40], police: [50, 110, 235], fire: [235, 70, 50], health: [240, 90, 160],
  school: [245, 190, 40], charm: [40, 190, 90], soil: [190, 200, 40], forest: [20, 120, 50], ore: [170, 80, 50], oil: [50, 30, 70],
};

export class InfoLayer {
  mesh: THREE.Mesh;
  private tex: THREE.DataTexture;
  private data: Uint8Array;
  private n: number;
  private key = "";

  constructor(city: City, landGeometry: THREE.BufferGeometry) {
    this.n = city.maps.n;
    this.data = new Uint8Array(this.n * this.n * 4);
    this.tex = new THREE.DataTexture(this.data, this.n, this.n, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(landGeometry, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
  }

  update(city: City, view: InfoView) {
    const on = view !== "" && view !== "traffic";
    this.mesh.visible = on;
    if (!on) return;
    const key = view + ":" + city.maps.version;
    if (key === this.key) return;
    this.key = key;
    const n = this.n, d = this.data, T = city.terrain;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * MAP_CELL, z = (j + 0.5) * MAP_CELL, o = (j * n + i) * 4;
        const h = T.heightAt(Math.min(x, T.size - 1), Math.min(z, T.size - 1));
        let r = 0, g = 0, b = 0, a = 0;
        if (h > 0.4) {
          if (view === "value") {
            const v = city.maps.at("value", x, z);
            r = v < 0.5 ? 230 : 230 - (v - 0.5) * 380; g = v < 0.5 ? 60 + v * 300 : 210; b = 50; a = 150;
          } else if (view === "flood") {
            if (h < 3.3) { r = 40; g = 110; b = 240; a = 90 + (3.3 - h) * 45; }
          } else {
            const v = view in RES ? T.resourceAt(RES[view], x, z) : city.maps.at(view as MapName, x, z);
            const t = TINT[view];
            r = t[0]; g = t[1]; b = t[2]; a = 25 + Math.min(1, v) * 190;
            if (v < 0.03) a = 25;
          }
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
      }
    this.tex.needsUpdate = true;
  }
}

const OK = 0x49d17d, BAD = 0xe5484d, BLUE = 0x4aa8ff;

/** The previews of the tools: the road about to be built, the spot a building would take, and so on. */
export class Preview {
  group = new THREE.Group();
  private ribbon: THREE.Mesh;
  private ribbonMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  private box: THREE.Mesh;
  private boxMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.45, depthWrite: false });
  private ringLine: THREE.LineLoop;
  private ringMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
  private dots: THREE.InstancedMesh;
  private lines = new THREE.Group();
  private lineKey = "";
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor() {
    this.ribbon = new THREE.Mesh(new THREE.BufferGeometry(), this.ribbonMat);
    this.ribbon.renderOrder = 4;
    this.box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), this.boxMat);
    this.box.renderOrder = 4;
    this.ringLine = new THREE.LineLoop(new THREE.BufferGeometry(), this.ringMat);
    this.ringLine.renderOrder = 6;
    this.dots = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthTest: false }), 64);
    this.dots.renderOrder = 7;
    this.dots.frustumCulled = false;
    for (const o of [this.ribbon, this.box, this.ringLine, this.dots, this.lines]) { o.visible = false; (o as THREE.Mesh).frustumCulled = false; this.group.add(o); }
    this.lines.visible = true;
  }

  clear() {
    this.ribbon.visible = this.box.visible = this.ringLine.visible = false;
    this.dots.count = 0;
    this.dots.visible = false;
  }

  /** A strip along a line of points: a planned road, or a road picked out. */
  strip(px: ArrayLike<number>, pz: ArrayLike<number>, py: ArrayLike<number>, halfWidth: number, ok: boolean, color?: number) {
    const n = px.length;
    if (n < 2) { this.ribbon.visible = false; return; }
    const pos = new Float32Array(n * 6), idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = px[b] - px[a], tz = pz[b] - pz[a];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l; tz /= l;
      pos.set([px[i] + tz * halfWidth, py[i] + 0.7, pz[i] - tx * halfWidth, px[i] - tz * halfWidth, py[i] + 0.7, pz[i] + tx * halfWidth], i * 6);
      if (i > 0) idx.push(i * 2 - 2, i * 2, i * 2 + 1, i * 2 - 2, i * 2 + 1, i * 2 - 1);
    }
    const g = this.ribbon.geometry;
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.ribbonMat.color.setHex(color ?? (ok ? OK : BAD));
    this.ribbon.visible = true;
  }

  segment(seg: RSeg, halfWidth: number, color: number) { this.strip(seg.px, seg.pz, seg.py, halfWidth, true, color); }

  /** A see-through block over a plot. */
  block(b: Box, y: number, height: number, ok: boolean, color?: number) {
    this.box.position.set(b.x, y - 0.5, b.z);
    this.box.rotation.set(0, -b.ang, 0);
    this.box.scale.set(b.w, height + 0.5, b.d);
    this.boxMat.color.setHex(color ?? (ok ? OK : BAD));
    this.box.visible = true;
  }

  /** A circle on the ground: the brush of the zone tool, or how far a service reaches. */
  ring(city: City, x: number, z: number, r: number, color = 0xffffff) {
    const n = 64, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, vx = x + Math.cos(a) * r, vz = z + Math.sin(a) * r;
      pos.set([vx, Math.max(city.terrain.heightAt(vx, vz), city.waterLevel) + 0.8, vz], i * 3);
    }
    this.ringLine.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.ringMat.color.setHex(color);
    this.ringLine.visible = true;
  }

  /** Round markers: where a road starts or snaps to, the stops of a line being drawn. */
  dot(x: number, y: number, z: number, r: number, color: number) {
    const i = this.dots.count;
    if (i >= 64) return;
    this.dummy.position.set(x, y + 0.3, z);
    this.dummy.scale.set(r, 0.8, r);
    this.dummy.updateMatrix();
    this.dots.setMatrixAt(i, this.dummy.matrix);
    this.dots.setColorAt(i, this.color.setHex(color));
    this.dots.count = i + 1;
    this.dots.visible = true;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
  }

  /** Bus and metro lines with their stops; `draft` is the line being drawn. */
  transit(city: City, show: boolean, draft: Stop[] | null, draftMetro: boolean) {
    const key = show ? city.transit.version + ":" + city.roads.version + ":" + (draft ? draft.length + (draftMetro ? "m" : "b") : "-") : "";
    if (key === this.lineKey) return;
    this.lineKey = key;
    for (const c of [...this.lines.children]) {
      this.lines.remove(c);
      const m = c as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    if (!show) return;
    const all: { stops: Stop[]; color: number; metro: boolean; closed: boolean }[] = city.transit.lines.map((l: Line) => ({ stops: l.stops, color: l.color, metro: l.metro, closed: !l.metro }));
    if (draft && draft.length) all.push({ stops: draft, color: 0xffffff, metro: draftMetro, closed: false });
    all.forEach((line, li) => {
      const pts: THREE.Vector3[] = [];
      const lift = 3 + (li % 5) * 0.5;
      const add = (s: Stop) => pts.push(new THREE.Vector3(s.x, city.terrain.heightAt(s.x, s.z) + lift, s.z));
      line.stops.forEach(add);
      if (line.closed && line.stops.length > 2) add(line.stops[0]);
      if (pts.length > 1) {
        const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 10), line.metro ? 1.5 : 0.9, 5), new THREE.MeshBasicMaterial({ color: line.color, transparent: true, opacity: 0.85, depthTest: false }));
        tube.renderOrder = 5;
        this.lines.add(tube);
      }
      for (const s of line.stops) {
        const stop = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, lift + 1.5, 10), new THREE.MeshBasicMaterial({ color: line.color, depthTest: false, transparent: true, opacity: 0.95 }));
        stop.position.set(s.x, city.terrain.heightAt(s.x, s.z) + lift / 2, s.z);
        stop.renderOrder = 6;
        this.lines.add(stop);
      }
    });
  }
}
export { OK as COLOR_OK, BAD as COLOR_BAD, BLUE as COLOR_BLUE };
