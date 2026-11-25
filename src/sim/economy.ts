// The city's inner workings, worked out once a game hour: power and water, who lives and works where,
// how happy people are, what gets built next, and the money.
import { BUDGET_CATS, BUS, Kind, METRO, PLACE_BY_KIND, ROADS, SERVICE_JOB_MIX, ZONES, Zone, jobMix } from "./defs";
import type { City } from "./city";
import { LF, Lot, isZoned } from "./lots";
import { clamp, clamp01 } from "./util";

/** A fixed number from 0 to 1 per plot, so the same houses lose power first every time. */
const pick = (id: number) => ((Math.imul(id, 2654435761) >>> 0) % 10007) / 10007;
const LEVEL_TAX = [1, 1.22, 1.5];

interface Net { pMake: number; pNeed: number; wMake: number; wNeed: number; sCap: number; sNeed: number; out: boolean }

/** Power, water and sewers run along the roads: every connected road network shares what its plants make. */
export function utilities(city: City) {
  const nets = new Map<number, Net>();
  const net = (c: number) => {
    let n = nets.get(c);
    if (!n) { n = { pMake: 0, pNeed: 0, wMake: 0, wNeed: 0, sCap: 0, sNeed: 0, out: city.roads.reachesOutside(c) }; nets.set(c, n); }
    return n;
  };
  const W = city.weather, st = city.stats;
  const lots = city.lots.lots;
  const waterOn = city.active("water");
  let clean = 0, dirty = 0;

  for (const lot of lots.values()) {
    if (!lot.kind || lot.built < 1) continue;
    const comp = lot.seg ? city.roads.componentOf(lot.seg) : 0;
    lot.flags &= ~(LF.Power | LF.Water | LF.Sewage | LF.Road);
    if (!comp) continue;
    const n = net(comp);
    if (lot.flags & (LF.Abandoned | LF.Burnt | LF.Fire | LF.Flooded)) { if (!isZoned(lot) || n.out) lot.flags |= LF.Road; continue; }
    if (isZoned(lot)) {
      if (n.out) lot.flags |= LF.Road;
      const z = ZONES[lot.kind], use = 0.35 + 0.65 * lot.occ;
      n.pNeed += z.power[lot.level - 1] * use * W.powerNeed;
      n.wNeed += z.water[lot.level - 1] * use * W.waterNeed;
      n.sNeed += z.water[lot.level - 1] * use;
    } else {
      lot.flags |= LF.Road;
      const def = PLACE_BY_KIND.get(lot.kind);
      if (!def) continue;
      n.pNeed += def.power ?? 0;
      n.wNeed += def.water ?? 0;
      n.sNeed += def.water ?? 0;
      if (def.makesPower) {
        const weather = def.kind === Kind.Wind ? W.windPower : def.kind === Kind.Solar ? W.sunPower : 1;
        const made = def.makesPower * city.budgetPower(def.cat) * weather;
        n.pMake += made;
        if (def.kind === Kind.Coal || def.kind === Kind.Incinerator) dirty += made; else clean += made;
      }
    }
  }
  // Power first: pumps without power deliver less water.
  for (const lot of lots.values()) {
    if (!lot.kind || lot.built < 1 || !lot.seg) continue;
    const n = nets.get(city.roads.componentOf(lot.seg));
    if (!n) continue;
    if (n.pMake >= n.pNeed || pick(lot.id) < n.pMake / (n.pNeed || 1)) lot.flags |= LF.Power;
    if (isZoned(lot)) continue;
    const def = PLACE_BY_KIND.get(lot.kind);
    if (!def || lot.flags & (LF.Fire | LF.Burnt)) continue;
    const strength = city.budgetPower(def.cat) * (lot.flags & LF.Power ? 1 : 0.25);
    if (def.makesWater) n.wMake += def.makesWater * strength * (def.kind === Kind.Pump ? W.pumpPower : 1);
    if (def.sewage) n.sCap += def.sewage * strength;
  }
  st.powerMake = st.powerNeed = st.waterMake = st.waterNeed = st.sewageCap = st.sewageNeed = 0;
  for (const n of nets.values()) {
    st.powerMake += n.pMake; st.powerNeed += n.pNeed; st.waterMake += n.wMake; st.waterNeed += n.wNeed;
    st.sewageCap += n.sCap; st.sewageNeed += n.sNeed;
  }
  st.cleanPower = clean + dirty > 0 ? clean / (clean + dirty) : 0;
  for (const lot of lots.values()) {
    if (!lot.kind || lot.built < 1 || !lot.seg) continue;
    const n = nets.get(city.roads.componentOf(lot.seg));
    if (!n) continue;
    const r = pick(lot.id + 7919);
    if (!waterOn || n.wMake >= n.wNeed || r < n.wMake / (n.wNeed || 1)) lot.flags |= LF.Water;
    if (!waterOn || n.sCap >= n.sNeed || r < n.sCap / (n.sNeed || 1)) lot.flags |= LF.Sewage;
  }
}

