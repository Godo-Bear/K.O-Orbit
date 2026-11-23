import { Rng } from '../core/rng';
import { save } from '../core/save';
import { synth } from './synth';

/**
 * Procedural music: a look-ahead Web Audio sequencer. Every track is defined by a few
 * parameters (tempo, key, mode, chord progression, groove) and its lead melody is composed
 * deterministically from a seed, so each stage has its own recognisable theme with zero assets.
 */

type Mode = 'major' | 'minor' | 'dorian' | 'phrygian' | 'mixolydian' | 'harmonic' | 'penta' | 'lydian';
const SCALES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11],
  penta: [0, 2, 4, 7, 9, 12, 14], lydian: [0, 2, 4, 6, 7, 9, 11],
};

export interface TrackDef {
  name: string;
  bpm: number;
  root: number; // MIDI note of the tonic (octave 3-ish)
  mode: Mode;
  prog: number[]; // scale degrees (0-based) per bar
  kick: string; snare: string; hat: string; // 16-step patterns ('x' hit, 'o' soft)
  bass: string; // 16 steps: r=root f=fifth o=octave t=third .=rest -=hold
  lead: OscillatorType; leadOct: number; leadVol: number;
  arp?: boolean; pad?: OscillatorType | null; swing?: number; density?: number; bell?: boolean;
}

const D = { four: 'x...x...x...x...', drive: 'x.x.x...x.x.x...', half: 'x.......x.......', broken: 'x..x..x...x.....', none: '................' };
const S = { back: '....x.......x...', half: '........x.......', busy: '....x..o....x.oo', none: '................', trap: '....x.......x..o' };
const H = { eighth: 'x.x.x.x.x.x.x.x.', sixteen: 'xoxoxoxoxoxoxoxo', off: '..x...x...x...x.', sparse: '..x.......x.....', none: '................' };

