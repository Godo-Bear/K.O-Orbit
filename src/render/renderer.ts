import { PLAYER_COLORS, playerLabel } from '../core/constants';
import type { Fighter } from '../sim/fighter';
import { SHIELD_MAX } from '../sim/fighter';
import type { World, Projectile } from '../sim/world';
import type { GameEvent } from '../sim/types';
import { Background, THEMES } from './background';
import { Effects, FX_COLORS } from './effects';
import { computePose, drawRig, drawPortrait, roundRect } from './rig';

export interface PerfInfo { fps: number; stepMs: number; steps: number; renderMs: number; latency?: number | null; net?: string }

export interface RenderOpts {
  perf?: PerfInfo | null;
  showHitboxes?: boolean;
  paused?: boolean;
  hideHud?: boolean;
  slotTags?: Map<number, string>; // slot -> label override ("CPU", name)
  screenShake?: boolean;
}

/** Canvas 2D renderer with devicePixelRatio scaling for crisp 4K / Retina output. */
export class Renderer {
  ctx: CanvasRenderingContext2D;
  dpr = 1; W = 0; H = 0; cssW = 0; cssH = 0;
  renderScale = 1;
  cam = { x: 0, y: -200, zoom: 0.5, init: false };
  effects = new Effects();
  private bg: Background | null = null;
  private bgStage = '';
  private t = 0;
  private lastRenderMs = 0;
  private koFlash = 0;