/** Is a zoned building in working order? */
function runs(city: City, lot: Lot, waterOn: boolean): boolean {
  const f = lot.flags;
  if (f & (LF.Abandoned | LF.Fire | LF.Burnt | LF.Flooded)) return false;
  return !!(f & LF.Road) && !!(f & LF.Power) && (!waterOn || !!(f & LF.Water));
}
/** How full a home gets: people move out bit by bit when power or water is missing. */
function homeFill(lot: Lot, waterOn: boolean): number {
  const f = lot.flags;
  if (f & (LF.Abandoned | LF.Fire | LF.Burnt | LF.Flooded) || !(f & LF.Road)) return 0;
  return (f & LF.Power ? 1 : 0.35) * (!waterOn || f & LF.Water ? 1 : 0.5);
}

/** Counts people and jobs, matches workers to jobs by schooling, and works out how happy every home is. */
export function census(city: City) {
  const st = city.stats, maps = city.maps, lots = city.lots.lots;
  const waterOn = city.active("water");
  const J = [0, 0, 0, 0];
  let pop = 0, homes = 0, buildings = 0, problems = 0, blocked = 0, landSum = 0, landN = 0;
  let cCap = 0, iCap = 0, oCap = 0, sJobs = 0;
  city.homes.length = city.works.length = city.shops.length = city.factories.length = city.raws.length = 0;
  let beds = 0, garbageCap = 0;
  const seats = [0, 0, 0];

  for (const lot of lots.values()) {
    if (!lot.kind || lot.built < 1) continue;
    buildings++;
    if (city.problem(lot)) problems++;
    if (isZoned(lot)) {
      const z = ZONES[lot.kind], cap = z.cap[lot.level - 1];
      const ok = runs(city, lot, waterOn);
      if (!ok) blocked++;
      lot.value = maps.at("value", lot.x, lot.z);
      landSum += lot.value; landN++;
      if (z.group === "r") {
        homes += cap;
        lot.occ += (homeFill(lot, waterOn) - lot.occ) * (ok ? 0.3 : 0.08);
        if (lot.occ < 0.02) lot.occ = 0;
        pop += cap * lot.occ;
        if (lot.occ > 0.1) city.homes.push(lot);
      } else if (ok) {
        const mix = jobMix(lot.kind, lot.level);
        for (let e = 0; e < 4; e++) J[e] += cap * mix[e];
        if (z.group === "c") { cCap += cap; city.shops.push(lot); }
        else if (z.group === "o") oCap += cap;
        else { iCap += cap; (lot.kind === Zone.Industry ? city.factories : city.raws).push(lot); }
        city.works.push(lot);
      }
    } else {
      const def = PLACE_BY_KIND.get(lot.kind);
      if (!def) continue;
      const strength = city.serviceStrength(lot);
      if (strength > 0) {
        for (let e = 0; e < 4; e++) J[e] += def.jobs * SERVICE_JOB_MIX[e];
        sJobs += def.jobs;
        if (def.jobs > 3) city.works.push(lot);
        if (def.beds) beds += def.beds * strength;
        if (def.garbage) garbageCap += def.garbage * strength;
        if (def.seats) seats[def.kind === Kind.School ? 0 : def.kind === Kind.HighSchool ? 1 : 2] += def.seats * strength;
      }
    }
  }

  // Workers take the jobs that fit their schooling; whoever is left over fills harder jobs, but does them less well.
  const workers = pop * 0.5;
  const filled = [0, 0, 0, 0], under = [0, 0, 0, 0];
  let carry = 0;
  for (let e = 3; e >= 0; e--) {
    const avail = workers * city.edu[e] + carry;
    filled[e] = Math.min(avail, J[e]);
    carry = avail - filled[e];
  }
  for (let e = 1; e < 4; e++) {
    under[e] = Math.min(carry, J[e] - filled[e]);
    carry -= under[e];
  }
  const emp = [1, 1, 1, 1], quality = [1, 1, 1, 1];
  let jobs = 0, taken = 0;
  for (let e = 0; e < 4; e++) {
    jobs += J[e];
    taken += filled[e] + under[e];
    if (J[e] > 0.01) {
      emp[e] = (filled[e] + under[e]) / J[e];
      quality[e] = (filled[e] + under[e] * 0.6) / J[e];
    }
  }
  const unemployment = workers > 1 ? clamp01(carry / workers) : 0;
  const customers = clamp(pop * 0.135 / Math.max(1, cCap), 0.35, 1);

  let cJobs = 0, iJobs = 0, oJobs = 0;
  for (const lot of city.works) {
    if (!isZoned(lot)) { lot.eff = SERVICE_JOB_MIX.reduce((s, m, e) => s + m * quality[e], 0); continue; }
    const z = ZONES[lot.kind], mix = jobMix(lot.kind, lot.level);
    let target = 0, q = 0;
    for (let e = 0; e < 4; e++) { target += mix[e] * emp[e]; q += mix[e] * quality[e]; }
    lot.occ += (target - lot.occ) * 0.3;
    lot.eff = q * (z.group === "c" ? customers : 1) * (0.5 + 0.5 * lot.access);
    const n = z.cap[lot.level - 1] * lot.occ;
    if (z.group === "c") cJobs += n; else if (z.group === "o") oJobs += n; else iJobs += n;
  }
  // Workplaces that don't run empty out.
  for (const lot of lots.values()) {
    if (isZoned(lot) && lot.built >= 1 && ZONES[lot.kind].group !== "r" && lot.occ > 0 && !runs(city, lot, waterOn)) lot.occ *= 0.6;
  }

  // Schools: how many children find a seat decides how well schooled the grown-ups become.
  const students = [pop * 0.1, pop * 0.06, pop * 0.045];
  const enrol = students.map((s, i) => (s > 1 ? clamp01(seats[i] / s) : seats[i] > 0 ? 1 : 0));
  const a = enrol[0], b = a * enrol[1], c = b * enrol[2];
  const t3 = 0.3 * c, t2 = 0.42 * b, t1 = Math.max(0, 0.9 * a - t2 - t3);
  const target = [1 - t1 - t2 - t3, t1, t2, t3];
  for (let e = 0; e < 4; e++) city.edu[e] += (target[e] - city.edu[e]) * 0.006;

  const garbageNeed = pop * 0.012 + jobs * 0.006;
  const garbageOk = garbageNeed > 0.5 ? clamp01(garbageCap / garbageNeed) : 1;
  const healthCap = pop > 1 ? clamp01(beds / pop) : 1;

  // How happy each home is.
  const act = { health: city.active("health"), safety: city.active("safety"), edu: city.active("edu"), garbage: city.active("garbage") };
  const parks = city.unlocked(1);
  const soft = city.chill ? 0.6 : 1;
  const jobsOk = 1 - clamp01(unemployment * 6);
  const shopsOk = pop > 60 ? clamp01(cCap / (pop * 0.1 + 1)) : 1;
  const taxPain = city.taxes.r > 9 ? (city.taxes.r - 9) * 0.02 : (city.taxes.r - 9) * 0.008;
  let happySum = 0, happyN = 0;
  for (const lot of city.homes) {
    let h = 0.42;
    h += 0.1 * (act.health ? maps.at("health", lot.x, lot.z) * healthCap : 0.6);
    h += 0.07 * (act.safety ? maps.at("police", lot.x, lot.z) : 0.6);
    h += 0.05 * (act.safety ? maps.at("fire", lot.x, lot.z) : 0.6);
    h += 0.07 * (act.edu ? Math.max(maps.at("school", lot.x, lot.z), maps.at("high", lot.x, lot.z)) : 0.6);
    h += 0.13 * (parks ? maps.at("charm", lot.x, lot.z) : 0.5);
    h += 0.08 * jobsOk + 0.06 * shopsOk + 0.08 * clamp01((lot.access - 0.3) / 0.7);
    let bad = 0.3 * maps.at("pollution", lot.x, lot.z) + 0.1 * maps.at("noise", lot.x, lot.z);
    if (act.garbage) bad += 0.12 * (1 - garbageOk);
    if (waterOn && !(lot.flags & LF.Sewage)) bad += 0.15;
    if (!(lot.flags & LF.Power)) bad += 0.2;
    bad += Math.max(0, taxPain);
    h = clamp01(h - bad * soft - Math.min(0, taxPain));
    lot.happy += (h - lot.happy) * 0.3;
    const n = ZONES[lot.kind].cap[lot.level - 1] * lot.occ;
    happySum += lot.happy * n;
    happyN += n;
  }

  st.pop = pop; st.homes = homes; st.workers = workers; st.jobs = jobs; st.filled = taken; st.unemployment = unemployment;
  st.happy = happyN > 0 ? happySum / happyN : 0.7;
  st.cJobs = cJobs; st.iJobs = iJobs; st.oJobs = oJobs; st.sJobs = sJobs; st.cCap = cCap; st.iCap = iCap; st.oCap = oCap;
  st.buildings = buildings; st.problems = problems; st.blocked = blocked;
  st.students = students; st.seats = seats; st.beds = beds; st.garbageCap = garbageCap; st.garbageNeed = garbageNeed;
  st.quality = quality; st.land = landN ? landSum / landN : 0.3;
  st.flow = city.traffic.flow; st.cars = city.traffic.agents.length;

  // Goods: farms, forests, mines and oil fields feed the factories, the factories feed the shops.
  const rawMake = [0, 0, 0, 0];
  for (const lot of city.raws) rawMake[lot.kind - Zone.Farm] += ZONES[lot.kind].cap[0] * lot.occ * lot.eff * 2.2;
  const rawNeed = [0.3, 0.2, 0.25, 0.25].map((share) => iJobsOf(city) * 0.9 * share);
  st.rawMake = rawMake; st.rawNeed = rawNeed;
  st.goodsMake = city.factories.reduce((s, l) => s + ZONES[l.kind].cap[l.level - 1] * l.occ * l.eff * 1.1, 0);
  st.goodsNeed = cJobs * 1.25;
}
const iJobsOf = (city: City) => city.factories.reduce((s, l) => s + ZONES[l.kind].cap[l.level - 1] * l.occ, 0);

