// The land, the water and the trees.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CELL, ROADS } from "../sim/defs";
import type { City } from "../sim/city";
import type { Terrain } from "../sim/terrain";
import { clamp01, lerp, noise2, smoothstep } from "../sim/util";

const GRASS = [[0.43, 0.69, 0.3], [0.36, 0.63, 0.26], [0.58, 0.6, 0.26], [0.5, 0.57, 0.4]];
const SAND = [0.87, 0.8, 0.58], ROCK = [0.56, 0.54, 0.5], BED = [0.5, 0.55, 0.45], SNOW = [0.95, 0.96, 0.99];
const BASE_DEPTH = 16;

function tint(geo: THREE.BufferGeometry, r: number, g: number, b: number) {
  const n = geo.getAttribute("position").count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}

export class Land {
  group = new THREE.Group();
  mesh: THREE.Mesh;
  water: THREE.Mesh;
  private terrain: Terrain;
  private colors: THREE.BufferAttribute;
  private painted = "";
  private trees: THREE.InstancedMesh[] = [];
  private treeIndex: number[][] = [[], []];
  private treeKey = "";
  private treeTint = "";
  private treeWait = 0;
  private dummy = new THREE.Object3D();

  constructor(city: City, treeShare: number) {
    const T = (this.terrain = city.terrain);
    const n = T.n, size = T.size;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((n + 1) * (n + 1) * 3), uv = new Float32Array((n + 1) * (n + 1) * 2);
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i;
        pos[k * 3] = i * CELL;
        pos[k * 3 + 1] = T.h[k];
        pos[k * 3 + 2] = j * CELL;
        uv[k * 2] = i / n;
        uv[k * 2 + 1] = j / n;
      }
    const idx = new Uint32Array(n * n * 6);
    let q = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
        // The same split as Terrain.heightAt.
        idx[q++] = a; idx[q++] = c; idx[q++] = b;
        idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.colors = new THREE.BufferAttribute(new Float32Array((n + 1) * (n + 1) * 3), 3);
    geo.setAttribute("color", this.colors);
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    // Earth walls around the edge, so the map looks like a slab.
    const wall: number[] = [], wi: number[] = [];
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      const steps = n;
      for (let s = 0; s < steps; s++) {
        const ax = lerp(x0, x1, s / steps), az = lerp(z0, z1, s / steps), bx = lerp(x0, x1, (s + 1) / steps), bz = lerp(z0, z1, (s + 1) / steps);
        const base = wall.length / 3;
        wall.push(ax, T.heightAt(ax, az), az, bx, T.heightAt(bx, bz), bz, bx, -BASE_DEPTH, bz, ax, -BASE_DEPTH, az);
        wi.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    };
    edge(0, 0, size, 0); edge(size, 0, size, size); edge(size, size, 0, size); edge(0, size, 0, 0);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(wall), 3));
    wg.setIndex(wi);
    wg.computeVertexNormals();
    this.group.add(new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: 0x86684a, side: THREE.DoubleSide })));

    const wgeo = new THREE.BoxGeometry(size - 0.2, BASE_DEPTH, size - 0.2);
    this.water = new THREE.Mesh(wgeo, new THREE.MeshLambertMaterial({ color: 0x3f96d6, transparent: true, opacity: 0.78, depthWrite: false }));
    this.water.position.set(size / 2, -BASE_DEPTH / 2, size / 2);
    this.water.renderOrder = 1;
    this.group.add(this.water);

    this.makeTrees(treeShare);
  }

  private makeTrees(share: number) {
    const trunk = (h: number) => tint(new THREE.BoxGeometry(0.55, h, 0.55).translate(0, h / 2, 0), 0.42, 0.3, 0.2);
    const cone = (r: number, h: number, y: number) => tint(new THREE.ConeGeometry(r, h, 6).translate(0, y + h / 2, 0).toNonIndexed(), 0.2, 0.47, 0.25);
    const conifer = mergeGeometries([trunk(1.3).toNonIndexed(), cone(1.7, 3, 1), cone(1.25, 2.6, 2.7)])!;
    const leaf = mergeGeometries([trunk(1.8).toNonIndexed(), tint(new THREE.IcosahedronGeometry(1.75, 0).translate(0, 3.1, 0), 0.34, 0.6, 0.26)])!;
    conifer.computeVertexNormals();
    leaf.computeVertexNormals();
    const list = this.terrain.trees;
    const step = share >= 1 ? 1 : Math.max(1, Math.round(1 / share));
    this.treeIndex = [[], []];
    for (let i = 0; i < list.length; i += step) this.treeIndex[list[i].kind].push(i);
    [conifer, leaf].forEach((geo, kind) => {
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), Math.max(1, this.treeIndex[kind].length));
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.trees.push(mesh);
      this.group.add(mesh);
    });
  }

  /** Paints the land for the season and the snow lying on it. */
  private paint(season: number, snow: number) {
    const T = this.terrain, n = T.n, col = this.colors.array as Float32Array;
    const g = GRASS[season];
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i, x = i * CELL, z = j * CELL, h = T.h[k];
        const slope = T.slopeAt(x, z);
        const v = 0.9 + noise2(x / 23, z / 23, 5) * 0.2;
        const forest = T.resourceAt(1, x, z);
        let r = g[0] * v, gg = g[1] * v * (1 - forest * 0.12), b = g[2] * v;
        // Higher land is a little paler.
        const high = smoothstep(10, 30, h) * 0.18;
        r = lerp(r, 0.62, high); gg = lerp(gg, 0.66, high); b = lerp(b, 0.42, high);
        const sand = smoothstep(2.3, 1.1, h);
        r = lerp(r, SAND[0], sand); gg = lerp(gg, SAND[1], sand); b = lerp(b, SAND[2], sand);
        const rock = smoothstep(0.38, 0.6, slope);
        r = lerp(r, ROCK[0] * v, rock); gg = lerp(gg, ROCK[1] * v, rock); b = lerp(b, ROCK[2] * v, rock);
        const wet = smoothstep(0.2, -1.5, h);
        r = lerp(r, BED[0], wet); gg = lerp(gg, BED[1], wet); b = lerp(b, BED[2], wet);
        const s = snow * (1 - wet) * (1 - rock * 0.5) * clamp01(0.75 + noise2(x / 40, z / 40, 9) * 0.5);
        col[k * 3] = lerp(r, SNOW[0], s);
        col[k * 3 + 1] = lerp(gg, SNOW[1], s);
        col[k * 3 + 2] = lerp(b, SNOW[2], s);
      }
    this.colors.needsUpdate = true;
  }

  /** Trees under roads and buildings are taken away. */
  private placeTrees(city: City) {
    const T = this.terrain, d = this.dummy;
    this.trees.forEach((mesh, kind) => {
      let count = 0;
      for (const ti of this.treeIndex[kind]) {
        const t = T.trees[ti];
        const lot = city.lots.at(t.x, t.z);
        if (lot && (lot.kind || lot.zone)) continue;
        const hit = city.roads.nearestSeg(t.x, t.z, 12);
        if (hit && hit.d < ROADS[hit.seg.type].width / 2 + 2.6) continue;
        d.position.set(t.x, T.heightAt(t.x, t.z) - 0.15, t.z);
        d.rotation.set(0, (ti * 2.4) % 6.28, 0);
        const s = t.s * 1.25;
        d.scale.set(s, s * (0.9 + ((ti * 7) % 10) * 0.03), s);
        d.updateMatrix();
        mesh.setMatrixAt(count, d.matrix);
        count++;
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    });
    this.treeTint = "";
  }

  private tintTrees(season: number, snow: number) {
    const c = new THREE.Color();
    this.trees.forEach((mesh, kind) => {
      for (let i = 0; i < mesh.count; i++) {
        const r = ((i * 2654435761) >>> 0) / 4294967296;
        if (kind === 0) c.setRGB(1, 1, 1);
        else if (season === 0) c.setRGB(1.05, 1.12, 0.95);
        else if (season === 1) c.setRGB(0.95, 1, 0.9);
        else if (season === 2) c.setRGB(1.9 + r * 0.9, 0.85 + r * 0.45, 0.45 + r * 0.3);
        else c.setRGB(1.25, 0.82, 0.78);
        c.lerp(new THREE.Color(2.4, 2.1, 3.4), snow * (kind === 0 ? 0.55 : 0.4));
        mesh.setColorAt(i, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  update(city: City, dt: number) {
    const W = city.weather;
    const snow = Math.round(W.snowCover * 12) / 12;
    const key = W.season + ":" + snow;
    if (key !== this.painted) {
      this.painted = key;
      this.paint(W.season, snow);
      this.treeTint = "";
    }
    this.water.position.y = city.waterLevel - BASE_DEPTH / 2;
    this.treeWait -= dt;
    const tk = city.roads.version + ":" + city.lots.version + ":" + city.footprint + ":" + city.zoneVersion;
    if (tk !== this.treeKey && this.treeWait <= 0) {
      this.treeKey = tk;
      this.treeWait = 0.6;
      this.placeTrees(city);
    }
    if (this.treeTint !== key) {
      this.treeTint = key;
      this.tintTrees(W.season, snow);
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (m.material as THREE.Material).dispose();
    });
  }
}
