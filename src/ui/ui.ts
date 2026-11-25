// The interface over the 3D view: top bar, tools, messages, advisor.
import { CAT_UNLOCK, Cat, FEATURE_UNLOCK, Kind, MILESTONES, PLACE, PLACE_BY_KIND, PlaceDef, ROADS, Road, SEASONS, SEASON_DAYS, YEAR_DAYS, ZONES, Zone } from "../sim/defs";
import type { City, Notice, Tone } from "../sim/city";
import type { Lot } from "../sim/lots";
import type { RSeg } from "../sim/roads";
import { BRUSHES, Tool, Tools } from "../input/tools";
import type { InfoView } from "../render/overlay";
import type { View } from "../render/view";
import type { Sfx } from "../audio/sound";
import { clear, fill, h, setText } from "./dom";
import { money, num, pct, short, t } from "./i18n";
import { Panels } from "./panels";

export interface Settings {
  lang: "en" | "de"; sfx: number; ambience: number; quality: "low" | "medium" | "high"; dayNight: boolean; advisor: boolean; pad: boolean;
}
export interface GameApi {
  city: City; view: View; tools: Tools; settings: Settings;
  speed: number;
  setSpeed(n: number): void;
  sound(name: Sfx): void;
  saveSettings(): void;
  saveNow(quiet?: boolean): void;
  openMenu(): void;
}

type CatId = "inspect" | "roads" | "zones" | "power" | "water" | "services" | "edu" | "parks" | "transit" | "bulldoze" | "views";
const CATS: { id: CatId; icon: string; unlock: number }[] = [
  { id: "inspect", icon: "👆", unlock: 0 }, { id: "roads", icon: "🛣️", unlock: 0 }, { id: "zones", icon: "🏘️", unlock: 0 }, { id: "power", icon: "⚡", unlock: 0 },
  { id: "water", icon: "💧", unlock: 1 }, { id: "services", icon: "🚑", unlock: 2 }, { id: "edu", icon: "🎓", unlock: 2 }, { id: "parks", icon: "🌳", unlock: 1 },
  { id: "transit", icon: "🚌", unlock: 4 }, { id: "bulldoze", icon: "🚜", unlock: 0 }, { id: "views", icon: "🗺️", unlock: 0 },
];
const CAT_KINDS: Partial<Record<CatId, Cat[]>> = { power: ["power"], water: ["water"], services: ["health", "garbage", "police", "fire"], edu: ["edu"], parks: ["parks"], transit: ["transit"] };
export const ZONE_ICON = ["✖️", "🏠", "🏢", "🏪", "🏬", "🏭", "💼", "🌾", "🪵", "⛏️", "🛢️"];
const VIEWS: InfoView[] = ["", "traffic", "value", "pollution", "noise", "police", "fire", "health", "school", "charm", "flood", "soil", "forest", "ore", "oil"];
const VIEW_ICON: Record<string, string> = { "": "🏙️", traffic: "🚗", value: "💎", pollution: "🏭", noise: "🔊", police: "🚓", fire: "🚒", health: "🩺", school: "🏫", charm: "🌳", flood: "🌊", soil: "🌾", forest: "🌲", ore: "⛏️", oil: "🛢️" };
const VIEW_UNLOCK: Record<string, number> = { police: 3, fire: 3, health: 2, school: 2, charm: 1, flood: 5, soil: 4, forest: 4, ore: 6, oil: 6 };
const PROBLEM_ICON: Record<string, string> = { noRoad: "🚧", noPower: "⚡", noWater: "💧", sewage: "🚽", abandoned: "🏚️", fire: "🔥", burnt: "💥", flood: "🌊", unhappy: "😠" };
const SKY_ICON: Record<string, string> = { clear: "☀️", cloudy: "☁️", rain: "🌧️", storm: "⛈️", fog: "🌫️", snow: "🌨️" };
const SEASON_ICON = ["🌱", "🌻", "🍂", "❄️"];

export const milestoneName = (n: number) => t("ms." + n);