/** How much the city wants more homes, shops, industry and offices: -1 to 1. */
export function demand(city: City) {
  const st = city.stats, t = city.taxes;
  const pain = (tax: number) => (tax - 9) * 0.05;
  const pop = st.pop, workers = st.workers;
  // Homes are wanted when there are free jobs and people like it here.
  let r = clamp((st.jobs - workers) / Math.max(40, workers * 0.25), -1, 1) * 0.75 + (st.happy - 0.5) * 0.7 + 0.1 - pain(t.r);
  if (pop < 160) r = Math.max(r, 0.65);
  // Homes that are built but not lived in yet: no need for more.
  if (st.homes > 60 && pop < st.homes * 0.55) r = Math.min(r, -0.05);
  const cWant = pop * 0.135;
  const c = clamp((cWant - st.cCap) / Math.max(18, cWant * 0.3), -1, 1) - pain(t.c);
  const officeShare = city.unlocked(ZONES[Zone.Office].unlock) ? clamp((city.edu[2] + city.edu[3]) * 1.1, 0.08, 0.6) : 0;
  const otherWant = Math.max(0, workers * 1.06 - Math.min(cWant, st.cCap + 20) - st.sJobs);
  const iWant = otherWant * (1 - officeShare), oWant = otherWant * officeShare;
  const i = clamp((iWant - st.iCap) / Math.max(30, iWant * 0.3), -1, 1) - pain(t.i);
  const o = officeShare > 0 ? clamp((oWant - st.oCap) / Math.max(30, oWant * 0.3), -1, 1) - pain(t.o) : -1;
  const d = city.demand, k = 0.35;
  d.r += (clamp(r, -1, 1) - d.r) * k;
  d.c += (clamp(c, -1, 1) - d.c) * k;
  d.i += (clamp(i, -1, 1) - d.i) * k;
  d.o += (clamp(o, -1, 1) - d.o) * k;
}

