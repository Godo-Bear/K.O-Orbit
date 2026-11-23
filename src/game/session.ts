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
  practice?: PracticeOpts;
}

export type DummyMode = 'stand' | 'shield' | 'jump' | 'crouch' | 'cpu';
export interface PracticeOpts { dummy: DummyMode; level: number; startPct: number }

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
  // practice-mode training data
  combo = 0; comboDmg = 0; bestCombo = 0; lastHitDmg = 0; lastMove = ''; comboTimer = 0;
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
    const pr = this.cfg.practice;
    let wasStunned = false, dmg0 = 0;
    const dummy = pr ? w.fighters[1] : null;
    if (pr && dummy) {
      inputs[1] = this.dummyInput(pr, dummy, inputs[1]);
      wasStunned = (dummy.state === 'hitstun' && dummy.hitstun > 0) || dummy.hitlag > 0 || dummy.state === 'shieldstun';
      dmg0 = dummy.damageTaken;
    }
    w.step(inputs);
    if (pr && dummy) this.trackCombo(dummy, wasStunned, dmg0);
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

  private dummyInput(pr: PracticeOpts, d: import('../sim/fighter').Fighter, cpu: InputFrame): InputFrame {
    const f = emptyInput();
    switch (pr.dummy) {
      case 'cpu': return cpu;
      case 'shield': f.shield = true; f.shieldP = d.state !== 'shield' && d.state !== 'shieldstun'; break;
      case 'crouch': f.y = 1; break;
      case 'jump': if (d.grounded && this.world.frame % 70 === 0) { f.jumpP = f.jump = true; } else f.jump = !d.grounded && d.vy < 0; break;
    }
    // always tech & DI toward the stage a little so combos feel realistic
    if (d.state === 'hitstun' && d.y > -40) f.shieldP = this.world.frame % 3 === 0 && pr.dummy !== 'stand';
    return f;
  }

  private trackCombo(d: import('../sim/fighter').Fighter, wasStunned: boolean, dmg0: number) {
    const hits = this.world.events.filter((e) => e.type === 'hit' && e.slot === d.slot);
    if (hits.length) {
      const dmg = d.damageTaken - dmg0;
      if (!wasStunned && this.comboTimer <= 0) { this.combo = 0; this.comboDmg = 0; }
      this.combo += hits.length; this.comboDmg += dmg; this.lastHitDmg = dmg;
      const atk = this.world.fighters[0];
      this.lastMove = atk.move?.name ?? 'Projectile';
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.comboTimer = 2;
    } else if (!((d.state === 'hitstun' && d.hitstun > 0) || d.hitlag > 0)) this.comboTimer--;
  }

  /** Practice: put both fighters back at their start spots. */
  resetPositions() {
    const w = this.world, main = w.mainPlatform();
    w.fighters.forEach((f, i) => {
      f.releaseLedge(w);
      f.x = f.rx = f.prevX = i === 0 ? -110 : 110;
      f.y = f.ry = f.prevY = main.y; f.ground = main;
      f.vx = f.vy = f.kvx = f.kvy = 0; f.hitlag = 0; f.hitstun = 0; f.tumble = false; f.shieldHP = 50;
      f.facing = i === 0 ? 1 : -1; f.setState('idle');
      if (i === 1) f.percent = this.cfg.practice?.startPct ?? 0;
    });
    this.combo = 0; this.comboDmg = 0;
    w.projectiles.forEach((p) => (p.active = false));
  }

  render(r: Renderer, alpha: number, perf: PerfInfo | null, showHitboxes: boolean) {
    const ev = this.pendingEvents;
    if (ev.length) {
      r.handleEvents(ev, this.world);
      if (this.kind !== 'demo') synth.playEvents(ev);
      ev.length = 0;
    }
    if (this.kind === 'client') alpha = Math.min(1, (performance.now() - this.lastSnapAt) / Math.max(16, this.snapInterval));
    r.render(this.world, alpha, { perf, showHitboxes, paused: this.paused, slotTags: this.slotTags, screenShake: save.settings.screenShake, intensity: save.settings.intensity, hideHud: this.kind === 'demo' });
    if (this.cfg.practice) {
      const d = this.world.fighters[1], a = this.world.fighters[0];
      r.drawPanel([
        'PRACTICE',
        `Combo: ${this.combo} hit${this.combo === 1 ? '' : 's'}  (${this.comboDmg.toFixed(1)}%)`,
        `Best combo: ${this.bestCombo}`,
        `Last hit: ${this.lastMove} · ${this.lastHitDmg.toFixed(1)}%`,
        `Dummy: ${this.cfg.practice.dummy.toUpperCase()}${this.cfg.practice.dummy === 'cpu' ? ' Lv' + this.cfg.practice.level : ''} · ${Math.floor(d.percent)}%`,
        `You: ${a.state}${a.move ? ' / ' + a.move.name + ' f' + a.moveFrame : ''}`,
        'Pause → reset · dummy % · behaviour · F4 hitboxes',
      ], this.combo > 1 && this.comboTimer > 0);
    }
  }
}
