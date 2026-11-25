// Seasons and weather. They change how the city looks and a few things in how it runs:
// wind and sun for power plants, heating in winter, slower roads in rain and snow.
import { SEASON_DAYS } from "./defs";
import type { City } from "./city";
import { clamp, clamp01 } from "./util";

export type Sky = "clear" | "cloudy" | "rain" | "storm" | "fog" | "snow";
// How likely each kind of weather is, by season: spring, summer, autumn, winter.
const ODDS: Record<Sky, number[]> = {
  clear: [0.4, 0.58, 0.3, 0.3],
  cloudy: [0.26, 0.2, 0.28, 0.26],
  rain: [0.22, 0.1, 0.24, 0.06],
  storm: [0.05, 0.08, 0.08, 0.03],
  fog: [0.07, 0.04, 0.1, 0.07],
  snow: [0, 0, 0, 0.28],
};
const LOOK: Record<Sky, { cloud: number; rain: number; wind: number; fog: number }> = {
  clear: { cloud: 0.08, rain: 0, wind: 0.7, fog: 0 },
  cloudy: { cloud: 0.6, rain: 0, wind: 0.9, fog: 0 },
  rain: { cloud: 0.85, rain: 0.6, wind: 1, fog: 0.15 },
  storm: { cloud: 1, rain: 1, wind: 1.5, fog: 0.2 },
  fog: { cloud: 0.5, rain: 0, wind: 0.35, fog: 1 },
  snow: { cloud: 0.8, rain: 0.55, wind: 0.8, fog: 0.25 },
};

export class Weather {
  sky: Sky = "clear";
  cloud = 0.1;
  /** How hard it rains or snows, 0 to 1. */
  rain = 0;
  wind = 0.7;
  fog = 0;
  /** Snow lying on the ground, 0 to 1. */
  snowCover = 0;
  /** Hours until the weather changes. */
  left = 10;
  /** A heat wave or cold snap: hours left of it. */
  heat = 0;
  cold = 0;

  constructor(readonly city: City) {}

  get season(): number { return Math.floor(this.city.day / SEASON_DAYS) % 4; }
  get snowing(): boolean { return this.sky === "snow" || (this.season === 3 && this.rain > 0.2); }

  /** How much the wind turbines make of what they can. They stop in a storm. */
  get windPower(): number { return this.wind > 1.4 ? 0.15 : clamp(this.wind * 1.05, 0.25, 1.3); }
  get sunPower(): number { return clamp(1.08 - this.cloud * 0.6 - (this.season === 3 ? 0.18 : 0) + (this.season === 1 ? 0.1 : 0), 0.25, 1.2); }
  get pumpPower(): number { return this.heat > 0 ? 0.7 : 1; }
  /** Heating in winter and cooling in a heat wave need more power. */
  get powerNeed(): number { return 1 + (this.season === 3 ? 0.18 : 0) + (this.cold > 0 ? 0.25 : 0) + (this.heat > 0 ? 0.15 : 0); }
  get waterNeed(): number { return 1 + (this.season === 1 ? 0.1 : 0) + (this.heat > 0 ? 0.25 : 0); }
  get roadSpeed(): number { return 1 - (this.snowing ? 0.22 * clamp01(this.rain * 2) : 0.12 * this.rain) - this.fog * 0.08; }
  get fireRisk(): number { return clamp((this.season === 1 ? 1.5 : 1) * (this.heat > 0 ? 1.8 : 1) * (1 - this.rain * 0.8) * (1 - this.snowCover * 0.5), 0.1, 3); }

  update(hours: number) {
    this.left -= hours;
    if (this.heat > 0) this.heat -= hours;
    if (this.cold > 0) this.cold -= hours;
    if (this.left <= 0) this.change();
    const to = LOOK[this.sky], k = Math.min(1, hours * 1.2);
    this.cloud += (to.cloud - this.cloud) * k;
    this.rain += (to.rain - this.rain) * k;
    this.wind += (to.wind - this.wind) * k * 0.6;
    this.fog += (to.fog - this.fog) * k;
    // Snow builds up while it snows and melts when it is not winter.
    if (this.snowing) this.snowCover = Math.min(1, this.snowCover + hours * 0.09 * this.rain * 2);
    else this.snowCover = Math.max(0, this.snowCover - hours * (this.season === 3 ? 0.006 : 0.07));
  }

  private change() {
    const season = this.season;
    let r = Math.random(), next: Sky = "clear";
    for (const sky of Object.keys(ODDS) as Sky[]) {
      r -= ODDS[sky][season];
      if (r <= 0) { next = sky; break; }
    }
    // Fog belongs to the morning.
    if (next === "fog" && (this.city.hour > 10 && this.city.hour < 22)) next = "cloudy";
    this.sky = next;
    this.left = next === "storm" ? 3 + Math.random() * 4 : next === "fog" ? 3 + Math.random() * 3 : 5 + Math.random() * 12;
    const city = this.city;
    if (city.chill || !city.disastersOn || !city.unlocked(5)) return;
    // Now and then: a heat wave in summer, a cold snap in winter.
    if (season === 1 && next === "clear" && this.heat <= 0 && Math.random() < 0.14) { this.heat = 36; city.emit("note.heat", "warn"); }
    if (season === 3 && this.cold <= 0 && Math.random() < 0.12) { this.cold = 36; city.emit("note.cold", "warn"); }
  }
}
