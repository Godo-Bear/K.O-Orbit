import type { Fighter } from '../sim/fighter';
import { ART_FRAMING, drawArt, getArt } from './art';

/**
 * Animate a fighter's illustrated artwork (single key-art sprite) with squash/stretch,
 * leans, flips, rolls, tumbles and attack lunges toward the active hitbox.
 */
export function drawSpriteFighter(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, t: number, flash: number, alpha: number) {
  const a = getArt(f.char.id)?.full;
  if (!a) return false;
  const fr = ART_FRAMING[f.char.id] ?? { height: 1.12, faces: 1 };
  const H = f.H * fr.height;
  const sf = f.stateFrame;
  let rot = 0, sx = 1, sy = 1, ox = 0, oy = 0;
  let pivotY = -H * 0.45; // rotate around the body centre
  switch (f.state) {
    case 'idle': case 'respawn': { const b = Math.sin(t * 0.06 + f.slot) * 0.014; sy = 1 + b; sx = 1 - b * 0.6; break; }
    case 'walk': { const ph = sf * 0.22; rot = 0.06; oy = -Math.abs(Math.sin(ph)) * 3; sy = 1 - Math.abs(Math.sin(ph)) * 0.02; break; }
    case 'run': case 'dash': { const ph = sf * 0.38; rot = 0.16; oy = -Math.abs(Math.sin(ph)) * 6; sy = 1 + Math.sin(ph * 2) * 0.03; sx = 1 - Math.sin(ph * 2) * 0.02; break; }
    case 'skid': rot = -0.14; sx = 1.04; sy = 0.96; break;
    case 'crouch': sy = 0.8; sx = 1.1; break;
    case 'jumpsquat': sy = 0.82; sx = 1.12; break;
    case 'land': { const k = Math.min(1, sf / Math.max(3, f.lagFrames)); sy = 0.86 + 0.14 * k; sx = 1.1 - 0.1 * k; break; }
    case 'air': case 'helpless': {
      if (f.vy < -4) { sy = 1.06; sx = 0.95; } else if (f.fastFall) { sy = 1.08; sx = 0.92; }
      if (f.state === 'air' && f.djAge < 20 && !f.tumble) rot = -(f.djAge / 20) * Math.PI * 2;
      if (f.tumble) rot = -sf * 0.3;
      if (f.state === 'helpless') { rot = Math.sin(t * 0.3) * 0.12; alpha *= 0.85; }
      rot += Math.max(-0.12, Math.min(0.12, f.vx * f.facing * 0.012));
      break;
    }
    case 'airdodge': rot = Math.sin(sf * 0.5) * 0.2; alpha *= sf > 2 && sf < 29 ? 0.55 : 1; break;
    case 'shield': case 'shieldstun': case 'shieldoff': sy = 0.94; sx = 1.03; break;
    case 'shieldbreak': rot = -sf * 0.2; break;
    case 'dizzy': rot = Math.sin(t * 0.1) * 0.16; break;
    case 'spotdodge': alpha *= sf > 2 && sf < 18 ? 0.45 : 1; sx = 0.92; break;
    case 'roll': case 'tech': case 'ledgeroll': rot = (sf / 26) * Math.PI * 2 * (f.state === 'roll' ? 1 : 1); sy = 0.82; pivotY = -H * 0.35; break;
    case 'hitstun': rot = f.tumble && !f.grounded ? -sf * 0.3 : -0.32; sx = 0.94; sy = 1.04; break;
    case 'knockdown': rot = -Math.PI / 2; oy = H * 0.3; break;
    case 'getup': rot = -Math.PI / 2 * Math.max(0, 1 - sf / 14); break;
    case 'ledge': rot = 0.22; oy = -H * 0.08; break;
    case 'ledgeclimb': sy = 0.84; break;
    case 'attack': {
      const m = f.move!;
      const mf = f.moveFrame;
      const hb = m.hitboxes.find((h) => mf >= h.s && mf <= h.e) ?? m.hitboxes[0];
      const s0 = hb ? hb.s : 8, e0 = m.hitboxes.reduce((v, h) => Math.max(v, h.e), hb ? hb.e : 14);
      let k = mf < s0 ? -(1 - mf / s0) : mf <= e0 ? 1 : Math.max(0, 1 - (mf - e0) / Math.max(6, (m.total - e0) * 0.7));
      if (f.charging) k = -1;
      const hx = hb ? hb.x : 40, hy = hb ? hb.y : -55;
      const up = hy < -95, down = hy > -25, back = hx < -20;
      if (m.limb === 'spin' && k > 0) rot = ((mf - s0) / Math.max(1, e0 - s0)) * Math.PI * 2;
      else if (k < 0) { // anticipation: pull back & squash
        rot = back ? 0.12 * -k : -0.14 * -k; sy = 1 + k * 0.08; sx = 1 - k * 0.05;
        ox = (back ? 6 : -6) * -k;
      } else { // strike: lunge & stretch toward the hitbox
        if (up) { sy = 1 + 0.14 * k; sx = 1 - 0.08 * k; rot = 0.05 * k; oy = -6 * k; }
        else if (down) { sy = 1 - 0.12 * k; sx = 1 + 0.1 * k; rot = f.grounded ? 0.1 * k : 0.25 * k; }
        else if (back) { rot = -0.24 * k; ox = -10 * k; sx = 1 + 0.06 * k; }
        else { rot = 0.2 * k; ox = 12 * k; sx = 1 + 0.1 * k; sy = 1 - 0.04 * k; }
      }
      break;
    }
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(f.facing * fr.faces, 1);
  ctx.translate(ox, oy);
  if (rot) { ctx.translate(0, pivotY); ctx.rotate(rot); ctx.translate(0, -pivotY); }
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  // soft contact shadow under the sprite
  drawArt(ctx, a, 0, 0, H, flash);
  ctx.restore();
  return true;
}
