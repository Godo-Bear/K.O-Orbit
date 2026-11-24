import type { InputFrame } from '../core/inputFrame';
import { emptyInput } from '../core/inputFrame';
import type { CharDef, MoveDef, SlotConfig } from './types';
import type { Platform } from './stages';
import type { World, Ledge } from './world';

export type FState =
  | 'idle' | 'walk' | 'dash' | 'run' | 'skid' | 'crouch' | 'jumpsquat' | 'air' | 'land'
  | 'attack' | 'shield' | 'shieldoff' | 'shieldstun' | 'shieldbreak' | 'dizzy'
  | 'spotdodge' | 'roll' | 'airdodge' | 'hitstun' | 'helpless' | 'knockdown' | 'getup' | 'tech'
  | 'ledge' | 'ledgeclimb' | 'ledgeroll' | 'dead' | 'respawn';

export const STATE_LIST: FState[] = [
  'idle', 'walk', 'dash', 'run', 'skid', 'crouch', 'jumpsquat', 'air', 'land', 'attack', 'shield', 'shieldoff', 'shieldstun',
  'shieldbreak', 'dizzy', 'spotdodge', 'roll', 'airdodge', 'hitstun', 'helpless', 'knockdown', 'getup', 'tech', 'ledge',
  'ledgeclimb', 'ledgeroll', 'dead', 'respawn',
];

export const SHIELD_MAX = 50;
const KB_DECAY = 0.31;

export class Fighter {
  x = 0; y = 0; vx = 0; vy = 0; kvx = 0; kvy = 0;
  prevX = 0; prevY = 0;
  rx = 0; ry = 0; // render interpolation origin (position at start of last sim step)
  facing = 1;
  ground: Platform | null = null;
  state: FState = 'idle';
  stateFrame = 0;
  move: MoveDef | null = null;
  moveFrame = 0;
  charge = 0; charging = false; chargeMul = 1;
  hitGroups = new Map<number, number>(); // victimSlot*16+group -> frame last hit
  percent = 0; hp = 0; maxHp = 0;
  stocks = 3;
  shieldHP = SHIELD_MAX;
  jumpsLeft = 1;
  fastFall = false;
  airdodgeUsed = false; sideUsed = false; upUsed = false;
  hitlag = 0; hitstun = 0; tumble = false;
  invuln = 0; lagFrames = 0; // generic state duration / landing lag
  dropThrough = 0; ledgeCooldown = 0; ledgeGrabs = 0;
  ledge: Ledge | null = null;
  lastShieldPress = -99; // frame index
  respawnTimer = 0;
  lastHitBy = -1; lastHitFrame = -9999;
  // stats
  kos = 0; falls = 0; damageDealt = 0; damageTaken = 0; sds = 0;
  eliminatedAt = -1; score = 0;
  input: InputFrame = emptyInput();
  /** Input buffer: presses made during lag are replayed for a few frames once actionable. */
  private buf = { atk: 0, spc: 0, jmp: 0, smh: 0, shd: 0, sx: 0, sy: 0 };
  scale: number;
  armorAll: boolean;
  shake = 0; // visual shake during hitlag
  flash = 0; // visual hit flash
  hitThisFrame = false;
  tractionMul = 1;
  coyote = 0; // frames left to still ground-jump after walking off a ledge // stage ground friction multiplier
  djAge = 999; // frames since last double jump (animation)
  name: string;
  team: number;

  constructor(public slot: number, public char: CharDef, public cfg: SlotConfig) {
    this.scale = cfg.scale ?? 1;
    this.armorAll = !!cfg.armor;
    this.name = cfg.name ?? char.name;
    this.team = cfg.team;
    this.jumpsLeft = char.stats.jumps - 1;
  }

  get st() { return this.char.stats; }
  get sz() { return this.char.stats.size * this.scale; }
  get H() { return 100 * this.sz; }
  get hw() { return 22 * this.sz; }
  get alive() { return this.state !== 'dead' && this.eliminatedAt < 0; }
  get grounded() { return this.ground !== null; }

  setState(s: FState, lag = 0) {
    this.state = s; this.stateFrame = 0; this.lagFrames = lag;
    if (s !== 'attack') { this.move = null; this.charging = false; }
  }

