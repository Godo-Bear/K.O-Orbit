import { Rng } from '../core/rng';
import type { StageDef } from '../sim/stages';

export interface Theme { top: string; body1: string; body2: string; soft: string; glow: string; line: string; fog: string }

export const THEMES: Record<StageDef['theme'], Theme> = {
  station: { top: '#9fb4ff', body1: '#3a4470', body2: '#141a33', soft: '#7d8cff', glow: '#5af0ff', line: '#e4ebff', fog: 'rgba(90,110,255,0.10)' },
  nebula: { top: '#ff9be0', body1: '#4d1f5e', body2: '#1a0824', soft: '#ff6ad5', glow: '#ff8af0', line: '#ffe4fa', fog: 'rgba(255,90,200,0.10)' },
  crater: { top: '#f0b37a', body1: '#7a4426', body2: '#2e160a', soft: '#ffb36b', glow: '#ffd08a', line: '#fff0dc', fog: 'rgba(255,150,80,0.12)' },
  ruins: { top: '#8fd16a', body1: '#a89878', body2: '#5a4e3c', soft: '#e8dcb8', glow: '#fff6d8', line: '#ffffff', fog: 'rgba(255,255,255,0.16)' },
  forge: { top: '#ff8a3d', body1: '#3a1a14', body2: '#120504', soft: '#ff6a2a', glow: '#ffb050', line: '#ffe0b8', fog: 'rgba(255,90,20,0.12)' },
  glacier: { top: '#f4fbff', body1: '#8fc4e8', body2: '#2b5f8a', soft: '#cfefff', glow: '#9ff0ff', line: '#ffffff', fog: 'rgba(220,240,255,0.16)' },
  metro: { top: '#3ef0ff', body1: '#2a2f45', body2: '#0d0f1a', soft: '#ff3dbb', glow: '#3ef0ff', line: '#ffffff', fog: 'rgba(255,61,187,0.08)' },
  canopy: { top: '#7fd650', body1: '#6b4423', body2: '#2e1a0c', soft: '#9be36a', glow: '#e6ff9a', line: '#eaffc8', fog: 'rgba(200,255,160,0.10)' },
  hyperlane: { top: '#ffcf3a', body1: '#5a6478', body2: '#1b1f2a', soft: '#7fe3ff', glow: '#ff9a3a', line: '#ffffff', fog: 'rgba(80,140,255,0.08)' },
  abyss: { top: '#c04dff', body1: '#2a1640', body2: '#07030d', soft: '#8b3dff', glow: '#ff3df0', line: '#f0c8ff', fog: 'rgba(160,40,255,0.10)' },
};

interface Shape { x: number; y: number; r: number; v: number }


/**
 * Multi-layer parallax background.
 *  - Far group (sky gradient, star field, planets, distant silhouettes) is plain vector work;
 *    dense repetitive detail (skyline windows) comes from small pre-rendered pattern tiles.
 *  - Mid layer + ambient particles are drawn live (cheap, animated).
 *  - Foreground silhouettes are drawn after the fighters for depth.
 */
export class Background {
  private stars: Shape[] = [];
  private far: Shape[] = [];
  private mid: Shape[] = [];
  private motes: Shape[] = [];
  /** Debug toggles for profiling. */
  dbg = { far: true, mid: true };

  constructor(public stage: StageDef) {
    const r = new Rng(stage.id.length * 977 + stage.id.charCodeAt(0) * 31 + stage.id.charCodeAt(1));
    const nStars = stage.theme === 'ruins' || stage.theme === 'canopy' ? 0 : stage.theme === 'glacier' ? 120 : 320;
    for (let i = 0; i < nStars; i++) this.stars.push({ x: r.range(-3200, 3200), y: r.range(-2200, 1200), r: r.range(0.5, 2.6), v: r.range(0, 6) });
    for (let i = 0; i < 12; i++) this.far.push({ x: r.range(-2800, 2800), y: r.range(-900, 300), r: r.range(120, 420), v: r.next() });
    for (let i = 0; i < 18; i++) this.mid.push({ x: -2700 + i * 320 + r.range(-80, 80), y: r.range(150, 450), r: r.range(60, 200), v: r.next() });
    for (let i = 0; i < 60; i++) this.motes.push({ x: r.range(-2200, 2200), y: r.range(-1400, 700), r: r.range(1.5, 5), v: r.next() });
  }

