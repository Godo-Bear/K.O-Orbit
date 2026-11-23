import { MAX_PLAYERS, PLAYER_COLORS, playerLabel } from '../core/constants';
import { input, deviceLabel, DEVICE_IDS } from '../core/input';
import { synth } from '../audio/synth';
import { CHARACTERS, charById } from '../sim/characters';
import { STAGES, type StageDef } from '../sim/stages';
import { THEMES } from '../render/background';
import { drawPortrait } from '../render/rig';
import type { MatchRules, SlotConfig } from '../sim/types';
import { isCharUnlocked } from '../story/campaign';
import { el, btn, cycler, toggle, toast, portraitCanvas } from './dom';
import type { App } from './app';

type SlotType = 'HUMAN' | 'CPU' | 'OFF';
interface VSlot { type: SlotType; charId: string; cpuLevel: number; device: string; team: number }

const state = {
  slots: Array.from({ length: MAX_PLAYERS }, (_, i): VSlot => ({
    type: i === 0 ? 'HUMAN' : i === 1 ? 'CPU' : 'OFF', charId: CHARACTERS[i % 4].id, cpuLevel: 3, device: i === 0 ? 'kb1' : 'kb2', team: i % 2,
  })),
  mode: 'stock' as MatchRules['mode'], stocks: 3, timeSec: 180, hp: 150, stageId: 'station', teams: false,
};

export function stagePreview(st: StageDef, w: number, h: number) {
  return portraitCanvas(w, (ctx) => {
    const H = (h / w) * w;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, st.sky[0]); g.addColorStop(0.6, st.sky[1]); g.addColorStop(1, st.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, H);
    const th = THEMES[st.theme];
    const sx = w / 2200, cx = w / 2, cy = H * 0.62;
    for (const p of st.platforms) {
      ctx.fillStyle = p.solid ? th.body1 : th.soft;
      if (p.solid) {
        ctx.beginPath(); ctx.moveTo(cx + p.x1 * sx, cy); ctx.lineTo(cx + p.x2 * sx, cy); ctx.lineTo(cx + p.x2 * sx * 0.5, cy + (p.h ?? 200) * sx); ctx.lineTo(cx + p.x1 * sx * 0.5, cy + (p.h ?? 200) * sx); ctx.fill();
        ctx.fillStyle = th.top; ctx.fillRect(cx + p.x1 * sx, cy, (p.x2 - p.x1) * sx, 3);
      } else ctx.fillRect(cx + p.x1 * sx, cy + p.y * sx, (p.x2 - p.x1) * sx, 3);
      if (p.move) { ctx.fillStyle = th.glow; ctx.fillRect(cx + ((p.x1 + p.x2) / 2) * sx - 2, cy + p.y * sx + 4, 4, 2); }
    }
  });
}

