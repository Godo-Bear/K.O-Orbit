import type { Fighter } from '../sim/fighter';
import type { CharDef, MoveDef } from '../sim/types';

/** Procedural skeletal pose: angles measured from straight-down, + = toward facing. */
interface Pose {
  lean: number; rot: number; hipY: number;
  armF: [number, number]; armB: [number, number];
  legF: [number, number]; legB: [number, number];
  squash: number;
}

const base = (): Pose => ({ lean: 0, rot: 0, hipY: 0, armF: [0.3, 0.5], armB: [-0.25, 0.4], legF: [0.12, -0.1], legB: [-0.12, -0.05], squash: 1 });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const SHOULDER = { x: 0, y: -76 }, HIP = { x: 0, y: -45 };
const ARM = 21, LEG = 23;

function airPose(p: Pose, vy: number) {
  const rising = vy < 0;
  p.legF = rising ? [0.9, -1.3] : [0.4, -0.6];
  p.legB = rising ? [-0.1, -0.9] : [-0.25, -0.3];
  p.armF = rising ? [2.2, 0.4] : [1.0, 0.6];
  p.armB = rising ? [-0.8, 0.5] : [-0.9, 0.6];
}

function aimFor(m: MoveDef, limbRoot: { x: number; y: number }, mf: number) {
  const hbs = m.hitboxes;
  let h = hbs.find((b) => mf >= b.s && mf <= b.e) ?? hbs[0];
  if (!h) return { ang: Math.PI / 2, s: 8, e: 14 };
  const dx = h.x - limbRoot.x, dy = h.y - limbRoot.y;
  return { ang: Math.atan2(dx, dy), s: h.s, e: hbs.reduce((a, b) => Math.max(a, b.e), h.e) };
}

export function computePose(f: Fighter, t: number): Pose {
  const p = base();
  const sf = f.stateFrame;
  const breathe = Math.sin(t * 0.06 + f.slot) * 0.04;
  p.armF[0] += breathe; p.armB[0] -= breathe;
  switch (f.state) {
    case 'walk': case 'run': case 'dash': {
      const run = f.state !== 'walk';
      const ph = sf * (run ? 0.38 : 0.22);
      const amp = run ? 0.95 : 0.55;
      p.legF = [Math.sin(ph) * amp, -0.4 - Math.max(0, Math.cos(ph)) * 0.9];
      p.legB = [-Math.sin(ph) * amp, -0.4 - Math.max(0, -Math.cos(ph)) * 0.9];
      p.armF = [-Math.sin(ph) * amp * 0.9, 0.9]; p.armB = [Math.sin(ph) * amp * 0.9, 0.9];
      p.lean = run ? 0.28 : 0.08;
      p.hipY = Math.abs(Math.sin(ph)) * -3;
      break;
    }
    case 'skid': p.lean = -0.25; p.legF = [0.6, -0.2]; p.legB = [-0.1, -0.5]; p.armF = [1.2, 0.3]; p.armB = [-1, 0.3]; break;
    case 'crouch': case 'jumpsquat': case 'land':
      p.hipY = 16; p.legF = [1.1, -2.0]; p.legB = [0.3, -1.6]; p.lean = 0.25;
      p.squash = f.state === 'jumpsquat' ? 0.86 : f.state === 'land' ? 0.9 + Math.min(0.1, sf * 0.03) : 0.94;
      p.armF = [0.9, 0.9]; p.armB = [0.6, 1.0];
      break;
    case 'air': case 'helpless': case 'airdodge': case 'respawn':
      airPose(p, f.vy);
      if (f.state === 'air' && f.djAge < 20 && !f.tumble) { // double-jump flip
        const k = f.djAge / 20;
        p.rot = -k * Math.PI * 2 * (f.char.stats.jumps > 2 ? 1 : 0.999);
        p.legF = [1.6, -2.2]; p.legB = [1.2, -2.0]; p.armF = [1.4, 1.6]; p.armB = [1.0, 1.6];
      } else if (f.state === 'air' && f.fastFall) { p.legF = [0.15, -0.1]; p.legB = [-0.1, -0.1]; p.armF = [2.7, 0.2]; p.armB = [2.9, 0.2]; p.squash = 1.06; }
      if (f.state === 'helpless') { p.armF = [2.8, 0.2]; p.armB = [2.6, 0.2]; p.legF = [0.2, -0.3]; p.legB = [-0.2, -0.3]; }
      if (f.state === 'airdodge') p.rot = Math.sin(sf * 0.4) * 0.3;
      if (f.tumble) p.rot = sf * 0.35 * -f.facing;
      break;
    case 'shield': case 'shieldstun': case 'shieldoff':
      p.armF = [1.6, 1.2]; p.armB = [1.3, 1.4]; p.hipY = 6; p.legF = [0.4, -0.6]; p.legB = [-0.3, -0.4]; break;
    case 'dizzy': case 'shieldbreak':
      p.lean = Math.sin(t * 0.1) * 0.3; p.armF = [0.2, 0.2]; p.armB = [-0.2, 0.2]; p.rot = 0; break;
    case 'spotdodge': p.hipY = 10; p.lean = -0.3; break;
    case 'roll': case 'tech': case 'ledgeroll': p.rot = (sf / 26) * Math.PI * 2 * f.facing; p.hipY = 18; p.legF = [1.4, -2]; p.legB = [1.1, -2]; p.armF = [1.5, 1.5]; break;
    case 'hitstun':
      p.lean = -0.4; p.armF = [2.4, -0.4]; p.armB = [-2.0, -0.3]; p.legF = [0.7, -0.4]; p.legB = [-0.6, -0.2];
      if (f.tumble && !f.grounded) p.rot = sf * 0.3 * -f.facing;
      break;
    case 'knockdown': p.rot = -Math.PI / 2 * f.facing; p.hipY = -10; break;
    case 'getup': p.rot = -Math.PI / 2 * f.facing * Math.max(0, 1 - sf / 14); break;
    case 'ledge': p.armF = [2.7, 0]; p.armB = [2.5, 0]; p.legF = [0.15, -0.2]; p.legB = [-0.05, -0.3]; p.lean = 0.15; break;
    case 'ledgeclimb': p.hipY = 14; p.armF = [2, 0.5]; p.legF = [1.3, -1.8]; break;
    case 'attack': attackPose(f, p, t); break;
  }
  return p;
}

function attackPose(f: Fighter, p: Pose, _t: number) {
  const m = f.move!;
  const mf = f.moveFrame;
  if (!f.grounded) airPose(p, f.vy);
  const limb = m.limb ?? 'armF';
  const root = limb.startsWith('leg') ? HIP : SHOULDER;
  const aim = aimFor(m, root, mf);
  let k: number; // 0 = wind-up, 1 = full extension
  if (m.hitboxes.length === 0) { // projectile / utility move
    const s = 8, e = 18;
    k = mf < s ? mf / s : mf <= e ? 1 : Math.max(0, 1 - (mf - e) / 10);
    p.armF = [lerp(0.4, 1.65, k), lerp(1.4, 0.05, k)];
    if (m.counter || m.reflect) { p.armF = [1.7, 1.4]; p.armB = [1.5, 1.6]; p.hipY = 8; }
    return;
  }
  if (mf < aim.s) k = -(1 - mf / aim.s);
  else if (mf <= aim.e) k = 1;
  else k = Math.max(0, 1 - (mf - aim.e) / Math.max(6, (m.total - aim.e) * 0.7));
  if (f.charging) k = -1 + Math.sin(f.charge * 0.6) * 0.06;
  if (k < 0) p.squash = 1 + k * 0.06; // anticipation crouch
  else if (k === 1) p.squash = 1.04; // follow-through stretch
  const a = k >= 0 ? lerp(limb.startsWith('leg') ? 0.1 : 0.3, aim.ang, k) : aim.ang + k * 1.4 * (aim.ang > 0 ? 1 : -1);
  const ext: [number, number] = [a, k >= 0 ? lerp(0.6, 0.02, k) * (limb.startsWith('leg') ? -1 : 1) : 1.1];
  switch (limb) {
    case 'armF': p.armF = ext; p.lean = k * 0.25 * Math.cos(aim.ang); break;
    case 'armB': p.armB = ext; break;
    case 'legF': p.legF = ext; p.lean = -k * 0.2; if (f.grounded) p.legB = [-0.25, -0.1]; break;
    case 'legB': p.legB = ext; p.lean = k * 0.35; break;
    case 'both': p.armF = ext; p.armB = [-Math.abs(a) * Math.sign(a || 1), ext[1]]; if (aim.ang > 2) p.armB = [a - 0.4, 0.1]; p.legF = [0.8 * Math.max(0, k), -0.5]; p.legB = [-0.8 * Math.max(0, k), -0.5]; break;
    case 'body': p.lean = 0.6 * Math.max(0, k); p.armF = [2.0, 0.1]; p.armB = [-1.2, 0.3]; break;
    case 'spin': p.rot = Math.max(0, k) * ((mf - aim.s) / Math.max(1, aim.e - aim.s)) * Math.PI * 2 * f.facing; p.armF = [1.6, 0.1]; p.armB = [-1.6, 0.1]; p.legF = [0.8, -0.6]; p.legB = [-0.8, -0.6]; break;
  }
}

