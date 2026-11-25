// Fires, floods and storm damage. Off in chill mode, and players can switch them off in the options.
import { Kind } from "./defs";
import type { City } from "./city";
import { LF, Lot, isZoned } from "./lots";

const BURN_SECONDS = 80;
interface Blaze { engine: boolean; dousing: boolean; told: boolean }
type FloodPhase = "none" | "warn" | "rise" | "high" | "fall";

export class Disasters {
  fires = new Map<Lot, Blaze>();
  flood: FloodPhase = "none";
  private floodT = 0;
  private floodPeak = 0;
  private popBefore = 0;
  private lastSky = "clear";

  constructor(readonly city: City) {}

  get on() { return !this.city.chill && this.city.disastersOn; }

  update(dt: number) {
    const city = this.city;
    if (this.on && city.active("fires")) this.ignite(dt);
    if (this.fires.size) this.burn(dt);
    const sky = city.weather.sky;
    if (sky !== this.lastSky) {
      if (sky === "storm" && this.on && city.active("storms")) {
        city.emit("note.storm", "warn");
        if (this.flood === "none" && Math.random() < 0.3 * city.modeRules().disasters) this.startFlood();
      }
      this.lastSky = sky;
    }
    if (sky === "storm" && this.on && city.active("storms") && Math.random() < dt * 0.012 * city.modeRules().disasters) this.lightning();
    if (this.flood !== "none") this.runFlood(dt);
  }

  // ------------------------------------------------------------------ fire

  private ignite(dt: number) {
    const city = this.city;
    const pool = city.works.length + city.homes.length;
    if (!pool) return;
    const expected = pool * 0.000016 * dt * city.weather.fireRisk * city.modeRules().disasters;
    if (Math.random() > expected) return;
    const k = Math.floor(Math.random() * pool);
    const lot = k < city.works.length ? city.works[k] : city.homes[k - city.works.length];
    if (!isZoned(lot)) return;
    const cover = city.maps.at("fire", lot.x, lot.z);
    if (Math.random() < cover * 0.7) return; // prevention works
    this.setOnFire(lot);
  }

  setOnFire(lot: Lot) {
    if (this.fires.has(lot) || lot.built < 1 || !lot.kind || lot.flags & (LF.Burnt | LF.Flooded)) return;
    const city = this.city;
    lot.flags |= LF.Fire;
    lot.fire = 0.02;
    const blaze: Blaze = { engine: false, dousing: false, told: false };
    this.fires.set(lot, blaze);
    city.look++;
    // The nearest fire station that can reach it sends an engine.
    let best: Lot | null = null, bd = 1100;
    for (const s of city.lots.lots.values()) {
      if ((s.kind !== Kind.Fire && s.kind !== Kind.FireHQ) || city.serviceStrength(s) <= 0) continue;
      const d = Math.hypot(s.x - lot.x, s.z - lot.z) / (s.kind === Kind.FireHQ ? 1.6 : 1);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) blaze.engine = city.traffic.dispatch(best, lot, () => { blaze.dousing = true; });
    city.emit(blaze.engine ? "note.fire" : "note.fireNoHelp", "bad", undefined, lot);
  }

  private burn(dt: number) {
    const city = this.city;
    for (const [lot, blaze] of this.fires) {
      if (!city.lots.lots.has(lot.id) || !(lot.flags & LF.Fire)) { this.fires.delete(lot); continue; }
      const rain = city.weather.rain;
      if (blaze.dousing) lot.fire -= dt / 7;
      else lot.fire += (dt / BURN_SECONDS) * (1 - rain * 0.5);
      if (lot.fire <= 0) {
        lot.flags &= ~LF.Fire;
        lot.fire = 0;
        this.fires.delete(lot);
        city.bump("firesOut");
        city.emit("note.fireOut", "good", undefined, lot);
        city.look++;
        continue;
      }
      if (lot.fire >= 1) {
        lot.flags = (lot.flags & ~LF.Fire) | LF.Burnt;
        lot.fire = 0;
        lot.occ = 0;
        lot.trouble = 60;
        this.fires.delete(lot);
        city.bump("burnt");
        city.maps.dirty = true;
        city.look++;
        continue;
      }
      // Fire jumps to the neighbours when nobody fights it.
      if (!blaze.dousing && lot.fire > 0.4 && Math.random() < dt * 0.02 * (1 - rain)) {
        const near = city.lots.near(lot.x, lot.z, 13).filter((l) => l !== lot && isZoned(l) && l.built >= 1 && !this.fires.has(l));
        if (near.length) this.setOnFire(near[Math.floor(Math.random() * near.length)]);
      }
    }
  }

