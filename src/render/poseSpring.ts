import type { Pose } from './rig';

/**
 * Spring-smoothed poses: every limb angle chases the target pose with a slightly
 * under-damped spring, so strikes snap out, overshoot a touch and settle (follow-through),
 * and transitions between states never pop.
 */
interface SpringState { v: Float32Array; vel: Float32Array; init: boolean; last: number }
const N = 10; // lean, hipY, armF0, armF1, armB0, armB1, legF0, legF1, legB0, legB1

const states = new Map<number, SpringState>();

function pack(p: Pose, out: Float32Array) {
  out[0] = p.lean; out[1] = p.hipY;
  out[2] = p.armF[0]; out[3] = p.armF[1]; out[4] = p.armB[0]; out[5] = p.armB[1];
  out[6] = p.legF[0]; out[7] = p.legF[1]; out[8] = p.legB[0]; out[9] = p.legB[1];
}
const tgt = new Float32Array(N);

/**
 * key: per-fighter id. stiffness tuned per frame; `snap` skips smoothing (e.g. on respawn / big rotations).
 * Returns a new pose object with smoothed limb angles (rot/squash pass through untouched).
 */
export function springPose(key: number, p: Pose, frameMs: number, snap = false, hard = false): Pose {
  let s = states.get(key);
  if (!s) { s = { v: new Float32Array(N), vel: new Float32Array(N), init: false, last: 0 }; states.set(key, s); }
  pack(p, tgt);
  if (!s.init || snap) { s.v.set(tgt); s.vel.fill(0); s.init = true; }
  else {
    const dt = Math.min(2.5, Math.max(0.25, frameMs / 16.67));
    const k = hard ? 0.55 : 0.34; // stiffness (strikes use the stiffer spring)
    const d = hard ? 0.52 : 0.6; // damping (<1 per step → slight overshoot)
    for (let i = 0; i < N; i++) {
      const a = (tgt[i] - s.v[i]) * k;
      s.vel[i] = (s.vel[i] + a * dt) * Math.pow(d, dt);
      s.v[i] += s.vel[i] * dt;
    }
  }
  const v = s.v;
  return { ...p, lean: v[0], hipY: v[1], armF: [v[2], v[3]], armB: [v[4], v[5]], legF: [v[6], v[7]], legB: [v[8], v[9]] };
}

export function resetSprings() { states.clear(); }