export const TRACKS: Record<string, TrackDef> = {
  menu: { name: 'Orbit Theme', bpm: 126, root: 50, mode: 'major', prog: [0, 4, 5, 3], kick: D.four, snare: S.back, hat: H.eighth, bass: 'r.r.o.r.r.r.o.f.', lead: 'square', leadOct: 2, leadVol: 0.07, arp: true, pad: 'sawtooth' },
  victory: { name: 'Victory Lap', bpm: 140, root: 52, mode: 'major', prog: [0, 3, 4, 0], kick: D.four, snare: S.back, hat: H.eighth, bass: 'r.o.r.o.r.o.f.o.', lead: 'square', leadOct: 2, leadVol: 0.08, arp: true, pad: 'sawtooth' },
  station: { name: 'Low Orbit', bpm: 120, root: 45, mode: 'minor', prog: [0, 5, 2, 6], kick: D.four, snare: S.back, hat: H.off, bass: 'r.rr..r.r.rr..f.', lead: 'sawtooth', leadOct: 2, leadVol: 0.05, arp: true, pad: 'sawtooth' },
  nebula: { name: 'Nebula Dreams', bpm: 100, root: 50, mode: 'dorian', prog: [0, 3, 0, 4], kick: D.half, snare: S.half, hat: H.sparse, bass: 'r-------f-------', lead: 'triangle', leadOct: 2, leadVol: 0.09, arp: true, pad: 'triangle', bell: true },
  crater: { name: 'Proving Ground', bpm: 142, root: 40, mode: 'minor', prog: [0, 0, 5, 6], kick: D.drive, snare: S.back, hat: H.eighth, bass: 'rrrrrrrrffffoooo', lead: 'square', leadOct: 2, leadVol: 0.06, pad: null },
  ruins: { name: 'Sky Temple', bpm: 132, root: 48, mode: 'mixolydian', prog: [0, 6, 3, 0], kick: D.broken, snare: S.back, hat: H.eighth, bass: 'r..r..r.f..f..o.', lead: 'square', leadOct: 2, leadVol: 0.07, arp: false, pad: 'triangle' },
  forge: { name: 'Molten Core', bpm: 150, root: 40, mode: 'phrygian', prog: [0, 1, 0, 6], kick: D.drive, snare: S.busy, hat: H.sixteen, bass: 'r.rr.rr.r.rr.ooo', lead: 'sawtooth', leadOct: 2, leadVol: 0.05, pad: null },
  glacier: { name: 'Frozen Summit', bpm: 108, root: 52, mode: 'minor', prog: [0, 5, 3, 4], kick: D.half, snare: S.half, hat: H.off, bass: 'r---r---f---f---', lead: 'triangle', leadOct: 3, leadVol: 0.09, arp: true, pad: 'sine', bell: true },
  metro: { name: 'Neon Nights', bpm: 124, root: 45, mode: 'dorian', prog: [0, 6, 5, 4], kick: D.four, snare: S.back, hat: H.sixteen, bass: 'r.ro.ro.r.ro.rf.', lead: 'sawtooth', leadOct: 2, leadVol: 0.05, arp: true, pad: 'sawtooth', swing: 0.12 },
  canopy: { name: 'Treetop Run', bpm: 118, root: 50, mode: 'mixolydian', prog: [0, 3, 6, 3], kick: D.broken, snare: S.back, hat: H.eighth, bass: 'r..f..o.r..f..t.', lead: 'triangle', leadOct: 2, leadVol: 0.09, arp: false, pad: 'triangle', swing: 0.18 },
  hyperlane: { name: 'Warp Speed', bpm: 164, root: 45, mode: 'minor', prog: [0, 5, 6, 4], kick: D.drive, snare: S.back, hat: H.sixteen, bass: 'roroforoforoforo', lead: 'square', leadOct: 2, leadVol: 0.06, arp: true, pad: null },
  abyss: { name: 'Void Sovereign', bpm: 140, root: 38, mode: 'harmonic', prog: [0, 5, 1, 4], kick: D.drive, snare: S.trap, hat: H.eighth, bass: 'r.r.r.rrr.r.ooo.', lead: 'sawtooth', leadOct: 2, leadVol: 0.06, arp: true, pad: 'sawtooth' },
  reef: { name: 'Coral Lullaby', bpm: 92, root: 53, mode: 'lydian', prog: [0, 1, 0, 4], kick: D.half, snare: S.none, hat: H.sparse, bass: 'r-----f-o-----f-', lead: 'sine', leadOct: 2, leadVol: 0.12, arp: true, pad: 'triangle', bell: true },
  dunes: { name: 'Mirage', bpm: 112, root: 47, mode: 'harmonic', prog: [0, 1, 0, 6], kick: D.broken, snare: S.back, hat: H.off, bass: 'r..r.r..r..r.f..', lead: 'square', leadOct: 2, leadVol: 0.06, pad: 'triangle', swing: 0.1 },
  storm: { name: 'Thunder Spire', bpm: 148, root: 42, mode: 'minor', prog: [0, 6, 5, 6], kick: D.drive, snare: S.busy, hat: H.sixteen, bass: 'rrrrrrrrrrrrffoo', lead: 'sawtooth', leadOct: 2, leadVol: 0.055, arp: true, pad: 'sawtooth' },
  clockwork: { name: 'Gearworks', bpm: 136, root: 48, mode: 'dorian', prog: [0, 4, 3, 4], kick: D.four, snare: S.back, hat: H.sixteen, bass: 'r.f.r.f.o.f.r.f.', lead: 'square', leadOct: 2, leadVol: 0.06, arp: true, pad: null, bell: true },
  shrine: { name: 'Petal Wind', bpm: 104, root: 50, mode: 'penta', prog: [0, 3, 4, 0], kick: D.broken, snare: S.half, hat: H.off, bass: 'r---o---f---r---', lead: 'triangle', leadOct: 2, leadVol: 0.1, arp: false, pad: 'sine', bell: true },
};

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Music {
  private bus: GainNode | null = null;
  private duck: GainNode | null = null;
  private track: TrackDef | null = null;
  private trackId = '';
  private wanted = '';
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private melody: number[] = []; // per 16th over 4 bars (-1 rest, else scale index)
  current = '';

  constructor() { synth.onUnlock = () => { if (this.wanted) this.play(this.wanted, true); }; }

  private ensure() {
    const c = synth.ctx;
    if (!c || !synth.master) return null;
    if (!this.bus) {
      this.bus = c.createGain();
      this.duck = c.createGain();
      this.bus.connect(this.duck).connect(synth.master);
      this.applyVolume();
    }
    return c;
  }

  applyVolume() { if (this.bus) this.bus.gain.value = save.settings.music * 0.9; }

  /** Lower the music while paused / in menus over a match. */
  setDucked(d: boolean) {
    const c = synth.ctx; if (!c || !this.duck) return;
    this.duck.gain.setTargetAtTime(d ? 0.35 : 1, c.currentTime, 0.15);
  }

  play(id: string, force = false) {
    this.wanted = id;
    if (!force && id === this.trackId && this.timer) return;
    const c = this.ensure();
    if (!c) return; // will start on first user gesture
    const def = TRACKS[id] ?? TRACKS.menu;
    this.stopTimer();
    // fade in the new track
    if (this.bus) { this.bus.gain.cancelScheduledValues(c.currentTime); this.bus.gain.setValueAtTime(0.0001, c.currentTime); this.bus.gain.linearRampToValueAtTime(save.settings.music * 0.9, c.currentTime + 0.6); }
    this.track = def; this.trackId = id; this.current = def.name;
    this.melody = compose(def, id);
    this.step = 0;
    this.nextTime = c.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop() { this.wanted = ''; this.stopTimer(); this.trackId = ''; }
  private stopTimer() { if (this.timer) { clearInterval(this.timer); this.timer = 0; } }

  private schedule() {
    const c = synth.ctx, t = this.track;
    if (!c || !t || !this.bus) return;
    if (save.settings.muted || save.settings.music <= 0) { this.nextTime = c.currentTime + 0.05; return; }
    const sixteenth = 60 / t.bpm / 4;
    while (this.nextTime < c.currentTime + 0.14) {
      const swing = (this.step % 2 === 1 ? (t.swing ?? 0) * sixteenth : 0);
      this.playStep(this.step, this.nextTime + swing, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % (16 * t.prog.length * 2);
    }
  }

  private noteOf(t: TrackDef, degree: number, octave: number) {
    const sc = SCALES[t.mode];
    const n = sc.length;
    const oct = Math.floor(degree / n);
    const d = ((degree % n) + n) % n;
    return t.root + 12 * (octave + oct) + sc[d];
  }

  private playStep(step: number, time: number, dur: number) {
    const t = this.track!;
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % t.prog.length;
    const chord = t.prog[bar];
    const section = Math.floor(step / (16 * t.prog.length)); // A / B alternation
    // drums
    if (t.kick[s16] === 'x') this.kick(time);
    if (t.snare[s16] === 'x' || t.snare[s16] === 'o') this.snare(time, t.snare[s16] === 'o' ? 0.4 : 1);
    if (t.hat[s16] === 'x' || t.hat[s16] === 'o') this.hat(time, t.hat[s16] === 'o' ? 0.45 : 1);
    if (s16 === 0 && bar === 0 && section % 2 === 0) this.crash(time);
    // bass
    const b = t.bass[s16];
    if (b !== '.' && b !== '-') {
      let len = 1; while (t.bass[(s16 + len) % 16] === '-' && len < 16 - s16) len++;
      const deg = chord + (b === 'f' ? 4 : b === 't' ? 2 : 0);
      this.tone(mtof(this.noteOf(t, deg, b === 'o' ? 0 : -1)), time, dur * len * 0.95, 'sawtooth', 0.09, 520);
    }
    // pad
    if (t.pad && s16 === 0) for (const k of [0, 2, 4]) this.tone(mtof(this.noteOf(t, chord + k, 1)), time, dur * 16, t.pad, 0.022, 1400, 0.25);
    // arpeggio
    if (t.arp && s16 % 2 === 0) {
      const k = [0, 2, 4, 7][(s16 / 2) % 4];
      this.tone(mtof(this.noteOf(t, chord + k, 1 + (section % 2))), time, dur * 1.6, 'square', 0.018, 2600);
    }
    // lead (A section composed, B section varies up an octave with sparser rhythm)
    const mi = step % this.melody.length;
    const m = this.melody[mi];
    if (m !== undefined && m >= 0 && !(section % 4 === 3 && s16 % 4 !== 0)) {
      let len = 1; while (this.melody[(mi + len) % this.melody.length] === -2 && len < 8) len++;
      const oct = t.leadOct + (section % 4 === 2 ? 1 : 0) - 1;
      const f = mtof(this.noteOf(t, m, oct));
      this.tone(f, time, dur * len * 0.9, t.lead, t.leadVol, 3800, 0.01, true);
      if (t.bell) this.tone(f * 2, time, dur * 2.5, 'sine', t.leadVol * 0.35, 8000);
    }
  }

  // ---------------------------------------------------------------- voices
  private tone(freq: number, time: number, dur: number, type: OscillatorType, vol: number, cutoff: number, attack = 0.005, vibrato = false) {
    const c = synth.ctx!;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, time);
    if (vibrato && dur > 0.25) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * 0.006; l.connect(lg).connect(o.frequency); l.start(time + 0.12); l.stop(time + dur + 0.05); }
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + attack);
    g.gain.setValueAtTime(vol, time + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.04);
    o.connect(f).connect(g).connect(this.bus!);
    o.start(time); o.stop(time + dur + 0.08);
  }
  private kick(time: number) {
    const c = synth.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, time); o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    g.gain.setValueAtTime(0.5, time); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    o.connect(g).connect(this.bus!); o.start(time); o.stop(time + 0.25);
  }
  private noise(time: number, dur: number, vol: number, freq: number, type: BiquadFilterType) {
    const c = synth.ctx!;
    const buf = (synth as any).noise as AudioBuffer | null;
    if (!buf) return;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, time); g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    s.connect(f).connect(g).connect(this.bus!); s.start(time, Math.random() * 0.5); s.stop(time + dur + 0.02);
  }
  private snare(time: number, k: number) { this.noise(time, 0.16, 0.22 * k, 1800, 'bandpass'); this.tone(190, time, 0.08, 'triangle', 0.12 * k, 2000); }
  private hat(time: number, k: number) { this.noise(time, 0.04, 0.09 * k, 8000, 'highpass'); }
  private crash(time: number) { this.noise(time, 0.9, 0.08, 5000, 'highpass'); }
}