export class UI {
  root: HTMLElement;
  panels: Panels;
  private hud = { pop: h("b"), money: h("b"), net: h("small"), happy: h("b"), happyIcon: h("span"), traffic: h("b"), title: h("b"), rank: h("span"), clock: h("span"), date: h("span", { class: "long" }), sky: h("span") };
  private bars: HTMLElement[] = [];
  private speedButtons: HTMLElement[] = [];
  private toolbar = h("div", { class: "toolbar" });
  private tray = h("div", { class: "tray" });
  private trayDesc = h("div", { class: "tray-desc" });
  private hint = h("div", { class: "hint" });
  private toasts = h("div", { class: "toasts" });
  private advisor = h("div", { class: "advisor" });
  private markers = h("div", { class: "markers" });
  private modal = h("div", { class: "modal-back hidden" });
  private pad = h("div", { class: "pad" });
  private cat: CatId = "inspect";
  private advice = "";
  private adviceSeen = "";
  private adviceOpen = true;
  private markerLots: Lot[] = [];
  private markerEls: HTMLElement[] = [];
  private slow = 0;
  private trayKey = "";
  private lastMilestone = -1;
  private cutOff = false;
  private anyZoned = false;

  constructor(readonly game: GameApi) {
    this.root = document.getElementById("ui")!;
    this.panels = new Panels(this);
    clear(this.root);
    const chip = (cls: string, icon: string | HTMLElement, value: HTMLElement, extra: HTMLElement | null, title: string, click: () => void) =>
      h("button", { class: "chip " + cls, title: t(title), onclick: () => { game.sound("click"); click(); } }, typeof icon === "string" ? h("span", { class: "ico" }, icon) : icon, value, extra);
    const demand = h("button", { class: "demand", title: t("hud.demand"), onclick: () => this.panels.toggle("city") },
      ...(["r", "c", "i", "o"] as const).map((k) => {
        const bar = h("i");
        this.bars.push(bar);
        return h("span", { class: "bar " + k }, bar, h("em", null, t("hud." + k).charAt(0)));
      }));
    this.hud.happyIcon.className = "ico";
    const speeds = h("div", { class: "speeds" }, ...[0, 1, 2, 4].map((s, i) => {
      const b = h("button", { title: s ? t("ui.speed", { n: i }) : t("ui.pause"), onclick: () => { game.setSpeed(s); game.sound("click"); } }, s === 0 ? "⏸" : "▶".repeat(i));
      this.speedButtons.push(b);
      return b;
    }));
    const top = h("div", { class: "hud" },
      h("button", { class: "menu-btn", title: t("ui.menu"), onclick: () => game.openMenu() }, "☰"),
      h("button", { class: "city-name", onclick: () => this.panels.toggle("city") }, this.hud.title, this.hud.rank),
      h("div", { class: "chips" },
        chip("pop", "👥", this.hud.pop, null, "hud.pop", () => this.panels.toggle("city")),
        chip("money", "🪙", this.hud.money, this.hud.net, "hud.money", () => this.panels.toggle("budget")),
        chip("happy", this.hud.happyIcon, this.hud.happy, null, "hud.happy", () => this.panels.toggle("city")),
        chip("traffic", "🚗", this.hud.traffic, null, "hud.traffic", () => this.setView(game.view.infoView === "traffic" ? "" : "traffic")),
        demand),
      h("div", { class: "clock" }, this.hud.sky, this.hud.date, this.hud.clock),
      speeds);
    this.pad.append(
      ...([["⟲", () => { game.view.goal.yaw += 0.5; }], ["⟳", () => { game.view.goal.yaw -= 0.5; }], ["⤒", () => { game.view.goal.pitch += 0.2; }], ["⤓", () => { game.view.goal.pitch -= 0.2; }],
        ["＋", () => { game.view.goal.dist *= 0.75; }], ["－", () => { game.view.goal.dist *= 1.33; }]] as [string, () => void][]).map(([label, act]) => h("button", { onclick: act }, label)));
    this.modal.addEventListener("click", (e) => { if (e.target === this.modal) this.closeModal(); });
    this.root.append(this.markers, top, this.toasts, this.pad, this.advisor, this.panels.el, h("div", { class: "bottom" }, this.hint, h("div", { class: "tray-wrap" }, this.trayDesc, this.tray), this.toolbar), this.modal);
    this.buildToolbar();
    this.toolChanged();
    this.update(true);
  }

