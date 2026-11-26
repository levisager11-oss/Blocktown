// The panels that slide in at the side: money, the city in numbers, bus and metro, a building's details, options, help.
import { BUDGET_CATS, BUS, CAT_UNLOCK, FEATURE_UNLOCK, LOANS, MILESTONES, MILESTONE_REWARD, PLACE, PLACE_BY_KIND, RAW_NAMES, ROADS, ZONES, Zone } from "../sim/defs";
import { growBlock } from "../sim/economy";
import { Lot, isPlaced, isZoned } from "../sim/lots";
import { scoreParts } from "../sim/progress";
import type { RSeg } from "../sim/roads";
import { clear, fill, h } from "./dom";
import { Lang, money, num, pct, t } from "./i18n";
import type { UI } from "./ui";
import { milestoneName } from "./ui";
import { BUILDING_ICON, CAT_COLOR, ZONE_ICON, icon, tile } from "./icons";

type PanelName = "" | "budget" | "city" | "transit" | "inspect" | "options" | "help";
const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");

export class Panels {
  el = h("aside", { class: "panel hidden" });
  current: PanelName = "";
  private arg: { lot?: Lot; seg?: RSeg } | null = null;
  private busy = false;
  private scroll = 0;

  constructor(readonly ui: UI) {
    this.el.addEventListener("pointerdown", () => { this.busy = true; });
    window.addEventListener("pointerup", () => { this.busy = false; });
  }

  get game() { return this.ui.game; }
  get city() { return this.ui.game.city; }

  open(name: PanelName, arg: { lot?: Lot; seg?: RSeg } | null = null) {
    this.current = name;
    this.arg = arg;
    this.scroll = 0;
    this.el.classList.toggle("hidden", !name);
    this.ui.root.classList.toggle("has-panel", !!name);
    this.draw();
  }
  close() {
    if (this.current === "inspect") this.game.tools.select(null);
    this.open("");
  }
  toggle(name: PanelName) { if (this.current === name) this.close(); else this.open(name); }

  /** Draws the open panel again with fresh numbers, unless the player is using it right now. */
  refresh() {
    if (!this.current || this.busy || this.current === "options" || this.current === "help") return;
    const a = document.activeElement;
    if (a && this.el.contains(a) && a.tagName === "INPUT") return;
    this.draw();
  }

  private draw() {
    if (!this.current) { clear(this.el); return; }
    const body = this.el.querySelector(".panel-body") as HTMLElement | null;
    if (body) this.scroll = body.scrollTop;
    let title = "", content: (HTMLElement | null)[] = [], ticon: HTMLElement | null = null;
    if (this.current === "budget") { title = t("panel.budget"); content = this.budget(); }
    else if (this.current === "city") { title = this.city.name; content = this.cityPanel(); }
    else if (this.current === "transit") { title = t("panel.transit"); content = this.transit(); }
    else if (this.current === "options") { title = t("panel.options"); content = this.options(); }
    else if (this.current === "help") { title = t("panel.help"); content = this.help(); }
    else if (this.current === "inspect") {
      const r = this.inspect();
      if (!r) { this.close(); return; }
      title = r.title; content = r.content; ticon = r.icon ?? null;
    }
    const nb = h("div", { class: "panel-body" }, ...content);
    fill(this.el, h("header", null, ticon, h("h2", null, title), h("button", { class: "x", title: t("ui.close"), "aria-label": t("ui.close"), onclick: () => this.close() }, icon("x"))), nb);
    nb.scrollTop = this.scroll;
  }

  // ------------------------------------------------------------------ building blocks

  private row(label: string, value: string, cls = ""): HTMLElement {
    return h("div", { class: "row " + cls }, h("span", null, label), h("b", null, value));
  }
  private meter(label: string, value: number, text: string, color = ""): HTMLElement {
    const v = Math.max(0, Math.min(1, value));
    return h("div", { class: "meter" }, h("div", { class: "row" }, h("span", null, label), h("b", null, text)),
      h("div", { class: "track" }, h("i", { class: color || (v < 0.5 ? "bad" : v < 0.85 ? "mid" : "good"), style: { width: Math.round(v * 100) + "%" } })));
  }
  private slider(label: string, min: number, max: number, step: number, value: number, show: (v: number) => string, set: (v: number) => void): HTMLElement {
    const out = h("b", null, show(value));
    const input = h("input", { type: "range", min, max, step, value, "aria-label": label });
    const fillTo = (v: number) => input.style.setProperty("--p", ((v - min) / (max - min)) * 100 + "%");
    fillTo(value);
    input.addEventListener("input", () => { const v = Number(input.value); out.textContent = show(v); fillTo(v); set(v); });
    return h("label", { class: "slider" }, h("div", { class: "row" }, h("span", null, label), out), input);
  }
  private section(title: string, ...children: (HTMLElement | null | false)[]): HTMLElement {
    return h("section", null, h("h3", null, title), ...children.filter((c): c is HTMLElement => !!c));
  }

