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
      p.hipY = 16; p.legF = [1.1, -2.0]; p.legB = [0.3, -1.6]; p.lean = 0.25; p.squash = 0.92; break;
    case 'air': case 'helpless': case 'airdodge': case 'respawn':
      airPose(p, f.vy);
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

/** Draw a fighter rig in local coordinates (feet at origin, facing right). */
export function drawRig(ctx: CanvasRenderingContext2D, c: CharDef, pose: Pose, tint: string | null, outline: string, t: number) {
  const v = c.visual;
  const bulk = v.bulk;
  const limbW = 9 * bulk;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const hipY = HIP.y + pose.hipY;
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(pose.lean);
  ctx.translate(0, -hipY);
  const sh = { x: 0, y: SHOULDER.y + pose.hipY };
  const hp = { x: 0, y: hipY };

  const seg = (o: { x: number; y: number }, ang: [number, number], len: number) => {
    const ex = o.x + Math.sin(ang[0]) * len, ey = o.y + Math.cos(ang[0]) * len;
    const a2 = ang[0] + ang[1];
    const hx = ex + Math.sin(a2) * len, hy = ey + Math.cos(a2) * len;
    return { ex, ey, hx, hy, a2 };
  };
  const limb = (o: { x: number; y: number }, ang: [number, number], len: number, col: string, w: number, endCol?: string) => {
    const s = seg(o, ang, len);
    ctx.strokeStyle = outline; ctx.lineWidth = w + 5;
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(s.ex, s.ey); ctx.lineTo(s.hx, s.hy); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(s.ex, s.ey); ctx.lineTo(s.hx, s.hy); ctx.stroke();
    if (endCol) { ctx.fillStyle = endCol; ctx.beginPath(); ctx.arc(s.hx, s.hy, w * 0.62, 0, Math.PI * 2); ctx.fill(); }
    return s;
  };
  const col = (x: string) => tint ?? x;

  // back limbs
  limb(hp, pose.legB, LEG, col(v.dark), limbW * 1.1, col(v.dark));
  const armBack = limb(sh, pose.armB, ARM, col(v.dark), limbW * 0.9, col(v.skin));
  if (v.accessory === 'scarf') {
    ctx.strokeStyle = col(v.accent); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-2, sh.y + 4);
    for (let i = 1; i <= 4; i++) ctx.lineTo(-i * 11, sh.y + 4 + Math.sin(t * 0.25 + i) * 5 + i * 2);
    ctx.stroke();
  }
  void armBack;
  // torso
  const tw = 15 * bulk + (v.accessory === 'shoulders' ? 4 : 0);
  ctx.fillStyle = outline;
  roundRect(ctx, -tw - 2.5, sh.y - 4.5, tw * 2 + 5, hp.y - sh.y + 9, 9);
  ctx.fill();
  const grd = ctx.createLinearGradient(0, sh.y, 0, hp.y);
  grd.addColorStop(0, col(v.body)); grd.addColorStop(1, col(v.dark));
  ctx.fillStyle = grd;
  roundRect(ctx, -tw, sh.y - 2, tw * 2, hp.y - sh.y + 4, 7);
  ctx.fill();
  ctx.fillStyle = col(v.accent);
  ctx.fillRect(-tw + 2, hp.y - 8, tw * 2 - 4, 4); // belt
  if (v.accessory === 'shoulders') {
    ctx.fillStyle = col(v.accent);
    ctx.beginPath(); ctx.arc(-tw + 2, sh.y + 2, 9, 0, Math.PI * 2); ctx.arc(tw - 2, sh.y + 2, 9, 0, Math.PI * 2); ctx.fill();
  }
  // head
  const hx = 2, hy = sh.y - 15;
  const hr = 13 * (v.head === 'square' ? 1.05 : 1);
  ctx.fillStyle = outline;
  ctx.beginPath(); ctx.arc(hx, hy, hr + 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col(v.skin);
  if (v.head === 'square') { roundRect(ctx, hx - hr, hy - hr, hr * 2, hr * 2, 5); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill(); }
  // headgear
  ctx.fillStyle = col(v.body);
  if (v.head === 'helmet') { ctx.beginPath(); ctx.arc(hx, hy - 1, hr + 1, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); ctx.fillRect(hx - hr - 1, hy - 3, 6, 10); }
  if (v.head === 'spiky') {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = Math.PI * (1.1 + i * 0.2); ctx.moveTo(hx + Math.cos(a - 0.15) * hr, hy + Math.sin(a - 0.15) * hr); ctx.lineTo(hx + Math.cos(a) * (hr + 11), hy + Math.sin(a) * (hr + 11)); ctx.lineTo(hx + Math.cos(a + 0.15) * hr, hy + Math.sin(a + 0.15) * hr); }
    ctx.fill();
  }
  // eye / visor
  ctx.fillStyle = v.accessory === 'visor' ? col(v.accent) : '#111';
  if (v.accessory === 'visor') { roundRect(ctx, hx + 1, hy - 5, hr - 1, 7, 3); ctx.fill(); }
  else { ctx.beginPath(); ctx.ellipse(hx + 6, hy - 1, 2.2, 3.4, 0, 0, Math.PI * 2); ctx.fill(); }
  // accessories
  switch (v.accessory) {
    case 'antenna':
      ctx.strokeStyle = col(v.accent); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hx - 3, hy - hr); ctx.lineTo(hx - 8, hy - hr - 14); ctx.lineTo(hx - 2, hy - hr - 18); ctx.lineTo(hx - 7, hy - hr - 28); ctx.stroke();
      break;
    case 'flame':
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? '#ffcf3a' : '#ff6a1a';
        const fl = 10 + Math.sin(t * 0.4 + i * 1.7) * 4;
        ctx.beginPath(); ctx.moveTo(hx - 10 + i * 5, hy - hr + 4); ctx.lineTo(hx - 13 + i * 5, hy - hr - fl); ctx.lineTo(hx - 4 + i * 5, hy - hr + 2); ctx.fill();
      }
      break;
    case 'crystal':
      ctx.fillStyle = col(v.accent);
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(hx + i * 7 - 4, hy - hr + 2); ctx.lineTo(hx + i * 7, hy - hr - 12 + Math.abs(i) * 4); ctx.lineTo(hx + i * 7 + 4, hy - hr + 2); ctx.fill(); }
      break;
    case 'horns':
      ctx.fillStyle = col(v.accent);
      ctx.beginPath(); ctx.moveTo(hx - 8, hy - hr + 3); ctx.quadraticCurveTo(hx - 20, hy - hr - 8, hx - 10, hy - hr - 20); ctx.lineTo(hx - 4, hy - hr + 1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hx + 6, hy - hr + 3); ctx.quadraticCurveTo(hx + 18, hy - hr - 8, hx + 10, hy - hr - 20); ctx.lineTo(hx + 2, hy - hr + 1); ctx.fill();
      break;
  }
  // front limbs
  limb(hp, pose.legF, LEG, col(v.body), limbW * 1.1, col(v.dark));
  const armFront = limb(sh, pose.armF, ARM, col(v.body), limbW * 0.9, col(v.skin));
  if (v.accessory === 'sword') {
    const a = armFront.a2;
    const bx = armFront.hx, by = armFront.hy;
    const ex = bx + Math.sin(a) * 66, ey = by + Math.cos(a) * 66;
    ctx.strokeStyle = outline; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#e8f0ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = col(v.accent); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * 9, by - Math.sin(a) * 9); ctx.lineTo(bx - Math.cos(a) * 9, by + Math.sin(a) * 9); ctx.stroke();
  }
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
