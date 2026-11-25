// A page for looking at the view while developing: builds a test town and shows it.
import { Kind } from "./sim/defs";
import { View } from "./render/view";
import { addWater, buildTown, newCity, placeNear, run, zoneAll } from "../tests/helpers";

const q = new URLSearchParams(location.search);
const city = newCity({ seed: Number(q.get("seed") ?? 7), mode: "chill", size: (q.get("size") as "small") ?? "small" });
const { origin } = buildTown(city, 4, 4);
zoneAll(city);
placeNear(city, Kind.Coal, origin.x, origin.z);
addWater(city, origin);
for (const k of [Kind.School, Kind.Park, Kind.Police, Kind.Fire, Kind.Clinic, Kind.Wind, Kind.BigPark, Kind.Tower]) placeNear(city, k, origin.x + 100, origin.z + 60);
run(city, Number(q.get("days") ?? 6));
const canvas = document.getElementById("view") as HTMLCanvasElement;
const view = new View(canvas, false);
view.setQuality((q.get("q") as "high") ?? "high");
view.setCity(city);
view.resize(innerWidth, innerHeight);
view.focus(origin.x + 80, origin.z + 60, Number(q.get("dist") ?? 380), true);
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
