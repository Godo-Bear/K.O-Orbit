import { Rng } from '../core/rng';
import type { StageDef } from '../sim/stages';

export interface Theme { top: string; body1: string; body2: string; soft: string; glow: string; line: string }

export const THEMES: Record<StageDef['theme'], Theme> = {
  station: { top: '#9fb4ff', body1: '#3a4470', body2: '#141a33', soft: '#7d8cff', glow: '#5af0ff', line: '#c9d6ff' },
  nebula: { top: '#ff9be0', body1: '#4d1f5e', body2: '#1a0824', soft: '#ff6ad5', glow: '#ff8af0', line: '#ffd4f6' },
  crater: { top: '#f0b37a', body1: '#7a4426', body2: '#2e160a', soft: '#ffb36b', glow: '#ffd08a', line: '#ffe2c0' },
  ruins: { top: '#f4ecd2', body1: '#a89878', body2: '#5a4e3c', soft: '#e8dcb8', glow: '#fff6d8', line: '#ffffff' },
  forge: { top: '#ff8a3d', body1: '#4a2016', body2: '#160605', soft: '#ff6a2a', glow: '#ffb050', line: '#ffd0a0' },
};

interface Shape { x: number; y: number; r: number; k: number; c?: string; v?: number }

/** Multi-layer parallax background. Shapes are pre-generated per stage (no per-frame allocation). */
export class Background {
  private stars: Shape[] = [];
  private far: Shape[] = [];
  private mid: Shape[] = [];
  private skyGrad: CanvasGradient | null = null;
  private skyKey = '';
  constructor(public stage: StageDef) {
    const r = new Rng(stage.id.length * 977 + stage.id.charCodeAt(0));
    const nStars = stage.theme === 'ruins' ? 0 : 220;
    for (let i = 0; i < nStars; i++) this.stars.push({ x: r.range(-3000, 3000), y: r.range(-2000, 1500), r: r.range(0.6, 2.4), k: r.range(0.02, 0.08), v: r.range(0, 6) });
    for (let i = 0; i < 9; i++) this.far.push({ x: r.range(-2600, 2600), y: r.range(-900, 300), r: r.range(120, 420), k: 0.15, v: r.next() });
    for (let i = 0; i < 16; i++) this.mid.push({ x: -2400 + i * 320 + r.range(-80, 80), y: r.range(150, 450), r: r.range(60, 200), k: 0.38, v: r.next() });
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, zoom: number, t: number) {
    const st = this.stage;
    const key = `${W}x${H}`;
    if (key !== this.skyKey || !this.skyGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, st.sky[0]); g.addColorStop(0.55, st.sky[1]); g.addColorStop(1, st.sky[2]);
      this.skyGrad = g; this.skyKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(0, 0, W, H);
    const layer = (k: number) => {
      const z = zoom * (0.3 + 0.7 * k);
      ctx.setTransform(z, 0, 0, z, W / 2 - cx * k * z, H / 2 - cy * k * z);
    };
    // stars
    if (this.stars.length) {
      layer(0.05);
      ctx.fillStyle = '#ffffff';
      for (const s of this.stars) {
        ctx.globalAlpha = 0.45 + 0.45 * Math.sin(t * 0.03 + s.v!);
        ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
      }
      ctx.globalAlpha = 1;
    }
    switch (st.theme) {
      case 'station': {
        layer(0.08);
        const g = ctx.createRadialGradient(-900, 900, 100, -900, 900, 900);
        g.addColorStop(0, '#5f7dff'); g.addColorStop(0.6, '#2b2f8f'); g.addColorStop(1, 'rgba(20,20,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-900, 900, 900, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(180,200,255,0.35)'; ctx.lineWidth = 18;
        ctx.beginPath(); ctx.ellipse(-900, 900, 1300, 260, -0.25, 0, Math.PI * 2); ctx.stroke();
        layer(0.3);
        ctx.fillStyle = 'rgba(120,140,220,0.25)';
        for (const s of this.mid) { ctx.fillRect(s.x, s.y - s.r * 2, s.r * 0.4, s.r * 2); ctx.fillRect(s.x - s.r * 0.4, s.y - s.r * 1.2, s.r * 1.2, 12); }
        break;
      }
      case 'nebula': {
        layer(0.08);
        for (const s of this.far) {
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 2.2);
          g.addColorStop(0, s.v! > 0.5 ? 'rgba(255,90,200,0.35)' : 'rgba(110,80,255,0.32)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(s.x - s.r * 2.2, s.y - s.r * 2.2, s.r * 4.4, s.r * 4.4);
        }
        layer(0.35);
        ctx.fillStyle = 'rgba(40,10,60,0.85)';
        for (const s of this.mid) {
          const yy = s.y - 300 + Math.sin(t * 0.01 + s.v! * 6) * 20;
          ctx.beginPath(); ctx.ellipse(s.x, yy, s.r * 0.5, s.r * 0.35, s.v!, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'crater': {
        layer(0.06);
        ctx.fillStyle = 'rgba(255,200,120,0.85)'; ctx.beginPath(); ctx.arc(500, -100, 260, 0, Math.PI * 2); ctx.fill();
        layer(0.2);
        ctx.fillStyle = '#3a1c0e';
        ctx.beginPath(); ctx.moveTo(-3000, 700);
        for (let i = 0; i <= 24; i++) ctx.lineTo(-3000 + i * 250, 260 - Math.abs(Math.sin(i * 1.7)) * 260);
        ctx.lineTo(3000, 1400); ctx.lineTo(-3000, 1400); ctx.fill();
        layer(0.45);
        ctx.fillStyle = '#25100a';
        for (const s of this.mid) { ctx.fillRect(s.x - s.r, s.y + 100, s.r * 2, 900); ctx.beginPath(); ctx.ellipse(s.x, s.y + 100, s.r, 25, 0, 0, Math.PI * 2); ctx.fill(); }
        break;
      }
      case 'ruins': {
        layer(0.1);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (const s of this.far) {
          const xx = ((s.x + t * 0.3 * (0.5 + s.v!) + 3000) % 6000) - 3000;
          ctx.beginPath(); ctx.ellipse(xx, s.y, s.r, s.r * 0.3, 0, 0, Math.PI * 2); ctx.ellipse(xx + s.r * 0.5, s.y - s.r * 0.15, s.r * 0.6, s.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
        }
        layer(0.4);
        ctx.fillStyle = 'rgba(150,140,120,0.55)';
        for (const s of this.mid) {
          const yy = s.y - 200 + Math.sin(t * 0.012 + s.v! * 5) * 15;
          ctx.fillRect(s.x - 30, yy - s.r * 1.5, 60, s.r * 1.5);
          ctx.fillRect(s.x - 50, yy - s.r * 1.5 - 16, 100, 16);
          ctx.beginPath(); ctx.moveTo(s.x - 70, yy); ctx.lineTo(s.x + 70, yy); ctx.lineTo(s.x + 45, yy + 30); ctx.lineTo(s.x + 20, yy + 26); ctx.lineTo(s.x, yy + 50); ctx.lineTo(s.x - 25, yy + 34); ctx.lineTo(s.x - 50, yy + 28); ctx.fill();
        }
        break;
      }
      case 'forge': {
        layer(0.15);
        const g = ctx.createLinearGradient(0, 300, 0, 1300);
        g.addColorStop(0, 'rgba(255,80,20,0)'); g.addColorStop(1, 'rgba(255,120,30,0.9)');
        ctx.fillStyle = g; ctx.fillRect(-4000, 300, 8000, 1200);
        ctx.fillStyle = 'rgba(30,8,4,0.9)';
        for (const s of this.far) ctx.fillRect(s.x - 60, s.y - 200, 120, 1200);
        layer(0.4);
        for (const s of this.mid) {
          ctx.fillStyle = 'rgba(60,20,10,0.8)';
          ctx.fillRect(s.x - 25, s.y - 100, 50, 1000);
          ctx.fillStyle = `rgba(255,${120 + Math.floor(60 * Math.sin(t * 0.05 + s.v! * 9))},40,0.7)`;
          ctx.fillRect(s.x - 18, s.y - 90, 36, 10);
        }
        break;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
