// Draws the plots and everything standing on them. All buildings share a few simple shapes, each drawn
// thousands of times in one go, which keeps big cities fast.
import * as THREE from "three";
import { PLACE_BY_KIND, ZONES, Zone } from "../sim/defs";
import type { City } from "../sim/city";
import { LF, Lot, isZoned } from "../sim/lots";
import { blueprint } from "./blueprints";
import { Part, SHAPES, Shape } from "./parts";

function gableGeometry(): THREE.BufferGeometry {
  const v = [
    // two slopes
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    // two ends
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function shapeGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case "pyramid": return new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    case "gable": return gableGeometry();
    case "cyl": return new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0);
    case "cone": return new THREE.ConeGeometry(0.5, 1, 10).translate(0, 0.5, 0);
    case "dome": return new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1);
    case "tower": return new THREE.CylinderGeometry(0.34, 0.5, 1, 14).translate(0, 0.5, 0);
    default: return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  }
}

const GREY = [0.2, 0.2, 0.21], SCAFFOLD = [0.5, 0.4, 0.24], WHITE = [0.9, 0.91, 0.95];
const linear = new Map<number, number[]>();
const tmpColor = new THREE.Color();
function rgb(hex: number): number[] {
  let c = linear.get(hex);
  if (!c) { tmpColor.setHex(hex); c = [tmpColor.r, tmpColor.g, tmpColor.b]; linear.set(hex, c); }
  return c;
}

