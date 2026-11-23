/** One simulation frame of input for a single fighter. */
export interface InputFrame {
  x: number; y: number; // analog movement -1..1 (y+ = down)
  jump: boolean; attack: boolean; special: boolean; shield: boolean; smash: boolean;
  jumpP: boolean; attackP: boolean; specialP: boolean; shieldP: boolean; smashP: boolean; pauseP: boolean;
  dashTap: number; // -1 / 0 / 1 — dash initiated this frame (flick or key press)
  downTap: boolean; // down flicked this frame (drop-through / fast-fall)
  sx: number; sy: number; // smash direction (when smashP)
}

export const emptyInput = (): InputFrame => ({
  x: 0, y: 0, jump: false, attack: false, special: false, shield: false, smash: false,
  jumpP: false, attackP: false, specialP: false, shieldP: false, smashP: false, pauseP: false,
  dashTap: 0, downTap: false, sx: 0, sy: 0,
});

/** Compact array encoding for network transport. */
export function encodeInput(f: InputFrame): number[] {
  const b =
    (f.jump ? 1 : 0) | (f.attack ? 2 : 0) | (f.special ? 4 : 0) | (f.shield ? 8 : 0) | (f.smash ? 16 : 0) |
    (f.jumpP ? 32 : 0) | (f.attackP ? 64 : 0) | (f.specialP ? 128 : 0) | (f.shieldP ? 256 : 0) | (f.smashP ? 512 : 0) |
    (f.downTap ? 1024 : 0);
  return [Math.round(f.x * 100), Math.round(f.y * 100), b, f.dashTap, Math.round(f.sx * 100), Math.round(f.sy * 100)];
}
export function decodeInput(a: number[]): InputFrame {
  const b = a[2] | 0;
  return {
    x: a[0] / 100, y: a[1] / 100,
    jump: !!(b & 1), attack: !!(b & 2), special: !!(b & 4), shield: !!(b & 8), smash: !!(b & 16),
    jumpP: !!(b & 32), attackP: !!(b & 64), specialP: !!(b & 128), shieldP: !!(b & 256), smashP: !!(b & 512),
    downTap: !!(b & 1024), pauseP: false, dashTap: a[3] | 0, sx: a[4] / 100, sy: a[5] / 100,
  };
}
/** Merge edge-triggered presses from a dropped frame into the next one. */
export function mergePresses(into: InputFrame, from: InputFrame) {
  into.jumpP ||= from.jumpP; into.attackP ||= from.attackP; into.specialP ||= from.specialP;
  into.shieldP ||= from.shieldP; into.downTap ||= from.downTap;
  if (from.smashP && !into.smashP) { into.smashP = true; into.sx = from.sx; into.sy = from.sy; }
  if (!into.dashTap) into.dashTap = from.dashTap;
}

