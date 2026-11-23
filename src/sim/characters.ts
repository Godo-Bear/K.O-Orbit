import type { CharDef, CharStats, CharVisual, Fx, Hitbox, MoveDef } from './types';
import type { Fighter } from './fighter';
import type { World } from './world';

// ---------------------------------------------------------------- helpers
const hb = (s: number, e: number, x: number, y: number, r: number, dmg: number, ang: number, bkb: number, kbg: number, extra: Partial<Hitbox> = {}): Hitbox =>
  ({ s, e, x, y, r, dmg, ang, bkb, kbg, ...extra });

interface Arch { reach: number; power: number; speed: number; fx: Fx; sword?: boolean }

/** Build the 13 normal attacks + ledge/getup attacks from an archetype. */
function normals(a: Arch): Record<string, MoveDef> {
  const R = a.reach, P = a.power;
  const t = (n: number) => Math.max(1, Math.round(n / a.speed));
  const fx = a.sword ? 'slash' : 'hit';
  const d = (n: number) => Math.round(n * P * 10) / 10;
  return {
    jab: { id: 'jab', name: 'Jab', total: t(16), limb: 'armF', hitboxes: [hb(t(3), t(5), 40 * R, -56, 20 * R, d(3), 18, 14, 30, { fx })] },
    ftilt: { id: 'ftilt', name: 'Forward Tilt', total: t(28), limb: a.sword ? 'armF' : 'legF', hitboxes: [hb(t(7), t(10), 55 * R, -48, 20 * R, d(9), 35, 26, 92, { fx }), hb(t(7), t(10), 25 * R, -48, 16, d(7), 35, 20, 85, { fx })] },
    utilt: { id: 'utilt', name: 'Up Tilt', total: t(28), limb: 'armF', hitboxes: [hb(t(6), t(11), 12 * R, -112, 26 * R, d(7.5), 88, 32, 102, { fx }), hb(t(6), t(8), 35, -80, 20, d(6), 95, 30, 100, { fx })] },
    dtilt: { id: 'dtilt', name: 'Down Tilt', total: t(22), limb: 'legF', hitboxes: [hb(t(5), t(8), 55 * R, -14, 18 * R, d(6), 76, 36, 62, { fx })] },
    dash: { id: 'dash', name: 'Dash Attack', total: t(36), limb: 'legF', slide: true, hitboxes: [hb(t(6), t(10), 38 * R, -45, 26 * R, d(10), 52, 52, 72, { fx }), hb(t(11), t(16), 38 * R, -45, 22 * R, d(6), 60, 40, 60, { fx })] },
    fsmash: { id: 'fsmash', name: 'Forward Smash', total: t(52), charge: t(8), limb: a.sword ? 'armF' : 'armF', hitboxes: [hb(t(15), t(18), 66 * R, -54, 26 * R, d(16), 38, 40, 101, { fx, lag: 1.2 }), hb(t(15), t(18), 32, -54, 20, d(13), 38, 36, 98, { fx })] },
    usmash: { id: 'usmash', name: 'Up Smash', total: t(48), charge: t(6), limb: 'armF', hitboxes: [hb(t(12), t(17), 0, -128 * R, 32 * R, d(15), 88, 36, 100, { fx, lag: 1.2 }), hb(t(10), t(12), 30, -60, 26, d(10), 100, 50, 70, { fx, g: 1 })] },
    dsmash: { id: 'dsmash', name: 'Down Smash', total: t(46), charge: t(5), limb: 'both', hitboxes: [hb(t(12), t(14), 56 * R, -14, 24 * R, d(14), 28, 32, 96, { fx }), hb(t(12), t(14), -56 * R, -14, 24 * R, d(14), 152, 32, 96, { fx }), hb(t(17), t(19), -60 * R, -14, 22 * R, d(12), 152, 30, 94, { fx, g: 1 })] },
    nair: { id: 'nair', name: 'Neutral Air', total: t(36), air: true, landingLag: 8, limb: 'spin', hitboxes: [hb(t(6), t(10), 0, -50, 42 * R, d(8.5), 40, 22, 92, { fx }), hb(t(11), t(22), 0, -50, 36 * R, d(5), 40, 15, 80, { fx })] },
    fair: { id: 'fair', name: 'Forward Air', total: t(38), air: true, landingLag: 12, limb: a.sword ? 'armF' : 'armF', hitboxes: [hb(t(9), t(12), 54 * R, -56, 26 * R, d(12), 40, 30, 96, { fx, lag: 1.1 })] },
    bair: { id: 'bair', name: 'Back Air', total: t(34), air: true, landingLag: 10, limb: 'legB', hitboxes: [hb(t(7), t(10), -56 * R, -50, 24 * R, d(13), 142, 30, 100, { fx, lag: 1.1 })] },
    uair: { id: 'uair', name: 'Up Air', total: t(32), air: true, landingLag: 8, limb: 'armF', hitboxes: [hb(t(5), t(9), 14, -112 * R, 28 * R, d(9), 86, 30, 96, { fx })] },
    dair: { id: 'dair', name: 'Down Air', total: t(44), air: true, landingLag: 16, limb: 'legF', hitboxes: [hb(t(12), t(15), 0, 8, 26 * R, d(14), 270, 22, 82, { fx, lag: 1.2 }), hb(t(16), t(22), 0, 0, 22 * R, d(8), 290, 18, 70, { fx })] },
    ledge: { id: 'ledge', name: 'Ledge Attack', total: 40, limb: 'legF', invuln: [1, 14], hitboxes: [hb(16, 19, 45, -30, 30, d(8), 40, 50, 30, { fx })] },
    getup: { id: 'getup', name: 'Getup Attack', total: 36, limb: 'both', invuln: [1, 16], hitboxes: [hb(14, 16, 48, -20, 26, d(7), 40, 50, 30, { fx }), hb(18, 20, -48, -20, 26, d(7), 140, 50, 30, { fx })] },
  };
}

