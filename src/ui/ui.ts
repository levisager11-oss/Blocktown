// The interface over the 3D view: the top bar, the build button with its fan of categories and drawer of
// cards, the bar of the tool in use, handles and buttons floating over the map, messages and the advisor.
import { CAT_UNLOCK, Cat, DRAWN_ROADS, FEATURE_UNLOCK, Kind, MILESTONES, MILESTONE_REWARD, PLACE, PLACE_BY_KIND, PlaceDef, ROADS, ROUNDABOUT, Road, SEASONS, YEAR_DAYS, ZONES, Zone } from "../sim/defs";
import type { City, Notice, Tone } from "../sim/city";
import type { Lot } from "../sim/lots";
import type { RSeg } from "../sim/roads";
import { BRUSHES, Handle, Hint, STREET_BRUSH, Tool, Tools } from "../input/tools";
import type { InfoView } from "../render/overlay";
import type { Thumbs } from "../render/thumbs";
import type { View } from "../render/view";
import type { Sfx } from "../audio/sound";
import { clear, fill, h, setText } from "./dom";
import { money, num, pct, short, t } from "./i18n";
import { icon, iconSvg } from "./icons";
import { Panels } from "./panels";

export interface Settings {
  lang: "en" | "de"; sfx: number; ambience: number; quality: "low" | "medium" | "high"; dayNight: boolean; advisor: boolean; pad: boolean;
  /** Draw at most 30 pictures a second, to save the battery. */
  saver: boolean;
}
export interface GameApi {
  city: City; view: View; tools: Tools; settings: Settings; thumbs: Thumbs;
  speed: number;
  touch: boolean;
  setSpeed(n: number): void;
  sound(name: Sfx): void;
  saveSettings(): void;
  saveNow(quiet?: boolean): void;
  openMenu(): void;
}

export type CatId = "roads" | "zones" | "power" | "water" | "services" | "edu" | "parks" | "transit" | "landmarks" | "views";
const CATS: { id: Exclude<CatId, "views">; icon: string; unlock: number }[] = [
  { id: "roads", icon: "roads", unlock: 0 }, { id: "zones", icon: "zones", unlock: 0 }, { id: "power", icon: "power", unlock: 0 },
  { id: "water", icon: "water", unlock: 1 }, { id: "services", icon: "services", unlock: 2 }, { id: "edu", icon: "edu", unlock: 2 },
  { id: "parks", icon: "parks", unlock: 1 }, { id: "transit", icon: "transit", unlock: 4 }, { id: "landmarks", icon: "landmarks", unlock: 1 },
];
const CAT_KINDS: Partial<Record<CatId, Cat[]>> = { power: ["power"], water: ["water"], services: ["health", "garbage", "police", "fire"], edu: ["edu"], parks: ["parks"], transit: ["transit"], landmarks: ["landmark"] };
const VIEWS: InfoView[] = ["traffic", "value", "pollution", "noise", "police", "fire", "health", "school", "charm", "flood", "soil", "forest", "ore", "oil"];
const VIEW_ICON: Record<string, string> = { "": "city", traffic: "traffic", value: "value", pollution: "pollution", noise: "noise", police: "police", fire: "fire", health: "health", school: "school", charm: "charm", flood: "flood", soil: "soil", forest: "forest", ore: "ore", oil: "oil" };
const VIEW_UNLOCK: Record<string, number> = { police: 3, fire: 3, health: 2, school: 2, charm: 1, flood: 5, soil: 4, forest: 4, ore: 6, oil: 6 };
const VIEW_TINT: Record<string, string> = { traffic: "#3ddc6a,#f5b83d,#e8453c", value: "#e6503c,#e6c83c,#3cc85a", pollution: "#fff0,#7a3c82", noise: "#fff0,#eb8228", police: "#fff0,#326ee6", fire: "#fff0,#e64632", health: "#fff0,#f05aa0", school: "#fff0,#f5be28", charm: "#fff0,#28be5a", flood: "#fff0,#2870f0", soil: "#fff0,#bec828", forest: "#fff0,#147832", ore: "#fff0,#aa5032", oil: "#fff0,#321e46" };
const PROBLEM_ICON: Record<string, string> = { noRoad: "noRoad", noPower: "noPower", noWater: "noWater", sewage: "sewage", abandoned: "abandoned", fire: "fire", burnt: "burnt", flood: "flood", unhappy: "unhappy" };
const SKY_ICON: Record<string, string> = { clear: "sun", cloudy: "cloud", rain: "rain", storm: "storm", fog: "fog", snow: "snow" };
const TONE_ICON: Record<Tone, string> = { good: "good", bad: "bad", warn: "warn", info: "info" };
export const ZONE_ICON = ["eraser", "zones", "city", "city", "city", "city", "city", "soil", "forest", "ore", "oil"];

export const milestoneName = (n: number) => t("ms." + n);

/** A road as seen from above, for the cards of the road tools. */
function roadPic(type: Road): string {
  const def = ROADS[type];
  const w = Math.min(15, def.width * 0.95);
  const y0 = 24 - w / 2, y1 = 24 + w / 2;
  let marks = "";
  if (type === Road.Street) marks = `<path d="M4 24h40" stroke="#eee" stroke-width="1.3" stroke-dasharray="4 4"/>`;
  else if (type === Road.Avenue) marks = `<path d="M4 23.2h40M4 24.8h40" stroke="#f2c84a" stroke-width="0.9"/><path d="M4 ${24 - w / 4}h40M4 ${24 + w / 4}h40" stroke="#eee" stroke-width="0.9" stroke-dasharray="3 3"/>`;
  else if (type === Road.Highway) marks = `<rect x="4" y="22.5" width="40" height="3" fill="#8d9096"/><path d="M4 ${24 - w / 4}h40M4 ${24 + w / 4}h40" stroke="#eee" stroke-width="0.9" stroke-dasharray="3 3"/>`;
  else if (type === Road.TramAvenue) marks = `<rect x="4" y="20" width="40" height="8" fill="#8d8579"/><path d="M4 21.3h40M4 23.2h40M4 24.8h40M4 26.7h40" stroke="#c6c9ce" stroke-width="0.7"/>`;
  else marks = `<path d="M4 24h40" stroke="#eee" stroke-width="1" stroke-dasharray="3 3"/>`;
  const arrows = def.oneway ? `<path d="M30 ${24 - w / 4 - 2}l4 2-4 2zM30 ${24 + w / 4 - 2}l4 2-4 2zM16 ${24 - w / 4 - 2}l4 2-4 2zM16 ${24 + w / 4 - 2}l4 2-4 2z" fill="#fff"/>` : "";
  return `<svg viewBox="0 0 48 48"><rect x="2" y="6" width="44" height="36" rx="8" fill="#7cc05a"/><rect x="2" y="${y0 - 2}" width="44" height="${w + 4}" fill="#cfcbbf"/><rect x="2" y="${y0}" width="44" height="${y1 - y0}" fill="#4b4e56"/>${marks}${arrows}</svg>`;
}

