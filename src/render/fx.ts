// Moving things: vehicles, rain and snow, flames.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { City } from "../sim/city";
import { Veh } from "../sim/traffic";

function colored(geo: THREE.BufferGeometry, r: number, g: number, b: number): THREE.BufferGeometry {
  const g2 = geo.toNonIndexed();
  const n = g2.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
  g2.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g2;
}

// Size of each kind of vehicle: length, height, width.
const SIZE = [[4.4, 1.5, 2.1], [8.6, 2.9, 2.5], [10.5, 3, 2.6], [8.4, 2.8, 2.5]];

export class Cars {
  mesh: THREE.InstancedMesh;
  private box: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private mat: THREE.MeshLambertMaterial;

  constructor(max: number) {
    // A car: a body with a darker cabin on top. Boxes are used for lorries, buses and fire engines.
    const body = colored(new THREE.BoxGeometry(1, 0.55, 1).translate(0, 0.42, 0), 1, 1, 1);
    const cabin = colored(new THREE.BoxGeometry(0.86, 0.45, 0.52).translate(0, 0.86, -0.06), 0.16, 0.2, 0.26);
    const wheels = colored(new THREE.BoxGeometry(1.04, 0.3, 0.74).translate(0, 0.15, 0), 0.08, 0.08, 0.09);
    const car = mergeGeometries([body, cabin, wheels])!;
    const big = mergeGeometries([
      colored(new THREE.BoxGeometry(1, 0.82, 1).translate(0, 0.59, 0), 1, 1, 1),
      colored(new THREE.BoxGeometry(1.02, 0.2, 0.9).translate(0, 0.72, 0), 0.2, 0.25, 0.3),
      colored(new THREE.BoxGeometry(1.04, 0.2, 0.8).translate(0, 0.1, 0), 0.08, 0.08, 0.09),
    ])!;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.InstancedMesh(car, this.mat, max);
    this.box = new THREE.InstancedMesh(big, this.mat, Math.ceil(max / 3));
    for (const m of [this.mesh, this.box]) {
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
    }
    this.mesh.add(this.box);
  }

  update(city: City, night: number) {
    const d = this.dummy, agents = city.traffic.agents;
    let n = 0, nb = 0;
    const max = this.mesh.instanceMatrix.count, maxB = this.box.instanceMatrix.count;
    for (const a of agents) {
      if (a.dead) continue;
      const big = a.kind !== Veh.Car;
      if (big ? nb >= maxB : n >= max) continue;
      const s = SIZE[a.kind];
      d.position.set(a.x, a.y + 0.2, a.z);
      d.rotation.set(0, a.ang, 0);
      d.scale.set(s[2], s[1], s[0]);
      d.updateMatrix();
      const mesh = big ? this.box : this.mesh, i = big ? nb++ : n++;
      mesh.setMatrixAt(i, d.matrix);
      mesh.setColorAt(i, this.color.setHex(a.color));
    }
    this.mesh.count = n;
    this.box.count = nb;
    for (const m of [this.mesh, this.box]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // Lights on at night.
    this.mat.emissive.setRGB(0.1 * night, 0.09 * night, 0.06 * night);
  }
}

/** Rain (short streaks) or snow (soft dots) falling around the spot the camera looks at. */
export class Sky {
  points = new THREE.Group();
  private n: number;
  private base: Float32Array;
  private speed: Float32Array;
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private rainMat = new THREE.LineBasicMaterial({ color: 0xcfe0f2, transparent: true, opacity: 0.4, depthWrite: false });
  private snowMat: THREE.PointsMaterial;

