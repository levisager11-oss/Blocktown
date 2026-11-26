// The 3D view of the city: camera, sun and sky, and all the things drawn in it.
import * as THREE from "three";
import type { City } from "../sim/city";
import type { Lot } from "../sim/lots";
import { clamp, lerp, smoothstep } from "../sim/util";
import { Cars, Flames, Sky } from "./fx";
import { Land } from "./land";
import { LotsMesh } from "./lotsMesh";
import { InfoLayer, InfoView, Preview } from "./overlay";
import { RoadsMesh } from "./roadsMesh";

export type QualityLevel = "low" | "medium" | "high";
export interface Camera { x: number; z: number; dist: number; yaw: number; pitch: number }

const NIGHT_SKY = new THREE.Color(0x0d1430), DAY_SKY = new THREE.Color(0x9ed2f7), DUSK_SKY = new THREE.Color(0xf0a878);
const GREY_DAY = new THREE.Color(0xaeb8c2), GREY_NIGHT = new THREE.Color(0x161a26);
const SUN_LOW = new THREE.Color(0xffb27a), SUN_HIGH = new THREE.Color(0xfff3dd), MOON = new THREE.Color(0x8ea6ff);

export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 2, 9000);
  cam: Camera = { x: 0, z: 0, dist: 420, yaw: 0.6, pitch: 0.85 };
  goal: Camera = { ...this.cam };
  city: City | null = null;
  infoView: InfoView = "";
  showEmpty = false;
  showTransit = false;
  dayNight = true;
  /** 0 by day, 1 in the dark: windows and street lights follow it. */
  night = 0;
  preview = new Preview();
  quality: QualityLevel = "medium";

  private sun = new THREE.DirectionalLight(0xffffff, 2.6);
  private hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6b7a55, 1);
  private land: Land | null = null;
  private roads = new RoadsMesh();
  private lots = new LotsMesh();
  /** Called when a building is finished. */
  set onFinished(fn: (lot: Lot) => void) { this.lots.onFinished = fn; }
  private cars: Cars;
  private sky: Sky;
  private flames = new Flames();
  private info: InfoLayer | null = null;
  private world = new THREE.Group();
  private ray = new THREE.Raycaster();
  private v = new THREE.Vector3();
  private bg = new THREE.Color();
  private flash = 0;
  private targetY = 0;
  private w = 1;
  private h = 1;

  constructor(readonly canvas: HTMLCanvasElement, phone: boolean) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !phone, powerPreference: "high-performance" });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.cars = new Cars(phone ? 900 : 2200);
    this.sky = new Sky(phone ? 1400 : 3200);
    this.scene.add(this.sun, this.sun.target, this.hemi, this.world);
    this.scene.fog = new THREE.Fog(0x9ed2f7, 600, 4000);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.7;
    this.world.add(this.roads.group, this.lots.group, this.cars.mesh, this.sky.points, this.flames.mesh, this.preview.group);
    this.setQuality(phone ? "low" : "medium");
  }

  setQuality(q: QualityLevel) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === "low" ? Math.min(dpr, 1) : q === "medium" ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
    this.renderer.shadowMap.enabled = q === "high";
    this.sun.castShadow = q === "high";
    this.renderer.setSize(this.w, this.h, false);
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    if (this.city) this.setCity(this.city);
  }

  setCity(city: City) {
    const keepCamera = this.city === city;
    this.city = city;
    if (this.land) { this.world.remove(this.land.group); this.land.dispose(); }
    if (this.info) this.world.remove(this.info.mesh);
    this.land = new Land(city, this.quality === "low" ? 0.5 : 1);
    this.info = new InfoLayer(city, this.land.mesh.geometry);
    this.world.add(this.land.group, this.info.mesh);
    this.lots.refresh();
    if (!keepCamera) {
      const s = city.terrain.size;
      this.cam = { x: s / 2, z: s / 2, dist: s * 0.75, yaw: 0.6, pitch: 0.85 };
      this.goal = { ...this.cam };
    }
  }

  resize(w: number, h: number) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // A narrow phone screen held upright sees less to the sides: widen the angle a little.
    this.camera.fov = w < h ? 46 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** Jumps (or glides) to a spot. */
  focus(x: number, z: number, dist?: number, instant = false) {
    this.goal.x = x; this.goal.z = z;
    if (dist) this.goal.dist = dist;
    if (instant) this.cam = { ...this.goal };
  }

  lightning() { this.flash = 1; }

  private placeCamera(dt: number) {
    const city = this.city!, c = this.cam, g = this.goal, s = city.terrain.size;
    g.x = clamp(g.x, 0, s); g.z = clamp(g.z, 0, s);
    g.dist = clamp(g.dist, 45, s * 1.5);
    g.pitch = clamp(g.pitch, 0.3, 1.5);
    const k = 1 - Math.exp(-dt * 14);
    c.x += (g.x - c.x) * k; c.z += (g.z - c.z) * k; c.dist += (g.dist - c.dist) * k;
    c.yaw += (g.yaw - c.yaw) * k; c.pitch += (g.pitch - c.pitch) * k;
    const ty = Math.max(city.terrain.heightAt(c.x, c.z), 0);
    this.targetY += (ty - this.targetY) * Math.min(1, dt * 5);
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    this.camera.position.set(c.x + Math.sin(c.yaw) * cp * c.dist, this.targetY + sp * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    // Never below the ground.
    const cx = clamp(this.camera.position.x, 0, s), cz = clamp(this.camera.position.z, 0, s);
    const floor = city.terrain.heightAt(cx, cz) + 4;
    if (this.camera.position.x === cx && this.camera.position.z === cz && this.camera.position.y < floor) this.camera.position.y = floor;
    this.camera.lookAt(c.x, this.targetY, c.z);
    this.camera.near = Math.max(2, c.dist * 0.02);
    this.camera.far = c.dist * 4 + 5000;
    this.camera.updateProjectionMatrix();
  }

  private light(dt: number) {
    const city = this.city!, W = city.weather;
    const hour = this.dayNight ? city.hour : 13;
    // The sun is up from 6 to 20.
    const phase = (hour - 6) / 14;
    const el = Math.sin(Math.PI * phase);
    const up = phase > 0 && phase < 1;
    const day = up ? smoothstep(-0.02, 0.3, el) : 0;
    this.night = up ? smoothstep(0.3, 0.04, el) : 1;
    const az = Math.PI * (up ? phase : (((hour + 4) % 24) / 10)) + 0.5;
    const e = up ? Math.max(0.12, el) * 1.1 : 0.7;
    const dir = this.v.set(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e) * 0.8 + 0.25).normalize();
    const c = this.cam;
    this.sun.position.set(c.x + dir.x * 1500, this.targetY + dir.y * 1500, c.z + dir.z * 1500);
    this.sun.target.position.set(c.x, this.targetY, c.z);
    const cloud = W.cloud;
    this.sun.color.copy(up ? SUN_LOW : MOON).lerp(up ? SUN_HIGH : MOON, smoothstep(0, 0.55, el));
    this.sun.intensity = lerp(0.5, 2.7, day) * (1 - cloud * 0.5);
    this.flash = Math.max(0, this.flash - dt * 5);
    this.hemi.intensity = lerp(0.62, 1.25, day) * (1 - cloud * 0.12) + this.flash * 3;
    this.hemi.color.setRGB(lerp(0.5, 0.82, day), lerp(0.58, 0.9, day), lerp(0.95, 1, day));
    this.hemi.groundColor.setRGB(lerp(0.2, 0.42, day), lerp(0.23, 0.46, day), lerp(0.33, 0.33, day));
    // Sky and haze.
    const dusk = up ? smoothstep(0.45, 0.05, el) * (1 - cloud) : 0;
    this.bg.copy(NIGHT_SKY).lerp(DAY_SKY, day).lerp(DUSK_SKY, dusk * 0.6);
    this.bg.lerp(day > 0.5 ? GREY_DAY : GREY_NIGHT, cloud * 0.75);
    if (this.flash > 0) this.bg.lerp(SUN_HIGH, this.flash * 0.6);
    this.scene.background = this.bg;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.bg);
    const far = c.dist * 3.2 + 2600, near = c.dist * 1.1 + 500;
    fog.near = lerp(near, c.dist * 0.5 + 40, W.fog * 0.85 + W.rain * 0.3);
    fog.far = lerp(far, c.dist * 1.4 + 420, W.fog * 0.9 + W.rain * 0.35);
    if (this.sun.castShadow) {
      const r = clamp(c.dist * 0.85, 140, 900), cam = this.sun.shadow.camera;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 100; cam.far = 3200;
      cam.updateProjectionMatrix();
    }
  }

  /** Draws one picture. `dt` is real time, for smooth camera moves. */
  frame(dt: number) {
    const city = this.city;
    if (!city || !this.land || !this.info) return;
    this.placeCamera(dt);
    this.light(dt);
    this.land.update(city, dt);
    this.roads.update(city, this.night, this.infoView === "traffic", dt);
    this.lots.update(city, this.night, this.showEmpty, dt);
    this.cars.update(city, this.night);
    this.flames.update(city, dt, this.lots.heights);
    const W = city.weather;
    const spread = clamp(this.cam.dist * 1.6, 160, 1500);
    this.sky.update(dt, W.rain, W.snowing, W.wind, this.cam.x, this.targetY, this.cam.z, spread);
    this.info.update(city, this.infoView);
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ pointing at things

  private aim(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    return this.ray.ray;
  }

  /** The spot on the land (or the water) under a point of the screen. */
  groundAt(clientX: number, clientY: number): { x: number; y: number; z: number } | null {
    const city = this.city;
    if (!city) return null;
    const ray = this.aim(clientX, clientY), T = city.terrain;
    if (ray.direction.y > -0.02) return null;
    const height = (x: number, z: number) => Math.max(T.heightAt(x, z), city.waterLevel);
    let t = Math.max(0, (ray.origin.y - 70) / -ray.direction.y), prev = t;
    const p = this.v;
    for (let i = 0; i < 400; i++) {
      p.copy(ray.direction).multiplyScalar(t).add(ray.origin);
      if (p.y <= height(p.x, p.z)) {
        // Close in on the exact spot.
        let lo = prev, hi = t;
        for (let k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          p.copy(ray.direction).multiplyScalar(mid).add(ray.origin);
          if (p.y <= height(p.x, p.z)) hi = mid; else lo = mid;
        }
        p.copy(ray.direction).multiplyScalar(hi).add(ray.origin);
        return { x: p.x, y: height(p.x, p.z), z: p.z };
      }
      prev = t;
      t += 1.5 + t * 0.012;
    }
    return null;
  }

  /** The plot under a point of the screen. Tall buildings can be hit anywhere on them. */
  lotAt(clientX: number, clientY: number): Lot | null {
    const city = this.city, hit = this.groundAt(clientX, clientY);
    if (!city || !hit) return null;
    const ray = this.aim(clientX, clientY);
    const tGround = (hit.y - ray.origin.y) / ray.direction.y;
    const p = this.v;
    for (let back = 70 / -ray.direction.y; back >= 0; back -= 1.5) {
      p.copy(ray.direction).multiplyScalar(tGround - back).add(ray.origin);
      const lot = city.lots.at(p.x, p.z);
      if (lot && lot.kind && p.y <= lot.y + (this.lots.heights.get(lot.id) ?? 0) + 0.5) return lot;
    }
    return city.lots.at(hit.x, hit.z);
  }

  /** Where a point of the world is on the screen. */
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const p = this.v.set(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 };
  }

  heightOf(lot: Lot): number { return this.lots.heights.get(lot.id) ?? 0; }
}
