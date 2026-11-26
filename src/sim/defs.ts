// Everything that can be built, with its numbers. Change the balance of the game here.

export const CELL = 8; // one land square, in world units (about metres)
export const DAY_SECONDS = 60; // one game day lasts this long at normal speed
export const HOURS_PER_SECOND = 24 / DAY_SECONDS;
export const SEASON_DAYS = 6;
export const YEAR_DAYS = SEASON_DAYS * 4;

export type Mode = "chill" | "normal" | "hard";
export const MAP_SIZES = { small: 128, medium: 176, large: 232 } as const;
export type MapSize = keyof typeof MAP_SIZES;

// ---------------------------------------------------------------- roads
export const enum Road { Street = 0, Avenue = 1, Highway = 2, OneWay = 3, OneWayAvenue = 4, TramAvenue = 5, Ring = 6 }
export interface RoadDef {
  key: string; width: number; lanes: number; speed: number; cost: number; upkeep: number; zones: boolean;
  minRadius: number; unlock: number; noise: number;
  /** Traffic only runs from the road's start to its end. */
  oneway?: boolean;
  /** Has tram tracks in the middle. */
  tram?: boolean;
  /** Not drawn by hand (the ring of a roundabout). */
  hidden?: boolean;
}
export const ROADS: RoadDef[] = [
  { key: "street", width: 8, lanes: 1, speed: 13, cost: 12, upkeep: 0.012, zones: true, minRadius: 9, unlock: 0, noise: 0.5 },
  { key: "avenue", width: 14, lanes: 2, speed: 17, cost: 28, upkeep: 0.028, zones: true, minRadius: 14, unlock: 3, noise: 0.8 },
  { key: "highway", width: 18, lanes: 2, speed: 30, cost: 60, upkeep: 0.06, zones: false, minRadius: 34, unlock: 6, noise: 1.2 },
  { key: "oneway", width: 8, lanes: 2, speed: 14, cost: 14, upkeep: 0.014, zones: true, minRadius: 9, unlock: 2, noise: 0.5, oneway: true },
  { key: "onewayAvenue", width: 14, lanes: 3, speed: 18, cost: 32, upkeep: 0.03, zones: true, minRadius: 14, unlock: 4, noise: 0.8, oneway: true },
  { key: "tramAvenue", width: 16, lanes: 2, speed: 16, cost: 46, upkeep: 0.04, zones: true, minRadius: 18, unlock: 5, noise: 0.7, tram: true },
  { key: "ring", width: 9, lanes: 2, speed: 9, cost: 22, upkeep: 0.02, zones: false, minRadius: 6, unlock: 3, noise: 0.4, oneway: true, hidden: true },
];
/** The kinds of road a player can draw, in the order the tools show them. */
export const DRAWN_ROADS = [Road.Street, Road.OneWay, Road.Avenue, Road.OneWayAvenue, Road.TramAvenue, Road.Highway];
export const BRIDGE_COST = 3.5; // bridges cost this many times a road on land
export const TUNNEL_COST = 4.5; // tunnels cost this many times a road on land
/** How deep under the ground a tunnel has to be before it passes under things instead of meeting them. */
export const TUNNEL_DEPTH = 2.2;
export const ROUNDABOUT = { radius: 14, cost: 2600, unlock: 3 };
export const BRIDGE_HEIGHT = 2.6; // how high a road stays above the water
export const LOT_SETBACK = 9.5; // from the middle of the road to the front of a plot
export const LOT_W = 14;
export const LOT_D = 16;

