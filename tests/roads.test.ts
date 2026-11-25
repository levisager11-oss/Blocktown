import { describe, expect, it } from "vitest";
import { Road, Zone } from "../src/sim/defs";
import { bezPart, bezX, boxesOverlap, crossing } from "../src/sim/geom";
import { anchorAt, newCity, road, startSpot } from "./helpers";

describe("geometry", () => {
  it("finds where two lines cross", () => {
    const c = crossing(0, 0, 10, 0, 5, -5, 5, 5)!;
    expect(c.t).toBeCloseTo(0.5);
    expect(c.u).toBeCloseTo(0.5);
    expect(crossing(0, 0, 10, 0, 0, 1, 10, 1)).toBeNull();
  });
  it("cuts a curve into a part that lies on the curve", () => {
    const part = bezPart(0, 0, 50, 80, 100, 0, 0.25, 0.75);
    expect(part[0]).toBeCloseTo(bezX(0, 50, 100, 0.25));
    expect(part[5]).toBeCloseTo(bezX(0, 80, 0, 0.75));
    // The middle of the part is the middle of the whole curve.
    expect(bezX(part[1], part[3], part[5], 0.5)).toBeCloseTo(bezX(0, 80, 0, 0.5));
  });
  it("tells whether two turned boxes overlap", () => {
    const a = { x: 0, z: 0, ang: 0, w: 10, d: 10 };
    expect(boxesOverlap(a, { x: 9, z: 0, ang: 0, w: 10, d: 10 })).toBe(true);
    expect(boxesOverlap(a, { x: 11, z: 0, ang: 0, w: 10, d: 10 })).toBe(false);
    expect(boxesOverlap(a, { x: 11.5, z: 0, ang: Math.PI / 4, w: 10, d: 10 })).toBe(true);
  });
});

describe("roads", () => {
  it("has a highway across the map that can't be removed", () => {
    const city = newCity();
    const segs = [...city.roads.segs.values()];
    expect(segs.length).toBeGreaterThan(3);
    expect(segs.every((s) => s.fixed && s.type === Road.Highway)).toBe(true);
    expect([...city.roads.nodes.values()].filter((n) => n.outside).length).toBe(2);
    expect(city.bulldozeRoad(segs[0])).toBe(false);
  });

  it("joins a new street to the highway and lays out plots along it", () => {
    const city = newCity();
    const s = startSpot(city);
    const before = city.roads.segs.size, money = city.money;
    const r = road(city, s.x, s.z, s.x - s.dz * 150, s.z + s.dx * 150);
    expect(r.ok).toBe(true);
    // The highway was cut in two where the street meets it.
    expect(city.roads.segs.size).toBe(before + 2);
    expect(city.money).toBeLessThan(money);
    expect(city.lots.lots.size).toBeGreaterThan(10);
    const lot = [...city.lots.lots.values()][0];
    expect(city.roads.reachesOutside(city.roads.componentOf(lot.seg))).toBe(true);
  });

  it("makes a crossing where two streets cross, and a curve keeps its plots off the road", () => {
    const city = newCity();
    const s = startSpot(city);
    const ux = -s.dz, uz = s.dx;
    const P = (u: number, v: number) => ({ x: s.x + ux * u + s.dx * v, z: s.z + uz * u + s.dz * v });
    expect(road(city, s.x, s.z, P(160, 0).x, P(160, 0).z).ok).toBe(true);
    const a = P(80, -100), b = P(80, 100);
    expect(road(city, a.x, a.z, b.x, b.z).ok).toBe(true);
    const mid = city.roads.nearestNode(P(80, 0).x, P(80, 0).z, 6)!;
    expect(mid.segs.length).toBe(4);
    const c = P(160, 0), d = P(240, 90), ctrl = P(240, 0);
    expect(road(city, c.x, c.z, d.x, d.z, Road.Street, ctrl).ok).toBe(true);
    for (const lot of city.lots.lots.values()) expect(city.roads.clearOf(lot, 0.5)).toBe(true);
  });

  it("refuses roads that are too short, too sharp or run beside another road", () => {
    const city = newCity();
    const s = startSpot(city);
    const ux = -s.dz, uz = s.dx;
    const P = (u: number, v: number) => ({ x: s.x + ux * u + s.dx * v, z: s.z + uz * u + s.dz * v });
    const plan = (p: { x: number; z: number }, q: { x: number; z: number }, ctrl: { x: number; z: number } | null = null) => city.planRoad(anchorAt(city, p.x, p.z), anchorAt(city, q.x, q.z), ctrl, Road.Street);
    expect(plan(P(50, 0), P(53, 0)).reason).toBe("short");
    expect(plan(P(60, 0), P(60, 40), P(200, 20)).reason).toBe("sharp");
    expect(road(city, s.x, s.z, P(150, 0).x, P(150, 0).z).ok).toBe(true);
    expect(plan(P(40, 5), P(140, 5)).ok).toBe(false);
    expect(plan(P(-2000, 0), P(40, 60)).reason).toBe("outside");
  });

  it("removes a street with its plots, and zoned buildings with it", () => {
    const city = newCity();
    const s = startSpot(city);
    road(city, s.x, s.z, s.x - s.dz * 150, s.z + s.dx * 150);
    for (const lot of city.lots.lots.values()) city.setZone(lot, Zone.ResLow);
    const street = [...city.roads.segs.values()].find((g) => !g.fixed)!;
    expect(city.bulldozeRoad(street)).toBe(true);
    expect([...city.lots.lots.values()].filter((l) => l.seg === street.id).length).toBe(0);
  });
});
