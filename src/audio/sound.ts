// Blocktown sound: every effect and ambience layer is synthesised with the Web Audio API.
// No audio files. Everything is a safe no-op when Web Audio is missing.

export type Sfx =
  | "click" | "open" | "close" | "road" | "zone" | "place" | "bulldoze" | "error"
  | "cash" | "notify" | "warn" | "milestone" | "achievement" | "siren" | "thunder" | "grow";

export interface Ambience {
  /** 0 to 1 each. */
  traffic: number; // hum of cars near the camera
  city: number; // distant murmur of a big city
  nature: number; // birds by day (wind in trees)
  night: number; // crickets at night
  rain: number;
  wind: number;
  fire: number; // crackling when a fire is on screen
}

// Older Safari only has the prefixed constructor.
interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

type Layer = keyof Ambience;
const LAYERS: Layer[] = ["traffic", "city", "nature", "night", "rain", "wind", "fire"];

// Minimum gap (seconds) between two plays of the same effect.
const MIN_GAP: Partial<Record<Sfx, number>> = { zone: 1 / 12, click: 1 / 12, grow: 1 / 4, road: 1 / 12 };

// Note frequencies (Hz) used by the little melodies.
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fxGain: GainNode | null = null;
  private ambGain: GainNode | null = null;
  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private layerGain: Partial<Record<Layer, GainNode>> = {};
  private levels: Ambience = { traffic: 0, city: 0, nature: 0, night: 0, rain: 0, wind: 0, fire: 0 };
  private fxVolume = 0.7;
  private ambVolume = 0.5;
  private suspended = false;
  private timer: number | null = null;
  private lastPlay: Partial<Record<Sfx, number>> = {};

  /** Call from the first tap/click/key press: browsers only allow sound after a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state === "suspended" && !this.suspended) void this.ctx.resume().catch(() => undefined);
    } catch {
      // No sound is better than a crash.
    }
  }

  /** Volumes from 0 to 1. */
  setVolume(effects: number, ambience: number): void {
    this.fxVolume = clamp01(effects);
    this.ambVolume = clamp01(ambience);
    this.applyVolumes();
  }

  /** Plays a short effect. Does nothing before unlock() or when effects volume is 0. */
  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.fxGain || this.fxVolume <= 0 || this.suspended) return;
    try {
      const t = ctx.currentTime + 0.005;
      const gap = MIN_GAP[name];
      const last = this.lastPlay[name];
      if (gap !== undefined && last !== undefined && t - last < gap) return;
      this.lastPlay[name] = t;
      this.effect(name, t);
    } catch {
      // Ignore audio errors.
    }
  }

  /** Sets how loud each background layer should be; the class fades towards it smoothly. */
  ambience(mix: Partial<Ambience>): void {
    for (const k of LAYERS) {
      const v = mix[k];
      if (v !== undefined) this.levels[k] = clamp01(v);
    }
    const ctx = this.ctx;
    if (!ctx) return;
    for (const k of LAYERS) {
      const g = this.layerGain[k];
      if (g) g.gain.setTargetAtTime(this.levels[k] * LAYER_TRIM[k], ctx.currentTime, 0.6);
    }
  }

  /** Pauses all sound (tab hidden, game paused in the menu). */
  suspend(): void {
    this.suspended = true;
    if (!this.ctx) return;
    this.ctx.suspend().catch(() => undefined);
  }

  /** Resumes sound after suspend(). */
  resume(): void {
    this.suspended = false;
    if (!this.ctx) return;
    this.ctx.resume().catch(() => undefined);
  }

  // ---------- setup ----------

  private build(): void {
    const w = window as WebkitWindow;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    // effects + ambience -> master -> gentle compressor -> speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);
    this.fxGain = ctx.createGain();
    this.fxGain.connect(this.master);
    this.ambGain = ctx.createGain();
    this.ambGain.connect(this.master);
    this.applyVolumes();

    this.makeNoise();
    this.buildLayers();
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.fxGain || !this.ambGain) return;
    const now = this.ctx.currentTime;
    this.fxGain.gain.setTargetAtTime(this.fxVolume * 0.9, now, 0.05);
    this.ambGain.gain.setTargetAtTime(this.ambVolume, now, 0.2);
  }

  // Two looping noise buffers: white and brown (smoother, rumbly).
  private makeNoise(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 4);
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const r = Math.random() * 2 - 1;
      w[i] = r;
      last = (last + 0.02 * r) / 1.02;
      b[i] = last * 3.5;
    }
    this.white = white;
    this.brown = brown;
  }

  private loop(buf: AudioBuffer | null): AudioBufferSourceNode | null {
    if (!this.ctx || !buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = buf.duration;
    // Start at a random spot so layers sharing a buffer do not sound identical.
    src.start(0, Math.random() * buf.duration);
    return src;
  }

  // Creates the continuous layers (nature, night and fire are scheduled in tick()).
  private buildLayers(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambGain) return;
    const out = (k: Layer): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.ambGain as GainNode);
      this.layerGain[k] = g;
      return g;
    };
    const filter = (type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };

    // traffic: low brown hum with a slow wobble
    const traffic = this.loop(this.brown);
    if (traffic) {
      const lp = filter("lowpass", 380);
      const wob = ctx.createGain();
      wob.gain.value = 0.8;
      traffic.connect(lp).connect(wob).connect(out("traffic"));
      this.lfo(wob.gain, 0.15, 0.25, 0.8);
    }

    // city: very soft broadband murmur
    const city = this.loop(this.brown);
    if (city) {
      const bp = filter("bandpass", 600, 0.5);
      const g = ctx.createGain();
      g.gain.value = 0.7;
      city.connect(bp).connect(g).connect(out("city"));
      this.lfo(g.gain, 0.07, 0.2, 0.7);
    }

    // nature: faint leaf rustle (birds come from tick())
    const leaf = this.loop(this.white);
    if (leaf) {
      const bp = filter("bandpass", 4200, 0.8);
      const g = ctx.createGain();
      g.gain.value = 0.05;
      leaf.connect(bp).connect(g).connect(out("nature"));
      this.lfo(g.gain, 0.2, 0.03, 0.05);
    }

    // night: crickets are scheduled in tick(), just make the bus
    out("night");

    // rain: band-passed hiss
    const rain = this.loop(this.white);
    if (rain) {
      const bp = filter("bandpass", 2600, 0.6);
      const hp = filter("highpass", 800);
      const g = ctx.createGain();
      g.gain.value = 0.5;
      rain.connect(hp).connect(bp).connect(g).connect(out("rain"));
    }

    // wind: noise through a slowly sweeping band-pass
    const wind = this.loop(this.brown);
    if (wind) {
      const bp = filter("bandpass", 500, 1.2);
      const g = ctx.createGain();
      g.gain.value = 1.2;
      wind.connect(bp).connect(g).connect(out("wind"));
      this.lfo(bp.frequency, 0.08, 300, 500);
      this.lfo(g.gain, 0.11, 0.4, 1.0);
    }

    // fire: crackles are scheduled in tick()
    out("fire");

    this.ambience({});
  }

  // Slow sine wobble on a parameter: value = centre +/- depth.
  private lfo(param: AudioParam, hz: number, depth: number, centre: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.frequency.value = hz * (0.8 + Math.random() * 0.4);
    const amp = ctx.createGain();
    amp.gain.value = depth;
    param.value = centre;
    osc.connect(amp).connect(param);
    osc.start();
  }

  // ---------- scheduled ambience (birds, crickets, crackles) ----------

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || this.suspended || ctx.state !== "running" || this.ambVolume <= 0) return;
    const t = ctx.currentTime + 0.02;
    const L = this.levels;
    // Each 250 ms chance scales with the layer level.
    if (L.nature > 0.02 && Math.random() < 0.35 * L.nature + 0.05) this.bird(t, L.nature);
    if (L.night > 0.02 && Math.random() < 0.6) this.crickets(t, L.night);
    if (L.fire > 0.02) {
      const n = Math.random() < 0.5 ? 1 : 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.crackle(t + Math.random() * 0.24, L.fire);
    }
  }

  // A short bird chirp: one of three "species".
  private bird(t: number, level: number): void {
    const bus = this.layerGain.nature;
    if (!this.ctx || !bus) return;
    const species = Math.floor(Math.random() * 3);
    const base = 2200 + Math.random() * 1200;
    const vol = 0.05 + 0.05 * Math.random();
    if (species === 0) {
      // two quick rising chirps
      for (let i = 0; i < 2; i++) this.sweep(bus, t + i * 0.13, base, base * 1.35, 0.09, vol);
    } else if (species === 1) {
      // falling trill of 4 notes
      for (let i = 0; i < 4; i++) this.sweep(bus, t + i * 0.07, base * 1.2 - i * 120, base - i * 150, 0.05, vol * 0.8);
    } else {
      // single long whistle that rises then falls
      this.sweep(bus, t, base * 0.8, base * 1.2, 0.18, vol);
      this.sweep(bus, t + 0.18, base * 1.2, base * 0.9, 0.15, vol * 0.8);
    }
    void level;
  }

  private sweep(dest: AudioNode, t: number, f0: number, f1: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // A burst of cricket pulses (high pulsed tones).
  private crickets(t: number, level: number): void {
    const bus = this.layerGain.night;
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const f = 4200 + Math.random() * 600;
    const pulses = 3 + Math.floor(Math.random() * 3);
    const vol = 0.012 * (0.5 + level);
    for (let i = 0; i < pulses; i++) {
      const s = t + i * 0.055;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.045);
      o.connect(g).connect(bus);
      o.start(s);
      o.stop(s + 0.06);
    }
  }

  // One fire crackle: a tiny filtered noise click.
  private crackle(t: number, level: number): void {
    const bus = this.layerGain.fire;
    if (!bus) return;
    const vol = (0.15 + Math.random() * 0.35) * (0.4 + level * 0.6);
    this.noiseBurst(bus, t, 0.015 + Math.random() * 0.03, "bandpass", 1500 + Math.random() * 3000, 1.5, vol, false);
  }

  // ---------- effects ----------

  private effect(name: Sfx, t: number): void {
    const out = this.fxGain;
    if (!out) return;
    switch (name) {
      case "click":
        this.tone(out, t, 1800, 1200, 0.03, 0.12, "sine");
        break;
      case "open":
        this.tone(out, t, 500, 900, 0.1, 0.16, "triangle");
        break;
      case "close":
        this.tone(out, t, 900, 450, 0.1, 0.16, "triangle");
        break;
      case "road":
        this.tone(out, t, 110, 60, 0.12, 0.4, "sine");
        this.noiseBurst(out, t, 0.1, "lowpass", 1200, 0.7, 0.35, true);
        break;
      case "zone":
        this.noiseBurst(out, t, 0.06, "bandpass", 2400, 0.9, 0.18, false);
        this.tone(out, t, 700, 520, 0.05, 0.08, "sine");
        break;
      case "place":
        this.tone(out, t, 140, 55, 0.18, 0.55, "sine");
        this.noiseBurst(out, t, 0.06, "lowpass", 900, 0.7, 0.3, true);
        this.tone(out, t + 0.07, C6, C6, 0.3, 0.1, "sine");
        this.tone(out, t + 0.07, C6 * 2, C6 * 2, 0.2, 0.03, "sine");
        break;
      case "bulldoze":
        this.noiseBurst(out, t, 0.45, "lowpass", 500, 0.8, 0.8, true);
        this.noiseBurst(out, t + 0.05, 0.3, "bandpass", 900, 0.8, 0.35, false);
        this.tone(out, t, 90, 40, 0.35, 0.4, "sine");
        break;
      case "error":
        this.tone(out, t, 150, 140, 0.11, 0.2, "square", 700);
        this.tone(out, t + 0.14, 130, 120, 0.15, 0.2, "square", 700);
        break;
      case "cash":
        this.tone(out, t, E6, E6, 0.2, 0.12, "sine");
        this.tone(out, t, E6 * 2, E6 * 2, 0.12, 0.03, "sine");
        this.tone(out, t + 0.09, C6 * 2, C6 * 2, 0.3, 0.12, "sine");
        break;
      case "notify":
        this.tone(out, t, G5, G5, 0.55, 0.15, "sine");
        this.tone(out, t, G5 * 2.01, G5 * 2.01, 0.3, 0.04, "sine");
        break;
      case "warn":
        this.tone(out, t, 660, 660, 0.14, 0.14, "triangle");
        this.tone(out, t + 0.17, 495, 495, 0.2, 0.14, "triangle");
        break;
      case "milestone":
        [C5, E5, G5, C6, E6].forEach((f, i) => {
          this.tone(out, t + i * 0.13, f, f, i === 4 ? 0.5 : 0.28, 0.13, "triangle");
        });
        break;
      case "achievement":
        this.tone(out, t, G5, G5, 0.16, 0.14, "triangle");
        this.tone(out, t + 0.16, G5, G5, 0.16, 0.14, "triangle");
        this.tone(out, t + 0.32, C6, C6, 0.25, 0.14, "triangle");
        [E5, G5, C6].forEach((f) => this.tone(out, t + 0.6, f * 1.0, f * 1.0, 0.6, 0.09, "triangle"));
        this.tone(out, t + 0.6, E6, E6, 0.6, 0.07, "sine");
        break;
      case "siren":
        for (let i = 0; i < 4; i++) {
          this.tone(out, t + i * 0.5, 620, 620, 0.25, 0.1, "triangle", 2000);
          this.tone(out, t + i * 0.5 + 0.25, 830, 830, 0.25, 0.1, "triangle", 2000);
        }
        break;
      case "thunder": {
        this.noiseBurst(out, t, 2.5, "lowpass", 220, 0.7, 1.0, true, 0.25);
        this.noiseBurst(out, t + 0.5, 1.8, "lowpass", 140, 0.7, 0.6, true, 0.3);
        this.tone(out, t, 60, 35, 1.5, 0.3, "sine");
        break;
      }
      case "grow":
        this.tone(out, t, 500, 900, 0.06, 0.12, "sine");
        this.tone(out, t + 0.03, 1200, 1200, 0.07, 0.05, "sine");
        break;
    }
  }

  // A tone with a quick attack and exponential decay.
  private tone(
    dest: AudioNode, t: number, f0: number, f1: number, dur: number, vol: number,
    type: OscillatorType, lowpass?: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = lowpass;
      o.connect(lp).connect(g);
    } else {
      o.connect(g);
    }
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // A filtered noise burst. `brownish` uses the rumbly buffer; `attack` is the fade-in time.
  private noiseBurst(
    dest: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number,
    vol: number, brownish: boolean, attack = 0.005,
  ): void {
    const ctx = this.ctx;
    const buf = brownish ? this.brown : this.white;
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (type === "lowpass") f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.4), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * (buf.duration - dur - 0.1));
    src.stop(t + dur + 0.05);
  }
}

// Per-layer loudness trim so a level of 1 sounds balanced between layers.
const LAYER_TRIM: Record<Layer, number> = {
  traffic: 0.35, city: 0.3, nature: 1, night: 1, rain: 0.35, wind: 0.3, fire: 1,
};

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}