  get city() { return this.game.city; }

  // ------------------------------------------------------------------ tools

  private buildToolbar() {
    fill(this.toolbar, ...CATS.map((c) => {
      const locked = !this.city.unlocked(c.unlock);
      return h("button", {
        class: "cat" + (this.cat === c.id ? " on" : "") + (locked ? " locked" : ""), "data-cat": c.id,
        title: locked ? t("ui.locked", { name: milestoneName(c.unlock) }) : t("cat." + c.id),
        onclick: () => { this.game.sound("click"); this.pickCat(c.id); },
      }, h("span", { class: "ico" }, locked ? "🔒" : c.icon), h("span", { class: "lbl" }, t("cat." + c.id)));
    }));
  }

  pickCat(id: CatId) {
    const tools = this.game.tools;
    if (this.cat === id && id !== "inspect" && id !== "bulldoze") { this.cat = "inspect"; tools.set({ t: "inspect" }); this.refreshTools(); return; }
    this.cat = id;
    if (id === "inspect") tools.set({ t: "inspect" });
    else if (id === "bulldoze") tools.set({ t: "bulldoze" });
    else if (id === "roads") tools.set({ t: "road", type: Road.Street, mode: "straight" });
    else if (id === "zones") tools.set({ t: "zone", zone: Zone.ResLow });
    else if (id === "views") tools.set({ t: "inspect" });
    else {
      const first = PLACE.find((p) => CAT_KINDS[id]!.includes(p.cat) && this.city.unlocked(p.unlock));
      tools.set(first ? { t: "place", kind: first.kind } : { t: "inspect" });
    }
    if (id !== "views" && this.game.view.infoView !== "" && this.game.view.infoView !== "traffic") { /* keep the view the player chose */ }
    this.refreshTools();
  }

  /** Draws the row of tool buttons and the choices of the picked one again. */
  refreshTools() {
    this.buildToolbar();
    this.trayKey = "";
    this.buildTray();
    this.hintChanged();
  }

  toolChanged() {
    const tool = this.game.tools.tool;
    if (tool.t === "inspect" && this.cat !== "views" && this.cat !== "inspect") this.cat = "inspect";
    this.refreshTools();
  }

  private item(icon: string | HTMLElement, name: string, cost: string, on: boolean, unlock: number, act: () => void, title = ""): HTMLElement {
    const locked = !this.city.unlocked(unlock);
    return h("button", {
      class: "item" + (on ? " on" : "") + (locked ? " locked" : ""), title: locked ? t("ui.locked", { name: milestoneName(unlock) }) : title,
      onclick: () => { if (locked) { this.toast("ui.locked", "warn", { name: milestoneName(unlock) }); this.game.sound("error"); return; } this.game.sound("click"); act(); this.trayKey = ""; this.buildTray(); },
    }, typeof icon === "string" ? h("span", { class: "ico" }, locked ? "🔒" : icon) : icon, h("span", { class: "nm" }, name), cost ? h("span", { class: "cost" }, locked ? milestoneName(unlock) : cost) : null);
  }

  private describe(def: PlaceDef): string {
    const parts: string[] = [t("bd." + def.key)];
    if (def.makesPower) parts.push(`${t("stat.makesPower")} ${num(def.makesPower)}`);
    if (def.makesWater) parts.push(`${t("stat.makesWater")} ${num(def.makesWater)}`);
    if (def.sewage) parts.push(`${t("stat.sewage")} ${num(def.sewage)}`);
    if (def.garbage) parts.push(`${t("stat.garbage")} ${num(def.garbage)}`);
    if (def.seats) parts.push(`${t("stat.seats")} ${num(def.seats)}`);
    if (def.beds) parts.push(`${t("stat.beds")} ${num(def.beds)}`);
    parts.push(`${t("stat.upkeep")} ${money(def.upkeep)}`);
    return parts.join(" · ");
  }