const helplessUp = (vy: number, dirMul = 4) => (f: Fighter, _w: World, fr: number, start: number) => {
  if (fr === start) {
    f.vy = -vy; f.vx = f.input.x * dirMul; f.ground = null; f.fastFall = false;
    if (Math.abs(f.input.x) > 0.3) f.facing = Math.sign(f.input.x);
  }
};

// ---------------------------------------------------------------- characters
function stats(s: Partial<CharStats>): CharStats {
  return {
    walk: 3.4, run: 7, air: 3.3, airAccel: 0.34, gravity: 0.62, fall: 11, fastFall: 17,
    jump: 17, shortHop: 11, djump: 16, jumps: 2, weight: 100, traction: 0.6, size: 1, power: 1, jumpSquat: 3, ...s,
  };
}

const vis = (v: CharVisual) => v;

export const CHARACTERS: CharDef[] = [];

// ---- 1. NOVA — balanced all-rounder (starter)
{
  const m = normals({ reach: 1, power: 1, speed: 1, fx: 'elec' });
  m.nspec = {
    id: 'nspec', name: 'Plasma Shot', total: 32, limb: 'armF', hitboxes: [],
    update: (f, w, fr) => {
      if (fr === 10) w.spawnProjectile(f, { x: f.x + 40 * f.facing * f.sz, y: f.y - 58 * f.sz, vx: 13 * f.facing, life: 70, kind: 'plasma', hb: hb(0, 0, 0, 0, 15, 6, 40, 25, 45, { fx: 'elec' }) });
      if (!f.grounded && fr < 20) f.vy = Math.min(f.vy, 2);
    },
  };
  m.sspec = {
    id: 'sspec', name: 'Comet Dash', total: 42, limb: 'body', noGravity: [8, 22], slide: true,
    hitboxes: [hb(8, 22, 18, -50, 34, 10, 35, 50, 72, { fx: 'elec' })],
    update: (f, _w, fr) => { if (fr >= 8 && fr <= 22) { f.vx = 14 * f.facing; f.vy = 0; } if (fr === 23) f.vx *= 0.3; },
  };
  const up = helplessUp(19);
  m.uspec = {
    id: 'uspec', name: 'Starburst Rise', total: 44, limb: 'armF', helpless: true, recovery: true,
    hitboxes: [hb(6, 18, 0, -70, 34, 2.5, 90, 30, 20, { fx: 'elec', rehit: 4 }), hb(20, 22, 0, -90, 44, 5, 80, 60, 90, { fx: 'elec', g: 1 })],
    update: (f, w, fr) => up(f, w, fr, 6),
  };
  m.dspec = {
    id: 'dspec', name: 'Pulse Nova', total: 44, limb: 'both', noGravity: [4, 20],
    hitboxes: [hb(14, 18, 0, -50, 72, 11, 60, 62, 72, { fx: 'elec', lag: 1.2 })],
    update: (f, _w, fr) => { if (!f.grounded && fr < 20) { f.vy *= 0.5; f.vx *= 0.9; } },
  };
  CHARACTERS.push({
    id: 'nova', name: 'Nova', title: 'The Star Pilot', starter: true,
    blurb: 'A balanced pilot with a plasma blaster and a comet-fast dash. Great for learning.',
    stats: stats({}),
    visual: vis({ body: '#2f4fc4', accent: '#3fd6d8', skin: '#e7b48e', dark: '#2a47b0', head: 'helmet', accessory: 'visor', bulk: 1, fx: 'elec', glove: '#f2f5fb', boot: '#f2f5fb', hair: '#1d2433', eye: '#4fe3e6', cape: null, emblem: 'star', shoulder: 14.5, waist: 10, glow: '#7fe3ff', emblemColor: '#f6c33a', jointCol: '#22399a', hips: 1 }),
    moves: m, ratings: { speed: 3, power: 3, weight: 3, air: 3 },
  });
}

