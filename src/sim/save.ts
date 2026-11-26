// Saving and loading a city. Toki keeps a game's whole storage (at most 1 MB), so a city is packed small:
// the land is rebuilt from its seed, and roads and plots are stored as tightly packed numbers.
import { Cat, MapSize, Mode, ROADS, Road } from "./defs";
import { City } from "./city";
import { census, utilities } from "./economy";
import { LF } from "./lots";
import type { Sky } from "./weather";

export const SAVE_VERSION = 2;
/** Saves from these versions can be loaded. Version 1 is Blocktown 1.0. */
const READS = [1, 2];
const Q = 8; // positions are kept to an eighth of a unit

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const u16 = (v: number) => Math.max(0, Math.min(65535, Math.round(v)));

export interface SaveData {
  v: number; name: string; seed: number; size: MapSize; mode: Mode;
  hours: number; sim: number; money: number;
  taxes: { r: number; c: number; i: number; o: number }; budget: Record<Cat, number>;
  loans: { amount: number; left: number; perDay: number }[];
  edu: number[]; demand: { r: number; c: number; i: number; o: number };
  milestone: number; reached: number[]; disastersOn: boolean; over: boolean;
  count: Record<string, number>; best: Record<string, number>;
  history: { pop: number[]; money: number[]; happy: number[] };
  weather: { sky: Sky; cloud: number; rain: number; wind: number; fog: number; snow: number; left: number; heat: number; cold: number };
  lines: { metro: boolean; tram?: boolean; vehicles: number; color: number; riders: number; stops: number[] }[];
  flow: number; nodes: string; segs: string; lots: string;
  /** Since version 2: the middles of roundabouts (x, z, radius, ...). */
  rings?: number[];
}

const round = (v: number, p = 100) => Math.round(v * p) / p;

export function serialize(city: City): string {
  // Crossings get new numbers without gaps.
  const nodeIndex = new Map<number, number>();
  const nodes = [...city.roads.nodes.values()];
  const nb = new Uint8Array(nodes.length * 5), nv = new DataView(nb.buffer);
  nodes.forEach((n, i) => {
    nodeIndex.set(n.id, i);
    nv.setUint16(i * 5, u16(n.x * Q));
    nv.setUint16(i * 5 + 2, u16(n.z * Q));
    nb[i * 5 + 4] = n.outside ? 1 : 0;
  });
  const segs = [...city.roads.segs.values()];
  const sb = new Uint8Array(segs.length * 9), sv = new DataView(sb.buffer);
  segs.forEach((s, i) => {
    sv.setUint16(i * 9, nodeIndex.get(s.a)!);
    sv.setUint16(i * 9 + 2, nodeIndex.get(s.b)!);
    sv.setUint16(i * 9 + 4, u16(s.cx * Q));
    sv.setUint16(i * 9 + 6, u16(s.cz * Q));
    sb[i * 9 + 8] = s.type | (s.fixed ? 8 : 0) | (s.tunnel ? 16 : 0);
  });
  // Only plots that carry something: a zone or a building. Empty ones are laid out again when loading.
  const lots = [...city.lots.lots.values()].filter((l) => l.zone || l.kind);
  const LB = 13;
  const lb = new Uint8Array(lots.length * LB), lv = new DataView(lb.buffer);
  const TAU = Math.PI * 2;
  lots.forEach((l, i) => {
    const o = i * LB;
    lv.setUint16(o, u16(l.x * Q));
    lv.setUint16(o + 2, u16(l.z * Q));
    lv.setUint16(o + 4, u16((((l.ang % TAU) + TAU) % TAU) / TAU * 65535));
    lb[o + 6] = Math.round(l.w);
    lb[o + 7] = Math.round(l.d);
    lb[o + 8] = l.zone;
    lb[o + 9] = l.kind;
    lb[o + 10] = (l.level & 7) | (l.custom ? 8 : 0) | (l.flags & LF.Abandoned ? 16 : 0) | (l.flags & LF.Burnt ? 32 : 0) | (l.built >= 1 ? 64 : 0);
    lb[o + 11] = l.variant & 255;
    lb[o + 12] = Math.round(Math.max(0, Math.min(1, l.occ)) * 255);
  });
  const W = city.weather;
  const data: SaveData = {
    v: SAVE_VERSION, name: city.name, seed: city.seed, size: city.size, mode: city.mode,
    hours: round(city.hours), sim: Math.round(city.simTime), money: Math.round(city.money),
    taxes: city.taxes, budget: city.budget,
    loans: city.loans.map((l) => ({ amount: l.amount, left: round(l.left), perDay: round(l.perDay) })),
    edu: city.edu.map((e) => round(e, 10000)),
    demand: { r: round(city.demand.r), c: round(city.demand.c), i: round(city.demand.i), o: round(city.demand.o) },
    milestone: city.milestone, reached: city.reached.map((h) => Math.round(h)), disastersOn: city.disastersOn, over: city.over,
    count: Object.fromEntries(Object.entries(city.count).map(([k, v]) => [k, round(v)])), best: city.best, history: city.history,
    weather: { sky: W.sky, cloud: round(W.cloud), rain: round(W.rain), wind: round(W.wind), fog: round(W.fog), snow: round(W.snowCover), left: round(W.left), heat: round(W.heat), cold: round(W.cold) },
    lines: city.transit.lines.map((l) => ({ metro: l.metro, tram: l.tram || undefined, vehicles: l.vehicles, color: l.color, riders: Math.round(l.riders), stops: l.stops.flatMap((s) => [round(s.x, 10), round(s.z, 10)]) })),
    flow: round(city.traffic.flow), nodes: toBase64(nb), segs: toBase64(sb), lots: toBase64(lb),
    rings: city.rings.flatMap((g) => [round(g.x, 10), round(g.z, 10), g.r]),
  };
  return JSON.stringify(data);
}

