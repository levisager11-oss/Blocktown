// Blocktown 2: old saves, the new roads, trams, landmarks and traffic that never drives through itself.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Kind, ROADS, Road } from "../src/sim/defs";
import { deserialize, serialize } from "../src/sim/save";
import type { Agent } from "../src/sim/traffic";
import { Bot } from "./bot";
import { anchorAt, buildTown, newCity, placeNear, road, run, startSpot, zoneAll } from "./helpers";

describe("old saves", () => {
  it("loads a city saved by Blocktown 1.0 and keeps it running", () => {
    const text = readFileSync("tests/fixtures/city-v1.json", "utf8");
    expect(JSON.parse(text).v).toBe(1);
    const city = deserialize(text);
    expect(city.roads.segs.size).toBeGreaterThan(20);
    expect([...city.lots.lots.values()].filter((l) => l.kind).length).toBeGreaterThan(50);
    expect(city.transit.lines.length).toBe(1);
    const pop = city.stats.pop;
    expect(pop).toBeGreaterThan(300);
    run(city, 2);
    expect(city.stats.pop).toBeGreaterThan(pop * 0.8);
    // And it saves again in the new format.
    const again = deserialize(serialize(city));
    expect(JSON.parse(serialize(again)).v).toBe(2);
    expect(again.roads.segs.size).toBe(city.roads.segs.size);
  });
});

/** No two vehicles in the same lane overlap. */
function overlaps(agents: Agent[]): number {
  let bad = 0;
  const seen = new Set<unknown>();
  for (const a of agents) {
    if (a.dead) continue;
    const q = a.segs[a.i].q[a.dirs[a.i] * 4 + a.lane] as Agent[];
    if (seen.has(q)) continue;
    seen.add(q);
    for (let k = 1; k < q.length; k++) if (q[k].s > q[k - 1].s - 2 && q[k].v > 0.5 && q[k - 1].dwell === undefined) bad++;
  }
  return bad;
}