  startMove(id: string, w: World) {
    const m = this.char.moves[id];
    if (!m) return;
    this.state = 'attack'; this.stateFrame = 0;
    this.move = m; this.moveFrame = 0;
    this.hitGroups.clear();
    this.charge = 0; this.chargeMul = 1; this.charging = false;
    if (id === 'uspec') this.upUsed = true;
    if (id === 'sspec' && !this.grounded) this.sideUsed = true;
    w.emit({ type: 'whiff', x: this.x, y: this.y - this.H * 0.5, slot: this.slot, p: m.hitboxes.reduce((a, h) => Math.max(a, h.dmg), 0) });
  }

  intangible(): boolean {
    if (this.invuln > 0) return true;
    const sf = this.stateFrame;
    switch (this.state) {
      case 'spotdodge': return sf >= 3 && sf <= 17;
      case 'roll': return sf >= 4 && sf <= 18;
      case 'airdodge': return sf >= 3 && sf <= 28;
      case 'ledgeclimb': return sf <= 18;
      case 'ledgeroll': return sf <= 24;
      case 'tech': return sf <= 20;
      case 'getup': return sf <= 16;
      case 'ledge': return false;
      case 'dead': case 'respawn': return true;
      case 'attack': {
        const iv = this.move?.invuln;
        return !!iv && this.moveFrame >= iv[0] && this.moveFrame <= iv[1];
      }
    }
    return false;
  }

  inWindow(w?: [number, number]) { return !!w && this.state === 'attack' && this.moveFrame >= w[0] && this.moveFrame <= w[1]; }

  // ------------------------------------------------------------------ main update
  update(inp: InputFrame, w: World) {
    this.input = inp;
    this.hitThisFrame = false;
    if (this.flash > 0) this.flash--;
    if (inp.shieldP) this.lastShieldPress = w.frame;
    if (this.state === 'dead') { this.updateDead(w); return; }
    if (this.hitlag > 0) { this.hitlag--; this.shake = this.hitlag > 0 ? this.shake : 0; return; }
    this.shake = 0;
    if (this.djAge < 999) this.djAge++;
    if (this.coyote > 0) this.coyote--;
    if (this.invuln > 0) this.invuln--;
    if (this.ledgeCooldown > 0) this.ledgeCooldown--;
    if (this.dropThrough > 0) this.dropThrough--;
    if (this.state !== 'shield' && this.state !== 'shieldstun' && this.shieldHP < SHIELD_MAX) this.shieldHP = Math.min(SHIELD_MAX, this.shieldHP + 0.08);
    this.stateFrame++;
    this.prevX = this.x; this.prevY = this.y;
    const b = this.buf, BUF = 6;
    let use = inp;
    if (inp.attackP) b.atk = BUF; if (inp.specialP) b.spc = BUF; if (inp.jumpP) b.jmp = BUF; if (inp.shieldP) b.shd = BUF;
    if (inp.smashP) { b.smh = BUF; b.sx = inp.sx; b.sy = inp.sy; }
    if ((b.atk || b.spc || b.jmp || b.smh || b.shd) && !(inp.attackP || inp.specialP || inp.jumpP || inp.smashP || inp.shieldP)) {
      use = { ...inp, attackP: b.atk > 0, specialP: b.spc > 0, jumpP: b.jmp > 0, smashP: b.smh > 0, shieldP: b.shd > 0 && inp.shield !== false, sx: b.sx, sy: b.sy };
    }
    const st0 = this.state, mv0 = this.move, j0 = this.jumpsLeft, sf0 = this.stateFrame;
    this.think(use, w);
    if (this.state !== st0 || this.move !== mv0 || this.jumpsLeft !== j0 || this.stateFrame < sf0) { b.atk = b.spc = b.jmp = b.smh = b.shd = 0; }
    else { if (b.atk) b.atk--; if (b.spc) b.spc--; if (b.jmp) b.jmp--; if (b.smh) b.smh--; if (b.shd) b.shd--; }
    if ((this.state as FState) === 'dead') return;
    this.physics(inp, w);
  }

  private updateDead(w: World) {
    if (this.eliminatedAt >= 0) return;
    this.respawnTimer--;
    if (this.respawnTimer <= 0) {
      const p = w.respawnPoint(this.slot);
      this.x = this.prevX = p.x; this.y = this.prevY = p.y;
      this.vx = this.vy = this.kvx = this.kvy = 0;
      this.percent = 0; this.hp = this.maxHp; this.shieldHP = SHIELD_MAX;
      this.ground = null; this.fastFall = false; this.tumble = false;
      this.jumpsLeft = this.st.jumps - 1; this.airdodgeUsed = this.sideUsed = this.upUsed = false;
      this.setState('respawn');
      w.emit({ type: 'respawn', x: this.x, y: this.y, slot: this.slot });
    }
  }