export function deserialize(text: string): City {
  const d = JSON.parse(text) as SaveData;
  if (!d || !READS.includes(d.v)) throw new Error("unknown save");
  const city = new City({ name: d.name, seed: d.seed, size: d.size, mode: d.mode }, true);
  const nb = fromBase64(d.nodes), nv = new DataView(nb.buffer);
  for (let i = 0; i * 5 < nb.length; i++) city.roads.addNode(nv.getUint16(i * 5) / Q, nv.getUint16(i * 5 + 2) / Q, nb[i * 5 + 4] === 1, i + 1);
  const sb = fromBase64(d.segs), sv = new DataView(sb.buffer);
  for (let i = 0; i * 9 < sb.length; i++) {
    const o = i * 9;
    city.roads.addSeg(sv.getUint16(o) + 1, sv.getUint16(o + 2) + 1, sv.getUint16(o + 4) / Q, sv.getUint16(o + 6) / Q, (sb[o + 8] & 7) as Road, (sb[o + 8] & 8) !== 0, undefined, (sb[o + 8] & 16) !== 0);
  }
  const lb = fromBase64(d.lots), lv = new DataView(lb.buffer), LB = 13;
  for (let i = 0; i * LB < lb.length; i++) {
    const o = i * LB, bits = lb[o + 10];
    const lot = city.lots.add({ x: lv.getUint16(o) / Q, z: lv.getUint16(o + 2) / Q, ang: (lv.getUint16(o + 4) / 65535) * Math.PI * 2, w: lb[o + 6], d: lb[o + 7] }, 0, 0, (bits & 8) !== 0);
    lot.zone = lb[o + 8];
    lot.kind = lb[o + 9];
    lot.level = bits & 7;
    lot.variant = lb[o + 11];
    lot.occ = lb[o + 12] / 255;
    lot.built = lot.kind ? (bits & 64 ? 1 : 0.5) : 0;
    if (bits & 16) lot.flags |= LF.Abandoned;
    if (bits & 32) lot.flags |= LF.Burnt;
    if (lot.kind && lot.built < 1) city.rising.add(lot);
    if (!city.lots.reattach(lot) && !lot.custom) city.lots.remove(lot);
  }
  for (const seg of city.roads.segs.values()) city.lots.generateFor(seg);

  city.hours = d.hours;
  city.simTime = d.sim;
  city.money = d.money;
  city.taxes = d.taxes;
  city.budget = { ...city.budget, ...d.budget };
  city.loans = d.loans ?? [];
  city.edu = d.edu;
  city.demand = d.demand;
  city.milestone = d.milestone;
  city.reached = d.reached;
  city.disastersOn = d.disastersOn;
  city.over = d.over;
  city.count = d.count ?? {};
  city.best = d.best ?? {};
  city.history = d.history ?? { pop: [], money: [], happy: [] };
  const W = city.weather, w = d.weather;
  if (w) { W.sky = w.sky; W.cloud = w.cloud; W.rain = w.rain; W.wind = w.wind; W.fog = w.fog; W.snowCover = w.snow; W.left = w.left; W.heat = w.heat; W.cold = w.cold; }
  for (const l of d.lines ?? []) {
    const stops = [];
    for (let i = 0; i + 1 < l.stops.length; i += 2) {
      const x = l.stops[i], z = l.stops[i + 1];
      if (l.metro) {
        const lot = city.lots.at(x, z);
        if (lot) stops.push({ x, z, seg: lot.seg, s: lot.s, lot: lot.id });
      } else {
        const hit = city.roads.nearestSeg(x, z, 6, l.tram ? (s) => !ROADS[s.type].tram : undefined);
        if (hit) stops.push({ x, z, seg: hit.seg.id, s: hit.s });
      }
    }
    if (stops.length < 2) continue;
    const line = { id: city.transit.lines.length + 1, metro: l.metro, stops, vehicles: l.vehicles, color: l.color, riders: l.riders, today: 0, dead: false } as (typeof city.transit.lines)[number];
    if (l.tram) line.tram = true;
    city.transit.lines.push(line);
  }
  const rings = d.rings ?? [];
  for (let i = 0; i + 2 < rings.length; i += 3) city.rings.push({ x: rings[i], z: rings[i + 1], r: rings[i + 2] });
  (city.transit as unknown as { next: number }).next = city.transit.lines.length + 1;
  city.transit.version++;
  city.traffic.flow = d.flow ?? 1;
  // Work out the state of things once, so the numbers on screen are right from the first moment.
  city.maps.recompute(city);
  utilities(city);
  census(city);
  city.look++;
  return city;
}

