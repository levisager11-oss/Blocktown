// Milestones, the city score, the high-score lists and the achievements.
import { Kind, MILESTONES, MILESTONE_REWARD, YEAR_DAYS, Zone } from "./defs";
import type { City } from "./city";

export interface Achievement { id: string; icon: string; chill?: boolean; test: (c: City) => boolean }
const pop = (n: number) => (c: City) => c.stats.pop >= n;
const placedAny = (c: City, kinds: Kind[]) => kinds.some((k) => (c.count["placed" + k] ?? 0) > 0);

/** The ids are the ones in toki.json: change both together. In chill mode only the ones marked `chill` count. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-road", icon: "🛣️", chill: true, test: (c) => (c.count.roads ?? 0) >= 1 },
  { id: "first-home", icon: "🏠", chill: true, test: (c) => c.stats.pop >= 1 },
  { id: "power-on", icon: "⚡", chill: true, test: (c) => placedAny(c, [Kind.Wind, Kind.Coal, Kind.Solar, Kind.Nuclear]) },
  { id: "bridge", icon: "🌉", chill: true, test: (c) => (c.count.bridges ?? 0) >= 1 },
  { id: "curves", icon: "➰", chill: true, test: (c) => (c.count.curves ?? 0) >= 10 },
  { id: "green", icon: "🌳", chill: true, test: (c) => [Kind.Park, Kind.Playground, Kind.Plaza, Kind.BigPark].reduce((s, k) => s + (c.count["placed" + k] ?? 0), 0) >= 10 },
  { id: "bus", icon: "🚌", chill: true, test: (c) => (c.count.busLines ?? 0) >= 1 },
  { id: "pop-500", icon: "🏘️", test: pop(500) },
  { id: "pop-2500", icon: "🏙️", test: pop(2500) },
  { id: "pop-10000", icon: "🌆", test: pop(10000) },
  { id: "pop-25000", icon: "🌃", test: pop(25000) },
  { id: "pop-50000", icon: "🌇", test: pop(50000) },
  { id: "pop-100000", icon: "👑", test: pop(100000) },
  { id: "metro", icon: "🚇", test: (c) => (c.count.metroLines ?? 0) >= 1 },
  { id: "riders", icon: "🎫", test: (c) => (c.best.riders ?? 0) >= 2000 },
  { id: "clean", icon: "🍃", test: (c) => c.stats.pop >= 5000 && c.stats.cleanPower >= 0.999 && c.stats.powerMake >= c.stats.powerNeed },
  { id: "happy", icon: "😊", test: (c) => c.stats.pop >= 5000 && c.stats.happy >= 0.9 },
  { id: "flow", icon: "🚦", test: (c) => c.stats.pop >= 20000 && c.stats.flow >= 0.85 },
  { id: "scholar", icon: "🎓", test: (c) => c.stats.pop >= 3000 && c.edu[3] >= 0.25 },
  { id: "rich", icon: "💰", test: (c) => c.money >= 1000000 },
  { id: "debt-free", icon: "🏦", test: (c) => (c.count.loansRepaid ?? 0) >= 1 },
  { id: "firefighters", icon: "🚒", test: (c) => (c.count.firesOut ?? 0) >= 10 },
  { id: "flood", icon: "🌊", test: (c) => c.mode === "hard" && (c.count.floodsSurvived ?? 0) >= 1 },
  { id: "industry", icon: "⚙️", test: (c) => c.stats.rawMake.every((v) => v > 5) },
  { id: "hard-10k", icon: "🔥", test: (c) => c.mode === "hard" && c.stats.pop >= 10000 },
  { id: "year", icon: "📅", test: (c) => c.day >= YEAR_DAYS && c.stats.pop >= 500 },
  { id: "skyline", icon: "🏢", test: (c) => (c.count.towers ?? 0) >= 50 },
];

/** The city score: citizens, with a bonus for happiness, flowing traffic and good schools. */
export function scoreParts(city: City) {
  const st = city.stats;
  const happy = 0.5 + 0.5 * st.happy;
  const traffic = 0.75 + 0.25 * st.flow;
  const school = 0.9 + 0.35 * (city.edu[1] * 0.33 + city.edu[2] * 0.66 + city.edu[3]);
  return { pop: Math.round(st.pop), happy, traffic, school, total: Math.round(st.pop * happy * traffic * school) };
}

export function progress(city: City) {
  const st = city.stats;
  // Milestones: each one unlocks new things and, outside chill mode, pays a reward.
  while (city.milestone < MILESTONES.length - 1 && st.pop >= MILESTONES[city.milestone + 1]) {
    city.milestone++;
    city.reached[city.milestone] = city.hours;
    if (!city.chill) {
      city.money += MILESTONE_REWARD[city.milestone];
      city.emit("note.milestone", "good", { n: city.milestone, reward: MILESTONE_REWARD[city.milestone] });
    }
  }
  st.score = scoreParts(city).total;

  // Tall buildings, for the skyline achievement.
  let towers = 0;
  for (const lot of city.homes) if (lot.kind === Zone.ResHigh && lot.level === 3) towers++;
  for (const lot of city.works) if ((lot.kind === Zone.ComHigh || lot.kind === Zone.Office) && lot.level === 3) towers++;
  city.count.towers = towers;

  const b = city.best;
  b.pop = Math.max(b.pop ?? 0, Math.round(st.pop));
  if (city.ranked) {
    b.score = Math.max(b.score ?? 0, st.score);
    city.onScore("", st.score);
    city.onScore("population", Math.round(st.pop));
    if (city.mode === "hard") city.onScore("hard", st.score);
    if (st.pop >= 5000) city.onScore("happiest", Math.round(st.happy * 1000));
    if (city.money > 0) city.onScore("richest", Math.round(city.money));
    if (st.pop >= 10000 && !city.count.t10k) {
      city.count.t10k = Math.round(city.simTime);
      city.onScore("fast10k", Math.round(city.simTime * 1000));
    }
  }
  for (const a of ACHIEVEMENTS) {
    if (city.count["got." + a.id]) continue;
    if (city.chill ? !a.chill : city.over) continue;
    if (!a.test(city)) continue;
    city.count["got." + a.id] = 1;
    city.onAchievement(a.id);
  }
}
