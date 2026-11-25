// A page for looking at the view while developing: builds a test town and shows it.
import { Kind } from "./sim/defs";
import { View } from "./render/view";
import { Bot } from "../tests/bot";
import { addWater, buildTown, newCity, placeNear, run, zoneAll } from "../tests/helpers";

const q = new URLSearchParams(location.search);
const city = newCity({ seed: Number(q.get("seed") ?? 7), mode: (q.get("mode") as "chill") ?? "chill", size: (q.get("size") as "small") ?? "small" });
let origin = { x: 0, z: 0 };
if (q.get("bot")) {
  // Let the automatic mayor grow a city for a while.
  const bot = new Bot(city);
  bot.play(Number(q.get("bot")));
  // Look at the middle of what was built.
  let x = 0, z = 0, n = 0;
  for (const lot of city.lots.lots.values()) if (lot.kind && city.terrain.heightAt(lot.x, lot.z) > 1) { x += lot.x; z += lot.z; n++; }
  origin = n ? { x: x / n + Number(q.get("dx") ?? 0), z: z / n + Number(q.get("dz") ?? 0) } : bot.P(0, 0);
} else {
  origin = buildTown(city, 4, 4).origin;
  zoneAll(city);
  placeNear(city, Kind.Coal, origin.x, origin.z);
  addWater(city, origin);
  for (const k of [Kind.School, Kind.Park, Kind.Police, Kind.Fire, Kind.Clinic, Kind.Wind, Kind.BigPark, Kind.Tower]) placeNear(city, k, origin.x + 100, origin.z + 60);
  run(city, Number(q.get("days") ?? 6));
}
const canvas = document.getElementById("view") as HTMLCanvasElement;
const view = new View(canvas, false);
view.setQuality((q.get("q") as "high") ?? "high");
view.setCity(city);
view.resize(innerWidth, innerHeight);
view.focus(origin.x + (q.get("bot") ? 0 : 80), origin.z + (q.get("bot") ? 0 : 60), Number(q.get("dist") ?? 380), true);
view.cam.yaw = view.goal.yaw = Number(q.get("yaw") ?? 0.7);
view.cam.pitch = view.goal.pitch = Number(q.get("pitch") ?? 0.75);
if (q.get("hour")) city.hours = Math.floor(city.hours / 24) * 24 + Number(q.get("hour"));
if (q.get("info")) view.infoView = q.get("info") as "value";
let last = performance.now();
let frames = 0;
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!q.get("freeze")) city.step(dt);
  view.frame(dt);
  frames++;
  (window as unknown as { frames: number }).frames = frames;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
(window as unknown as { city: unknown; view: unknown }).city = city;
(window as unknown as { city: unknown; view: unknown }).view = view;
