// Draws the roads: asphalt with lane markings, pavements, crossings, bridges and street lights.
import * as THREE from "three";
import { ROADS } from "../sim/defs";
import type { City } from "../sim/city";
import type { RSeg } from "../sim/roads";

const PAVE = [0.72, 0.72, 0.7], TAR = [0.3, 0.31, 0.34], CONCRETE = [0.62, 0.62, 0.6], SHOULDER = [0.45, 0.46, 0.47];

function laneTexture(type: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4b4e56";
  g.fillRect(0, 0, 128, 128);
  // A little grain, so the asphalt isn't flat.
  for (let i = 0; i < 500; i++) {
    g.fillStyle = i % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
    g.fillRect((i * 37) % 128, (i * 91) % 128, 2, 2);
  }
  const dash = (x: number, w: number, color: string) => { g.fillStyle = color; g.fillRect(x - w / 2, 0, w, 64); };
  const line = (x: number, w: number, color: string) => { g.fillStyle = color; g.fillRect(x - w / 2, 0, w, 128); };
  if (type === 0) dash(64, 5, "#e8e8e0");
  else if (type === 1) { line(61, 3, "#e6c84a"); line(67, 3, "#e6c84a"); dash(34, 4, "#e8e8e0"); dash(94, 4, "#e8e8e0"); line(5, 3, "#e8e8e0"); line(123, 3, "#e8e8e0"); }
  else { line(64, 9, "#8d9096"); dash(36, 4, "#e8e8e0"); dash(92, 4, "#e8e8e0"); line(7, 3, "#e8e8e0"); line(121, 3, "#e8e8e0"); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

class Builder {
  pos: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  vert(x: number, y: number, z: number, u = 0, v = 0, c: number[] = TAR): number {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, c, b, a, d, c); }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  box(x: number, y0: number, y1: number, z: number, hw: number, c: number[]) {
    const p = [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = p[k], [bx, bz] = p[(k + 1) % 4];
      const a = this.vert(x + ax, y1, z + az, 0, 0, c), b = this.vert(x + bx, y1, z + bz, 0, 0, c);
      const d = this.vert(x + ax, y0, z + az, 0, 0, c), e = this.vert(x + bx, y0, z + bz, 0, 0, c);
      this.idx.push(a, b, e, a, e, d);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

export class RoadsMesh {
  group = new THREE.Group();
  private mats: THREE.MeshLambertMaterial[];
  private baseMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private lampMat: THREE.PointsMaterial;
  private meshes: THREE.Object3D[] = [];
  private version = -1;
  private jam: THREE.Mesh | null = null;
  private jamSegs: { seg: RSeg; start: number; count: number }[] = [];
  private jamVersion = -1;
  private jamWait = 0;

  constructor() {
    this.mats = [0, 1, 2].map((t) => new THREE.MeshLambertMaterial({ map: laneTexture(t), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.baseMat.polygonOffset = true;
    this.baseMat.polygonOffsetFactor = -1;
    this.baseMat.polygonOffsetUnits = -1;
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,240,190,1)");
    grad.addColorStop(0.35, "rgba(255,215,130,0.55)");
    grad.addColorStop(1, "rgba(255,200,100,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    this.lampMat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  }

  private rebuild(city: City) {
    for (const m of this.meshes) {
      this.group.remove(m);
      ((m as THREE.Mesh).geometry as THREE.BufferGeometry).dispose();
    }
    this.meshes = [];
    const T = city.terrain;
    const tar = [new Builder(), new Builder(), new Builder()], base = new Builder();
    const lamps: number[] = [];
    const ground = (x: number, z: number) => T.heightAt(x, z);

    for (const seg of city.roads.segs.values()) {
      const def = ROADS[seg.type], hw = def.width / 2, B = tar[seg.type];
      const side = def.zones ? hw + 1.7 : hw + 1.1;
      const across = [-side, -hw, 0, hw, side];
      const prevTar: number[] = [], prevBase: number[] = [];
      let lampAt = 14;
      for (let i = 0; i <= seg.n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(seg.n, i + 1);
        let tx = seg.px[b] - seg.px[a], tz = seg.pz[b] - seg.pz[a];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        const nx = -tz, nz = tx;
        const x = seg.px[i], z = seg.pz[i], deck = seg.py[i], g0 = ground(x, z);
        const lifted = deck > g0 + 0.2;
        const curTar: number[] = [], curBase: number[] = [];
        for (let k = 0; k < 5; k++) {
          const vx = x + nx * across[k], vz = z + nz * across[k];
          const y = lifted ? deck : Math.max(ground(vx, vz), g0 - 0.6);
          curBase.push(base.vert(vx, y + 0.1, vz, 0, 0, def.zones ? PAVE : SHOULDER));
          if (k >= 1 && k <= 3) curTar.push(B.vert(vx, y + 0.19, vz, (k - 1) / 2, seg.cum[i] / 8));
        }
        if (i > 0) {
          for (let k = 0; k < 4; k++) base.quad(prevBase[k], curBase[k], curBase[k + 1], prevBase[k + 1]);
          for (let k = 0; k < 2; k++) B.quad(prevTar[k], curTar[k], curTar[k + 1], prevTar[k + 1]);
          // Bridges get side walls and pillars.
          if (lifted && deck > g0 + 1) {
            for (const s of [-1, 1]) {
              const ax = seg.px[i - 1] + nx * side * s, az = seg.pz[i - 1] + nz * side * s, bx = x + nx * side * s, bz = z + nz * side * s;
              const y0 = seg.py[i - 1], y1 = deck;
              const v0 = base.vert(ax, y0 + 0.9, az, 0, 0, CONCRETE), v1 = base.vert(bx, y1 + 0.9, bz, 0, 0, CONCRETE);
              const v2 = base.vert(bx, y1 - 1.1, bz, 0, 0, CONCRETE), v3 = base.vert(ax, y0 - 1.1, az, 0, 0, CONCRETE);
              base.quad(v0, v1, v2, v3);
            }
            if (i % 6 === 3) base.box(x, Math.min(g0, -4) - 0.5, deck - 0.4, z, 1.1, CONCRETE);
          }
        }
        prevTar.length = 0; prevBase.length = 0;
        prevTar.push(...curTar); prevBase.push(...curBase);
        if (seg.cum[i] >= lampAt) {
          lampAt += 30;
          const s = (i >> 2) % 2 ? 1 : -1;
          lamps.push(x + nx * (hw + 0.6) * s, deck + 4.6, z + nz * (hw + 0.6) * s);
        }
      }
    }

    // Crossings and road ends: a round patch of asphalt.
    for (const node of city.roads.nodes.values()) {
      if (!node.segs.length) continue;
      const segs = node.segs.map((id) => city.roads.segs.get(id)!);
      if (segs.length === 2 && segs[0].type === segs[1].type) continue;
      const hw = Math.max(...segs.map((s) => ROADS[s.type].width / 2));
      const zones = segs.some((s) => ROADS[s.type].zones);
      const g0 = ground(node.x, node.z), lifted = node.y > g0 + 0.2;
      for (const [r, lift, color] of [[hw + (zones ? 1.7 : 1.1), 0.11, zones ? PAVE : SHOULDER], [hw + 0.15, 0.22, TAR]] as [number, number, number[]][]) {
        const c = base.vert(node.x, node.y + lift, node.z, 0, 0, color);
        const ring: number[] = [];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2, vx = node.x + Math.cos(a) * r, vz = node.z + Math.sin(a) * r;
          ring.push(base.vert(vx, (lifted ? node.y : Math.max(ground(vx, vz), g0 - 0.6)) + lift, vz, 0, 0, color));
        }
        for (let k = 0; k < 16; k++) base.tri(c, ring[(k + 1) % 16], ring[k]);
      }
    }

    tar.forEach((b, t) => {
      if (!b.idx.length) return;
      const m = new THREE.Mesh(b.geometry(), this.mats[t]);
      m.receiveShadow = true;
      this.meshes.push(m);
    });
    if (base.idx.length) {
      const m = new THREE.Mesh(base.geometry(), this.baseMat);
      m.receiveShadow = true;
      this.meshes.push(m);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lamps, 3));
    const lp = new THREE.Points(lg, this.lampMat);
    lp.frustumCulled = false;
    this.meshes.push(lp);
    for (const m of this.meshes) this.group.add(m);
  }

  /** The traffic view: every road coloured from green (free) to red (jammed). */
  private rebuildJam(city: City) {
    if (this.jam) { this.group.remove(this.jam); this.jam.geometry.dispose(); }
    const pos: number[] = [], idx: number[] = [];
    this.jamSegs = [];
    for (const seg of city.roads.segs.values()) {
      const hw = ROADS[seg.type].width / 2 + 0.4, start = pos.length / 3;
      for (let i = 0; i <= seg.n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(seg.n, i + 1);
        let tx = seg.px[b] - seg.px[a], tz = seg.pz[b] - seg.pz[a];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        pos.push(seg.px[i] + tz * hw, seg.py[i] + 0.9, seg.pz[i] - tx * hw, seg.px[i] - tz * hw, seg.py[i] + 0.9, seg.pz[i] + tx * hw);
        if (i > 0) { const v = start + i * 2; idx.push(v - 2, v, v + 1, v - 2, v + 1, v - 1); }
      }
      this.jamSegs.push({ seg, start, count: (seg.n + 1) * 2 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    g.setIndex(idx);
    this.jam = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }));
    this.jam.renderOrder = 3;
    this.group.add(this.jam);
  }

  update(city: City, night: number, showJam: boolean, dt: number) {
    if (this.version !== city.roads.version) {
      this.version = city.roads.version;
      this.rebuild(city);
    }
    this.lampMat.opacity = night * 0.95;
    if (showJam) {
      if (!this.jam || this.jamVersion !== city.roads.version) { this.jamVersion = city.roads.version; this.rebuildJam(city); this.jamWait = 0; }
      this.jam!.visible = true;
      this.jamWait -= dt;
      if (this.jamWait <= 0) {
        this.jamWait = 0.8;
        const col = this.jam!.geometry.getAttribute("color") as THREE.BufferAttribute, arr = col.array as Float32Array;
        for (const { seg, start, count } of this.jamSegs) {
          const j = city.traffic.jam(seg);
          const r = Math.min(1, j * 2.2), g = Math.min(1, 2.1 - j * 2.2) * 0.85;
          for (let i = start; i < start + count; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = 0.12; }
        }
        col.needsUpdate = true;
      }
    } else if (this.jam) this.jam.visible = false;
  }

  dispose() {
    for (const m of this.meshes) ((m as THREE.Mesh).geometry as THREE.BufferGeometry).dispose();
    if (this.jam) this.jam.geometry.dispose();
  }
}
