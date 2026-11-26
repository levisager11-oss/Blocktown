// Maps laid over the city: how far each service reaches, dirt in the air, noise, and what the land is worth.
import { Kind, PLACE_BY_KIND, ROADS, ZONES } from "./defs";
import { LF, isZoned } from "./lots";
import type { City } from "./city";
import { clamp01 } from "./util";

export const MAP_CELL = 16;
export type MapName = "police" | "fire" | "health" | "school" | "high" | "charm" | "pollution" | "noise" | "value";
const NAMES: MapName[] = ["police", "fire", "health", "school", "high", "charm", "pollution", "noise", "value"];

export class Maps {
  readonly n: number;
  readonly data: Record<MapName, Float32Array>;
  dirty = true;
  version = 0;
  /** What the land is worth before anything is built: by the water and up on a hill it is nicer. */
  private base: Float32Array | null = null;

  constructor(size: number) {
    this.n = Math.ceil(size / MAP_CELL);
    this.data = {} as Record<MapName, Float32Array>;
    for (const name of NAMES) this.data[name] = new Float32Array(this.n * this.n);
  }

  at(name: MapName, x: number, z: number): number {
    const n = this.n;
    const ix = Math.min(n - 1, Math.max(0, (x / MAP_CELL) | 0)), iz = Math.min(n - 1, Math.max(0, (z / MAP_CELL) | 0));
    return this.data[name][iz * n + ix];
  }

  /** Adds a round patch that is strongest in the middle. `cover` joins like chances (never over 1), otherwise it adds up. */
  private splat(map: Float32Array, x: number, z: number, radius: number, strength: number, cover: boolean) {
    const n = this.n, r = radius / MAP_CELL;
    const cx = x / MAP_CELL, cz = z / MAP_CELL;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(n - 1, Math.ceil(cx + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(n - 1, Math.ceil(cz + r));
    for (let j = z0; j <= z1; j++)
      for (let i = x0; i <= x1; i++) {
        const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) / r;
        if (d >= 1) continue;
        const f = (1 - d * d) * strength;
        const k = j * n + i;
        map[k] = cover ? 1 - (1 - map[k]) * (1 - Math.min(1, f)) : map[k] + f;
      }
  }

  recompute(city: City) {
    this.dirty = false;
    this.version++;
    const d = this.data;
    for (const name of NAMES) d[name].fill(0);
    const T = city.terrain;

    for (const lot of city.lots.lots.values()) {
      if (!lot.kind || lot.built < 1) continue;
      if (isZoned(lot)) {
        const z = ZONES[lot.kind];
        if (lot.flags & LF.Abandoned) continue;
        // Better factories are cleaner.
        const dirt = z.pollution * (z.levels > 1 ? 1.25 - lot.level * 0.25 : 1) * (0.4 + 0.6 * lot.occ);
        if (dirt > 0.01) this.splat(d.pollution, lot.x, lot.z, 46 + dirt * 60, dirt * 0.8, false);
        if (z.noise > 0.05) this.splat(d.noise, lot.x, lot.z, 36, z.noise * 0.5, false);
        continue;
      }
      const def = PLACE_BY_KIND.get(lot.kind);
      if (!def) continue;
      const works = city.serviceStrength(lot);
      if (def.pollution) this.splat(d.pollution, lot.x, lot.z, def.pollutionRadius ?? 100, def.pollution, false);
      if (def.noise) this.splat(d.noise, lot.x, lot.z, 60, def.noise * 0.6, false);
      if (!def.radius || works <= 0) continue;
      const reach = def.radius * (0.85 + 0.15 * works), power = Math.min(1, works) * 1.15;
      if (def.cat === "police") this.splat(d.police, lot.x, lot.z, reach, power, true);
      else if (def.cat === "fire") this.splat(d.fire, lot.x, lot.z, reach, power, true);
      else if (def.cat === "health") this.splat(d.health, lot.x, lot.z, reach, power, true);
      else if (def.kind === Kind.School) this.splat(d.school, lot.x, lot.z, reach, power, true);
      else if (def.kind === Kind.HighSchool || def.kind === Kind.University) this.splat(d.high, lot.x, lot.z, reach, power, true);
      else if (def.cat === "parks" || (def.cat === "landmark" && def.charm)) this.splat(d.charm, lot.x, lot.z, reach, (def.charm ?? 0.5) * power, true);
    }

    // Busy roads are loud.
    for (const seg of city.roads.segs.values()) {
      const loud = ROADS[seg.type].noise * Math.min(1, 0.15 + seg.vol / (seg.len * 0.35 + 20));
      if (loud < 0.12) continue;
      const step = Math.max(1, Math.round(22 / (seg.len / seg.n)));
      for (let i = 0; i <= seg.n; i += step) this.splat(d.noise, seg.px[i], seg.pz[i], 34, loud * 0.35, false);
    }

    // What the land is worth: nice things nearby push it up, dirt and noise pull it down.
    const n = this.n;
    if (!this.base) {
      this.base = new Float32Array(n * n);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * MAP_CELL, z = (j + 0.5) * MAP_CELL, h = T.heightAt(x, z);
          this.base[j * n + i] = (h > 0.8 && h < 9 && T.nearWater(x, z, 70) ? 0.12 : 0) + (h > 14 ? 0.05 : 0);
        }
    }
    const base = this.base;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        d.pollution[k] = clamp01(d.pollution[k]);
        d.noise[k] = clamp01(d.noise[k]);
        d.value[k] = clamp01(0.24 + base[k] + d.charm[k] * 0.3 + d.police[k] * 0.1 + d.fire[k] * 0.06 + d.health[k] * 0.1 + d.school[k] * 0.1 + d.high[k] * 0.06 - d.pollution[k] * 0.55 - d.noise[k] * 0.16);
      }
  }
}