  // ------------------------------------------------------------------ state machine
  private think(i: InputFrame, w: World) {
    const st = this.st;
    switch (this.state) {
      case 'respawn': {
        this.vx = this.vy = 0;
        const moved = Math.abs(i.x) > 0.3 || i.y > 0.3 || i.jumpP || i.attackP || i.specialP || i.shieldP || i.smashP;
        if (moved || this.stateFrame > 180) { this.setState('air'); this.invuln = 120; }
        return;
      }
      case 'idle': case 'walk': case 'crouch': case 'land':
        if (this.state === 'land') {
          if (this.stateFrame <= this.lagFrames) { this.friction(); return; }
          this.setState('idle');
        }
        if (this.groundActions(i, w)) return;
        if (i.y > 0.6) { if (this.state !== 'crouch') this.setState('crouch'); this.friction(); return; }
        if (i.dashTap) { this.startDash(i.dashTap); return; }
        if (Math.abs(i.x) > 0.2) {
          if (this.state !== 'walk') this.setState('walk');
          this.facing = Math.sign(i.x);
          const target = i.x * st.walk;
          this.vx += Math.max(-0.7, Math.min(0.7, target - this.vx));
          return;
        }
        if (this.state !== 'idle') this.setState('idle');
        this.friction();
        return;
      case 'dash':
        if (this.stateFrame <= 3 && (i.attackP) && !i.smashP) { this.vx *= 0.3; this.startMove('ftilt', w); return; }
        if (this.groundActions(i, w, true)) return;
        if (i.dashTap && i.dashTap !== this.facing) { this.startDash(i.dashTap); return; }
        this.vx = this.facing * st.run * (this.stateFrame < 4 ? 0.85 : 1);
        if (this.stateFrame >= 11) {
          if (Math.sign(i.x) === this.facing && Math.abs(i.x) > 0.5) this.setState('run');
          else this.setState('skid', 8);
        }
        return;
      case 'run':
        if (this.groundActions(i, w, true)) return;
        if (i.y > 0.6) { this.setState('crouch'); return; }
        if (Math.abs(i.x) < 0.3) { this.setState('skid', 8); return; }
        if (Math.sign(i.x) !== this.facing) { this.setState('skid', 10); this.facing = Math.sign(i.x); return; }
        this.vx = this.facing * st.run;
        return;
      case 'skid':
        if (i.jumpP) { this.setState('jumpsquat'); return; }
        if (this.stateFrame > 3 && this.groundActions(i, w)) return;
        this.vx *= 0.82;
        if (this.stateFrame >= this.lagFrames) this.setState('idle');
        return;
      case 'jumpsquat':
        this.friction(0.5);
        if (this.stateFrame >= st.jumpSquat) {
          const full = i.jump || (i.y < -0.7 && this.input.jump);
          this.vy = -(full ? st.jump : st.shortHop);
          this.vx = this.vx * 0.85 + i.x * st.air * 0.35;
          this.leaveGround();
          this.setState('air');
          w.emit({ type: 'jump', x: this.x, y: this.y, slot: this.slot });
        }
        return;
      case 'air':
        if (this.coyote > 0 && i.jumpP) { // coyote time: a late ground jump still counts
          this.coyote = 0; this.vy = -(i.jump ? st.jump : st.shortHop); this.fastFall = false;
          w.emit({ type: 'jump', x: this.x, y: this.y, slot: this.slot });
          return;
        }
        if (this.airActions(i, w)) return;
        this.airDrift(i);
        return;
      case 'helpless':
        this.airDrift(i, 0.6);
        return;
      case 'attack': this.updateMove(i, w); return;
      case 'shield': {
        this.friction();
        this.shieldHP -= 0.14;
        if (this.shieldHP <= 0) { this.breakShield(w); return; }
        if (i.jumpP) { this.setState('jumpsquat'); return; }
        if (i.dashTap) { this.startRoll(i.dashTap); return; }
        if (i.downTap) { this.setState('spotdodge'); return; }
        if (!i.shield) { this.setState('shieldoff', 7); return; }
        return;
      }
      case 'shieldoff':
        this.friction();
        if (i.jumpP) { this.setState('jumpsquat'); return; }
        if (this.stateFrame >= this.lagFrames) this.setState('idle');
        return;
      case 'shieldstun':
        this.vx *= 0.88;
        if (this.stateFrame >= this.lagFrames) {
          if (this.shieldHP <= 0) this.breakShield(w);
          else this.setState(i.shield ? 'shield' : 'shieldoff', 6);
        }
        return;
      case 'shieldbreak':
        if (this.grounded) { this.setState('dizzy', Math.max(90, 200 - this.percent * 0.4)); }
        else this.airDrift(i, 0.2);
        return;
      case 'dizzy':
        this.friction();
        if (this.stateFrame >= this.lagFrames) { this.shieldHP = SHIELD_MAX * 0.6; this.setState('idle'); }
        return;
      case 'spotdodge':
        this.friction();
        if (this.stateFrame >= 24) this.setState(i.shield ? 'shield' : 'idle');
        return;
      case 'roll': {
        const f = this.stateFrame;
        this.vx = f >= 3 && f <= 20 ? this.lagFrames * this.st.run * 0.95 : this.vx * 0.7;
        if (f >= 28) { this.facing = -this.lagFrames; this.setState('idle'); }
        return;
      }
      case 'airdodge': {
        const f = this.stateFrame;
        if (f > 3 && f < 22 && (this.vx !== 0 || this.vy !== 0) && this.lagFrames) { this.vx *= 0.88; this.vy *= 0.88; }
        else this.airDrift(i, 0.5);
        if (f >= 34) this.setState('air');
        return;
      }
      case 'hitstun': {
        this.hitstun--;
        if (this.hitstun <= 0) {
          if (this.grounded) this.setState('idle');
          else this.setState('air');
          return;
        }
        if (this.hitstun < 6) this.airDrift(i, 0.3);
        return;
      }
      case 'knockdown':
        this.friction();
        this.invuln = 0;
        if (this.stateFrame > 60 || (this.stateFrame > 12 && (Math.abs(i.x) > 0.5 || i.jumpP || i.attackP || i.shieldP || i.y < -0.5))) {
          if (i.attackP) { this.startMove('getup', w); return; }
          if (Math.abs(i.x) > 0.5) { this.startRoll(Math.sign(i.x)); return; }
          this.setState('getup');
        }
        return;
      case 'getup':
        this.friction();
        if (this.stateFrame >= 24) this.setState('idle');
        return;
      case 'tech':
        if (this.stateFrame <= 18) this.vx = this.lagFrames * 7; else this.friction();
        if (this.stateFrame >= 26) this.setState('idle');
        return;
      case 'ledge': this.updateLedge(i, w); return;
      case 'ledgeclimb': case 'ledgeroll': {
        const L = this.ledge;
        const dur = this.state === 'ledgeroll' ? 34 : 24;
        if (L && this.stateFrame === 1) { this.x = L.x - L.side * (this.hw + 4); this.y = L.y; this.ground = L.plat; }
        if (this.state === 'ledgeroll' && this.stateFrame >= 6 && this.stateFrame <= 26) this.vx = -(L?.side ?? 0) * 6;
        else this.vx = 0;
        if (this.stateFrame >= dur) { this.releaseLedge(w); this.setState('idle'); }
        return;
      }
    }
  }