// ---------------------------------------------------------------- zones
export const enum Zone {
  None = 0, ResLow = 1, ResHigh = 2, ComLow = 3, ComHigh = 4, Industry = 5, Office = 6,
  Farm = 7, Forestry = 8, Ore = 9, Oil = 10,
}
export interface ZoneDef {
  key: string; color: number; unlock: number; group: "r" | "c" | "i" | "o";
  /** People living or working there, by level 1 to 3. */
  cap: number[]; power: number[]; water: number[];
  /** Tax per person or job a day at 9 % tax. */
  tax: number; pollution: number; noise: number; levels: number;
  /** For farms and the like: which natural resource the land needs (index into the resource maps). */
  resource?: number;
}
export const ZONES: ZoneDef[] = [
  { key: "none", color: 0x9aa39a, unlock: 0, group: "r", cap: [0, 0, 0], power: [0, 0, 0], water: [0, 0, 0], tax: 0, pollution: 0, noise: 0, levels: 0 },
  { key: "resLow", color: 0x6cc24a, unlock: 0, group: "r", cap: [6, 9, 13], power: [2, 3, 4], water: [1, 1.5, 2], tax: 1.0, pollution: 0, noise: 0, levels: 3 },
  { key: "resHigh", color: 0x2e8b3d, unlock: 4, group: "r", cap: [42, 76, 128], power: [14, 24, 38], water: [8, 14, 22], tax: 0.92, pollution: 0, noise: 0.1, levels: 3 },
  { key: "comLow", color: 0x4aa3e8, unlock: 0, group: "c", cap: [4, 7, 10], power: [3, 5, 8], water: [1, 2, 3], tax: 2.3, pollution: 0, noise: 0.3, levels: 3 },
  { key: "comHigh", color: 0x2b6cc4, unlock: 4, group: "c", cap: [20, 36, 60], power: [14, 26, 44], water: [6, 11, 18], tax: 2.1, pollution: 0, noise: 0.5, levels: 3 },
  { key: "industry", color: 0xe8b23a, unlock: 0, group: "i", cap: [12, 16, 22], power: [16, 22, 30], water: [6, 8, 11], tax: 1.9, pollution: 0.55, noise: 0.5, levels: 3 },
  { key: "office", color: 0x35c4c4, unlock: 5, group: "o", cap: [28, 50, 84], power: [18, 30, 50], water: [5, 9, 14], tax: 2.5, pollution: 0, noise: 0.2, levels: 3 },
  { key: "farm", color: 0xc9d65a, unlock: 4, group: "i", cap: [6, 6, 6], power: [4, 4, 4], water: [6, 6, 6], tax: 2.2, pollution: 0.04, noise: 0.1, levels: 1, resource: 0 },
  { key: "forestry", color: 0x7a9a3a, unlock: 4, group: "i", cap: [6, 6, 6], power: [5, 5, 5], water: [2, 2, 2], tax: 2.2, pollution: 0.04, noise: 0.2, levels: 1, resource: 1 },
  { key: "ore", color: 0xb0885a, unlock: 6, group: "i", cap: [10, 10, 10], power: [18, 18, 18], water: [6, 6, 6], tax: 2.4, pollution: 0.8, noise: 0.6, levels: 1, resource: 2 },
  { key: "oil", color: 0x6a5a7a, unlock: 6, group: "i", cap: [10, 10, 10], power: [20, 20, 20], water: [6, 6, 6], tax: 2.6, pollution: 0.9, noise: 0.5, levels: 1, resource: 3 },
];
export const RAW_NAMES = ["crops", "wood", "ore", "oil"] as const;
/** How much schooling the jobs of a workplace ask for: shares of [none, school, high school, university]. */
export function jobMix(zone: Zone, level: number): number[] {
  if (zone >= Zone.Farm) return [0.8, 0.2, 0, 0];
  if (zone === Zone.Industry) return [[0.7, 0.3, 0, 0], [0.45, 0.4, 0.15, 0], [0.25, 0.4, 0.25, 0.1]][level - 1];
  if (zone === Zone.Office) return [[0, 0.3, 0.5, 0.2], [0, 0.15, 0.5, 0.35], [0, 0.05, 0.45, 0.5]][level - 1];
  return [[0.5, 0.5, 0, 0], [0.3, 0.5, 0.2, 0], [0.2, 0.4, 0.3, 0.1]][level - 1];
}
export const SERVICE_JOB_MIX = [0.2, 0.4, 0.3, 0.1];

