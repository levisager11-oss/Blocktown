// Blocktown: starts the game and keeps it running.
import "./ui/style.css";
import { Sfx, Sound } from "./audio/sound";
import { Controls } from "./input/controls";
import { ToolHost, Tools } from "./input/tools";
import { View } from "./render/view";
import { City, CityOptions, Tone } from "./sim/city";
import type { MapSize } from "./sim/defs";
import type { Lot } from "./sim/lots";
import type { RSeg } from "./sim/roads";
import { deleteCity, freeSlot, loadCity, saveCity } from "./sim/save";
import { achievementInfo, insideToki, sendAchievement, sendScore } from "./toki";
import { browserLang, setLang, t } from "./ui/i18n";
import { Menu, MenuHost } from "./ui/menu";
import { GameApi, Settings, UI } from "./ui/ui";

const SETTINGS_KEY = "blocktown.settings";
const phone = matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 600;

function loadSettings(): Settings {
  const base: Settings = { lang: browserLang(), sfx: 0.7, ambience: 0.5, quality: phone ? "low" : "medium", dayNight: true, advisor: true, pad: phone };
  try { return { ...base, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<Settings>) }; } catch { return base; }
}

class Game implements GameApi, ToolHost, MenuHost {
  settings = loadSettings();
  city: City;
  view: View;
  tools: Tools;
  ui: UI;
  menu: Menu;
  controls: Controls;
  audio = new Sound();
  speed = 1;
  /** The save slot of the city being played; 0 while only the backdrop of the menu is shown. */
  slot = 0;
  private last = performance.now();
  private uiClock = 0;
  private saveClock = 0;
  private soundClock = 0;
  private thunder = 6;
  private applied = "";