  private lightning() {
    const city = this.city;
    const pool = [...city.works, ...city.homes].filter(isZoned);
    if (!pool.length) return;
    const lot = pool[Math.floor(Math.random() * pool.length)];
    if (Math.random() < 0.5) this.setOnFire(lot);
    else if (city.mode === "hard" || Math.random() < 0.5) {
      // The storm tears the roof off.
      lot.flags |= LF.Burnt;
      lot.occ = 0;
      lot.trouble = 70;
      city.emit("note.stormDamage", "bad", undefined, lot);
      city.look++;
    }
  }

  // ------------------------------------------------------------------ flood

  private startFlood() {
    this.flood = "warn";
    this.floodT = 0;
    this.floodPeak = 1.5 + Math.random() * (this.city.mode === "hard" ? 1.5 : 1.0);
    this.popBefore = this.city.stats.pop;
    this.city.emit("note.floodWarn", "warn");
  }

  private runFlood(dt: number) {
    const city = this.city;
    this.floodT += dt;
    const t = this.floodT;
    if (this.flood === "warn" && t > 22) { this.flood = "rise"; this.floodT = 0; }
    else if (this.flood === "rise") {
      city.waterLevel = Math.min(this.floodPeak, (t / 16) * this.floodPeak);
      if (t > 16) { this.flood = "high"; this.floodT = 0; this.soak(); }
    } else if (this.flood === "high") {
      if (t > 26) { this.flood = "fall"; this.floodT = 0; }
    } else if (this.flood === "fall") {
      city.waterLevel = Math.max(0, this.floodPeak * (1 - t / 22));
      if (t > 22) {
        city.waterLevel = 0;
        this.flood = "none";
        this.dry();
      }
    }
  }

  /** Everything standing lower than the water is flooded. */
  private soak() {
    const city = this.city;
    let n = 0;
    for (const lot of city.lots.lots.values()) {
      if (!isZoned(lot) || lot.built < 1 || lot.y > city.waterLevel + 0.2) continue;
      lot.flags |= LF.Flooded;
      lot.occ = 0;
      n++;
    }
    if (n) city.emit("note.flooded", "bad", { n });
    city.count.floodHit = n;
    city.look++;
  }

  private dry() {
    const city = this.city;
    for (const lot of city.lots.lots.values()) {
      if (!(lot.flags & LF.Flooded)) continue;
      lot.flags &= ~LF.Flooded;
      const r = Math.random();
      if (r < (city.mode === "hard" ? 0.35 : 0.15)) { lot.flags |= LF.Burnt; lot.trouble = 60; }
      else if (r < 0.6) { lot.flags |= LF.Abandoned; lot.trouble = 0; }
    }
    city.bump("floods");
    if (city.stats.pop >= 2000 && city.stats.pop > this.popBefore * 0.85) city.bump("floodsSurvived");
    city.emit("note.floodOver", "good");
    city.maps.dirty = true;
    city.look++;
  }

  /** After loading a city nothing burns and the water is back to normal. */
  reset() {
    for (const lot of this.fires.keys()) { lot.flags &= ~LF.Fire; lot.fire = 0; }
    this.fires.clear();
    this.flood = "none";
    this.city.waterLevel = 0;
  }
}
