import { save, persist } from '../core/save';
import { DEVICE_IDS, deviceLabel, input } from '../core/input';
import { CHARACTERS, charById } from '../sim/characters';
import { stageById } from '../sim/stages';
import { drawPortrait, drawHeroCard } from '../render/rig';
import type { SlotConfig } from '../sim/types';
import { STORY, isStageUnlocked, isCharUnlocked, totalStars, type StoryStage } from '../story/campaign';
import { el, btn, cycler, portraitCanvas, mount } from './dom';
import { stagePreview } from './versus';
import { storyMapCanvas } from './keyart';
import type { App } from './app';

const pick = { charId: 'nova', device: 'kb1', selected: 0 };

export const DIFFICULTIES = [
  { v: 0, label: 'Easy', lvl: -2, stocks: 1, hp: 0.8 },
  { v: 1, label: 'Normal', lvl: 0, stocks: 0, hp: 1 },
  { v: 2, label: 'Hard', lvl: 2, stocks: 0, hp: 1.15 },
  { v: 3, label: 'Expert', lvl: 4, stocks: -1, hp: 1.3 },
];

export function buildStoryMatch(st: StoryStage, charId: string, device: string) {
  const teamed = st.enemies.some((e) => e.team !== undefined);
  const d = DIFFICULTIES[save.settings.difficulty] ?? DIFFICULTIES[1];
  const slots: SlotConfig[] = [{
    slot: 0, type: 'HUMAN', charId, cpuLevel: 1, device, team: teamed ? 0 : -1,
    stocks: st.rules.mode === 'time' ? undefined : Math.max(1, (st.playerStocks ?? st.rules.stocks) + d.stocks), hp: st.playerHp, name: 'You',
  }];
  st.enemies.forEach((e, i) => slots.push({
    slot: i + 1, type: 'CPU', charId: e.charId, cpuLevel: Math.max(1, Math.min(9, e.level + d.lvl)), team: e.team ?? -1, scale: e.scale, armor: e.armor, stocks: e.stocks,
    hp: Math.round((e.hp ?? st.rules.hp) * d.hp),
  }));
  // easier difficulties: CPUs attack one at a time everywhere; Expert lets them all pile in
  const maxGangUp = d.v === 0 ? 1 : d.v === 3 ? undefined : st.rules.maxGangUp;
  return { rules: { ...st.rules, maxGangUp }, slots, story: st, seed: Math.floor(Math.random() * 1e6) };
}