/** Taxes in, upkeep out. */
export function budget(city: City) {
  const st = city.stats, rules = city.modeRules(), t = city.taxes;
  const inc: Record<string, number> = { r: 0, c: 0, i: 0, o: 0, fares: 0, trade: 0 };
  const exp: Record<string, number> = { roads: 0, loans: 0 };
  for (const cat of BUDGET_CATS) exp[cat] = 0;

  // Factories earn more with materials from the city's own land, shops with goods from its own factories.
  const rawNeedSum = st.rawNeed.reduce((s, v) => s + v, 0);
  let rawLocal = 0, rawExtra = 0;
  for (let k = 0; k < 4; k++) { rawLocal += Math.min(st.rawMake[k], st.rawNeed[k]); rawExtra += Math.max(0, st.rawMake[k] - st.rawNeed[k]); }
  const rawShare = rawNeedSum > 1 ? rawLocal / rawNeedSum : 0;
  const goodsShare = st.goodsNeed > 1 ? clamp01(st.goodsMake / st.goodsNeed) : 0;
  const goodsExtra = Math.max(0, st.goodsMake - st.goodsNeed);
  st.exports = rawExtra + goodsExtra;
  st.imports = rawNeedSum - rawLocal + Math.max(0, st.goodsNeed - st.goodsMake);
  inc.trade = rawExtra * 0.9 + goodsExtra * 0.45;
  city.count.exported = (city.count.exported ?? 0) + st.exports / 24;

  for (const lot of city.lots.lots.values()) {
    if (!lot.kind || lot.built < 1) continue;
    if (isZoned(lot)) {
      if (lot.occ <= 0) continue;
      const z = ZONES[lot.kind], n = z.cap[lot.level - 1] * lot.occ, lv = LEVEL_TAX[lot.level - 1];
      if (z.group === "r") inc.r += n * z.tax * lv * (t.r / 9);
      else if (z.group === "c") inc.c += n * z.tax * lv * lot.eff * (t.c / 9) * (0.82 + 0.18 * goodsShare);
      else if (z.group === "o") inc.o += n * z.tax * lv * lot.eff * (t.o / 9);
      else inc.i += n * z.tax * lv * lot.eff * (t.i / 9) * (lot.kind === Zone.Industry ? 0.8 + 0.2 * rawShare : 1);
    } else {
      const def = PLACE_BY_KIND.get(lot.kind);
      if (def) exp[def.cat] += def.upkeep * city.budget[def.cat];
    }
  }
  for (const seg of city.roads.segs.values()) if (!seg.fixed) exp.roads += seg.len * ROADS[seg.type].upkeep * (seg.bridgeLen > 6 ? 1.8 : 1);
  for (const line of city.transit.lines) {
    const p = line.metro ? METRO : BUS;
    exp.transit += line.vehicles * (line.metro ? METRO.trainUpkeep : BUS.busUpkeep) * city.budget.transit;
    inc.fares += line.riders * p.fare;
  }
  for (const loan of city.loans) exp.loans += loan.perDay;

  let income = 0, expense = 0;
  for (const k in inc) { inc[k] *= rules.income; income += inc[k]; }
  for (const k in exp) { if (k !== "loans") exp[k] *= rules.costs || 1; expense += exp[k]; }
  st.income = inc; st.expense = exp; st.net = income - expense;
  if (city.chill) return;
  city.money += st.net / 24;
  for (let i = city.loans.length - 1; i >= 0; i--) {
    const loan = city.loans[i];
    loan.left -= loan.perDay / 24;
    if (loan.left <= 0.5) { city.loans.splice(i, 1); city.bump("loansRepaid"); city.emit("note.loanPaid", "good"); }
  }
  // Out of money.
  if (city.money < 0) {
    city.count.broke = (city.count.broke ?? 0) + 1;
    if (city.count.broke === 1) city.emit("note.broke", "bad");
    if (city.mode === "hard" && city.money < -25000 && !city.over) { city.over = true; city.emit("note.bankrupt", "bad"); }
  } else city.count.broke = 0;
}