  // ------------------------------------------------------------------ money

  private budget(): HTMLElement[] {
    const city = this.city, st = city.stats;
    if (city.chill) return [h("p", { class: "note" }, t("mode.chill.d"))];
    const out: HTMLElement[] = [];
    const inc = Object.entries(st.income).filter(([, v]) => v > 0.5), exp = Object.entries(st.expense).filter(([, v]) => v > 0.5);
    const sum = (list: [string, number][]) => list.reduce((s, [, v]) => s + v, 0);
    out.push(this.section(t("budget.income"), ...inc.map(([k, v]) => this.row(t("inc." + k), money(v))), this.row("", money(sum(inc)), "total")));
    out.push(this.section(t("budget.expense"), ...exp.map(([k, v]) => this.row(t("exp." + k), money(v))), this.row("", money(sum(exp)), "total")));
    out.push(h("div", { class: "row big " + (st.net >= 0 ? "plus" : "minus") }, h("span", null, t("budget.net")), h("b", null, (st.net >= 0 ? "+" : "") + money(st.net))));
    if (!city.unlocked(FEATURE_UNLOCK.budget)) { out.push(h("p", { class: "note" }, t("budget.locked"))); return out; }
    const taxes: ["r" | "c" | "i" | "o", string][] = [["r", "inc.r"], ["c", "inc.c"], ["i", "inc.i"]];
    if (city.unlocked(ZONES[Zone.Office].unlock)) taxes.push(["o", "inc.o"]);
    out.push(this.section(t("budget.taxes"), ...taxes.map(([k, label]) => this.slider(t(label), 0, 20, 1, city.taxes[k], (v) => v + "%", (v) => { city.taxes[k] = v; }))));
    const cats = BUDGET_CATS.filter((c) => city.unlocked(CAT_UNLOCK[c]));
    out.push(this.section(t("budget.services"), h("p", { class: "note" }, t("budget.servicesHint")),
      ...cats.map((c) => this.slider(t("exp." + c), 50, 150, 5, Math.round(city.budget[c] * 100), (v) => v + "%", (v) => { city.budget[c] = v / 100; city.maps.dirty = true; }))));
    const loans: HTMLElement[] = [];
    if (!city.unlocked(FEATURE_UNLOCK.loans)) loans.push(h("p", { class: "note" }, t("budget.noLoans")));
    else {
      city.loans.forEach((loan, i) => loans.push(h("div", { class: "card" },
        h("p", null, t("budget.loanLeft", { left: money(loan.left), perDay: money(loan.perDay) })),
        h("button", { disabled: city.money < loan.left, onclick: () => { if (city.repayLoan(i)) { this.game.sound("cash"); this.draw(); } } }, t("budget.repay", { left: money(loan.left) })))));
      if (city.loans.length >= 3) loans.push(h("p", { class: "note" }, t("budget.maxLoans")));
      else LOANS.forEach((offer, i) => {
        if (!city.unlocked(offer.unlock)) return;
        const total = offer.amount * (1 + offer.rate * (city.mode === "hard" ? 1.4 : 1));
        loans.push(h("div", { class: "card" }, h("p", null, t("budget.loanOffer", { amount: money(offer.amount), days: offer.days, total: money(total) })),
          h("button", { class: "primary", onclick: () => { if (city.takeLoan(i)) { this.game.sound("cash"); this.draw(); } } }, t("budget.take"))));
      });
    }
    out.push(this.section(t("budget.loans"), ...loans));
    return out;
  }

  // ------------------------------------------------------------------ the city in numbers

