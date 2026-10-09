/**
 * Procedural WebAudio SFX (adds ~nothing to the bundle). Starts suspended until the first
 * user gesture (iOS/autoplay policy), then fades in. muteAudio from the platform overrides all.
 */
export type Sfx =
  | 'coin'
  | 'pop'
  | 'unlock'
  | 'whistle'
  | 'kick'
  | 'net'
  | 'cheer'
  | 'register'
  | 'honk'
  | 'pick'
  | 'drop'
  | 'sign'
  | 'levelup'
  | 'tick'
  | 'step';

interface AudioWindow {
  webkitAudioContext?: typeof AudioContext;
}

export class AudioSystem {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  sound = true;
  music = true;
  platformMuted = false;
  adMuted = false;
  private readonly lastPlayed = new Map<Sfx, number>();
  private duck = 1;

  constructor() {
    const unlock = (): void => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }

  private create(): void {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as AudioWindow).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.22;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 0.6;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  /** Must run inside a user gesture handler (iOS). */
  unlock(): void {
    this.create();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => undefined);
    if (!this.unlocked) {
      this.unlocked = true;
      this.applyVolume(0.6);
    }
  }

  get audible(): boolean {
    return this.unlocked && !this.platformMuted && !this.adMuted;
  }

  applyVolume(fade = 0.15): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxGain || !this.musicGain) return;
    const on = this.audible ? 1 : 0;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on, t, fade / 3);
    this.sfxGain.gain.setTargetAtTime(this.sound ? 0.55 : 0, t, 0.03);
    this.musicGain.gain.setTargetAtTime(this.music ? 0.2 * this.duck : 0, t, 0.2);
  }

  setDuck(d: number): void {
    this.duck = d;
    this.applyVolume();
  }

  /** Suspend the context while hidden to save battery. */
  setHidden(hidden: boolean): void {
    if (!this.ctx || !this.unlocked) return;
    if (hidden) this.ctx.suspend().catch(() => undefined);
    else this.ctx.resume().catch(() => undefined);
  }

  private osc(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number, dest?: AudioNode): void {
    const ctx = this.ctx as AudioContext;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest ?? (this.sfxGain as GainNode));
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private noiseBurst(t0: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxGain as GainNode);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  play(s: Sfx, pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.audible || !this.sound || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const minGap: Partial<Record<Sfx, number>> = { coin: 0.045, pick: 0.05, drop: 0.05, tick: 0.06, step: 0.1, kick: 0.05 };
    const last = this.lastPlayed.get(s) ?? -1;
    if (now - last < (minGap[s] ?? 0.02)) return;
    this.lastPlayed.set(s, now);
    const t = now + 0.005;
    switch (s) {
      case 'coin':
        this.osc('square', 1318 * pitch, 1318 * pitch, t, 0.06, 0.12);
        this.osc('square', 1975 * pitch, 1975 * pitch, t + 0.05, 0.12, 0.1);
        break;
      case 'tick':
        this.osc('triangle', 880 * pitch, 990 * pitch, t, 0.05, 0.12);
        break;
      case 'pop':
        this.osc('sine', 520 * pitch, 180 * pitch, t, 0.16, 0.35);
        this.noiseBurst(t, 0.06, 0.15, 'highpass', 2000);
        break;
      case 'unlock':
        this.osc('sine', 300, 120, t, 0.22, 0.4);
        [523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, f, t + 0.04 + i * 0.07, 0.2, 0.22));
        this.noiseBurst(t, 0.25, 0.12, 'bandpass', 3000, 0.8);
        break;
      case 'whistle':
        this.osc('sine', 2600, 2500, t, 0.35, 0.18);
        this.osc('sine', 2650, 2550, t, 0.35, 0.08);
        break;
      case 'kick':
        this.osc('sine', 160 * pitch, 50, t, 0.12, 0.45);
        this.noiseBurst(t, 0.05, 0.2, 'lowpass', 1200);
        break;
      case 'net':
        this.noiseBurst(t, 0.3, 0.22, 'bandpass', 1400, 0.6);
        break;
      case 'cheer':
        this.noiseBurst(t, 0.9, 0.18, 'bandpass', 900, 0.5);
        this.noiseBurst(t + 0.1, 0.8, 0.12, 'bandpass', 1800, 0.7);
        break;
      case 'register':
        this.osc('triangle', 2093, 2093, t, 0.25, 0.18);
        this.osc('triangle', 2637, 2637, t + 0.08, 0.35, 0.16);
        this.noiseBurst(t, 0.08, 0.15, 'highpass', 4000);
        break;
      case 'honk':
        this.osc('square', 330, 320, t, 0.18, 0.12);
        this.osc('square', 415, 405, t, 0.18, 0.09);
        this.osc('square', 330, 320, t + 0.24, 0.28, 0.12);
        this.osc('square', 415, 405, t + 0.24, 0.28, 0.09);
        break;
      case 'pick':
        this.osc('sine', 600 * pitch, 900 * pitch, t, 0.07, 0.22);
        break;
      case 'drop':
        this.osc('sine', 420 * pitch, 260 * pitch, t, 0.08, 0.25);
        break;
      case 'sign':
        this.noiseBurst(t, 0.12, 0.1, 'highpass', 3500);
        this.osc('triangle', 784, 784, t + 0.1, 0.12, 0.2);
        this.osc('triangle', 1175, 1175, t + 0.18, 0.2, 0.2);
        break;
      case 'levelup':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.osc('square', f, f, t + i * 0.08, 0.22, 0.1));
        break;
      case 'step':
        this.noiseBurst(t, 0.04, 0.03, 'lowpass', 600);
        break;
    }
  }
}
