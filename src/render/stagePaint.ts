import type { Platform, StageDef } from '../sim/stages';
import { THEMES } from './background';
import { roundRect, shade } from './rig';

/**
 * Stage platform art. Body textures are rendered once per theme into a 256px tile
 * representing 64 world units (4 px/unit — sharp even at 4K max zoom) and used as a
 * CanvasPattern, so detailed surfaces cost a single fill per frame.
 */
const TILE = 256, UNITS = 64;
const patterns = new Map<string, CanvasPattern | null>();

function makePattern(ctx: CanvasRenderingContext2D, theme: StageDef['theme']): CanvasPattern | null {
  const key = theme;
  if (patterns.has(key)) return patterns.get(key)!;
  const cv = document.createElement('canvas');
  cv.width = cv.height = TILE;
  const g = cv.getContext('2d')!;
  const th = THEMES[theme];
  g.fillStyle = th.body1; g.fillRect(0, 0, TILE, TILE);
  const S = TILE / UNITS; // px per unit inside the tile
  g.scale(S, S);
  const line = (x1: number, y1: number, x2: number, y2: number, c: string, w = 0.6) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  switch (theme) {
    case 'station': case 'hyperlane': {
      for (let y = 0; y < 64; y += 32) for (let x = 0; x < 64; x += 32) {
        g.fillStyle = (x + y) % 64 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)'; g.fillRect(x + 1, y + 1, 30, 30);
        line(x, y + 0.5, x + 32, y + 0.5, 'rgba(255,255,255,0.18)'); line(x + 0.5, y, x + 0.5, y + 32, 'rgba(0,0,0,0.35)');
        g.fillStyle = 'rgba(255,255,255,0.35)'; for (const [rx, ry] of [[4, 4], [28, 4], [4, 28], [28, 28]]) { g.beginPath(); g.arc(x + rx, y + ry, 0.9, 0, Math.PI * 2); g.fill(); }
      }
      if (theme === 'hyperlane') { g.fillStyle = 'rgba(255,207,58,0.25)'; for (let i = -64; i < 64; i += 16) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 8, 64); g.lineTo(i + 24, 48); g.lineTo(i + 16, 48); g.fill(); } }
      break;
    }
    case 'nebula': case 'abyss': {
      for (let i = 0; i < 14; i++) {
        const x = (i * 23) % 64, y = (i * 41) % 64;
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.18)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y + 4); g.lineTo(x + 8, y + 16); g.closePath(); g.fill();
      }
      if (theme === 'abyss') { g.strokeStyle = 'rgba(255,61,240,0.35)'; g.lineWidth = 0.8; g.strokeRect(20, 20, 10, 10); g.beginPath(); g.moveTo(25, 16); g.lineTo(25, 34); g.stroke(); g.beginPath(); g.arc(50, 48, 5, 0, Math.PI * 1.5); g.stroke(); }
      break;
    }
    case 'crater': {
      for (let y = 4; y < 64; y += 12) line(0, y + Math.sin(y) * 2, 64, y + Math.cos(y) * 2, 'rgba(0,0,0,0.25)', 1.2);
      for (let i = 0; i < 18; i++) { g.fillStyle = i % 3 ? 'rgba(255,200,150,0.12)' : 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse((i * 29) % 64, (i * 17) % 64, 2.5, 1.6, i, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'ruins': {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const x = c * 24 + (r % 2) * 12 - 12, y = r * 16;
        g.fillStyle = (r + c) % 3 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'; g.fillRect(x + 1, y + 1, 22, 14);
        g.strokeStyle = 'rgba(60,50,35,0.55)'; g.lineWidth = 0.9; g.strokeRect(x + 0.5, y + 0.5, 23, 15);
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 1, y + 1, 22, 1.2);
      }
      g.fillStyle = 'rgba(100,150,70,0.35)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc((i * 37) % 64, (i * 23) % 64, 2, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'forge': {
      g.strokeStyle = 'rgba(255,120,40,0.75)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(0, 20); g.lineTo(12, 26); g.lineTo(20, 18); g.lineTo(34, 30); g.lineTo(46, 22); g.lineTo(64, 28); g.stroke();
      g.beginPath(); g.moveTo(30, 30); g.lineTo(28, 46); g.lineTo(40, 58); g.lineTo(38, 64); g.stroke();
      g.strokeStyle = 'rgba(255,210,120,0.6)'; g.lineWidth = 0.4; g.stroke();
      for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect((i * 19) % 64, (i * 13) % 64, 8, 6); }
      break;
    }
    case 'glacier': {
      for (let i = 0; i < 10; i++) {
        const x = (i * 27) % 64, y = (i * 19) % 64;
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(30,80,130,0.18)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y + 6); g.lineTo(x + 6, y + 20); g.closePath(); g.fill();
      }
      line(0, 64, 64, 0, 'rgba(255,255,255,0.25)', 0.5); line(10, 64, 64, 10, 'rgba(255,255,255,0.12)', 0.4);
      break;
    }
    case 'metro': {
      for (let y = 4; y < 64; y += 16) for (let x = 4; x < 64; x += 16) {
        const lit = ((x * 7 + y * 3) % 5) < 2;
        g.fillStyle = lit ? 'rgba(255,220,140,0.75)' : 'rgba(10,10,30,0.7)'; g.fillRect(x, y, 8, 10);
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, 8, 1);
      }
      break;
    }
    case 'canopy': {
      for (let x = 2; x < 64; x += 7) { g.strokeStyle = 'rgba(30,15,5,0.35)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 3, 20, x - 3, 44, x + 1, 64); g.stroke(); }
      g.strokeStyle = 'rgba(255,220,170,0.12)'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(40, 30, 6, 10, 0, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.ellipse(40, 30, 3, 5, 0, 0, Math.PI * 2); g.stroke();
      break;
    }
  }
  const pat = ctx.createPattern(cv, 'repeat');
  if (pat && 'setTransform' in pat) pat.setTransform(new DOMMatrix().scale(1 / S, 1 / S));
  patterns.set(key, pat);
  return pat;
}