  private friction(mul = 1) {
    const t = this.st.traction * mul * this.tractionMul;
    if (Math.abs(this.vx) <= t) this.vx = 0; else this.vx -= Math.sign(this.vx) * t;
  }

  private startDash(dir: number) {
    this.facing = dir;
    this.setState('dash');
    this.vx = dir * this.st.run * 0.85;
  }

  private startRoll(dir: number) {
    this.setState('roll', dir);
    this.facing = dir;
  }

  private groundActions(i: InputFrame, w: World, moving = false): boolean {
    if (i.jumpP) { this.setState('jumpsquat'); return true; }
    if (i.specialP) { this.doSpecial(i, w); return true; }
    if (i.smashP) {
      const sx = i.sx, sy = i.sy;
      if (sy < -0.5 && Math.abs(sy) >= Math.abs(sx)) this.startMove('usmash', w);
      else if (sy > 0.5 && Math.abs(sy) >= Math.abs(sx)) this.startMove('dsmash', w);
      else { if (Math.abs(sx) > 0.2) this.facing = Math.sign(sx); this.startMove('fsmash', w); }
      this.vx *= 0.4;
      return true;
    }
    if (i.attackP) {
      if (moving) { this.startMove('dash', w); return true; }
      if (i.y < -0.5 && Math.abs(i.y) >= Math.abs(i.x)) this.startMove('utilt', w);
      else if (i.y > 0.5 && Math.abs(i.y) >= Math.abs(i.x)) this.startMove('dtilt', w);
      else if (Math.abs(i.x) > 0.4) { this.facing = Math.sign(i.x); this.startMove('ftilt', w); }
      else this.startMove('jab', w);
      return true;
    }
    if (i.shield) {
      if (i.dashTap) { this.startRoll(i.dashTap); return true; }
      if (i.downTap) { this.setState('spotdodge'); return true; }
      this.setState('shield');
      w.emit({ type: 'dodge', x: this.x, y: this.y, slot: this.slot, n: 0 });
      return true;
    }
    if (i.downTap && this.ground && !this.ground.solid) {
      this.dropThrough = 14; this.y += 2; this.leaveGround(); this.setState('air');
      return true;
    }
    return false;
  }