  private unlocksAt(level: number): string[] {
    const list: string[] = [];
    ROADS.forEach((r) => { if (r.unlock === level) list.push(t("r." + r.key)); });
    ZONES.forEach((z, i) => { if (i > 0 && z.unlock === level) list.push(t("z." + z.key)); });
    for (const p of PLACE) if (p.unlock === level) list.push(t("b." + p.key));
    for (const [f, lv] of Object.entries(FEATURE_UNLOCK)) if (lv === level) list.push(t("feat." + f));
    return list;
  }

  private cityPanel(): HTMLElement[] {
    const city = this.city, st = city.stats, out: HTMLElement[] = [];
    const parts = scoreParts(city);
    out.push(h("div", { class: "score" }, h("span", null, t("city.score")), h("b", null, num(parts.total)),
      h("small", null, city.ranked ? t("city.scoreParts", { pop: num(parts.pop), happy: parts.happy.toFixed(2), traffic: parts.traffic.toFixed(2), school: parts.school.toFixed(2) }) : t(city.chill ? "note.unranked" : "note.bankrupt")),
      h("small", { class: "dim" }, t("city.scoreHow"))));
    // Milestones
    const next = city.milestone + 1;
    if (city.chill) out.push(this.section(t("ms.title"), this.row(milestoneName(city.milestone), ""), h("p", { class: "note" }, t("ms.chill"))));
    else if (next < MILESTONES.length) {
      out.push(this.section(t("ms.title"),
        this.meter(t("ms.next", { name: milestoneName(next), n: num(MILESTONES[next]) }), st.pop / MILESTONES[next], num(st.pop) + " / " + num(MILESTONES[next]), "good"),
        h("p", { class: "note" }, t("ms.unlocks") + ": " + [money(MILESTONE_REWARD[next]), ...this.unlocksAt(next)].join(", "))));
    } else out.push(this.section(t("ms.title"), h("p", { class: "note" }, t("ms.all"))));
    out.push(this.section(t("city.people"),
      this.row(t("hud.pop"), num(st.pop)), this.row(t("city.workers"), num(st.workers)), this.row(t("city.jobs"), num(st.jobs)),
      this.row(t("city.unemployed"), pct(st.unemployment), st.unemployment > 0.1 ? "minus" : ""),
      this.meter(t("hud.happy"), st.happy, pct(st.happy)), this.meter(t("hud.traffic"), st.flow, pct(st.flow)), this.meter(t("city.land"), st.land, pct(st.land))));
    out.push(this.section(t("city.education"), ...city.edu.map((e, i) => this.meter(t("edu." + i), e, pct(e), "blue"))));
    const supply: HTMLElement[] = [];
    const ratio = (have: number, need: number) => (need > 0.5 ? have / need : have > 0 ? 1 : 1);
    supply.push(this.meter(t("city.power"), ratio(st.powerMake, st.powerNeed), `${num(st.powerNeed)} / ${num(st.powerMake)}`));
    if (city.unlocked(FEATURE_UNLOCK.water)) {
      supply.push(this.meter(t("city.water"), ratio(st.waterMake, st.waterNeed), `${num(st.waterNeed)} / ${num(st.waterMake)}`));
      supply.push(this.meter(t("city.sewage"), ratio(st.sewageCap, st.sewageNeed), `${num(st.sewageNeed)} / ${num(st.sewageCap)}`));
    }
    if (city.unlocked(FEATURE_UNLOCK.garbage)) supply.push(this.meter(t("city.garbage"), ratio(st.garbageCap, st.garbageNeed), `${num(st.garbageNeed)} / ${num(st.garbageCap)}`));
    if (city.unlocked(FEATURE_UNLOCK.edu)) {
      const seats = st.seats.reduce((s, v) => s + v, 0), kids = st.students[0] + (city.unlocked(4) ? st.students[1] : 0) + (city.unlocked(6) ? st.students[2] : 0);
      supply.push(this.meter(t("city.schools"), ratio(seats, kids), `${num(kids)} / ${num(seats)}`));
      supply.push(this.meter(t("city.health"), ratio(st.beds, st.pop), `${num(st.pop)} / ${num(st.beds)}`));
    }
    supply.push(this.meter(t("city.cleanPower"), st.cleanPower, pct(st.cleanPower), "good"));
    out.push(this.section(t("city.supply"), ...supply));
    if (city.unlocked(FEATURE_UNLOCK.industry) && st.iJobs > 0) {
      out.push(this.section(t("goods.title"), h("p", { class: "note" }, t("goods.hint")),
        ...RAW_NAMES.map((name, k) => this.meter(t("goods." + name), ratio(st.rawMake[k], st.rawNeed[k]), t("goods.makes", { make: num(st.rawMake[k]), need: num(st.rawNeed[k]) }), "blue")),
        this.meter(t("goods.goods"), ratio(st.goodsMake, st.goodsNeed), t("goods.makes", { make: num(st.goodsMake), need: num(st.goodsNeed) }), "blue")));
    }
    if (city.history.pop.length > 2) out.push(this.section(t("city.history"), this.spark(city.history.pop)));
    out.push(this.section(t("city.map"), this.row(t("city.mode"), t("mode." + city.mode)), h("p", { class: "note selectable" }, t("city.seed", { seed: city.seed })), h("p", { class: "note" }, t("city.best", { n: num(city.best.pop ?? 0) }))));
    return out;
  }