/** Buildings that stand in trouble for too long are given up; good ones grow to the next level. */
export function decay(city: City) {
  const rules = city.modeRules();
  const waterOn = city.active("water");
  const lots = city.lots.lots;
  const d = city.demand;
  const dem = (lot: Lot) => (ZONES[lot.kind].group === "r" ? d.r : ZONES[lot.kind].group === "c" ? d.c : ZONES[lot.kind].group === "o" ? d.o : d.i);
  const limit = city.mode === "hard" ? 40 : 66;
  for (const lot of lots.values()) {
    if (!isZoned(lot) || lot.built < 1) continue;
    const f = lot.flags;
    if (f & (LF.Fire | LF.Flooded)) continue;
    if (f & (LF.Abandoned | LF.Burnt)) {
      lot.trouble++;
      const want = dem(lot);
      // People come back when things are fine again; otherwise the ruin is cleared after a few days.
      if (f & LF.Abandoned && want > 0.12 && f & LF.Road && f & LF.Power && Math.random() < 0.05) { lot.flags &= ~LF.Abandoned; lot.trouble = 0; }
      else if (lot.trouble > 110) city.clearBuilding(lot);
      continue;
    }
    if (!rules.abandon) continue;
    const z = ZONES[lot.kind];
    const lacking = !(f & LF.Road) || !(f & LF.Power) || (waterOn && !(f & LF.Water)) || (z.group === "r" && lot.happy < 0.22);
    if (lacking) lot.trouble += 1; else if (lot.trouble > 0) lot.trouble = Math.max(0, lot.trouble - 2);
    const want = dem(lot);
    const leaving = want < -0.4 && Math.random() < (-want - 0.4) * 0.012;
    if (lot.trouble > limit || leaving) {
      lot.flags |= LF.Abandoned;
      lot.trouble = 0;
      lot.occ = 0;
      city.bump("abandoned");
    }
  }

  // A few buildings at a time get the chance to become better.
  const all = [...city.homes, ...city.works];
  const tries = Math.min(40, Math.max(2, Math.ceil(all.length * 0.02)));
  const maps = city.maps;
  for (let k = 0; k < tries && all.length; k++) {
    const lot = all[Math.floor(Math.random() * all.length)];
    if (!isZoned(lot) || lot.built < 1 || lot.occ < 0.75 || lot.flags & LF.Abandoned) continue;
    const z = ZONES[lot.kind];
    if (lot.level >= z.levels) continue;
    let score: number;
    if (z.group === "r") score = lot.value * 0.75 + Math.max(maps.at("school", lot.x, lot.z), maps.at("high", lot.x, lot.z)) * 0.2 + (lot.happy - 0.5) * 0.4;
    else if (z.group === "c") score = lot.value * 0.6 + lot.eff * 0.3 + clamp01(d.c + 0.6) * 0.1;
    else if (z.group === "o") score = lot.value * 0.45 + lot.eff * 0.5;
    else score = maps.at("fire", lot.x, lot.z) * 0.25 + maps.at("police", lot.x, lot.z) * 0.2 + lot.eff * 0.5;
    const need = lot.level === 1 ? 0.42 : 0.62;
    if (score > need) {
      lot.level++;
      lot.built = 0.45;
      city.rising.add(lot);
      city.bump("levelUps");
    }
  }
}