  private buildTray() {
    const tools = this.game.tools, tool = tools.tool, city = this.city, view = this.game.view;
    const key = this.cat + ":" + JSON.stringify(tool) + ":" + tools.brush + ":" + city.milestone + ":" + view.infoView;
    if (key === this.trayKey) return;
    this.trayKey = key;
    const items: HTMLElement[] = [];
    let desc = "";
    if (this.cat === "roads" && tool.t === "road") {
      for (const mode of ["straight", "curve", "upgrade"] as const) {
        items.push(h("button", { class: "mode" + (tool.mode === mode ? " on" : ""), onclick: () => { this.game.sound("click"); tools.set({ ...tool, mode }); } }, t("tool." + mode)));
      }
      items.push(h("span", { class: "sep" }));
      ROADS.forEach((r, type) => {
        items.push(this.item(h("span", { class: "road-ico r" + type }), t("r." + r.key), money(r.cost * 10) + "/10 m", tool.type === type, r.unlock, () => tools.set({ ...tool, type })));
      });
      desc = t("rd." + ROADS[tool.type].key);
    } else if (this.cat === "zones" && tool.t === "zone") {
      for (let z = 1; z < ZONES.length; z++) {
        const zd = ZONES[z];
        const ico = h("span", { class: "zone-ico", style: { background: "#" + zd.color.toString(16).padStart(6, "0") } }, ZONE_ICON[z]);
        items.push(this.item(ico, t("z." + zd.key), "", tool.zone === z, zd.unlock, () => tools.set({ t: "zone", zone: z })));
      }
      items.push(this.item("🧽", t("tool.dezone"), "", tool.zone === Zone.None, 0, () => tools.set({ t: "zone", zone: Zone.None })));
      items.push(h("span", { class: "sep" }));
      BRUSHES.forEach((_, i) => items.push(h("button", { class: "mode brush" + (tools.brush === i ? " on" : ""), title: t("tool.brush"), onclick: () => { tools.brush = i; this.trayKey = ""; this.buildTray(); } }, h("i", { style: { width: 8 + i * 7 + "px", height: 8 + i * 7 + "px" } }))));
      desc = tool.zone ? t("zd." + ZONES[tool.zone].key) : "";
    } else if (this.cat === "views") {
      for (const v of VIEWS) {
        items.push(this.item(VIEW_ICON[v], t("view." + (v || "none")), "", view.infoView === v, VIEW_UNLOCK[v] ?? 0, () => this.setView(v)));
      }
    } else if (CAT_KINDS[this.cat]) {
      const kinds = PLACE.filter((p) => CAT_KINDS[this.cat]!.includes(p.cat));
      for (const def of kinds) {
        items.push(this.item(def.icon, t("b." + def.key), money(def.cost), tool.t === "place" && tool.kind === def.kind, def.unlock, () => tools.set({ t: "place", kind: def.kind })));
      }
      if (this.cat === "transit") {
        items.push(h("span", { class: "sep" }));
        items.push(this.item("🚏", t("tool.busLine"), "", tool.t === "line" && !tool.metro, FEATURE_UNLOCK.transit, () => tools.set({ t: "line", metro: false })));
        items.push(this.item("🚉", t("tool.metroLine"), "", tool.t === "line" && tool.metro, FEATURE_UNLOCK.metro, () => tools.set({ t: "line", metro: true })));
        items.push(this.item("📋", t("tool.lines"), "", false, FEATURE_UNLOCK.transit, () => this.panels.open("transit")));
      }
      if (tool.t === "place") desc = this.describe(PLACE_BY_KIND.get(tool.kind)!);
    }
    fill(this.tray, ...items);
    this.tray.parentElement!.classList.toggle("hidden", !items.length);
    setText(this.trayDesc, desc);
    this.trayDesc.classList.toggle("hidden", !desc);
  }