  private doSpecial(i: InputFrame, w: World) {
    if (i.y < -0.5 && Math.abs(i.y) >= Math.abs(i.x)) { if (this.upUsed && !this.grounded) return; this.startMove('uspec', w); return; }
    if (i.y > 0.5 && Math.abs(i.y) >= Math.abs(i.x)) { this.startMove('dspec', w); return; }
    if (Math.abs(i.x) > 0.4) {
      if (this.sideUsed && !this.grounded) return;
      this.facing = Math.sign(i.x); this.startMove('sspec', w); return;
    }
    this.startMove('nspec', w);
  }

  private airActions(i: InputFrame, w: World): boolean {
    if (i.jumpP && this.jumpsLeft > 0 && !(this.stateFrame < 2 && this.state === 'air' && this.vy < 0 && this.prevGroundedJump())) {
      this.jumpsLeft--;
      this.djAge = 0;
      this.vy = -this.st.djump * (this.st.jumps > 2 ? 0.94 : 1);
      this.vx = i.x * this.st.air;
      this.fastFall = false;
      if (Math.abs(i.x) > 0.3) this.facing = this.facing; // keep facing (no turnaround)
      w.emit({ type: 'djump', x: this.x, y: this.y, slot: this.slot });
      return true;
    }
    if (i.shieldP && !this.airdodgeUsed) {
      this.airdodgeUsed = true;
      const m = Math.hypot(i.x, i.y);
      this.setState('airdodge', m > 0.4 ? 1 : 0);
      if (m > 0.4) { this.vx = (i.x / m) * 11; this.vy = (i.y / m) * 11; this.fastFall = false; }
      w.emit({ type: 'dodge', x: this.x, y: this.y, slot: this.slot, n: 1 });
      return true;
    }
    if (i.specialP) { this.doSpecial(i, w); return this.state === 'attack'; }
    if (i.attackP || i.smashP) {
      const x = i.smashP ? i.sx : i.x, y = i.smashP ? i.sy : i.y;
      let id = 'nair';
      if (Math.abs(y) > 0.5 && Math.abs(y) >= Math.abs(x)) id = y < 0 ? 'uair' : 'dair';
      else if (Math.abs(x) > 0.5) id = Math.sign(x) === this.facing ? 'fair' : 'bair';
      this.startMove(id, w);
      return true;
    }
    if (i.downTap && this.vy > -3 && !this.fastFall) { this.fastFall = true; this.vy = this.st.fastFall; }
    return false;
  }

  private prevGroundedJump() { return false; }

  airDrift(i: InputFrame, mul = 1) {
    const st = this.st;
    const target = i.x * st.air * (mul < 1 ? Math.max(mul, 0.6) : 1);
    if (Math.abs(i.x) > 0.15) {
      const acc = st.airAccel * mul;
      if (Math.abs(this.vx) < Math.abs(target) || Math.sign(this.vx) !== Math.sign(target)) {
        this.vx += Math.max(-acc, Math.min(acc, target - this.vx));
      } else this.vx -= Math.sign(this.vx) * 0.02;
    } else {
      if (Math.abs(this.vx) < 0.05) this.vx = 0; else this.vx -= Math.sign(this.vx) * 0.05;
    }
  }

