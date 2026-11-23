import { input } from '../core/input';
import { decodeInput, emptyInput, encodeInput, mergePresses, type InputFrame } from '../core/inputFrame';
import { save } from '../core/save';
import { synth } from '../audio/synth';
import { CpuBrain } from '../sim/ai';
import { World } from '../sim/world';
import type { GameEvent, MatchRules, SlotConfig } from '../sim/types';
import type { Renderer, PerfInfo } from '../render/renderer';
import type { NetClient } from '../net/client';
import { applySnapshot, encodeSnapshot } from '../net/protocol';
import type { StoryStage } from '../story/campaign';

export type SessionKind = 'local' | 'demo' | 'host' | 'client';

export interface MatchConfig {
  rules: MatchRules;
  slots: SlotConfig[];
  seed?: number;
  story?: StoryStage;
  /** host: fighter index -> peer id */
  peerSlots?: Record<number, number>;
}

class RemoteQueue {
  q: InputFrame[] = [];
  last: InputFrame = emptyInput();
  lastSeq = -1;
  push(seq: number, frames: number[][]) {
    // frames[i] corresponds to seq - (frames.length-1-i)
    for (let i = 0; i < frames.length; i++) {
      const s = seq - (frames.length - 1 - i);
      if (s <= this.lastSeq) continue;
      this.q.push(decodeInput(frames[i]));
      this.lastSeq = s;
    }
  }
  pop(): InputFrame {
    // jitter buffer: if too far behind, drop frames (merging their presses) to catch up
    while (this.q.length > 4) { const d = this.q.shift()!; mergePresses(this.q[0], d); }
    const f = this.q.shift();
    if (f) { this.last = f; return f; }
    // starved: hold last movement & buttons, no new presses
    const h = { ...this.last, jumpP: false, attackP: false, specialP: false, shieldP: false, smashP: false, downTap: false, dashTap: 0, pauseP: false };
    return h;
  }
}

export class Session {
  world: World;
  brains: (CpuBrain | null)[] = [];
  devices: (string | null)[] = [];
  remote = new Map<number, RemoteQueue>();
  paused = false;
  ended = false;
  onPause: () => void = () => {};
  onEnd: () => void = () => {};
  private delayQ = new Map<number, InputFrame[]>();
  private pendingEvents: GameEvent[] = [];
  private snapTimer = 0;
  private seq = 0;
  private sentHist: number[][] = [];
  private lastSnapAt = 0;
  private snapInterval = 33;
  myIndex = -1; // client: own fighter index
  slotTags = new Map<number, string>();

  constructor(public kind: SessionKind, public cfg: MatchConfig, public net?: NetClient) {
    this.world = new World(cfg.rules, cfg.slots, cfg.seed ?? (Date.now() & 0xffff));
    this.world.remoteView = kind === 'client';
    cfg.slots.forEach((s, i) => {
      this.brains.push(s.type === 'CPU' && kind !== 'client' ? new CpuBrain(s.cpuLevel, s.slot + (cfg.seed ?? 7)) : null);
      this.devices.push(s.type === 'HUMAN' ? s.device ?? 'kb1' : null);
      if (s.type === 'REMOTE' && kind === 'host') this.remote.set(i, new RemoteQueue());
      if (s.type === 'CPU') this.slotTags.set(s.slot, `CPU ${s.cpuLevel}`);
      if (s.name && s.type !== 'CPU') this.slotTags.set(s.slot, `P${s.slot + 1} ${s.name}`);
    });
    if (net && kind === 'host') {
      net.onMsg = (from, d) => {
        if (d?.k !== 'in') return;
        const idx = Object.entries(cfg.peerSlots ?? {}).find(([, pid]) => pid === from)?.[0];
        if (idx === undefined) return;
        this.remote.get(+idx)?.push(d.s, d.f);
      };
    }
    if (net && kind === 'client') {
      net.onMsg = (_from, d) => {
        if (d?.k === 'snap') {
          const now = performance.now();
          if (this.lastSnapAt) this.snapInterval = this.snapInterval * 0.8 + Math.min(120, now - this.lastSnapAt) * 0.2;
          this.lastSnapAt = now;
          applySnapshot(this.world, d);
          this.pendingEvents.push(...this.world.events);
        }
      };
    }
  }

  /** One fixed simulation tick. */
  step() {
    const w = this.world;
    if (this.kind === 'client') {
      // send own input (with redundancy for loss tolerance)
      const dev = this.devices[this.myIndex] ?? 'kb1';
      const f = input.get(dev);
      if (f.pauseP) this.onPause();
      this.seq++;
      this.sentHist.push(encodeInput(f));
      if (this.sentHist.length > 3) this.sentHist.shift();
      this.net?.send('host', { k: 'in', s: this.seq, f: this.sentHist });
      if (w.phase === 'over' && !this.ended) { this.ended = true; this.onEnd(); }
      return;
    }
    if (this.paused) return;
    const inputs: InputFrame[] = [];
    let pauseReq = false;
    for (let i = 0; i < w.fighters.length; i++) {
      const b = this.brains[i];
      if (b) { inputs.push(b.think(w.fighters[i], w)); continue; }
      const rq = this.remote.get(i);
      if (rq) { inputs.push(rq.pop()); continue; }
      const dev = this.devices[i];
      if (!dev) { inputs.push(emptyInput()); continue; }
      let f = input.get(dev);
      if (f.pauseP) pauseReq = true;
      if (this.kind === 'host' && save.settings.inputDelay > 0) {
        // local delay so the host doesn't have an unfair latency advantage
        let q = this.delayQ.get(i);
        if (!q) { q = []; this.delayQ.set(i, q); }
        q.push(f);
        f = q.length > save.settings.inputDelay ? q.shift()! : emptyInput();
      }
      inputs.push(f);
    }
    if (pauseReq && this.kind === 'local' && w.phase === 'play') { this.paused = true; this.onPause(); return; }
    if (pauseReq && this.kind === 'host') this.onPause();
    w.step(inputs);
    if (this.kind === 'demo') { this.pendingEvents.length = 0; }
    this.pendingEvents.push(...w.events);
    if (this.kind === 'host' && this.net) {
      if (++this.snapTimer >= 2 || w.phase === 'over') {
        this.snapTimer = 0;
        this.net.send('all', encodeSnapshot(w, this.pendingEvents.filter((e) => e.type !== 'whiff').slice(0, 60)));
      }
    }
    if (w.phase === 'over' && !this.ended) { this.ended = true; this.onEnd(); }
  }

  render(r: Renderer, alpha: number, perf: PerfInfo | null, showHitboxes: boolean) {
    const ev = this.pendingEvents;
    if (ev.length) {
      r.handleEvents(ev, this.world);
      if (this.kind !== 'demo') synth.playEvents(ev);
      ev.length = 0;
    }
    if (this.kind === 'client') alpha = Math.min(1, (performance.now() - this.lastSnapAt) / Math.max(16, this.snapInterval));
    r.render(this.world, alpha, { perf, showHitboxes, paused: this.paused, slotTags: this.slotTags, screenShake: save.settings.screenShake, hideHud: this.kind === 'demo' });
  }
}