  private spark(values: number[]): HTMLElement {
    const c = h("canvas", { class: "spark", width: 300, height: 70 });
    const g = c.getContext("2d")!;
    const max = Math.max(1, ...values);
    g.strokeStyle = "#5fd38d";
    g.lineWidth = 2;
    g.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * 296 + 2, y = 66 - (v / max) * 60;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.stroke();
    g.lineTo(298, 68); g.lineTo(2, 68);
    g.fillStyle = "rgba(95,211,141,0.18)";
    g.fill();
    return c;
  }

  // ------------------------------------------------------------------ bus and metro

  private transit(): HTMLElement[] {
    const city = this.city, tr = city.transit, out: HTMLElement[] = [];
    const tools = this.game.tools;
    out.push(h("div", { class: "row buttons" },
      h("button", { class: "primary", disabled: !city.unlocked(FEATURE_UNLOCK.transit), onclick: () => { tools.set({ t: "line", metro: false }); } }, icon("busFront"), t("tool.busLine")),
      h("button", { disabled: !city.unlocked(FEATURE_UNLOCK.metro), onclick: () => { tools.set({ t: "line", metro: true }); } }, icon("train"), t("tool.metroLine"))));
    out.push(this.row(t("transit.buses", { used: tr.busesInUse(), all: tr.depots() * BUS.busesPerDepot }), ""));
    if (!tr.lines.length) { out.push(h("p", { class: "note" }, t("transit.none"))); return out; }
    out.push(this.row(t("transit.total", { n: num(city.stats.riders) }), ""));
    let b = 0, m = 0;
    for (const line of tr.lines) {
      const cap = tr.capacity(line), riders = Math.max(line.riders, line.today);
      out.push(h("div", { class: "card line" },
        h("div", { class: "row" }, h("span", null, h("i", { class: "dot", style: { background: hex(line.color) } }), t(line.metro ? "transit.metro" : "transit.bus", { n: line.metro ? ++m : ++b })), h("b", null, t("transit.stops", { n: line.stops.length }))),
        this.meter(t("transit.riders", { n: num(riders) }), riders / Math.max(1, cap), riders > cap * 0.95 ? t("transit.full") : "", riders > cap * 0.95 ? "bad" : "good"),
        h("div", { class: "row" }, h("span", null, t("transit.vehicles")),
          h("span", { class: "stepper" },
            h("button", { onclick: () => { tr.setVehicles(line, line.vehicles - 1); this.draw(); } }, "−"), h("b", null, String(line.vehicles)),
            h("button", { onclick: () => { if (!tr.setVehicles(line, line.vehicles + 1)) this.ui.toast("why.buses", "warn"); this.draw(); } }, "+"))),
        h("div", { class: "row buttons" },
          h("button", { onclick: () => { const s = line.stops[0]; this.game.view.focus(s.x, s.z, 300); this.game.view.showTransit = true; } }, t("ui.goThere")),
          h("button", { class: "danger", onclick: () => this.ui.confirm("confirm.deleteLine", {}, () => { tr.removeLine(line); this.draw(); }) }, t("transit.close")))));
    }
    return out;
  }

  // ------------------------------------------------------------------ one building or road

