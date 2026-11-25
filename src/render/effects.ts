import type { Fx } from '../sim/types';

/** Pre-allocated particle pool — no allocations during gameplay. */
export interface Particle {
  active: boolean; kind: 0 | 1 | 2 | 3 | 4 | 5; // 0 spark, 1 puff, 2 ring, 3 beam, 4 star, 5 impact lines
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; grow: number; rot: number;
  color: string; drag: number; grav: number;
}

const POOL = 1400;

export const FX_COLORS: Record<Fx, [string, string]> = {
  hit: ['#fff6c2', '#ffb02e'], fire: ['#ffe14d', '#ff4a1a'], elec: ['#f4ffff', '#4fd8ff'], ice: ['#ffffff', '#8fe1ff'],
  slash: ['#ffffff', '#ffd76a'], dark: ['#f0c8ff', '#9b3dff'], wind: ['#ffffff', '#7dffc0'],
  water: ['#ffffff', '#4fc3ff'], arcane: ['#e8ffff', '#3ff0ff'], solar: ['#fffbe0', '#ffc233'],
};

export class Effects {
  pool: Particle[] = [];
  private cursor = 0;
  activeCount = 0;
  /** Particle density multiplier (visual intensity setting). */
  density = 1;
  constructor() {
    for (let i = 0; i < POOL; i++) this.pool.push({ active: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, grow: 0, rot: 0, color: '#fff', drag: 1, grav: 0 });
  }
  clear() { for (const p of this.pool) p.active = false; }
  private take(): Particle {
    for (let n = 0; n < POOL; n++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % POOL;
      if (!p.active) return p;
    }
    const p = this.pool[this.cursor]; // recycle oldest
    this.cursor = (this.cursor + 1) % POOL;
    return p;
  }
  spawn(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, grow = 0, drag = 0.92, grav = 0, rot = 0) {
    const p = this.take();
    p.active = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size;
    p.color = color; p.grow = grow; p.drag = drag; p.grav = grav; p.rot = rot;
  }
  /** Sparks biased along a direction (radians) — reads the launch angle at a glance. */
  sparksDir(x: number, y: number, n: number, speed: number, colors: [string, string], dir: number, spread: number) {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread, s = speed * (0.6 + Math.random() * 0.9);
      this.spawn(0, x, y, Math.cos(a) * s, Math.sin(a) * s, 10 + Math.random() * 12, 3 + Math.random() * 4, i % 3 ? colors[1] : colors[0], 0, 0.86, 0.1);
    }
  }
  sparks(x: number, y: number, n: number, speed: number, colors: [string, string]) {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(0, x, y, Math.cos(a) * s, Math.sin(a) * s, 12 + Math.random() * 14, 3 + Math.random() * 3, i % 2 ? colors[0] : colors[1], 0, 0.88, 0.15);
    }
  }
  puff(x: number, y: number, n: number, color = 'rgba(230,230,240,0.7)') {
    for (let i = 0; i < n; i++) this.spawn(1, x + (Math.random() - 0.5) * 30, y - Math.random() * 6, (Math.random() - 0.5) * 3, -Math.random() * 1.5, 22 + Math.random() * 12, 8 + Math.random() * 8, color, 0.5, 0.92);
  }
  ring(x: number, y: number, size: number, grow: number, life: number, color: string) { this.spawn(2, x, y, 0, 0, life, size, color, grow, 1); }
  update() {
    let c = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      if (--p.life <= 0) { p.active = false; continue; }
      p.x += p.vx; p.y += p.vy; p.vx *= p.drag; p.vy = p.vy * p.drag + p.grav; p.size += p.grow; p.rot += 0.2;
      c++;
    }
    this.activeCount = c;
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.pool) {
      if (!p.active) continue;
      const a = p.life / p.max;
      ctx.globalAlpha = Math.min(1, a * 1.5);
      switch (p.kind) {
        case 0: {
          ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke();
          break;
        }
        case 1: ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); break;
        case 2: ctx.strokeStyle = p.color; ctx.lineWidth = 3 + 8 * a; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke(); break;
        case 3: {
          ctx.globalAlpha = a;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          const g = ctx.createLinearGradient(0, 0, 2400, 0);
          g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          const w = p.size * a;
          ctx.beginPath(); ctx.moveTo(0, -w * 0.15); ctx.lineTo(2400, -w); ctx.lineTo(2400, w); ctx.lineTo(0, w * 0.15); ctx.fill();
          ctx.restore();
          break;
        }
        case 5: { // manga impact lines radiating from the hit point
          const a0 = p.rot * 3.1;
          ctx.strokeStyle = p.color; ctx.lineCap = 'round';
          const prog = 1 - a;
          for (let i = 0; i < 14; i++) {
            const ang = a0 + (i / 14) * Math.PI * 2 + (i % 2) * 0.12;
            const r0 = p.size * (0.35 + prog * 0.9), r1 = p.size * (0.9 + prog * 1.1 + (i % 3) * 0.25);
            ctx.lineWidth = (i % 2 ? 3 : 6) * a;
            ctx.beginPath(); ctx.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0); ctx.lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1); ctx.stroke();
          }
          break;
        }
        case 4: {
          ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath();
          for (let i = 0; i < 8; i++) { const r = i % 2 ? p.size * 0.4 : p.size; ctx.lineTo(Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r); }
          ctx.fill(); ctx.restore();
        }
      }
    }
    ctx.restore();
  }
}