// ---------------------------------------------------------------- buildings placed by hand
export const enum Kind {
  // Zoned buildings use their zone number (1 to 10) as their kind.
  Wind = 20, Coal = 21, Solar = 22, Nuclear = 24,
  Pump = 30, Tower = 31, Outlet = 32, Treatment = 33, Septic = 34,
  Landfill = 35, Incinerator = 36, Recycling = 37,
  Police = 40, PoliceHQ = 41, Fire = 42, FireHQ = 43,
  Clinic = 45, Hospital = 46,
  School = 50, HighSchool = 51, University = 52,
  Park = 55, Playground = 56, BigPark = 57, Plaza = 58, Stadium = 59,
  BusDepot = 60, Metro = 61, TramDepot = 62,
  // Landmarks: one of each per city.
  CityHall = 70, Monument = 71, Ferris = 72, TvTower = 73, Harbour = 74, Cathedral = 75, Airport = 76, Opera = 77, Spire = 78, Space = 79,
}
export type Cat = "power" | "water" | "garbage" | "police" | "fire" | "health" | "edu" | "parks" | "transit" | "landmark";
export interface PlaceDef {
  kind: Kind; key: string; cat: Cat; w: number; d: number; cost: number; upkeep: number; jobs: number;
  power?: number; water?: number; unlock: number;
  /** What it makes or handles. */
  makesPower?: number; makesWater?: number; sewage?: number; garbage?: number;
  /** A service reaching the plots around it. */
  radius?: number; seats?: number; beds?: number;
  pollution?: number; pollutionRadius?: number; noise?: number;
  /** Has to stand near the water. */
  shore?: boolean;
  /** How much nicer it makes the land around it. */
  charm?: number;
  /** Only one per city. */
  unique?: boolean;
  /** How many visitors a day it draws from out of town. */
  tourism?: number;
  /** Makes every home a little happier. */
  happy?: number;
  /** Raises all taxes by this share. */
  taxBonus?: number;
  /** Special powers of a landmark: exports earn more, tourists come in greater numbers, offices are wanted more. */
  trade?: number; visitors?: number; offices?: number;
  icon: string;
}
export const PLACE: PlaceDef[] = [
  { kind: Kind.Wind, key: "wind", cat: "power", w: 12, d: 12, cost: 3200, upkeep: 30, jobs: 1, makesPower: 130, unlock: 0, noise: 0.25, icon: "🌬️" },
  { kind: Kind.Coal, key: "coal", cat: "power", w: 40, d: 30, cost: 9800, upkeep: 190, jobs: 16, makesPower: 900, unlock: 0, pollution: 1, pollutionRadius: 190, noise: 0.6, water: 12, icon: "🏭" },
  { kind: Kind.Solar, key: "solar", cat: "power", w: 40, d: 30, cost: 15500, upkeep: 110, jobs: 4, makesPower: 620, unlock: 5, icon: "☀️" },
  { kind: Kind.Nuclear, key: "nuclear", cat: "power", w: 56, d: 44, cost: 98000, upkeep: 1100, jobs: 60, makesPower: 6500, unlock: 8, water: 60, icon: "☢️" },

  { kind: Kind.Pump, key: "pump", cat: "water", w: 14, d: 14, cost: 2400, upkeep: 45, jobs: 2, power: 12, makesWater: 520, unlock: 1, shore: true, icon: "🚰" },
  { kind: Kind.Tower, key: "tower", cat: "water", w: 14, d: 14, cost: 3400, upkeep: 60, jobs: 1, power: 6, makesWater: 220, unlock: 1, icon: "🗼" },
  { kind: Kind.Outlet, key: "outlet", cat: "water", w: 14, d: 14, cost: 2200, upkeep: 40, jobs: 1, power: 8, sewage: 560, unlock: 1, shore: true, pollution: 0.7, pollutionRadius: 90, icon: "🕳️" },
  { kind: Kind.Septic, key: "septic", cat: "water", w: 14, d: 14, cost: 2800, upkeep: 60, jobs: 1, sewage: 260, unlock: 1, pollution: 0.45, pollutionRadius: 70, icon: "🪠" },
  { kind: Kind.Treatment, key: "treatment", cat: "water", w: 32, d: 26, cost: 14500, upkeep: 170, jobs: 10, power: 40, sewage: 1900, unlock: 5, icon: "♻️" },

  { kind: Kind.Landfill, key: "landfill", cat: "garbage", w: 36, d: 30, cost: 4200, upkeep: 75, jobs: 6, garbage: 28, unlock: 2, pollution: 0.8, pollutionRadius: 130, noise: 0.3, icon: "🗑️" },
  { kind: Kind.Recycling, key: "recycling", cat: "garbage", w: 28, d: 24, cost: 9200, upkeep: 130, jobs: 12, power: 20, garbage: 44, unlock: 5, noise: 0.3, icon: "♻️" },
  { kind: Kind.Incinerator, key: "incinerator", cat: "garbage", w: 32, d: 28, cost: 21000, upkeep: 260, jobs: 14, garbage: 120, makesPower: 260, unlock: 6, pollution: 0.45, pollutionRadius: 120, noise: 0.4, icon: "🔥" },

  { kind: Kind.Police, key: "police", cat: "police", w: 24, d: 20, cost: 6200, upkeep: 105, jobs: 14, power: 10, water: 4, radius: 230, unlock: 3, icon: "🚓" },
  { kind: Kind.PoliceHQ, key: "policeHq", cat: "police", w: 36, d: 30, cost: 26000, upkeep: 330, jobs: 50, power: 30, water: 10, radius: 470, unlock: 7, icon: "🏛️" },
  { kind: Kind.Fire, key: "fire", cat: "fire", w: 24, d: 20, cost: 5800, upkeep: 100, jobs: 12, power: 10, water: 6, radius: 250, unlock: 3, icon: "🚒" },
  { kind: Kind.FireHQ, key: "fireHq", cat: "fire", w: 36, d: 30, cost: 24000, upkeep: 310, jobs: 44, power: 28, water: 14, radius: 500, unlock: 7, icon: "🧯" },

  { kind: Kind.Clinic, key: "clinic", cat: "health", w: 22, d: 20, cost: 5600, upkeep: 110, jobs: 14, power: 12, water: 6, radius: 230, beds: 1800, unlock: 2, icon: "🩺" },
  { kind: Kind.Hospital, key: "hospital", cat: "health", w: 40, d: 32, cost: 30000, upkeep: 420, jobs: 70, power: 50, water: 24, radius: 480, beds: 12000, unlock: 5, icon: "🏥" },

  { kind: Kind.School, key: "school", cat: "edu", w: 28, d: 22, cost: 6400, upkeep: 115, jobs: 14, power: 10, water: 5, radius: 240, seats: 320, unlock: 2, icon: "🏫" },
  { kind: Kind.HighSchool, key: "highSchool", cat: "edu", w: 36, d: 28, cost: 15000, upkeep: 230, jobs: 26, power: 20, water: 9, radius: 400, seats: 700, unlock: 4, icon: "🎒" },
  { kind: Kind.University, key: "university", cat: "edu", w: 52, d: 40, cost: 46000, upkeep: 560, jobs: 80, power: 60, water: 24, radius: 700, seats: 2200, unlock: 6, icon: "🎓" },

  { kind: Kind.Park, key: "park", cat: "parks", w: 14, d: 16, cost: 700, upkeep: 12, jobs: 0, radius: 95, charm: 0.5, unlock: 1, icon: "🌳" },
  { kind: Kind.Playground, key: "playground", cat: "parks", w: 14, d: 16, cost: 1100, upkeep: 16, jobs: 0, radius: 110, charm: 0.55, unlock: 3, icon: "🛝" },
  { kind: Kind.Plaza, key: "plaza", cat: "parks", w: 22, d: 20, cost: 2600, upkeep: 30, jobs: 1, radius: 140, charm: 0.6, unlock: 4, icon: "⛲" },
  { kind: Kind.BigPark, key: "bigPark", cat: "parks", w: 44, d: 34, cost: 7800, upkeep: 75, jobs: 3, radius: 230, charm: 0.85, tourism: 15, unlock: 5, icon: "🏞️" },
  { kind: Kind.Stadium, key: "stadium", cat: "parks", w: 56, d: 46, cost: 42000, upkeep: 380, jobs: 30, power: 40, water: 12, radius: 520, charm: 0.7, tourism: 150, unlock: 7, noise: 0.5, icon: "🏟️" },

  { kind: Kind.BusDepot, key: "busDepot", cat: "transit", w: 30, d: 24, cost: 7000, upkeep: 90, jobs: 12, power: 10, water: 3, unlock: 4, noise: 0.3, icon: "🚌" },
  { kind: Kind.TramDepot, key: "tramDepot", cat: "transit", w: 34, d: 26, cost: 12000, upkeep: 120, jobs: 14, power: 24, water: 3, unlock: 5, noise: 0.3, icon: "🚋" },
  { kind: Kind.Metro, key: "metro", cat: "transit", w: 16, d: 14, cost: 9500, upkeep: 85, jobs: 6, power: 30, unlock: 7, icon: "🚇" },

  { kind: Kind.Monument, key: "monument", cat: "landmark", w: 18, d: 18, cost: 6000, upkeep: 25, jobs: 1, radius: 170, charm: 0.7, tourism: 60, unlock: 1, unique: true, icon: "🗽" },
  { kind: Kind.CityHall, key: "cityHall", cat: "landmark", w: 32, d: 26, cost: 18000, upkeep: 140, jobs: 24, power: 14, water: 6, radius: 220, charm: 0.5, tourism: 40, happy: 0.02, taxBonus: 0.05, unlock: 2, unique: true, icon: "🏛️" },
  { kind: Kind.Ferris, key: "ferris", cat: "landmark", w: 40, d: 32, cost: 32000, upkeep: 230, jobs: 26, power: 30, water: 6, radius: 300, charm: 0.85, tourism: 240, noise: 0.35, unlock: 4, unique: true, icon: "🎡" },
  { kind: Kind.TvTower, key: "tvTower", cat: "landmark", w: 22, d: 22, cost: 45000, upkeep: 260, jobs: 12, power: 40, radius: 620, charm: 0.42, tourism: 170, unlock: 5, unique: true, icon: "🗼" },
  { kind: Kind.Harbour, key: "harbour", cat: "landmark", w: 52, d: 36, cost: 60000, upkeep: 380, jobs: 90, power: 40, water: 10, radius: 160, charm: 0.2, tourism: 70, trade: 0.5, shore: true, pollution: 0.3, pollutionRadius: 90, noise: 0.6, unlock: 6, unique: true, icon: "⚓" },
  { kind: Kind.Cathedral, key: "cathedral", cat: "landmark", w: 34, d: 44, cost: 52000, upkeep: 200, jobs: 12, power: 16, water: 4, radius: 360, charm: 0.9, tourism: 280, happy: 0.02, unlock: 7, unique: true, icon: "⛪" },
  { kind: Kind.Airport, key: "airport", cat: "landmark", w: 120, d: 72, cost: 150000, upkeep: 1200, jobs: 260, power: 90, water: 30, tourism: 500, visitors: 0.3, offices: 0.12, noise: 1, unlock: 8, unique: true, icon: "✈️" },
  { kind: Kind.Opera, key: "opera", cat: "landmark", w: 44, d: 36, cost: 90000, upkeep: 520, jobs: 40, power: 40, water: 10, radius: 420, charm: 0.9, tourism: 380, happy: 0.03, unlock: 9, unique: true, icon: "🎭" },
  { kind: Kind.Spire, key: "spire", cat: "landmark", w: 30, d: 30, cost: 220000, upkeep: 900, jobs: 600, power: 160, water: 60, radius: 520, charm: 0.5, tourism: 520, offices: 0.08, unlock: 10, unique: true, icon: "🏙️" },
  { kind: Kind.Space, key: "space", cat: "landmark", w: 92, d: 70, cost: 400000, upkeep: 2000, jobs: 400, power: 200, water: 50, seats: 1600, radius: 900, tourism: 1200, noise: 0.5, unlock: 12, unique: true, icon: "🚀" },
];
export const PLACE_BY_KIND = new Map<number, PlaceDef>(PLACE.map((p) => [p.kind, p]));