  private updateMove(i: InputFrame, w: World) {
    const m = this.move!;
    // charging (smash attacks, chargeable specials)
    if (m.charge && this.moveFrame === m.charge) {
      const btn = m.chargeBtn ?? 'smash';
      const held = btn === 'smash' ? (i.smash || i.attack) : btn === 'attack' ? i.attack : i.special;
      const maxC = m.maxCharge ?? 60;
      if (held && this.charge < maxC) {
        if (!this.charging) w.emit({ type: 'charge', x: this.x, y: this.y, slot: this.slot });
        this.charging = true; this.charge++;
        this.chargeMul = 1 + 0.4 * (this.charge / 60);
        if (this.grounded) this.friction(); else this.airDrift(i, 0.3);
        return;
      }
      this.charging = false;
    }
    this.moveFrame++;
    if (m.air || !this.grounded) this.airDrift(i, m.air ? 1 : 0.5);
    else if (!m.slide) this.friction();
    else this.friction(0.35);
    if (m.update) m.update(this, w, this.moveFrame);
    if (this.state !== 'attack') return; // custom update may have changed state
    if (this.moveFrame >= m.total) {
      if (this.grounded) this.setState('idle');
      else if (m.helpless) this.setState('helpless');
      else this.setState('air');
      return;
    }
    // aerial fast-fall
    if (!this.grounded && i.downTap && this.vy > -3 && !this.fastFall && !m.noGravity) { this.fastFall = true; this.vy = this.st.fastFall; }
  }

  breakShield(w: World) {
    this.shieldHP = 0;
    this.leaveGround();
    this.setState('shieldbreak');
    this.vy = -16; this.vx = 0;
    w.emit({ type: 'shieldbreak', x: this.x, y: this.y - this.H / 2, slot: this.slot });
  }

  leaveGround() { this.ground = null; }

  // ------------------------------------------------------------------ ledge
  grabLedge(L: Ledge, w: World) {
    this.ledge = L; L.owner = this.slot;
    this.setState('ledge');
    this.facing = -L.side;
    this.x = L.x + L.side * (this.hw * 0.7);
    this.y = L.y + this.H * 0.8;
    this.vx = this.vy = this.kvx = this.kvy = 0;
    this.fastFall = false; this.tumble = false;
    this.jumpsLeft = this.st.jumps - 1; this.airdodgeUsed = this.sideUsed = this.upUsed = false;
    this.invuln = Math.max(0, 40 - this.ledgeGrabs * 12);
    this.ledgeGrabs++;
    w.emit({ type: 'ledge', x: L.x, y: L.y, slot: this.slot });
  }

  releaseLedge(_w?: World) {
    if (this.ledge && this.ledge.owner === this.slot) this.ledge.owner = -1;
    this.ledge = null;
  }

  private updateLedge(i: InputFrame, w: World) {
    const L = this.ledge!;
    this.x = L.x + L.side * (this.hw * 0.7);
    this.y = L.y + this.H * 0.8;
    this.vx = this.vy = 0;
    if (this.stateFrame < 8) return;
    const toward = i.x * -L.side;
    if (i.jumpP) {
      this.releaseLedge(w);
      this.x = L.x + L.side * 6; this.y = L.y - 4;
      this.vy = -this.st.jump * 1.02; this.vx = -L.side * 2;
      this.invuln = 6; this.ledgeCooldown = 20;
      this.setState('air');
      w.emit({ type: 'jump', x: this.x, y: this.y, slot: this.slot });
      return;
    }
    if (i.attackP || i.smashP) { this.x = L.x - L.side * (this.hw + 4); this.y = L.y; this.ground = L.plat; this.releaseLedge(w); this.startMove('ledge', w); this.invuln = 10; return; }
    if (i.shieldP) { this.setState('ledgeroll'); return; }
    if (toward > 0.5 || i.y < -0.6) { this.setState('ledgeclimb'); return; }
    if (toward < -0.5 || i.y > 0.6 || this.stateFrame > 300) {
      this.releaseLedge(w); this.ledgeCooldown = 30;
      this.x += L.side * 6; this.setState('air');
      return;
    }
  }