  constructor(count: number) {
    this.n = count;
    this.base = new Float32Array(count * 3);
    this.speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.base[i * 3] = Math.random();
      this.base[i * 3 + 1] = Math.random();
      this.base[i * 3 + 2] = Math.random();
      this.speed[i] = 0.7 + Math.random() * 0.6;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.snowMat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), color: 0xffffff, size: 2, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true });
    this.snow = new THREE.Points(sg, this.snowMat);
    for (const o of [this.rain, this.snow]) { o.frustumCulled = false; o.renderOrder = 5; this.points.add(o); }
  }

  update(dt: number, amount: number, snow: boolean, wind: number, cx: number, cy: number, cz: number, spread: number) {
    const on = amount > 0.03;
    this.rain.visible = on && !snow;
    this.snow.visible = on && snow;
    if (!on) return;
    const base = this.base, n = this.n;
    const fall = (snow ? 0.1 : 1.1) * dt, drift = wind * (snow ? 0.04 : 0.06) * dt;
    for (let i = 0; i < n; i++) {
      let y = base[i * 3 + 1] - fall * this.speed[i];
      if (y < 0) y += 1;
      base[i * 3 + 1] = y;
      let x = base[i * 3] + drift;
      if (x > 1) x -= 1;
      base[i * 3] = x;
    }
    const shown = Math.floor(n * Math.min(1, amount * 1.3));
    const height = spread * 0.6, x0 = cx - spread / 2, y0 = cy - spread * 0.05, z0 = cz - spread / 2;
    if (snow) {
      const attr = this.snow.geometry.getAttribute("position") as THREE.BufferAttribute, pos = attr.array as Float32Array;
      for (let i = 0; i < shown; i++) {
        pos[i * 3] = x0 + base[i * 3] * spread + Math.sin(base[i * 3 + 1] * 30 + i) * 2;
        pos[i * 3 + 1] = y0 + base[i * 3 + 1] * height;
        pos[i * 3 + 2] = z0 + base[i * 3 + 2] * spread;
      }
      attr.needsUpdate = true;
      this.snow.geometry.setDrawRange(0, shown);
      this.snowMat.size = Math.max(1.6, spread / 260);
      this.snowMat.opacity = Math.min(0.95, 0.4 + amount);
    } else {
      const attr = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute, pos = attr.array as Float32Array;
      const len = Math.max(5, spread / 60), lean = wind * len * 0.35;
      for (let i = 0; i < shown; i++) {
        const x = x0 + base[i * 3] * spread, y = y0 + base[i * 3 + 1] * height, z = z0 + base[i * 3 + 2] * spread;
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x - lean; pos[i * 6 + 4] = y + len; pos[i * 6 + 5] = z;
      }
      attr.needsUpdate = true;
      this.rain.geometry.setDrawRange(0, shown * 2);
      this.rainMat.opacity = Math.min(0.55, 0.2 + amount * 0.4);
    }
  }
}

/** Flames and smoke over burning buildings. */
export class Flames {
  mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private t = 0;

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }), 240);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(city: City, dt: number, heights: Map<number, number>) {
    this.t += dt;
    let n = 0;
    const d = this.dummy, max = this.mesh.instanceMatrix.count;
    for (const lot of city.disasters.fires.keys()) {
      const top = (heights.get(lot.id) ?? 6) * 0.6;
      for (let k = 0; k < 6 && n < max; k++) {
        const ph = this.t * (5 + k) + lot.id + k * 1.7;
        const smoke = k >= 4;
        const life = (this.t * 0.5 + k * 0.37 + lot.id * 0.1) % 1;
        d.position.set(lot.x + Math.sin(k * 2.1 + lot.id) * lot.w * 0.25, lot.y + top * (0.5 + 0.1 * k) + (smoke ? life * 14 + 4 : 0), lot.z + Math.cos(k * 1.3 + lot.id) * lot.d * 0.25);
        const s = smoke ? 3 + life * 5 : (2.2 + Math.sin(ph) * 0.9) * (0.5 + lot.fire);
        d.scale.set(s, smoke ? s : s * 1.9, s);
        d.rotation.set(0, ph, 0);
        d.updateMatrix();
        this.mesh.setMatrixAt(n, d.matrix);
        if (smoke) this.color.setRGB(0.12, 0.12, 0.12); else this.color.setRGB(1, 0.42 + 0.3 * Math.sin(ph * 1.3) ** 2, 0.08);
        this.mesh.setColorAt(n, this.color);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