  constructor() {
    setLang(this.settings.lang);
    const canvas = document.getElementById("view") as HTMLCanvasElement;
    this.view = new View(canvas, phone);
    this.city = this.backdrop(Math.floor(Math.random() * 900000) + 100000, "small");
    this.tools = new Tools(this);
    this.ui = new UI(this);
    this.menu = new Menu(this);
    document.body.append(this.menu.el);
    this.controls = new Controls(this.view, this.tools, () => this.audio.unlock());
    this.controls.onEscape = () => this.escape();
    this.controls.onKey = (k) => this.key(k);
    this.view.setCity(this.city);
    this.applySettings();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { this.saveNow(true); this.audio.suspend(); } else { this.audio.resume(); this.last = performance.now(); }
    });
    window.addEventListener("pagehide", () => this.saveNow(true));
    document.addEventListener("pointerdown", () => this.audio.unlock(), { capture: true });
    this.ui.setVisible(false);
    this.menu.show("main");
    requestAnimationFrame((now) => this.loop(now));
  }

  get playing() { return this.slot > 0; }

  /** An empty map to look at behind the menu. */
  private backdrop(seed: number, size: MapSize): City {
    return new City({ name: "", seed, size, mode: "chill" });
  }

  private attach(city: City, slot: number) {
    this.city = city;
    this.slot = slot;
    city.onAchievement = (id) => {
      sendAchievement(id);
      this.sound("achievement");
      if (!insideToki) {
        const a = achievementInfo(id, this.settings.lang);
        this.ui.toast("ach.toast", "good", { name: `${a.icon} ${a.name}` });
      }
    };
    city.onScore = (board, value) => sendScore(board, value);
    this.view.setCity(city);
    this.tools.set({ t: "inspect" });
    this.ui.rebuild();
    this.speed = 1;
    this.saveClock = 0;
  }

  // ------------------------------------------------------------------ menu

  preview(seed: number, size: MapSize) {
    if (this.playing) this.saveNow(true);
    this.slot = 0;
    this.city = this.backdrop(seed, size);
    this.view.setCity(this.city);
    this.ui.setVisible(false);
  }

  startNew(opts: CityOptions) {
    const slot = freeSlot();
    if (!slot) { this.menu.show("load"); return; }
    this.attach(new City(opts), slot);
    // Start the view at the highway, where the first road will go.
    const segs = [...this.city.roads.segs.values()];
    const mid = segs[Math.floor(segs.length / 2)];
    if (mid) this.view.focus(mid.px[0], mid.pz[0], 330, true);
    this.saveNow(true);
    this.enter();
  }

  load(slot: number) {
    if (this.playing) this.saveNow(true);
    const city = loadCity(slot);
    if (!city) { this.ui.toast("note.saveError", "bad"); return; }
    this.attach(city, slot);
    // Look at the middle of what is built.
    let x = 0, z = 0, n = 0;
    for (const lot of city.lots.lots.values()) if (lot.kind) { x += lot.x; z += lot.z; n++; }
    if (n) this.view.focus(x / n, z / n, 420, true);
    this.enter();
    this.ui.toast("note.welcomeBack", "info", { name: city.name });
  }

  remove(slot: number) {
    deleteCity(slot);
    if (slot === this.slot) {
      this.slot = 0;
      this.preview(this.city.seed, this.city.size);
    }
  }

  private enter() {
    this.menu.hide();
    this.ui.setVisible(true);
    this.controls.blocked = false;
  }
  resume() { if (this.playing) this.enter(); }
  save() { this.saveNow(); this.resume(); }
  click() { this.sound("click"); }
  openPanel(name: "options" | "help") { this.ui.panels.open(name); }

  openMenu() {
    this.sound("open");
    if (this.playing) this.saveNow(true);
    this.ui.panels.close();
    this.ui.setVisible(false);
    this.controls.blocked = true;
    this.menu.show("main");
  }

  private escape() {
    if (this.ui.modalOpen) { this.ui.closeModal(); return; }
    if (this.ui.panels.current) { this.ui.panels.close(); return; }
    if (this.menu.open) { if (this.playing) this.resume(); return; }
    if (!this.tools.cancel()) this.openMenu();
  }

  private key(k: string) {
    if (this.menu.open) return;
    if (k === " ") this.setSpeed(this.speed ? 0 : 1);
    else if (k === "1") this.setSpeed(1);
    else if (k === "2") this.setSpeed(2);
    else if (k === "3") this.setSpeed(4);
    else if (k === "b") this.ui.pickCat("bulldoze");
  }

  // ------------------------------------------------------------------ what the tools and the interface ask for

  setSpeed(n: number) { this.speed = n; }
  sound(name: Sfx) { this.audio.play(name); }
  toast(key: string, tone: Tone, args?: Record<string, string | number>) { this.ui.toast(key, tone, args); }
  inspect(target: { lot?: Lot; seg?: RSeg } | null) { this.ui.inspect(target); }
  confirm(key: string, args: Record<string, string | number>, yes: () => void) { this.ui.confirm(key, args, yes); }
  hintChanged() { this.ui?.hintChanged(); }
  toolChanged() { this.ui?.toolChanged(); }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* storage is off */ }
    this.applySettings();
  }

  private applySettings() {
    const s = this.settings;
    this.audio.setVolume(s.sfx, s.ambience);
    this.view.dayNight = s.dayNight;
    if (this.view.quality !== s.quality) this.view.setQuality(s.quality);
    const key = s.lang;
    if (key !== this.applied) {
      const first = this.applied === "";
      this.applied = key;
      setLang(s.lang);
      if (!first) {
        const panel = this.ui.panels.current;
        this.ui.rebuild();
        this.menu.redraw();
        if (panel === "options") this.ui.panels.open("options");
      }
    }
  }

  saveNow(quiet = false) {
    if (!this.playing) return;
    const why = saveCity(this.city, this.slot);
    if (why) this.ui.toast(why === "full" ? "note.saveFull" : "note.saveError", "bad");
    else if (!quiet) { this.ui.toast("note.saved", "good"); this.sound("notify"); }
  }

  // ------------------------------------------------------------------ the loop

  private resize() {
    this.view.resize(window.innerWidth, window.innerHeight);
  }

  private ambience(dt: number) {
    const city = this.city, W = city.weather, v = this.view;
    const near = Math.min(1, 520 / Math.max(120, v.cam.dist));
    const big = Math.min(1, city.stats.pop / 15000);
    let cars = 0;
    for (const a of city.traffic.agents) if (Math.abs(a.x - v.cam.x) + Math.abs(a.z - v.cam.z) < v.cam.dist * 0.9 + 80) cars++;
    const playing = this.playing && !this.menu.open;
    this.audio.ambience({
      traffic: playing ? Math.min(1, cars / 40) * near : 0,
      city: playing ? big * (1 - near * 0.5) : 0,
      nature: (1 - v.night) * (1 - big * 0.7) * (1 - W.rain) * 0.8,
      night: v.night * (1 - W.rain) * (W.season === 3 ? 0.1 : 0.7),
      rain: W.snowing ? 0 : W.rain,
      wind: Math.max(0, W.wind - 0.75) * 1.3 + (W.snowing ? 0.2 : 0),
      fire: playing && city.disasters.fires.size ? 0.8 * near : 0,
    });
    // Thunder and lightning in a storm.
    if (W.sky === "storm" && playing) {
      this.thunder -= dt;
      if (this.thunder <= 0) {
        this.thunder = 5 + Math.random() * 9;
        this.view.lightning();
        this.sound("thunder");
      }
    }
  }

  private loop(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const inMenu = this.menu.open;
    const paused = inMenu || this.ui.modalOpen;
    if (!paused && this.playing && this.speed > 0) this.city.step(dt * this.speed);
    if (inMenu && !this.playing) this.view.goal.yaw += dt * 0.05; // the backdrop turns slowly
    this.controls.frame(dt);
    this.tools.frame();
    this.view.frame(dt);
    this.ui.frame();
    this.uiClock += dt;
    if (this.uiClock > 0.25) {
      this.uiClock = 0;
      if (this.playing) this.ui.update();
      if (this.city.over && !this.city.count.overShown) {
        this.city.count.overShown = 1;
        this.ui.toast("note.bankrupt", "bad");
      }
    }
    this.soundClock += dt;
    if (this.soundClock > 0.4) { this.ambience(this.soundClock); this.soundClock = 0; }
    if (this.playing && !paused) {
      this.saveClock += dt;
      if (this.saveClock > 60) { this.saveClock = 0; this.saveNow(true); }
    }
    requestAnimationFrame((n) => this.loop(n));
  }
}

const game = new Game();
(window as unknown as { blocktown: Game }).blocktown = game;
// Shown in the title of the page while a city is open.
setInterval(() => { document.title = game.playing ? `${game.city.name} · ${t("game.name")}` : t("game.name"); }, 2000);