  // ------------------------------------------------------------------ physics & collision
  private physics(i: InputFrame, w: World) {
    const st = this.st;
    if (this.state === 'ledge' || this.state === 'ledgeclimb' || this.state === 'ledgeroll' || this.state === 'respawn') {
      if (this.state === 'ledgeroll' || this.state === 'ledgeclimb') this.x += this.vx;
      return;
    }
    const grav = st.gravity * w.gravityMul;
    // knockback decay
    const km = Math.hypot(this.kvx, this.kvy);
    if (km > 0) {
      const nm = Math.max(0, km - KB_DECAY);
      this.kvx *= nm / km; this.kvy *= nm / km;
    }
    const noGrav = this.move?.noGravity && this.inWindow(this.move.noGravity);
    const directional = this.state === 'airdodge' && this.lagFrames && this.stateFrame < 22;
    if (!this.ground && !noGrav && !directional) {
      this.vy += grav;
      const maxFall = this.fastFall ? st.fastFall : st.fall;
      if (this.vy > maxFall) this.vy = Math.min(this.vy, maxFall);
    }
    let nx = this.x + this.vx + this.kvx;
    let ny = this.y + this.vy + this.kvy;

    if (this.ground) {
      const p = this.ground;
      ny = p.y;
      if (this.kvy < -1) { this.ground = null; ny = this.y + this.kvy; }
      else if (nx < p.x1 || nx > p.x2) {
        if (this.canWalkOff()) {
          this.ground = null;
          if (this.state === 'walk' || this.state === 'run' || this.state === 'dash' || this.state === 'skid' || this.state === 'idle' || this.state === 'crouch') { this.setState('air'); this.coyote = 6; }
          if (this.state === 'attack' && this.move && !this.move.air) { /* keep move, now airborne */ }
          this.jumpsLeft = Math.max(this.jumpsLeft, 0);
        } else {
          nx = Math.max(p.x1, Math.min(p.x2, nx));
          this.vx = 0; this.kvx = 0;
        }
      }
    }
    if (!this.ground) {
      const res = this.collideAir(nx, ny, i, w);
      nx = res.x; ny = res.y;
    } else {
      // walls of other solids while grounded
      nx = this.collideWalls(nx, ny, w);
    }
    this.x = nx; this.y = ny;
    this.checkLedgeGrab(i, w);
  }

  private canWalkOff() {
    switch (this.state) {
      case 'walk': case 'run': case 'dash': case 'skid': case 'hitstun': case 'shieldbreak': case 'idle': case 'crouch':
        return this.state === 'idle' || this.state === 'crouch' ? Math.abs(this.vx) > 0.5 || Math.abs(this.kvx) > 0.5 : true;
      case 'attack': return !!this.move?.slide || Math.abs(this.kvx) > 1;
      case 'shieldstun': case 'knockdown': return Math.abs(this.kvx) > 1;
    }
    return false;
  }

  private collideWalls(nx: number, ny: number, w: World) {
    for (const p of w.platforms) {
      if (!p.solid || p === this.ground) continue;
      if (ny > p.y + 1 && ny - this.H < p.y + p.h && nx + this.hw > p.x1 && nx - this.hw < p.x2) {
        nx = this.x <= (p.x1 + p.x2) / 2 ? p.x1 - this.hw : p.x2 + this.hw;
      }
    }
    return nx;
  }

  private collideAir(nx: number, ny: number, i: InputFrame, w: World) {
    const movingDown = ny >= this.y - 0.01;
    const passSoft = this.dropThrough > 0 || (i.y > 0.7 && this.state !== 'hitstun' && this.state !== 'attack');
    let landed: Platform | null = null;
    for (const p of w.platforms) {
      if (p.solid) {
        const overlapX = nx + this.hw > p.x1 && nx - this.hw < p.x2;
        // land on top (feet must be within platform x span)
        if (movingDown && this.prevY <= p.py + 1 && ny >= p.y && nx >= p.x1 - 2 && nx <= p.x2 + 2) {
          ny = p.y; landed = p; continue;
        }
        if (overlapX && ny > p.y + 1 && ny - this.H < p.y + p.h) {
          const prevHead = this.prevY - this.H;
          if (prevHead >= p.py + p.h - 2) {
            ny = p.y + p.h + this.H; // bonk head
            if (this.vy < 0) this.vy = 0;
            if (this.kvy < 0) this.kvy = -this.kvy * 0.5;
          } else if (this.prevY <= p.py + 1 && nx >= p.x1 - this.hw && nx <= p.x2 + this.hw) {
            ny = p.y; nx = Math.max(p.x1, Math.min(p.x2, nx)); landed = p;
          } else {
            nx = this.x <= (p.x1 + p.x2) / 2 ? p.x1 - this.hw : p.x2 + this.hw;
            if (this.state === 'hitstun' && Math.abs(this.kvx) > 4) { this.kvx = -this.kvx * 0.6; w.emit({ type: 'land', x: nx, y: ny - this.H / 2, slot: this.slot, p: 2 }); }
            else { this.vx = 0; this.kvx = 0; }
          }
        }
      } else {
        if (passSoft) continue;
        if (movingDown && this.prevY <= p.py + 1 && ny >= p.y && nx >= p.x1 && nx <= p.x2) { ny = p.y; landed = p; }
      }
    }
    if (landed) this.land(landed, w);
    return { x: nx, y: ny };
  }

