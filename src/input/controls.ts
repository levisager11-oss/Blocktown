// Mouse, keyboard and touch: moves the camera and hands presses to the tools.
import type { View } from "../render/view";
import type { Tools } from "./tools";

interface Finger { id: number; x: number; y: number; sx: number; sy: number }

export class Controls {
  /** Set while a panel or menu is open over the game: keys then belong to it. */
  blocked = false;
  onEscape: () => void = () => {};
  onKey: (key: string) => void = () => {};
  private fingers: Finger[] = [];
  private mode: "none" | "tool" | "pan" | "orbit" | "pinch" = "none";
  private moved = false;
  private startedPoint = false;
  private keys = new Set<string>();
  private pinch = { dist: 0, angle: 0, cx: 0, cy: 0 };
  private button = 0;

  constructor(readonly view: View, readonly tools: Tools, readonly unlockSound: () => void) {
    const c = view.canvas;
    c.addEventListener("pointerdown", (e) => this.down(e));
    c.addEventListener("pointermove", (e) => this.move(e));
    c.addEventListener("pointerup", (e) => this.up(e));
    c.addEventListener("pointercancel", (e) => this.up(e, true));
    c.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private down(e: PointerEvent) {
    this.unlockSound();
    const c = this.view.canvas;
    try { c.setPointerCapture(e.pointerId); } catch { /* fine */ }
    this.fingers.push({ id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    const touch = e.pointerType !== "mouse";
    if (this.fingers.length === 2) {
      // A second finger: whatever the first one was doing becomes moving the camera.
      if (this.mode === "tool") this.tools.interrupted(this.startedPoint);
      this.mode = "pinch";
      this.moved = true;
      this.startPinch();
      return;
    }
    if (this.fingers.length > 2) return;
    this.moved = false;
    this.button = e.button;
    if (!touch && e.button === 2) { this.mode = "orbit"; return; }
    if (!touch && e.button === 1) { this.mode = "pan"; return; }
    const before = this.tools.tool.t === "road" ? this.toolPoints() : -1;
    this.mode = this.tools.down(e.clientX, e.clientY, touch) ? "tool" : "pan";
    this.startedPoint = before === 0 && this.toolPoints() === 1;
  }

  private toolPoints(): number { return this.tools.pointCount; }

  private startPinch() {
    const [a, b] = this.fingers;
    this.pinch = { dist: Math.hypot(b.x - a.x, b.y - a.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  /** Slides the camera over the land by a number of screen pixels. */
  private panBy(dx: number, dy: number) {
    const g = this.view.goal, k = (g.dist / this.view.canvas.clientHeight) * 1.25;
    const cos = Math.cos(g.yaw), sin = Math.sin(g.yaw);
    // On the land, screen right is (cos, -sin) and away from the camera is (-sin, -cos). The land follows the finger.
    const deep = dy / Math.max(0.35, Math.sin(g.pitch));
    g.x += (-dx * cos - deep * sin) * k;
    g.z += (dx * sin - deep * cos) * k;
  }

  private move(e: PointerEvent) {
    const f = this.fingers.find((p) => p.id === e.pointerId);
    const touch = e.pointerType !== "mouse";
    if (!f) {
      if (!touch) this.tools.hover(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    f.x = e.clientX; f.y = e.clientY;
    if (Math.hypot(f.x - f.sx, f.y - f.sy) > (touch ? 10 : 5)) this.moved = true;
    const g = this.view.goal;
    if (this.mode === "pinch" && this.fingers.length >= 2) {
      const [a, b] = this.fingers;
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1, angle = Math.atan2(b.y - a.y, b.x - a.x);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      g.dist *= this.pinch.dist / dist;
      let turn = angle - this.pinch.angle;
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      g.yaw -= turn;
      this.panBy(cx - this.pinch.cx, cy - this.pinch.cy);
      this.pinch = { dist, angle, cx, cy };
    } else if (this.mode === "tool") {
      this.tools.drag(e.clientX, e.clientY, touch);
    } else if (this.mode === "pan" && this.moved) {
      this.panBy(dx, dy);
    } else if (this.mode === "orbit") {
      g.yaw -= dx * 0.006;
      g.pitch += dy * 0.005;
    }
  }

  private up(e: PointerEvent, cancelled = false) {
    const i = this.fingers.findIndex((p) => p.id === e.pointerId);
    if (i < 0) return;
    this.fingers.splice(i, 1);
    const touch = e.pointerType !== "mouse";
    if (this.mode === "pinch") {
      if (this.fingers.length < 2) this.mode = this.fingers.length ? "pan" : "none";
      return;
    }
    const mode = this.mode;
    this.mode = "none";
    if (cancelled) return;
    if (mode === "orbit") { if (!this.moved) this.tools.cancel(); return; }
    if (this.button === 1) return;
    if (mode === "tool" || !this.moved) this.tools.up(e.clientX, e.clientY, this.moved, touch, this.startedPoint);
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    const g = this.view.goal;
    const before = this.view.groundAt(e.clientX, e.clientY);
    const f = Math.exp(Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.16);
    const old = g.dist;
    g.dist *= f;
    // Zoom towards the spot under the mouse.
    if (before && g.dist < old) {
      g.x += (before.x - g.x) * (1 - f) * 0.9;
      g.z += (before.z - g.z) * (1 - f) * 0.9;
    }
  }

  private key(e: KeyboardEvent, down: boolean) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (down) {
      this.unlockSound();
      if (k === "Escape") { this.onEscape(); return; }
      if (this.blocked) return;
      this.keys.add(k);
      if (!e.repeat) this.onKey(k);
    } else this.keys.delete(k);
  }

  /** Keys held down move the camera a bit every frame. */
  frame(dt: number) {
    if (this.blocked || !this.keys.size) return;
    const g = this.view.goal, K = this.keys;
    const sp = 640 * dt;
    let dx = 0, dy = 0;
    if (K.has("a") || K.has("ArrowLeft")) dx += sp;
    if (K.has("d") || K.has("ArrowRight")) dx -= sp;
    if (K.has("w") || K.has("ArrowUp")) dy += sp;
    if (K.has("s") || K.has("ArrowDown")) dy -= sp;
    if (dx || dy) this.panBy(dx, dy);
    if (K.has("q")) g.yaw += dt * 1.6;
    if (K.has("e")) g.yaw -= dt * 1.6;
    if (K.has("r")) g.pitch += dt * 0.9;
    if (K.has("f")) g.pitch -= dt * 0.9;
    if (K.has("+") || K.has("=")) g.dist *= Math.exp(-dt * 1.4);
    if (K.has("-")) g.dist *= Math.exp(dt * 1.4);
  }
}
