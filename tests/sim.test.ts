import { describe, expect, it } from "vitest";
import { Kind } from "../src/sim/defs";
import { deserialize, serialize } from "../src/sim/save";
import { addWater, buildTown, newCity, placeNear, run, zoneAll } from "./helpers";

describe("a small town", () => {
  it("grows when it has roads, zones and power", () => {
    const city = newCity({ mode: "normal" });
    const { failed, origin } = buildTown(city);
    expect(failed.length).toBeLessThan(4);
    const zoned = zoneAll(city);
    expect(zoned).toBeGreaterThan(40);
    expect(placeNear(city, Kind.Coal, origin.x, origin.z)).toBe(true);
    for (let d = 1; d <= 12; d++) {
      run(city, 1);
      if (d === 2) addWater(city, origin);
    }
    expect(city.stats.pop).toBeGreaterThan(100);
    const text = serialize(city);
    expect(text.length).toBeLessThan(20000);
    const again = deserialize(text);
    expect(Math.abs(again.stats.pop - city.stats.pop)).toBeLessThan(city.stats.pop * 0.1 + 5);
    expect(again.roads.segs.size).toBe(city.roads.segs.size);
  });
});

describe("saving", () => {
  it("brings back roads, zones, buildings, money and bus lines", () => {
    const city = newCity({ mode: "normal" });
    const { origin } = buildTown(city);
    zoneAll(city);
    placeNear(city, Kind.Coal, origin.x, origin.z);
    run(city, 2);
    const hit = [...city.roads.segs.values()].filter((s) => !s.fixed);
    const stop = (i: number) => ({ x: hit[i].px[2], z: hit[i].pz[2], seg: hit[i].id, s: hit[i].cum[2] });
    city.count.busLines = 0;
    city.transit.lines.push({ id: 1, metro: false, stops: [stop(0), stop(5), stop(9)], vehicles: 2, color: 0xff0000, riders: 12, today: 0, dead: false });
    city.taxes.r = 12;
    const again = deserialize(serialize(city));
    expect(again.name).toBe(city.name);
    expect(again.taxes.r).toBe(12);
    expect(Math.round(again.money)).toBe(Math.round(city.money));
    expect(again.transit.lines.length).toBe(1);
    expect(again.transit.lines[0].stops.length).toBe(3);
    const zoned = (c: typeof city) => [...c.lots.lots.values()].filter((l) => l.zone).length;
    const built = (c: typeof city) => [...c.lots.lots.values()].filter((l) => l.kind).length;
    expect(zoned(again)).toBe(zoned(city));
    expect(built(again)).toBe(built(city));
    // A loaded city keeps running.
    run(again, 1);
    expect(again.stats.pop).toBeGreaterThan(50);
  });
});

describe("modes", () => {
  it("chill mode has everything unlocked and never charges", () => {
    const city = newCity({ mode: "chill" });
    expect(city.unlocked(12)).toBe(true);
    expect(city.spend(1e9)).toBe(true);
    expect(city.ranked).toBe(false);
  });
  it("normal mode starts with only the basics and unlocks more at milestones", () => {
    const city = newCity({ mode: "normal" });
    expect(city.unlocked(1)).toBe(false);
    const { origin } = buildTown(city);
    zoneAll(city);
    placeNear(city, Kind.Coal, origin.x, origin.z);
    const money = city.money;
    run(city, 3);
    expect(city.milestone).toBeGreaterThanOrEqual(1);
    expect(city.unlocked(1)).toBe(true);
    // The reward for the milestone and the taxes came in.
    expect(city.money).toBeGreaterThan(money);
  });
});