  private land(p: Platform, w: World) {
    const impact = this.vy + this.kvy;
    // hitstun landings: tech, bounce or knockdown
    if (this.state === 'hitstun' || (this.state === 'air' && this.tumble)) {
      if (w.frame - this.lastShieldPress <= 20) {
        this.ground = p; this.vy = 0; this.kvx = 0; this.kvy = 0; this.tumble = false;
        this.setState('tech', Math.abs(this.input.x) > 0.5 ? Math.sign(this.input.x) : 0);
        w.emit({ type: 'tech', x: this.x, y: p.y, slot: this.slot });
        this.resetAir();
        return;
      }
      if (this.state === 'hitstun' && impact > 14) {
        this.kvy = -Math.abs(this.kvy) * 0.6; this.vy = -Math.abs(this.vy) * 0.5;
        w.emit({ type: 'land', x: this.x, y: p.y, slot: this.slot, p: 3 });
        return;
      }
      if (this.tumble || this.state === 'air') {
        this.ground = p; this.vy = 0; this.kvy = 0; this.kvx *= 0.5; this.tumble = false; this.hitstun = 0;
        this.setState('knockdown');
        this.resetAir();
        w.emit({ type: 'land', x: this.x, y: p.y, slot: this.slot, p: 2 });
        return;
      }
    }
    this.ground = p;
    this.vy = 0; this.kvy = 0;
    this.resetAir();
    if (this.state === 'attack' && this.move) {
      const m = this.move;
      if (m.onLand && m.onLand(this, w)) return;
      if (m.air) { this.setState('land', m.landingLag ?? 6); }
      else if (m.helpless || m.recovery) { this.setState('land', 14); }
      // grounded special continues
    } else if (this.state === 'helpless') this.setState('land', 18);
    else if (this.state === 'airdodge') this.setState('land', 10);
    else if (this.state === 'shieldbreak') this.setState('dizzy', Math.max(90, 200 - this.percent * 0.4));
    else if (this.state === 'hitstun') { /* slide on ground in hitstun */ }
    else this.setState('land', 3);
    w.emit({ type: 'land', x: this.x, y: p.y, slot: this.slot, p: Math.min(2, impact / 10) });
  }

  private resetAir() {
    this.jumpsLeft = this.st.jumps - 1;
    this.fastFall = false;
    this.airdodgeUsed = this.sideUsed = this.upUsed = false;
    this.ledgeGrabs = 0;
  }

  private checkLedgeGrab(i: InputFrame, w: World) {
    if (this.ground || this.ledgeCooldown > 0 || i.y > 0.6) return;
    const okState = this.state === 'air' || this.state === 'helpless' || (this.state === 'attack' && !!this.move?.recovery && this.moveFrame > 6);
    if (!okState) return;
    if (this.vy + this.kvy < -2 && !(this.state === 'attack')) return;
    for (const L of w.ledges) {
      if (L.owner >= 0 && L.owner !== this.slot) continue;
      const hx = this.x + -L.side * this.hw * 0.2;
      const dx = (hx - L.x) * L.side; // positive = outside the stage
      const headY = this.y - this.H;
      if (dx > -20 && dx < 55 && headY < L.y + 25 && this.y > L.y + 8 && this.y < L.y + this.H + 40) {
        this.grabLedge(L, w);
        return;
      }
    }
  }
}
