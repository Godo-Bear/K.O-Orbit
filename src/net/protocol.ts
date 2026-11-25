import { STATE_LIST, type Fighter } from '../sim/fighter';
import { MOVE_IDS } from '../sim/characters';
import type { World } from '../sim/world';
import type { Fx, GameEvent } from '../sim/types';

const FX_LIST: Fx[] = ['hit', 'fire', 'elec', 'ice', 'slash', 'dark', 'wind', 'water', 'arcane', 'solar'];
const KINDS = ['orb', 'plasma', 'boulder', 'shuriken', 'ball', 'fireball', 'lance', 'void', 'meteor', 'water', 'arcane', 'spear', 'fist', 'book'];
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Host → clients: compact world snapshot. */
export function encodeSnapshot(w: World, events: GameEvent[]) {
  const F = w.fighters.map((f) => [
    r1(f.x), r1(f.y), f.facing, STATE_LIST.indexOf(f.state), f.stateFrame,
    f.move ? MOVE_IDS.indexOf(f.move.id) : -1, f.moveFrame, r1(f.percent), f.stocks, r1(f.shieldHP),
    (f.ground ? 1 : 0) | (f.charging ? 2 : 0) | (f.tumble ? 4 : 0), f.hitlag, f.flash, f.invuln,
    r1(f.hp), f.kos, f.falls, r1(f.damageDealt), r1(f.damageTaken), f.score, f.eliminatedAt, r1(f.vy), f.charge, f.sds,
  ]);
  const P: number[][] = [];
  for (const p of w.projectiles) if (p.active) P.push([r1(p.x), r1(p.y), r1(p.vx), r1(p.vy), KINDS.indexOf(p.kind), FX_LIST.indexOf(p.fx), p.r, p.age]);
  return { k: 'snap', fr: w.frame, ph: w.phase, pf: w.phaseFrame, tl: w.timeLeft, sh: r1(w.shakeMag), win: w.winner, F, P, E: events };
}

/** Client: apply snapshot into its view world (no local physics). */
export function applySnapshot(w: World, s: any) {
  w.frame = s.fr; w.phase = s.ph; w.phaseFrame = s.pf; w.timeLeft = s.tl; w.shakeMag = Math.max(w.shakeMag, s.sh); w.winner = s.win;
  for (const p of w.platforms) p.update(s.fr);
  const main = w.mainPlatform();
  s.F.forEach((a: number[], i: number) => {
    const f: Fighter | undefined = w.fighters[i];
    if (!f) return;
    f.rx = f.x; f.ry = f.y;
    f.x = a[0]; f.y = a[1]; f.facing = a[2];
    f.state = STATE_LIST[a[3]] ?? 'idle'; f.stateFrame = a[4];
    const mid = a[5];
    f.move = mid >= 0 ? f.char.moves[MOVE_IDS[mid]] ?? null : null;
    f.moveFrame = a[6]; f.percent = a[7]; f.stocks = a[8]; f.shieldHP = a[9];
    f.ground = a[10] & 1 ? main : null; f.charging = !!(a[10] & 2); f.tumble = !!(a[10] & 4);
    f.hitlag = a[11]; f.flash = a[12]; f.invuln = a[13]; f.hp = a[14]; f.kos = a[15]; f.falls = a[16];
    f.damageDealt = a[17]; f.damageTaken = a[18]; f.score = a[19]; f.eliminatedAt = a[20]; f.vy = a[21]; f.charge = a[22]; f.sds = a[23];
    f.shake = f.hitlag > 0 ? 4 : 0;
  });
  let k = 0;
  for (const p of w.projectiles) {
    const a = s.P[k];
    if (!a) { p.active = false; continue; }
    const wasActive = p.active;
    p.active = true;
    p.rx = wasActive ? p.x : a[0]; p.ry = wasActive ? p.y : a[1];
    p.x = a[0]; p.y = a[1]; p.vx = a[2]; p.vy = a[3]; p.kind = KINDS[a[4]] ?? 'orb'; p.fx = FX_LIST[a[5]] ?? 'hit'; p.r = a[6]; p.age = a[7];
    k++;
  }
  w.events = s.E ?? [];
}
