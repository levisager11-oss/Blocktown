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

function shapeGeometry(shape: Shape): THREE.BufferGeometry {
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
  constructor(readonly geo: THREE.BufferGeometry, readonly mat: THREE.Material, readonly group: THREE.Group, cap = 512) {
    this.mesh = this.make(cap);
  }
  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.count = 0;
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
  done() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

const SLAB: Record<string, number> = { r: 0x86b96a, c: 0xb9b6ad, o: 0xb4b8bc, i: 0x9d968a };
const FARM_SLAB = [0xa98f5c, 0x7d9a55, 0x8f8478, 0x8a7f72];

export class LotsMesh {
  group = new THREE.Group();
  /** How strong the night is, 0 to 1: windows light up. */
  night = { value: 0 };
  /** How high the building on each plot is, for clicking on it. */
  heights = new Map<number, number>();
  private pools = new Map<Shape, Pool>();
  private key = "";
  private wait = 0;
  private cache = new Map<string, Part[]>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor() {
    const plain = new THREE.MeshLambertMaterial({ flatShading: true });
    const round = new THREE.MeshLambertMaterial();
    const glass = new THREE.MeshLambertMaterial({ flatShading: true });
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
            wLit = m * step(0.42, r) * uNight;
          }`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.8, 0.46) * wLit;`);
    };
    for (const shape of SHAPES) {
      const mat = shape === "win" ? glass : shape === "cyl" || shape === "dome" || shape === "tower" || shape === "cone" ? round : plain;
      this.pools.set(shape, new Pool(shapeGeometry(shape), mat, this.group));
    }
  }

  private parts(lot: Lot): Part[] {
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

  private put(lot: Lot, cos: number, sin: number, part: Part, grow: number, mix: number[] | null, mixAmount: number, dark: number) {
    const pool = this.pools.get(part.shape)!;
    const i = pool.next();
    const arr = pool.mesh.instanceMatrix.array as Float32Array, o = i * 16;
    const wx = lot.x + part.x * cos + part.z * sin, wz = lot.z - part.x * sin + part.z * cos, wy = lot.y + part.y * grow;
    const sy = Math.max(0.01, part.sy * grow);
    if (part.rx || part.rz) {
      this.e.set(part.rx ?? 0, -lot.ang + (part.ry ?? 0), part.rz ?? 0, "YXZ");
      this.q.setFromEuler(this.e);
      this.m4.compose(this.v1.set(wx, wy, wz), this.q, this.v2.set(part.sx, sy, part.sz));
      arr.set(this.m4.elements, o);
    } else {
      let c = cos, s = sin;
      if (part.ry) {
        const cr = Math.cos(part.ry), sr = Math.sin(part.ry);
        c = cos * cr - sin * sr;
        s = sin * cr + cos * sr;
      }
      arr[o] = c * part.sx; arr[o + 1] = 0; arr[o + 2] = -s * part.sx; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = s * part.sz; arr[o + 9] = 0; arr[o + 10] = c * part.sz; arr[o + 11] = 0;
      arr[o + 12] = wx; arr[o + 13] = wy; arr[o + 14] = wz; arr[o + 15] = 1;
    }
    const col = pool.mesh.instanceColor!.array as Float32Array;
    let [r, g, b] = rgb(part.color);
    if (mix) { r += (mix[0] - r) * mixAmount; g += (mix[1] - g) * mixAmount; b += (mix[2] - b) * mixAmount; }
    col[i * 3] = r * dark; col[i * 3 + 1] = g * dark; col[i * 3 + 2] = b * dark;
  }

  private rebuild(city: City, showEmpty: boolean) {
    const snow = city.weather.snowCover * 0.85;
    for (const pool of this.pools.values()) pool.n = 0;
    this.heights.clear();
    const slab: Part = { shape: "box", x: 0, y: -5, z: 0, sx: 1, sy: 5.14, sz: 1, color: 0 };
    for (const lot of city.lots.lots.values()) {
      // Rotation by -ang turns the plot's own space into the world.
      const cos = Math.cos(-lot.ang), sin = Math.sin(-lot.ang);
      if (!lot.kind) {
        if (!lot.zone && !showEmpty) continue;
        slab.sx = lot.w - 1; slab.sz = lot.d - 1; slab.sy = 5.1;
        slab.color = lot.zone ? ZONES[lot.zone].color : 0xe9e9e4;
        this.put(lot, cos, sin, slab, 1, null, 0, lot.zone ? 1 : 0.92);
        continue;
      }
      const zoned = isZoned(lot);
      slab.sx = lot.w - 0.3; slab.sz = lot.d - 0.3; slab.sy = 5.14;
      if (zoned) slab.color = lot.kind >= Zone.Farm ? FARM_SLAB[lot.kind - Zone.Farm] : SLAB[ZONES[lot.kind].group];
      else slab.color = PLACE_BY_KIND.get(lot.kind)?.cat === "parks" ? 0x7fb765 : 0xb3b1a9;
      this.put(lot, cos, sin, slab, 1, snow > 0.05 ? WHITE : null, snow, 1);
      const f = lot.flags;
      const burnt = (f & LF.Burnt) !== 0, empty = (f & LF.Abandoned) !== 0;
      const grow = burnt ? 0.5 : Math.max(0.04, lot.built);
      const mix = burnt ? GREY : empty ? GREY : lot.built < 1 ? SCAFFOLD : null;
      const amount = burnt ? 0.85 : empty ? 0.55 : (1 - lot.built) * 0.7;
      const dark = burnt ? 0.5 : empty ? 0.75 : 1;
      let top = 0;
      for (const part of this.parts(lot)) {
        this.put(lot, cos, sin, part, grow, mix, amount, dark);
        top = Math.max(top, (part.y + part.sy) * grow);
      }
      this.heights.set(lot.id, top);
    }
    for (const pool of this.pools.values()) pool.done();
  }

  update(city: City, night: number, showEmpty: boolean, dt: number) {
    this.night.value = night;
    this.wait -= dt;
    const key = city.lots.version + ":" + city.look + ":" + showEmpty + ":" + Math.round(city.weather.snowCover * 8);
    if (key !== this.key && this.wait <= 0) {
      this.key = key;
      this.wait = 0.2;
      this.rebuild(city, showEmpty);
    }
  }

  refresh() { this.key = ""; this.wait = 0; }
}