// ---- 2. GRANITE (id 'brick' kept for save compatibility) — heavy hitter (starter)
{
  const m = normals({ reach: 1.12, power: 1.18, speed: 0.85, fx: 'hit' });
  m.nspec = {
    id: 'nspec', name: 'Boulder Toss', total: 46, limb: 'both', hitboxes: [],
    update: (f, w, fr) => {
      if (fr === 18) w.spawnProjectile(f, { x: f.x + 30 * f.facing * f.sz, y: f.y - 120 * f.sz, vx: 7.5 * f.facing, vy: -9, gravity: 0.45, life: 140, kind: 'boulder', hb: hb(0, 0, 0, 0, 26, 14, 45, 45, 85, { fx: 'hit', lag: 1.3 }) });
    },
  };
  m.sspec = {
    id: 'sspec', name: 'Shoulder Charge', total: 50, limb: 'body', armor: [6, 26], slide: true, noGravity: [8, 24],
    hitboxes: [hb(8, 24, 30, -55, 34, 13, 40, 62, 82, { lag: 1.3 })],
    update: (f, _w, fr) => { if (fr >= 8 && fr <= 24) { f.vx = 10.5 * f.facing; if (!f.grounded) f.vy = 0; } if (fr === 25) f.vx *= 0.2; },
  };
  const up = helplessUp(21, 3);
  m.uspec = {
    id: 'uspec', name: 'Rocket Uppercut', total: 42, limb: 'armF', helpless: true, recovery: true,
    hitboxes: [hb(5, 9, 25, -80, 36, 13, 84, 55, 88, { lag: 1.3 }), hb(10, 16, 20, -100, 28, 7, 84, 40, 70, { g: 1 })],
    update: (f, w, fr) => up(f, w, fr, 5),
  };
  m.dspec = {
    id: 'dspec', name: 'Quake Stomp', total: 46, limb: 'legF',
    hitboxes: [hb(16, 19, 85, -10, 40, 12, 72, 55, 75), hb(16, 19, -85, -10, 40, 12, 108, 55, 75)],
    update: (f, _w, fr) => {
      if (!f.grounded) { if (fr === 8) { f.vy = 0; } if (fr > 8) { f.vy = 24; f.vx = 0; } if (fr === 30) f.moveFrame = 12; }
    },
    onLand: (f, w) => {
      if (f.moveFrame >= 8) { f.moveFrame = 15; f.ground && (f.vy = 0); w.emit({ type: 'land', x: f.x, y: f.y, slot: f.slot, p: 4 }); w.shakeMag = 8; return true; }
      return false;
    },
  };
  // airborne quake stomp spike
  m.dspec.hitboxes.push(hb(9, 30, 0, 0, 34, 14, 270, 30, 80, { g: 2, lag: 1.3 }));
  CHARACTERS.push({
    id: 'brick', name: 'Granite', title: 'The Walking Quarry', starter: true,
    blurb: 'A seven-foot golem of weathered rock and pulsing magma. Armored charges and earth-shaking stomps.',
    stats: stats({ walk: 2.6, run: 5.8, air: 2.7, airAccel: 0.26, gravity: 0.72, fall: 13, fastFall: 19, jump: 16.5, shortHop: 10.5, djump: 15, weight: 135, traction: 0.8, size: 1.24, power: 1.0, jumpSquat: 4 }),
    visual: vis({ body: '#a39887', accent: '#ff6a1a', skin: '#a39887', dark: '#6e655a', head: 'square', accessory: 'shoulders', bulk: 1.6, fx: 'hit', glove: '#9a8f7e', boot: '#857b6d', hair: '#5d554b', eye: '#ffe14a', cape: null, emblem: 'gear', shoulder: 22, waist: 15, glow: '#ff8a2a', armor: '#8c8273', cracks: '#ff7a1f', fist: 1.7 }),
    moves: m, ratings: { speed: 1, power: 5, weight: 5, air: 2 },
  });
}

