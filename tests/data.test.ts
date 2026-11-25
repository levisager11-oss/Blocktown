import { describe, expect, it } from "vitest";
import toki from "../toki.json";
import { PLACE, ROADS, ZONES } from "../src/sim/defs";
import { ACHIEVEMENTS } from "../src/sim/progress";
import { blueprint } from "../src/render/blueprints";
import { de } from "../src/ui/texts.de";
import { en } from "../src/ui/texts.en";

const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");

describe("texts", () => {
  it("has every text in English and German, with the same blanks to fill in", () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) expect(holes(de[k]), k).toBe(holes(en[k]));
  });
  it("writes German the Swiss way: ss, no sharp s", () => {
    for (const k of Object.keys(de)) expect(de[k].includes("ß"), k).toBe(false);
  });
  it("names and describes everything that can be built", () => {
    for (const p of PLACE) { expect(en["b." + p.key], p.key).toBeTruthy(); expect(en["bd." + p.key], p.key).toBeTruthy(); }
    for (const z of ZONES) expect(en["z." + z.key], z.key).toBeTruthy();
    for (const r of ROADS) expect(en["r." + r.key], r.key).toBeTruthy();
  });
});

describe("Toki settings", () => {
  it("lists exactly the achievements the game can give", () => {
    expect(toki.achievements.map((a) => a.id).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
    expect(toki.achievements.length).toBeLessThanOrEqual(30);
    for (const a of toki.achievements) {
      expect(a.name.length, a.id).toBeLessThanOrEqual(40);
      expect(a.name_de.length, a.id).toBeLessThanOrEqual(40);
      expect(a.description.length, a.id).toBeLessThanOrEqual(120);
      expect(a.description_de.length, a.id).toBeLessThanOrEqual(120);
    }
  });
  it("has the high-score lists the game sends to", () => {
    const ids = toki.boards.map((b) => b.id);
    for (const id of ["", "population", "hard", "happiest", "richest", "fast10k"]) expect(ids).toContain(id);
    expect(toki.boards.length).toBeLessThanOrEqual(11);
    for (const b of toki.boards) expect(b.name.length).toBeLessThanOrEqual(40);
  });
});

describe("building models", () => {
  it("has a model for every building, inside its plot", () => {
    const check = (kind: number, level: number, w: number, d: number) => {
      for (const variant of [0, 77, 200]) {
        const parts = blueprint(kind, level, variant, w, d);
        expect(parts.length, "kind " + kind).toBeGreaterThanOrEqual(3);
        for (const p of parts) {
          expect(Math.abs(p.x) <= w / 2 + 0.01 && Math.abs(p.z) <= d / 2 + 0.01, `kind ${kind} part outside`).toBe(true);
          expect(p.y).toBeGreaterThanOrEqual(-0.01);
        }
      }
    };
    for (let z = 1; z < ZONES.length; z++) for (let level = 1; level <= ZONES[z].levels; level++) check(z, level, 14, 16);
    for (const p of PLACE) check(p.kind, 1, p.w, p.d);
  });
});