// ------------------------------------------------------------------ the browser's storage

export interface SlotInfo { slot: number; name: string; mode: Mode; size: MapSize; seed: number; pop: number; day: number; savedAt: number; score: number }
const INDEX_KEY = "blocktown.index";
const cityKey = (slot: number) => "blocktown.city." + slot;
export const MAX_SLOTS = 3;
/** Toki keeps at most 1 MB per game: stay well under it. */
const STORAGE_LIMIT = 930000;

export function listSlots(): SlotInfo[] {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]") as SlotInfo[];
    return Array.isArray(list) ? list.filter((s) => localStorage.getItem(cityKey(s.slot)) !== null) : [];
  } catch { return []; }
}

export function freeSlot(): number {
  const used = new Set(listSlots().map((s) => s.slot));
  for (let i = 1; i <= MAX_SLOTS; i++) if (!used.has(i)) return i;
  return 0;
}

/** Saves a city in a slot. Returns "" or why it failed: full (storage is full), error. */
export function saveCity(city: City, slot: number): string {
  try {
    const text = serialize(city);
    let other = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k !== cityKey(slot)) other += k.length + (localStorage.getItem(k)?.length ?? 0);
    }
    if (other + text.length > STORAGE_LIMIT) return "full";
    localStorage.setItem(cityKey(slot), text);
    const info: SlotInfo = { slot, name: city.name, mode: city.mode, size: city.size, seed: city.seed, pop: Math.round(city.stats.pop), day: city.day, savedAt: Date.now(), score: city.stats.score };
    const list = listSlots().filter((s) => s.slot !== slot);
    list.push(info);
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
    return "";
  } catch { return "error"; }
}

export function loadCity(slot: number): City | null {
  try {
    const text = localStorage.getItem(cityKey(slot));
    return text ? deserialize(text) : null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export function deleteCity(slot: number) {
  try {
    localStorage.removeItem(cityKey(slot));
    localStorage.setItem(INDEX_KEY, JSON.stringify(listSlots().filter((s) => s.slot !== slot)));
  } catch { /* nothing to do */ }
}