// ---- 3. ZEPHYR — fast multi-jumper (starter)
{
  const m = normals({ reach: 0.92, power: 0.86, speed: 1.2, fx: 'wind' });
  m.nspec = {
    id: 'nspec', name: 'Wind Shuriken', total: 24, limb: 'armF', hitboxes: [],
    update: (f, w, fr) => {
      if (fr === 7) w.spawnProjectile(f, { x: f.x + 35 * f.facing * f.sz, y: f.y - 55 * f.sz, vx: 17 * f.facing, life: 42, kind: 'shuriken', hb: hb(0, 0, 0, 0, 13, 4, 32, 15, 30, { fx: 'wind' }) });
    },
  };
  m.sspec = {
    id: 'sspec', name: 'Gale Step', total: 32, limb: 'armF', invuln: [6, 14], noGravity: [6, 16], slide: true,
    hitboxes: [hb(14, 17, 30, -50, 34, 8, 45, 45, 70, { fx: 'wind' })],
    update: (f, _w, fr) => { if (fr >= 6 && fr <= 14) { f.vx = 20 * f.facing; f.vy = 0; } if (fr === 15) f.vx = 4 * f.facing; },
  };
  m.uspec = {
    id: 'uspec', name: 'Cyclone', total: 42, limb: 'spin', helpless: true, recovery: true, noGravity: [4, 30],
    hitboxes: [hb(4, 29, 0, -50, 44, 2, 90, 30, 15, { fx: 'wind', rehit: 5 }), hb(30, 32, 0, -60, 50, 4, 80, 50, 100, { fx: 'wind', g: 1 })],
    update: (f, _w, fr) => { if (fr === 4) { f.ground = null; } if (fr >= 4 && fr <= 30) { f.vy = -11.5; f.vx = f.input.x * 4.5; } },
  };
  m.dspec = {
    id: 'dspec', name: 'Mirror Stance', total: 44, limb: 'armF', counter: [5, 30], hitboxes: [],
    update: (f, _w, fr) => { if (!f.grounded && fr < 30) f.vy = Math.min(f.vy, 1.5); },
  };
  CHARACTERS.push({
    id: 'zephyr', name: 'Zephyr', title: 'The Drifting Gale', starter: true,
    blurb: 'Light and blindingly fast with four jumps, wind blades and a perfect counter.',
    stats: stats({ walk: 4.2, run: 9, air: 4, airAccel: 0.46, gravity: 0.6, fall: 10.5, fastFall: 16, jump: 16.5, shortHop: 10.5, djump: 14.5, jumps: 4, weight: 78, traction: 0.5, size: 0.9 }),
    visual: vis({ body: '#7fe0b8', accent: '#c9d3dc', skin: '#f3d2b8', dark: '#2e8c88', head: 'round', accessory: 'scarf', bulk: 0.82, fx: 'wind', glove: '#2e8c88', boot: '#3aa89a', hair: '#efe4c8', eye: '#2f8f8c', cape: '#ff5fa8', emblem: 'wind', shoulder: 12.5, waist: 8.5, glow: '#a8fff0', armor: '#c9d3dc', hips: 2 }),
    moves: m, ratings: { speed: 5, power: 2, weight: 1, air: 5 },
  });
}

