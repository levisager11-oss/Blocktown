import { describe, expect, it } from "vitest";
import { serialize } from "../src/sim/save";
import { Bot } from "./bot";
import { newCity } from "./helpers";

describe("a city run by the automatic mayor", () => {
  it("grows for a hundred days without going broke, with traffic that keeps moving", () => {
    const city = newCity({ seed: 7, size: "medium", mode: "normal" });
    const bot = new Bot(city);
    bot.play(100);
    // Set SHOW=1 to see how the city did every ten days.
    if (process.env.SHOW) console.table(bot.log);
    expect(city.stats.pop).toBeGreaterThan(1200);
    expect(city.money).toBeGreaterThan(-5000);
    expect(city.milestone).toBeGreaterThanOrEqual(3);
    expect(city.stats.flow).toBeGreaterThan(0.6);
    // A city of this size is a small save.
    expect(serialize(city).length).toBeLessThan(60000);
  }, 300000);
});