class Pool {
  mesh: THREE.InstancedMesh;
  n = 0;
  constructor(readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material, readonly group: THREE.Group, cap = 64) {
    this.mesh = this.make(cap);
  }
  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.castShadow = true;
    m.receiveShadow = true;
    m.count = 0;
    m.visible = false;
    this.group.add(m);
    return m;
  }
  /** Makes room for one more and returns its number. */
  next(): number {
    if (this.n >= this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      const bigger = this.make(old.instanceMatrix.count * 2);
      (bigger.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      (bigger.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
      this.group.remove(old);
      old.dispose();
      this.mesh = bigger;
    }
    return this.n++;
  }
  done(sphere: THREE.Sphere) {
    const m = this.mesh;
    m.count = this.n;
    m.visible = this.n > 0;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor!.needsUpdate = true;
    // The whole piece of map is one ball for the camera to test, so pieces out of sight are skipped.
    m.boundingSphere = sphere;
  }
}

/** One square piece of the map: its buildings are drawn together and redrawn only when one of them changes. */
class Chunk {
  group = new THREE.Group();
  pools = new Map<Shape, Pool>();
  lots = new Set<Lot>();
  dirty = true;
  sphere = new THREE.Sphere();
  constructor(readonly cx: number, readonly cz: number) {}
}
const CHUNK = 224;
const SLAB: Record<string, number> = { r: 0x86b96a, c: 0xb9b6ad, o: 0xb4b8bc, i: 0x9d968a };
const FARM_SLAB = [0xa98f5c, 0x7d9a55, 0x8f8478, 0x8a7f72];

export class LotsMesh {
  group = new THREE.Group();
  /** How strong the night is, 0 to 1: windows light up. */
  night = { value: 0 };
  /** How high the building on each plot is, for clicking on it. */
  heights = new Map<number, number>();
  /** Buildings that were just finished, with how long ago: they bounce once. */
  pops = new Map<number, number>();
  /** Called when a building is finished (for a puff of dust and a sound). */
  onFinished: (lot: Lot) => void = () => {};
  private geos = new Map<Shape, THREE.BufferGeometry>();
  private mats = new Map<Shape, THREE.Material>();
  private chunks = new Map<number, Chunk>();
  private sig = new Map<number, number>();
  private where = new Map<number, Chunk>();
  private global = "";
  private wait = 0;
  private cache = new Map<string, Part[]>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private snow = 0;
  private showEmpty = false;

  constructor() {
    const plain = new THREE.MeshLambertMaterial({ flatShading: true });
    const round = new THREE.MeshLambertMaterial();
    const glass = new THREE.MeshLambertMaterial({ flatShading: true });
    // Every block gets a little darker towards its foot, which makes the city look more solid.
    const shade = (shader: { vertexShader: string; fragmentShader: string }) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vFoot;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vFoot = position.y * length(instanceMatrix[1].xyz);
          #else
          vFoot = position.y;
          #endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vFoot;")
        .replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= 0.8 + 0.2 * smoothstep(0.0, 3.5, vFoot);");
    };
    plain.onBeforeCompile = shade;
    round.onBeforeCompile = shade;
    glass.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = this.night;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vLocal; varying vec3 vSize; varying vec3 vObjN; varying float vSeed;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vLocal = position; vObjN = normal;
          #ifdef USE_INSTANCING
          vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          #else
          vSize = vec3(1.0); vSeed = 0.0;
          #endif`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
          uniform float uNight; varying vec3 vLocal; varying vec3 vSize; varying vec3 vObjN; varying float vSeed;
          float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float wLit = 0.0;
          if (abs(vObjN.y) < 0.5) {
            bool sideways = abs(vObjN.x) > 0.5;
            float width = sideways ? vSize.z : vSize.x;
            float along = sideways ? vLocal.z : vLocal.x;
            float cols = max(1.0, floor(width / 2.3));
            float rows = max(1.0, floor(vSize.y / 3.0));
            vec2 uvw = vec2((along + 0.5) * cols, vLocal.y * rows);
            vec2 cell = floor(uvw);
            vec2 f = fract(uvw);
            float m = step(0.2, f.x) * step(f.x, 0.8) * step(0.3, f.y) * step(f.y, 0.8);
            float r = hash21(cell + vSeed * 91.0 + vObjN.xz * 7.0);
            vec3 glassColor = mix(vec3(0.16, 0.24, 0.34), vec3(0.34, 0.47, 0.6), r);
            diffuseColor.rgb = mix(diffuseColor.rgb, glassColor, m * 0.92);
            diffuseColor.rgb *= 0.82 + 0.18 * smoothstep(0.0, 3.5, vLocal.y * vSize.y);
            wLit = m * step(0.42, r) * uNight;
          }`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.8, 0.46) * wLit;`);
    };
    for (const shape of SHAPES) {
      this.mats.set(shape, shape === "win" ? glass : shape === "cyl" || shape === "dome" || shape === "tower" || shape === "cone" ? round : plain);
      this.geos.set(shape, shapeGeometry(shape));
    }
  }

  /** The parts of a building (also used for the pictures in the build menu). */
  parts(lot: { kind: number; level: number; variant: number; w: number; d: number }): Part[] {
    const key = lot.kind + ":" + lot.level + ":" + lot.variant + ":" + lot.w + ":" + lot.d;
    let p = this.cache.get(key);
    if (!p) {
      p = blueprint(lot.kind, lot.level, lot.variant, lot.w, lot.d);
      // Houses and small shops get windows on their biggest wall block, so they light up at night too.
      if (lot.kind === Zone.ResLow || lot.kind === Zone.ComLow) {
        let best: Part | null = null;
        for (const part of p) if (part.shape === "box" && part.sy >= 2.4 && part.sx >= 3 && part.sz >= 3 && (!best || part.sx * part.sy * part.sz > best.sx * best.sy * best.sz)) best = part;
        if (best) p = p.map((part) => (part === best ? { ...part, shape: "win" as const } : part));
      }
      if (this.cache.size > 6000) this.cache.clear();
      this.cache.set(key, p);
    }
    return p;
  }

  private chunkOf(lot: Lot): Chunk {
    const cx = Math.floor(lot.x / CHUNK), cz = Math.floor(lot.z / CHUNK), key = cx * 4096 + cz;
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(key, c);
      this.group.add(c.group);
    }
    return c;
  }

  private put(chunk: Chunk, lot: Lot, cos: number, sin: number, part: Part, grow: number, wide: number, mix: number[] | null, mixAmount: number, dark: number) {
    let pool = chunk.pools.get(part.shape);
    if (!pool) { pool = new Pool(this.geos.get(part.shape)!, this.mats.get(part.shape)!, chunk.group); chunk.pools.set(part.shape, pool); }
    const i = pool.next();
    const arr = pool.mesh.instanceMatrix.array as Float32Array, o = i * 16;
    const px = part.x * wide, pz = part.z * wide;
    const wx = lot.x + px * cos + pz * sin, wz = lot.z - px * sin + pz * cos, wy = lot.y + part.y * grow;
    const sy = Math.max(0.01, part.sy * grow), sx = part.sx * wide, sz = part.sz * wide;
    if (part.rx || part.rz) {
      this.e.set(part.rx ?? 0, -lot.ang + (part.ry ?? 0), part.rz ?? 0, "YXZ");
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v1.set(wx, wy, wz), this.q, this.v2.set(sx, sy, sz));
      arr.set(this.m4.elements, o);
    } else {
      let c = cos, s = sin;
      if (part.ry) {
        const cr = Math.cos(part.ry), sr = Math.sin(part.ry);
        c = cos * cr - sin * sr;
        s = sin * cr + cos * sr;
      }
      arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
      arr[o + 12] = wx; arr[o + 13] = wy; arr[o + 14] = wz; arr[o + 15] = 1;
    }
    const col = pool.mesh.instanceColor!.array as Float32Array;
    let [r, g, b] = rgb(part.color);
    if (mix) { r += (mix[0] - r) * mixAmount; g += (mix[1] - g) * mixAmount; b += (mix[2] - b) * mixAmount; }
    col[i * 3] = r * dark; col[i * 3 + 1] = g * dark; col[i * 3 + 2] = b * dark;
  }

  /** A number that changes whenever what stands on a plot looks different. */
  private signature(lot: Lot): number {
    const f = lot.flags & (LF.Abandoned | LF.Burnt);
    const built = lot.kind ? Math.round(lot.built * 20) : 0;
    return ((((lot.kind * 4 + lot.level) * 256 + lot.variant) * 16 + lot.zone) * 32 + built) * 4 + (f ? (f & LF.Burnt ? 2 : 1) : 0);
  }

  private rebuildChunk(chunk: Chunk) {
    chunk.dirty = false;
    for (const pool of chunk.pools.values()) pool.n = 0;
    const slab: Part = { shape: "box", x: 0, y: -5, z: 0, sx: 1, sy: 5.14, sz: 1, color: 0 };
    const snow = this.snow;
    let top = 0;
    for (const lot of chunk.lots) {
      // Rotation by -ang turns the plot's own space into the world.
      const cos = Math.cos(-lot.ang), sin = Math.sin(-lot.ang);
      if (!lot.kind) {
        if (!lot.zone && !this.showEmpty) continue;
        slab.sx = lot.w - 1; slab.sz = lot.d - 1; slab.sy = 5.1;
        slab.color = lot.zone ? ZONES[lot.zone].color : 0xe9e9e4;
        this.put(chunk, lot, cos, sin, slab, 1, 1, null, 0, lot.zone ? 1 : 0.92);
        continue;
      }
      const zoned = isZoned(lot);
      slab.sx = lot.w - 0.3; slab.sz = lot.d - 0.3; slab.sy = 5.14;
      if (zoned) slab.color = lot.kind >= Zone.Farm ? FARM_SLAB[lot.kind - Zone.Farm] : SLAB[ZONES[lot.kind].group];
      else {
        const cat = PLACE_BY_KIND.get(lot.kind)?.cat;
        slab.color = cat === "parks" ? 0x7fb765 : cat === "landmark" ? 0xc9c4b4 : 0xb3b1a9;
      }
      this.put(chunk, lot, cos, sin, slab, 1, 1, snow > 0.05 ? WHITE : null, snow, 1);
      const f = lot.flags;
      const burnt = (f & LF.Burnt) !== 0, empty = (f & LF.Abandoned) !== 0;
      let grow = burnt ? 0.5 : Math.max(0.04, lot.built), wide = 1;
      const pop = this.pops.get(lot.id);
      if (pop !== undefined) {
        // A little bounce: up past full height and back.
        const k = Math.sin(Math.min(1, pop / 0.5) * Math.PI);
        grow *= 1 + 0.16 * k;
        wide = 1 - 0.05 * k;
      }
      const mix = burnt ? GREY : empty ? GREY : lot.built < 1 ? SCAFFOLD : null;
      const amount = burnt ? 0.85 : empty ? 0.55 : (1 - lot.built) * 0.7;
      const dark = burnt ? 0.5 : empty ? 0.75 : 1;
      let height = 0;
      const moving = lot.built >= 1 && !burnt && !empty;
      for (const part of this.parts(lot)) {
        if (part.tag && moving) continue;
        this.put(chunk, lot, cos, sin, part, grow, wide, mix, amount, dark);
        height = Math.max(height, (part.y + part.sy) * grow);
      }
      this.heights.set(lot.id, height);
      top = Math.max(top, lot.y + height);
    }
    const half = CHUNK / 2;
    chunk.sphere.center.set(chunk.cx * CHUNK + half, top / 2, chunk.cz * CHUNK + half);
    chunk.sphere.radius = Math.hypot(half + 60, half + 60, top / 2 + 10);
    for (const pool of chunk.pools.values()) pool.done(chunk.sphere);
  }

  update(city: City, night: number, showEmpty: boolean, dt: number) {
    this.night.value = night;
    // Bouncing buildings are redrawn every frame until they settle.
    for (const [id, t] of this.pops) {
      const lot = city.lots.lots.get(id);
      if (!lot || t > 0.5) { this.pops.delete(id); if (lot) this.where.get(id)!.dirty = true; continue; }
      this.pops.set(id, t + dt);
      const c = this.where.get(id);
      if (c) c.dirty = true;
    }
    this.wait -= dt;
    const snow = Math.round(city.weather.snowCover * 8) / 8 * 0.85;
    const global = snow + ":" + showEmpty;
    if (global !== this.global) {
      this.global = global;
      this.snow = snow;
      this.showEmpty = showEmpty;
      for (const c of this.chunks.values()) c.dirty = true;
      this.wait = 0;
    }
    if (this.wait <= 0) {
      this.wait = 0.15;
      this.scan(city);
    }
    for (const c of this.chunks.values()) if (c.dirty) this.rebuildChunk(c);
  }

  /** Finds the plots that changed, and marks their pieces of map for redrawing. */
  private scan(city: City) {
    const seen = new Set<number>();
    for (const lot of city.lots.lots.values()) {
      seen.add(lot.id);
      const sig = this.signature(lot);
      const before = this.sig.get(lot.id);
      if (before === sig) continue;
      // Just finished: bounce and puff.
      const was = before === undefined ? 0 : (before >> 2) & 31;
      if (was > 0 && was < 20 && lot.kind && lot.built >= 1) {
        this.pops.set(lot.id, 0);
        this.onFinished(lot);
      }
      this.sig.set(lot.id, sig);
      let c = this.where.get(lot.id);
      if (!c) {
        c = this.chunkOf(lot);
        c.lots.add(lot);
        this.where.set(lot.id, c);
      } else if (!c.lots.has(lot)) {
        // The same number, a different plot (after loading): start afresh.
        c.lots.delete([...c.lots].find((l) => l.id === lot.id)!);
        c.lots.add(lot);
      }
      c.dirty = true;
    }
    if (seen.size !== this.sig.size) {
      for (const id of [...this.sig.keys()]) {
        if (seen.has(id)) continue;
        this.sig.delete(id);
        this.heights.delete(id);
        const c = this.where.get(id);
        this.where.delete(id);
        if (c) { for (const l of c.lots) if (l.id === id) { c.lots.delete(l); break; } c.dirty = true; }
      }
    }
  }

  /** A new city: forget everything. */
  refresh() {
    for (const c of this.chunks.values()) {
      this.group.remove(c.group);
      for (const p of c.pools.values()) p.mesh.dispose();
    }
    this.chunks.clear();
    this.sig.clear();
    this.where.clear();
    this.heights.clear();
    this.pops.clear();
    this.global = "";
    this.wait = 0;
  }
}