/** The advisor: a friendly mayor's assistant. */
const AVATAR = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#9fd8ff"/><path d="M10 64c2-14 11-20 22-20s20 6 22 20z" fill="#2c3f70"/><path d="M27 44l5 9 5-9z" fill="#fff"/><path d="M30.5 46h3l1 10-2.5 3-2.5-3z" fill="#ff5a4f"/><circle cx="32" cy="29" r="15" fill="#ffd6b0"/><path d="M17 27c0-11 7-16 15-16s15 5 15 16c-3-6-8-8-15-8s-12 2-15 8z" fill="#7a4a2a"/><circle cx="26" cy="29" r="2.2" fill="#233052"/><circle cx="38" cy="29" r="2.2" fill="#233052"/><path d="M26 36c3 3 9 3 12 0" stroke="#233052" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="21.5" cy="33.5" r="2.5" fill="#ff9b8a" opacity=".6"/><circle cx="42.5" cy="33.5" r="2.5" fill="#ff9b8a" opacity=".6"/></svg>`;

interface Item {
  id: string; name: string; desc: string; cost?: number; costText?: string; unlock: number; on: boolean; pick: () => void;
  pic: () => HTMLElement; tag?: string; tagDone?: boolean; no?: boolean;
}

export class UI {
  root: HTMLElement;
  panels: Panels;
  private hud = {
    badge: h("b"), ring: null as SVGCircleElement | null, title: h("b"), rank: h("span"),
    pop: h("b"), money: h("b"), net: h("small"), happy: h("b"), happyIcon: h("i", { class: "ic" }), traffic: h("b"),
    clock: h("span"), date: h("span", { class: "date" }), sky: h("span"),
  };
  private moneyPill!: HTMLElement;
  private bars: HTMLElement[] = [];
  private speedButtons: HTMLElement[] = [];
  private dock = h("div", { class: "dock" });
  private fab = h("button", { class: "fab", "aria-label": "Build" });
  private fan = h("div", { class: "fan" });
  private fanBack = h("div", { class: "fan-back" });
  private drawer = h("div", { class: "drawer hidden" });
  private toolbar = h("div", { class: "toolbar hidden" });
  private toasts = h("div", { class: "toasts" });
  private advisor = h("div", { class: "advisor" });
  private over = h("div", { class: "over" });
  private viewing = h("div", { class: "viewing hidden" });
  private modal = h("div", { class: "modal-back hidden" });
  private pad = h("div", { class: "campad" });
  private popup: HTMLElement | null = null;
  private popups: (() => void)[] = [];
  /** The category whose cards are shown (or were shown last). */
  private cat: CatId = "roads";
  private fanOpen = false;
  private drawerOpen = false;
  private advice = "";
  private adviceSeen = "";
  private adviceOpen = true;
  private markerLots: Lot[] = [];
  private markerEls: HTMLElement[] = [];
  private handleEls = new Map<string, HTMLElement>();
  private dragging: string | null = null;
  private ask: HTMLElement | null = null;
  private askAt: { x: number; y: number; z: number } | null = null;
  private floats: { el: HTMLElement; x: number; y: number; z: number; until: number }[] = [];
  private slow = 0;
  private lastMilestone = -1;
  private cutOff = false;
  private anyZoned = false;
  private lastMoney = 0;
  private toolKey = "";

  constructor(readonly game: GameApi) {
    this.root = document.getElementById("ui")!;
    this.panels = new Panels(this);
    clear(this.root);
    this.buildHud();
    this.buildDock();
    this.pad.append(...([["turnL", () => { game.view.goal.yaw += 0.5; }], ["turnR", () => { game.view.goal.yaw -= 0.5; }], ["tiltUp", () => { game.view.goal.pitch += 0.2; }], ["tiltDown", () => { game.view.goal.pitch -= 0.2; }],
      ["plus", () => { game.view.goal.dist *= 0.75; }], ["minus", () => { game.view.goal.dist *= 1.33; }]] as [string, () => void][]).map(([ic, act]) => h("button", { class: "btn navy", onclick: act }, icon(ic))));
    this.modal.addEventListener("click", (e) => { if (e.target === this.modal) this.closeModal(); });
    this.fanBack.addEventListener("pointerdown", () => this.closeFan());
    this.root.append(this.over, this.viewing, this.toasts, this.pad, this.advisor, this.fanBack, this.dock, this.drawer, this.toolbar, this.panels.el, this.modal);
    this.toolChanged();
    this.update(true);
  }

  get city() { return this.game.city; }
  get thumbs() { return this.game.thumbs; }

  // ------------------------------------------------------------------ the top bar