export function drawStage(ctx: CanvasRenderingContext2D, stage: StageDef, platforms: Platform[], t: number) {
  const th = THEMES[stage.theme];
  const pat = makePattern(ctx, stage.theme);
  for (const p of platforms) {
    if (p.solid) drawSolid(ctx, stage, p, pat, t);
    else if (p.def.move) drawMoving(ctx, stage, p, t);
    else drawSoft(ctx, stage, p, t);
  }
  if (stage.theme === 'forge') {
    const ly = stage.blast.b - 160;
    const g = ctx.createLinearGradient(0, ly - 30, 0, ly + 300);
    g.addColorStop(0, 'rgba(255,220,120,0.95)'); g.addColorStop(0.15, 'rgba(255,90,20,0.85)'); g.addColorStop(1, 'rgba(120,10,0,0.9)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(stage.blast.l, ly);
    for (let x = stage.blast.l; x <= stage.blast.r; x += 80) ctx.lineTo(x, ly + Math.sin(x * 0.01 + t * 0.05) * 18 + Math.sin(x * 0.023 - t * 0.03) * 8);
    ctx.lineTo(stage.blast.r, ly + 600); ctx.lineTo(stage.blast.l, ly + 600); ctx.fill();
  }
  void th;
}

function solidPath(ctx: CanvasRenderingContext2D, p: Platform, inset = 0) {
  const h = p.h, mx = (p.x1 + p.x2) / 2, half = (p.x2 - p.x1) / 2;
  ctx.beginPath();
  ctx.moveTo(p.x1 + inset, p.y + inset);
  ctx.lineTo(p.x2 - inset, p.y + inset);
  ctx.lineTo(p.x2 - 10 - inset, p.y + h * 0.35);
  ctx.lineTo(mx + half * 0.35 - inset, p.y + h - inset);
  ctx.lineTo(mx - half * 0.35 + inset, p.y + h - inset);
  ctx.lineTo(p.x1 + 10 + inset, p.y + h * 0.35);
  ctx.closePath();
}

function drawSolid(ctx: CanvasRenderingContext2D, stage: StageDef, p: Platform, pat: CanvasPattern | null, t: number) {
  const th = THEMES[stage.theme];
  const h = p.h, w = p.x2 - p.x1, mx = (p.x1 + p.x2) / 2;
  // underside details (behind body)
  switch (stage.theme) {
    case 'station': case 'hyperlane':
      for (const s of [-1, 1]) {
        const x = mx + s * w * 0.18, y = p.y + h - 6;
        ctx.fillStyle = '#20263d'; roundRect(ctx, x - 28, y - 10, 56, 30, 8); ctx.fill();
        const fl = 60 + Math.sin(t * 0.4 + s) * 10;
        const g = ctx.createLinearGradient(0, y + 18, 0, y + 18 + fl);
        g.addColorStop(0, stage.theme === 'hyperlane' ? 'rgba(255,170,80,0.95)' : 'rgba(110,240,255,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 20, y + 18); ctx.lineTo(x + 20, y + 18); ctx.lineTo(x, y + 18 + fl); ctx.fill();
      }
      break;
    case 'glacier':
      ctx.fillStyle = 'rgba(200,235,255,0.9)';
      for (let i = 0; i < 9; i++) { const x = p.x1 + 40 + i * ((w - 80) / 8), L = 30 + ((i * 37) % 50); ctx.beginPath(); ctx.moveTo(x - 10, p.y + h * 0.3); ctx.lineTo(x, p.y + h * 0.3 + L); ctx.lineTo(x + 10, p.y + h * 0.3); ctx.fill(); }
      break;
    case 'canopy':
      ctx.strokeStyle = '#3b2412'; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) { ctx.lineWidth = 14 - i; const x = mx + (i - 2.5) * w * 0.14; ctx.beginPath(); ctx.moveTo(x, p.y + h * 0.8); ctx.bezierCurveTo(x + 30, p.y + h + 60, x - 40, p.y + h + 140, x + 10 * (i - 2), p.y + h + 260); ctx.stroke(); }
      break;
    case 'nebula': case 'abyss':
      for (let i = 0; i < 5; i++) {
        const x = mx + (i - 2) * w * 0.12, L = 60 + (i % 2) * 50;
        ctx.fillStyle = stage.theme === 'abyss' ? '#5b1a8a' : '#c24ea0';
        ctx.beginPath(); ctx.moveTo(x - 16, p.y + h - 10); ctx.lineTo(x, p.y + h + L); ctx.lineTo(x + 16, p.y + h - 10); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(x - 4, p.y + h); ctx.lineTo(x, p.y + h + L * 0.7); ctx.lineTo(x + 3, p.y + h); ctx.fill();
      }
      break;
  }
  // body: ink outline, texture, light & shadow
  ctx.lineJoin = 'round';
  solidPath(ctx, p); ctx.lineWidth = 8; ctx.strokeStyle = '#05040c'; ctx.stroke();
  ctx.fillStyle = pat ?? th.body1; ctx.fill();
  const sh = ctx.createLinearGradient(0, p.y, 0, p.y + h);
  sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = sh; ctx.fill();
  const side = ctx.createLinearGradient(p.x1, 0, p.x2, 0);
  side.addColorStop(0, 'rgba(0,0,0,0.35)'); side.addColorStop(0.15, 'rgba(0,0,0,0)'); side.addColorStop(0.85, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = side; ctx.fill();
  // rim light along the lower edges
  ctx.strokeStyle = th.glow; ctx.globalAlpha = 0.45; ctx.lineWidth = 3;
  solidPath(ctx, p, 4); ctx.stroke(); ctx.globalAlpha = 1;
  // walkable top surface
  const topH = 16;
  ctx.fillStyle = '#05040c'; ctx.fillRect(p.x1 - 3, p.y - 3, w + 6, topH + 5);
  const tg = ctx.createLinearGradient(0, p.y, 0, p.y + topH);
  tg.addColorStop(0, th.line); tg.addColorStop(0.18, th.top); tg.addColorStop(1, shadeAlpha(th.top));
  ctx.fillStyle = tg; ctx.fillRect(p.x1, p.y, w, topH);
  // surface decoration
  switch (stage.theme) {
    case 'ruins': case 'canopy':
      ctx.fillStyle = stage.theme === 'canopy' ? '#9be36a' : '#a6e07a';
      for (let x = p.x1 + 6; x < p.x2 - 6; x += 14) { const hh = 6 + ((x * 13) % 7) + Math.sin(t * 0.04 + x) * 1.2; ctx.beginPath(); ctx.moveTo(x - 4, p.y + 2); ctx.lineTo(x + Math.sin(t * 0.03 + x * 0.1) * 2, p.y - hh); ctx.lineTo(x + 4, p.y + 2); ctx.fill(); }
      break;
    case 'glacier':
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(p.x1 - 4, p.y + 6);
      for (let x = p.x1; x <= p.x2; x += 40) ctx.quadraticCurveTo(x + 20, p.y - 10, x + 40, p.y + 2);
      ctx.lineTo(p.x2 + 4, p.y + 8); ctx.lineTo(p.x1 - 4, p.y + 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let x = p.x1 + 30; x < p.x2; x += 90) ctx.fillRect(x, p.y + 8, 40, 2);
      break;
    case 'metro': case 'station': case 'hyperlane':
      for (let x = p.x1 + 30; x < p.x2 - 20; x += 60) { ctx.fillStyle = (Math.floor(x / 60) + (t >> 4)) % 6 === 0 ? th.glow : 'rgba(255,255,255,0.25)'; ctx.fillRect(x, p.y + topH - 5, 24, 3); }
      break;
    case 'forge':
      ctx.fillStyle = `rgba(255,${150 + Math.floor(Math.sin(t * 0.08) * 40)},60,0.8)`;
      for (let x = p.x1 + 40; x < p.x2 - 40; x += 110) ctx.fillRect(x, p.y + topH - 4, 50, 2);
      break;
    case 'abyss':
      ctx.fillStyle = `rgba(255,61,240,${0.55 + 0.35 * Math.sin(t * 0.05)})`;
      for (let x = p.x1 + 30; x < p.x2 - 30; x += 70) { ctx.beginPath(); ctx.arc(x, p.y + 8, 3, 0, Math.PI * 2); ctx.fill(); }
      break;
  }
  // ledge markers: glowing caps so grab points read at a glance
  for (const lx of [p.x1, p.x2]) {
    const g = ctx.createRadialGradient(lx, p.y + 6, 0, lx, p.y + 6, 34);
    g.addColorStop(0, th.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 0.08); ctx.fillStyle = g; ctx.fillRect(lx - 34, p.y - 28, 68, 68); ctx.globalAlpha = 1;
    ctx.fillStyle = '#05040c'; roundRect(ctx, lx - 8, p.y - 4, 16, 24, 5); ctx.fill();
    ctx.fillStyle = th.glow; roundRect(ctx, lx - 5, p.y - 1, 10, 18, 3); ctx.fill();
  }
}

function shadeAlpha(c: string) { return shade(c, -0.35); }

/** Thin drop-through platform: translucent light bridge with a bright top edge. */
function drawSoft(ctx: CanvasRenderingContext2D, stage: StageDef, p: Platform, t: number) {
  const th = THEMES[stage.theme];
  const w = p.x2 - p.x1;
  const g = ctx.createLinearGradient(0, p.y, 0, p.y + 46);
  g.addColorStop(0, th.soft); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.28; ctx.fillStyle = g; ctx.fillRect(p.x1 + 8, p.y + 6, w - 16, 40); ctx.globalAlpha = 1;
  ctx.fillStyle = '#05040c'; roundRect(ctx, p.x1 - 3, p.y - 5, w + 6, 17, 8); ctx.fill();
  ctx.fillStyle = th.soft; ctx.globalAlpha = 0.85; roundRect(ctx, p.x1, p.y - 2, w, 11, 5.5); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = th.line; ctx.fillRect(p.x1 + 6, p.y - 2, w - 12, 3);
  // dashed underside marks "pass-through"
  ctx.strokeStyle = th.line; ctx.globalAlpha = 0.5; ctx.lineWidth = 2; ctx.setLineDash([10, 10]); ctx.lineDashOffset = -t * 0.3;
  ctx.beginPath(); ctx.moveTo(p.x1 + 10, p.y + 12); ctx.lineTo(p.x2 - 10, p.y + 12); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}

/** Moving platform: heavier bar with mechanical caps, thrusters and travel arrows. */
function drawMoving(ctx: CanvasRenderingContext2D, stage: StageDef, p: Platform, t: number) {
  const th = THEMES[stage.theme];
  const w = p.x2 - p.x1, mx = (p.x1 + p.x2) / 2;
  const m = p.def.move!;
  // thrusters
  for (const s of [-1, 1]) {
    const x = mx + s * w * 0.3;
    const fl = 26 + Math.sin(t * 0.5 + s) * 6 + Math.abs(p.dy) * 6;
    const g = ctx.createLinearGradient(0, p.y + 16, 0, p.y + 16 + fl);
    g.addColorStop(0, th.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 9, p.y + 16); ctx.lineTo(x + 9, p.y + 16); ctx.lineTo(x, p.y + 16 + fl); ctx.fill();
  }
  ctx.fillStyle = '#05040c'; roundRect(ctx, p.x1 - 3, p.y - 5, w + 6, 25, 9); ctx.fill();
  const g = ctx.createLinearGradient(0, p.y, 0, p.y + 18);
  g.addColorStop(0, th.line); g.addColorStop(0.2, th.soft); g.addColorStop(1, '#2a2440');
  ctx.fillStyle = g; roundRect(ctx, p.x1, p.y - 2, w, 19, 7); ctx.fill();
  // end caps
  ctx.fillStyle = '#3a3550'; roundRect(ctx, p.x1, p.y - 2, 18, 19, 7); ctx.fill(); roundRect(ctx, p.x2 - 18, p.y - 2, 18, 19, 7); ctx.fill();
  const blink = (t >> 4) % 2 ? th.glow : '#ffffff';
  ctx.fillStyle = blink; ctx.fillRect(p.x1 + 6, p.y + 5, 6, 4); ctx.fillRect(p.x2 - 12, p.y + 5, 6, 4);
  // travel direction chevrons
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const vertical = m.ay !== 0 && m.ax === 0;
  const dir = vertical ? Math.sign(p.dy) || 1 : Math.sign(p.dx) || 1;
  for (let i = -1; i <= 1; i++) {
    const cx = mx + i * 22, cy = p.y + 8;
    ctx.beginPath();
    if (vertical) { ctx.moveTo(cx - 6, cy - dir * 3); ctx.lineTo(cx, cy + dir * 3); ctx.lineTo(cx + 6, cy - dir * 3); }
    else { ctx.moveTo(cx - dir * 3, cy - 5); ctx.lineTo(cx + dir * 3, cy); ctx.lineTo(cx - dir * 3, cy + 5); }
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
  }
}
