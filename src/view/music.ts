import type { AudioSystem } from './audio';

/**
 * Procedural cheerful music loop (lazy-loaded after gameplayStart; ~2 KB instead of a 600 KB file).
 * I–V–vi–IV in C at 112 BPM: plucky lead, soft pad bass, light hats.
 */
const BPM = 112;
const BEAT = 60 / BPM;
const CHORDS = [
  [60, 64, 67],
  [55, 59, 62],
  [57, 60, 64],
  [53, 57, 60],
];
const MELODY = [72, 0, 76, 74, 72, 0, 67, 69, 71, 0, 74, 72, 71, 69, 67, 0, 69, 0, 72, 71, 69, 0, 64, 67, 65, 67, 69, 72, 71, 0, 67, 0];

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export function startMusic(audio: AudioSystem): void {
  let step = 0;
  let next = 0;
  const tick = (): void => {
    const ctx = audio.ctx;
    const out = audio.musicGain;
    if (!ctx || !out || ctx.state !== 'running') return;
    if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.25) {
      const bar = Math.floor(step / 8) % CHORDS.length;
      const chord = CHORDS[bar] as number[];
      const s8 = step % 8;
      if (s8 === 0) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = mtof((chord[0] as number) - 24);
        g.gain.setValueAtTime(0.0001, next);
        g.gain.exponentialRampToValueAtTime(0.5, next + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, next + BEAT * 3.6);
        o.connect(g).connect(out);
        o.start(next);
        o.stop(next + BEAT * 3.8);
      }
      if (s8 % 2 === 1) {
        // off-beat chord stab
        for (const n of chord) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = mtof(n);
          g.gain.setValueAtTime(0.0001, next);
          g.gain.exponentialRampToValueAtTime(0.09, next + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, next + BEAT * 0.4);
          o.connect(g).connect(out);
          o.start(next);
          o.stop(next + BEAT * 0.45);
        }
      }
      const m = MELODY[step % MELODY.length] as number;
      if (m) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = mtof(m);
        g.gain.setValueAtTime(0.0001, next);
        g.gain.exponentialRampToValueAtTime(0.07, next + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, next + BEAT * 0.45);
        o.connect(g).connect(out);
        o.start(next);
        o.stop(next + BEAT * 0.5);
      }
      next += BEAT / 2;
      step++;
    }
  };
  window.setInterval(tick, 100);
}