  private inspect(): { title: string; icon?: HTMLElement; content: HTMLElement[] } | null {
    const city = this.city, a = this.arg;
    if (!a) return null;
    const out: HTMLElement[] = [];
    if (a.seg) {
      const seg = a.seg;
      if (!city.roads.segs.has(seg.id)) return null;
      const def = ROADS[seg.type], jam = city.traffic.jam(seg);
      out.push(this.row(t("insp.road", { len: Math.round(seg.len) }), seg.bridgeLen > 6 ? t("insp.bridge") : ""));
      out.push(this.meter(t("insp.jam"), 1 - jam, t(jam < 0.3 ? "insp.jamFree" : jam < 0.6 ? "insp.jamSlow" : "insp.jamStuck")));
      if (seg.fixed) out.push(h("p", { class: "note" }, t("insp.givenHighway")));
      else {
        const others = ROADS.map((r, type) => ({ r, type })).filter(({ r, type }) => type !== seg.type && city.unlocked(r.unlock));
        if (others.length) out.push(this.section(t("insp.change"), h("div", { class: "row buttons" }, ...others.map(({ r, type }) =>
          h("button", { onclick: () => { const why = city.upgradeRoad(seg, type); if (why) { this.ui.toast("why." + why, "bad"); this.game.sound("error"); } else this.game.sound("road"); this.draw(); } }, `${t("r." + r.key)} ${city.chill ? "" : money(city.upgradeCost(seg, type))}`)))));
        out.push(h("button", { class: "danger", onclick: () => { if (city.bulldozeRoad(seg)) { this.game.sound("bulldoze"); this.close(); } } }, icon("hammer"), t("ui.demolish")));
      }
      return { title: t("r." + def.key), content: out };
    }
    const lot = a.lot;
    if (!lot || !city.lots.lots.has(lot.id)) return null;
    const maps = city.maps;
    if (!lot.kind) {
      if (!lot.zone) return null;
      const why = growBlock(city, lot);
      out.push(h("p", { class: "note" }, t(why ? "grow." + why : "grow.soon")));
      return { title: t("z." + ZONES[lot.zone].key), icon: tile(ZONE_ICON[lot.zone], hex(ZONES[lot.zone].color), "zone"), content: out };
    }
    const problem = city.problem(lot);
    if (lot.built < 1) out.push(h("p", { class: "note" }, t("insp.construction")));
    if (problem) out.push(h("p", { class: "alert" }, t("prob." + problem)));
    let title: string, ticon: HTMLElement;
    if (isZoned(lot)) {
      const z = ZONES[lot.kind], cap = z.cap[lot.level - 1], n = Math.round(cap * lot.occ);
      title = t("z." + z.key) + (z.levels > 1 ? ` · ${t("level", { n: lot.level })}` : "");
      ticon = tile(ZONE_ICON[lot.kind], hex(z.color), "zone");
      out.push(this.row(t(z.group === "r" ? "insp.residents" : "insp.workers", { n, cap }), ""));
      if (z.group === "r") out.push(this.meter(t("insp.happy"), lot.happy, pct(lot.happy)));
      else out.push(this.meter(t("insp.eff"), lot.eff, pct(lot.eff)));
      out.push(this.meter(t("insp.value"), lot.value, pct(lot.value)));
      out.push(this.meter(t("insp.access"), lot.access, pct(lot.access)));
      const dirt = maps.at("pollution", lot.x, lot.z), noise = maps.at("noise", lot.x, lot.z);
      out.push(this.meter(t("insp.pollution"), dirt, pct(dirt), dirt > 0.4 ? "bad" : dirt > 0.15 ? "mid" : "good"));
      out.push(this.meter(t("insp.noise"), noise, pct(noise), noise > 0.5 ? "bad" : noise > 0.25 ? "mid" : "good"));
      if (z.group === "r") {
        const services: [string, number][] = [["view.health", maps.at("health", lot.x, lot.z)], ["view.school", Math.max(maps.at("school", lot.x, lot.z), maps.at("high", lot.x, lot.z))],
          ["view.police", maps.at("police", lot.x, lot.z)], ["view.fire", maps.at("fire", lot.x, lot.z)], ["view.charm", maps.at("charm", lot.x, lot.z)]];
        out.push(this.section(t("insp.services"), ...services.map(([k, v]) => this.meter(t(k), v, pct(v)))));
      }
    } else if (isPlaced(lot)) {
      const def = PLACE_BY_KIND.get(lot.kind);
      if (!def) return null;
      title = t("b." + def.key);
      ticon = tile(BUILDING_ICON[def.key] ?? "building", CAT_COLOR[def.cat] ?? "#5aa9ff");
      out.push(h("p", { class: "note" }, t("bd." + def.key)));
      const works = city.serviceStrength(lot);
      out.push(this.meter(t("insp.works", { n: Math.round(works * 100) }), works, ""));
      if (def.makesPower) out.push(this.row(t("stat.makesPower"), num(def.makesPower * works)));
      if (def.makesWater) out.push(this.row(t("stat.makesWater"), num(def.makesWater * works)));
      if (def.sewage) out.push(this.row(t("stat.sewage"), num(def.sewage * works)));
      if (def.garbage) out.push(this.row(t("stat.garbage"), num(def.garbage * works)));
      if (def.seats) out.push(this.row(t("stat.seats"), num(def.seats * works)));
      if (def.beds) out.push(this.row(t("stat.beds"), num(def.beds * works)));
      if (def.jobs) out.push(this.row(t("stat.jobs"), num(def.jobs)));
      if (!city.chill) out.push(this.row(t("stat.upkeep"), money(def.upkeep * city.budget[def.cat]) + " " + t("ui.perDay")));
    } else return null;
    out.push(h("button", { class: "danger", onclick: () => {
      const go = () => { city.bulldozeLot(lot); this.game.sound("bulldoze"); this.close(); };
      if (lot.custom) this.ui.confirm("confirm.demolish", { name: "@b." + (PLACE_BY_KIND.get(lot.kind)?.key ?? "") }, go); else go();
    } }, icon("hammer"), t("ui.demolish")));
    return { title, icon: ticon, content: out };
  }

