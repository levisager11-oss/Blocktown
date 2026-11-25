import { describe, expect, it } from "vitest";
import { Kind } from "../src/sim/defs";
import { deserialize, serialize } from "../src/sim/save";
import { addWater, buildTown, newCity, placeNear, run, zoneAll } from "./helpers";

describe("a small town", () => {
  it("grows when it has roads, zones and power", () => {
    const city = newCity({ mode: "normal" });
    const { failed, origin } = buildTown(city);
    console.log("failed roads", failed, "segs", city.roads.segs.size, "lots", city.lots.lots.size);
    expect(failed.length).toBeLessThan(4);
    const zoned = zoneAll(city);
    expect(zoned).toBeGreaterThan(40);
    expect(placeNear(city, Kind.Coal, origin.x, origin.z)).toBe(true);
    for (let d = 1; d <= 12; d++) {
      run(city, 1);
      if (d === 2) console.log("water", addWater(city, origin));
      const s = city.stats;
      console.log(`day ${d}: pop ${s.pop.toFixed(0)} homes ${s.homes} jobs ${s.jobs.toFixed(0)} money ${city.money.toFixed(0)} net ${s.net.toFixed(0)} happy ${s.happy.toFixed(2)} dem ${city.demand.r.toFixed(2)}/${city.demand.c.toFixed(2)}/${city.demand.i.toFixed(2)} cars ${city.traffic.agents.length} flow ${city.traffic.flow.toFixed(2)} ms ${city.milestone} prob ${s.problems}`);
    }
    expect(city.stats.pop).toBeGreaterThan(100);
    const text = serialize(city);
    console.log("save bytes", text.length);
    const again = deserialize(text);
    expect(Math.abs(again.stats.pop - city.stats.pop)).toBeLessThan(city.stats.pop * 0.1 + 5);
    expect(again.roads.segs.size).toBe(city.roads.segs.size);
  });
});