  /** Background (far cached group + live mid layer). */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, zoom: number, t: number) {
    if (this.dbg.far) this.drawFar(ctx, W, H, cx, cy, zoom, t);
    if (this.dbg.mid) this.drawMid(ctx, W, H, cx, cy, zoom, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private layer(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, zoom: number, k: number, ox = 0, oy = 0) {
    const z = zoom * (0.3 + 0.7 * k);
    ctx.setTransform(z, 0, 0, z, W / 2 - cx * k * z + ox, H / 2 - cy * k * z + oy);
  }

  private sky: CanvasGradient | null = null;
  private atmos: HTMLCanvasElement | null = null;
  private actx: CanvasRenderingContext2D | null = null;
  private atmosT = -99;

  /** Far group: sky, star field, planets, distant silhouettes — vector-drawn each frame (GPU-cheap). */
  private drawFar(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, zoom: number, t: number) {
    const st = this.stage;
    // low-res atmosphere: sky + glows, re-baked every other frame at 1/4 resolution, upscaled with smoothing
    const aw = Math.max(240, Math.round(W / 4)), ah = Math.max(135, Math.round(H / 4));
    if (!this.atmos || this.atmos.width !== aw || this.atmos.height !== ah) {
      this.atmos = document.createElement('canvas'); this.atmos.width = aw; this.atmos.height = ah;
      this.actx = this.atmos.getContext('2d', { alpha: false }); this.atmosT = -99; this.sky = null;
    }
    const a = this.actx!;
    if (t - this.atmosT >= 2 || t < this.atmosT) {
      this.atmosT = t;
      if (!this.sky) { const g = a.createLinearGradient(0, 0, 0, ah); g.addColorStop(0, st.sky[0]); g.addColorStop(0.55, st.sky[1]); g.addColorStop(1, st.sky[2]); this.sky = g; }
      a.setTransform(1, 0, 0, 1, 0, 0); a.fillStyle = this.sky; a.fillRect(0, 0, aw, ah);
      const q = aw / W;
      paintAtmos(a, st.theme, this.far, (k) => this.layer(a, aw, ah, cx, cy, zoom * q, k));
      a.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(this.atmos, 0, 0, W, H);
    const L = (k: number) => this.layer(ctx, W, H, cx, cy, zoom, k);
    if (this.stars.length) {
      L(0.05);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < this.stars.length; i++) {
        const s = this.stars[i];
        ctx.globalAlpha = i % 9 === 0 ? Math.max(0.1, Math.sin(t * 0.05 + s.v * 3)) * 0.95 : 0.35 + 0.5 * ((s.v * 7) % 1);
        ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
      }
      ctx.globalAlpha = 1;
    }
    paintFar(ctx, st.theme, this.far, L);
  }

  private drawMid(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, zoom: number, t: number) {
    const L = (k: number) => this.layer(ctx, W, H, cx, cy, zoom, k);
    paintMid(ctx, this.stage.theme, this.mid, L, t);
    // ambient motes (snow, embers, leaves, dust, sparks)
    L(0.7);
    const th = this.stage.theme;
    const col = th === 'glacier' ? '#ffffff' : th === 'forge' || th === 'crater' ? '#ffb050' : th === 'canopy' ? '#b8f07a' : th === 'metro' ? '#ff6ad5' : th === 'abyss' ? '#d68cff' : th === 'ruins' ? '#fff7d6' : '#9fd8ff';
    ctx.fillStyle = col;
    for (const m of this.motes) {
      const fall = th === 'forge' || th === 'abyss' ? -1 : 1;
      const x = ((m.x + Math.sin(t * 0.01 + m.v * 9) * 60 + (th === 'hyperlane' ? -t * 8 * (0.5 + m.v) : 0) + 2400) % 4800 + 4800) % 4800 - 2400;
      const y = ((m.y + fall * t * (0.4 + m.v * 0.8) + 1500) % 2300 + 2300) % 2300 - 1500;
      ctx.globalAlpha = 0.35 + m.v * 0.45;
      if (th === 'hyperlane') ctx.fillRect(x, y, m.r * 14, m.r * 0.6);
      else if (th === 'canopy') { ctx.beginPath(); ctx.ellipse(x, y, m.r * 1.6, m.r * 0.8, t * 0.03 + m.v * 6, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  /** Foreground silhouettes, drawn after fighters (parallax > 1) for depth. Kept low so it never hides play. */
  drawForeground(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, zoom: number, t: number) {
    const k = 1.25;
    const z = zoom * k;
    ctx.setTransform(z, 0, 0, z, W / 2 - cx * k * z, H / 2 - cy * k * z);
    const th = this.stage.theme;
    const fg = th === 'ruins' || th === 'canopy' ? 'rgba(20,40,18,0.82)' : th === 'glacier' ? 'rgba(235,246,255,0.85)' : 'rgba(4,3,12,0.82)';
    ctx.fillStyle = fg;
    const by = 520;
    for (let i = -3; i <= 3; i++) {
      const x = i * 900 + (i % 2) * 170;
      ctx.beginPath();
      switch (th) {
        case 'canopy': case 'ruins':
          for (let j = 0; j < 6; j++) { const a = j * 1.05 + Math.sin(t * 0.02 + i) * 0.05; ctx.ellipse(x + Math.cos(a) * 90, by + 40 + Math.sin(a) * 40, 110, 34, a, 0, Math.PI * 2); }
          break;
        case 'glacier':
          ctx.moveTo(x - 300, by + 300); ctx.quadraticCurveTo(x - 100, by - 40, x + 60, by + 20); ctx.quadraticCurveTo(x + 220, by - 20, x + 340, by + 300); break;
        case 'metro':
          ctx.rect(x - 40, by - 180, 18, 500); ctx.rect(x - 160, by - 170, 260, 10);
          break;
        case 'hyperlane': case 'station':
          ctx.moveTo(x - 260, by + 300); ctx.lineTo(x - 140, by - 20); ctx.lineTo(x + 140, by - 20); ctx.lineTo(x + 260, by + 300); break;
        default:
          ctx.moveTo(x - 280, by + 300); ctx.lineTo(x - 180, by + 30); ctx.lineTo(x - 60, by + 70); ctx.lineTo(x + 40, by - 10); ctx.lineTo(x + 180, by + 60); ctx.lineTo(x + 280, by + 300);
      }
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

type LayerFn = (k: number) => void;

let winPat: CanvasPattern | null | undefined;
/** Pre-rendered skyline-window tile (2 px per world unit) — one pattern fill per building. */
function windowPattern(ctx: CanvasRenderingContext2D) {
  if (winPat !== undefined) return winPat;
  const cv = document.createElement('canvas');
  const S = 2, TW = 130, TH = 170;
  cv.width = TW * S; cv.height = TH * S;
  const g = cv.getContext('2d')!;
  g.scale(S, S);
  for (let y = 0; y < TH; y += 34) for (let x = 0; x < TW; x += 26) {
    const r = (x * 13 + y * 7) % 11;
    if (r < 4) { g.fillStyle = r === 0 ? 'rgba(62,240,255,0.6)' : 'rgba(255,220,120,0.6)'; g.fillRect(x + 4, y + 6, 10, 14); }
  }
  winPat = ctx.createPattern(cv, 'repeat');
  if (winPat) winPat.setTransform(new DOMMatrix().scale(1 / S, 1 / S));
  return winPat;
}

/** Soft atmosphere (sky gradient, glows, aurora, light rays) — rendered at quarter resolution. */
function paintAtmos(g: CanvasRenderingContext2D, theme: StageDef['theme'], far: Shape[], L: LayerFn) {
  const glow = (x: number, y: number, r: number, c0: string) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c0); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
  switch (theme) {
    case 'station': L(0.08); glow(-900, 900, 1100, 'rgba(120,150,255,0.35)'); glow(800, -500, 260, 'rgba(220,220,255,0.25)'); break;
    case 'nebula':
      L(0.08);
      for (const s of far) glow(s.x, s.y, s.r * 2.4, s.v > 0.5 ? 'rgba(255,90,200,0.38)' : s.v > 0.25 ? 'rgba(110,80,255,0.36)' : 'rgba(60,200,255,0.28)');
      glow(300, -200, 260, 'rgba(255,255,255,0.35)');
      break;
    case 'crater': L(0.06); glow(500, -100, 700, 'rgba(255,170,80,0.55)'); break;
    case 'ruins': L(0.06); glow(-600, -700, 900, 'rgba(255,250,220,0.7)'); break;
    case 'forge': {
      L(0.12);
      const lg = g.createLinearGradient(0, 200, 0, 1300);
      lg.addColorStop(0, 'rgba(255,80,20,0)'); lg.addColorStop(1, 'rgba(255,130,40,0.95)');
      g.fillStyle = lg; g.fillRect(-5000, 200, 10000, 1400);
      break;
    }
    case 'glacier':
      L(0.05);
      for (let i = 0; i < 3; i++) {
        const ag = g.createLinearGradient(0, -900 + i * 120, 0, -500 + i * 120);
        ag.addColorStop(0, 'rgba(80,255,200,0)'); ag.addColorStop(0.5, i === 1 ? 'rgba(160,120,255,0.38)' : 'rgba(80,255,200,0.38)'); ag.addColorStop(1, 'rgba(80,255,200,0)');
        g.fillStyle = ag; g.beginPath(); g.moveTo(-3000, -800 + i * 120);
        for (let x = -3000; x <= 3000; x += 200) g.lineTo(x, -820 + i * 120 + Math.sin(x * 0.002 + i) * 120);
        for (let x = 3000; x >= -3000; x -= 200) g.lineTo(x, -520 + i * 120 + Math.sin(x * 0.002 + i + 0.6) * 120);
        g.fill();
      }
      break;
    case 'metro': L(0.06); glow(0, 300, 1600, 'rgba(255,40,170,0.28)'); glow(-700, -600, 400, 'rgba(255,214,245,0.25)'); break;
    case 'canopy':
      L(0.05); glow(400, -800, 1200, 'rgba(255,255,200,0.55)');
      for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,220,0.09)'; g.beginPath(); g.moveTo(200 + i * 80, -1400); g.lineTo(-600 + i * 260, 1200); g.lineTo(-450 + i * 260, 1200); g.fill(); }
      break;
    case 'hyperlane': L(0.04); glow(0, 0, 1400, 'rgba(60,120,255,0.3)'); glow(1200, -500, 500, 'rgba(255,160,80,0.3)'); break;
    case 'abyss': L(0.05); glow(0, -500, 1300, 'rgba(192,77,255,0.38)'); break;
  }
}

/** Crisp far layers (vector, full resolution). */
function paintFar(g: CanvasRenderingContext2D, theme: StageDef['theme'], far: Shape[], L: LayerFn) {
  const glow = (_x: number, _y: number, _r: number, _c: string) => { /* soft glows live in the low-res atmosphere layer */ };
  switch (theme) {
    case 'station': {
      L(0.08);
      glow(-900, 900, 1100, 'rgba(120,150,255,0.35)');
      const pg = g.createRadialGradient(-1100, 700, 100, -900, 900, 900);
      pg.addColorStop(0, '#7f9bff'); pg.addColorStop(0.55, '#3a3fa8'); pg.addColorStop(1, '#12123d');
      g.fillStyle = pg; g.beginPath(); g.arc(-900, 900, 900, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(200,215,255,0.45)'; g.lineWidth = 14; g.beginPath(); g.ellipse(-900, 900, 1320, 260, -0.25, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.strokeStyle = 'rgba(200,215,255,0.2)'; g.lineWidth = 30; g.beginPath(); g.ellipse(-900, 900, 1450, 300, -0.25, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.fillStyle = '#d9dcff'; g.beginPath(); g.arc(800, -500, 70, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(30,30,80,0.5)'; g.beginPath(); g.arc(780, -510, 66, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'nebula': {
      L(0.08);
      for (const s of far) glow(s.x, s.y, s.r * 2.4, s.v > 0.5 ? 'rgba(255,90,200,0.38)' : s.v > 0.25 ? 'rgba(110,80,255,0.36)' : 'rgba(60,200,255,0.28)');
      glow(300, -200, 260, 'rgba(255,255,255,0.35)');
      break;
    }
    case 'crater': {
      L(0.06);
      glow(500, -100, 700, 'rgba(255,170,80,0.55)');
      g.fillStyle = '#ffe1a0'; g.beginPath(); g.arc(500, -100, 230, 0, Math.PI * 2); g.fill();
      L(0.16);
      g.fillStyle = '#5a2a14';
      g.beginPath(); g.moveTo(-3200, 900);
      for (let i = 0; i <= 26; i++) g.lineTo(-3200 + i * 250, 250 - Math.abs(Math.sin(i * 1.7)) * 300);
      g.lineTo(3200, 1600); g.lineTo(-3200, 1600); g.fill();
      L(0.24);
      g.fillStyle = '#3e1c0d';
      g.beginPath(); g.moveTo(-3200, 900);
      for (let i = 0; i <= 30; i++) g.lineTo(-3200 + i * 220, 360 - Math.abs(Math.sin(i * 2.3 + 1)) * 200);
      g.lineTo(3200, 1600); g.lineTo(-3200, 1600); g.fill();
      break;
    }
    case 'ruins': {
      L(0.06);
      glow(-600, -700, 900, 'rgba(255,250,220,0.7)');
      L(0.14);
      g.fillStyle = 'rgba(160,190,220,0.55)';
      g.beginPath(); g.moveTo(-3200, 900);
      for (let i = 0; i <= 20; i++) g.lineTo(-3200 + i * 320, 380 - Math.abs(Math.sin(i * 1.3)) * 360);
      g.lineTo(3200, 1600); g.lineTo(-3200, 1600); g.fill();
      break;
    }
    case 'forge': {
      L(0.12);
      g.fillStyle = 'rgba(30,8,4,0.95)';
      for (const s of far) { g.fillRect(s.x - 70, s.y - 260, 140, 1500); g.beginPath(); g.moveTo(s.x - 90, s.y - 260); g.lineTo(s.x, s.y - 340); g.lineTo(s.x + 90, s.y - 260); g.fill(); }
      break;
    }
    case 'glacier': {
      L(0.05);
      // aurora ribbons → atmosphere layer
      for (let i = 0; i < 0; i++) {
        const ag = g.createLinearGradient(0, -900 + i * 120, 0, -500 + i * 120);
        ag.addColorStop(0, 'rgba(80,255,200,0)'); ag.addColorStop(0.5, i === 1 ? 'rgba(160,120,255,0.35)' : 'rgba(80,255,200,0.35)'); ag.addColorStop(1, 'rgba(80,255,200,0)');
        g.fillStyle = ag; g.beginPath(); g.moveTo(-3000, -800 + i * 120);
        for (let x = -3000; x <= 3000; x += 200) g.lineTo(x, -820 + i * 120 + Math.sin(x * 0.002 + i) * 120);
        for (let x = 3000; x >= -3000; x -= 200) g.lineTo(x, -520 + i * 120 + Math.sin(x * 0.002 + i + 0.6) * 120);
        g.fill();
      }
      L(0.14);
      g.fillStyle = '#9cc3e4';
      g.beginPath(); g.moveTo(-3200, 1000);
      for (let i = 0; i <= 16; i++) g.lineTo(-3200 + i * 400, i % 2 ? 380 : -120 - (i % 3) * 120);
      g.lineTo(3200, 1600); g.lineTo(-3200, 1600); g.fill();
      g.fillStyle = '#f4fbff';
      for (let i = 0; i < 16; i += 2) { const x = -3200 + i * 400, y = -120 - (i % 3) * 120; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 110, y + 150); g.lineTo(x - 30, y + 120); g.lineTo(x + 20, y + 170); g.lineTo(x + 110, y + 140); g.fill(); }
      break;
    }
    case 'metro': {
      L(0.06);
      glow(0, 300, 1600, 'rgba(255,40,170,0.25)');
      g.fillStyle = '#ffd6f5'; g.beginPath(); g.arc(-700, -600, 120, 0, Math.PI * 2); g.fill();
      L(0.15);
      const win = windowPattern(g);
      for (let i = 0; i < 40; i++) {
        const x = -3200 + i * 165, h = 400 + ((i * 7919) % 600), w = 120 + ((i * 31) % 60);
        g.fillStyle = '#120a28'; g.fillRect(x, 500 - h, w, h + 1200);
        if (win) { g.fillStyle = win; g.fillRect(x + 10, 520 - h, w - 20, h - 30); }
      }
      break;
    }
    case 'canopy': {
      L(0.05);
      glow(400, -800, 1200, 'rgba(255,255,200,0.55)');

      L(0.13);
      g.fillStyle = '#1f5a36';
      for (const s of far) { g.fillRect(s.x - 40, s.y - 200, 80, 1600); for (let j = 0; j < 4; j++) { g.beginPath(); g.ellipse(s.x + (j - 1.5) * 90, s.y - 240 - (j % 2) * 60, 160, 110, 0, 0, Math.PI * 2); g.fill(); } }
      break;
    }
    case 'hyperlane': {
      L(0.04);
      glow(0, 0, 1400, 'rgba(60,120,255,0.3)');
      glow(1200, -500, 500, 'rgba(255,160,80,0.3)');
      break;
    }
    case 'abyss': {
      L(0.05);
      // black hole
      glow(0, -500, 1300, 'rgba(192,77,255,0.35)');
      g.strokeStyle = 'rgba(255,140,240,0.7)'; g.lineWidth = 40; g.beginPath(); g.ellipse(0, -500, 520, 120, 0.15, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,220,255,0.5)'; g.lineWidth = 10; g.beginPath(); g.ellipse(0, -500, 470, 100, 0.15, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#000000'; g.beginPath(); g.arc(0, -500, 250, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,170,250,0.8)'; g.lineWidth = 6; g.beginPath(); g.arc(0, -500, 256, 0, Math.PI * 2); g.stroke();
      L(0.15);
      g.fillStyle = '#12061e';
      for (const s of far) { g.beginPath(); g.moveTo(s.x - 120, s.y + 200); g.lineTo(s.x - 60, s.y - 120); g.lineTo(s.x, s.y - 300); g.lineTo(s.x + 70, s.y - 110); g.lineTo(s.x + 130, s.y + 200); g.fill(); }
      break;
    }
  }
}

/** Live mid layers (animated, cheap). */
function paintMid(g: CanvasRenderingContext2D, theme: StageDef['theme'], mid: Shape[], L: LayerFn, t: number) {
  switch (theme) {
    case 'station':
      L(0.3);
      for (const s of mid) {
        g.fillStyle = 'rgba(120,140,220,0.28)';
        g.fillRect(s.x, s.y - s.r * 2, s.r * 0.4, s.r * 2); g.fillRect(s.x - s.r * 0.4, s.y - s.r * 1.2, s.r * 1.2, 12);
        g.fillStyle = (t >> 5) % 3 === Math.floor(s.v * 3) ? '#ff5a6a' : 'rgba(90,240,255,0.7)';
        g.fillRect(s.x + s.r * 0.15, s.y - s.r * 2 - 8, 6, 6);
      }
      break;
    case 'nebula':
      L(0.35);
      for (const s of mid) {
        const yy = s.y - 300 + Math.sin(t * 0.01 + s.v * 6) * 22;
        g.fillStyle = 'rgba(40,10,60,0.9)'; g.beginPath(); g.ellipse(s.x, yy, s.r * 0.5, s.r * 0.35, s.v * 3 + t * 0.002, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,120,220,0.25)'; g.beginPath(); g.ellipse(s.x - s.r * 0.12, yy - s.r * 0.1, s.r * 0.3, s.r * 0.15, s.v * 3 + t * 0.002, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'crater':
      L(0.45);
      for (const s of mid) {
        g.fillStyle = '#25100a'; g.fillRect(s.x - s.r, s.y + 100, s.r * 2, 900);
        g.fillStyle = '#4a2112'; g.beginPath(); g.ellipse(s.x, s.y + 100, s.r, 25, 0, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'ruins':
      L(0.1);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (const s of mid.slice(0, 9)) {
        const xx = ((s.x * 1.3 + t * 0.3 * (0.5 + s.v) + 3000) % 6000) - 3000;
        g.beginPath(); g.ellipse(xx, s.y - 900, s.r * 1.6, s.r * 0.45, 0, 0, Math.PI * 2); g.ellipse(xx + s.r * 0.7, s.y - 960, s.r, s.r * 0.45, 0, 0, Math.PI * 2); g.fill();
      }
      L(0.4);
      for (const s of mid) {
        const yy = s.y - 200 + Math.sin(t * 0.012 + s.v * 5) * 15;
        g.fillStyle = 'rgba(150,140,120,0.6)';
        g.fillRect(s.x - 30, yy - s.r * 1.5, 60, s.r * 1.5);
        g.fillRect(s.x - 50, yy - s.r * 1.5 - 16, 100, 16);
        g.beginPath(); g.moveTo(s.x - 70, yy); g.lineTo(s.x + 70, yy); g.lineTo(s.x + 45, yy + 30); g.lineTo(s.x + 20, yy + 26); g.lineTo(s.x, yy + 50); g.lineTo(s.x - 25, yy + 34); g.lineTo(s.x - 50, yy + 28); g.fill();
        g.fillStyle = 'rgba(120,170,90,0.6)'; g.fillRect(s.x - 70, yy - 4, 140, 6);
      }
      break;
    case 'forge':
      L(0.4);
      for (const s of mid) {
        g.fillStyle = 'rgba(60,20,10,0.85)'; g.fillRect(s.x - 25, s.y - 100, 50, 1000);
        g.fillStyle = `rgba(255,${120 + Math.floor(60 * Math.sin(t * 0.05 + s.v * 9))},40,0.75)`; g.fillRect(s.x - 18, s.y - 90, 36, 10);
        g.fillStyle = 'rgba(80,60,60,0.18)'; g.beginPath(); g.ellipse(s.x + Math.sin(t * 0.01 + s.v * 4) * 30, s.y - 200 - ((t * 0.6 + s.v * 400) % 400), 40 + ((t * 0.3 + s.v * 300) % 80), 30, 0, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'glacier':
      L(0.4);
      for (const s of mid) {
        g.fillStyle = 'rgba(120,170,210,0.55)';
        g.beginPath(); g.moveTo(s.x - s.r * 0.6, s.y + 300); g.lineTo(s.x - s.r * 0.2, s.y - s.r); g.lineTo(s.x + s.r * 0.15, s.y - s.r * 0.7); g.lineTo(s.x + s.r * 0.6, s.y + 300); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.moveTo(s.x - s.r * 0.32, s.y - s.r * 0.6); g.lineTo(s.x - s.r * 0.2, s.y - s.r); g.lineTo(s.x + s.r * 0.15, s.y - s.r * 0.7); g.lineTo(s.x + s.r * 0.05, s.y - s.r * 0.5); g.fill();
      }
      break;
    case 'metro':
      L(0.4);
      for (const s of mid) {
        const w = s.r * 1.1, h = s.r * 3.4;
        g.fillStyle = '#0b0618'; g.fillRect(s.x - w / 2, s.y - h + 260, w, h + 600);
        const on = Math.sin(t * 0.08 + s.v * 20) > -0.7;
        g.fillStyle = s.v > 0.5 ? `rgba(255,61,187,${on ? 0.9 : 0.3})` : `rgba(62,240,255,${on ? 0.9 : 0.3})`;
        g.fillRect(s.x - w / 2 + 10, s.y - h + 290, w - 20, 16);
        g.fillRect(s.x - w / 2 + 10, s.y - h + 320, (w - 20) * 0.6, 8);
      }
      break;
    case 'canopy':
      L(0.4);
      for (const s of mid) {
        g.fillStyle = 'rgba(30,70,40,0.85)'; g.fillRect(s.x - 22, s.y - 300, 44, 1400);
        g.fillStyle = 'rgba(60,120,60,0.8)';
        g.beginPath(); g.ellipse(s.x + Math.sin(t * 0.015 + s.v * 5) * 6, s.y - 330, s.r, s.r * 0.6, 0, 0, Math.PI * 2); g.fill();
      }
      break;
    case 'hyperlane':
      L(0.5);
      g.strokeStyle = 'rgba(170,210,255,0.5)'; g.lineWidth = 3;
      for (const s of mid) {
        const x = ((s.x - t * 22 * (0.6 + s.v)) % 5400 + 5400) % 5400 - 2700;
        g.beginPath(); g.moveTo(x, s.y - 900 + s.v * 800); g.lineTo(x + 300 + s.v * 400, s.y - 900 + s.v * 800); g.stroke();
      }
      break;
    case 'abyss':
      L(0.35);
      for (const s of mid) {
        const yy = s.y - 260 + Math.sin(t * 0.015 + s.v * 7) * 25;
        g.fillStyle = 'rgba(30,10,50,0.9)'; g.beginPath(); g.moveTo(s.x - s.r * 0.5, yy); g.lineTo(s.x + s.r * 0.5, yy); g.lineTo(s.x, yy + s.r * 0.9); g.fill();
        g.fillStyle = `rgba(255,61,240,${0.35 + 0.3 * Math.sin(t * 0.06 + s.v * 10)})`; g.fillRect(s.x - 4, yy + 12, 8, 8);
      }
      break;
  }
}
