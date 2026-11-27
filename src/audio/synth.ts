import { save } from '../core/save';
import type { GameEvent, Fx } from '../sim/types';

/** Procedural Web Audio synthesizer — every sound is generated at runtime, no assets. */
class Synth {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  onUnlock: (() => void) | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voicesThisFrame = 0;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolume();
    this.onUnlock?.();
  }

  applyVolume() {
    if (!this.master || !this.sfxBus) return;
    const s = save.settings;
    this.master.gain.value = s.muted ? 0 : s.master;
    this.sfxBus.gain.value = s.sfx;
  }

  frame() { this.voicesThisFrame = 0; }

  private ok() { return this.ctx && this.sfxBus && !save.settings.muted && this.voicesThisFrame++ < 10; }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = 'bandpass', sweepTo?: number, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfxBus!);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  hit(power: number, fx: Fx = 'hit') {
    const p = Math.min(1, power / 160);
    this.burst(0.08 + p * 0.25, 0.5 + p * 0.5, 1800 - p * 1200, 0.8, 'lowpass', 200);
    this.tone('square', 220 - p * 120, 50, 0.08 + p * 0.2, 0.25 + p * 0.3);
    if (fx === 'elec') this.tone('sawtooth', 900, 300, 0.12, 0.12);
    if (fx === 'fire') this.burst(0.25, 0.25, 600, 0.5, 'lowpass', 120, 0.02);
    if (fx === 'ice') this.tone('triangle', 2400, 1800, 0.15, 0.15);
    if (fx === 'slash') this.burst(0.12, 0.35, 5000, 2, 'highpass');
    if (fx === 'dark') this.tone('sine', 120, 40, 0.3, 0.35);
    if (p > 0.75) { this.tone('sine', 90, 30, 0.5, 0.6); this.burst(0.5, 0.4, 400, 0.5, 'lowpass', 60, 0.03); }
  }
  whiff(p: number) { this.burst(0.07 + Math.min(0.08, p / 200), 0.12 + Math.min(0.12, p / 100), 2500, 1.2, 'bandpass', 900); }
  jump() { this.tone('triangle', 300, 620, 0.12, 0.18); }
  djump() { this.tone('triangle', 420, 900, 0.14, 0.16); this.burst(0.1, 0.1, 3000, 1); }
  land() { this.burst(0.06, 0.18, 400, 1, 'lowpass'); }
  shield() { this.tone('sine', 520, 520, 0.1, 0.08); }
  shieldHit() { this.tone('sine', 900, 700, 0.12, 0.2); this.burst(0.05, 0.15, 4000, 2); }
  shieldBreak() { this.tone('square', 900, 120, 0.6, 0.3); this.burst(0.5, 0.4, 3000, 0.7, 'bandpass', 300); }
  ko() {
    this.burst(1.2, 0.8, 2000, 0.4, 'lowpass', 60);
    this.tone('sawtooth', 600, 40, 1.0, 0.35);
    this.tone('sine', 80, 25, 1.2, 0.6);
  }
  projectile() { this.tone('sine', 700, 1300, 0.1, 0.12); }
  reflect() { this.tone('square', 1200, 2400, 0.12, 0.14); }
  counter() { this.tone('triangle', 1600, 2600, 0.08, 0.2); this.tone('triangle', 2600, 2600, 0.15, 0.15, 0.06); }
  charge() { this.tone('sawtooth', 200, 600, 0.5, 0.08); }
  tech() { this.tone('triangle', 1400, 1400, 0.06, 0.15); }
  ledge() { this.tone('square', 320, 260, 0.05, 0.08); }
  count(n: number) { this.tone('square', n > 0 ? 440 : 880, n > 0 ? 440 : 880, n > 0 ? 0.18 : 0.45, 0.22); }
  game() { [523, 659, 784, 1046].forEach((f, i) => this.tone('square', f, f, 0.18, 0.18, i * 0.09)); }
  menuMove() { this.tone('square', 660, 660, 0.04, 0.07); }
  menuSelect() { this.tone('square', 880, 1320, 0.09, 0.12); }
  menuBack() { this.tone('square', 500, 300, 0.08, 0.1); }
  unlockJingle() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.2, i * 0.11)); }

  playEvents(events: GameEvent[]) {
    this.frame();
    for (const e of events) {
      switch (e.type) {
        case 'hit': if ((e.slot ?? 0) >= 0 || (e.p ?? 0) > 20) this.hit(e.p ?? 10, e.fx); break;
        case 'shieldhit': this.shieldHit(); break;
        case 'shieldbreak': this.shieldBreak(); break;
        case 'ko': this.ko(); break;
        case 'jump': this.jump(); break;
        case 'djump': this.djump(); break;
        case 'land': if ((e.p ?? 0) > 0.8) this.land(); break;
        case 'whiff': this.whiff(e.p ?? 5); break;
        case 'proj': this.projectile(); break;
        case 'reflect': this.reflect(); break;
        case 'counter': this.counter(); break;
        case 'charge': this.charge(); break;
        case 'tech': this.tech(); break;
        case 'ledge': this.ledge(); break;
        case 'count': this.count(e.n ?? 1); break;
        case 'go': this.count(0); break;
        case 'game': this.game(); break;
        case 'dodge': if (e.n === 0) this.shield(); else this.burst(0.1, 0.1, 2000, 1); break;
        case 'hazard': this.burst(0.9, 0.12, 900, 0.6, 'bandpass', 300); break;
        case 'bolt': this.burst(0.6, 0.7, 4000, 0.5, 'highpass'); this.tone('sawtooth', 120, 30, 0.7, 0.4); break;
        case 'geyser': this.burst(0.8, 0.5, 500, 0.6, 'lowpass', 120); break;
      }
    }
  }
}

export const synth = new Synth();