export function versusScreen(app: App): HTMLElement {
  const root = el('div', { class: 'panel-screen versus' });
  const slotsWrap = el('div', { class: 'slots-grid' });
  const countEl = el('span', { class: 'count-pill' });
  const rulesWrap = el('div', { class: 'rules-row' });

  const activeCount = () => state.slots.filter((s) => s.type !== 'OFF').length;
  const updateCount = () => { countEl.textContent = `${activeCount()}/${MAX_PLAYERS} fighters`; };

  const firstUnlocked = (from: string) => (isCharUnlocked(from) ? from : CHARACTERS.find((c) => isCharUnlocked(c.id))!.id);

  const renderSlot = (i: number): HTMLElement => {
    const s = state.slots[i];
    s.charId = firstUnlocked(s.charId);
    const col = PLAYER_COLORS[i];
    const c = charById(s.charId);
    const card = el('div', { class: `slot-card ${s.type.toLowerCase()}`, style: `--pc:${col}` });
    const refresh = () => { const n = renderSlot(i); card.replaceWith(n); updateCount(); };
    card.append(
      el('div', { class: 'slot-head' }, el('b', {}, playerLabel(i)),
        cycler(null, [{ v: 'HUMAN', label: 'HUMAN' }, { v: 'CPU', label: 'CPU' }, { v: 'OFF', label: 'OFF' }], s.type, (v) => { s.type = v; refresh(); }, 'type-cyc')),
    );
    if (s.type === 'OFF') {
      card.append(el('div', { class: 'slot-empty' }, 'Press START on a gamepad to join'));
      return card;
    }
    card.append(...[
      el('div', { class: 'slot-portrait' }, portraitCanvas(92, (ctx, sz) => drawPortrait(ctx, c, sz / 2, sz * 0.02, sz * 1.25))),
      cycler(null, CHARACTERS.map((ch) => ({ v: ch.id, label: isCharUnlocked(ch.id) ? ch.name : `🔒 ${ch.name}`, disabled: !isCharUnlocked(ch.id) })), s.charId, (v) => { s.charId = v; refresh(); }, 'char-cyc'),
      s.type === 'HUMAN'
        ? cycler('Ctrl', DEVICE_IDS.map((d) => ({ v: d, label: deviceLabel(d) })), s.device, (v) => { s.device = v; })
        : cycler('Lvl', Array.from({ length: 9 }, (_, k) => ({ v: k + 1, label: String(k + 1) })), s.cpuLevel, (v) => { s.cpuLevel = v; }),
      state.teams ? cycler('Team', [0, 1, 2, 3].map((t) => ({ v: t, label: ['Red', 'Blue', 'Green', 'Gold'][t] })), s.team, (v) => { s.team = v; }) : null,
    ].filter((x): x is HTMLDivElement => !!x));
    return card;
  };

  const renderSlots = () => { slotsWrap.innerHTML = ''; for (let i = 0; i < MAX_PLAYERS; i++) slotsWrap.append(renderSlot(i)); updateCount(); };

  const renderRules = () => {
    rulesWrap.innerHTML = '';
    rulesWrap.append(...[
      cycler('Mode', [{ v: 'stock', label: 'Stock' }, { v: 'time', label: 'Time' }, { v: 'stamina', label: 'Stamina' }], state.mode, (v) => { state.mode = v; renderRules(); }),
      state.mode === 'time'
        ? cycler('Time', [60, 120, 180, 300, 480].map((t) => ({ v: t, label: `${t / 60}:00` })), state.timeSec, (v) => { state.timeSec = v; })
        : cycler('Stocks', [1, 2, 3, 4, 5, 7, 10, 99].map((n) => ({ v: n, label: String(n) })), state.stocks, (v) => { state.stocks = v; }),
      state.mode === 'stamina' ? cycler('HP', [100, 150, 200, 300].map((n) => ({ v: n, label: String(n) })), state.hp, (v) => { state.hp = v; }) : null,
      toggle('Teams', state.teams, (v) => { state.teams = v; renderSlots(); }),
      btn('Fill CPUs', () => { state.slots.forEach((s, i) => { if (s.type === 'OFF') { s.type = 'CPU'; s.charId = firstUnlocked(CHARACTERS[(i * 3) % 8].id); s.cpuLevel = 3 + (i % 5); } }); renderSlots(); }, 'small'),
      btn('Clear', () => { state.slots.forEach((s, i) => { if (i > 0) s.type = 'OFF'; }); renderSlots(); }, 'small'),
      countEl,
    ].filter((x): x is HTMLElement => !!x));
  };

  const stageRow = el('div', { class: 'stage-row' });
  const renderStages = () => {
    stageRow.innerHTML = '';
    for (const st of [...STAGES, null]) {
      const id = st ? st.id : 'random';
      const b = btn([st ? stagePreview(st, 120, 60) : el('div', { class: 'rand-stage' }, '?'), el('span', {}, st ? st.name : 'Random')], () => { state.stageId = id; renderStages(); (stageRow.querySelector(`[data-stage="${id}"]`) as HTMLElement)?.focus(); }, `stage-card ${state.stageId === id ? 'sel' : ''}`, { 'data-stage': id });
      stageRow.append(b);
    }
  };

  const start = () => {
    const active = state.slots.map((s, i) => ({ s, i })).filter((x) => x.s.type !== 'OFF');
    if (active.length < 2) { toast('Need at least 2 fighters'); synth.menuBack(); return; }
    if (state.teams && new Set(active.map((a) => a.s.team)).size < 2) { toast('Teams mode needs at least 2 different teams'); return; }
    const slots: SlotConfig[] = active.map(({ s, i }) => ({ slot: i, type: s.type as 'HUMAN' | 'CPU', charId: s.charId, cpuLevel: s.cpuLevel, device: s.device, team: state.teams ? s.team : -1 }));
    const stageId = state.stageId === 'random' ? STAGES[Math.floor(Math.random() * STAGES.length)].id : state.stageId;
    const rules: MatchRules = { mode: state.mode, stocks: state.stocks, timeSec: state.mode === 'time' ? state.timeSec : 0, hp: state.hp, stageId };
    off();
    app.startMatch('local', { rules, slots, seed: Math.floor(Math.random() * 1e6) }, () => app.versus());
  };

  // press START on an unused gamepad to join
  const off = app.onStep(() => {
    if (!root.isConnected) { off(); return; }
    for (const d of DEVICE_IDS) {
      if (!d.startsWith('pad') || !input.get(d).pauseP) continue;
      if (state.slots.some((s) => s.type === 'HUMAN' && s.device === d)) continue;
      const i = state.slots.findIndex((s) => s.type === 'OFF');
      const j = i >= 0 ? i : state.slots.findIndex((s) => s.type === 'CPU');
      if (j < 0) { toast(`All ${MAX_PLAYERS} slots are full`); continue; }
      state.slots[j].type = 'HUMAN'; state.slots[j].device = d;
      toast(`${deviceLabel(d)} joined as ${playerLabel(j)}`);
      synth.menuSelect();
      renderSlots();
    }
  });

  renderRules(); renderStages(); renderSlots();
  root.append(
    el('div', { class: 'screen-head' },
      btn('◀ Back', () => { off(); app.modes(); }, 'small ghost'),
      el('h1', {}, 'VERSUS'),
      btn('FIGHT! ▶', start, 'primary big', { 'data-autofocus': '' })),
    rulesWrap,
    el('div', { class: 'section-label' }, 'Stage'),
    stageRow,
    el('div', { class: 'section-label' }, 'Fighters (P1–P10)'),
    slotsWrap,
  );
  return root;
}
