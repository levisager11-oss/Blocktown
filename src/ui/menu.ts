// The menus: the start screen, founding a new city, the list of saved cities.
import type { CityOptions } from "../sim/city";
import type { MapSize, Mode } from "../sim/defs";
import { SlotInfo, freeSlot, listSlots } from "../sim/save";
import { seedFromText } from "../sim/util";
import { fill, h } from "./dom";
import { num, t } from "./i18n";
import { icon } from "./icons";

export interface MenuHost {
  /** Is a real city (not just the backdrop) loaded? */
  playing: boolean;
  resume(): void;
  startNew(opts: CityOptions): void;
  load(slot: number): void;
  remove(slot: number): void;
  save(): void;
  preview(seed: number, size: MapSize): void;
  openPanel(name: "options" | "help"): void;
  confirm(key: string, args: Record<string, string | number>, yes: () => void): void;
  click(): void;
}

const NAMES = ["Brookfield", "Maple Bay", "Stonebridge", "Lindenau", "Sonnental", "Riverton", "Pinecrest", "Kieselbach", "Oakhaven", "Windmere", "Blockheim", "Silverlake", "Falkenried", "Ambergate", "Rosenau", "Northpoint"];
const MODE_ICON: Record<Mode, string> = { chill: "sun", normal: "city", hard: "fire" };

export class Menu {
  el = h("div", { class: "menu hidden" });
  private screen: "main" | "new" | "load" = "main";
  private draft = { name: "", mode: "normal" as Mode, size: "medium" as MapSize, seed: 0 };

  constructor(readonly host: MenuHost) {}

  get open() { return !this.el.classList.contains("hidden"); }
  show(screen: "main" | "new" | "load" = "main") {
    this.screen = screen;
    this.el.classList.remove("hidden");
    this.draw();
  }
  hide() { this.el.classList.add("hidden"); }
  redraw() { if (this.open) this.draw(); }

  private button(label: string, act: () => void, cls = "", ic = "", sub = ""): HTMLElement {
    return h("button", { class: "btn menu-btn-big " + cls, onclick: () => { this.host.click(); act(); } }, ic ? icon(ic) : null, label, sub ? h("span", { class: "sub" }, sub) : null);
  }