  private buildHud() {
    const game = this.game, H = this.hud;
    const NS = "http://www.w3.org/2000/svg";
    const ring = document.createElementNS(NS, "svg");
    ring.setAttribute("class", "ring");
    ring.setAttribute("viewBox", "0 0 68 68");
    const back = document.createElementNS(NS, "circle"), front = document.createElementNS(NS, "circle");
    for (const c of [back, front]) { c.setAttribute("cx", "34"); c.setAttribute("cy", "34"); c.setAttribute("r", "31"); }
    back.setAttribute("stroke", "rgba(29,42,77,0.55)");
    front.setAttribute("stroke", "#5ad16a");
    front.setAttribute("stroke-linecap", "round");
    front.setAttribute("stroke-dasharray", String(2 * Math.PI * 31));
    ring.append(back, front);
    H.ring = front;
    const badge = h("span", { class: "badge" }, H.badge);
    badge.prepend(ring as unknown as HTMLElement);
    const lvl = h("button", { class: "lvl", title: t("panel.city"), onclick: () => { game.sound("click"); this.panels.toggle("city"); } }, badge, h("span", { class: "lvl-txt" }, H.title, H.rank));
    const pill = (cls: string, ic: string | HTMLElement, value: HTMLElement, extra: HTMLElement | null, title: string, click: () => void) =>
      h("button", { class: "pill " + cls, title: t(title), onclick: () => { game.sound("click"); click(); } }, typeof ic === "string" ? icon(ic) : ic, value, extra);
    this.moneyPill = pill("money", "coin", H.money, h("span", { style: { display: "contents" } }, H.net, h("span", { class: "plus-btn" }, icon("plus"))), "hud.money", () => this.panels.toggle("budget"));
    const demand = h("button", { class: "demand", title: t("hud.demand"), onclick: () => { game.sound("click"); this.panels.toggle("city"); } },
      ...(["r", "c", "i", "o"] as const).map((k) => {
        const bar = h("i");
        this.bars.push(bar);
        return h("span", { class: "bar " + k }, bar, h("em", null, t("hud." + k).charAt(0)));
      }));
    const happy = pill("happy", H.happyIcon, H.happy, null, "hud.happy", () => this.panels.toggle("city"));
    const speeds = h("div", { class: "speeds" }, ...[0, 1, 2, 4].map((s, i) => {
      const b = h("button", { class: s === 0 ? "pause" : "", title: s ? t("ui.speed", { n: i }) : t("ui.pause"), onclick: () => { game.setSpeed(s); game.sound("click"); } }, icon(["pause", "play", "ff", "fff"][i]));
      this.speedButtons.push(b);
      return b;
    }));
    const top = h("div", { class: "hud" },
      lvl,
      h("div", { class: "res" },
        this.moneyPill,
        pill("pop", "people", H.pop, null, "hud.pop", () => this.panels.toggle("city")),
        happy,
        pill("traffic", "car", H.traffic, null, "hud.traffic", () => this.setView(game.view.infoView === "traffic" ? "" : "traffic")),
        demand),
      h("div", { class: "hud-right" },
        h("div", { class: "clock" }, H.sky, h("span", null, H.clock), H.date),
        speeds,
        h("button", { class: "btn navy gear", title: t("ui.menu"), onclick: () => game.openMenu() }, icon("menu"))));
    this.root.append(top);
  }

  // ------------------------------------------------------------------ the build button, its fan and the drawer

  private buildDock() {
    const game = this.game;
    this.fab.append(icon("hammer"));
    this.fab.addEventListener("click", () => {
      if (this.drawerOpen) { this.closeDrawer(); game.sound("close"); }
      else if (this.fanOpen) { this.closeFan(); game.sound("close"); }
      else this.openFan();
    });
    const side = (cls: string, ic: string, label: string, act: () => void) =>
      h("div", { class: "side" }, h("button", { class: "btn round " + cls, title: t(label), onclick: () => { game.sound("click"); act(); } }, icon(ic)), h("label", null, t(label)));
    this.dock.append(
      side("gold", "dozer", "cat.bulldoze", () => { this.closeFan(); this.closeDrawer(); game.tools.set({ t: "bulldoze" }); }),
      h("div", { style: { position: "relative" } }, this.fan, this.fab),
      side("purple", "layers", "cat.views", () => { this.closeFan(); this.openDrawer("views"); }));
    this.drawFan();
  }

  private drawFan() {
    const n = CATS.length, narrow = innerWidth < 500;
    const rx = narrow ? Math.min(160, innerWidth / 2 - 34) : 230, ry = narrow ? 200 : 190;
    fill(this.fan, ...CATS.map((c, i) => {
      // A half ellipse above the button, from left to right.
      const a = Math.PI - (i / (n - 1)) * Math.PI;
      const x = Math.cos(a) * rx, y = -Math.sin(a) * ry - 6;
      const locked = !this.city.unlocked(c.unlock);
      const b = h("button", { class: "k-" + c.id + (locked ? " locked" : ""), title: t("cat." + c.id), style: { "--x": x + "px", "--y": y + "px", transitionDelay: (this.fanOpen ? i * 0.025 : 0) + "s" },
        onclick: () => {
          if (locked) { this.toast("ui.locked", "warn", { name: milestoneName(c.unlock) }); this.game.sound("error"); return; }
          this.game.sound("pop");
          this.closeFan();
          this.openDrawer(c.id);
        } }, icon(c.icon), h("span", null, t("cat." + c.id)));
      if (locked) b.append(icon("lock", "lk"));
      return b;
    }));
  }

  openFan() {
    if (this.game.tools.tool.t !== "inspect") this.game.tools.set({ t: "inspect" });
    this.fanOpen = true;
    this.drawFan();
    requestAnimationFrame(() => this.fan.classList.add("open"));
    this.fanBack.classList.add("on");
    this.fab.classList.add("open");
    this.dock.classList.add("fanning");
    this.advisor.classList.add("hidden");
    this.game.sound("whoosh");
  }
  closeFan() {
    this.fanOpen = false;
    this.fan.classList.remove("open");
    this.fanBack.classList.remove("on");
    this.fab.classList.toggle("open", this.drawerOpen);
    this.dock.classList.remove("fanning");
    this.drawAdvisor();
  }

  openDrawer(cat: CatId) {
    this.cat = cat;
    this.drawerOpen = true;
    this.drawDrawer();
    this.drawer.classList.remove("hidden");
    this.dock.classList.add("hidden");
    this.toolbar.classList.add("hidden");
    this.fab.classList.add("open");
  }
  closeDrawer() {
    if (!this.drawerOpen) return;
    this.drawerOpen = false;
    this.drawer.classList.add("hidden");
    this.fab.classList.remove("open");
    this.toolChanged();
  }