  setView(v: InfoView) {
    this.game.view.infoView = v;
    this.trayKey = "";
    this.buildTray();
  }

  hintChanged() {
    const hint = this.game.tools.hint();
    this.hint.classList.toggle("hidden", !hint);
    if (!hint) return;
    this.hint.classList.toggle("bad", !!hint.bad);
    fill(this.hint,
      h("span", { class: "txt" }, t(hint.key, hint.args)),
      hint.cost !== undefined && !this.city.chill ? h("span", { class: "cost" }, money(hint.cost)) : null,
      ...hint.buttons.map((b) => h("button", { class: b.primary ? "primary" : "", onclick: () => { this.game.sound("click"); b.act(); } }, t(b.label))));
  }

  // ------------------------------------------------------------------ messages

  toast(key: string, tone: Tone, args?: Record<string, string | number>, at?: { x: number; z: number }) {
    const el = h("button", { class: "toast " + tone }, t(key, args), at ? h("span", { class: "go" }, "📍") : null);
    el.addEventListener("click", () => {
      if (at) this.game.view.focus(at.x, at.z, Math.min(this.game.view.goal.dist, 260));
      el.remove();
    });
    this.toasts.append(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.classList.add("out"), tone === "bad" || tone === "warn" ? 7000 : 4500);
    setTimeout(() => el.remove(), tone === "bad" || tone === "warn" ? 7600 : 5100);
  }

  /** Shows what the simulation has to say. */
  private drain() {
    const city = this.city;
    while (city.notices.length) {
      const n: Notice = city.notices.shift()!;
      const args = n.key === "note.milestone" && n.args ? { name: milestoneName(Number(n.args.n)), reward: money(Number(n.args.reward)) } : n.args;
      this.toast(n.key, n.tone, args, n.x !== undefined ? { x: n.x, z: n.z! } : undefined);
      if (n.key === "note.milestone") this.game.sound("milestone");
      else if (n.key === "note.fire" || n.key === "note.fireNoHelp") this.game.sound("siren");
      else this.game.sound(n.tone === "bad" || n.tone === "warn" ? "warn" : "notify");
    }
  }

  confirm(key: string, args: Record<string, string | number>, yes: () => void) {
    fill(this.modal, h("div", { class: "modal" }, h("p", null, t(key, args)),
      h("div", { class: "row" },
        h("button", { class: "primary", onclick: () => { this.closeModal(); yes(); } }, t("ui.yes")),
        h("button", { onclick: () => this.closeModal() }, t("ui.no")))));
    this.modal.classList.remove("hidden");
  }
  /** A box with any content over the game. */
  showModal(...content: HTMLElement[]) {
    fill(this.modal, h("div", { class: "modal" }, ...content));
    this.modal.classList.remove("hidden");
  }
  closeModal() { this.modal.classList.add("hidden"); clear(this.modal); }
  get modalOpen() { return !this.modal.classList.contains("hidden"); }

  inspect(target: { lot?: Lot; seg?: RSeg } | null) {
    this.game.tools.select(target?.lot ?? null);
    if (!target) { if (this.panels.current === "inspect") this.panels.close(); return; }
    this.panels.open("inspect", target);
  }

  // ------------------------------------------------------------------ advisor