  private draw() {
    if (this.screen === "new") return this.drawNew();
    if (this.screen === "load") return this.drawLoad();
    const host = this.host, slots = listSlots().sort((a, b) => b.savedAt - a.savedAt);
    const items: HTMLElement[] = [];
    if (host.playing) {
      items.push(this.button(t("menu.resume"), () => host.resume(), "green", "play"));
      items.push(this.button(t("menu.save"), () => host.save(), "blue", "save"));
    } else if (slots.length) {
      items.push(this.button(t("menu.continue"), () => host.load(slots[0].slot), "green", "play", slots[0].name));
    }
    items.push(this.button(t("menu.new"), () => this.startDraft(), !host.playing && !slots.length ? "green" : "gold", "hammer"));
    if (slots.length) items.push(this.button(t("menu.load"), () => this.show("load"), "", "city"));
    items.push(this.button(t("menu.options"), () => host.openPanel("options"), "", "gear"));
    items.push(this.button(t("menu.help"), () => host.openPanel("help"), "", "help"));
    if (document.fullscreenEnabled) items.push(this.button(t("menu.fullscreen"), () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }, "", "full"));
    fill(this.el, h("div", { class: "menu-card" },
      h("div", { class: "logo" }, h("span", { class: "blocks" }, h("i"), h("i"), h("i")), h("h1", null, t("game.name")), h("p", null, t("game.tagline"))),
      ...items));
  }

  private startDraft() {
    if (!freeSlot()) { this.show("load"); return; }
    this.draft = { name: NAMES[Math.floor(Math.random() * NAMES.length)], mode: "normal", size: "medium", seed: Math.floor(Math.random() * 900000) + 100000 };
    this.host.preview(this.draft.seed, this.draft.size);
    this.show("new");
  }

  private drawNew() {
    const d = this.draft, host = this.host;
    const name = h("input", { type: "text", maxLength: 24, value: d.name, "aria-label": t("new.name") });
    name.addEventListener("input", () => { d.name = name.value; });
    const seed = h("input", { type: "text", maxLength: 16, value: String(d.seed), "aria-label": t("new.seed") });
    seed.addEventListener("change", () => { d.seed = seedFromText(seed.value || "0"); host.preview(d.seed, d.size); });
    const pick = <T extends string>(options: T[], current: T, label: (o: T) => HTMLElement | string, set: (o: T) => void, cls: string) =>
      h("div", { class: "pick " + cls }, ...options.map((o) => h("button", { class: o === current ? "on" : "", onclick: () => { host.click(); set(o); this.draw(); } }, label(o))));
    const big = (label: string, act: () => void, cls: string, ic = "") => h("button", { class: "btn " + cls, onclick: () => { host.click(); act(); } }, ic ? icon(ic) : null, label);
    fill(this.el, h("div", { class: "menu-card wide" },
      h("h2", null, t("new.title")),
      h("label", { class: "field" }, h("span", null, t("new.name")), name),
      h("div", { class: "field" }, h("span", null, t("new.mode")),
        pick<Mode>(["chill", "normal", "hard"], d.mode, (m) => h("span", null, h("b", null, icon(MODE_ICON[m]), t("mode." + m)), h("small", null, t("mode." + m + ".d"))), (m) => { d.mode = m; }, "modes")),
      h("div", { class: "field" }, h("span", null, t("new.size")),
        pick<MapSize>(["small", "medium", "large"], d.size, (s) => t("size." + s), (s) => { d.size = s; host.preview(d.seed, d.size); }, "sizes")),
      h("label", { class: "field" }, h("span", null, t("new.seed")),
        h("div", { class: "seed" }, seed, big(t("new.roll"), () => { d.seed = Math.floor(Math.random() * 900000) + 100000; host.preview(d.seed, d.size); this.draw(); }, "purple small", "turnR")),
        h("small", null, t("new.seedHint"))),
      h("div", { class: "row" },
        big(t("new.start"), () => host.startNew({ name: d.name.trim() || NAMES[0], mode: d.mode, size: d.size, seed: d.seed }), "green", "hammer"),
        big(t("ui.back"), () => this.show("main"), "", ""))));
  }

  private drawLoad() {
    const host = this.host, slots = listSlots().sort((a, b) => b.savedAt - a.savedAt);
    const card = (s: SlotInfo) => h("div", { class: "slot" },
      h("span", { class: "mode-dot" }, icon(MODE_ICON[s.mode])),
      h("div", null, h("b", null, s.name), h("small", null, t("load.info", { pop: num(s.pop), day: s.day + 1, mode: t("mode." + s.mode) }))),
      h("button", { class: "btn green small", onclick: () => { host.click(); host.load(s.slot); } }, icon("play"), t("load.play")),
      h("button", { class: "btn red small", title: t("load.delete"), style: { width: "40px", padding: "0 0 4px" }, onclick: () => host.confirm("confirm.deleteCity", { name: s.name }, () => { host.remove(s.slot); this.draw(); }) }, icon("close")));
    fill(this.el, h("div", { class: "menu-card wide" },
      h("h2", null, t("load.title")),
      ...(slots.length ? slots.map(card) : [h("p", { class: "note" }, t("load.empty"))]),
      !freeSlot() ? h("p", { class: "note" }, t("new.noSlot")) : null,
      h("div", { class: "row" }, freeSlot() ? h("button", { class: "btn gold", onclick: () => { host.click(); this.startDraft(); } }, icon("hammer"), t("menu.new")) : null,
        h("button", { class: "btn", onclick: () => { host.click(); this.show("main"); } }, t("ui.back")))));
  }
}