  /** The cards of a category. */
  private items(cat: CatId): Item[] {
    const tools = this.game.tools, tool = tools.tool, city = this.city, thumbs = this.thumbs;
    const img = (kind: number, level = 1) => () => h("img", { src: thumbs.get(kind, level), alt: "" });
    const pic = (name: string) => () => h("span", { class: "pic" }, icon(name));
    const svg = (markup: string) => () => h("span", { class: "pic", html: markup });
    const out: Item[] = [];
    if (cat === "roads") {
      const last = tool.t === "road" ? tool.type : Road.Street;
      for (const type of DRAWN_ROADS) {
        const r = ROADS[type];
        out.push({ id: "r" + type, name: t("r." + r.key), desc: t("rd." + r.key), costText: money(r.cost * 10) + " / 10 m", unlock: r.unlock, on: tool.t === "road" && tool.type === type && (tool.mode === "straight" || tool.mode === "curve"),
          pick: () => tools.set({ t: "road", type, mode: this.game.touch ? "straight" : tool.t === "road" && tool.mode === "curve" ? "curve" : "straight", tunnel: tool.t === "road" ? tool.tunnel : false }), pic: svg(roadPic(type)) });
      }
      out.push({ id: "ring", name: t("tool.roundabout"), desc: t("td.roundabout"), cost: ROUNDABOUT.cost, unlock: FEATURE_UNLOCK.roundabout, on: tool.t === "road" && tool.mode === "roundabout", pick: () => tools.set({ t: "road", type: last, mode: "roundabout" }), pic: pic("roundabout") });
      out.push({ id: "upg", name: t("tool.upgrade"), desc: t("td.upgrade"), unlock: 0, on: tool.t === "road" && tool.mode === "upgrade", pick: () => tools.set({ t: "road", type: last, mode: "upgrade" }), pic: pic("upgrade") });
      out.push({ id: "rev", name: t("tool.reverse"), desc: t("td.reverse"), unlock: ROADS[Road.OneWay].unlock, on: tool.t === "road" && tool.mode === "reverse", pick: () => tools.set({ t: "road", type: last, mode: "reverse" }), pic: pic("reverse") });
    } else if (cat === "zones") {
      for (let z = 1; z < ZONES.length; z++) {
        const zd = ZONES[z];
        out.push({ id: "z" + z, name: t("z." + zd.key), desc: t("zd." + zd.key), unlock: zd.unlock, on: tool.t === "zone" && tool.zone === z, pick: () => tools.set({ t: "zone", zone: z }), pic: img(z, zd.levels > 1 ? 2 : 1) });
      }
      out.push({ id: "z0", name: t("tool.dezone"), desc: t("hint.dezone"), unlock: 0, on: tool.t === "zone" && tool.zone === Zone.None, pick: () => tools.set({ t: "zone", zone: Zone.None }), pic: pic("eraser") });
    } else if (cat === "views") {
      for (const v of VIEWS) out.push({ id: "v" + v, name: t("view." + v), desc: "", unlock: VIEW_UNLOCK[v] ?? 0, on: this.game.view.infoView === v, pick: () => this.setView(this.game.view.infoView === v ? "" : v), pic: pic(VIEW_ICON[v]) });
    } else if (CAT_KINDS[cat]) {
      for (const def of PLACE.filter((p) => CAT_KINDS[cat]!.includes(p.cat))) {
        const built = def.unique && city.has(def.kind);
        out.push({ id: "k" + def.kind, name: t("b." + def.key), desc: this.describe(def), cost: def.cost, unlock: def.unlock, on: tool.t === "place" && tool.kind === def.kind, no: built,
          pick: () => { if (built) { this.toast("why.unique", "warn"); this.game.sound("error"); return; } tools.set({ t: "place", kind: def.kind }); }, pic: img(def.kind), tag: built ? t("ui.built") : def.unique ? t("ui.unique") : undefined, tagDone: built });
      }
      if (cat === "transit") {
        out.push({ id: "bus", name: t("tool.busLine"), desc: t("td.busLine"), unlock: FEATURE_UNLOCK.transit, on: tool.t === "line" && !tool.metro && !tool.tram, pick: () => tools.set({ t: "line", metro: false }), pic: pic("stop") });
        out.push({ id: "tram", name: t("tool.tramLine"), desc: t("td.tramLine"), unlock: FEATURE_UNLOCK.tram, on: tool.t === "line" && !!tool.tram, pick: () => tools.set({ t: "line", metro: false, tram: true }), pic: pic("tram") });
        out.push({ id: "metro", name: t("tool.metroLine"), desc: t("td.metroLine"), unlock: FEATURE_UNLOCK.metro, on: tool.t === "line" && tool.metro, pick: () => tools.set({ t: "line", metro: true }), pic: pic("metro") });
        out.push({ id: "lines", name: t("tool.lines"), desc: "", unlock: FEATURE_UNLOCK.transit, on: false, pick: () => { this.closeDrawer(); this.panels.open("transit"); }, pic: pic("list") });
      }
    }
    return out;
  }

  private describe(def: PlaceDef): string {
    const parts: string[] = [t("bd." + def.key)];
    if (def.makesPower) parts.push(`${t("stat.makesPower")} ${num(def.makesPower)}`);
    if (def.makesWater) parts.push(`${t("stat.makesWater")} ${num(def.makesWater)}`);
    if (def.sewage) parts.push(`${t("stat.sewage")} ${num(def.sewage)}`);
    if (def.garbage) parts.push(`${t("stat.garbage")} ${num(def.garbage)}`);
    if (def.seats) parts.push(`${t("stat.seats")} ${num(def.seats)}`);
    if (def.beds) parts.push(`${t("stat.beds")} ${num(def.beds)}`);
    if (def.tourism) parts.push(`${t("stat.tourism")} ${num(def.tourism)}`);
    if (!this.city.chill) parts.push(`${t("stat.upkeep")} ${money(def.upkeep)}`);
    return parts.join(" · ");
  }

  private drawDrawer() {
    const city = this.city, cat = this.cat;
    const tabs = h("div", { class: "tabs" }, ...[...CATS, { id: "views" as const, icon: "layers", unlock: 0 }].map((c) => {
      const locked = !city.unlocked(c.unlock);
      return h("button", { class: "tab k-" + c.id + (c.id === cat ? " on" : "") + (locked ? " locked" : ""), title: t("cat." + c.id),
        onclick: () => {
          if (locked) { this.toast("ui.locked", "warn", { name: milestoneName(c.unlock) }); this.game.sound("error"); return; }
          this.game.sound("click"); this.openDrawer(c.id);
        } }, icon(c.icon));
    }));
    const items = this.items(cat);
    const desc = h("p", { class: "desc" }, items.find((i) => i.on)?.desc ?? "");
    const cards = h("div", { class: "cards" }, ...items.map((it) => {
      const locked = !city.unlocked(it.unlock);
      const price = it.cost !== undefined ? (city.chill ? null : h("span", { class: "price" }, icon("coin"), short(it.cost))) : it.costText && !city.chill ? h("span", { class: "price" }, it.costText) : null;
      const card = h("button", { class: "card k-" + cat + (it.on ? " on" : "") + (locked ? " locked" : "") + (it.no ? " no" : ""), title: it.name,
        onclick: () => {
          if (locked) { this.toast("ui.locked", "warn", { name: milestoneName(it.unlock) }); this.game.sound("error"); return; }
          this.game.sound("pop");
          it.pick();
          if (cat === "views") { this.closeDrawer(); return; }
          if (this.game.tools.tool.t !== "inspect") this.closeDrawer();
          else this.drawDrawer();
        } },
        it.pic(), h("span", { class: "nm" }, it.name),
        locked ? h("span", { class: "price" }, icon("lock"), milestoneName(it.unlock)) : price,
        locked ? null : it.tag ? h("span", { class: "tag" + (it.tagDone ? " done" : "") }, it.tag) : null);
      card.addEventListener("pointerenter", () => setText(desc, it.desc));
      return card;
    }));
    const close = h("button", { class: "btn red round small", title: t("ui.close"), style: { width: "44px", height: "44px" }, onclick: () => { this.game.sound("close"); this.closeDrawer(); } }, icon("close"));
    fill(this.drawer, h("div", { class: "drawer-head" }, tabs, close), h("div", { class: "drawer-title" }, t("cat." + cat), cat === "views" ? null : h("small", null, t("cath." + cat))), cards, desc);
  }