// ------------------------------------------------------------------ colour helpers
const shadeCache = new Map<string, string>();
/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. Cached. */
export function shade(hex: string, amt: number): string {
  const key = hex + amt;
  let v = shadeCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1, 7), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  v = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(key, v);
  return v;
}

export interface Motion { vx: number; vy: number; grounded: boolean }
const STILL: Motion = { vx: 0, vy: 0, grounded: true };

type Ctx = CanvasRenderingContext2D;

/** Tapered capsule path from a (radius r0) to b (radius r1). */
function capsule(ctx: Ctx, ax: number, ay: number, bx: number, by: number, r0: number, r1: number) {
  const ang = Math.atan2(by - ay, bx - ax);
  ctx.beginPath();
  ctx.arc(ax, ay, r0, ang + Math.PI / 2, ang + Math.PI * 1.5);
  ctx.arc(bx, by, r1, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}

interface LimbGeo { ox: number; oy: number; jx: number; jy: number; ex: number; ey: number; a1: number; a2: number }
function limbGeo(ox: number, oy: number, ang: [number, number], len: number): LimbGeo {
  const jx = ox + Math.sin(ang[0]) * len, jy = oy + Math.cos(ang[0]) * len;
  const a2 = ang[0] + ang[1];
  return { ox, oy, jx, jy, ex: jx + Math.sin(a2) * len, ey: jy + Math.cos(a2) * len, a1: ang[0], a2 };
}

const LIGHT_X = -0.45, LIGHT_Y = -0.9; // light from upper-left (local space)

/** Two-segment limb: outlines first (so joints merge), then fill, then cel highlight. */
function drawLimb(ctx: Ctx, g: LimbGeo, r0: number, r1: number, r2: number, col: string, outline: string, hi: string | null, joint: string | null, plate: string | null = null, crack: string | null = null) {
  ctx.fillStyle = outline;
  capsule(ctx, g.ox, g.oy, g.jx, g.jy, r0 + 2.4, r1 + 2.4); ctx.fill();
  capsule(ctx, g.jx, g.jy, g.ex, g.ey, r1 + 2.4, r2 + 2.4); ctx.fill();
  ctx.fillStyle = col;
  capsule(ctx, g.ox, g.oy, g.jx, g.jy, r0, r1); ctx.fill();
  capsule(ctx, g.jx, g.jy, g.ex, g.ey, r1, r2); ctx.fill();
  if (hi) {
    ctx.fillStyle = hi;
    const k = 0.42;
    capsule(ctx, g.ox + LIGHT_X * r0 * k, g.oy + LIGHT_Y * r0 * k, g.jx + LIGHT_X * r1 * k, g.jy + LIGHT_Y * r1 * k, r0 * 0.38, r1 * 0.38); ctx.fill();
    capsule(ctx, g.jx + LIGHT_X * r1 * k, g.jy + LIGHT_Y * r1 * k, g.ex + LIGHT_X * r2 * k, g.ey + LIGHT_Y * r2 * k, r1 * 0.36, r2 * 0.36); ctx.fill();
  }
  if (crack) { // glowing fissures along each segment
    ctx.strokeStyle = crack; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const [ax, ay, bx, by, r] of [[g.ox, g.oy, g.jx, g.jy, r0], [g.jx, g.jy, g.ex, g.ey, r1]] as number[][]) {
      const nx = -(by - ay), ny = bx - ax, L = Math.hypot(nx, ny) || 1;
      ctx.beginPath();
      ctx.moveTo(ax + (bx - ax) * 0.15 + (nx / L) * r * 0.5, ay + (by - ay) * 0.15 + (ny / L) * r * 0.5);
      ctx.lineTo(ax + (bx - ax) * 0.45 - (nx / L) * r * 0.25, ay + (by - ay) * 0.45 - (ny / L) * r * 0.25);
      ctx.lineTo(ax + (bx - ax) * 0.7 + (nx / L) * r * 0.35, ay + (by - ay) * 0.7 + (ny / L) * r * 0.35);
      ctx.stroke();
    }
  }
  if (plate) { // armour plate over the lower segment (shin / forearm)
    const p0x = g.jx + (g.ex - g.jx) * 0.12, p0y = g.jy + (g.ey - g.jy) * 0.12;
    const p1x = g.jx + (g.ex - g.jx) * 0.78, p1y = g.jy + (g.ey - g.jy) * 0.78;
    ctx.fillStyle = outline; capsule(ctx, p0x, p0y, p1x, p1y, r1 * 1.12 + 2.2, r2 * 1.12 + 2.2); ctx.fill();
    ctx.fillStyle = plate; capsule(ctx, p0x, p0y, p1x, p1y, r1 * 1.12, r2 * 1.12); ctx.fill();
    if (hi) { ctx.fillStyle = shade(plate.startsWith('#') ? plate : '#f2b51b', 0.45); capsule(ctx, p0x + LIGHT_X * r1 * 0.4, p0y + LIGHT_Y * r1 * 0.4, p1x + LIGHT_X * r2 * 0.4, p1y + LIGHT_Y * r2 * 0.4, r1 * 0.35, r2 * 0.35); ctx.fill(); }
  }
  if (joint) {
    ctx.fillStyle = outline; ctx.beginPath(); ctx.arc(g.jx, g.jy, r1 * 1.05 + 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = joint; ctx.beginPath(); ctx.arc(g.jx, g.jy, r1 * 1.05, 0, Math.PI * 2); ctx.fill();
    if (hi) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(g.jx - r1 * 0.3, g.jy - r1 * 0.35, r1 * 0.35, 0, Math.PI * 2); ctx.fill(); }
  }
}

function drawHand(ctx: Ctx, x: number, y: number, a: number, r: number, col: string, outline: string, hi: string | null) {
  ctx.fillStyle = outline; ctx.beginPath(); ctx.arc(x, y, r + 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  // thumb
  const tx = x + Math.cos(a) * r * 0.7, ty = y - Math.sin(a) * r * 0.7;
  ctx.fillStyle = outline; ctx.beginPath(); ctx.arc(tx, ty, r * 0.5 + 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(tx, ty, r * 0.5, 0, Math.PI * 2); ctx.fill();
  if (hi) { ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(x + LIGHT_X * r * 0.4, y + LIGHT_Y * r * 0.4, r * 0.38, 0, Math.PI * 2); ctx.fill(); }
}

function drawBoot(ctx: Ctx, g: LimbGeo, w: number, col: string, outline: string, hi: string | null, sole: string) {
  // foot points "forward" relative to the shin direction
  const dx = Math.sin(g.a2), dy = Math.cos(g.a2);
  const fx = dy, fy = -dx;
  ctx.save();
  ctx.translate(g.ex, g.ey);
  ctx.rotate(Math.atan2(fy, fx));
  const L = 15 * w, H = 7.5 * w;
  ctx.fillStyle = outline; roundRect(ctx, -6 * w - 2.4, -H / 2 - 2.4, L + 4.8, H + 4.8, H * 0.55 + 2); ctx.fill();
  ctx.fillStyle = col; roundRect(ctx, -6 * w, -H / 2, L, H, H * 0.55); ctx.fill();
  ctx.fillStyle = sole; ctx.fillRect(-6 * w + 1, H / 2 - 2.2, L - 2, 2.2);
  if (hi) { ctx.fillStyle = hi; roundRect(ctx, -3 * w, -H / 2 + 1.2, L * 0.55, H * 0.3, H * 0.15); ctx.fill(); }
  ctx.restore();
}

function emblem(ctx: Ctx, kind: string, x: number, y: number, r: number, col: string) {
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round';
  ctx.beginPath();
  switch (kind) {
    case 'star': for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r; const a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill(); break;
    case 'bolt': ctx.moveTo(x + r * 0.2, y - r); ctx.lineTo(x - r * 0.55, y + r * 0.1); ctx.lineTo(x - r * 0.02, y + r * 0.1); ctx.lineTo(x - r * 0.25, y + r); ctx.lineTo(x + r * 0.6, y - r * 0.15); ctx.lineTo(x + r * 0.05, y - r * 0.15); ctx.closePath(); ctx.fill(); break;
    case 'flame': ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + r, y - r * 0.1, x + r * 0.5, y + r * 0.8); ctx.quadraticCurveTo(x, y + r, x - r * 0.5, y + r * 0.8); ctx.quadraticCurveTo(x - r * 0.9, y, x, y - r); ctx.fill(); break;
    case 'snow': for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.stroke(); break;
    case 'crest': ctx.moveTo(x - r * 0.8, y - r * 0.8); ctx.lineTo(x + r * 0.8, y - r * 0.8); ctx.lineTo(x + r * 0.8, y); ctx.quadraticCurveTo(x + r * 0.7, y + r * 0.8, x, y + r); ctx.quadraticCurveTo(x - r * 0.7, y + r * 0.8, x - r * 0.8, y); ctx.closePath(); ctx.fill(); break;
    case 'gear': ctx.arc(x, y, r * 0.65, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; ctx.fillRect(x + Math.cos(a) * r * 0.75 - r * 0.18, y + Math.sin(a) * r * 0.75 - r * 0.18, r * 0.36, r * 0.36); } break;
    case 'wind': ctx.arc(x - r * 0.1, y, r * 0.7, Math.PI * 0.9, Math.PI * 2.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.5); ctx.lineTo(x + r * 0.4, y + r * 0.5); ctx.stroke(); break;
    case 'void': ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2); ctx.fill(); break;
  }
}

