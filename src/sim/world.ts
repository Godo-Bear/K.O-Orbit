import type { InputFrame } from '../core/inputFrame';
import { emptyInput } from '../core/inputFrame';
import { MAX_PLAYERS } from '../core/constants';
import { Rng } from '../core/rng';
import { Fighter } from './fighter';
import { Platform, stageById, type StageDef } from './stages';
import type { GameEvent, Hitbox, MatchRules, SlotConfig, Fx, HazardKind } from './types';
import { charById } from './characters';

export interface Ledge { x: number; y: number; side: number; plat: Platform; owner: number }

export interface Projectile {
  active: boolean;
  owner: number; team: number;
  x: number; y: number; vx: number; vy: number;
  gravity: number; life: number; age: number;
  r: number; hb: Hitbox;
  kind: string; fx: Fx;
  bounce: number; // remaining ground bounces (0 = break on ground)
  homing: number;
  hits: number; // remaining hits before vanishing
  rehitTimer: number;
  lastVictim: number;
  rx?: number; ry?: number;
}

const PROJ_POOL = 96;

export interface Placement { slot: number; place: number }

export class World {
  frame = 0;
  fighters: Fighter[] = [];
  platforms: Platform[] = [];
  ledges: Ledge[] = [];
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];
  stage: StageDef;
  rng: Rng;
  phase: 'countdown' | 'play' | 'game' | 'over' = 'countdown';
  phaseFrame = 0;
  timeLeft = 0; // frames
  gravityMul: number;
  damageMul: number;
  winner: number[] = []; // slots of winners
  eliminations = 0;
  hazardTimer = 240;
  hazardKind: HazardKind | null = null;
  /** Telegraphed hazards in progress (rendered as warnings, then they strike). */
  warnings: { kind: HazardKind; x: number; y: number; t: number; dur: number; dir: number }[] = [];
  /** Current wind push (units/frame, + = right). */
  wind = 0;
  private windTarget = 0;
  shakeMag = 0;
  /** When true, the world is a network "view" — physics are not simulated locally. */
  remoteView = false;

  constructor(public rules: MatchRules, slots: SlotConfig[], seed = 1234) {
    if (slots.length > MAX_PLAYERS) throw new Error(`Max ${MAX_PLAYERS} players`);
    this.rng = new Rng(seed);
    this.stage = stageById(rules.stageId);
    this.gravityMul = (rules.gravityMul ?? 1) * (this.stage.gravity ?? 1);
    this.damageMul = rules.damageMul ?? 1;
    this.platforms = this.stage.platforms.map((d, i) => new Platform(d, i));
    for (const p of this.platforms) {
      if (!p.solid) continue;
      this.ledges.push({ x: p.x1, y: p.y, side: -1, plat: p, owner: -1 });
      this.ledges.push({ x: p.x2, y: p.y, side: 1, plat: p, owner: -1 });
    }
    for (let i = 0; i < PROJ_POOL; i++) {
      this.projectiles.push({
        active: false, owner: -1, team: -1, x: 0, y: 0, vx: 0, vy: 0, gravity: 0, life: 0, age: 0, r: 10,
        hb: { s: 0, e: 0, x: 0, y: 0, r: 10, dmg: 0, ang: 0, bkb: 0, kbg: 0 }, kind: '', fx: 'hit', bounce: 0, homing: 0, hits: 1, rehitTimer: 0, lastVictim: -1,
      });
    }
    this.timeLeft = rules.timeSec > 0 ? rules.timeSec * 60 : 0;
    this.hazardKind = rules.hazard === 'stage' ? this.stage.hazard ?? null : rules.hazard && rules.hazard !== 'none' ? rules.hazard : null;
    const main = this.mainPlatform();
    const n = slots.length;
    slots.forEach((cfg, idx) => {
      const f = new Fighter(cfg.slot, charById(cfg.charId), cfg);
      f.tractionMul = this.stage.traction ?? 1;
      f.stocks = rules.mode === 'time' ? 0 : (cfg.stocks ?? rules.stocks);
      f.maxHp = f.hp = cfg.hp ?? rules.hp;
      const span = main.x2 - main.x1 - 160;
      f.x = f.prevX = main.x1 + 80 + span * (n === 1 ? 0.5 : idx / (n - 1));
      f.y = f.prevY = main.y;
      f.ground = main;
      f.facing = f.x > 0 ? -1 : 1;
      this.fighters.push(f);
    });
  }

  mainPlatform(): Platform { return this.platforms.find((p) => p.solid) ?? this.platforms[0]; }

  emit(e: GameEvent) { if (this.events.length < 256) this.events.push(e); }

  respawnPoint(slot: number) {
    const main = this.mainPlatform();
    const w = Math.min(main.x2 - main.x1, 900);
    const idx = slot % MAX_PLAYERS;
    const order = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5];
    const x = (order[idx] / 5) * (w / 2) * 0.95;
    const y = main.y - 380 - (idx % 2) * 60;
    return { x, y };
  }

  // ------------------------------------------------------------------ step
  step(inputs: InputFrame[]) {
    this.frame++;
    this.phaseFrame++;
    this.events.length = 0;
    for (const f of this.fighters) { f.rx = f.x; f.ry = f.y; }
    for (const p of this.projectiles) { p.rx = p.x; p.ry = p.y; }
    if (this.shakeMag > 0) this.shakeMag *= 0.85;

    if (this.phase === 'countdown') {
      if (this.phaseFrame % 60 === 1 && this.phaseFrame < 180) this.emit({ type: 'count', x: 0, y: 0, n: 3 - Math.floor(this.phaseFrame / 60) });
      if (this.phaseFrame >= 180) { this.phase = 'play'; this.phaseFrame = 0; this.emit({ type: 'go', x: 0, y: 0 }); }
      for (const p of this.platforms) p.update(this.frame);
      for (const f of this.fighters) { f.stateFrame++; this.carry(f); }
      return;
    }
    if (this.phase === 'over') return;

    for (const p of this.platforms) p.update(this.frame);
    const idle = emptyInput();
    for (let k = 0; k < this.fighters.length; k++) {
      const f = this.fighters[k];
      this.carry(f);
      f.update(this.phase === 'play' ? inputs[k] ?? idle : idle, this);
    }
    this.updateProjectiles();
    this.resolveHits();
    this.checkBlastZones();
    if (this.hazardKind && this.phase === 'play') this.updateHazard();

    if (this.phase === 'play') {
      if (this.timeLeft > 0) {
        this.timeLeft--;
        if (this.timeLeft === 0) this.endMatch();
      }
      if (this.phase === 'play') this.checkEnd();
    } else if (this.phase === 'game' && this.phaseFrame > 150) {
      this.phase = 'over';
    }
  }

  private carry(f: Fighter) {
    if (f.ground && (f.ground.dx || f.ground.dy)) { f.x += f.ground.dx; f.y = f.ground.y; }
    if (f.state === 'ledge' && f.ledge) { /* ledges are on solid static platforms */ }
  }

  // ------------------------------------------------------------------ hit detection
  hitboxWorld(f: Fighter, h: Hitbox) {
    const sz = f.sz;
    return { x: f.x + h.x * sz * f.facing, y: f.y + h.y * sz, r: h.r * sz };
  }

  /** Distance² from point to fighter hurtbox capsule minus radius. */
  hurtOverlap(f: Fighter, x: number, y: number, r: number) {
    const top = f.y - f.H + f.hw, bot = f.y - f.hw;
    const cy = Math.max(top, Math.min(bot, y));
    const dx = x - f.x, dy = y - cy;
    const rr = r + f.hw;
    return dx * dx + dy * dy <= rr * rr;
  }

  private resolveHits() {
    const fs = this.fighters;
    for (const a of fs) {
      if (a.state !== 'attack' || !a.move || a.hitlag > 0 || a.charging) continue;
      const m = a.move, mf = a.moveFrame;
      for (const v of fs) {
        if (v === a || !v.alive || v.intangible() || v.hitThisFrame) continue;
        if (a.team >= 0 && a.team === v.team) continue;
        for (let hi = 0; hi < m.hitboxes.length; hi++) {
          const h = m.hitboxes[hi];
          if (mf < h.s || mf > h.e) continue;
          const g = h.g ?? 0;
          const key = v.slot * 16 + g;
          const last = a.hitGroups.get(key);
          if (last !== undefined && (!h.rehit || mf - last < h.rehit)) continue;
          const p = this.hitboxWorld(a, h);
          if (!this.hurtOverlap(v, p.x, p.y, p.r)) continue;
          a.hitGroups.set(key, mf);
          this.applyHit(a, v, h, a.chargeMul * a.st.power, p.x, p.y, a.facing, false);
          break;
        }
      }
    }
  }

  /**
   * Apply a hitbox to victim. `dir` = horizontal facing of the launch.
   * Handles shields, counters, armor, knockback, hitstun, hitlag and stats.
   */
  applyHit(a: Fighter | null, v: Fighter, h: Hitbox, mul: number, hx: number, hy: number, dir: number, projectile: boolean) {
    const dmg = h.dmg * mul * this.damageMul;
    v.hitThisFrame = true;
    // counters
    if (a && !projectile && v.move?.counter && v.inWindow(v.move.counter)) {
      const ch: Hitbox = { s: 0, e: 0, x: 0, y: 0, r: 0, dmg: Math.max(9, dmg * 1.3), ang: 40, bkb: 60, kbg: 85, fx: v.char.visual.fx, lag: 1.4 };
      v.invuln = 20; v.moveFrame = Math.max(v.moveFrame, v.move.counter[1]);
      v.facing = a.x >= v.x ? 1 : -1;
      this.emit({ type: 'counter', x: v.x, y: v.y - v.H / 2, slot: v.slot });
      this.applyHit(v, a, ch, 1, a.x, a.y - a.H / 2, v.facing, false);
      return;
    }
    const hitlag = Math.min(22, Math.floor((dmg * 0.42 + 4) * (h.lag ?? 1)));
    // shields
    if (v.state === 'shield' || (v.state === 'shieldstun' && v.shieldHP > 0)) {
      v.shieldHP -= dmg * 1.15;
      v.setState('shieldstun', Math.floor(dmg * 0.75 + 3));
      v.hitlag = Math.floor(hitlag * 0.7);
      const push = Math.min(14, 2 + dmg * 0.35) * (hx < v.x ? 1 : -1);
      v.vx = push;
      if (a && !projectile) { a.hitlag = Math.floor(hitlag * 0.7); }
      this.emit({ type: 'shieldhit', x: hx, y: hy, slot: v.slot, p: dmg });
      if (v.shieldHP <= 0) { v.hitlag = 0; v.breakShield(this); }
      return;
    }
    // damage
    if (this.rules.mode === 'stamina') v.hp = Math.max(0, v.hp - dmg);
    v.percent = Math.min(999, v.percent + dmg);
    v.damageTaken += dmg;
    if (a) { a.damageDealt += dmg; v.lastHitBy = a.slot; v.lastHitFrame = this.frame; }
    // knockback
    const p = v.percent, w = v.st.weight * (v.scale > 1 ? 1 + (v.scale - 1) * 0.8 : 1);
    let kb = ((((p / 10 + (p * dmg) / 20) * (200 / (w + 100)) * 1.4) + 18) * (h.kbg / 100)) + h.bkb;
    if (this.rules.mode === 'stamina') kb = (((dmg * 0.35 + 6) * 200 / (w + 100) * 1.4 + 18) * h.kbg / 100) * 0.55 + h.bkb * 0.8;
    const armored = (v.move?.armor && v.inWindow(v.move.armor) && kb < 140) || (v.armorAll && kb < 120);
    v.flash = 8;
    if (a && !projectile) { a.hitlag = hitlag; a.shake = 0; }
    v.hitlag = hitlag; v.shake = Math.min(10, 2 + dmg * 0.5);
    const la = (h.ang * Math.PI) / 180;
    this.emit({ type: 'hit', x: hx, y: hy, slot: v.slot, p: kb, fx: h.fx ?? 'hit', n: a ? a.slot : -1, ang: Math.atan2(-Math.sin(la), Math.cos(la) * dir) });
    if (armored) return;
    if (v.state === 'ledge') v.releaseLedge(this);
    // launch angle with simple DI
    let ang = (h.ang * Math.PI) / 180;
    let lx = Math.cos(ang) * dir, ly = -Math.sin(ang);
    const di = v.input;
    const dim = Math.hypot(di.x, di.y);
    if (dim > 0.3 && kb > 40) {
      const cross = lx * di.y - ly * di.x; // perpendicular influence
      const rot = -Math.max(-1, Math.min(1, cross / dim)) * 0.22;
      const c = Math.cos(rot), s = Math.sin(rot);
      const nx = lx * c - ly * s, ny = lx * s + ly * c;
      lx = nx; ly = ny;
    }
    // grounded low launches stay grounded
    const speed = kb * 0.19;
    v.kvx = lx * speed; v.kvy = ly * speed;
    v.vx = 0; v.vy = 0;
    if (v.grounded && v.kvy > 0) { v.kvy = -v.kvy * 0.8; }
    if (v.grounded && v.kvy > -2.5 && kb < 60) v.kvy = 0;
    v.hitstun = Math.floor(kb * 0.42) + (h.freeze ?? 0);
    v.tumble = kb > 85;
    v.fastFall = false;
    if (v.ledge) v.releaseLedge(this);
    const keepGround = v.grounded && v.kvy === 0;
    if (!keepGround) v.ground = null;
    v.setState('hitstun');
    if (hx !== v.x) v.facing = hx > v.x ? 1 : -1;
    if (kb > 150 && this.shakeMag < kb / 18) this.shakeMag = Math.min(18, kb / 18);
  }

  // ------------------------------------------------------------------ projectiles
  spawnProjectile(owner: Fighter, opts: Partial<Projectile> & { hb: Hitbox }) {
    const p = this.projectiles.find((q) => !q.active);
    if (!p) return null;
    Object.assign(p, {
      active: true, owner: owner.slot, team: owner.team, x: owner.x, y: owner.y - owner.H / 2, vx: 0, vy: 0, gravity: 0,
      life: 60, age: 0, r: opts.hb.r, kind: 'orb', fx: opts.hb.fx ?? 'hit', bounce: 0, homing: 0, hits: 1, rehitTimer: 0, lastVictim: -1,
    }, opts);
    p.hb = { ...opts.hb, dmg: opts.hb.dmg * owner.st.power };
    this.emit({ type: 'proj', x: p.x, y: p.y, slot: owner.slot, fx: p.fx });
    return p;
  }

  private updateProjectiles() {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.age++;
      if (p.age > p.life) { p.active = false; continue; }
      if (p.homing > 0) {
        let best: Fighter | null = null, bd = 1e9;
        for (const f of this.fighters) {
          if (!f.alive || f.slot === p.owner || (p.team >= 0 && f.team === p.team)) continue;
          const d = Math.hypot(f.x - p.x, f.y - f.H / 2 - p.y);
          if (d < bd) { bd = d; best = f; }
        }
        if (best && bd < 900) {
          const dx = best.x - p.x, dy = best.y - best.H / 2 - p.y, d = Math.hypot(dx, dy) || 1;
          const sp = Math.hypot(p.vx, p.vy) || 6;
          p.vx += (dx / d) * p.homing; p.vy += (dy / d) * p.homing;
          const ns = Math.hypot(p.vx, p.vy) || 1;
          p.vx *= sp / ns; p.vy *= sp / ns;
        }
      }
      p.vy += p.gravity;
      p.x += p.vx; p.y += p.vy;
      if (p.rehitTimer > 0) p.rehitTimer--;
      // terrain
      for (const pl of this.platforms) {
        if (p.x < pl.x1 || p.x > pl.x2) continue;
        const inSolid = pl.solid && p.y > pl.y && p.y < pl.y + pl.h;
        const onTop = p.vy > 0 && p.y + p.r >= pl.y && p.y - p.vy + p.r <= pl.y + 2;
        if (inSolid || (onTop && (pl.solid || p.bounce > 0 || p.gravity > 0))) {
          if (p.bounce > 0 && onTop) { p.bounce--; p.y = pl.y - p.r; p.vy = -Math.max(6, Math.abs(p.vy) * 0.7); }
          else if (p.gravity > 0 || inSolid) { p.active = false; this.emit({ type: 'hit', x: p.x, y: p.y, p: 10, fx: p.fx, n: -1, slot: -1 }); }
        }
      }
      if (!p.active) continue;
      const b = this.stage.blast;
      if (p.x < b.l || p.x > b.r || p.y > b.b || p.y < b.t) { p.active = false; continue; }
      // fighters
      for (const f of this.fighters) {
        if (!f.alive || f.slot === p.owner || f.intangible() || f.hitThisFrame) continue;
        if (p.team >= 0 && f.team === p.team) continue;
        if (p.rehitTimer > 0 && p.lastVictim === f.slot) continue;
        if (!this.hurtOverlap(f, p.x, p.y, p.r)) continue;
        if (f.move?.reflect && f.inWindow(f.move.reflect)) {
          p.owner = f.slot; p.team = f.team; p.vx = -p.vx * 1.15; p.vy = -p.vy * 0.5; p.age = 0;
          p.hb = { ...p.hb, dmg: p.hb.dmg * 1.3 };
          this.emit({ type: 'reflect', x: p.x, y: p.y, slot: f.slot });
          break;
        }
        const ownerF = this.fighters.find((q) => q.slot === p.owner) ?? null;
        const dir = p.vx === 0 ? (f.x > p.x ? 1 : -1) : Math.sign(p.vx);
        this.applyHit(ownerF, f, p.hb, 1, p.x, p.y, dir, true);
        p.hits--; p.rehitTimer = 10; p.lastVictim = f.slot;
        if (p.hits <= 0) { p.active = false; break; }
      }
    }
  }

  // ------------------------------------------------------------------ hazards
  private hazardProjectile(o: Partial<Projectile> & { hb: Hitbox }) {
    const p = this.projectiles.find((q) => !q.active);
    if (!p) return;
    Object.assign(p, { active: true, owner: -1, team: -2, vx: 0, vy: 0, gravity: 0, life: 400, age: 0, bounce: 0, homing: 0, hits: 1, rehitTimer: 0, lastVictim: -1, fx: o.hb.fx ?? 'hit', r: o.hb.r, kind: 'meteor', x: 0, y: 0 }, o);
    p.rx = p.x; p.ry = p.y;
  }

  /** A target spot: usually near a random fighter so hazards matter, sometimes anywhere on stage. */
  private hazardX(spread = 160) {
    const main = this.mainPlatform();
    const live = this.fighters.filter((f) => f.alive && f.state !== 'dead' && f.state !== 'respawn');
    if (live.length && this.rng.next() < 0.75) {
      const f = live[this.rng.int(live.length)];
      return Math.max(main.x1 + 30, Math.min(main.x2 - 30, f.x + this.rng.range(-spread, spread)));
    }
    return this.rng.range(main.x1 + 40, main.x2 - 40);
  }

  /** Hit everyone inside a vertical column; `skip` is a bitmask of slots already hit (returned updated). */
  private hazardHitColumn(x: number, halfW: number, top: number, bottom: number, hb: Hitbox, skip = 0) {
    for (const f of this.fighters) {
      if (!f.alive || f.intangible() || (skip >> f.slot) & 1) continue;
      if (Math.abs(f.x - x) < halfW + f.hw && f.y > top && f.y - f.H < bottom) { this.applyHit(null, f, hb, 1, f.x, f.y - f.H / 2, f.x >= x ? 1 : -1, true); skip |= 1 << f.slot; }
    }
    return skip;
  }

  private updateHazard() {
    const kind = this.hazardKind!;
    const main = this.mainPlatform();
    // resolve telegraphed hazards
    for (const w of this.warnings) {
      w.t++;
      if (w.t !== w.dur) continue;
      if (w.kind === 'lightning') {
        this.hazardHitColumn(w.x, 34, this.stage.blast.t, main.y + 5, { s: 0, e: 0, x: 0, y: 0, r: 30, dmg: 14, ang: 80, bkb: 55, kbg: 75, fx: 'elec', lag: 1.3 });
        this.emit({ type: 'bolt', x: w.x, y: main.y });
        this.shakeMag = Math.max(this.shakeMag, 7);
      } else if (w.kind === 'lava') {
        this.emit({ type: 'geyser', x: w.x, y: w.y });
      } else if (w.kind === 'icicle') {
        this.hazardProjectile({ x: w.x, y: this.stage.blast.t + 220, vy: 4, gravity: 0.55, kind: 'icicle', hb: { s: 0, e: 0, x: 0, y: 0, r: 22, dmg: 11, ang: 270, bkb: 35, kbg: 60, fx: 'ice', freeze: 10 } });
      } else if (w.kind === 'debris') {
        this.hazardProjectile({ x: w.dir > 0 ? this.stage.blast.l + 80 : this.stage.blast.r - 80, y: w.y, vx: 15 * w.dir, life: 260, kind: 'meteor', hb: { s: 0, e: 0, x: 0, y: 0, r: 28, dmg: 12, ang: 40, bkb: 50, kbg: 70, fx: 'hit' } });
      } else if (w.kind === 'meteor') {
        this.hazardProjectile({ x: w.x + this.rng.range(-30, 30), y: this.stage.blast.t + 250, vx: this.rng.range(-1.5, 1.5), vy: 9, gravity: 0.15, kind: 'meteor', hb: { s: 0, e: 0, x: 0, y: 0, r: 30, dmg: 13, ang: 70, bkb: 50, kbg: 70, fx: 'fire' } });
      }
    }
    // lava geysers keep erupting for a while after the warning
    for (const w of this.warnings) if (w.kind === 'lava' && w.t > w.dur && w.t < w.dur + 36) {
      w.dir = this.hazardHitColumn(w.x, 42, main.y - 330, main.y + 5, { s: 0, e: 0, x: 0, y: 0, r: 30, dmg: 11, ang: 88, bkb: 70, kbg: 60, fx: 'fire' }, w.dir); // dir = hit mask
    }
    this.warnings = this.warnings.filter((w) => w.t < w.dur + (w.kind === 'lava' ? 42 : 8));
    // wind: ease toward the current gust
    this.wind += (this.windTarget - this.wind) * 0.04;
    if (Math.abs(this.wind) > 0.05) for (const f of this.fighters) {
      if (!f.alive || f.state === 'ledge' || f.state === 'respawn' || f.state === 'dead') continue;
      f.x += this.wind * (f.grounded ? 0.45 : 1) * (100 / (f.st.weight + 40));
    }
    // schedule the next hazard
    if (--this.hazardTimer > 0) return;
    switch (kind) {
      case 'lightning': this.hazardTimer = 200 + this.rng.int(140); this.warnings.push({ kind, x: this.hazardX(), y: main.y, t: 0, dur: 75, dir: 0 }); break;
      case 'lava': this.hazardTimer = 220 + this.rng.int(140); this.warnings.push({ kind, x: this.hazardX(220), y: main.y, t: 0, dur: 80, dir: 0 }); break;
      case 'icicle': {
        this.hazardTimer = 150 + this.rng.int(120);
        const n = 1 + this.rng.int(2);
        for (let i = 0; i < n; i++) this.warnings.push({ kind, x: this.hazardX(260), y: main.y, t: 0, dur: 60 + i * 20, dir: 0 });
        break;
      }
      case 'debris': {
        this.hazardTimer = 240 + this.rng.int(160);
        const dir = this.rng.next() < 0.5 ? 1 : -1;
        this.warnings.push({ kind, x: dir > 0 ? main.x1 : main.x2, y: main.y - this.rng.range(40, 380), t: 0, dur: 70, dir });
        break;
      }
      case 'meteor': this.hazardTimer = 110 + this.rng.int(80); this.warnings.push({ kind, x: this.hazardX(300), y: main.y, t: 0, dur: 55, dir: 0 }); break;
      case 'wind': {
        // alternate calm / gust phases
        if (this.windTarget === 0) { this.windTarget = (this.rng.next() < 0.5 ? -1 : 1) * this.rng.range(2.2, 3.4); this.hazardTimer = 160 + this.rng.int(100); this.emit({ type: 'hazard', x: 0, y: 0, n: Math.sign(this.windTarget) }); }
        else { this.windTarget = 0; this.hazardTimer = 260 + this.rng.int(200); }
        break;
      }
    }
  }

  // ------------------------------------------------------------------ KOs & match flow
  private checkBlastZones() {
    const b = this.stage.blast;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const out = f.x < b.l || f.x > b.r || f.y > b.b || (f.y - f.H < b.t && (f.state === 'hitstun' || f.y - f.H < b.t - 400));
      const staminaKO = this.rules.mode === 'stamina' && f.hp <= 0 && f.hitlag === 0;
      if (out || staminaKO) this.ko(f, out);
    }
  }

  private ko(f: Fighter, blast: boolean) {
    const b = this.stage.blast;
    const ex = Math.max(b.l, Math.min(b.r, f.x)), ey = Math.max(b.t, Math.min(b.b, f.y - f.H / 2));
    const ang = blast ? Math.atan2(-(ey), -(ex)) : -Math.PI / 2;
    this.emit({ type: 'ko', x: ex, y: ey, slot: f.slot, ang, p: blast ? 1 : 0 });
    this.shakeMag = 14;
    f.falls++;
    const recent = f.lastHitBy >= 0 && this.frame - f.lastHitFrame < 60 * 8;
    if (recent) {
      const k = this.fighters.find((q) => q.slot === f.lastHitBy);
      if (k) { k.kos++; k.score++; }
    } else { f.sds++; }
    f.score--;
    f.releaseLedge(this);
    f.setState('dead');
    f.ground = null;
    f.vx = f.vy = f.kvx = f.kvy = 0;
    f.hitlag = 0;
    f.lastHitBy = -1;
    f.x = 0; f.y = -5000;
    if (this.rules.mode !== 'time') {
      f.stocks--;
      if (f.stocks <= 0) { f.eliminatedAt = this.frame; this.eliminations++; return; }
    }
    f.respawnTimer = 70;
  }

  private teamKey(f: Fighter) { return f.team >= 0 ? `t${f.team}` : `s${f.slot}`; }

  private checkEnd() {
    if (this.rules.mode === 'time') return;
    const aliveTeams = new Set(this.fighters.filter((f) => f.eliminatedAt < 0).map((f) => this.teamKey(f)));
    if (aliveTeams.size <= 1 && this.fighters.length > 1) this.endMatch();
    if (this.fighters.length === 1 && this.fighters[0].eliminatedAt >= 0) this.endMatch();
  }

  endMatch() {
    if (this.phase !== 'play') return;
    this.phase = 'game'; this.phaseFrame = 0;
    const places = this.placements();
    const best = places.filter((p) => p.place === 1).map((p) => p.slot);
    this.winner = best;
    this.emit({ type: 'game', x: 0, y: 0 });
  }

  /** Final placements (1 = winner). Ties share a placement. */
  placements(): Placement[] {
    const fs = this.fighters;
    const scoreOf = (f: Fighter): number => {
      if (this.rules.mode === 'time') return f.score * 1000 - f.percent * 0.01;
      if (f.eliminatedAt < 0) {
        // alive: more stocks/hp better
        const team = f.team;
        const teamAlive = team >= 0;
        return 1e9 + (teamAlive ? 1 : 0) + f.stocks * 1000 + (this.rules.mode === 'stamina' ? f.hp : -f.percent * 0.1);
      }
      return f.eliminatedAt;
    };
    // team-based: a team's members share the team's best score
    const teamScore = new Map<string, number>();
    for (const f of fs) {
      const k = this.teamKey(f), s = scoreOf(f);
      teamScore.set(k, Math.max(teamScore.get(k) ?? -Infinity, s));
    }
    const sorted = [...fs].sort((a, b) => teamScore.get(this.teamKey(b))! - teamScore.get(this.teamKey(a))!);
    const out: Placement[] = [];
    let place = 0, prev = NaN;
    sorted.forEach((f, i) => {
      const s = teamScore.get(this.teamKey(f))!;
      if (s !== prev) { place = i + 1; prev = s; }
      out.push({ slot: f.slot, place: this.rules.mode !== 'time' && f.team >= 0 ? place : place });
    });
    // compress team placements so teammates share rank and next team follows
    const ranks = [...new Set(out.map((o) => o.place))].sort((a, b) => a - b);
    return out.map((o) => ({ slot: o.slot, place: ranks.indexOf(o.place) + 1 }));
  }
}