export const BUS = { stopCost: 180, busUpkeep: 22, busSeats: 420, busesPerDepot: 16, reach: 95, speed: 11, fare: 0.55 };
export const METRO = { trackCost: 22, trainUpkeep: 60, trainSeats: 2600, reach: 150, speed: 28, fare: 0.7 };
export const TRAM = { stopCost: 400, tramUpkeep: 40, tramSeats: 1100, tramsPerDepot: 10, reach: 115, fare: 0.6 };
/** What a visitor from out of town spends a day. */
export const TOURIST_SPEND = 1.4;

// ---------------------------------------------------------------- milestones
/** How many citizens a city needs for each step. Each step unlocks new things. */
export const MILESTONES = [0, 120, 350, 800, 1600, 3200, 6000, 10000, 16000, 26000, 42000, 68000, 100000];
export const MILESTONE_REWARD = [0, 4000, 6000, 9000, 14000, 20000, 28000, 40000, 55000, 75000, 100000, 130000, 170000];
/** What else each step unlocks (besides the buildings, roads and zones whose `unlock` names it). */
export const FEATURE_UNLOCK = { water: 1, garbage: 2, budget: 2, loans: 2, health: 2, edu: 2, safety: 3, fires: 3, transit: 4, industry: 4, storms: 5, metro: 7, landmarks: 1, roundabout: 3, tram: 5, tunnel: 6 };

export const START_MONEY: Record<Mode, number> = { chill: 0, normal: 60000, hard: 36000 };
export const MODE = {
  chill: { income: 1, costs: 0, disasters: 0, abandon: false },
  normal: { income: 1, costs: 1, disasters: 1, abandon: true },
  hard: { income: 0.88, costs: 1.2, disasters: 1.8, abandon: true },
} as const;

export const LOANS = [
  { amount: 20000, days: 20, rate: 0.12, unlock: 2 },
  { amount: 60000, days: 30, rate: 0.16, unlock: 4 },
  { amount: 180000, days: 40, rate: 0.2, unlock: 6 },
];

export const BUDGET_CATS: Cat[] = ["power", "water", "garbage", "police", "fire", "health", "edu", "parks", "transit", "landmark"];
export const CAT_UNLOCK: Record<Cat, number> = { power: 0, water: 1, garbage: 2, police: 3, fire: 3, health: 2, edu: 2, parks: 1, transit: 4, landmark: 1 };

/** Colours of the info views and other things both the simulation and the screen need. */
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