export function storyMapScreen(app: App): HTMLElement {
  if (!isCharUnlocked(pick.charId)) pick.charId = 'nova';
  const pads = input.connectedPads();
  if (pick.device === 'kb1' && pads.length) pick.device = `pad${pads[0]}`;
  // default selection: first uncleared unlocked stage
  const firstOpen = STORY.findIndex((s, i) => isStageUnlocked(i) && !save.story.cleared[s.id]);
  if (!isStageUnlocked(pick.selected)) pick.selected = 0;
  if (firstOpen >= 0 && pick.selected === 0 && firstOpen !== 0) pick.selected = firstOpen;

  const root = el('div', { class: 'panel-screen story' });
  const map = el('div', { class: 'story-map' });
  const brief = el('div', { class: 'story-brief' });

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.classList.add('story-path');
  for (let i = 1; i < STORY.length; i++) {
    const a = STORY[i - 1].map, b = STORY[i].map;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y)); line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y));
    line.setAttribute('class', isStageUnlocked(i) ? 'open' : 'locked');
    svg.append(line);
  }
  map.append(svg);

  const renderBrief = () => {
    const i = pick.selected, st = STORY[i];
    const best = save.story.cleared[st.id] ?? 0;
    brief.innerHTML = '';
    const stage = stageById(st.rules.stageId);
    mount(brief,
      el('div', { class: 'chapter' }, `${st.chapter} · Stage ${i + 1}/${STORY.length}`),
      el('h2', {}, st.title),
      el('div', { class: 'stars' }, [1, 2, 3].map((k) => el('span', { class: k <= best ? 'star on' : 'star' }, '★'))),
      el('p', { class: 'narrative' }, st.briefing),
      el('div', { class: 'objective' }, el('b', {}, 'Objective: '), st.objective),
      el('div', { class: 'brief-row' },
        el('div', { class: 'brief-stage' }, stagePreview(stage, 150, 75), el('span', {}, stage.name)),
        el('div', { class: 'enemies' }, st.enemies.map((e) => el('div', { class: 'enemy' },
          portraitCanvas(54, (c, s) => drawPortrait(c, charById(e.charId), s / 2, s * 0.05, s * 1.2)),
          el('span', {}, `${charById(e.charId).name}${e.scale && e.scale > 1.3 ? ' (Giant)' : ''}`),
          el('span', { class: 'muted' }, `Lv ${Math.max(1, Math.min(9, e.level + (DIFFICULTIES[save.settings.difficulty] ?? DIFFICULTIES[1]).lvl))}`))))),
      el('div', { class: 'muted small' }, `★★ take ≤ ${st.stars.damage} damage · ★★★ clear within ${st.stars.time}s`),
      st.reward ? el('div', { class: 'reward' }, '🔓 Reward: ', el('b', {}, isCharUnlocked(st.reward) ? `${charById(st.reward).name} (unlocked)` : `Unlock ${charById(st.reward).name}`)) : null,
      el('div', { class: 'brief-pick' },
        el('div', { class: 'pick-portrait' }, portraitCanvas(96, (c, wd, ht) => drawHeroCard(c, charById(pick.charId), wd, ht), 110)),
        el('div', { class: 'pick-cycs' },
          cycler('Difficulty', DIFFICULTIES.map((x) => ({ v: x.v, label: x.label })), save.settings.difficulty, (v) => { save.settings.difficulty = v; persist(); renderBrief(); }),
          cycler('Fighter', CHARACTERS.map((c) => ({ v: c.id, label: isCharUnlocked(c.id) ? c.name : `🔒 ${c.name}`, disabled: !isCharUnlocked(c.id) })), pick.charId, (v) => { pick.charId = v; renderBrief(); }),
          cycler('Ctrl', DEVICE_IDS.map((d) => ({ v: d, label: deviceLabel(d) })), pick.device, (v) => { pick.device = v; }))),
      btn('START STAGE ▶', () => app.startMatch('local', buildStoryMatch(st, pick.charId, pick.device), () => app.story()), 'primary big', { 'data-autofocus': '' }),
    );
  };

  STORY.forEach((st, i) => {
    const open = isStageUnlocked(i);
    const best = save.story.cleared[st.id] ?? 0;
    const node = btn([el('span', { class: 'node-num' }, open ? String(i + 1) : '🔒'), best ? el('span', { class: 'node-stars' }, '★'.repeat(best)) : null, st.reward ? el('span', { class: 'node-reward' }, '🎁') : null],
      () => { if (!open) return; pick.selected = i; map.querySelectorAll('.story-node').forEach((n) => n.classList.remove('sel')); node.classList.add('sel'); renderBrief(); },
      `story-node ${open ? '' : 'locked'} ${best ? 'cleared' : ''} ${i === pick.selected ? 'sel' : ''} ${i === STORY.length - 1 ? 'boss' : ''}`,
      { style: `left:${st.map.x}%;top:${st.map.y}%`, title: st.title, disabled: !open });
    map.append(node);
  });
  renderBrief();

  root.append(
    el('div', { class: 'screen-head' }, btn('◀ Back', () => app.modes(), 'small ghost'), el('h1', {}, 'STORY MODE'), el('div', { class: 'count-pill' }, `★ ${totalStars()}/${STORY.length * 3}`)),
    el('div', { class: 'story-layout' }, el('div', { class: 'map-wrap' }, el('div', { class: 'map-title' }, 'THE ORBIT OF AUREX'), map), brief),
  );
  storyMapCanvas(root.querySelector('.map-wrap') as HTMLElement);
  return root;
}