// ---- 4. VOLT — zoner (starter)
{
  const m = normals({ reach: 1.05, power: 0.95, speed: 1, fx: 'elec' });
  m.nspec = {
    id: 'nspec', name: 'Ball Lightning', total: 38, limb: 'armF', hitboxes: [],
    update: (f, w, fr) => {
      if (fr === 14) w.spawnProjectile(f, { x: f.x + 40 * f.facing * f.sz, y: f.y - 50 * f.sz, vx: 6 * f.facing, life: 150, hits: 2, kind: 'ball', hb: hb(0, 0, 0, 0, 20, 7, 50, 32, 58, { fx: 'elec' }) });
    },
  };
  m.sspec = {
    id: 'sspec', name: 'Arc Lash', total: 40, limb: 'armF',
    hitboxes: [hb(12, 15, 135, -55, 24, 11, 32, 40, 92, { fx: 'elec', lag: 1.2 }), hb(12, 15, 75, -55, 22, 8, 40, 30, 70, { fx: 'elec' })],
    update: (f, _w, fr) => { if (!f.grounded && fr < 16) f.vy = Math.min(f.vy, 1); },
  };
  m.uspec = {
    id: 'uspec', name: 'Thunder Leap', total: 34, limb: 'body', helpless: true, recovery: true, invuln: [4, 12], noGravity: [1, 14],
    hitboxes: [hb(12, 14, 0, -50, 52, 7, 80, 55, 60, { fx: 'elec' })],
    update: (f, _w, fr) => {
      if (fr === 1) { f.vx = 0; f.vy = 0; }
      if (fr === 10) {
        let dx = f.input.x, dy = f.input.y; const mag = Math.hypot(dx, dy);
        if (mag < 0.3) { dx = 0; dy = -1; } else { dx /= mag; dy /= mag; }
        if (dy > 0.6 && f.grounded) dy = -1;
        f.ground = null; f.x += dx * 230; f.y += dy * 230; f.vx = dx * 3; f.vy = dy * 3;
        if (Math.abs(dx) > 0.2) f.facing = Math.sign(dx);
      }
    },
  };
  m.dspec = {
    id: 'dspec', name: 'Static Field', total: 36, limb: 'both', reflect: [4, 26],
    hitboxes: [hb(4, 6, 0, -50, 56, 5, 80, 50, 30, { fx: 'elec' })],
    update: (f, _w, fr) => { if (!f.grounded && fr < 26) f.vy = Math.min(f.vy, 1.5); },
  };
  CHARACTERS.push({
    id: 'volt', name: 'Volt', title: 'The Live Wire', starter: true,
    blurb: 'A crackling armored brawler with ball lightning, a long arc lash and a projectile-reflecting static field.',
    stats: stats({ walk: 3.2, run: 6.6, air: 3.2, airAccel: 0.32, gravity: 0.58, fall: 10, fastFall: 16, jump: 17, weight: 92 }),
    visual: vis({ body: '#55698a', accent: '#66d9ff', skin: '#f3c9a2', dark: '#3e4f6b', head: 'spiky', accessory: 'antenna', bulk: 0.95, fx: 'elec', glove: '#2a2d36', boot: '#2f323b', hair: '#ffc93a', eye: '#8ff0ff', cape: null, emblem: 'bolt', shoulder: 14.5, waist: 10, glow: '#9ff3ff', armor: '#f2b51b', chestPlate: true }),
    moves: m, ratings: { speed: 3, power: 3, weight: 2, air: 3 },
  });
}

