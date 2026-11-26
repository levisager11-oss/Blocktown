// The sheets that slide in over the game: money, the city in numbers, bus, tram and metro lines,
// a building's or road's details, options and help.
import { BUDGET_CATS, BUS, CAT_UNLOCK, FEATURE_UNLOCK, LOANS, MILESTONES, MILESTONE_REWARD, PLACE, PLACE_BY_KIND, RAW_NAMES, ROADS, Road, TRAM, ZONES, Zone } from "../sim/defs";
import { growBlock } from "../sim/economy";
import { Lot, isPlaced, isZoned } from "../sim/lots";
import { scoreParts } from "../sim/progress";
import type { RSeg } from "../sim/roads";
import { clear, fill, h } from "./dom";
import { Lang, money, num, pct, t } from "./i18n";
import { icon } from "./icons";
import type { UI } from "./ui";
import { milestoneName } from "./ui";

type PanelName = "" | "budget" | "city" | "transit" | "inspect" | "options" | "help";
const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const CAT_COLOR: Record<string, string> = { power: "k-power", water: "k-water", garbage: "k-services", police: "k-services", fire: "k-services", health: "k-services", edu: "k-edu", parks: "k-parks", transit: "k-transit", landmark: "k-landmarks" };

export class Panels {
  el = h("aside", { class: "sheet hidden" });
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
    if (name && name !== this.current) this.game.sound("open");
    this.current = name;
    this.arg = arg;
    this.scroll = 0;
    this.el.classList.toggle("hidden", !name);
    this.draw();
  }
  close() {
    if (this.current === "inspect") this.game.tools.select(null);
    if (this.current) this.game.sound("close");
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
    const body = this.el.querySelector(".sheet-body") as HTMLElement | null;
    if (body) this.scroll = body.scrollTop;
    let title: (string | HTMLElement)[] = [], content: (HTMLElement | null)[] = [], pic: HTMLElement | null = null, cls = "";
    if (this.current === "budget") { pic = icon("bag"); title = [t("panel.budget")]; content = this.budget(); cls = "k-power"; }
    else if (this.current === "city") { pic = icon("chart"); title = [this.city.name, h("small", null, milestoneName(this.city.milestone))]; content = this.cityPanel(); }
    else if (this.current === "transit") { pic = icon("bus"); title = [t("panel.transit")]; content = this.transit(); cls = "k-transit"; }
    else if (this.current === "options") { pic = icon("gear"); title = [t("panel.options")]; content = this.options(); cls = "k-roads"; }
    else if (this.current === "help") { pic = icon("help"); title = [t("panel.help")]; content = this.help(); }
    else if (this.current === "inspect") {
      const r = this.inspect();
      if (!r) { this.close(); return; }
      title = r.title; content = r.content; pic = r.pic; cls = r.cls;
    }
    const nb = h("div", { class: "sheet-body" }, ...content);
    fill(this.el,
      h("header", { class: cls }, pic, h("h2", null, ...title), h("button", { class: "btn red x", title: t("ui.close"), onclick: () => this.close() }, icon("close"))),
      this.current === "city" || this.current === "budget" || this.current === "transit" ? this.tabs() : null,
      nb);
    nb.scrollTop = this.scroll;
  }

  private tabs(): HTMLElement {
    const tab = (name: PanelName, ic: string, label: string, unlock = 0) =>
      h("button", { class: "chip" + (this.current === name ? " on" : ""), disabled: !this.city.unlocked(unlock),
        onclick: () => { this.game.sound("click"); this.open(name); } }, icon(ic), t(label));
    return h("nav", null, tab("city", "chart", "panel.city"), tab("budget", "coin", "panel.budget"), tab("transit", "bus", "panel.transitShort", FEATURE_UNLOCK.transit));
  }

  // ------------------------------------------------------------------ building blocks

  private row(label: string | HTMLElement, value: string, cls = ""): HTMLElement {
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
    input.addEventListener("input", () => { const v = Number(input.value); out.textContent = show(v); set(v); });
    return h("label", { class: "slider" }, h("div", { class: "row" }, h("span", null, label), out), input);
  }
  private box(title: string, ic: string | null, ...children: (HTMLElement | null | false)[]): HTMLElement {
    return h("section", { class: "box" }, h("h3", null, ic ? icon(ic) : null, title), ...children.filter((c): c is HTMLElement => !!c));
  }
  private stat(ic: string, label: string, value: string): HTMLElement {
    return h("div", { class: "stat" }, icon(ic), h("div", null, h("small", null, label), h("b", null, value)));
  }

  // ------------------------------------------------------------------ money

  private budget(): HTMLElement[] {
    const city = this.city, st = city.stats;
    if (city.chill) return [h("p", { class: "note" }, t("mode.chill.d"))];
    const out: HTMLElement[] = [];
    const inc = Object.entries(st.income).filter(([, v]) => v > 0.5), exp = Object.entries(st.expense).filter(([, v]) => v > 0.5);
    const sum = (list: [string, number][]) => list.reduce((s, [, v]) => s + v, 0);
    out.push(h("div", { class: "row big " + (st.net >= 0 ? "plus" : "minus") }, h("span", null, t("budget.net")), h("b", null, (st.net >= 0 ? "+" : "") + money(st.net))));
    out.push(this.box(t("budget.income"), "coin", ...inc.map(([k, v]) => this.row(t("inc." + k), money(v))), this.row("", money(sum(inc)), "total")));
    out.push(this.box(t("budget.expense"), "bag", ...exp.map(([k, v]) => this.row(t("exp." + k), money(v))), this.row("", money(sum(exp)), "total")));
    if (!city.unlocked(FEATURE_UNLOCK.budget)) { out.push(h("p", { class: "note" }, t("budget.locked"))); return out; }
    const taxes: ["r" | "c" | "i" | "o", string][] = [["r", "inc.r"], ["c", "inc.c"], ["i", "inc.i"]];
    if (city.unlocked(ZONES[Zone.Office].unlock)) taxes.push(["o", "inc.o"]);
    out.push(this.box(t("budget.taxes"), "chart", ...taxes.map(([k, label]) => this.slider(t(label), 0, 20, 1, city.taxes[k], (v) => v + "%", (v) => { city.taxes[k] = v; }))));
    const cats = BUDGET_CATS.filter((c) => city.unlocked(CAT_UNLOCK[c]));
    out.push(this.box(t("budget.services"), "gear", h("p", { class: "note" }, t("budget.servicesHint")),
      ...cats.map((c) => this.slider(t("exp." + c), 50, 150, 5, Math.round(city.budget[c] * 100), (v) => v + "%", (v) => { city.budget[c] = v / 100; city.maps.dirty = true; }))));
    const loans: HTMLElement[] = [];
    if (!city.unlocked(FEATURE_UNLOCK.loans)) loans.push(h("p", { class: "note" }, t("budget.noLoans")));
    else {
      city.loans.forEach((loan, i) => loans.push(h("div", { class: "line-card" },
        h("p", null, t("budget.loanLeft", { left: money(loan.left), perDay: money(loan.perDay) })),
        h("button", { class: "btn small", disabled: city.money < loan.left, onclick: () => { if (city.repayLoan(i)) { this.game.sound("cash"); this.draw(); } } }, t("budget.repay", { left: money(loan.left) })))));
      if (city.loans.length >= 3) loans.push(h("p", { class: "note" }, t("budget.maxLoans")));
      else LOANS.forEach((offer, i) => {
        if (!city.unlocked(offer.unlock)) return;
        const total = offer.amount * (1 + offer.rate * (city.mode === "hard" ? 1.4 : 1));
        loans.push(h("div", { class: "line-card" }, h("p", null, t("budget.loanOffer", { amount: money(offer.amount), days: offer.days, total: money(total) })),
          h("button", { class: "btn small gold", onclick: () => { if (city.takeLoan(i)) { this.game.sound("coins"); this.draw(); } } }, icon("coin"), t("budget.take"))));
      });
    }
    out.push(this.box(t("budget.loans"), "bag", ...loans));
    return out;
  }

  // ------------------------------------------------------------------ the city in numbers

  private unlocksAt(level: number): string[] {
    const list: string[] = [];
    ROADS.forEach((r) => { if (r.unlock === level && !r.hidden) list.push(t("r." + r.key)); });
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
      h("small", null, t("city.scoreHow"))));
    out.push(h("div", { class: "stat-grid" },
      this.stat("people", t("hud.pop"), num(st.pop)), this.stat("coin", t("hud.money"), city.chill ? "∞" : num(city.money)),
      this.stat(st.happy > 0.75 ? "happy" : st.happy > 0.55 ? "fine" : st.happy > 0.4 ? "meh" : "sad", t("hud.happy"), pct(st.happy)), this.stat("car", t("hud.traffic"), pct(st.flow)),
      this.stat("tourists", t("city.tourists"), num(st.tourists)), this.stat("chart", t("city.unemployed"), pct(st.unemployment))));
    // Milestones
    const next = city.milestone + 1;
    if (city.chill) out.push(this.box(t("ms.title"), "star", this.row(milestoneName(city.milestone), ""), h("p", { class: "note" }, t("ms.chill"))));
    else if (next < MILESTONES.length) {
      out.push(this.box(t("ms.title"), "star",
        this.meter(t("ms.next", { name: milestoneName(next), n: num(MILESTONES[next]) }), st.pop / MILESTONES[next], num(st.pop) + " / " + num(MILESTONES[next]), "gold"),
        h("p", { class: "note" }, t("ms.unlocks") + ": " + [money(MILESTONE_REWARD[next]), ...this.unlocksAt(next)].join(", "))));
    } else out.push(this.box(t("ms.title"), "star", h("p", { class: "note" }, t("ms.all"))));
    out.push(this.box(t("city.people"), "people",
      this.row(t("city.workers"), num(st.workers)), this.row(t("city.jobs"), num(st.jobs)),
      this.meter(t("hud.happy"), st.happy, pct(st.happy)), this.meter(t("hud.traffic"), st.flow, pct(st.flow)), this.meter(t("city.land"), st.land, pct(st.land))));
    out.push(this.box(t("city.education"), "edu", ...city.edu.map((e, i) => this.meter(t("edu." + i), e, pct(e), "blue"))));
    const supply: HTMLElement[] = [];
    const ratio = (have: number, need: number) => (need > 0.5 ? have / need : 1);
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
    out.push(this.box(t("city.supply"), "power", ...supply));
    if (city.sights.length) {
      out.push(this.box(t("city.sights"), "landmarks", h("p", { class: "note" }, t("city.sightsHint")),
        ...city.sights.map((lot) => {
          const def = PLACE_BY_KIND.get(lot.kind)!;
          return this.meter(t("b." + def.key), lot.access, t("city.reach", { n: pct(lot.access) }), "blue");
        })));
    }
    if (city.unlocked(FEATURE_UNLOCK.industry) && st.iJobs > 0) {
      out.push(this.box(t("goods.title"), "ore", h("p", { class: "note" }, t("goods.hint")),
        ...RAW_NAMES.map((name, k) => this.meter(t("goods." + name), ratio(st.rawMake[k], st.rawNeed[k]), t("goods.makes", { make: num(st.rawMake[k]), need: num(st.rawNeed[k]) }), "blue")),
        this.meter(t("goods.goods"), ratio(st.goodsMake, st.goodsNeed), t("goods.makes", { make: num(st.goodsMake), need: num(st.goodsNeed) }), "blue")));
    }
    if (city.history.pop.length > 2) out.push(this.box(t("city.history"), "chart", this.spark(city.history.pop)));
    out.push(this.box(t("city.map"), "pin", this.row(t("city.mode"), t("mode." + city.mode)), h("p", { class: "note selectable" }, t("city.seed", { seed: city.seed })), h("p", { class: "note" }, t("city.best", { n: num(city.best.pop ?? 0) }))));
    return out;
  }

  private spark(values: number[]): HTMLElement {
    const c = h("canvas", { class: "spark", width: 300, height: 76 });
    const g = c.getContext("2d")!;
    const max = Math.max(1, ...values);
    const grad = g.createLinearGradient(0, 0, 0, 76);
    grad.addColorStop(0, "rgba(90,209,106,0.45)");
    grad.addColorStop(1, "rgba(90,209,106,0.02)");
    g.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * 296 + 2, y = 70 - (v / max) * 62;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    });
    g.strokeStyle = "#2fa443";
    g.lineWidth = 3;
    g.lineJoin = "round";
    g.stroke();
    g.lineTo(298, 74); g.lineTo(2, 74);
    g.fillStyle = grad;
    g.fill();
    return c;
  }

  // ------------------------------------------------------------------ bus, tram and metro

  private transit(): HTMLElement[] {
    const city = this.city, tr = city.transit, out: HTMLElement[] = [];
    const tools = this.game.tools;
    out.push(h("div", { class: "row buttons" },
      h("button", { class: "btn small green", disabled: !city.unlocked(FEATURE_UNLOCK.transit), onclick: () => { this.close(); tools.set({ t: "line", metro: false }); } }, icon("stop"), t("tool.busLine")),
      h("button", { class: "btn small gold", disabled: !city.unlocked(FEATURE_UNLOCK.tram), onclick: () => { this.close(); tools.set({ t: "line", metro: false, tram: true }); } }, icon("tram"), t("tool.tramLine")),
      h("button", { class: "btn small blue", disabled: !city.unlocked(FEATURE_UNLOCK.metro), onclick: () => { this.close(); tools.set({ t: "line", metro: true }); } }, icon("metro"), t("tool.metroLine"))));
    out.push(h("div", { class: "stat-grid" },
      this.stat("bus", t("transit.busesShort"), `${tr.busesInUse()} / ${tr.depots() * BUS.busesPerDepot}`),
      this.stat("tram", t("transit.tramsShort"), `${tr.tramsInUse()} / ${tr.tramDepots() * TRAM.tramsPerDepot}`)));
    if (!tr.lines.length) { out.push(h("p", { class: "note" }, t("transit.none"))); return out; }
    out.push(this.row(t("transit.total", { n: num(city.stats.riders) }), ""));
    let b = 0, m = 0, tm = 0;
    for (const line of tr.lines) {
      const cap = tr.capacity(line), riders = Math.max(line.riders, line.today);
      const name = line.metro ? t("transit.metro", { n: ++m }) : line.tram ? t("transit.tram", { n: ++tm }) : t("transit.bus", { n: ++b });
      out.push(h("div", { class: "line-card" },
        h("div", { class: "row" }, h("span", null, h("i", { class: "swatch", style: { background: hex(line.color) } }), name), h("b", null, t("transit.stops", { n: line.stops.length }))),
        this.meter(t("transit.riders", { n: num(riders) }), riders / Math.max(1, cap), riders > cap * 0.95 ? t("transit.full") : "", riders > cap * 0.95 ? "bad" : "good"),
        h("div", { class: "row" }, h("span", null, t("transit.vehicles")),
          h("span", { class: "stepper" },
            h("button", { class: "btn small", onclick: () => { tr.setVehicles(line, line.vehicles - 1); this.draw(); } }, icon("minus")), h("b", null, String(line.vehicles)),
            h("button", { class: "btn small", onclick: () => { if (!tr.setVehicles(line, line.vehicles + 1)) this.ui.toast(line.tram ? "why.trams" : "why.buses", "warn"); this.draw(); } }, icon("plus")))),
        h("div", { class: "row buttons" },
          h("button", { class: "btn small blue", onclick: () => { const s = line.stops[0]; this.game.view.focus(s.x, s.z, 300); this.game.view.showTransit = true; } }, icon("pin"), t("ui.goThere")),
          h("button", { class: "btn small red", onclick: () => this.ui.confirm("confirm.deleteLine", {}, () => { tr.removeLine(line); this.draw(); }) }, t("transit.close")))));
    }
    return out;
  }

  // ------------------------------------------------------------------ one building or road

  private inspect(): { title: (string | HTMLElement)[]; content: HTMLElement[]; pic: HTMLElement | null; cls: string } | null {
    const city = this.city, a = this.arg;
    if (!a) return null;
    const out: HTMLElement[] = [];
    if (a.seg) {
      const seg = a.seg;
      if (!city.roads.segs.has(seg.id)) return null;
      const def = ROADS[seg.type], jam = city.traffic.jam(seg);
      out.push(this.row(t("insp.road", { len: Math.round(seg.len) }), seg.tunnel ? t("insp.tunnel") : seg.bridgeLen > 6 ? t("insp.bridge") : def.oneway ? t("insp.oneway") : ""));
      out.push(this.meter(t("insp.jam"), 1 - jam, t(jam < 0.3 ? "insp.jamFree" : jam < 0.6 ? "insp.jamSlow" : "insp.jamStuck")));
      if (seg.fixed) out.push(h("p", { class: "note" }, t("insp.givenHighway")));
      else if (seg.type !== Road.Ring) {
        const others = ROADS.map((r, type) => ({ r, type })).filter(({ r, type }) => type !== seg.type && !r.hidden && city.unlocked(r.unlock));
        if (others.length) out.push(this.box(t("insp.change"), "upgrade", h("div", { class: "row buttons" }, ...others.map(({ r, type }) =>
          h("button", { class: "btn small", onclick: () => { const why = city.upgradeRoad(seg, type); if (why) { this.ui.toast("why." + why, "bad"); this.game.sound("error"); } else this.game.sound("road"); this.draw(); } },
            h("span", { class: "ic", style: { fontSize: "22px" }, html: this.ui.roadPic(type as Road) }), `${t("r." + r.key)}${city.chill ? "" : " · " + money(city.upgradeCost(seg, type))}`)))));
        const row = h("div", { class: "row buttons" });
        if (def.oneway) row.append(h("button", { class: "btn small blue", onclick: () => { if (city.reverseRoad(seg)) this.game.sound("road"); this.draw(); } }, icon("reverse"), t("tool.reverse")));
        row.append(h("button", { class: "btn small red", onclick: () => { if (city.bulldozeRoad(seg)) { this.game.sound("bulldoze"); this.close(); } } }, icon("dozer"), t("ui.demolish")));
        out.push(row);
      }
      return { title: [t("r." + def.key)], content: out, pic: h("span", { class: "ic", style: { fontSize: "40px" }, html: this.ui.roadPic(seg.type) }), cls: "k-roads" };
    }
    const lot = a.lot;
    if (!lot || !city.lots.lots.has(lot.id)) return null;
    const maps = city.maps;
    const thumbs = this.game.thumbs;
    if (!lot.kind) {
      if (!lot.zone) return null;
      const why = growBlock(city, lot);
      out.push(h("p", { class: "note" }, t(why ? "grow." + why : "grow.soon")));
      return { title: [t("z." + ZONES[lot.zone].key)], content: out, pic: h("img", { src: thumbs.get(lot.zone, 1), alt: "" }), cls: "k-zones" };
    }
    const problem = city.problem(lot);
    if (lot.built < 1) out.push(h("p", { class: "note" }, t("insp.construction")));
    if (problem) out.push(h("p", { class: "alert" }, icon(problem === "unhappy" ? "angry" : problem), t("prob." + problem)));
    let title: (string | HTMLElement)[], cls = "k-zones";
    if (isZoned(lot)) {
      const z = ZONES[lot.kind], cap = z.cap[lot.level - 1], n = Math.round(cap * lot.occ);
      title = [t("z." + z.key), z.levels > 1 ? h("small", null, t("level", { n: lot.level })) : ""];
      if (z.levels > 1) out.push(h("div", { class: "stars" }, ...[1, 2, 3].map((k) => icon("star", k <= lot.level ? "" : "off"))));
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
        out.push(this.box(t("insp.services"), "services", ...services.map(([k, v]) => this.meter(t(k), v, pct(v)))));
      }
    } else if (isPlaced(lot)) {
      const def = PLACE_BY_KIND.get(lot.kind);
      if (!def) return null;
      cls = CAT_COLOR[def.cat] ?? "";
      title = [t("b." + def.key)];
      out.push(h("p", { class: "note" }, t("bd." + def.key)));
      const works = city.serviceStrength(lot);
      out.push(this.meter(t("insp.works", { n: Math.round(works * 100) }), works, ""));
      if (def.makesPower) out.push(this.row(t("stat.makesPower"), num(def.makesPower * works)));
      if (def.makesWater) out.push(this.row(t("stat.makesWater"), num(def.makesWater * works)));
      if (def.sewage) out.push(this.row(t("stat.sewage"), num(def.sewage * works)));
      if (def.garbage) out.push(this.row(t("stat.garbage"), num(def.garbage * works)));
      if (def.seats) out.push(this.row(t("stat.seats"), num(def.seats * works)));
      if (def.beds) out.push(this.row(t("stat.beds"), num(def.beds * works)));
      if (def.tourism) {
        out.push(this.row(t("stat.tourism"), num(def.tourism * Math.min(1, works))));
        out.push(this.meter(t("insp.access"), lot.access, pct(lot.access)));
      }
      if (def.jobs) out.push(this.row(t("stat.jobs"), num(def.jobs)));
      if (!city.chill) out.push(this.row(t("stat.upkeep"), money(def.upkeep * city.budget[def.cat]) + " " + t("ui.perDay")));
    } else return null;
    out.push(h("button", { class: "btn red", onclick: () => {
      const go = () => { city.bulldozeLot(lot); this.game.sound("bulldoze"); this.close(); };
      if (lot.custom) this.ui.confirm("confirm.demolish", { name: "@b." + (PLACE_BY_KIND.get(lot.kind)?.key ?? "") }, go); else go();
    } }, icon("dozer"), t("ui.demolish")));
    return { title, content: out, pic: h("img", { src: thumbs.get(lot.kind, lot.level || 1), alt: "" }), cls };
  }

  // ------------------------------------------------------------------ options and help

  private options(): HTMLElement[] {
    const s = this.game.settings, city = this.city, game = this.game;
    const toggle = (label: string, value: boolean, set: (v: boolean) => void, note = "") => {
      const input = h("input", { type: "checkbox", checked: value });
      input.addEventListener("change", () => { set(input.checked); game.saveSettings(); game.sound("click"); });
      return h("label", { class: "toggle" }, h("span", null, label, note ? h("small", null, note) : null), h("span", { class: "switch" }, input, h("i")));
    };
    const seg = <T extends string>(label: string, value: T, options: [T, string][], set: (v: T) => void) => {
      const wrap = h("div", { class: "seg" });
      const draw = (cur: T) => fill(wrap, ...options.map(([v, text]) => h("button", { class: v === cur ? "on" : "", onclick: () => { set(v); game.saveSettings(); game.sound("click"); draw(v); } }, text)));
      draw(value);
      return h("div", { class: "field" }, h("span", null, label), wrap);
    };
    return [
      this.box(t("opt.general"), "gear",
        seg<Lang>(t("opt.language"), s.lang, [["en", "English"], ["de", "Deutsch"]], (v) => { s.lang = v; }),
        this.slider(t("opt.sound"), 0, 100, 5, Math.round(s.sfx * 100), (v) => v + "%", (v) => { s.sfx = v / 100; game.saveSettings(); }),
        this.slider(t("opt.ambience"), 0, 100, 5, Math.round(s.ambience * 100), (v) => v + "%", (v) => { s.ambience = v / 100; game.saveSettings(); })),
      this.box(t("opt.graphics"), "city",
        seg(t("opt.quality"), s.quality, [["low", t("opt.quality.low")], ["medium", t("opt.quality.medium")], ["high", t("opt.quality.high")]], (v) => { s.quality = v; }),
        toggle(t("opt.saver"), s.saver, (v) => { s.saver = v; }, t("opt.saverNote")),
        toggle(t("opt.dayNight"), s.dayNight, (v) => { s.dayNight = v; })),
      this.box(t("opt.game"), "star",
        toggle(t("opt.disasters"), city.disastersOn && !city.chill, (v) => { city.disastersOn = v; }, city.chill ? t("opt.disastersChill") : ""),
        toggle(t("opt.advisor"), s.advisor, (v) => { s.advisor = v; }),
        toggle(t("opt.cameraPad"), s.pad, (v) => { s.pad = v; }),
        h("p", { class: "note" }, t("opt.autosave"))),
    ];
  }

  private help(): HTMLElement[] {
    const touch = this.game.touch;
    const sec = (title: string, ic: string, text: string) => this.box(t(title), ic, h("p", null, t(text)));
    return [
      sec("help.camera", "eye", touch ? "help.camera.touch" : "help.camera.mouse"),
      sec("help.build", "hammer", touch ? "help.build.touch" : "help.build.mouse"),
      sec("help.roads", "roads", "help.roads.t"), sec("help.zones", "zones", "help.zones.t"), sec("help.services", "services", "help.services.t"),
      sec("help.traffic", "traffic", "help.traffic.t"), sec("help.landmarks", "landmarks", "help.landmarks.t"), sec("help.money", "coin", "help.money.t"),
      this.box(t("help.modes"), "star", ...(["chill", "normal", "hard"] as const).map((m) => h("p", null, h("b", null, t("mode." + m) + ": "), t("mode." + m + ".d")))),
      touch ? null : sec("help.keys", "gear", "help.keys.t"),
    ].filter((e): e is HTMLElement => !!e);
  }
}