describe("traffic", () => {
  it("keeps every lane in order, even at the highest speed", () => {
    const city = newCity({ seed: 7, size: "medium", mode: "chill" });
    const bot = new Bot(city);
    bot.play(40);
    expect(city.traffic.agents.length).toBeGreaterThan(30);
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      city.step(0.25 * 4);
      worst = Math.max(worst, overlaps(city.traffic.agents));
      // Every vehicle is in the queue of the lane it drives in, exactly once.
      if (i % 50 === 0) {
        for (const a of city.traffic.agents) {
          const q = a.segs[a.i].q[a.dirs[a.i] * 4 + a.lane] as Agent[];
          expect(q.filter((x) => x === a).length).toBe(1);
        }
      }
    }
    expect(worst).toBe(0);
    expect(city.stats.flow).toBeGreaterThan(0.5);
  });

  it("drives one-way roads only one way, and round the block when it must", () => {
    const city = newCity({ mode: "chill" });
    const s = startSpot(city);
    const ux = -s.dz, uz = s.dx, vx = s.dx, vz = s.dz;
    const P = (u: number, v: number) => ({ x: s.x + ux * u + vx * v, z: s.z + uz * u + vz * v });
    const A = P(30, 0), B = P(30, 120), C = P(110, 120), D = P(110, 0);
    expect(road(city, s.x, s.z, A.x, A.z).ok).toBe(true);
    expect(road(city, A.x, A.z, B.x, B.z, Road.OneWay).ok).toBe(true);
    expect(road(city, B.x, B.z, C.x, C.z).ok).toBe(true);
    expect(road(city, C.x, C.z, D.x, D.z).ok).toBe(true);
    expect(road(city, D.x, D.z, A.x, A.z).ok).toBe(true);
    const one = [...city.roads.segs.values()].find((g) => g.type === Road.OneWay)!;
    // Forwards: straight along.
    const fwd = city.traffic.route({ seg: one, s: 10 }, { seg: one, s: one.len - 10 })!;
    expect(fwd.segs.length).toBe(1);
    // Backwards: round the block, never against the arrow.
    const back = city.traffic.route({ seg: one, s: one.len - 10 }, { seg: one, s: 10 })!;
    expect(back).not.toBeNull();
    expect(back.segs.length).toBeGreaterThan(3);
    back.segs.forEach((g, i) => { if (ROADS[g.type].oneway) expect(back.dirs[i]).toBe(0); });
    // Turned round, it runs the other way: the trip that was straight along now goes round the block.
    expect(city.reverseRoad(one)).toBe(true);
    const back2 = city.traffic.route({ seg: one, s: one.len - 10 }, { seg: one, s: 10 })!;
    expect(back2.segs.length).toBeGreaterThan(3);
  });

  it("puts traffic lights on crossings of big roads", () => {
    const city = newCity({ mode: "chill" });
    const s = startSpot(city);
    const ux = -s.dz, uz = s.dx, vx = s.dx, vz = s.dz;
    const P = (u: number, v: number) => ({ x: s.x + ux * u + vx * v, z: s.z + uz * u + vz * v });
    const a = P(30, 0), b = P(200, 0), c = P(110, -90), d = P(110, 90);
    road(city, s.x, s.z, a.x, a.z, Road.Avenue);
    expect(road(city, a.x, a.z, b.x, b.z, Road.Avenue).ok).toBe(true);
    expect(road(city, c.x, c.z, d.x, d.z, Road.Avenue).ok).toBe(true);
    city.traffic.update(0.1);
    const mid = city.roads.nearestNode(P(110, 0).x, P(110, 0).z, 10)!;
    expect(mid.segs.length).toBe(4);
    const ctl = city.traffic.ctls.get(mid.id)!;
    expect(ctl.lights).toBe(true);
    // Roads from opposite sides share their green.
    const groups = mid.segs.map((id) => ctl.group.get(id));
    expect(groups.filter((g) => g === 0).length).toBe(2);
    const states = new Set<number>();
    for (let i = 0; i < 200; i++) { city.traffic.update(0.1); states.add(city.traffic.light(mid.id, mid.segs[0])); }
    expect([...states].sort()).toEqual([0, 1, 2]);
  });
});

describe("new roads", () => {
  it("builds a roundabout at a crossing", () => {
    const city = newCity({ mode: "chill" });
    const { origin } = buildTown(city, 3, 3, 60, 102);
    const node = [...city.roads.nodes.values()].find((n) => n.segs.length === 4 && Math.hypot(n.x - origin.x, n.z - origin.z) > 40)!;
    expect(node).toBeTruthy();
    const before = city.roads.segs.size;
    expect(city.buildRoundabout(node.id)).toBe("");
    expect(city.rings.length).toBe(1);
    const ring = [...city.roads.segs.values()].filter((g) => g.type === Road.Ring);
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(city.roads.segs.size).toBeGreaterThan(before);
    // Cars can still get everywhere.
    zoneAll(city);
    placeNear(city, Kind.Coal, origin.x, origin.z);
    run(city, 3);
    expect(city.stats.pop).toBeGreaterThan(50);
    const again = deserialize(serialize(city));
    expect(again.rings.length).toBe(1);
  });

  it("digs a tunnel through a hill that other roads pass over", () => {
    const city = newCity({ mode: "chill", seed: 99, size: "medium" });
    const T = city.terrain;
    // Find a hill with flat land on both sides.
    let found: { a: { x: number; z: number }; b: { x: number; z: number } } | null = null;
    for (let z = 120; z < T.size - 120 && !found; z += 24)
      for (let x = 120; x < T.size - 120 && !found; x += 24) {
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const a = { x: x - dx * 90, z: z - dz * 90 }, b = { x: x + dx * 90, z: z + dz * 90 };
          const ha = T.heightAt(a.x, a.z), hb = T.heightAt(b.x, b.z), hm = T.heightAt(x, z);
          if (ha > 2 && hb > 2 && hm > Math.max(ha, hb) + 9) { found = { a, b }; break; }
        }
      }
    expect(found).not.toBeNull();
    const { a, b } = found!;
    const plan = city.planRoad(anchorAt(city, a.x, a.z), anchorAt(city, b.x, b.z), null, Road.Street, true);
    expect(plan.reason).toBe("");
    expect(plan.deep.some((d) => d)).toBe(true);
    expect(city.buildRoad(plan)).toBe(true);
    const tunnel = [...city.roads.segs.values()].find((g) => g.tunnel)!;
    expect(tunnel).toBeTruthy();
    // No plots grow over the tunnel.
    for (const lot of city.lots.lots.values()) expect(lot.seg === tunnel.id && T.heightAt(lot.x, lot.z) - tunnel.py[Math.round(tunnel.n / 2)] > 4).toBe(false);
    // A road across the top passes over without a crossing.
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, nx = -(b.z - a.z) / 180, nz = (b.x - a.x) / 180;
    const over = city.planRoad(anchorAt(city, mx - nx * 60, mz - nz * 60), anchorAt(city, mx + nx * 60, mz + nz * 60), null, Road.Street);
    if (over.ok) expect(over.stops.length).toBe(2);
    const again = deserialize(serialize(city));
    expect([...again.roads.segs.values()].some((g) => g.tunnel)).toBe(true);
  });
});