/** Compose a 4-bar lead phrase (per 16th: scale degree, -1 rest, -2 hold) from the track seed. */
function compose(t: TrackDef, id: string): number[] {
  let seed = 0; for (const ch of id + t.name) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const r = new Rng(seed);
  const rhythms = [
    'x.x.x..xx.x.x...', 'x..x..x.x..x.x..', 'x-x-x.x.x---x.x.', 'x...x.x.x...x.x.', 'x.xxx.x.x.xx-...', 'x--.x--.x.x.x---',
  ];
  const out: number[] = [];
  const motif = rhythms[r.int(rhythms.length)];
  const answer = rhythms[r.int(rhythms.length)];
  let deg = t.prog[0] + [0, 2, 4][r.int(3)];
  t.prog.forEach((chord, bar) => {
    const rh = bar % 2 === 0 ? motif : answer;
    for (let i = 0; i < 16; i++) {
      const c = rh[i];
      if (c === '.') { out.push(-1); continue; }
      if (c === '-') { out.push(-2); continue; }
      // gravitate to chord tones on strong beats, stepwise motion otherwise
      if (i % 4 === 0) {
        const tones = [chord, chord + 2, chord + 4, chord + 7];
        let best = tones[0], bd = 99;
        for (const tn of tones) { const d = Math.abs(tn - deg) + r.next() * 1.5; if (d < bd) { bd = d; best = tn; } }
        deg = best;
      } else deg += [-1, 1, 1, -1, 2, -2][r.int(6)];
      deg = Math.max(chord - 3, Math.min(chord + 9, deg));
      out.push(deg);
    }
    if (bar === t.prog.length - 1) { out[out.length - 4] = chord; out[out.length - 3] = -2; out[out.length - 2] = -2; out[out.length - 1] = -1; }
  });
  return out;
}

export const music = new Music();

/** Which track plays on a stage. */
export const stageTrack = (stageId: string) => (TRACKS[stageId] ? stageId : 'station');