/** New buildings go up on empty zoned plots when the city wants them. */
let growList: Lot[] = [];
let growKey = "";
export function grow(city: City) {
  const key = city.seed + ":" + city.lots.version + ":" + city.zoneVersion + ":" + city.look;
  if (key !== growKey) {
    growKey = key;
    growList = [];
    for (const lot of city.lots.lots.values()) if (!lot.kind && lot.zone && lot.seg) growList.push(lot);
  }
  if (!growList.length) return;
  const d = city.demand, st = city.stats;
  // Don't keep building while what stands there doesn't work (no power, say).
  const stuck = st.buildings > 8 && st.blocked > st.buildings * 0.3;
  const tries = clamp(Math.ceil(growList.length * 0.04), 1, 14);
  for (let k = 0; k < tries; k++) {
    const lot = growList[Math.floor(Math.random() * growList.length)];
    if (lot.kind || !lot.zone || !city.lots.lots.has(lot.id)) continue;
    const z = ZONES[lot.zone];
    if (!city.unlocked(z.unlock)) continue;
    const want = z.group === "r" ? d.r : z.group === "c" ? d.c : z.group === "o" ? d.o : d.i;
    if (want < 0.04 || Math.random() > want * 1.1 + 0.05) continue;
    if (stuck && Math.random() < 0.9) continue;
    const comp = city.roads.componentOf(lot.seg);
    if (!comp || !city.roads.reachesOutside(comp)) continue;
    if (z.resource !== undefined && city.terrain.resourceAt(z.resource, lot.x, lot.z) < 0.22) continue;
    if (lot.y < city.waterLevel + 0.6) continue;
    city.raise(lot);
  }
}

/** Why nothing grows on a zoned plot, for the info box: "" when all is fine. */
export function growBlock(city: City, lot: Lot): string {
  if (!lot.zone || lot.kind) return "";
  const z = ZONES[lot.zone];
  if (!lot.seg) return "noRoad";
  const comp = city.roads.componentOf(lot.seg);
  if (!comp || !city.roads.reachesOutside(comp)) return "noHighway";
  if (z.resource !== undefined && city.terrain.resourceAt(z.resource, lot.x, lot.z) < 0.22) return "noResource";
  const d = city.demand;
  const want = z.group === "r" ? d.r : z.group === "c" ? d.c : z.group === "o" ? d.o : d.i;
  return want < 0.04 ? "noDemand" : "";
}