// ---- 5. EMBER — fire rushdown (unlock)
{
  const m = normals({ reach: 0.98, power: 1.05, speed: 1.1, fx: 'fire' });
  m.nspec = {
    id: 'nspec', name: 'Fireball', total: 30, limb: 'armF', hitboxes: [],
    update: (f, w, fr) => {
      if (fr === 9) w.spawnProjectile(f, { x: f.x + 35 * f.facing * f.sz, y: f.y - 55 * f.sz, vx: 9 * f.facing, vy: -1, gravity: 0.45, bounce: 3, life: 100, kind: 'fireball', hb: hb(0, 0, 0, 0, 15, 6.5, 45, 25, 50, { fx: 'fire' }) });
    },
  };
  m.sspec = {
    id: 'sspec', name: 'Flame Wheel', total: 40, limb: 'spin', slide: true, noGravity: [10, 28],
    hitboxes: [hb(10, 27, 15, -50, 38, 2.5, 60, 35, 15, { fx: 'fire', rehit: 4 }), hb(28, 30, 20, -50, 44, 6, 40, 62, 72, { fx: 'fire', g: 1 })],
    update: (f, _w, fr) => { if (fr >= 10 && fr <= 28) { f.vx = 12 * f.facing; if (!f.grounded) f.vy = 0; } if (fr === 29) f.vx *= 0.3; },
  };
  const up = helplessUp(22, 5);
  m.uspec = {
    id: 'uspec', name: 'Phoenix Rise', total: 42, limb: 'armF', helpless: true, recovery: true,
    hitboxes: [hb(8, 18, 0, -70, 40, 13, 80, 50, 85, { fx: 'fire', lag: 1.2 })],
    update: (f, w, fr) => up(f, w, fr, 8),
  };
  m.dspec = {
    id: 'dspec', name: 'Magma Burst', total: 48, limb: 'both',
    hitboxes: [hb(20, 24, 65, -40, 62, 16, 55, 50, 92, { fx: 'fire', lag: 1.3 })],
    update: (f, _w, fr) => { if (!f.grounded && fr < 24) f.vy = Math.min(f.vy, 2); },
  };
  CHARACTERS.push({
    id: 'ember', name: 'Ember', title: 'The Hearth Brawler', starter: false,
    blurb: 'Relentless pressure with bouncing fireballs, a spinning flame wheel and explosive bursts.',
    stats: stats({ walk: 3.8, run: 8.2, air: 3.6, airAccel: 0.4, gravity: 0.68, fall: 11.5, fastFall: 18, jump: 17, weight: 90, size: 0.96 }),
    visual: vis({ body: '#e8643c', accent: '#f2b33a', skin: '#e8643c', dark: '#36363d', head: 'round', accessory: 'flame', bulk: 1, fx: 'fire', glove: '#2e2a2a', boot: '#6b3f22', hair: '#ff8a1f', eye: '#ffd23f', cape: null, emblem: 'flame', shoulder: 14, waist: 10, glow: '#ffae3a', bareTorso: true, fist: 1.25, handFire: ['rgba(255,110,30,0.85)', 'rgba(255,214,80,0.85)'] }),
    moves: m, ratings: { speed: 4, power: 4, weight: 2, air: 3 },
  });
}

// ---- 6. GLACIA — ice control (unlock)
{
  const m = normals({ reach: 1.05, power: 1, speed: 0.95, fx: 'ice' });
  m.nspec = {
    id: 'nspec', name: 'Frost Lance', total: 34, limb: 'armF', hitboxes: [],
    update: (f, w, fr) => {
      if (fr === 12) w.spawnProjectile(f, { x: f.x + 40 * f.facing * f.sz, y: f.y - 55 * f.sz, vx: 11 * f.facing, life: 60, kind: 'lance', hb: hb(0, 0, 0, 0, 16, 8, 40, 30, 55, { fx: 'ice', freeze: 22 }) });
    },
  };
  m.sspec = {
    id: 'sspec', name: 'Ice Slide', total: 40, limb: 'legF', slide: true, noGravity: [6, 24],
    hitboxes: [hb(6, 24, 30, -20, 30, 9, 72, 45, 65, { fx: 'ice', freeze: 10 })],
    update: (f, _w, fr) => { if (fr >= 6 && fr <= 24) { f.vx = (12 - fr * 0.25) * f.facing; if (!f.grounded) f.vy = 0.5; } },
  };
  const up = helplessUp(20, 4);
  m.uspec = {
    id: 'uspec', name: 'Ice Pillar', total: 44, limb: 'armF', helpless: true, recovery: true,
    hitboxes: [hb(6, 16, 0, -30, 46, 10, 90, 55, 80, { fx: 'ice' })],
    update: (f, w, fr) => up(f, w, fr, 10),
  };
  m.dspec = {
    id: 'dspec', name: 'Crystal Shield', total: 40, limb: 'both', reflect: [5, 30], armor: [5, 30],
    hitboxes: [hb(5, 7, 0, -50, 52, 6, 70, 50, 40, { fx: 'ice', freeze: 8 })],
    update: (f, _w, fr) => { if (!f.grounded && fr < 30) f.vy = Math.min(f.vy, 1.5); },
  };
  CHARACTERS.push({
    id: 'glacia', name: 'Glacia', title: 'The Frost Sovereign', starter: false,
    blurb: 'Freezing lances lock foes in place; her crystal shield reflects and absorbs.',
    stats: stats({ walk: 3, run: 6.3, air: 3, airAccel: 0.3, gravity: 0.55, fall: 9.5, fastFall: 15, jump: 17.5, djump: 16.5, weight: 98 }),
    visual: vis({ body: '#9fd3f0', accent: '#e9f8ff', skin: '#e6eef8', dark: '#8cbfe0', head: 'round', accessory: 'crystal', bulk: 0.9, fx: 'ice', glove: '#f2fbff', boot: '#7fb4dc', hair: '#dff1ff', eye: '#3e7fc4', cape: '#9cc6ec', emblem: 'snow', shoulder: 12.5, waist: 8.5, glow: '#a8ecff', armor: '#c8ecff', skirt: '#8ec6ea', emblemColor: '#ffffff', jointCol: '#bfe9ff', hips: 1.5 }),
    moves: m, ratings: { speed: 2, power: 3, weight: 3, air: 4 },
  });
}