/**
 * Draw a fighter rig in local coordinates (feet at origin, facing right, ~100 units tall).
 * Cel-shaded tapered limbs, shaped torso, per-character costume, head gear and cloth physics.
 */
export type Expr = 'idle' | 'blink' | 'hurt' | 'fierce';
let EXPR: Expr = 'idle';

export function drawRig(ctx: Ctx, c: CharDef, pose: Pose, tint: string | null, outline: string, t: number, motion: Motion = STILL, expr: Expr = 'idle') {
  EXPR = expr;
  const v = c.visual;
  const bulk = v.bulk;
  const col = (x: string) => tint ?? x;
  const hiOf = (x: string) => (tint ? null : shade(x, 0.38));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const hipY = HIP.y + pose.hipY;
  ctx.save();
  ctx.translate(0, hipY); ctx.rotate(pose.lean); ctx.translate(0, -hipY);
  const shY = SHOULDER.y + pose.hipY;
  const sw = v.shoulder, ww = v.waist;
  const armR = 5.2 * bulk, legR = 6.4 * bulk;
  const fwd = Math.max(-1, Math.min(1, motion.vx / 9)); // >0 moving forward
  const rise = Math.max(-1, Math.min(1, -motion.vy / 14)); // >0 moving up

  // ---- cape / long cloth (behind everything)
  if (v.cape && v.accessory !== 'scarf') {
    const L = v.accessory === 'horns' ? 66 : 54;
    const sway = 0.18 + Math.max(0, fwd) * 0.9 + Math.max(0, -rise) * -0.15 + Math.max(0, rise) * 0.5;
    ctx.fillStyle = col(outline);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 5; i++) {
      const k = i / 5;
      const a = sway + Math.sin(t * 0.18 + k * 3) * 0.08 * (0.4 + Math.abs(fwd));
      const spread = -sw * 0.9 - k * 10;
      pts.push([spread - Math.sin(a) * L, shY + 2 + Math.cos(a) * L + Math.sin(t * 0.22 + k * 5) * 3]);
    }
    ctx.beginPath(); ctx.moveTo(-sw * 0.9, shY - 2); ctx.lineTo(sw * 0.35, shY - 2);
    ctx.lineTo(pts[0][0] + 22, pts[0][1] - 4);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.lineWidth = 5; ctx.strokeStyle = col(outline); ctx.stroke();
    ctx.fillStyle = col(shade(v.cape, -0.25)); ctx.fill();
    if (!tint) { ctx.fillStyle = shade(v.cape, 0.05); ctx.beginPath(); ctx.moveTo(-sw * 0.5, shY); ctx.lineTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[4][0] + 4, pts[4][1]); ctx.closePath(); ctx.fill(); }
  }
  // Nova jetpack
  if (v.accessory === 'visor') {
    ctx.fillStyle = col(outline); roundRect(ctx, -sw - 9, shY + 2, 13, 26, 4); ctx.fill();
    ctx.fillStyle = col('#c9d6ea'); roundRect(ctx, -sw - 7, shY + 4, 9, 22, 3); ctx.fill();
    ctx.fillStyle = col(v.accent); ctx.fillRect(-sw - 6, shY + 8, 7, 3);
    if (!motion.grounded && !tint) {
      const fl = 8 + Math.sin(t * 0.9) * 3 + Math.max(0, rise) * 10;
      ctx.fillStyle = 'rgba(127,227,255,0.85)'; ctx.beginPath(); ctx.moveTo(-sw - 6, shY + 26); ctx.lineTo(-sw - 2.5, shY + 26 + fl); ctx.lineTo(-sw + 1, shY + 26); ctx.fill();
    }
  }

  if (v.cracks) { // Granite: jagged rock plates on the back, licked by flame
    const rocks: [number, number, number][] = [[-sw - 2, shY - 2, 11], [-sw + 4, shY - 10, 9], [-sw - 6, shY + 10, 8]];
    for (const [x, y, r] of rocks) {
      if (!tint) { ctx.fillStyle = 'rgba(255,120,30,0.7)'; ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x - r * 1.6, y - r * (1.6 + Math.sin(t * 0.4 + x) * 0.3), x - r * 0.2, y - r * 2.2); ctx.lineTo(x, y); ctx.fill(); }
      ctx.fillStyle = col(outline); ctx.beginPath(); ctx.moveTo(x - r - 2, y + r * 0.6); ctx.lineTo(x - r * 0.5, y - r - 3); ctx.lineTo(x + r * 0.7, y - r * 0.6); ctx.lineTo(x + r * 0.8, y + r * 0.7); ctx.fill();
      ctx.fillStyle = col(shade(v.armor!, -0.15)); ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.5); ctx.lineTo(x - r * 0.5, y - r); ctx.lineTo(x + r * 0.6, y - r * 0.55); ctx.lineTo(x + r * 0.65, y + r * 0.6); ctx.fill();
    }
  }
  const legB = limbGeo(-2, hipY, pose.legB, LEG), legF = limbGeo(3, hipY, pose.legF, LEG);
  const armB = limbGeo(-sw * 0.55, shY + 3, pose.armB, ARM), armF = limbGeo(sw * 0.45, shY + 3, pose.armF, ARM);
  const backTone = (x: string) => col(shade(x, -0.28));

  const fist = armR * 1.18 * (v.fist ?? 1);
  const crack = !tint && v.cracks ? v.cracks : null;
  const kneeCol = (x: string | undefined) => (x ? col(x) : null);
  const legPlate = v.accessory === 'antenna' && v.armor ? v.armor : null; // Volt gold shin guards
  const armTone = v.bareTorso ? v.skin : v.body;

  // ---- back limbs
  drawLimb(ctx, legB, legR, legR * 0.82, legR * 0.62, backTone(v.dark), col(outline), null, v.armor && v.accessory !== 'shoulders' ? backTone(v.armor) : null, legPlate ? backTone(legPlate) : null, crack);
  drawBoot(ctx, legB, bulk, backTone(v.boot), col(outline), null, col(outline));
  drawLimb(ctx, armB, armR, armR * 0.85, armR * 0.7, backTone(armTone), col(outline), null, v.accessory === 'scarf' ? backTone(v.armor!) : null, null, crack);
  drawHand(ctx, armB.ex, armB.ey, armB.a2, fist, backTone(v.glove), col(outline), null);
  if (v.bareTorso && !tint) handFlame(ctx, armB.ex, armB.ey, fist, t + 7);

  // ---- scarf tails (behind torso)
  if (v.accessory === 'scarf') {
    const ang = 1.25 + Math.max(0, fwd) * 0.35 - rise * 0.25;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath(); ctx.moveTo(-4, shY + 1 + k * 3);
      for (let i = 1; i <= 9; i++) {
        const L = i * (7.5 + Math.abs(fwd) * 2.5);
        ctx.lineTo(-Math.sin(ang) * L, shY + 1 + k * 3 + Math.cos(ang) * L * 0.5 + Math.sin(t * 0.35 + i * 0.9 + k) * (1.5 + i * 0.6));
      }
      ctx.lineWidth = 10; ctx.strokeStyle = col(outline); ctx.stroke();
      ctx.lineWidth = 6.5; ctx.strokeStyle = col(k ? shade(v.cape!, -0.2) : v.cape!); ctx.stroke();
    }
  }

  // ---- torso
  const hipW = ww + 2.5 + (v.hips ?? 0);
  const torso = () => {
    ctx.beginPath();
    ctx.moveTo(-sw, shY + 2);
    ctx.quadraticCurveTo(-sw - 1, shY - 4, -sw + 5, shY - 4);
    ctx.lineTo(sw - 5, shY - 4);
    ctx.quadraticCurveTo(sw + 1, shY - 4, sw, shY + 2);
    ctx.quadraticCurveTo(sw - 1, shY + 16, ww, hipY - 10);
    ctx.lineTo(hipW, hipY + 2);
    ctx.quadraticCurveTo(0, hipY + 7, -hipW, hipY + 2);
    ctx.lineTo(-ww, hipY - 10);
    ctx.quadraticCurveTo(-sw + 1, shY + 16, -sw, shY + 2);
    ctx.closePath();
  };
  torso(); ctx.lineWidth = 5; ctx.strokeStyle = col(outline); ctx.stroke();
  ctx.fillStyle = col(v.body); ctx.fill();
  if (!tint) {
    ctx.save(); torso(); ctx.clip();
    ctx.fillStyle = shade(v.body, -0.3); ctx.fillRect(-sw - 4, shY - 6, sw * 0.75, hipY - shY + 14); // shadow side
    ctx.fillStyle = shade(v.body, 0.3); ctx.beginPath(); ctx.ellipse(sw * 0.25, shY + 4, sw * 0.55, 6, -0.2, 0, Math.PI * 2); ctx.fill(); // chest light
    if (v.bareTorso) { // pecs & abs
      ctx.strokeStyle = shade(v.skin, -0.35); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-sw * 0.6, shY + 11); ctx.quadraticCurveTo(-sw * 0.1, shY + 15, 0, shY + 10); ctx.quadraticCurveTo(sw * 0.15, shY + 15, sw * 0.7, shY + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, shY + 13); ctx.lineTo(0, hipY - 11); ctx.moveTo(-4, shY + 20); ctx.lineTo(4, shY + 20); ctx.moveTo(-4, shY + 25); ctx.lineTo(4, shY + 25); ctx.stroke();
    }
    if (v.accessory === 'scarf') { // side panels
      ctx.fillStyle = v.dark; ctx.beginPath(); ctx.moveTo(-sw, shY + 4); ctx.quadraticCurveTo(-sw * 0.3, shY + 18, -ww * 0.6, hipY); ctx.lineTo(-sw - 4, hipY); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sw, shY + 6); ctx.quadraticCurveTo(sw * 0.6, shY + 20, ww * 0.8, hipY); ctx.lineTo(sw + 4, hipY); ctx.fill();
    }
    if (v.cracks) { // magma fissures + rock plates
      ctx.strokeStyle = shade(v.body, -0.35); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-sw * 0.8, shY + 12); ctx.lineTo(sw * 0.8, shY + 12); ctx.moveTo(0, shY + 12); ctx.lineTo(0, hipY - 8); ctx.moveTo(-ww, shY + 22); ctx.lineTo(ww, shY + 22); ctx.stroke();
      ctx.strokeStyle = v.cracks; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-sw * 0.7, shY + 3); ctx.lineTo(-sw * 0.3, shY + 9); ctx.lineTo(-sw * 0.45, shY + 17); ctx.lineTo(-2, shY + 24);
      ctx.moveTo(sw * 0.75, shY + 5); ctx.lineTo(sw * 0.35, shY + 14); ctx.lineTo(sw * 0.5, shY + 22); ctx.lineTo(4, hipY - 10); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,120,0.8)'; ctx.lineWidth = 0.7; ctx.stroke();
    }
    ctx.fillStyle = v.dark; ctx.fillRect(-sw - 4, hipY - 4, sw * 2 + 8, 12); // shorts / hips
    ctx.restore();
    if (v.chestPlate && v.armor) { // gold chest plate with emblem (Volt)
      const pw = sw - 1, py0 = shY - 2, py1 = shY + 22;
      ctx.beginPath(); ctx.moveTo(-pw, py0 + 2); ctx.lineTo(pw, py0 + 2); ctx.lineTo(pw - 1, py1 - 6); ctx.lineTo(0, py1); ctx.lineTo(-pw + 1, py1 - 6); ctx.closePath();
      ctx.lineWidth = 4.5; ctx.strokeStyle = outline; ctx.stroke();
      ctx.fillStyle = v.armor; ctx.fill();
      ctx.fillStyle = shade(v.armor, -0.25); ctx.beginPath(); ctx.moveTo(-pw, py0 + 2); ctx.lineTo(-pw * 0.2, py0 + 2); ctx.lineTo(-pw * 0.1, py1 - 2); ctx.lineTo(-pw + 1, py1 - 6); ctx.fill();
      ctx.fillStyle = shade(v.armor, 0.5); ctx.fillRect(pw * 0.1, py0 + 3.5, pw * 0.7, 2);
      ctx.strokeStyle = shade(v.armor, -0.4); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, py0 + 3); ctx.lineTo(0, py1 - 2); ctx.stroke();
      emblem(ctx, 'bolt', sw * 0.15, shY + 10, 6.5, v.accent);
    } else if (!v.bareTorso && !v.cracks) emblem(ctx, v.emblem, sw * 0.18, shY + 13, 5.5, v.accent);
  }
  // belt
  if (!v.cracks) {
    const bh = v.bareTorso ? 6 : 4;
    ctx.fillStyle = col(outline); ctx.fillRect(-ww - 2 - (v.hips ?? 0), hipY - 9, (ww + (v.hips ?? 0)) * 2 + 4, bh + 2);
    ctx.fillStyle = col(v.accessory === 'antenna' && v.armor ? v.armor : v.accent); ctx.fillRect(-ww - 1 - (v.hips ?? 0), hipY - 8, (ww + (v.hips ?? 0)) * 2 + 2, bh);
    if (!tint) {
      if (v.bareTorso) { // Hearth Core buckle
        ctx.fillStyle = outline; ctx.beginPath(); ctx.arc(3, hipY - 5, 5.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(v.accent, 0.2); ctx.beginPath(); ctx.arc(3, hipY - 5, 4.4, 0, Math.PI * 2); ctx.fill();
        emblem(ctx, 'flame', 3, hipY - 5, 3.2, '#e8431c');
      } else { ctx.fillStyle = shade(v.accent, 0.4); ctx.fillRect(2, hipY - 8.5, 5, 5); }
    }
  }
  // armour / pauldrons
  if (v.accessory === 'shoulders' || v.accessory === 'sword' || v.accessory === 'horns' || v.accessory === 'antenna') {
    const pr = v.accessory === 'shoulders' ? 12.5 : v.accessory === 'antenna' ? 8.5 : 8;
    const pc = v.accessory === 'horns' ? v.dark : v.accessory === 'sword' ? '#9aa3b8' : v.armor ?? '#6a6f7c';
    for (const [x, dark] of [[-sw + 2, true], [sw - 2, false]] as [number, boolean][]) {
      ctx.fillStyle = col(outline); ctx.beginPath(); ctx.ellipse(x, shY + 1, pr + 2.4, pr * 0.8 + 2.4, 0, Math.PI, Math.PI * 2.0001); ctx.lineTo(x + pr + 2.4, shY + 5); ctx.lineTo(x - pr - 2.4, shY + 5); ctx.fill();
      ctx.fillStyle = col(dark ? shade(pc, -0.25) : pc); ctx.beginPath(); ctx.ellipse(x, shY + 1, pr, pr * 0.8, 0, Math.PI, Math.PI * 2.0001); ctx.lineTo(x + pr, shY + 3.5); ctx.lineTo(x - pr, shY + 3.5); ctx.fill();
      if (!tint) { ctx.fillStyle = shade(pc, 0.45); ctx.beginPath(); ctx.ellipse(x - 2, shY - 3, pr * 0.45, 2.2, -0.2, 0, Math.PI * 2); ctx.fill(); }
      if (v.accessory === 'horns') { ctx.fillStyle = col(v.accent); ctx.beginPath(); ctx.moveTo(x - 4, shY - pr * 0.6); ctx.lineTo(x, shY - pr * 0.6 - 9); ctx.lineTo(x + 4, shY - pr * 0.6); ctx.fill(); }
    }
  }

  // ---- neck & head
  const hx = 2, hy = shY - 15;
  ctx.fillStyle = col(outline); ctx.fillRect(hx - 6, shY - 9, 10, 10);
  ctx.fillStyle = col(shade(v.skin, -0.2)); ctx.fillRect(hx - 4, shY - 8, 6, 9);
  drawHead(ctx, v, hx, hy, col, tint, outline, t, fwd, rise);

  // ---- front limbs
  drawLimb(ctx, legF, legR, legR * 0.82, legR * 0.62, col(v.dark), col(outline), hiOf(v.dark), v.armor && v.accessory !== 'shoulders' ? kneeCol(v.armor) : null, legPlate ? col(legPlate) : null, crack);
  drawBoot(ctx, legF, bulk, col(v.boot), col(outline), hiOf(v.boot), col(shade(v.boot, -0.45)));
  drawLimb(ctx, armF, armR, armR * 0.85, armR * 0.7, col(armTone), col(outline), hiOf(armTone), v.accessory === 'scarf' ? kneeCol(v.armor) : null, null, crack);
  if (v.accessory === 'sword') drawSword(ctx, armF, col, tint, outline, v);
  drawHand(ctx, armF.ex, armF.ey, armF.a2, fist, col(v.glove), col(outline), hiOf(v.glove));
  if (v.bareTorso && !tint) handFlame(ctx, armF.ex, armF.ey, fist, t);
  if (crack) { ctx.strokeStyle = crack; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(armF.ex - fist * 0.6, armF.ey - fist * 0.2); ctx.lineTo(armF.ex, armF.ey + fist * 0.15); ctx.lineTo(armF.ex + fist * 0.3, armF.ey - fist * 0.5); ctx.stroke(); }
  if (v.accessory === 'antenna' && !tint) sparks(ctx, [[armF.ex, armF.ey], [armB.ex, armB.ey], [0, shY - 24]], t, v.glow);
  // glove cuffs
  if (!tint) {
    ctx.strokeStyle = v.accent; ctx.lineWidth = 2.5;
    const cx = armF.ex - Math.sin(armF.a2) * armR * 1.3, cy = armF.ey - Math.cos(armF.a2) * armR * 1.3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(armF.a2) * armR, cy - Math.sin(armF.a2) * armR); ctx.lineTo(cx - Math.cos(armF.a2) * armR, cy + Math.sin(armF.a2) * armR); ctx.stroke();
  }
  ctx.restore();
}

