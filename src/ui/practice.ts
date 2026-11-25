import { DEVICE_IDS, deviceLabel, input } from '../core/input';
import { CHARACTERS, charById } from '../sim/characters';
import { STAGES } from '../sim/stages';
import { drawHeroCard } from '../render/rig';
import type { SlotConfig } from '../sim/types';
import type { DummyMode, PracticeOpts } from '../game/session';
import { isCharUnlocked } from '../story/campaign';
import { el, btn, cycler, portraitCanvas, mount } from './dom';
import { stagePreview } from './versus';
import type { App } from './app';

export const DUMMY_MODES: { v: DummyMode; label: string }[] = [
  { v: 'stand', label: 'Stand still' }, { v: 'shield', label: 'Hold shield' }, { v: 'crouch', label: 'Crouch' },
  { v: 'jump', label: 'Jump repeatedly' }, { v: 'cpu', label: 'Fight back (CPU)' },
];
export const DUMMY_PCTS = [0, 30, 60, 90, 120, 150, 200].map((n) => ({ v: n, label: `${n}%` }));

/** Jump straight into Practice as a given fighter (used by the Move Guide). */
export function startPracticeAs(app: App, charId: string) {
  st.charId = charId;
  launchPractice(app);
}

function launchPractice(app: App) {
  const slots: SlotConfig[] = [
    { slot: 0, type: 'HUMAN', charId: st.charId, cpuLevel: 1, device: st.device, team: -1, name: 'You' },
    { slot: 1, type: 'CPU', charId: st.dummyId, cpuLevel: st.level, team: -1, name: 'Dummy' },
  ];
  const practice: PracticeOpts = { dummy: st.dummy, level: st.level, startPct: st.startPct };
  app.startMatch('local', { rules: { mode: 'stock', stocks: 99, timeSec: 0, hp: 150, stageId: st.stageId }, slots, practice, seed: 1 }, () => app.practice());
  const s = app.session!;
  s.resetPositions();
  s.world.phase = 'play';
  s.slotTags.set(1, 'DUMMY');
}

const st = { charId: 'nova', dummyId: 'brick', stageId: 'crater', device: 'kb1', dummy: 'stand' as DummyMode, level: 3, startPct: 0 };

/** Practice / training mode setup. */
export function practiceScreen(app: App): HTMLElement {
  if (!isCharUnlocked(st.charId)) st.charId = 'nova';
  const pads = input.connectedPads();
  if (st.device === 'kb1' && pads.length) st.device = `pad${pads[0]}`;
  const root = el('div', { class: 'panel-screen practice' });
  const body = el('div', { class: 'practice-grid' });
  const charOpts = CHARACTERS.map((c) => ({ v: c.id, label: isCharUnlocked(c.id) ? c.name : `🔒 ${c.name}`, disabled: !isCharUnlocked(c.id) }));
  const render = () => {
    body.innerHTML = '';
    mount(body,
      el('div', { class: 'practice-col' },
        el('div', { class: 'section-label' }, 'You'),
        portraitCanvas(200, (c, w, h) => drawHeroCard(c, charById(st.charId), w, h), 220),
        cycler('Fighter', charOpts, st.charId, (v) => { st.charId = v; render(); }),
        cycler('Ctrl', DEVICE_IDS.map((d) => ({ v: d, label: deviceLabel(d) })), st.device, (v) => { st.device = v; })),
      el('div', { class: 'practice-col' },
        el('div', { class: 'section-label' }, 'Training dummy'),
        portraitCanvas(200, (c, w, h) => drawHeroCard(c, charById(st.dummyId), w, h), 220),
        cycler('Dummy', CHARACTERS.map((c) => ({ v: c.id, label: c.name })), st.dummyId, (v) => { st.dummyId = v; render(); }),
        cycler('Behaviour', DUMMY_MODES, st.dummy, (v) => { st.dummy = v; render(); }),
        st.dummy === 'cpu' ? cycler('CPU Lvl', Array.from({ length: 9 }, (_, k) => ({ v: k + 1, label: String(k + 1) })), st.level, (v) => { st.level = v; }) : null,
        cycler('Start %', DUMMY_PCTS, st.startPct, (v) => { st.startPct = v; })),
      el('div', { class: 'practice-col' },
        el('div', { class: 'section-label' }, 'Stage'),
        stagePreview(STAGES.find((s) => s.id === st.stageId) ?? STAGES[0], 220, 110),
        cycler('Stage', STAGES.map((s) => ({ v: s.id, label: s.name })), st.stageId, (v) => { st.stageId = v; render(); }),
        el('ul', { class: 'move-guide small' },
          el('li', {}, 'Infinite stocks, no timer.'),
          el('li', {}, 'Combo counter & damage readout (top-right).'),
          el('li', {}, 'Pause to reset positions or change the dummy.'),
          el('li', {}, 'F4 shows hitboxes & hurtboxes, F2 the perf HUD.'))),
    );
  };
  render();
  const start = () => launchPractice(app);
  root.append(
    el('div', { class: 'screen-head' }, btn('◀ Back', () => app.modes(), 'small ghost'), el('h1', {}, 'PRACTICE'), btn('START ▶', start, 'primary big', { 'data-autofocus': '' })),
    body,
  );
  return root;
}
