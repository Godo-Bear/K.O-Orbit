import { emptyInput, type InputFrame } from '../core/inputFrame';
import { Rng } from '../core/rng';
import type { Fighter } from './fighter';
import type { World } from './world';

/**
 * CPU controller (levels 1–9). Higher levels react faster, shield and tech more,
 * pick better attacks and recover smarter.
 */
export class CpuBrain {
  private rng: Rng;
  private wait = 0;
  private holdX = 0;
  private holdY = 0;
  private holdShield = 0;
  private holdJump = 0;
  private holdAtk = 0;
  private targetSlot = -1;
  private ledgeDelay = 0;

  constructor(public level: number, seed: number) {
    this.rng = new Rng(seed * 7919 + 13);
    this.level = Math.max(1, Math.min(9, level));
  }

  private get react() { return Math.max(2, 24 - this.level * 2.4); }
  private chance(base: number) { return this.rng.next() < base; }

  think(f: Fighter, w: World): InputFrame {
    const o = emptyInput();
    if (!f.alive || w.phase !== 'play') return o;
    const L = this.level;
    const main = w.mainPlatform();
    const ledgeL = { x: main.x1, y: main.y }, ledgeR = { x: main.x2, y: main.y };

    // carry held inputs between decisions
    o.x = this.holdX; o.y = this.holdY;
    if (this.holdShield > 0) { this.holdShield--; o.shield = true; }
    if (this.holdJump > 0) { this.holdJump--; o.jump = true; }
    if (this.holdAtk > 0) { this.holdAtk--; o.attack = true; o.smash = true; o.special = true; }

    const st = f.state;
    if (st === 'respawn') { if (f.stateFrame > 20 + this.rng.int(40)) { o.y = 1; o.x = 0; } return o; }

    // ---- ledge options
    if (st === 'ledge') {
      if (this.ledgeDelay <= 0) this.ledgeDelay = 8 + this.rng.int(Math.max(4, 50 - L * 4));
      if (f.stateFrame >= this.ledgeDelay) {
        this.ledgeDelay = 0;
        const r = this.rng.next();
        if (r < 0.35) o.x = -f.ledge!.side;
        else if (r < 0.6) o.jumpP = o.jump = true;
        else if (r < 0.8) o.shieldP = o.shield = true;
        else o.attackP = o.attack = true;
      }
      this.clearHolds();
      return o;
    }

    // ---- hitstun: DI + tech
    if (st === 'hitstun') {
      const dir = f.x > 0 ? -1 : 1;
      if (this.chance(0.1 + L * 0.08)) { o.x = dir; o.y = -0.6; }
      const below = f.y + f.vy + f.kvy;
      if (L >= 3 && f.kvy + f.vy > 0 && Math.abs(below - main.y) < 60 && f.x > main.x1 && f.x < main.x2 && this.chance(L * 0.025)) {
        o.shieldP = o.shield = true;
      }
      this.clearHolds();
      return o;
    }
    if (st === 'knockdown') {
      if (f.stateFrame > 12 + this.rng.int(20)) {
        const r = this.rng.next();
        if (r < 0.3) o.attackP = true; else if (r < 0.6) o.x = this.rng.next() < 0.5 ? -1 : 1; else o.y = -1;
      }
      return o;
    }
    if (st === 'dizzy' || st === 'shieldbreak' || st === 'dead') return o;

    // ---- recovery
    const offstage = !f.grounded && (f.x < main.x1 - 10 || f.x > main.x2 + 10 || f.y > main.y + 10);
    if (offstage && (st === 'air' || st === 'helpless' || st === 'attack' || st === 'airdodge')) {
      const ledge = f.x < 0 ? ledgeL : ledgeR;
      const toward = f.x < 0 ? 1 : -1;
      this.clearHolds();
      o.x = toward;
      if (st !== 'air') return o;
      const belowLedge = f.y > ledge.y - 40;
      const farX = Math.abs(f.x - ledge.x);
      const falling = f.vy + f.kvy > -1.5;
      if (falling && (belowLedge || f.y > ledge.y - 120 && farX > 250)) {
        if (f.jumpsLeft > 0 && (f.y > ledge.y + 20 || farX > 200) && this.chance(0.5 + L * 0.05)) { o.jumpP = o.jump = true; return o; }
        if (f.jumpsLeft === 0 || f.y > ledge.y + 160) {
          if (!f.sideUsed && farX > 320 && f.y < ledge.y + 120 && L >= 3 && this.hasHorizontalRecovery(f)) {
            o.specialP = true; o.x = toward; o.y = 0; return o;
          }
          if (!f.upUsed && (f.y > ledge.y + 30 || farX > 120)) {
            o.specialP = true; o.y = -1;
            const dy = ledge.y - f.y - 40, dx = ledge.x - f.x;
            const m = Math.hypot(dx, dy) || 1;
            o.x = this.isTeleporter(f) ? dx / m : toward * 0.8;
            if (this.isTeleporter(f)) o.y = dy / m;
            return o;
          }
        }
      }
      return o;
    }

    // ---- choose target
    let tgt: Fighter | null = null;
    let best = 1e9;
    for (const t of w.fighters) {
      if (t === f || !t.alive || t.state === 'respawn' || (f.team >= 0 && t.team === f.team)) continue;
      const d = Math.hypot(t.x - f.x, (t.y - f.y) * 1.3) + (t.slot === this.targetSlot ? -120 : 0);
      if (d < best) { best = d; tgt = t; }
    }
    if (!tgt) { this.holdX = 0; o.x = 0; return o; }
    this.targetSlot = tgt.slot;

    // decisions happen on a reaction timer
    if (this.wait > 0) { this.wait--; return o; }
    this.wait = Math.round(this.react * (0.6 + this.rng.next() * 0.8));
    this.clearHolds();

    const sz = f.sz;
    const dx = tgt.x - f.x;
    const dy = (tgt.y - tgt.H * 0.5) - (f.y - f.H * 0.5); // + target lower
    const adx = Math.abs(dx);
    const dir = Math.sign(dx) || f.facing;
    const tgtAttacking = tgt.state === 'attack' && tgt.move && tgt.moveFrame < (tgt.move.hitboxes[0]?.e ?? 0);

    // ---- defence
    if (f.grounded && tgtAttacking && adx < 170 * sz && Math.abs(dy) < 140 && this.chance(L * 0.06)) {
      const r = this.rng.next();
      if (r < 0.55) { o.shieldP = o.shield = true; this.holdShield = 10 + this.rng.int(10); }
      else if (r < 0.75) { o.shield = true; o.downTap = true; o.y = 1; }
      else { o.jumpP = o.jump = true; this.holdJump = 6; }
      return o;
    }
    for (const p of w.projectiles) {
      if (!p.active || p.owner === f.slot || (p.team >= 0 && p.team === f.team)) continue;
      const pdx = f.x - p.x;
      if (Math.abs(pdx) < 160 && Math.sign(p.vx) === Math.sign(pdx) && Math.abs(p.y - (f.y - f.H / 2)) < 80 && f.grounded && this.chance(L * 0.07)) {
        if (this.chance(0.5)) { o.shieldP = o.shield = true; this.holdShield = 10; } else { o.jumpP = o.jump = true; this.holdJump = 8; }
        return o;
      }
    }

    // stay safe near edges when target is off stage
    const nearEdge = f.x < main.x1 + 60 || f.x > main.x2 - 60;
    const tgtOff = tgt.x < main.x1 || tgt.x > main.x2;

    // ---- attack selection
    const reachX = 80 * sz;
    const killPct = 120 - L * 5;
    if (f.grounded && (st === 'idle' || st === 'walk' || st === 'run' || st === 'dash' || st === 'crouch' || st === 'land' || st === 'skid')) {
      if (adx < reachX && Math.abs(dy) < 60 * sz) {
        if (this.chance(0.35 + L * 0.06)) {
          const r = this.rng.next();
          if (tgt.percent > killPct && r < 0.5 + L * 0.04) { o.smashP = o.smash = true; o.sx = dir; o.sy = 0; this.holdAtk = this.rng.int(L * 3); f.facing = f.facing; }
          else if (r < 0.3) { o.attackP = o.attack = true; }
          else if (r < 0.55) { o.attackP = true; o.x = dir; }
          else if (r < 0.7) { o.attackP = true; o.y = 1; }
          else if (r < 0.85) { o.smashP = true; o.sx = 0; o.sy = 1; }
          else { o.specialP = true; o.y = this.chance(0.5) ? 1 : 0; o.x = o.y ? 0 : dir; }
          if (o.x === 0 && o.sx === 0 && Math.sign(dx) !== f.facing) { o.x = dir * 0.3; }
        }
        return o;
      }
      if (adx < 90 * sz && dy < -60 && dy > -260) {
        if (dy < -140 || this.chance(0.4)) { o.jumpP = o.jump = true; this.holdJump = 12; this.wait = 6; }
        else if (tgt.percent > killPct) { o.smashP = true; o.sy = -1; }
        else { o.attackP = true; o.y = -1; }
        return o;
      }
      if (adx < 230 && adx > 110 && this.chance(0.18 + L * 0.03)) {
        if (this.chance(0.5)) { o.dashTap = dir; o.x = dir; this.holdX = dir; o.attackP = true; }
        else { o.specialP = true; o.x = dir; }
        return o;
      }
      if (adx > 300 && this.chance(0.12)) { if (Math.sign(dx) !== f.facing) o.x = dir * 0.3; o.specialP = true; return o; }
      // approach
      if (tgtOff && nearEdge) { this.holdX = 0; o.x = 0; return o; }
      if (dy < -150 && adx < 260) { o.jumpP = o.jump = true; this.holdJump = 14; this.holdX = dir; o.x = dir; return o; }
      if (dy > 120 && f.ground && !f.ground.solid) { o.downTap = true; o.y = 1; return o; }
      if (adx > 40) {
        if (st !== 'run' && st !== 'dash') o.dashTap = dir;
        o.x = dir; this.holdX = dir;
        if (this.chance(0.08 * (L / 5))) { o.jumpP = o.jump = true; this.holdJump = this.rng.int(14); }
      }
      return o;
    }

    if (!f.grounded && st === 'air') {
      // aerial attacks when near
      const ax = dx * f.facing;
      if (Math.hypot(dx, dy) < 130 * sz && this.chance(0.4 + L * 0.06)) {
        if (dy < -50 && Math.abs(dx) < 70) { o.attackP = true; o.y = -1; }
        else if (dy > 50 && Math.abs(dx) < 70) { o.attackP = true; o.y = 1; }
        else if (ax > 0) { o.attackP = true; o.x = f.facing; }
        else if (ax < -20) { o.attackP = true; o.x = -f.facing; }
        else o.attackP = true;
        return o;
      }
      // drift toward target, stay above stage
      const tx = Math.max(main.x1 + 40, Math.min(main.x2 - 40, tgt.x));
      const ddx = tx - f.x;
      o.x = Math.abs(ddx) > 30 ? Math.sign(ddx) : 0; this.holdX = o.x;
      if (dy > 80 && f.vy > 0 && !nearEdge && this.chance(0.25)) o.downTap = true;
      if (dy < -120 && f.jumpsLeft > 0 && f.vy > -2 && this.chance(0.3)) { o.jumpP = o.jump = true; }
      return o;
    }
    return o;
  }

  private clearHolds() { this.holdX = 0; this.holdY = 0; this.holdShield = 0; this.holdJump = 0; this.holdAtk = 0; }
  private isTeleporter(f: Fighter) { return f.char.id === 'volt'; }
  private hasHorizontalRecovery(f: Fighter) { return ['nova', 'brick', 'zephyr', 'ember', 'rook', 'omega', 'glacia'].includes(f.char.id); }
}