  private advise(): string {
    const c = this.city, st = c.stats, n = c.count;
    if (!(n.roads > 0)) return c.chill ? "adv.chill" : "adv.start";
    if (!this.anyZoned && st.buildings === 0) return "adv.zoneHomes";
    if (this.cutOff) return "adv.highway";
    if (st.buildings > 0 && st.powerMake <= 0) return "adv.power";
    if (st.buildings > 0 && st.cCap + st.iCap === 0 && st.homes > 20) return "adv.zoneJobs";
    if (st.powerNeed > st.powerMake * 1.02) return "adv.morePower";
    if (c.unlocked(FEATURE_UNLOCK.water) && st.buildings > 5) {
      if (st.waterMake <= 0 || st.sewageCap <= 0) return "adv.water";
      if (st.waterNeed > st.waterMake * 1.02) return "adv.moreWater";
      if (st.sewageNeed > st.sewageCap * 1.02) return "adv.sewage";
    }
    if (!c.chill && (c.money < 0 || (st.net < -30 && c.money < 8000))) return "adv.money";
    if (c.unlocked(2) && st.pop > 300 && (st.seats[0] <= 0 || st.beds <= 0 || st.garbageCap <= 0)) return "adv.services";
    if (c.unlocked(3) && st.pop > 700 && !(n["placed" + Kind.Fire] > 0 && n["placed" + Kind.Police] > 0)) return "adv.safety";
    if (st.flow < 0.55 && st.cars > 30) return "adv.traffic";
    if (st.unemployment > 0.12 && st.pop > 100) return "adv.jobs";
    if (st.jobs > st.workers * 1.3 + 30 && st.pop > 150) return "adv.workers";
    if (st.happy < 0.45 && st.pop > 100) return "adv.unhappy";
    if (c.unlocked(FEATURE_UNLOCK.transit) && !c.transit.lines.length && st.pop > 2200) return "adv.transit";
    if (c.unlocked(5) && c.edu[2] < 0.05 && st.pop > 3500) return "adv.edu";
    if (c.demand.r < 0 && st.pop > 50) return "adv.noDemand";
    return st.pop < 400 ? "adv.grow" : "adv.fine";
  }

  /** Are most zoned plots on roads that don't lead to the highway? */
  private checkConnection() {
    const c = this.city;
    let on = 0, off = 0;
    for (const lot of c.lots.lots.values()) {
      if (!lot.zone) continue;
      const comp = lot.seg ? c.roads.componentOf(lot.seg) : 0;
      if (comp && c.roads.reachesOutside(comp)) on++; else off++;
    }
    this.cutOff = off > on;
    this.anyZoned = on + off > 0;
  }

  private drawAdvisor() {
    const on = this.game.settings.advisor;
    this.advisor.classList.toggle("hidden", !on);
    if (!on) return;
    const fresh = this.advice !== this.adviceSeen;
    if (!this.adviceOpen) {
      fill(this.advisor, h("button", { class: "adv-mini" + (fresh ? " fresh" : ""), title: t("adv.name"), onclick: () => { this.adviceOpen = true; this.adviceSeen = this.advice; this.drawAdvisor(); } }, "🧑‍💼"));
      return;
    }
    this.adviceSeen = this.advice;
    fill(this.advisor, h("div", { class: "adv-box" },
      h("span", { class: "face" }, "🧑‍💼"),
      h("p", null, t(this.advice)),
      h("button", { class: "x", title: t("adv.hide"), onclick: () => { this.adviceOpen = false; this.drawAdvisor(); } }, "✕")));
  }

  // ------------------------------------------------------------------ icons over buildings

  private collectMarkers() {
    const city = this.city, view = this.game.view, c = view.cam;
    const list: { lot: Lot; d: number }[] = [];
    if (c.dist < 950) {
      const r = c.dist * 1.3 + 60;
      for (const lot of city.lots.grid.query(c.x - r, c.z - r, c.x + r, c.z + r)) {
        if (!lot.kind || lot.built < 1 || !city.problem(lot)) continue;
        list.push({ lot, d: Math.hypot(lot.x - c.x, lot.z - c.z) });
      }
      list.sort((a, b) => a.d - b.d);
    }
    this.markerLots = list.slice(0, 36).map((m) => m.lot);
    while (this.markerEls.length < this.markerLots.length) {
      const el = h("span", { class: "marker" });
      this.markerEls.push(el);
      this.markers.append(el);
    }
    this.markerEls.forEach((el, i) => {
      const lot = this.markerLots[i];
      el.style.display = lot ? "" : "none";
      if (lot) setText(el, PROBLEM_ICON[city.problem(lot)] ?? "❗");
    });
  }