// ---- 7. ROOK — sword knight (unlock)
{
  const m = normals({ reach: 1.35, power: 1.05, speed: 0.92, fx: 'slash', sword: true });
  m.nspec = {
    id: 'nspec', name: 'Charge Blade', total: 46, limb: 'armF', charge: 9, chargeBtn: 'special', maxCharge: 90,
    hitboxes: [hb(14, 17, 85, -55, 34, 10, 38, 48, 96, { fx: 'slash', lag: 1.3 }), hb(14, 17, 40, -55, 26, 8, 38, 40, 90, { fx: 'slash' })],
  };
  m.sspec = {
    id: 'sspec', name: 'Lunge', total: 40, limb: 'armF', slide: true, noGravity: [8, 20],
    hitboxes: [hb(8, 20, 82, -55, 26, 12, 35, 48, 82, { fx: 'slash' })],
    update: (f, _w, fr) => { if (fr >= 8 && fr <= 20) { f.vx = 13 * f.facing; if (!f.grounded) f.vy = 0; } if (fr === 21) f.vx *= 0.25; },
  };
  const up = helplessUp(20, 3);
  m.uspec = {
    id: 'uspec', name: 'Rising Crest', total: 42, limb: 'armF', helpless: true, recovery: true,
    hitboxes: [hb(6, 16, 35, -90, 42, 11, 85, 50, 85, { fx: 'slash', lag: 1.2 })],
    update: (f, w, fr) => up(f, w, fr, 6),
  };
  m.dspec = {
    id: 'dspec', name: 'Riposte', total: 42, limb: 'armF', counter: [4, 26], hitboxes: [],
    update: (f, _w, fr) => { if (!f.grounded && fr < 26) f.vy = Math.min(f.vy, 1.5); },
  };
  CHARACTERS.push({
    id: 'rook', name: 'Rook', title: 'The Oathsworn Knight', starter: false,
    blurb: 'Huge sword reach, a chargeable blade and a punishing riposte counter.',
    stats: stats({ walk: 3.1, run: 6.8, air: 3.1, airAccel: 0.3, gravity: 0.64, fall: 11, fastFall: 17, jump: 16.5, djump: 15.5, weight: 108, size: 1.06 }),
    visual: vis({ body: '#b8bfcb', accent: '#e2b544', skin: '#e9c7a3', dark: '#9aa2b0', head: 'helmet', accessory: 'sword', bulk: 1.15, fx: 'slash', glove: '#a9b1be', boot: '#7a4a2a', hair: '#d8322e', eye: '#ffe9a8', cape: '#c42b2b', emblem: 'crest', shoulder: 17, waist: 12.5, glow: '#ffb347', armor: '#c8cfda', emblemColor: '#c8302c', jointCol: '#e2b544' }),
    moves: m, ratings: { speed: 3, power: 4, weight: 4, air: 2 },
  });
}

