// The menus: the start screen, founding a new city, the list of saved cities.
import type { CityOptions } from "../sim/city";
import type { MapSize, Mode } from "../sim/defs";
import { SlotInfo, freeSlot, listSlots } from "../sim/save";
import { seedFromText } from "../sim/util";
import { fill, h } from "./dom";
import { num, t } from "./i18n";

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
const MODE_ICON: Record<Mode, string> = { chill: "🌴", normal: "🏙️", hard: "🔥" };

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

  private button(label: string, act: () => void, cls = ""): HTMLElement {
    return h("button", { class: "menu-btn-big " + cls, onclick: () => { this.host.click(); act(); } }, label);
  }

  private draw() {
    if (this.screen === "new") return this.drawNew();
    if (this.screen === "load") return this.drawLoad();
    const host = this.host, slots = listSlots().sort((a, b) => b.savedAt - a.savedAt);
    const items: HTMLElement[] = [];
    if (host.playing) {
      items.push(this.button(t("menu.resume"), () => host.resume(), "primary"));
      items.push(this.button(t("menu.save"), () => host.save()));
    } else if (slots.length) {
      items.push(this.button(`${t("menu.continue")}: ${slots[0].name}`, () => host.load(slots[0].slot), "primary"));
    }
    items.push(this.button(t("menu.new"), () => this.startDraft(), !host.playing && !slots.length ? "primary" : ""));
    if (slots.length) items.push(this.button(t("menu.load"), () => this.show("load")));
    items.push(this.button(t("menu.options"), () => host.openPanel("options")));
    items.push(this.button(t("menu.help"), () => host.openPanel("help")));
    if (document.fullscreenEnabled) items.push(this.button(t("menu.fullscreen"), () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); }));
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
    fill(this.el, h("div", { class: "menu-card wide" },
      h("h2", null, t("new.title")),
      h("label", { class: "field" }, h("span", null, t("new.name")), name),
      h("div", { class: "field" }, h("span", null, t("new.mode")),
        pick<Mode>(["chill", "normal", "hard"], d.mode, (m) => h("span", null, h("b", null, MODE_ICON[m] + " " + t("mode." + m)), h("small", null, t("mode." + m + ".d"))), (m) => { d.mode = m; }, "modes")),
      h("div", { class: "field" }, h("span", null, t("new.size")),
        pick<MapSize>(["small", "medium", "large"], d.size, (s) => t("size." + s), (s) => { d.size = s; host.preview(d.seed, d.size); }, "sizes")),
      h("label", { class: "field" }, h("span", null, t("new.seed")),
        h("div", { class: "seed" }, seed, h("button", { onclick: () => { host.click(); d.seed = Math.floor(Math.random() * 900000) + 100000; host.preview(d.seed, d.size); this.draw(); } }, "🎲 " + t("new.roll"))),
        h("small", null, t("new.seedHint"))),
      h("div", { class: "row" },
        this.button(t("new.start"), () => host.startNew({ name: d.name.trim() || NAMES[0], mode: d.mode, size: d.size, seed: d.seed }), "primary"),
        this.button(t("ui.back"), () => this.show("main")))));
  }

  private drawLoad() {
    const host = this.host, slots = listSlots().sort((a, b) => b.savedAt - a.savedAt);
    const card = (s: SlotInfo) => h("div", { class: "slot" },
      h("div", null, h("b", null, s.name), h("small", null, t("load.info", { pop: num(s.pop), day: s.day + 1, mode: t("mode." + s.mode) }))),
      h("button", { class: "primary", onclick: () => { host.click(); host.load(s.slot); } }, t("load.play")),
      h("button", { class: "danger", title: t("load.delete"), onclick: () => host.confirm("confirm.deleteCity", { name: s.name }, () => { host.remove(s.slot); this.draw(); }) }, "🗑️"));
    fill(this.el, h("div", { class: "menu-card wide" },
      h("h2", null, t("load.title")),
      ...(slots.length ? slots.map(card) : [h("p", { class: "note" }, t("load.empty"))]),
      !freeSlot() ? h("p", { class: "note" }, t("new.noSlot")) : null,
      h("div", { class: "row" }, freeSlot() ? this.button(t("menu.new"), () => this.startDraft()) : null, this.button(t("ui.back"), () => this.show("main")))));
  }
}
