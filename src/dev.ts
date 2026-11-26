// A page for looking at the view while developing: builds a test town and shows it.
import { Kind, Road } from "./sim/defs";
import { View } from "./render/view";
import { Bot } from "../tests/bot";
import { addWater, buildTown, newCity, placeNear, road, run, startSpot, zoneAll } from "../tests/helpers";

const q = new URLSearchParams(location.search);
const city = newCity({ seed: Number(q.get("seed") ?? 7), mode: (q.get("mode") as "chill") ?? "chill", size: (q.get("size") as "small") ?? "small" });
let origin = { x: 0, z: 0 };
if (q.get("roads")) {
  // The new roads side by side: avenues with lights, a roundabout, one-way streets, a tram line.
  const s = startSpot(city, 300);
  const ux = -s.dz, uz = s.dx, vx = s.dx, vz = s.dz;
  const P = (u: number, v: number) => ({ x: s.x + ux * u + vx * v, z: s.z + uz * u + vz * v });
  const R = (a: number[], b: number[], t: Road) => { const p = P(a[0], a[1]), e = P(b[0], b[1]); return road(city, p.x, p.z, e.x, e.z, t); };
  R([0, 0], [40, 0], Road.Avenue);
  R([40, -120], [40, 120], Road.Avenue);
  R([40, 0], [200, 0], Road.Avenue);
  R([120, -120], [120, 120], Road.TramAvenue);
  R([200, -120], [200, 120], Road.Street);
  R([40, -120], [200, -120], Road.OneWay);
  R([200, 120], [40, 120], Road.OneWay);
  R([40, 60], [200, 60], Road.Street);
  const node = city.roads.nearestNode(P(200, 60).x, P(200, 60).z, 10);
  if (node) city.buildRoundabout(node.id);
  zoneAll(city);
  placeNear(city, Kind.Coal, P(0, 60).x, P(0, 60).z);
  placeNear(city, Kind.TramDepot, P(140, 90).x, P(140, 90).z);
  run(city, 1);
  const tram = [...city.roads.segs.values()].filter((g) => g.type === Road.TramAvenue);
  if (tram.length > 1) city.transit.addLine(false, [tram[0], tram[tram.length - 1]].map((g) => ({ x: g.px[2], z: g.pz[2], seg: g.id, s: g.cum[2] })), true);
  run(city, Number(q.get("days") ?? 3));
  origin = P(120, 0);
} else if (q.get("gallery")) {
  // Every landmark next to a small town, to look at the models.
  origin = buildTown(city, 4, 4).origin;
  zoneAll(city);
  const kinds = [Kind.Monument, Kind.CityHall, Kind.Ferris, Kind.TvTower, Kind.Cathedral, Kind.Opera, Kind.Spire, Kind.TramDepot, Kind.Harbour, Kind.Airport, Kind.Space];
  kinds.forEach((k, i) => placeNear(city, k, origin.x + 60 + (i % 4) * 70, origin.z + 40 + Math.floor(i / 4) * 80));
  placeNear(city, Kind.Coal, origin.x, origin.z);
  run(city, Number(q.get("days") ?? 2));
} else if (q.get("bot")) {
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