  // ------------------------------------------------------------------ the tool in use

  /** Which category a tool belongs to (for its colour and for going back to its cards). */
  private catOf(tool: Tool): CatId {
    if (tool.t === "road") return "roads";
    if (tool.t === "zone") return "zones";
    if (tool.t === "line") return "transit";
    if (tool.t === "place") {
      const cat = PLACE_BY_KIND.get(tool.kind)!.cat;
      for (const [id, cats] of Object.entries(CAT_KINDS)) if (cats!.includes(cat)) return id as CatId;
    }
    return this.cat;
  }

  /** The picture of the tool in use. */
  private toolPic(tool: Tool): HTMLElement {
    if (tool.t === "place") return h("img", { src: this.thumbs.get(tool.kind), alt: "" });
    if (tool.t === "zone") return tool.zone ? h("img", { src: this.thumbs.get(tool.zone, ZONES[tool.zone].levels > 1 ? 2 : 1), alt: "" }) : icon("eraser");
    if (tool.t === "road") {
      if (tool.mode === "roundabout") return icon("roundabout");
      if (tool.mode === "upgrade") return icon("upgrade");
      if (tool.mode === "reverse") return icon("reverse");
      return h("span", { class: "ic", style: { fontSize: "46px" }, html: roadPic(tool.type) });
    }
    if (tool.t === "line") return icon(tool.metro ? "metro" : tool.tram ? "tram" : "stop");
    if (tool.t === "bulldoze") return icon("dozer");
    return icon("eye");
  }

  /** The choices of the tool in use: road types and modes, brush sizes. */
  private options(tool: Tool): HTMLElement[] {
    const tools = this.game.tools, city = this.city, out: HTMLElement[] = [];
    const chip = (on: boolean, label: string, ic: string | HTMLElement | null, act: () => void, locked = 0) =>
      h("button", { class: "chip" + (on ? " on" : "") + (locked && !city.unlocked(locked) ? " locked" : ""),
        onclick: () => {
          if (locked && !city.unlocked(locked)) { this.toast("ui.locked", "warn", { name: milestoneName(locked) }); this.game.sound("error"); return; }
          this.game.sound("click"); act();
        } }, typeof ic === "string" ? icon(ic) : ic, label);
    if (tool.t === "road") {
      if (tool.mode === "straight" || tool.mode === "curve") {
        if (!this.game.touch) {
          out.push(chip(tool.mode === "straight", t("tool.straight"), "straight", () => tools.set({ ...tool, mode: "straight" })));
          out.push(chip(tool.mode === "curve", t("tool.curve"), "curve", () => tools.set({ ...tool, mode: "curve" })));
        }
        out.push(chip(!!tool.tunnel, t("tool.tunnel"), "tunnel", () => tools.set({ ...tool, tunnel: !tool.tunnel }), FEATURE_UNLOCK.tunnel));
      }
      if (tool.mode === "upgrade") {
        for (const type of DRAWN_ROADS) if (type !== Road.Highway || city.unlocked(ROADS[type].unlock))
          out.push(chip(tool.type === type, t("r." + ROADS[type].key), h("span", { class: "ic", style: { fontSize: "22px" }, html: roadPic(type) }), () => tools.set({ ...tool, type }), ROADS[type].unlock));
      }
    } else if (tool.t === "zone") {
      BRUSHES.forEach((_, i) => {
        const s = 8 + i * 5;
        out.push(chip(tools.brush === i, t("tool.size" + i), h("i", { class: "blob", style: { width: s + "px", height: s + "px", display: "block", borderRadius: "50%", background: "currentColor" } }), () => { tools.brush = i; this.toolKey = ""; this.toolChanged(); }));
      });
      out.push(chip(tools.brush === STREET_BRUSH, t("tool.street"), "street", () => { tools.brush = STREET_BRUSH; this.toolKey = ""; this.toolChanged(); }));
    }
    return out;
  }

  toolChanged() {
    const tool = this.game.tools.tool;
    const active = tool.t !== "inspect";
    this.dock.classList.toggle("hidden", active || this.drawerOpen);
    this.toolbar.classList.toggle("hidden", !active || this.drawerOpen);
    this.fab.classList.toggle("hello", !(this.city.count.roads > 0));
    if (active) this.closeFan();
    this.toolKey = "";
    this.hintChanged();
    this.drawAdvisor();
  }

  hintChanged() {
    const tools = this.game.tools, tool = tools.tool;
    if (tool.t === "inspect") { this.setAsk(null); return; }
    const hint = tools.hint();
    const key = JSON.stringify(tool) + ":" + tools.brush + ":" + this.city.milestone;
    const cat = this.catOf(tool);
    if (key !== this.toolKey) {
      this.toolKey = key;
      const who = h("button", { class: "who k-" + (tool.t === "bulldoze" ? "dozer" : cat), title: t("ui.swap"), onclick: () => { this.game.sound("click"); if (tool.t === "bulldoze") return; this.openDrawer(cat); } }, this.toolPic(tool));
      if (tool.t !== "bulldoze") who.append(h("span", { class: "swap" }, icon("layers")));
      fill(this.toolbar, who, h("div", { class: "mid" }, h("div", { class: "say" }), h("div", { class: "opts" }, ...this.options(tool))), h("div", { class: "acts" }));
    }
    const say = this.toolbar.querySelector(".say") as HTMLElement, acts = this.toolbar.querySelector(".acts") as HTMLElement;
    say.classList.toggle("bad", !!hint?.bad);
    fill(say, hint ? t(hint.key, hint.args) : "",
      hint && hint.cost !== undefined && !this.city.chill ? h("span", { class: "cost" }, icon("coin"), num(hint.cost)) : null);
    const buttons = hint?.buttons ?? [];
    const yes = buttons.filter((b) => b.primary);
    const other = buttons.filter((b) => !b.primary && b.label !== "ui.cancel");
    fill(acts,
      ...other.map((b) => h("button", { class: "btn round small navy", title: t(b.label), onclick: () => { this.game.sound("click"); b.act(); } }, icon(b.icon ?? "undo"))),
      ...yes.map((b) => h("button", { class: "btn round " + (b.danger ? "red" : "green"), title: t(b.label), onclick: () => { this.game.sound("click"); b.act(); } }, icon(b.icon ?? "check"))),
      h("button", { class: "btn round red small", title: t("ui.done"), onclick: () => { this.game.sound("close"); if (!tools.cancel()) tools.set({ t: "inspect" }); else if (!buttons.length) tools.set({ t: "inspect" }); } }, icon("close")));
    this.setAsk(hint);
  }