/** Flickering flame licking around a fist (Ember). */
function handFlame(ctx: Ctx, x: number, y: number, r: number, t: number) {
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.55;
    const h = r * (1.3 + Math.sin(t * 0.5 + i * 2.1) * 0.35);
    ctx.fillStyle = i % 2 ? 'rgba(255,214,80,0.85)' : 'rgba(255,110,30,0.85)';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a - 0.35) * r * 0.8, y + Math.sin(a - 0.35) * r * 0.8);
    ctx.quadraticCurveTo(x + Math.cos(a) * h * 1.1, y + Math.sin(a) * h * 1.1 - 2, x + Math.cos(a) * h * 1.35, y + Math.sin(a) * h * 1.35 - r * 0.6);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.2) * h, y + Math.sin(a + 0.2) * h, x + Math.cos(a + 0.35) * r * 0.8, y + Math.sin(a + 0.35) * r * 0.8);
    ctx.fill();
  }
}

/** Crackling electric arcs (Volt). Deterministic flicker from t. */
function sparks(ctx: Ctx, pts: number[][], t: number, col: string) {
  ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'miter';
  pts.forEach(([x, y], i) => {
    const ph = (t + i * 5) % 14;
    if (ph > 6) return;
    let px = x, py = y;
    const a0 = ((t * 2.7 + i * 1.9) % 6.28);
    ctx.strokeStyle = ph % 2 ? '#ffffff' : col;
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let k = 1; k <= 4; k++) {
      const a = a0 + Math.sin(t * 1.3 + k * 2.2) * 0.9;
      px += Math.cos(a) * 5; py += Math.sin(a) * 5;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
  ctx.lineJoin = 'round';
}

function drawSword(ctx: Ctx, arm: LimbGeo, col: (x: string) => string, tint: string | null, outline: string, v: CharDef['visual']) {
  const a = arm.a2;
  const dx = Math.sin(a), dy = Math.cos(a);
  const bx = arm.ex, by = arm.ey;
  const len = 70;
  const tx = bx + dx * len, ty = by + dy * len;
  const px = -dy, py = dx; // perpendicular
  // blade
  ctx.fillStyle = col(outline);
  ctx.beginPath(); ctx.moveTo(bx + px * 5.5, by + py * 5.5); ctx.lineTo(tx - dx * 6 + px * 4.8, ty - dy * 6 + py * 4.8); ctx.lineTo(tx + dx * 3, ty + dy * 3); ctx.lineTo(tx - dx * 6 - px * 4.8, ty - dy * 6 - py * 4.8); ctx.lineTo(bx - px * 5.5, by - py * 5.5); ctx.fill();
  ctx.fillStyle = col('#dfe8f8');
  ctx.beginPath(); ctx.moveTo(bx + px * 3.4, by + py * 3.4); ctx.lineTo(tx - dx * 6 + px * 2.8, ty - dy * 6 + py * 2.8); ctx.lineTo(tx, ty); ctx.lineTo(tx - dx * 6 - px * 2.8, ty - dy * 6 - py * 2.8); ctx.lineTo(bx - px * 3.4, by - py * 3.4); ctx.fill();
  if (!tint) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(bx + px * 1.2 + dx * 8, by + py * 1.2 + dy * 8); ctx.lineTo(tx - dx * 10 + px * 1, ty - dy * 10 + py * 1); ctx.stroke();
    ctx.strokeStyle = v.glow; ctx.globalAlpha *= 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx - px * 3 + dx * 6, by - py * 3 + dy * 6); ctx.lineTo(tx - dx * 8 - px * 2.4, ty - dy * 8 - py * 2.4); ctx.stroke(); ctx.globalAlpha /= 0.5;
  }
  // guard & pommel
  ctx.lineCap = 'round';
  ctx.strokeStyle = col(outline); ctx.lineWidth = 7.5;
  ctx.beginPath(); ctx.moveTo(bx + px * 11 + dx * 2, by + py * 11 + dy * 2); ctx.lineTo(bx - px * 11 + dx * 2, by - py * 11 + dy * 2); ctx.stroke();
  ctx.strokeStyle = col(v.accent); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(bx + px * 10 + dx * 2, by + py * 10 + dy * 2); ctx.lineTo(bx - px * 10 + dx * 2, by - py * 10 + dy * 2); ctx.stroke();
  ctx.fillStyle = col(v.accent); ctx.beginPath(); ctx.arc(bx - dx * 9, by - dy * 9, 3.2, 0, Math.PI * 2); ctx.fill();
}