  constructor(public canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true } as CanvasRenderingContext2DSettings);
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    matchMedia?.('(resolution: 1dppx)')?.addEventListener?.('change', () => this.resize());
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(320, r.width || window.innerWidth);
    this.cssH = Math.max(200, r.height || window.innerHeight);
    this.dpr = Math.min(3, window.devicePixelRatio || 1) * this.renderScale;
    const W = Math.round(this.cssW * this.dpr), H = Math.round(this.cssH * this.dpr);
    if (W !== this.W || H !== this.H) {
      this.W = this.canvas.width = W;
      this.H = this.canvas.height = H;
    }
  }

  setRenderScale(s: number) { this.renderScale = Math.max(0.5, Math.min(1, s)); this.resize(); }

  resetCamera() { this.cam.init = false; this.effects.clear(); }

  // ------------------------------------------------------------------ events → particles
  handleEvents(events: GameEvent[], w: World) {
    const fx = this.effects;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const c = FX_COLORS[e.fx ?? 'hit'];
          const p = e.p ?? 10;
          fx.sparks(e.x, e.y, Math.min(26, 6 + p / 8), 6 + p / 18, c);
          fx.ring(e.x, e.y, 10, 2 + p / 40, 14, c[1]);
          if (p > 120) { fx.ring(e.x, e.y, 20, 6, 22, '#ffffff'); for (let i = 0; i < 4; i++) fx.spawn(4, e.x, e.y, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, 30, 14, c[0], 0, 0.93); }
          break;
        }
        case 'shieldhit': fx.ring(e.x, e.y, 14, 3, 12, '#8ff3ff'); fx.sparks(e.x, e.y, 5, 5, ['#ffffff', '#8ff3ff']); break;
        case 'shieldbreak': fx.ring(e.x, e.y, 20, 9, 30, '#ff6ad5'); fx.sparks(e.x, e.y, 30, 12, ['#ffffff', '#ff6ad5']); break;
        case 'ko': {
          const col = PLAYER_COLORS[e.slot ?? 0];
          const a = Math.atan2(-e.y + -250, -e.x);
          fx.spawn(3, e.x, e.y, 0, 0, 55, 260, col, 0, 1, 0, a);
          fx.spawn(3, e.x, e.y, 0, 0, 40, 140, '#ffffff', 0, 1, 0, a);
          fx.sparks(e.x, e.y, 40, 22, ['#ffffff', col]);
          fx.ring(e.x, e.y, 40, 22, 40, col);
          this.koFlash = 10;
          break;
        }
        case 'jump': fx.puff(e.x, e.y, 4); break;
        case 'djump': fx.ring(e.x, e.y, 10, 2.5, 14, 'rgba(255,255,255,0.8)'); break;
        case 'land': if ((e.p ?? 0) > 0.6) fx.puff(e.x, e.y, Math.round(3 + (e.p ?? 0) * 3)); break;
        case 'respawn': fx.ring(e.x, e.y - 40, 20, 5, 30, PLAYER_COLORS[e.slot ?? 0]); break;
        case 'reflect': fx.ring(e.x, e.y, 20, 4, 18, '#9ff'); break;
        case 'counter': fx.ring(e.x, e.y, 30, 6, 22, '#ffffff'); fx.sparks(e.x, e.y, 16, 10, ['#ffffff', '#ffd23f']); break;
        case 'tech': fx.spawn(4, e.x, e.y - 30, 0, -1, 24, 18, '#ffffff', 0, 0.95); break;
        case 'ledge': fx.spawn(4, e.x, e.y, 0, -1, 14, 10, '#ffffff', 0, 0.9); break;
        case 'hazard': break;
      }
    }
    void w;
  }

  // ------------------------------------------------------------------ camera
  private updateCamera(w: World, alpha: number) {
    const main = w.mainPlatform();
    let minX = main.x1 * 0.55, maxX = main.x2 * 0.55, minY = main.y - 260, maxY = main.y + 80;
    let any = false;
    for (const f of w.fighters) {
      if (!f.alive || f.state === 'dead') continue;
      const x = lerp(f.rx, f.x, alpha), y = lerp(f.ry, f.y, alpha);
      if (!any) { any = true; }
      // ignore fighters deep in the blast margins so camera doesn't over-zoom
      const b = w.stage.blast;
      const cx = Math.max(b.l + 350, Math.min(b.r - 350, x));
      const cy = Math.max(b.t + 300, Math.min(b.b - 200, y));
      minX = Math.min(minX, cx - 170); maxX = Math.max(maxX, cx + 170);
      minY = Math.min(minY, cy - f.H - 160); maxY = Math.max(maxY, cy + 110);
    }
    const bw = Math.max(1100, maxX - minX), bh = Math.max(620, maxY - minY);
    let zoom = Math.min(this.W / bw, this.H / bh);
    const b = w.stage.blast;
    const zMin = Math.max(this.W / (b.r - b.l), this.H / (b.b - b.t));
    zoom = Math.max(zMin, Math.min(this.W / 1000, zoom));
    let tx = (minX + maxX) / 2, ty = (minY + maxY) / 2;
    const hw = this.W / zoom / 2, hh = this.H / zoom / 2;
    tx = Math.max(b.l + hw, Math.min(b.r - hw, tx));
    ty = Math.max(b.t + hh, Math.min(b.b - hh, ty));
    if (!this.cam.init) { this.cam.x = tx; this.cam.y = ty; this.cam.zoom = zoom; this.cam.init = true; }
    this.cam.x += (tx - this.cam.x) * 0.09;
    this.cam.y += (ty - this.cam.y) * 0.09;
    this.cam.zoom += (zoom - this.cam.zoom) * 0.06;
  }

  // ------------------------------------------------------------------ main draw
  render(w: World, alpha: number, opts: RenderOpts = {}) {
    const t0 = performance.now();
    this.t++;
    const ctx = this.ctx;
    if (this.bgStage !== w.stage.id) { this.bg = new Background(w.stage); this.bgStage = w.stage.id; }
    this.updateCamera(w, alpha);
    if (!opts.paused) this.effects.update();
    const z = this.cam.zoom;
    let sx = 0, sy = 0;
    if (opts.screenShake !== false && w.shakeMag > 0.3 && !opts.paused) { sx = (Math.random() - 0.5) * w.shakeMag * 2; sy = (Math.random() - 0.5) * w.shakeMag * 2; }
    const cx = this.cam.x + sx, cy = this.cam.y + sy;
    this.bg!.draw(ctx, this.W, this.H, cx, cy, z, this.t);
    ctx.setTransform(z, 0, 0, z, this.W / 2 - cx * z, this.H / 2 - cy * z);

    this.drawStage(w);
    for (const p of w.projectiles) if (p.active) this.drawProjectile(p, alpha);
    // fighters: draw back-to-front, hit victims on top
    for (const f of w.fighters) if (f.alive && f.state !== 'dead') this.drawFighter(f, alpha, opts);
    this.effects.draw(ctx);
    if (!opts.hideHud) this.drawTags(); else this.tags.length = 0;
    if (opts.showHitboxes) this.drawHitboxes(w);

    // screen-space overlays
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.koFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.koFlash * 0.02})`; ctx.fillRect(0, 0, this.W, this.H); if (!opts.paused) this.koFlash--; }
    this.drawOffscreen(w, alpha);
    if (!opts.hideHud) { this.drawHud(w, opts); this.drawBanner(w); }
    if (opts.perf) this.drawPerf(w, opts.perf);
    this.lastRenderMs = performance.now() - t0;
  }

  get renderMs() { return this.lastRenderMs; }

  private drawStage(w: World) {
    const ctx = this.ctx;
    const th = THEMES[w.stage.theme];
    for (const p of w.platforms) {
      if (p.solid) {
        const h = p.h, mx = (p.x1 + p.x2) / 2, half = (p.x2 - p.x1) / 2;
        const g = ctx.createLinearGradient(0, p.y, 0, p.y + h);
        g.addColorStop(0, th.body1); g.addColorStop(1, th.body2);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y); ctx.lineTo(p.x2, p.y);
        ctx.lineTo(p.x2 - 10, p.y + h * 0.35);
        ctx.lineTo(mx + half * 0.35, p.y + h);
        ctx.lineTo(mx - half * 0.35, p.y + h);
        ctx.lineTo(p.x1 + 10, p.y + h * 0.35);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = th.glow; ctx.globalAlpha = 0.35; ctx.lineWidth = 3;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(p.x1 + 40 + i * 20, p.y + i * 40); ctx.lineTo(p.x2 - 40 - i * 20, p.y + i * 40); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = th.top;
        ctx.fillRect(p.x1, p.y, p.x2 - p.x1, 14);
        ctx.fillStyle = th.line;
        ctx.fillRect(p.x1, p.y, p.x2 - p.x1, 3);
        // ledge markers
        ctx.fillStyle = th.glow;
        ctx.fillRect(p.x1 - 3, p.y - 2, 10, 18); ctx.fillRect(p.x2 - 7, p.y - 2, 10, 18);
      } else {
        const moving = !!p.def.move;
        ctx.fillStyle = th.soft; ctx.globalAlpha = 0.95;
        roundRect(ctx, p.x1, p.y - 2, p.x2 - p.x1, 14, 6); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = th.line; ctx.fillRect(p.x1 + 6, p.y - 2, p.x2 - p.x1 - 12, 3);
        if (moving) {
          ctx.fillStyle = th.glow; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 0.2);
          ctx.beginPath(); ctx.ellipse((p.x1 + p.x2) / 2, p.y + 22, (p.x2 - p.x1) * 0.25, 8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    if (w.stage.theme === 'forge') {
      const ly = w.stage.blast.b - 160;
      ctx.fillStyle = 'rgba(255,90,20,0.55)';
      ctx.beginPath(); ctx.moveTo(w.stage.blast.l, ly);
      for (let x = w.stage.blast.l; x <= w.stage.blast.r; x += 100) ctx.lineTo(x, ly + Math.sin(x * 0.01 + this.t * 0.05) * 18);
      ctx.lineTo(w.stage.blast.r, ly + 600); ctx.lineTo(w.stage.blast.l, ly + 600); ctx.fill();
    }
  }

  private drawProjectile(p: Projectile, alpha: number) {
    const ctx = this.ctx;
    const x = lerp(p.rx ?? p.x, p.x, alpha), y = lerp(p.ry ?? p.y, p.y, alpha);
    const c = FX_COLORS[p.fx];
    const r = p.r;
    ctx.save(); ctx.translate(x, y);
    switch (p.kind) {
      case 'boulder':
        ctx.rotate(p.age * 0.15);
        ctx.fillStyle = '#6b4a2d'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2c1c0e'; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.2); ctx.lineTo(r * 0.2, r * 0.1); ctx.lineTo(r * 0.4, r * 0.6); ctx.stroke();
        break;
      case 'shuriken':
        ctx.rotate(p.age * 0.6); ctx.fillStyle = c[1];
        ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.35 : r * 1.2; ctx.lineTo(Math.cos((i * Math.PI) / 4) * rr, Math.sin((i * Math.PI) / 4) * rr); } ctx.fill();
        break;
      case 'lance':
        ctx.scale(Math.sign(p.vx) || 1, 1);
        ctx.fillStyle = c[1]; ctx.beginPath(); ctx.moveTo(r * 2, 0); ctx.lineTo(-r * 1.5, -r * 0.6); ctx.lineTo(-r, 0); ctx.lineTo(-r * 1.5, r * 0.6); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(r * 2, 0); ctx.lineTo(-r * 0.5, -r * 0.2); ctx.lineTo(-r * 0.5, r * 0.2); ctx.fill();
        break;
      default: {
        const meteor = p.kind === 'meteor';
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, c[0]); g.addColorStop(0.7, c[1]); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2); ctx.fill();
        if (p.kind === 'void') { ctx.fillStyle = '#12051f'; ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.fill(); }
        if (p.kind === 'ball' && this.t % 3 === 0) this.effects.spawn(0, x, y, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 6, 2, c[0], 0, 0.8);
        if ((meteor || p.kind === 'fireball') && this.t % 2 === 0) this.effects.spawn(1, x, y, -p.vx * 0.1, -p.vy * 0.1, 18, r * 0.6, 'rgba(255,120,40,0.6)', -0.3, 0.95);
        if (meteor) { ctx.fillStyle = '#3a1608'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  }

  private drawFighter(f: Fighter, alpha: number, opts: RenderOpts) {
    const ctx = this.ctx;
    const jump = Math.abs(f.x - f.rx) > 150 || Math.abs(f.y - f.ry) > 150;
    let x = jump ? f.x : lerp(f.rx, f.x, alpha), y = jump ? f.y : lerp(f.ry, f.y, alpha);
    if (f.hitlag > 0 && f.shake > 0) x += (Math.random() - 0.5) * f.shake * 2;
    const col = PLAYER_COLORS[f.slot];
    const sz = f.sz;
    // ground ring
    if (f.grounded) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 30 * sz, 7 * sz, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.ellipse(x, y, 26 * sz, 6 * sz, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    // respawn platform
    if (f.state === 'respawn') {
      ctx.fillStyle = col; ctx.globalAlpha = 0.8;
      roundRect(ctx, x - 50, y, 100, 10, 5); ctx.fill();
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x - 50, y + 10); ctx.lineTo(x + 50, y + 10); ctx.lineTo(x + 20, y + 120); ctx.lineTo(x - 20, y + 120); ctx.fill();
      ctx.globalAlpha = 1;
    }
    const intang = f.intangible();
    const pose = computePose(f, this.t);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sz * f.facing, sz);
    if (pose.rot) { ctx.translate(0, -50); ctx.rotate(pose.rot * f.facing); ctx.translate(0, 50); }
    if (pose.squash !== 1) ctx.scale(1 / pose.squash, pose.squash);
    if (intang) ctx.globalAlpha = (this.t >> 2) % 2 ? 0.55 : 0.85;
    let tint: string | null = null;
    if (f.flash > 4) tint = '#ffffff';
    else if (f.charging && (this.t >> 2) % 2) tint = '#fff3a0';
    else if (f.state === 'dizzy') tint = (this.t >> 3) % 2 ? '#ffd0f0' : null;
    drawRig(ctx, f.char, pose, tint, f.slot >= 0 ? '#0b0b14' : '#000', this.t);
    ctx.restore();
    ctx.globalAlpha = 1;
    // shield bubble
    if (f.state === 'shield' || f.state === 'shieldstun') {
      const r = (22 + 46 * (f.shieldHP / SHIELD_MAX)) * sz;
      ctx.fillStyle = col; ctx.globalAlpha = 0.33;
      ctx.beginPath(); ctx.arc(x, y - f.H * 0.5, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.8; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (f.state === 'dizzy') {
      for (let i = 0; i < 3; i++) {
        const a = this.t * 0.12 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 26, y - f.H - 10 + Math.sin(a) * 6, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // reflect / counter aura
    if (f.move && (f.inWindow(f.move.reflect) || f.inWindow(f.move.counter))) {
      ctx.strokeStyle = f.move.reflect ? '#9ff' : '#fff'; ctx.lineWidth = 4; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.t * 0.6);
      ctx.beginPath(); ctx.arc(x, y - f.H * 0.5, 62 * sz, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (f.move?.armor && f.inWindow(f.move.armor)) {
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(x, y - f.H * 0.5, 58 * sz, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    this.tags.push({ x, y: y - f.H - 28 * sz - 14, slot: f.slot });
  }

  private tags: { x: number; y: number; slot: number }[] = [];

  /** Player tags drawn after all fighters, stacked so they never overlap in crowded 10-player brawls. */
  private drawTags() {
    const ctx = this.ctx;
    const z = this.cam.zoom / this.dpr; // css px per world unit
    const k = Math.max(1, 0.9 / z); // keep tags legible when zoomed out
    const tw = 48 * k, th = 24 * k;
    this.tags.sort((a, b) => a.x - b.x);
    const placed: { x: number; y: number }[] = [];
    ctx.font = `900 ${Math.round(22 * k)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    for (const t of this.tags) {
      let y = t.y;
      for (let n = 0; n < 10; n++) {
        const hit = placed.some((p) => Math.abs(p.x - t.x) < tw && Math.abs(p.y - y) < th);
        if (!hit) break;
        y -= th;
      }
      placed.push({ x: t.x, y });
      const col = PLAYER_COLORS[t.slot];
      const label = playerLabel(t.slot);
      ctx.lineWidth = 5 * k; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(label, t.x, y);
      ctx.fillStyle = col; ctx.fillText(label, t.x, y);
      if (y === t.y) { ctx.beginPath(); ctx.moveTo(t.x - 7 * k, y + 6 * k); ctx.lineTo(t.x + 7 * k, y + 6 * k); ctx.lineTo(t.x, y + 14 * k); ctx.fill(); }
    }
    this.tags.length = 0;
  }

  private drawHitboxes(w: World) {
    const ctx = this.ctx;
    for (const f of w.fighters) {
      if (!f.alive) continue;
      ctx.strokeStyle = f.intangible() ? 'rgba(80,160,255,0.9)' : 'rgba(255,230,0,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(f.x - f.hw, f.y - f.H, f.hw * 2, f.H); ctx.stroke();
      if (f.state === 'attack' && f.move) {
        for (const h of f.move.hitboxes) {
          if (f.moveFrame < h.s || f.moveFrame > h.e) continue;
          const p = w.hitboxWorld(f, h);
          ctx.fillStyle = 'rgba(255,40,40,0.45)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    for (const p of w.projectiles) if (p.active) { ctx.strokeStyle = 'rgba(255,40,40,0.8)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); }
    const b = w.stage.blast;
    ctx.strokeStyle = 'rgba(255,0,0,0.5)'; ctx.lineWidth = 6; ctx.strokeRect(b.l, b.t, b.r - b.l, b.b - b.t);
  }

  private worldToScreen(x: number, y: number) {
    const z = this.cam.zoom;
    return { x: this.W / 2 + (x - this.cam.x) * z, y: this.H / 2 + (y - this.cam.y) * z };
  }

  private drawOffscreen(w: World, alpha: number) {
    const ctx = this.ctx;
    const u = this.dpr;
    const m = 46 * u;
    for (const f of w.fighters) {
      if (!f.alive || f.state === 'dead') continue;
      const s = this.worldToScreen(lerp(f.rx, f.x, alpha), lerp(f.ry, f.y, alpha) - f.H / 2);
      const pad = (f.H / 2) * this.cam.zoom;
      if (s.x > -pad && s.x < this.W + pad && s.y > -pad && s.y < this.H + pad) continue;
      const cx = Math.max(m, Math.min(this.W - m, s.x)), cy = Math.max(m, Math.min(this.H - m - 110 * u, s.y));
      const col = PLAYER_COLORS[f.slot];
      const ang = Math.atan2(s.y - cy, s.x - cx);
      const dist = Math.hypot(s.x - cx, s.y - cy);
      const r = Math.max(22, 36 - dist / (40 * u)) * u;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * (r + 14 * u), cy + Math.sin(ang) * (r + 14 * u));
      ctx.lineTo(cx + Math.cos(ang + 0.5) * r, cy + Math.sin(ang + 0.5) * r); ctx.lineTo(cx + Math.cos(ang - 0.5) * r, cy + Math.sin(ang - 0.5) * r); ctx.fill();
      ctx.fillStyle = 'rgba(10,10,24,0.85)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 4 * u; ctx.strokeStyle = col; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 2 * u, 0, Math.PI * 2); ctx.clip();
      ctx.translate(cx, cy + r * 0.62); const k = (r * 1.6) / 100; ctx.scale(k * f.facing, k);
      drawRig(ctx, f.char, computePose(f, this.t), null, '#0b0b14', this.t);
      ctx.restore();
    }
  }

  private drawHud(w: World, opts: RenderOpts) {
    const ctx = this.ctx;
    const u = this.dpr;
    const n = w.fighters.length;
    const gap = 8;
    const cardW = Math.min(230, (this.cssW - 24 - gap * (n - 1)) / n);
    const cardH = cardW < 120 ? 74 : 86;
    const totalW = n * cardW + (n - 1) * gap;
    const x0 = (this.cssW - totalW) / 2;
    const y0 = this.cssH - cardH - 12;
    const compact = cardW < 130;
    ctx.save();
    ctx.scale(u, u);
    ctx.textBaseline = 'alphabetic';
    w.fighters.forEach((f, i) => {
      const x = x0 + i * (cardW + gap);
      const col = PLAYER_COLORS[f.slot];
      const out = f.eliminatedAt >= 0;
      ctx.globalAlpha = out ? 0.4 : 1;
      ctx.fillStyle = 'rgba(8,8,22,0.78)';
      roundRect(ctx, x, y0, cardW, cardH, 10); ctx.fill();
      ctx.fillStyle = col; roundRect(ctx, x, y0, cardW, 5, 3); ctx.fill();
      // portrait
      const ps = compact ? 34 : 50;
      ctx.save(); roundRect(ctx, x + 4, y0 + 8, ps, ps, 8); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 4, y0 + 8, ps, ps);
      drawPortrait(ctx, f.char, x + 4 + ps / 2, y0 + 8 + ps * 0.12, ps * 1.25, this.t);
      ctx.restore();
      // label
      const tag = opts.slotTags?.get(f.slot) ?? playerLabel(f.slot);
      ctx.fillStyle = col;
      ctx.font = `800 ${compact ? 11 : 13}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(tag, x + 8 + ps, y0 + 22);
      ctx.fillStyle = '#cfd3ff';
      ctx.font = `600 ${compact ? 10 : 12}px system-ui, sans-serif`;
      if (!compact) ctx.fillText(f.char.name, x + 8 + ps, y0 + 38);
      // percent / hp
      ctx.textAlign = 'right';
      const big = compact ? 22 : 32;
      if (w.rules.mode === 'stamina') {
        const hp = Math.ceil(f.hp);
        ctx.font = `900 ${big}px system-ui, sans-serif`;
        ctx.fillStyle = hp / f.maxHp < 0.3 ? '#ff5a5a' : '#ffffff';
        ctx.fillText(`${hp}`, x + cardW - 8, y0 + cardH - 26);
        const bw = cardW - 16;
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x + 8, y0 + cardH - 18, bw, 7);
        ctx.fillStyle = hp / f.maxHp < 0.3 ? '#ff5a5a' : '#2ed573'; ctx.fillRect(x + 8, y0 + cardH - 18, bw * Math.max(0, f.hp / f.maxHp), 7);
      } else {
        const p = Math.floor(f.percent);
        const heat = Math.min(1, p / 180);
        ctx.font = `900 ${big}px system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        const shake = f.flash > 0 ? (Math.random() - 0.5) * 4 : 0;
        const txt = out ? '—' : f.state === 'dead' ? '' : `${p}%`;
        ctx.strokeText(txt, x + cardW - 8 + shake, y0 + cardH - 22 + shake);
        ctx.fillStyle = `rgb(255,${Math.round(255 - heat * 200)},${Math.round(255 - heat * 230)})`;
        ctx.fillText(txt, x + cardW - 8 + shake, y0 + cardH - 22 + shake);
      }
      // stocks / score
      ctx.textAlign = 'left';
      const sy = y0 + cardH - 10;
      if (w.rules.mode === 'time') {
        ctx.fillStyle = '#ffd23f'; ctx.font = `800 ${compact ? 10 : 12}px system-ui, sans-serif`;
        ctx.fillText(`${f.score >= 0 ? '+' : ''}${f.score}`, x + 8, sy);
      } else if (w.rules.mode === 'stock') {
        const st = Math.max(0, f.stocks);
        if (st <= 5 && !compact || st <= 3) {
          for (let k = 0; k < st; k++) { ctx.fillStyle = f.char.visual.body; ctx.beginPath(); ctx.arc(x + 12 + k * 13, sy - 4, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); }
        } else { ctx.fillStyle = '#fff'; ctx.font = `800 11px system-ui, sans-serif`; ctx.fillText(`● × ${st}`, x + 8, sy); }
      }
      ctx.globalAlpha = 1;
    });
    // timer
    if (w.rules.timeSec > 0) {
      const s = Math.ceil(w.timeLeft / 60);
      const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      ctx.font = '900 34px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(txt, this.cssW / 2, 48);
      ctx.fillStyle = s <= 10 ? '#ff5a5a' : '#ffffff'; ctx.fillText(txt, this.cssW / 2, 48);
    }
    ctx.restore();
  }

  private drawBanner(w: World) {
    const ctx = this.ctx;
    let txt = '', sub = 0, col = '#ffffff';
    if (w.phase === 'countdown') { const n = 3 - Math.floor(w.phaseFrame / 60); txt = n > 0 ? String(n) : 'GO!'; sub = (w.phaseFrame % 60) / 60; col = '#ffd23f'; }
    else if (w.phase === 'play' && w.phaseFrame < 45) { txt = 'GO!'; sub = w.phaseFrame / 45; col = '#2ed573'; }
    else if (w.phase === 'game' || w.phase === 'over') { txt = 'GAME!'; sub = Math.min(1, w.phaseFrame / 20) * 0.3; col = '#ff4757'; }
    if (!txt) return;
    const u = this.dpr;
    const size = (Math.min(this.cssW, this.cssH) * 0.22) * (1.25 - sub * 0.3);
    ctx.save(); ctx.scale(u, u);
    ctx.globalAlpha = w.phase === 'play' ? 1 - sub : 1;
    ctx.font = `italic 900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.08; ctx.strokeStyle = '#120a24'; ctx.strokeText(txt, this.cssW / 2, this.cssH * 0.42);
    ctx.fillStyle = col; ctx.fillText(txt, this.cssW / 2, this.cssH * 0.42);
    ctx.restore();
  }

  private drawPerf(w: World, p: PerfInfo) {
    const ctx = this.ctx;
    const u = this.dpr;
    const particles = this.effects.activeCount;
    const proj = w.projectiles.reduce((a, q) => a + (q.active ? 1 : 0), 0);
    const lines = [
      `FPS ${p.fps.toFixed(0)}  render ${p.renderMs.toFixed(2)}ms`,
      `sim step ${p.stepMs.toFixed(3)}ms  ×${p.steps}/frame @60Hz`,
      `entities: ${w.fighters.length} fighters · ${proj} proj · ${particles} fx`,
      `canvas ${this.W}×${this.H} (dpr ${this.dpr.toFixed(2)})`,
    ];
    if (p.net) lines.push(p.net);
    if (p.latency != null) lines.push(`latency ${p.latency.toFixed(0)}ms RTT`);
    ctx.save(); ctx.scale(u, u);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(8, 8, 300, 12 + lines.length * 16);
    ctx.font = '12px ui-monospace, monospace'; ctx.fillStyle = '#7dff9b'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, 16, 14 + i * 16));
    ctx.restore();
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