  /** The tick and cross floating next to something that waits for a yes. */
  private setAsk(hint: Hint | null) {
    const yes = hint?.buttons.find((b) => b.primary);
    if (!hint || !hint.at || !yes) {
      if (this.ask) { this.ask.remove(); this.ask = null; }
      this.askAt = null;
      return;
    }
    this.askAt = hint.at;
    if (!this.ask) { this.ask = h("div", { class: "ask" }); this.over.append(this.ask); }
    const tools = this.game.tools;
    fill(this.ask,
      h("button", { class: "btn round " + (yes.danger ? "red" : "green"), title: t(yes.label), onclick: () => { this.game.sound("click"); yes.act(); } }, icon(yes.icon ?? "check")),
      h("button", { class: "btn round small", title: t("ui.cancel"), onclick: () => { this.game.sound("close"); tools.cancel(); } }, h("span", { class: "ic", html: iconSvg("close").replace(/#ffffff/g, "#e0413a") })));
  }

  setView(v: InfoView) {
    this.game.view.infoView = v;
    if (!v) { this.viewing.classList.add("hidden"); return; }
    const tint = VIEW_TINT[v];
    fill(this.viewing, icon(VIEW_ICON[v]), t("view." + v),
      tint ? h("span", { class: "legend" }, h("i", { style: { background: `linear-gradient(90deg, ${tint})` } })) : null,
      h("button", { title: t("ui.close"), onclick: () => { this.game.sound("close"); this.setView(""); } }, icon("close")));
    this.viewing.classList.remove("hidden");
  }

  // ------------------------------------------------------------------ messages

  toast(key: string, tone: Tone, args?: Record<string, string | number>, at?: { x: number; z: number }) {
    const el = h("button", { class: "toast " + tone }, icon(TONE_ICON[tone]), h("span", null, t(key, args)), at ? h("span", { class: "go" }, icon("pin")) : null);
    el.addEventListener("click", () => {
      if (at) this.game.view.focus(at.x, at.z, Math.min(this.game.view.goal.dist, 260));
      el.remove();
    });
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    const long = tone === "bad" || tone === "warn";
    setTimeout(() => el.classList.add("out"), long ? 6500 : 4000);
    setTimeout(() => el.remove(), long ? 7000 : 4500);
  }

  /** Shows what the simulation has to say. */
  private drain() {
    const city = this.city;
    while (city.notices.length) {
      const n: Notice = city.notices.shift()!;
      if (n.key === "note.milestone" && n.args) { this.celebrate(Number(n.args.n)); continue; }
      this.toast(n.key, n.tone, n.args, n.x !== undefined ? { x: n.x, z: n.z! } : undefined);
      if (n.key === "note.fire" || n.key === "note.fireNoHelp") this.game.sound("siren");
      else this.game.sound(n.tone === "bad" || n.tone === "warn" ? "warn" : "notify");
    }
  }

  /** A new milestone: a big moment, with the reward and what is new. */
  celebrate(level: number) {
    const city = this.city;
    const unlocked: HTMLElement[] = [];
    const card = (cls: string, pic: HTMLElement, name: string) => h("div", { class: "card " + cls }, pic, h("span", { class: "nm" }, name));
    ROADS.forEach((r, type) => { if (r.unlock === level && !r.hidden) unlocked.push(card("k-roads", h("span", { class: "pic", html: roadPic(type as Road) }), t("r." + r.key))); });
    ZONES.forEach((z, i) => { if (i > 0 && z.unlock === level) unlocked.push(card("k-zones", h("img", { src: this.thumbs.get(i, z.levels > 1 ? 2 : 1), alt: "" }), t("z." + z.key))); });
    for (const p of PLACE) if (p.unlock === level) {
      const cat = (Object.entries(CAT_KINDS).find(([, cats]) => cats!.includes(p.cat))?.[0] ?? "parks") as CatId;
      unlocked.push(card("k-" + cat, h("img", { src: this.thumbs.get(p.kind), alt: "" }), t("b." + p.key)));
    }
    for (const [f, lv] of Object.entries(FEATURE_UNLOCK)) if (lv === level && ["transit", "metro", "tram", "tunnel", "roundabout"].includes(f)) unlocked.push(card("k-transit", h("span", { class: "pic" }, icon(f === "tunnel" ? "tunnel" : f === "roundabout" ? "roundabout" : f === "tram" ? "tram" : f === "metro" ? "metro" : "bus")), t("feat." + f)));
    this.show(() => {
      const box = h("div", { class: "prize" },
        h("div", { class: "ribbon" }, t("ms.popup")),
        h("div", { class: "big" }, h("b", null, String(level))),
        h("h2", null, t("ms.now", { name: milestoneName(level) })),
        city.chill ? null : h("div", { class: "reward" }, icon("coin"), "+" + num(MILESTONE_REWARD[level])),
        unlocked.length ? h("p", null, t("ms.newThings")) : null,
        unlocked.length ? h("div", { class: "unlocked" }, ...unlocked) : null,
        h("button", { class: "btn green", onclick: () => { this.game.sound("coins"); this.closePopup(); } }, t("ms.great")));
      this.game.sound("milestone");
      return box;
    });
    this.refreshTools();
  }

  /** An achievement (shown only outside Toki, which shows its own): a gold banner that doesn't stop the game. */
  achievement(name: string, ic: string) {
    this.game.sound("achievement");
    const el = h("div", { class: "toast ach" }, h("span", { class: "medal" }, ic), h("span", null, h("small", null, t("ach.title")), h("b", null, name)));
    this.toasts.prepend(el);
    setTimeout(() => el.classList.add("out"), 5000);
    setTimeout(() => el.remove(), 5500);
  }

  /** Shows a big moment over the game, one at a time, with confetti. */
  private show(make: () => HTMLElement) {
    if (this.popup) { this.popups.push(() => this.show(make)); return; }
    const canvas = h("canvas");
    this.popup = h("div", { class: "popup" }, canvas, make());
    this.root.append(this.popup);
    confetti(canvas);
  }
  private closePopup() {
    this.popup?.remove();
    this.popup = null;
    const next = this.popups.shift();
    if (next) setTimeout(next, 250);
  }
  get popupOpen() { return !!this.popup; }

  confirm(key: string, args: Record<string, string | number>, yes: () => void) {
    fill(this.modal, h("div", { class: "modal" }, h("p", null, t(key, args)),
      h("div", { class: "row" },
        h("button", { class: "btn red", onclick: () => { this.closeModal(); yes(); } }, icon("check"), t("ui.yes")),
        h("button", { class: "btn", onclick: () => this.closeModal() }, t("ui.no")))));
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

  // ------------------------------------------------------------------ things floating over the map

  /** Money spent: a red number floating up from where it went. */
  spent(cost: number, at: { x: number; y: number; z: number }) {
    if (cost <= 0) return;
    const el = h("span", { class: "float spend" }, "−", icon("coin"), num(cost));
    this.over.append(el);
    this.floats.push({ el, ...at, until: performance.now() + 1600 });
  }
  /** A building was finished: a puff of dust. */
  finished(lot: Lot) {
    const view = this.game.view, c = view.cam;
    if (Math.hypot(lot.x - c.x, lot.z - c.z) > c.dist * 1.2 || this.over.childElementCount > 120) return;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const el = h("span", { class: "puff", style: { "--dx": Math.cos(a) * 26 + "px", "--dy": Math.sin(a) * 12 - 6 + "px" } });
      this.over.append(el);
      this.floats.push({ el, x: lot.x, y: lot.y + 1, z: lot.z, until: performance.now() + 700 });
    }
  }

  private place(el: HTMLElement, x: number, y: number, z: number): boolean {
    const p = this.game.view.project(x, y, z);
    if (!p.visible) { el.style.display = "none"; return false; }
    el.style.display = "";
    el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
    return true;
  }

  private drawHandles(list: Handle[]) {
    const seen = new Set<string>();
    for (const hd of list) {
      seen.add(hd.id);
      let el = this.handleEls.get(hd.id);
      if (!el) {
        el = h("span", { class: "handle" + (hd.id === "c" ? " mid" : "") }, icon(hd.id === "c" ? "curve" : "pin"));
        if (hd.id === "c") (el.firstChild as HTMLElement).innerHTML = iconSvg("curve").replace(/#ffffff/g, "#8352e6");
        else (el.firstChild as HTMLElement).innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#2a7fe0"/></svg>`;
        const id = hd.id;
        el.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          this.dragging = id;
          el!.classList.add("drag");
          try { el!.setPointerCapture(e.pointerId); } catch { /* fine */ }
        });
        el.addEventListener("pointermove", (e) => { if (this.dragging === id) this.game.tools.dragHandle(id, e.clientX, e.clientY); });
        const end = () => { if (this.dragging === id) { this.dragging = null; el!.classList.remove("drag"); this.game.sound("click"); } };
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", end);
        this.handleEls.set(hd.id, el);
        this.over.append(el);
      }
      el.classList.toggle("snapped", hd.snapped);
      this.place(el, hd.x, hd.y, hd.z);
    }
    for (const [id, el] of this.handleEls) if (!seen.has(id)) { el.remove(); this.handleEls.delete(id); }
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
    if (st.flow < 0.55 && st.cars > 30) return c.unlocked(FEATURE_UNLOCK.roundabout) ? "adv.traffic2" : "adv.traffic";
    if (st.unemployment > 0.12 && st.pop > 100) return "adv.jobs";
    if (st.jobs > st.workers * 1.3 + 30 && st.pop > 150) return "adv.workers";
    if (st.happy < 0.45 && st.pop > 100) return "adv.unhappy";
    if (c.unlocked(FEATURE_UNLOCK.transit) && !c.transit.lines.length && st.pop > 2200) return "adv.transit";
    if (c.unlocked(5) && c.edu[2] < 0.05 && st.pop > 3500) return "adv.edu";
    if (c.demand.r < 0 && st.pop > 50) return "adv.noDemand";
    if (!c.sights.length && st.pop > 300 && c.unlocked(FEATURE_UNLOCK.landmarks)) return "adv.landmark";
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
    const on = this.game.settings.advisor && this.game.tools.tool.t === "inspect" && !this.drawerOpen;
    this.advisor.classList.toggle("hidden", !on);
    if (!on) return;
    const fresh = this.advice !== this.adviceSeen;
    const avatar = h("button", { class: "avatar" + (fresh && !this.adviceOpen ? " fresh" : ""), title: t("adv.name"), html: AVATAR,
      onclick: () => { this.game.sound("pop"); this.adviceOpen = !this.adviceOpen; this.adviceSeen = this.advice; this.drawAdvisor(); } });
    if (!this.adviceOpen) { fill(this.advisor, avatar); return; }
    this.adviceSeen = this.advice;
    fill(this.advisor, avatar, h("div", { class: "speech" }, h("b", null, t("adv.name")), t(this.advice),
      h("button", { class: "x", title: t("adv.hide"), onclick: () => { this.adviceOpen = false; this.drawAdvisor(); } }, icon("close"))));
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
    this.markerLots = list.slice(0, 30).map((m) => m.lot);
    while (this.markerEls.length < this.markerLots.length) {
      const el = h("span", { class: "marker" }, h("i", { class: "bubble" }));
      el.style.animationDelay = -Math.random() * 1.6 + "s";
      this.markerEls.push(el);
      this.over.prepend(el);
    }
    this.markerEls.forEach((el, i) => {
      const lot = this.markerLots[i];
      el.style.display = lot ? "" : "none";
      if (!lot) return;
      const name = PROBLEM_ICON[city.problem(lot)] ?? "bad";
      if (el.dataset.icon !== name) { el.dataset.icon = name; fill(el.firstChild as HTMLElement, icon(name)); }
    });
  }

  /** Every frame: keeps the things over the map in their places. */
  frame() {
    const view = this.game.view;
    for (let i = 0; i < this.markerLots.length; i++) {
      const lot = this.markerLots[i];
      this.place(this.markerEls[i], lot.x, lot.y + view.heightOf(lot) + 4, lot.z);
    }
    this.drawHandles(this.game.tools.handles());
    if (this.ask && this.askAt) this.place(this.ask, this.askAt.x, this.askAt.y, this.askAt.z);
    if (this.floats.length) {
      const now = performance.now();
      this.floats = this.floats.filter((f) => {
        if (now > f.until) { f.el.remove(); return false; }
        this.place(f.el, f.x, f.y, f.z);
        return true;
      });
    }
  }

  // ------------------------------------------------------------------ numbers

  /** A few times a second: the numbers in the top bar and everything that follows the city. */
  update(force = false) {
    const city = this.city, st = city.stats, H = this.hud;
    this.drain();
    setText(H.title, city.name);
    setText(H.badge, String(city.milestone));
    const next = MILESTONES[city.milestone + 1], prev = MILESTONES[city.milestone];
    const share = next ? Math.max(0, Math.min(1, (st.pop - prev) / (next - prev))) : 1;
    if (H.ring) H.ring.setAttribute("stroke-dashoffset", String(2 * Math.PI * 31 * (1 - share)));
    setText(H.rank, next && !city.chill ? `${milestoneName(city.milestone)} · ${Math.round(share * 100)}%` : milestoneName(city.milestone));
    setText(H.pop, short(st.pop));
    setText(H.money, city.chill ? "∞" : short(city.money));
    setText(H.net, city.chill ? "" : (st.net >= 0 ? "+" : "") + short(st.net));
    H.net.className = st.net >= 0 ? "plus" : "minus";
    H.money.className = !city.chill && city.money < 0 ? "minus" : "";
    if (!city.chill && Math.round(city.money) > this.lastMoney + 2000 && this.lastMoney) { this.moneyPill.classList.remove("bump"); void this.moneyPill.offsetWidth; this.moneyPill.classList.add("bump"); }
    this.lastMoney = Math.round(city.money);
    setText(H.happy, st.pop > 0 ? pct(st.happy) : "–");
    const mood = st.pop <= 0 ? "fine" : st.happy > 0.75 ? "happy" : st.happy > 0.6 ? "fine" : st.happy > 0.45 ? "meh" : st.happy > 0.3 ? "sad" : "angry";
    if (H.happyIcon.dataset.mood !== mood) { H.happyIcon.dataset.mood = mood; H.happyIcon.innerHTML = iconSvg(mood); }
    setText(H.traffic, pct(st.flow));
    const d = city.demand;
    ([d.r, d.c, d.i, d.o] as number[]).forEach((v, i) => {
      const bar = this.bars[i];
      bar.style.height = Math.round(Math.min(1, Math.abs(v)) * 50) + "%";
      bar.className = v >= 0 ? "up" : "down";
      (bar.parentElement as HTMLElement).style.display = i === 3 && !city.unlocked(ZONES[Zone.Office].unlock) ? "none" : "";
    });
    const W = city.weather;
    const night = city.hour < 6 || city.hour >= 20;
    const skyName = W.sky === "clear" && night ? "moon" : SKY_ICON[W.sky] ?? "sun";
    if (H.sky.dataset.sky !== skyName) { H.sky.dataset.sky = skyName; fill(H.sky, icon(skyName)); }
    const hour = Math.floor(city.hour);
    setText(H.clock, `${String(hour).padStart(2, "0")}:00`);
    setText(H.date, `${t("season." + SEASONS[W.season])} · ${t("ui.year", { n: Math.floor(city.day / YEAR_DAYS) + 1 })}`);
    (H.sky.parentElement as HTMLElement).title = `${t("season." + SEASONS[W.season])} · ${t("sky." + W.sky)} · ${t("ui.day", { n: (city.day % YEAR_DAYS) + 1 })}`;
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
      this.fab.classList.toggle("hello", !(city.count.roads > 0) && this.game.tools.tool.t === "inspect");
    }
  }

  /** Something unlocked: draw the menus again. */
  refreshTools() {
    if (this.fanOpen) this.drawFan();
    if (this.drawerOpen) this.drawDrawer();
    this.toolKey = "";
    this.toolChanged();
  }

  /** The language or the city changed: draw everything again. */
  rebuild() {
    this.game.tools.refresh();
    this.lastMilestone = -1;
    this.advice = "";
    this.adviceOpen = true;
    this.panels.close();
    this.closeFan();
    this.closeDrawer();
    this.setView(this.game.view.infoView);
    clear(this.root);
    this.bars = [];
    this.speedButtons = [];
    this.dock = h("div", { class: "dock" });
    this.fab = h("button", { class: "fab", "aria-label": "Build" });
    this.fan = h("div", { class: "fan" });
    this.buildHud();
    this.buildDock();
    this.root.append(this.over, this.viewing, this.toasts, this.pad, this.advisor, this.fanBack, this.dock, this.drawer, this.toolbar, this.panels.el, this.modal);
    this.refreshTools();
    this.update(true);
  }

  /** The drawer or fan is open (the camera keys then leave the map alone, Escape closes them). */
  get menuOpen() { return this.fanOpen || this.drawerOpen; }
  closeMenus(): boolean {
    if (this.fanOpen) { this.closeFan(); return true; }
    if (this.drawerOpen) { this.closeDrawer(); return true; }
    return false;
  }

  setVisible(on: boolean) { this.root.classList.toggle("ingame", on); }
  unlockLabel(level: number) { return t("ui.locked", { name: milestoneName(level) }); }
  catUnlock(cat: Cat) { return CAT_UNLOCK[cat]; }
  nextMilestone() { return MILESTONES[this.city.milestone + 1]; }
  roadPic(type: Road) { return roadPic(type); }
}

/** Paper confetti falling over a canvas for a few seconds. */
function confetti(canvas: HTMLCanvasElement) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = (canvas.width = innerWidth), H = (canvas.height = innerHeight);
  const colors = ["#ffcf3f", "#5ad16a", "#4fb0ff", "#ff6b5e", "#b085ff", "#3fd1c0", "#ffffff"];
  const bits = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.42, vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 14,
    r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const step = (now: number) => {
    if (!canvas.isConnected) return;
    const t = (now - start) / 1000;
    g.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += 0.38; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.globalAlpha = Math.max(0, 1 - t / 4);
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2))); g.restore();
    }
    if (t < 4) requestAnimationFrame(step); else g.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(step);
}