  // ------------------------------------------------------------------ options and help

  private options(): HTMLElement[] {
    const s = this.game.settings, city = this.city, game = this.game;
    const toggle = (label: string, value: boolean, set: (v: boolean) => void, note = "") => {
      const input = h("input", { type: "checkbox", checked: value });
      input.addEventListener("change", () => { set(input.checked); game.saveSettings(); });
      return h("label", { class: "toggle" }, h("span", null, label, note ? h("small", null, note) : null), input);
    };
    const select = <T extends string>(label: string, value: T, options: [T, string][], set: (v: T) => void) => {
      const sel = h("select", null, ...options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)));
      sel.addEventListener("change", () => { set(sel.value as T); game.saveSettings(); });
      return h("label", { class: "toggle" }, h("span", null, label), sel);
    };
    return [
      select<Lang>(t("opt.language"), s.lang, [["en", "English"], ["de", "Deutsch"]], (v) => { s.lang = v; game.saveSettings(); }),
      this.slider(t("opt.sound"), 0, 100, 5, Math.round(s.sfx * 100), (v) => v + "%", (v) => { s.sfx = v / 100; game.saveSettings(); }),
      this.slider(t("opt.ambience"), 0, 100, 5, Math.round(s.ambience * 100), (v) => v + "%", (v) => { s.ambience = v / 100; game.saveSettings(); }),
      select(t("opt.quality"), s.quality, [["low", t("opt.quality.low")], ["medium", t("opt.quality.medium")], ["high", t("opt.quality.high")]], (v) => { s.quality = v; }),
      toggle(t("opt.dayNight"), s.dayNight, (v) => { s.dayNight = v; }),
      toggle(t("opt.disasters"), city.disastersOn && !city.chill, (v) => { city.disastersOn = v; }, city.chill ? t("opt.disastersChill") : ""),
      toggle(t("opt.advisor"), s.advisor, (v) => { s.advisor = v; }),
      toggle(t("opt.cameraPad"), s.pad, (v) => { s.pad = v; }),
      h("p", { class: "note" }, t("opt.autosave")),
    ];
  }

  private help(): HTMLElement[] {
    const touch = matchMedia("(pointer: coarse)").matches;
    const sec = (title: string, text: string) => this.section(t(title), h("p", null, t(text)));
    return [
      sec("help.camera", touch ? "help.camera.touch" : "help.camera.mouse"),
      sec("help.roads", "help.roads.t"), sec("help.zones", "help.zones.t"), sec("help.services", "help.services.t"),
      sec("help.traffic", "help.traffic.t"), sec("help.money", "help.money.t"),
      this.section(t("help.modes"), ...(["chill", "normal", "hard"] as const).map((m) => h("p", null, h("b", null, t("mode." + m) + ": "), t("mode." + m + ".d")))),
      touch ? null : sec("help.keys", "help.keys.t"),
    ].filter((e): e is HTMLElement => !!e);
  }
}