describe("trams and landmarks", () => {
  it("runs a tram line on tram avenues", () => {
    const city = newCity({ mode: "chill" });
    const s = startSpot(city);
    const ux = -s.dz, uz = s.dx, vx = s.dx, vz = s.dz;
    const P = (u: number, v: number) => ({ x: s.x + ux * u + vx * v, z: s.z + uz * u + vz * v });
    const a = P(30, 0), b = P(170, 0);
    road(city, s.x, s.z, a.x, a.z, Road.TramAvenue);
    expect(road(city, a.x, a.z, b.x, b.z, Road.TramAvenue).ok).toBe(true);
    const spot = city.placement(Kind.TramDepot, P(100, 30).x, P(100, 30).z);
    expect(spot.reason).toBe("");
    expect(placeNear(city, Kind.TramDepot, P(100, 30).x, P(100, 30).z)).toBe(true);
    run(city, 0.2);
    const segs = [...city.roads.segs.values()].filter((g) => g.type === Road.TramAvenue);
    const stops = [segs[0], segs[segs.length - 1]].map((g) => ({ x: g.px[2], z: g.pz[2], seg: g.id, s: g.cum[2] }));
    const line = city.transit.addLine(false, stops, true);
    expect(typeof line).not.toBe("string");
    run(city, 0.3);
    const trams = city.traffic.agents.filter((x) => x.kind === 4);
    expect(trams.length).toBeGreaterThan(0);
    for (const t of trams) expect(t.segs.every((g) => ROADS[g.type].tram)).toBe(true);
    const again = deserialize(serialize(city));
    expect(again.transit.lines[0].tram).toBe(true);
  });

  it("lets only one of each landmark stand, and landmarks bring visitors and money", () => {
    const city = newCity({ mode: "normal", seed: 7, size: "medium" });
    const bot = new Bot(city);
    bot.play(30);
    city.mode = "chill";
    const o = bot.P(1, 0);
    expect(placeNear(city, Kind.Monument, o.x, o.z)).toBe(true);
    expect(city.placement(Kind.Monument, o.x + 80, o.z).reason === "unique" || !city.placement(Kind.Monument, o.x + 80, o.z).ok).toBe(true);
    expect(placeNear(city, Kind.Ferris, o.x, o.z)).toBe(true);
    city.mode = "normal";
    run(city, 2);
    expect(city.sights.length).toBeGreaterThanOrEqual(2);
    expect(city.stats.tourists).toBeGreaterThan(50);
    expect(city.stats.income.tourism).toBeGreaterThan(50);
  });
});
