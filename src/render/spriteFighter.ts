import type { Fighter } from '../sim/fighter';
import { ART_FRAMING, drawArt, drawArtRect, drawInkRect, getArt, type CharRig, type RigPart } from './art';
import { base, type Pose } from './rig';

/** Direction (radians from straight-down, + = forward) from a 2-segment limb's root to its tip. */
const limbDir = (a: [number, number]) => Math.atan2(Math.sin(a[0]) + Math.sin(a[0] + a[1]), Math.cos(a[0]) + Math.cos(a[0] + a[1]));
const IDLE = base();
const IDLE_DIR = { armF: limbDir(IDLE.armF), armB: limbDir(IDLE.armB), legF: limbDir(IDLE.legF), legB: limbDir(IDLE.legB) };

/** Attack progress: -1..0 wind-up, 1 = striking, decays to 0 in recovery. */
export function attackK(f: Fighter): number {
  const m = f.move;
  if (f.state !== 'attack' || !m) return 0;
  if (f.charging) return -1;
  const mf = f.moveFrame;
  const hb = m.hitboxes.find((h) => mf >= h.s && mf <= h.e) ?? m.hitboxes[0];
  const s0 = hb ? hb.s : 8, e0 = m.hitboxes.reduce((v, h) => Math.max(v, h.e), hb ? hb.e : 18);
  return mf < s0 ? -(1 - mf / s0) : mf <= e0 ? 1 : Math.max(0, 1 - (mf - e0) / Math.max(6, (m.total - e0) * 0.7));
}

/** Cut-out puppet: the user's art sliced into body + limbs, driven by the (spring-smoothed) skeleton pose. */
function drawPuppet(ctx: CanvasRenderingContext2D, rig: CharRig, f: Fighter, pose: Pose, H: number, flash: number) {
  const k = H / rig.h;
  ctx.scale(k, k);
  ctx.translate(-rig.w / 2, -rig.h);
  const legs = rig.parts.filter((p) => p.name.startsWith('leg'));
  const hip: [number, number] = legs.length ? [(legs[0].pivot[0] + legs[legs.length - 1].pivot[0]) / 2, (legs[0].pivot[1] + legs[legs.length - 1].pivot[1]) / 2] : [rig.w / 2, rig.h * 0.55];
  const ak = attackK(f);
  const limb = f.move?.limb ?? '';
  const airy = f.state === 'air' || f.state === 'helpless' || f.state === 'hitstun' || f.state === 'ledge' || f.state === 'airdodge';
  const rotOf = (p: RigPart) => {
    const ang = pose[p.name];
    const dir = limbDir(ang);
    const art = Math.atan2(p.end[0] - p.pivot[0], p.end[1] - p.pivot[1]);
    const striking = f.state === 'attack' && (limb === p.name || (limb === 'both' && p.name.startsWith('arm')));
    let w = 0;
    if (f.state === 'attack') w = Math.max(0, ak) * (striking ? 1 : 0.25);
    else if (airy) w = 0.45;
    else if (f.state === 'ledge') w = 0.8;
    return { rot: (dir - IDLE_DIR[p.name]) * (1 - w) + (dir - art) * w, pop: striking && ak >= 1 ? 1.07 : 1, thrust: striking ? Math.max(0, ak) : 0 };
  };
  const drawPart = (p: RigPart) => {
    const { rot, pop, thrust } = rotOf(p);
    ctx.save();
    ctx.translate(p.pivot[0], p.pivot[1]);
    ctx.rotate(-rot);
    if (thrust > 0) { // extend the striking limb along its own axis (a real thrust, not just a swing)
      const dx = p.end[0] - p.pivot[0], dy = p.end[1] - p.pivot[1];
      const e = thrust * 0.12;
      ctx.translate(dx * e, dy * e);
    }
    if (pop !== 1) ctx.scale(pop, pop);
    ctx.translate(-p.pivot[0], -p.pivot[1]);
    if (p.upper && p.lower && p.joint && p.offU && p.offL) {
      // two-piece limb: the lower segment bends at the elbow / knee from the skeleton's joint angle
      const bend = Math.max(-1.7, Math.min(1.7, (pose[p.name][1] - IDLE[p.name][1]) * 0.9));
      const [jx, jy] = p.joint, u = p.upper, l = p.lower, oU = p.offU, oL = p.offL;
      const lower = (fn: () => void) => { ctx.save(); ctx.translate(jx, jy); ctx.rotate(-bend); ctx.translate(-jx, -jy); fn(); ctx.restore(); };
      drawInkRect(ctx, u, oU[0], oU[1], u.w, u.h);
      lower(() => drawInkRect(ctx, l, oL[0], oL[1], l.w, l.h));
      drawArtRect(ctx, u, oU[0], oU[1], u.w, u.h, flash);
      lower(() => drawArtRect(ctx, l, oL[0], oL[1], l.w, l.h, flash));
    } else {
      drawInkRect(ctx, p.img, p.off[0], p.off[1], p.img.w, p.img.h);
      drawArtRect(ctx, p.img, p.off[0], p.off[1], p.img.w, p.img.h, flash);
    }
    ctx.restore();
  };
  const lean = () => { ctx.translate(hip[0], hip[1]); ctx.rotate(pose.lean * 0.8); ctx.translate(-hip[0], -hip[1]); };
  const part = (n: RigPart['name']) => rig.parts.find((p) => p.name === n);
  const legB = part('legB'), legF = part('legF'), armB = part('armB'), armF = part('armF');
  if (legB) drawPart(legB);
  ctx.save(); lean();
  if (armB) drawPart(armB);
  drawInkRect(ctx, rig.body, 0, 0, rig.body.w, rig.body.h);
  drawArtRect(ctx, rig.body, 0, 0, rig.body.w, rig.body.h, flash);
  ctx.restore();
  if (legF) drawPart(legF);
  ctx.save(); lean();
  if (armF) drawPart(armF);
  ctx.restore();
}

/**
 * Animate a fighter's illustrated artwork (single key-art sprite) with squash/stretch,
 * leans, flips, rolls, tumbles and attack lunges toward the active hitbox.
 */
export function drawSpriteFighter(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, t: number, flash: number, alpha: number, pose?: Pose) {
  const ca = getArt(f.char.id);
  const a = ca?.full;
  if (!a) return false;
  const rig = pose ? ca?.rig : undefined;
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
  if (rig) {
    if (f.state === 'attack') { rot *= 0.35; ox *= 0.6; }
    if (f.state === 'walk' || f.state === 'run' || f.state === 'dash') rot *= 0.5;
    if (f.state === 'ledge') rot = 0;
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(f.facing * fr.faces, 1);
  ctx.translate(ox, oy);
  if (rot) { ctx.translate(0, pivotY); ctx.rotate(rot); ctx.translate(0, -pivotY); }
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  // soft contact shadow under the sprite
  if (rig && pose) drawPuppet(ctx, rig, f, pose, H, flash);
  else drawArt(ctx, a, 0, 0, H, flash, 1, true);
  ctx.restore();
  return true;
}