// ---- 8. OMEGA — void powerhouse (unlock, final boss)
{
  const m = normals({ reach: 1.12, power: 1.1, speed: 0.95, fx: 'dark' });
  m.nspec = {
    id: 'nspec', name: 'Void Orb', total: 40, limb: 'armF', hitboxes: [],
    update: (f, w, fr) => {
      if (fr === 16) w.spawnProjectile(f, { x: f.x + 40 * f.facing * f.sz, y: f.y - 60 * f.sz, vx: 6.5 * f.facing, life: 130, homing: 0.35, kind: 'void', hb: hb(0, 0, 0, 0, 20, 10, 45, 35, 70, { fx: 'dark' }) });
    },
  };
  m.sspec = {
    id: 'sspec', name: 'Warp Strike', total: 40, limb: 'armF', invuln: [6, 16], noGravity: [6, 22],
    hitboxes: [hb(16, 19, 45, -55, 40, 13, 40, 50, 90, { fx: 'dark', lag: 1.3 })],
    update: (f, w, fr) => {
      if (fr === 6) { f.vx = 0; f.vy = 0; }
      if (fr === 14) {
        let nx = f.x + 210 * f.facing;
        const main = w.mainPlatform();
        if (f.grounded) nx = Math.max(main.x1 + 10, Math.min(main.x2 - 10, nx));
        f.x = nx;
      }
    },
  };
  m.uspec = {
    id: 'uspec', name: 'Ascend', total: 36, limb: 'body', helpless: true, recovery: true, invuln: [5, 14], noGravity: [1, 16],
    hitboxes: [hb(14, 16, 0, -50, 56, 9, 80, 55, 70, { fx: 'dark' })],
    update: (f, _w, fr) => {
      if (fr === 1) { f.vx = 0; f.vy = 0; }
      if (fr === 12) { f.ground = null; f.y -= 260; f.x += f.input.x * 140; f.vy = -2; if (Math.abs(f.input.x) > 0.3) f.facing = Math.sign(f.input.x); }
    },
  };
  m.dspec = {
    id: 'dspec', name: 'Singularity', total: 52, limb: 'both', noGravity: [4, 34],
    hitboxes: [hb(30, 34, 0, -55, 85, 15, 70, 60, 90, { fx: 'dark', lag: 1.4 })],
    update: (f, w, fr) => {
      if (!f.grounded) { f.vy *= 0.6; f.vx *= 0.9; }
      if (fr >= 6 && fr < 30) {
        const cx = f.x, cy = f.y - f.H / 2;
        for (const o of w.fighters) {
          if (o === f || !o.alive || (f.team >= 0 && o.team === f.team) || o.intangible()) continue;
          const dx = cx - o.x, dy = cy - (o.y - o.H / 2), d = Math.hypot(dx, dy);
          if (d < 240 && d > 20) { o.x += (dx / d) * 2.6; if (!o.grounded) o.y += (dy / d) * 1.5; }
        }
      }
    },
  };
  CHARACTERS.push({
    id: 'omega', name: 'Omega', title: 'The Void Sovereign', starter: false,
    blurb: 'The orbit\'s final guardian. Warps through space and drags foes into a singularity.',
    stats: stats({ walk: 3, run: 7, air: 3.1, airAccel: 0.3, gravity: 0.62, fall: 11, fastFall: 17, jump: 17, weight: 118, size: 1.2, jumpSquat: 4 }),
    visual: vis({ body: '#2f2a38', accent: '#7c3fa6', skin: '#b9ace0', dark: '#211d29', head: 'spiky', accessory: 'horns', bulk: 1.25, fx: 'dark', glove: '#2a2531', boot: '#1f1b25', hair: '#0a0410', eye: '#ff3df0', cape: '#4a1f66', emblem: 'void', shoulder: 19, waist: 13, glow: '#e040ff', armor: '#3a3444', emblemColor: '#ff3df0', tabard: '#4a1f66', handFire: ['rgba(224,64,255,0.85)', 'rgba(255,150,255,0.85)'], jointCol: '#3a3444' }),
    moves: m, ratings: { speed: 3, power: 5, weight: 4, air: 3 },
  });
}

export const charById = (id: string): CharDef => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
export const MOVE_IDS = Object.keys(CHARACTERS[0].moves);
