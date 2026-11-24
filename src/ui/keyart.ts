import { getArt, drawArt } from '../render/art';
import { THEMES } from '../render/background';
import { stageById } from '../sim/stages';
import { shade } from '../render/rig';
import { STORY, isStageUnlocked } from '../story/campaign';
import { save } from '../core/save';
import { portraitCanvas } from './dom';

/** Title-screen key art: the whole roster lined up in two depth rows, built from the character art. */
export function heroLineup(w: number, h: number) {
  return portraitCanvas(w, (ctx) => {
    const glow = ctx.createRadialGradient(w / 2, h * 0.75, 10, w / 2, h * 0.75, w * 0.48);
    glow.addColorStop(0, 'rgba(255,170,80,0.42)'); glow.addColorStop(0.45, 'rgba(140,80,255,0.16)'); glow.addColorStop(1, 'rgba(140,80,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    const back: [string, number][] = [['brick', 0.16], ['rook', 0.36], ['omega', 0.5], ['glacia', 0.66], ['zephyr', 0.86]];
    const front: [string, number][] = [['volt', 0.27], ['nova', 0.5], ['ember', 0.73]];
    // draw back row into its own layer so the dim tint only affects it
    const layer = document.createElement('canvas');
    const d = ctx.getTransform().a;
    layer.width = Math.round(w * d); layer.height = Math.round(h * d);
    const lc = layer.getContext('2d')!; lc.scale(d, d);
    const drawTo = (c: CanvasRenderingContext2D, row: [string, number][], scale: number, y: number, dim: number) => {
      for (const [id, fx] of row) {
        const a = getArt(id)?.full;
        if (!a) continue;
        const hh = h * scale * (id === 'omega' ? 1.12 : id === 'brick' ? 0.9 : 1);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(w * fx, y, hh * 0.22, hh * 0.035, 0, 0, Math.PI * 2); c.fill();
        drawArt(c, a, w * fx, y, hh, 0, 1, true);
      }
      if (dim > 0) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(30,16,70,${dim})`; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over'; }
    };
    drawTo(lc, back, 0.74, h * 0.8, 0.35);
    ctx.drawImage(layer, 0, 0, w, h);
    drawTo(ctx, front, 0.86, h * 0.99, 0);
  }, h);
}

/** Illustrated Story Mode map: the dying star Aurex, orbit rings and a floating arena under every stage node. */
export function storyMapCanvas(host: HTMLElement) {
  const c = document.createElement('canvas');
  c.className = 'story-bg';
  host.prepend(c);
  const paint = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const d = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(w * d); c.height = Math.round(h * d);
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    const g = c.getContext('2d')!;
    g.scale(d, d);
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0a0620'); bg.addColorStop(1, '#1c0c34');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // stars
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 220; i++) { g.globalAlpha = 0.25 + rnd() * 0.7; g.fillStyle = '#fff'; const r = rnd() * 1.6 + 0.3; g.fillRect(rnd() * w, rnd() * h, r, r); }
    g.globalAlpha = 1;
    // nebula wisps
    for (const [x, y, r, col] of [[0.75, 0.2, 0.4, 'rgba(192,77,255,0.25)'], [0.3, 0.8, 0.35, 'rgba(60,160,255,0.18)']] as [number, number, number, string][]) {
      const ng = g.createRadialGradient(w * x, h * y, 0, w * x, h * y, w * r); ng.addColorStop(0, col); ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng; g.fillRect(0, 0, w, h);
    }
    // the dying star Aurex
    const sx = w * 0.46, sy = h * 1.02, sr = Math.min(w, h) * 0.22;
    const sg = g.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 3);
    sg.addColorStop(0, 'rgba(255,220,150,0.95)'); sg.addColorStop(0.25, 'rgba(255,140,50,0.55)'); sg.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
    const core = g.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, 2, sx, sy, sr);
    core.addColorStop(0, '#fff6d0'); core.addColorStop(0.5, '#ffb347'); core.addColorStop(1, '#e8501c');
    g.fillStyle = core; g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
    // orbit rings
    g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = `rgba(255,190,120,${0.22 - i * 0.04})`;
      g.beginPath(); g.ellipse(sx, sy, sr * (2.2 + i * 0.9), sr * (1.6 + i * 0.75), -0.12, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
    }
    // floating arena under each node
    const nx = (mx: number) => 30 + (w - 60) * (mx / 100), ny = (my: number) => 36 + (h - 66) * (my / 100);
    STORY.forEach((st, i) => {
      const th = THEMES[stageById(st.rules.stageId).theme];
      const x = nx(st.map.x), y = ny(st.map.y) + 26;
      const big = i === STORY.length - 1 ? 1.35 : 1;
      const pw = 46 * big, ph = 22 * big;
      const lit = isStageUnlocked(i);
      g.globalAlpha = lit ? 1 : 0.5;
      const halo = g.createRadialGradient(x, y, 2, x, y, pw);
      halo.addColorStop(0, `${th.glow}55`); halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo; g.fillRect(x - pw, y - pw, pw * 2, pw * 2);
      g.fillStyle = '#05040c'; g.beginPath(); g.moveTo(x - pw / 2 - 2, y - 2); g.lineTo(x + pw / 2 + 2, y - 2); g.lineTo(x + 3, y + ph + 3); g.lineTo(x - 3, y + ph + 3); g.fill();
      const body = g.createLinearGradient(0, y, 0, y + ph);
      body.addColorStop(0, th.body1); body.addColorStop(1, th.body2);
      g.fillStyle = body; g.beginPath(); g.moveTo(x - pw / 2, y); g.lineTo(x + pw / 2, y); g.lineTo(x + 2, y + ph); g.lineTo(x - 2, y + ph); g.fill();
      g.fillStyle = th.top; g.fillRect(x - pw / 2, y - 2, pw, 4);
      const cleared = save.story.cleared[st.id];
      if (cleared) { g.fillStyle = shade('#ffd23f', 0); g.fillRect(x - pw / 2, y - 2, pw, 1.5); }
      g.globalAlpha = 1;
    });
  };
  requestAnimationFrame(paint);
  const ro = new ResizeObserver(() => paint());
  ro.observe(host);
}
