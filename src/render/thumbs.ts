// Small pictures of buildings for the build menu, drawn from the same models as the city itself.
import * as THREE from "three";
import { PLACE_BY_KIND, ZONES } from "../sim/defs";
import { blueprint } from "./blueprints";
import { shapeGeometry } from "./lotsMesh";
import { SHAPES, Shape } from "./parts";

const SIZE = 192;

export class Thumbs {
  private cache = new Map<string, string>();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
  private target: THREE.WebGLRenderTarget;
  private geos = new Map<Shape, THREE.BufferGeometry>();
  private mats = new Map<number, THREE.MeshLambertMaterial>();
  private pixels = new Uint8Array(SIZE * SIZE * 4);
  private canvas = document.createElement("canvas");
  private group = new THREE.Group();

  constructor(readonly renderer: THREE.WebGLRenderer) {
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    const sun = new THREE.DirectionalLight(0xfff3dd, 2.6);
    sun.position.set(0.6, 1, 0.9);
    this.scene.add(sun, new THREE.HemisphereLight(0xdff0ff, 0x8a9a70, 1.25), this.group);
    for (const s of SHAPES) this.geos.set(s, shapeGeometry(s));
    this.canvas.width = this.canvas.height = SIZE;
  }

  private mat(color: number): THREE.MeshLambertMaterial {
    let m = this.mats.get(color);
    if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true }); this.mats.set(color, m); }
    return m;
  }

  /** A picture of a building (by its kind, 1 to 10 for zones) as an image address. */
  get(kind: number, level = 1): string {
    const key = kind + ":" + level;
    const have = this.cache.get(key);
    if (have) return have;
    const url = this.draw(kind, level);
    this.cache.set(key, url);
    return url;
  }

  private draw(kind: number, level: number): string {
    const def = PLACE_BY_KIND.get(kind);
    const w = def ? def.w : 14, d = def ? def.d : 16;
    const parts = blueprint(kind, level, 5, w, d);
    const g = this.group;
    g.clear();
    // The plot: a slab in the colour of the zone, or paving.
    const slabColor = def ? (def.cat === "parks" ? 0x7fb765 : def.cat === "landmark" ? 0xd9d2bf : 0xc4c1b8) : ZONES[kind]?.color ?? 0xaaaaaa;
    const slab = new THREE.Mesh(this.geos.get("box")!, this.mat(slabColor));
    slab.scale.set(w, 1.2, d);
    slab.position.y = -1.2;
    g.add(slab);
    let top = 0;
    const e = new THREE.Euler();
    for (const p of parts) {
      const m = new THREE.Mesh(this.geos.get(p.shape)!, this.mat(p.shape === "win" ? mixHex(p.color, 0x6f9fc0, 0.45) : p.color));
      m.position.set(p.x, p.y, p.z);
      m.scale.set(p.sx, p.sy, p.sz);
      e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, "YXZ");
      m.rotation.copy(e);
      g.add(m);
      top = Math.max(top, p.y + p.sy);
    }
    // Look from the front, a little from the right and from above, and fit the whole thing in.
    const dir = new THREE.Vector3(0.75, 0.82, 1.15).normalize();
    const mid = new THREE.Vector3(0, top * 0.42, 0);
    const box = new THREE.Box3().setFromObject(g);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 8);
    const c = this.camera;
    c.position.copy(mid).addScaledVector(dir, r * 4);
    c.lookAt(mid);
    // Fit tightly: project the corners of the box.
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 0.1; c.far = r * 10;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    let lo = Infinity, hi = -Infinity, lx = Infinity, hx = -Infinity;
    const v = new THREE.Vector3();
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      v.set(x, y, z).applyMatrix4(c.matrixWorldInverse);
      lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); lx = Math.min(lx, v.x); hx = Math.max(hx, v.x);
    }
    const half = Math.max(hi - lo, hx - lx) / 2 * 1.06, cy = (hi + lo) / 2, cx = (hx + lx) / 2;
    c.left = cx - half; c.right = cx + half; c.top = cy + half; c.bottom = cy - half;
    c.updateProjectionMatrix();

    const R = this.renderer, before = R.getRenderTarget(), clear = R.getClearAlpha(), shadows = R.shadowMap.enabled;
    R.shadowMap.enabled = false;
    R.setRenderTarget(this.target);
    R.setClearColor(0x000000, 0);
    R.clear();
    R.render(this.scene, c);
    R.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    R.setRenderTarget(before);
    R.setClearAlpha(clear);
    R.shadowMap.enabled = shadows;
    const ctx = this.canvas.getContext("2d")!;
    const img = ctx.createImageData(SIZE, SIZE);
    // The picture comes out upside down.
    for (let y = 0; y < SIZE; y++) img.data.set(this.pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    ctx.putImageData(img, 0, 0);
    g.clear();
    return this.canvas.toDataURL("image/png");
  }
}

function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
