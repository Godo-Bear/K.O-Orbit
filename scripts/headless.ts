// Headless simulation smoke test: runs a 10-CPU match and checks invariants & timing.
import { World } from '../src/sim/world';
import { CpuBrain } from '../src/sim/ai';
import { CHARACTERS } from '../src/sim/characters';
import { STAGES } from '../src/sim/stages';
import type { SlotConfig } from '../src/sim/types';

let total = 0;
for (const stage of STAGES) {
  for (const n of [2, 10]) {
    const slots: SlotConfig[] = Array.from({ length: n }, (_, i) => ({ slot: i, type: 'CPU', charId: CHARACTERS[i % 8].id, cpuLevel: 9 - (i % 9), team: -1 }));
    const w = new World({ mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: stage.id }, slots, 42 + n);
    const brains = slots.map((s) => new CpuBrain(s.cpuLevel, s.slot + 1));
    const t0 = performance.now();
    let f = 0;
    const maxFrames = 60 * 60 * 6;
    while (w.phase !== 'over' && f < maxFrames) {
      w.step(w.fighters.map((ft, k) => brains[k].think(ft, w)));
      f++;
      for (const ft of w.fighters) {
        if (!Number.isFinite(ft.x) || !Number.isFinite(ft.y)) throw new Error(`NaN pos ${ft.char.id} state=${ft.state}`);
      }
    }
    const ms = performance.now() - t0;
    total += f;
    const ko = w.fighters.map((x) => `${x.char.id}:${x.kos}k/${x.falls}f/sd${x.sds}`).join(' ');
    console.log(`${stage.id.padEnd(8)} n=${String(n).padStart(2)} frames=${f} (${(f / 60).toFixed(0)}s) ${(ms / f).toFixed(3)}ms/step phase=${w.phase} winners=${w.winner.join(',')}\n   ${ko}`);
  }
}
console.log('total frames', total);

// Exercise every move of every fighter, grounded and airborne, against a dummy.
let moveRuns = 0;
for (const c of CHARACTERS) {
  for (const id of Object.keys(c.moves)) {
    for (const air of [false, true]) {
      const w = new World({ mode: 'stock', stocks: 3, timeSec: 0, hp: 150, stageId: 'crater' },
        [{ slot: 0, type: 'CPU', charId: c.id, cpuLevel: 1, team: -1 }, { slot: 1, type: 'CPU', charId: 'brick', cpuLevel: 1, team: -1 }], 1);
      w.phase = 'play';
      const [a, d] = w.fighters;
      a.x = -40; d.x = 40; a.facing = 1;
      if (air) { a.ground = null; a.y = -200; a.setState('air'); }
      w.step([]);
      a.startMove(id, w);
      for (let i = 0; i < 150; i++) {
        w.step([]);
        if (!Number.isFinite(a.x + a.y + d.x + d.y)) throw new Error(`NaN ${c.id}.${id}`);
      }
      moveRuns++;
    }
  }
}
console.log('move runs ok:', moveRuns, 'across', CHARACTERS.length, 'fighters');
