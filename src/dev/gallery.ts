/** Dev-only art gallery (open /#gallery): every fighter in every key pose at full DPR. */
import { CHARACTERS } from '../sim/characters';
import { Fighter, type FState } from '../sim/fighter';
import { computePose, drawRig, drawHeroCard, type Expr } from '../render/rig';
import { hasArt } from '../render/art';
import { drawSpriteFighter } from '../render/spriteFighter';

export function showGallery() {
  document.body.style.overflow = 'auto';
  document.getElementById('game')!.style.display = 'none';
  const root = document.getElementById('ui')!;
  root.className = '';
  root.style.cssText = 'position:static;display:block;padding:16px;background:#14102e';
  const dpr = window.devicePixelRatio || 1;
  const poses: [FState, string | null, number, Expr][] = [
    ['idle', null, 0, 'idle'], ['run', null, 6, 'idle'], ['air', null, 2, 'idle'], ['attack', 'fsmash', 16, 'fierce'], ['attack', 'uair', 7, 'fierce'],
    ['attack', 'dspec', 15, 'fierce'], ['shield', null, 0, 'idle'], ['hitstun', null, 4, 'hurt'], ['ledge', null, 10, 'idle'], ['crouch', null, 0, 'blink'],
  ];
  for (const c of CHARACTERS) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:flex-end;margin-bottom:10px';
    const hero = document.createElement('canvas');
    hero.style.cssText = 'width:180px;height:210px;border-radius:12px';
    hero.width = 180 * dpr; hero.height = 210 * dpr;
    const hc = hero.getContext('2d')!; hc.scale(dpr, dpr); drawHeroCard(hc, c, 180, 210, 0);
    row.append(hero);
    const strip = document.createElement('canvas');
    const W = poses.length * 130, H = 200;
    strip.style.cssText = `width:${W}px;height:${H}px;background:#2a2450;border-radius:12px`;
    strip.width = W * dpr; strip.height = H * dpr;
    const ctx = strip.getContext('2d')!; ctx.scale(dpr, dpr);
    poses.forEach(([st, mv, fr, ex], i) => {
      const f = new Fighter(0, c, { slot: 0, type: 'CPU', charId: c.id, cpuLevel: 1, team: -1 });
      f.state = st; f.stateFrame = fr; f.vy = st === 'air' ? -6 : 0;
      if (st !== 'air' && st !== 'ledge' && st !== 'hitstun') f.ground = {} as any;
      if (mv) { f.move = c.moves[mv]; f.moveFrame = fr; }
      if (hasArt(c.id)) {
        f.djAge = 999;
        ctx.save(); const k = 1.25 / Math.max(1, c.stats.size * 0.9); ctx.translate(65 + i * 130, 175); ctx.scale(k, k);
        drawSpriteFighter(ctx, f, 0, 0, 40, st === 'hitstun' ? 0.5 : 0, 1);
        ctx.restore();
        ctx.fillStyle = '#9aa'; ctx.font = '11px sans-serif'; ctx.fillText(mv ?? st, 30 + i * 130, 195);
        return;
      }
      const pose = computePose(f, 0);
      ctx.save(); ctx.translate(65 + i * 130, 175); ctx.scale(1.25 / Math.max(1, c.stats.size * 0.9), 1.25 / Math.max(1, c.stats.size * 0.9));
      if (pose.rot) { ctx.translate(0, -50); ctx.rotate(pose.rot); ctx.translate(0, 50); }
      drawRig(ctx, c, pose, null, '#0b0b14', 40, { vx: st === 'run' ? 8 : 0, vy: f.vy, grounded: !!f.ground }, ex);
      ctx.restore();
      ctx.fillStyle = '#9aa'; ctx.font = '11px sans-serif'; ctx.fillText(mv ?? st, 30 + i * 130, 195);
    });
    row.append(strip);
    root.append(row);
  }
}