function eye(ctx: Ctx, x: number, y: number, w: number, h: number, iris: string, tint: string | null, glow = false) {
  if (tint) return;
  if (EXPR === 'hurt') {
    ctx.strokeStyle = glow ? iris : '#0a0a12'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - w, y - h * 0.8); ctx.lineTo(x + w * 0.6, y); ctx.lineTo(x - w, y + h * 0.8); ctx.stroke();
    return;
  }
  if (EXPR === 'blink' && !glow) {
    ctx.strokeStyle = '#0a0a12'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - w, y + 0.5); ctx.quadraticCurveTo(x, y + h * 0.6, x + w, y + 0.5); ctx.stroke();
    return;
  }
  if (EXPR === 'fierce') h *= 0.72;
  if (glow) {
    ctx.fillStyle = iris; ctx.beginPath(); ctx.ellipse(x, y, w, h * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x + 0.6, y, w * 0.45, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    return;
  }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = iris; ctx.beginPath(); ctx.ellipse(x + w * 0.35, y + 0.3, w * 0.55, h * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a0a12'; ctx.beginPath(); ctx.arc(x + w * 0.45, y + 0.3, w * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + w * 0.2, y - h * 0.35, w * 0.2, 0, Math.PI * 2); ctx.fill();
}

function drawHead(ctx: Ctx, v: CharDef['visual'], hx: number, hy: number, col: (x: string) => string, tint: string | null, outline: string, t: number, fwd: number, rise: number) {
  const R = 12.5;
  const skinHi = tint ? null : shade(v.skin, 0.35);
  const baseHead = (rx = R, ry = R) => {
    ctx.fillStyle = col(outline); ctx.beginPath(); ctx.ellipse(hx, hy, rx + 2.4, ry + 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col(v.skin); ctx.beginPath(); ctx.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    if (!tint) { ctx.fillStyle = shade(v.skin, -0.22); ctx.beginPath(); ctx.ellipse(hx - rx * 0.35, hy + ry * 0.15, rx * 0.6, ry * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = skinHi!; ctx.beginPath(); ctx.ellipse(hx + rx * 0.2, hy - ry * 0.45, rx * 0.45, ry * 0.22, -0.3, 0, Math.PI * 2); ctx.fill(); }
  };
  const brow = (x: number, y: number, ang = 0.2) => { if (tint) return; if (EXPR === 'fierce') ang += 0.45; if (EXPR === 'hurt') ang -= 0.6; ctx.strokeStyle = shade(v.hair, -0.2); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 3.5, y - Math.sin(ang) * 2); ctx.lineTo(x + 3.5, y + Math.sin(ang) * 2); ctx.stroke(); };
  switch (v.accessory) {
    case 'visor': { // Nova — astronaut helmet
      ctx.fillStyle = col(outline); ctx.beginPath(); ctx.arc(hx, hy, R + 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col('#f4f7ff'); ctx.beginPath(); ctx.arc(hx, hy, R + 2, 0, Math.PI * 2); ctx.fill();
      if (!tint) { ctx.fillStyle = '#c4cde0'; ctx.beginPath(); ctx.arc(hx - 3, hy + 2, R + 1, Math.PI * 0.4, Math.PI * 1.4); ctx.fill(); }
      ctx.fillStyle = col(outline); roundRect(ctx, hx - 1, hy - 7.5, R + 3.5, 13, 6); ctx.fill();
      const g = tint ? tint : (() => { const gr = ctx.createLinearGradient(hx, hy - 7, hx, hy + 6); gr.addColorStop(0, '#bff6ff'); gr.addColorStop(0.5, v.accent); gr.addColorStop(1, '#2163b8'); return gr; })();
      ctx.fillStyle = g as any; roundRect(ctx, hx + 0.5, hy - 6, R + 1.5, 10, 5); ctx.fill();
      if (!tint) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(hx + 4, hy - 4.5, 5, 2); }
      ctx.fillStyle = col(v.accent); ctx.fillRect(hx - R - 3, hy - 2, 4, 6);
      ctx.strokeStyle = col(outline); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx - 4, hy - R - 2); ctx.lineTo(hx - 7, hy - R - 10); ctx.stroke();
      ctx.fillStyle = col(v.accent); ctx.beginPath(); ctx.arc(hx - 7, hy - R - 11, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'shoulders': { // Granite — rock block head, heavy brow, glowing eyes, magma seams
      const w = R + 1.5;
      ctx.fillStyle = col(outline);
      ctx.beginPath(); ctx.moveTo(hx - w - 2.4, hy - R - 1); ctx.lineTo(hx + w - 1, hy - R - 4.4); ctx.lineTo(hx + w + 3.4, hy - 2); ctx.lineTo(hx + w + 1.4, hy + R + 3.4); ctx.lineTo(hx - w + 1, hy + R + 4.4); ctx.lineTo(hx - w - 3.4, hy + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col(v.skin);
      ctx.beginPath(); ctx.moveTo(hx - w, hy - R + 1); ctx.lineTo(hx + w - 1.5, hy - R - 2); ctx.lineTo(hx + w + 1, hy - 2); ctx.lineTo(hx + w - 0.5, hy + R + 1); ctx.lineTo(hx - w + 2, hy + R + 2); ctx.lineTo(hx - w - 1, hy + 3); ctx.closePath(); ctx.fill();
      if (!tint) {
        ctx.fillStyle = shade(v.skin, -0.25); ctx.beginPath(); ctx.moveTo(hx - w - 1, hy + 3); ctx.lineTo(hx - w, hy - R + 1); ctx.lineTo(hx - 3, hy - R); ctx.lineTo(hx - 4, hy + R + 2); ctx.lineTo(hx - w + 2, hy + R + 2); ctx.fill();
        ctx.fillStyle = shade(v.skin, 0.25); ctx.fillRect(hx - 2, hy - R - 0.5, w - 1, 3);
        ctx.strokeStyle = shade(v.skin, -0.45); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx - 6, hy - R + 2); ctx.lineTo(hx - 3, hy - 6); ctx.moveTo(hx + 8, hy + 6); ctx.lineTo(hx + 4, hy + R); ctx.stroke();
        ctx.strokeStyle = v.cracks ?? '#ff7a1f'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hx - w + 1, hy - 2); ctx.lineTo(hx - 6, hy + 2); ctx.lineTo(hx - 7, hy + 8); ctx.stroke();
      }
      // heavy brow ridge
      const browA = EXPR === 'fierce' ? 0.25 : EXPR === 'hurt' ? -0.2 : 0.08;
      ctx.save(); ctx.translate(hx + 5, hy - 4); ctx.rotate(browA);
      ctx.fillStyle = col(outline); ctx.fillRect(-7, -3.2, 17, 5.4);
      ctx.fillStyle = col(shade(v.skin, 0.1)); ctx.fillRect(-6, -2.2, 15, 3.4);
      ctx.restore();
      if (!tint) {
        if (EXPR === 'hurt') { ctx.strokeStyle = v.eye; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(hx + 7, hy, 2.4, 0, Math.PI * 1.6); ctx.stroke(); }
        else { ctx.fillStyle = v.eye; ctx.beginPath(); ctx.ellipse(hx + 7, hy, 2.8, EXPR === 'blink' ? 0.6 : 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,225,74,0.35)'; ctx.beginPath(); ctx.arc(hx + 7, hy, 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = shade(v.skin, -0.5); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(hx + 3, hy + 7.5); ctx.lineTo(hx + 11, hy + (EXPR === 'fierce' ? 8.5 : 7)); ctx.stroke();
      }
      break;
    }
    case 'scarf': { // Zephyr — winged teal helmet, platinum hair, pink scarf
      // hair flowing behind
      ctx.fillStyle = col(outline);
      ctx.beginPath(); ctx.moveTo(hx - 4, hy - R); ctx.quadraticCurveTo(hx - R - 12 - fwd * 8, hy - 6, hx - R - 10 - fwd * 10, hy + 12 + Math.sin(t * 0.3) * 2); ctx.quadraticCurveTo(hx - R - 2, hy + 6, hx - 2, hy + 6); ctx.fill();
      ctx.fillStyle = col(v.hair);
      ctx.beginPath(); ctx.moveTo(hx - 4, hy - R + 2); ctx.quadraticCurveTo(hx - R - 9 - fwd * 8, hy - 5, hx - R - 8 - fwd * 10, hy + 10 + Math.sin(t * 0.3) * 2); ctx.quadraticCurveTo(hx - R, hy + 4, hx - 2, hy + 4); ctx.fill();
      baseHead(R - 0.5, R);
      // bangs
      ctx.fillStyle = col(v.hair);
      ctx.beginPath(); ctx.moveTo(hx - R + 1, hy - 3); ctx.lineTo(hx + 2, hy - 8); ctx.lineTo(hx + 1, hy - 2); ctx.lineTo(hx + 6, hy - 7); ctx.lineTo(hx + 7, hy - 3); ctx.lineTo(hx + R, hy - 6); ctx.lineTo(hx + R, hy - 9); ctx.lineTo(hx - R, hy - 8); ctx.fill();
      eye(ctx, hx + 6, hy - 0.5, 2.9, 3.2, v.eye, tint); brow(hx + 6, hy - 4.5, 0.15);
      if (!tint) { ctx.strokeStyle = shade(v.skin, -0.4); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + 5, hy + 6.5); ctx.lineTo(hx + 9, hy + (EXPR === 'fierce' ? 6 : 6.8)); ctx.stroke(); }
      // helmet shell
      ctx.fillStyle = col(outline); ctx.beginPath(); ctx.arc(hx, hy - 1, R + 3.4, Math.PI * 1.0, Math.PI * 2.02); ctx.lineTo(hx + R + 2, hy - 4); ctx.lineTo(hx - R - 3, hy - 2); ctx.fill();
      ctx.fillStyle = col(v.dark); ctx.beginPath(); ctx.arc(hx, hy - 1, R + 1.6, Math.PI * 1.0, Math.PI * 2.02); ctx.lineTo(hx + R, hy - 5.5); ctx.lineTo(hx - R - 1.5, hy - 3.5); ctx.fill();
      if (!tint) { ctx.fillStyle = v.body; ctx.beginPath(); ctx.ellipse(hx + 2, hy - R + 1, 6, 2.2, -0.2, 0, Math.PI * 2); ctx.fill(); }
      // silver wing
      const flap = Math.sin(t * 0.25) * 0.08 - fwd * 0.15;
      ctx.save(); ctx.translate(hx - 4, hy - R + 1); ctx.rotate(-0.5 + flap);
      for (const [c, o] of [[outline, 2.2], [v.accent, 0]] as [string, number][]) {
        ctx.fillStyle = col(c);
        ctx.beginPath(); ctx.moveTo(0, 2 + o); ctx.quadraticCurveTo(-6, -10 - o, -2, -17 - o); ctx.quadraticCurveTo(2, -10, 4 + o, -9 - o * 0.5); ctx.quadraticCurveTo(3, -5, 6 + o, -4); ctx.lineTo(5 + o, 2 + o); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // scarf collar
      ctx.fillStyle = col(outline); roundRect(ctx, hx - R + 1, hy + R - 3, R * 2 - 1, 8.5, 3.5); ctx.fill();
      ctx.fillStyle = col(v.cape!); roundRect(ctx, hx - R + 2.5, hy + R - 1.8, R * 2 - 4, 6, 3); ctx.fill();
      if (!tint) { ctx.fillStyle = shade(v.cape!, 0.35); ctx.fillRect(hx - 2, hy + R - 1, 8, 1.6); }
      break;
    }
    case 'antenna': { // Volt — spiky gold hair, sky-blue visor goggles
      baseHead();
      if (!tint) {
        ctx.strokeStyle = shade(v.skin, -0.45); ctx.lineWidth = 1.5;
        ctx.beginPath(); if (EXPR === 'fierce') { ctx.moveTo(hx + 4, hy + 7); ctx.lineTo(hx + 10.5, hy + 6.5); } else { ctx.moveTo(hx + 4.5, hy + 6.5); ctx.quadraticCurveTo(hx + 8, hy + 8.2, hx + 10.5, hy + 5.8); } ctx.stroke();
      }
      const sp = 9;
      const spikes = (grow: number, fill: string) => {
        ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(hx + R + grow * 0.2, hy - 1);
        for (let i = 0; i <= sp; i++) {
          const a = -0.05 - (i / sp) * Math.PI * 1.12;
          const len = (i % 2 ? 6 : 15 + (i === 4 ? 7 : i === 2 || i === 6 ? 4 : 0)) + grow + Math.sin(t * 0.5 + i) * (i % 2 ? 0 : 1);
          const sweep = i > 3 ? -fwd * 4 - 3 : 0;
          ctx.lineTo(hx + Math.cos(a) * (R + len) + sweep, hy + Math.sin(a) * (R + len) * 0.95);
          ctx.lineTo(hx + Math.cos(a - 0.2) * (R - 1), hy + Math.sin(a - 0.2) * (R - 1));
        }
        ctx.closePath(); ctx.fill();
      };
      spikes(2.6, col(outline)); spikes(0, col(v.hair));
      if (!tint) {
        ctx.fillStyle = shade(v.hair, 0.55); ctx.beginPath(); ctx.ellipse(hx + 3, hy - R - 3, 6, 2, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = shade(v.hair, -0.25); ctx.beginPath(); ctx.ellipse(hx - 6, hy - R + 1, 5, 2.4, 0.4, 0, Math.PI * 2); ctx.fill();
      }
      // visor goggles
      ctx.fillStyle = col(outline);
      ctx.beginPath(); ctx.moveTo(hx - R - 1, hy - 5); ctx.lineTo(hx + R + 2.5, hy - 6); ctx.lineTo(hx + R + 1.5, hy + 2); ctx.quadraticCurveTo(hx + 6, hy + 4, hx + 2, hy + 1); ctx.lineTo(hx - R - 1, hy + 1); ctx.closePath(); ctx.fill();
      const gg = tint ? tint : (() => { const g = ctx.createLinearGradient(hx, hy - 5, hx, hy + 2); g.addColorStop(0, '#e6fdff'); g.addColorStop(0.45, v.eye); g.addColorStop(1, '#2a9fd0'); return g; })();
      ctx.fillStyle = gg as any;
      ctx.beginPath(); ctx.moveTo(hx + 0.5, hy - 4.2); ctx.lineTo(hx + R + 1, hy - 4.8); ctx.lineTo(hx + R, hy + 0.6); ctx.quadraticCurveTo(hx + 6, hy + 2.4, hx + 2.5, hy - 0.2); ctx.closePath(); ctx.fill();
      if (!tint) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(hx + 4, hy - 3.5, 4, 1.3);
        if (EXPR === 'fierce') { ctx.fillStyle = 'rgba(160,240,255,0.5)'; ctx.beginPath(); ctx.arc(hx + 7, hy - 2, 5, 0, Math.PI * 2); ctx.fill(); }
      }
      if (!tint && (t >> 3) % 5 === 0) { ctx.strokeStyle = v.glow; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx - 8, hy - R - 12); ctx.lineTo(hx - 3, hy - R - 6); ctx.lineTo(hx - 7, hy - R - 4); ctx.lineTo(hx - 1, hy - R + 2); ctx.stroke(); }
      break;
    }
    case 'flame': { // Ember — towering flame hair, ember skin, golden eyes
      if (!tint) {
        const lean = -5 - fwd * 10 + rise * 4;
        for (let layer = 0; layer < 3; layer++) {
          const cols = ['#ff5a1a', '#ff9a2a', '#ffd84a'];
          const sc = 1 - layer * 0.28;
          ctx.fillStyle = cols[layer];
          ctx.beginPath(); ctx.moveTo(hx - R + 1, hy - 2);
          for (let i = 0; i < 6; i++) {
            const k = i / 5;
            const bx = hx - R + 2 + k * (R * 2 - 2);
            const h = (18 + Math.sin(t * 0.45 + i * 1.9 + layer) * 4 + (1 - Math.abs(k - 0.45) * 1.6) * 12) * sc;
            ctx.quadraticCurveTo(bx - 3 + lean * 0.3, hy - R - h * 0.55, bx + lean * (0.5 + k * 0.3), hy - R - h);
            ctx.quadraticCurveTo(bx + 1, hy - R - h * 0.35, bx + 4, hy - R + 4);
          }
          ctx.lineTo(hx + R, hy - 2); ctx.closePath(); ctx.fill();
        }
      }
      baseHead();
      ctx.fillStyle = col(v.hair); ctx.beginPath(); ctx.arc(hx, hy - 1, R + 0.6, Math.PI * 1.02, Math.PI * 1.98); ctx.lineTo(hx + R - 1, hy - 6); ctx.lineTo(hx + 4, hy - 8); ctx.lineTo(hx + 1, hy - 4); ctx.lineTo(hx - 5, hy - 7); ctx.lineTo(hx - R, hy); ctx.fill();
      if (!tint) { ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(hx + 4, hy - 8); ctx.lineTo(hx + 8, hy - 13); ctx.lineTo(hx + 7, hy - 6); ctx.fill(); }
      eye(ctx, hx + 6, hy, 3.1, 3.4, '#f2a20c', tint); brow(hx + 6, hy - 4.8, 0.45);
      if (!tint) {
        ctx.strokeStyle = shade(v.skin, -0.5); ctx.lineWidth = 1.5;
        ctx.beginPath(); if (EXPR === 'hurt') { ctx.ellipse(hx + 7, hy + 6.5, 2, 1.6, 0, 0, Math.PI * 2); } else { ctx.moveTo(hx + 3.5, hy + 5.5); ctx.quadraticCurveTo(hx + 7.5, hy + 8, hx + 10.5, hy + 4.5); } ctx.stroke();
        ctx.fillStyle = shade(v.skin, -0.2); ctx.beginPath(); ctx.ellipse(hx - 6, hy + 1, 2.4, 3.4, 0, 0, Math.PI * 2); ctx.fill(); // ear
      }
      break;
    }
    case 'crystal': { // Glacia — flowing hair & ice crown
      ctx.fillStyle = col(outline); ctx.beginPath(); ctx.moveTo(hx - R - 2, hy - 4); ctx.quadraticCurveTo(hx - R - 8 - fwd * 6, hy + 14, hx - R - 4 - fwd * 10, hy + 30); ctx.lineTo(hx - 2, hy + 14); ctx.fill();
      ctx.fillStyle = col(v.hair); ctx.beginPath(); ctx.moveTo(hx - R, hy - 4); ctx.quadraticCurveTo(hx - R - 6 - fwd * 6, hy + 14, hx - R - 2 - fwd * 10, hy + 27); ctx.lineTo(hx - 3, hy + 12); ctx.fill();
      baseHead();
      ctx.fillStyle = col(v.hair); ctx.beginPath(); ctx.arc(hx, hy - 1, R + 1, Math.PI * 0.95, Math.PI * 2); ctx.quadraticCurveTo(hx + 4, hy - 9, hx - 4, hy - 6); ctx.quadraticCurveTo(hx - 8, hy, hx - R - 1, hy + 4); ctx.fill();
      eye(ctx, hx + 6, hy, 3, 3.6, v.eye, tint); if (!tint) { ctx.strokeStyle = '#1d4d6e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + 3, hy - 3.5); ctx.lineTo(hx + 9.5, hy - 4); ctx.stroke(); }
      // crown
      for (let i = -2; i <= 2; i++) {
        const x = hx + i * 5, h = i === 0 ? 15 : Math.abs(i) === 1 ? 10 : 6;
        ctx.fillStyle = col(outline); ctx.beginPath(); ctx.moveTo(x - 4, hy - R + 3); ctx.lineTo(x, hy - R - h - 2); ctx.lineTo(x + 4, hy - R + 3); ctx.fill();
        ctx.fillStyle = col(i % 2 ? '#d8f4ff' : '#9fe3ff'); ctx.beginPath(); ctx.moveTo(x - 2.6, hy - R + 2); ctx.lineTo(x, hy - R - h); ctx.lineTo(x + 2.6, hy - R + 2); ctx.fill();
      }
      if (!tint) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(hx - 0.6, hy - R - 9, 1.2, 6); }
      break;
    }
    case 'sword': { // Rook — great helm with plume
      const pl = 0.6 + Math.max(0, fwd) * 0.7 + Math.max(0, -rise) * -0.3 + Math.max(0, rise) * 0.4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const L = 26 - i * 2;
        ctx.strokeStyle = col(i === 0 ? outline : i % 2 ? shade(v.hair, -0.2) : v.hair); ctx.lineWidth = i === 0 ? 10 : 6 - i * 0.6;
        ctx.beginPath(); ctx.moveTo(hx + 1, hy - R - 2);
        ctx.quadraticCurveTo(hx - 6, hy - R - 14 + i, hx - Math.sin(pl) * L - 4, hy - R - 6 + Math.cos(pl) * L * 0.6 + i * 2 + Math.sin(t * 0.3 + i) * 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = col(outline); ctx.beginPath(); ctx.moveTo(hx - R - 2.4, hy + R + 2); ctx.lineTo(hx - R - 2.4, hy - 3); ctx.quadraticCurveTo(hx - R, hy - R - 4.4, hx + 2, hy - R - 4.4); ctx.quadraticCurveTo(hx + R + 4, hy - R, hx + R + 3, hy + 2); ctx.lineTo(hx + R + 1, hy + R + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col('#aab2c5'); ctx.beginPath(); ctx.moveTo(hx - R, hy + R); ctx.lineTo(hx - R, hy - 3); ctx.quadraticCurveTo(hx - R + 2, hy - R - 2, hx + 2, hy - R - 2); ctx.quadraticCurveTo(hx + R + 2, hy - R, hx + R + 0.8, hy + 2); ctx.lineTo(hx + R - 1, hy + R); ctx.closePath(); ctx.fill();
      if (!tint) { ctx.fillStyle = '#7e869a'; ctx.fillRect(hx - R, hy, R * 0.9, R); ctx.fillStyle = '#e6ebf5'; ctx.fillRect(hx - 2, hy - R + 1, 4, R * 2 - 3); }
      ctx.fillStyle = col('#11131a'); roundRect(ctx, hx + 1, hy - 3, R + 1, 4, 1.5); ctx.fill();
      if (!tint) { ctx.fillStyle = v.eye; ctx.fillRect(hx + 6, hy - 2.2, 3, 2.2); }
      ctx.fillStyle = col('#11131a'); for (let i = 0; i < 3; i++) ctx.fillRect(hx + 4 + i * 3, hy + 3.5, 1.6, 5);
      break;
    }
    case 'horns': { // Omega — void sovereign
      if (!tint) { const g = ctx.createRadialGradient(hx, hy, 2, hx, hy, R * 2.4); g.addColorStop(0, 'rgba(192,77,255,0.45)'); g.addColorStop(1, 'rgba(192,77,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, R * 2.4, 0, Math.PI * 2); ctx.fill(); }
      for (const s of [-1, 1]) {
        const bx = hx + s * 6;
        ctx.fillStyle = col(outline); ctx.beginPath(); ctx.moveTo(bx - 4.5, hy - R + 4); ctx.quadraticCurveTo(bx + s * 16, hy - R - 6, bx + s * 8, hy - R - 26); ctx.quadraticCurveTo(bx + s * 6, hy - R - 8, bx + 4.5 * s * -1 + s * 9, hy - R + 4); ctx.fill();
        ctx.fillStyle = col(v.accent); ctx.beginPath(); ctx.moveTo(bx - 2.5, hy - R + 3); ctx.quadraticCurveTo(bx + s * 13, hy - R - 6, bx + s * 8, hy - R - 22); ctx.quadraticCurveTo(bx + s * 5, hy - R - 8, bx + s * 6.5, hy - R + 3); ctx.fill();
      }
      ctx.fillStyle = col(outline); ctx.beginPath(); ctx.moveTo(hx - R - 2.4, hy - 2); ctx.quadraticCurveTo(hx - R, hy - R - 3.4, hx, hy - R - 3.4); ctx.quadraticCurveTo(hx + R + 3, hy - R, hx + R + 2.4, hy); ctx.lineTo(hx + 5, hy + R + 6); ctx.lineTo(hx - R + 2, hy + R + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col(v.skin); ctx.beginPath(); ctx.moveTo(hx - R, hy - 2); ctx.quadraticCurveTo(hx - R + 1, hy - R - 1, hx, hy - R - 1); ctx.quadraticCurveTo(hx + R + 1, hy - R + 1, hx + R, hy); ctx.lineTo(hx + 4.5, hy + R + 3.5); ctx.lineTo(hx - R + 3, hy + R); ctx.closePath(); ctx.fill();
      if (!tint) { ctx.fillStyle = '#5f4d78'; ctx.beginPath(); ctx.moveTo(hx - R, hy - 2); ctx.lineTo(hx - 2, hy + R + 2); ctx.lineTo(hx - R + 3, hy + R); ctx.fill(); }
      eye(ctx, hx + 6, hy - 1, 3.6, 2.6, v.eye, tint, true);
      if (!tint) { ctx.strokeStyle = v.eye; ctx.globalAlpha *= 0.6; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx + 4, hy + 1.5); ctx.lineTo(hx + 2, hy + 7); ctx.stroke(); ctx.globalAlpha /= 0.6; }
      break;
    }
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw a character's head & shoulders as a portrait. (x = center, y = top, size = framing width) */
export function drawPortrait(ctx: CanvasRenderingContext2D, c: CharDef, x: number, y: number, size: number, t = 0) {
  ctx.save();
  const s = size / 80;
  ctx.translate(x, y + 114 * s);
  ctx.scale(s, s);
  const pose = base();
  pose.armF = [0.5, 0.8]; pose.armB = [-0.3, 0.6];
  drawRig(ctx, c, pose, null, '#0b0b14', t);
  ctx.restore();
}

/** Signature victory / select-screen pose for each fighter. */
export function heroPose(c: CharDef): Pose {
  const p = base();
  p.legF = [0.38, -0.12]; p.legB = [-0.32, -0.05];
  switch (c.visual.accessory) {
    case 'visor': p.armF = [1.62, 0.05]; p.armB = [-0.5, 0.9]; p.lean = 0.05; break;
    case 'shoulders': p.armF = [0.75, 0.9]; p.armB = [-0.55, 0.9]; p.legF = [0.5, -0.15]; p.legB = [-0.5, 0.05]; p.lean = 0.1; break;
    case 'scarf': p.armF = [1.3, 0.35]; p.armB = [-1.5, 0.2]; p.legF = [1.05, -1.5]; p.legB = [-0.7, -0.7]; p.lean = 0.3; p.hipY = 9; break;
    case 'antenna': p.armF = [0.55, 1.55]; p.armB = [-0.45, 1.6]; p.legF = [0.42, -0.1]; p.legB = [-0.42, 0]; break;
    case 'flame': p.armF = [1.1, 1.75]; p.armB = [0.7, 1.95]; p.lean = 0.1; p.legF = [0.55, -0.4]; break;
    case 'crystal': p.armF = [1.85, -0.25]; p.armB = [-0.35, 0.9]; p.legF = [0.15, -0.05]; p.legB = [-0.05, -0.25]; break;
    case 'sword': p.armF = [2.75, 0.35]; p.armB = [0.9, 1.3]; p.legF = [0.5, -0.2]; p.legB = [-0.45, 0]; break;
    case 'horns': p.armF = [2.0, 0.55]; p.armB = [-2.0, -0.55]; p.hipY = -4; p.legF = [0.2, -0.35]; p.legB = [-0.1, -0.5]; break;
  }
  return p;
}

/** Character card art: themed backdrop + full-body hero pose. w×h in CSS px. */
export function drawHeroCard(ctx: CanvasRenderingContext2D, c: CharDef, w: number, h: number, t = 0, bg = true) {
  const v = c.visual;
  if (bg) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 2, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, shade(v.glow, -0.05)); g.addColorStop(0.45, shade(v.body, -0.35)); g.addColorStop(1, shade(v.dark, -0.55));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.globalAlpha = 0.16; ctx.translate(w * 0.5, h * 0.45);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, w * 0.012);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + t * 0.002; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.12, Math.sin(a) * w * 0.12); ctx.lineTo(Math.cos(a) * w, Math.sin(a) * w); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.22; emblem(ctx, v.emblem, w * 0.78, h * 0.2, w * 0.13, '#ffffff'); ctx.restore();
    // floor glow
    const fg = ctx.createRadialGradient(w / 2, h * 0.93, 1, w / 2, h * 0.93, w * 0.45);
    fg.addColorStop(0, 'rgba(255,255,255,0.35)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, h * 0.75, w, h * 0.25);
  }
  const s = (h * 0.8) / (128 * Math.max(1, c.stats.size * 0.95));
  ctx.save();
  ctx.translate(w / 2, h * 0.93);
  ctx.scale(s, s);
  drawRig(ctx, c, heroPose(c), null, '#0b0b14', t, { vx: 2, vy: 0, grounded: true }, 'fierce');
  ctx.restore();
}