  /** Every frame: keeps the icons over their buildings. */
  frame() {
    const view = this.game.view;
    for (let i = 0; i < this.markerLots.length; i++) {
      const lot = this.markerLots[i], el = this.markerEls[i];
      const p = view.project(lot.x, lot.y + view.heightOf(lot) + 4, lot.z);
      if (!p.visible) { el.style.display = "none"; continue; }
      el.style.display = "";
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    }
  }

  // ------------------------------------------------------------------ numbers

  /** A few times a second: the numbers in the top bar and everything that follows the city. */
  update(force = false) {
    const city = this.city, st = city.stats, H = this.hud;
    this.drain();
    setText(H.title, city.name);
    setText(H.rank, milestoneName(city.milestone));
    setText(H.pop, short(st.pop));
    setText(H.money, city.chill ? "∞" : short(city.money));
    setText(H.net, city.chill ? "" : (st.net >= 0 ? "+" : "") + short(st.net));
    H.net.className = st.net >= 0 ? "plus" : "minus";
    H.money.className = !city.chill && city.money < 0 ? "minus" : "";
    setText(H.happy, st.pop > 0 ? pct(st.happy) : "–");
    setText(H.happyIcon, st.happy > 0.75 ? "😄" : st.happy > 0.55 ? "🙂" : st.happy > 0.4 ? "😐" : "😠");
    setText(H.traffic, pct(st.flow));
    const d = city.demand;
    ([d.r, d.c, d.i, d.o] as number[]).forEach((v, i) => {
      const bar = this.bars[i];
      bar.style.height = Math.round(Math.abs(v) * 50) + "%";
      bar.className = v >= 0 ? "up" : "down";
      (bar.parentElement as HTMLElement).style.display = i === 3 && !city.unlocked(ZONES[Zone.Office].unlock) ? "none" : "";
    });
    const W = city.weather;
    setText(H.sky, (SKY_ICON[W.sky] ?? "") + SEASON_ICON[W.season]);
    const hour = Math.floor(city.hour);
    setText(H.date, `${t("ui.day", { n: (city.day % YEAR_DAYS) + 1 })} · ${t("ui.year", { n: Math.floor(city.day / YEAR_DAYS) + 1 })}`);
    setText(H.clock, `${String(hour).padStart(2, "0")}:00`);
    (H.sky.parentElement as HTMLElement).title = `${t("season." + SEASONS[W.season])} · ${t("sky." + W.sky)} · ${H.date.textContent}`;
    const speeds = [0, 1, 2, 4];
    this.speedButtons.forEach((b, i) => b.classList.toggle("on", speeds[i] === this.game.speed));
    this.pad.classList.toggle("hidden", !this.game.settings.pad);

    this.slow -= 1;
    if (this.slow <= 0 || force) {
      this.slow = 3;
      if (city.milestone !== this.lastMilestone) {
        this.lastMilestone = city.milestone;
        this.refreshTools();
      }
      this.checkConnection();
      const advice = this.advise();
      if (advice !== this.advice || force) { this.advice = advice; this.drawAdvisor(); }
      this.collectMarkers();
      this.panels.refresh();
    }
  }

  /** The language or the city changed: draw everything again. */
  rebuild() {
    this.game.tools.refresh();
    this.lastMilestone = -1;
    this.advice = "";
    this.adviceOpen = true;
    this.panels.close();
    this.refreshTools();
    this.update(true);
  }

  setVisible(on: boolean) { this.root.classList.toggle("ingame", on); }
  unlockLabel(level: number) { return t("ui.locked", { name: milestoneName(level) }); }
  seasonDays() { return SEASON_DAYS; }
  catUnlock(cat: Cat) { return CAT_UNLOCK[cat]; }
  nextMilestone() { return MILESTONES[this.city.milestone + 1]; }
}
