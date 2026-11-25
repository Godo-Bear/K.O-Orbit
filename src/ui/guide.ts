import { save, keyLabel, PAD_BUTTON_NAMES, type Action } from '../core/save';
import { CHARACTERS, charById } from '../sim/characters';
import { drawHeroCard } from '../render/rig';
import { isCharUnlocked, unlockHint } from '../story/campaign';
import { el, btn, portraitCanvas, mount } from './dom';
import { startPracticeAs } from './practice';
import type { App } from './app';

/** Inline input chip, e.g. [Attack · J / A]. Tokens: ← → ↑ ↓ ↗ ↘ ↙ ↖ or action names. */
type Tok = string;
const ACTION_OF: Record<string, Action> = { Attack: 'attack', Special: 'special', Jump: 'jump', Shield: 'shield', Smash: 'smash' };
function chip(t: Tok) {
  const a = ACTION_OF[t];
  if (!a) return el('span', { class: 'kchip dir' }, t);
  const k = save.kb[0].keys[a][0];
  const pad = (save.pad.buttons[a] ?? [])[0];
  const pads = pad !== undefined ? PAD_BUTTON_NAMES[pad] : a === 'smash' ? 'R-stick' : '';
  return el('span', { class: `kchip k-${a}` }, t, el('small', {}, [k ? keyLabel(k) : '', pads].filter(Boolean).join(' / ')));
}
/** Parse a notation string like "↑ + Attack, then Jump" into chips & text. */
function seq(s: string) {
  return el('span', { class: 'seq' }, s.split(/(\[[^\]]+\])/).map((part) => (part.startsWith('[') ? chip(part.slice(1, -1)) : part)));
}

interface Trick { name: string; lvl: 1 | 2 | 3; how: string; what: string; tip?: string }

const BASICS: Trick[] = [
  { name: 'Walk, dash & run', lvl: 1, how: 'Tap [→] to dash, keep holding to run. Gamepad: tilt the stick gently to walk.', what: 'Dashing is how you close distance fast. Quick-tapping left/right while dashing lets you "dance" in place.' },
  { name: 'Short hop vs. full hop', lvl: 1, how: 'Tap [Jump] quickly for a short hop, hold [Jump] for a full jump. Press again in the air to double-jump.', what: 'Short hops keep you low so your air attacks hit grounded opponents.' },
  { name: 'Tilts, smashes & aerials', lvl: 1, how: '[Attack] + direction = tilt. [Smash] + direction (or flick the stick + [Attack]) = smash attack. [Attack] in the air = aerial.', what: 'Tilts are fast and safe, smashes are slow and launch far — use them to finish.' },
  { name: 'Specials', lvl: 1, how: '[Special], [→] + [Special], [↑] + [Special], [↓] + [Special].', what: 'Every fighter has 4 unique specials. Up-special is almost always your recovery — save it for getting back to the stage!' },
  { name: 'Shield, roll & dodge', lvl: 1, how: 'Hold [Shield]. Shield + [←]/[→] = roll, Shield + [↓] = spot-dodge, [Shield] in the air = air dodge.', what: 'Shields shrink as they take hits — if it breaks you are stunned. Dodges make you invincible for a moment.' },
  { name: 'Drop through platforms', lvl: 1, how: 'Stand on a thin platform and tap [↓].', what: 'Thin platforms (the light ones) can be dropped through and jumped up through. Thick main stages cannot.' },
];

const TRICKS: Trick[] = [
  { name: 'Fast fall', lvl: 1, how: 'At the top of a jump, tap [↓].', what: 'You fall much faster — land before your opponent expects, or dodge out of the air quickly.', tip: 'Combine with a short hop for a quick, low, safe attack.' },
  { name: 'Short-hop aerial ("the drop-kick")', lvl: 2, how: '[Jump] (tap), [Attack] immediately, then [↓] to fast fall.', what: 'A fast attack that lands almost instantly. The bread-and-butter approach of good players.', tip: 'Neutral-air and forward-air work best.' },
  { name: 'Reverse aerial (back-air)', lvl: 2, how: 'Jump facing away from your opponent, then [←] + [Attack] (back toward them).', what: 'Back-airs are among the strongest aerials and come out fast. Great for finishing.' },
  { name: 'Dash dance', lvl: 2, how: 'Tap [→] [←] [→] [←] quickly.', what: 'Flicker back and forth to bait your opponent into attacking empty air, then punish.' },
  { name: 'Dash-cancel tilt', lvl: 2, how: 'Press [Attack] within the first 3 frames of a dash.', what: 'You get a forward tilt instead of a dash attack — a sudden poke out of movement.' },
  { name: 'Jump out of shield', lvl: 2, how: 'While shielding, press [Jump], then [Attack] (up-air or neutral-air).', what: 'Jumping cancels your shield instantly — the fastest way to punish someone who hit your shield.' },
  { name: 'Input buffer', lvl: 1, how: 'Press your next move slightly early, during the end of the previous one.', what: 'Attacks, jumps, specials and shields are remembered for 6 frames and come out the instant you can act.' },
  { name: 'Coyote jump', lvl: 1, how: 'Run off a ledge and press [Jump] right away.', what: 'For a few frames after walking off an edge you can still do a full ground jump — your double jump is saved.' },
  { name: 'Smash charge', lvl: 1, how: 'Hold [Smash] (or [Attack] after a flick) during a smash attack.', what: 'Charge for up to a second for up to 40% more damage and knockback. You flash and shake while charging.' },
  { name: 'Ledge options', lvl: 2, how: 'Hanging on a ledge: [→] climb, [Jump] ledge-jump, [Shield] roll in, [Attack] get-up attack, [↓] drop.', what: 'You are briefly invincible after grabbing a ledge. Mix up your options so opponents cannot guess.', tip: 'Drop + double jump + aerial is a sneaky option.' },
  { name: 'Tech', lvl: 3, how: 'When launched, press [Shield] just before hitting the floor or a wall. Hold [←]/[→] to tech-roll.', what: 'You recover instantly instead of bouncing and lying on the ground — opponents can not follow up.' },
  { name: 'DI (Directional Influence)', lvl: 3, how: 'When hit hard, hold a direction at 90° to the launch — usually up and toward the stage.', what: 'Changes your launch angle slightly. Good DI lets you survive hits that would normally KO you.' },
  { name: 'Meteor spike', lvl: 3, how: 'Off-stage, above an opponent: [↓] + [Attack] (down-air).', what: 'Many down-airs smash opponents straight down — an early KO if they are below the ledge.' },
  { name: 'Air-dodge recovery', lvl: 2, how: 'Off-stage: hold toward the stage and press [Shield].', what: 'A directional air dodge zips you a short distance — useful after your up-special is used.' },
  { name: 'Reflect & counter', lvl: 2, how: 'Volt, Glacia and Kaida: [↓] + [Special] reflects projectiles. Zephyr and Rook: [↓] + [Special] counters.', what: 'Reflected shots fly back faster and stronger. Counters punish anyone who attacks during the window.' },
  { name: 'Armor moves', lvl: 2, how: 'Granite [→] + [Special], Bolt-9 [↓] + [Special], Glacia [↓] + [Special].', what: 'These moves cannot be interrupted by weaker hits — plough straight through an attack.' },
];

const COMBOS: Record<string, string[]> = {
  nova: ['[↑] + [Attack] ×3 → [Jump] → [↑] + [Attack] — up-tilt juggle at low %', '[Special] → [→] + [Special] — shoot, then comet-dash in after the plasma shot', 'Short hop [Attack] → [Attack] — neutral-air into jab'],
  volt: ['[Special] → [→] + [Special] — ball lightning covers the approach, arc lash hits from far away', '[↓] + [Special] against projectiles — send them back', '[↑] + [Special] aimed at the ledge — Thunder Leap teleports in any direction'],
  brick: ['[→] + [Special] through a projectile → [Smash] — armored shoulder charge into forward smash', 'Off-stage [↓] + [Attack] — huge spike', '[Special] → dash [Attack] — boulder toss, then follow it in'],
  zephyr: ['[Special] → [→] + [Special] → [→] + [Attack] — shuriken, gale step, forward-air', '[↑] + [Attack] × 3 with four jumps — the "ladder" juggle', '[↓] + [Special] when they charge a smash — perfect counter'],
  ember: ['[Special] → dash [Attack] — bounce a fireball and chase it', '[→] + [Special] → [↑] + [Attack] — flame wheel into up-air', '[↓] + [Special] at the ledge — magma burst edge-guard'],
  glacia: ['[Special] (freeze) → [Smash] — frozen foes can not escape a forward smash', '[→] + [Special] → [↑] + [Attack] — ice slide pops them up for an up-tilt', '[↓] + [Special] vs projectiles — reflects and armors'],
  rook: ['Hold [Special] at the ledge — full Charge Blade when they climb up', '[→] + [Special] → [→] + [Attack] — lunge, then forward-air', '[↓] + [Special] vs a smash attack — riposte punishes hard'],
  omega: ['[Special] → [→] + [Special] — void orb homes in, warp strike behind them', '[↓] + [Special] → [↑] + [Smash] — singularity pulls them in for an up smash', 'Off-stage [↓] + [Attack] — spike'],
  kaida: ['[Special] at max range — the water whip tip hits hardest', '[→] + [Special] → [↑] + [Attack] — tide rush into up-air', '[↑] + [Special] → [↑] + [Attack] — geyser launch, then follow up'],
  pip: ['[Special] spam from range — arcane bolts are fast and safe', '[→] + [Special] → [←] + [Attack] — blink behind them, back-air', '[↓] + [Special] on a ledge-hanging foe — the giant book spikes them'],
  seraphine: ['[Special] → [→] + [Special] — throw the sun spear, then wing-dash after it', '[↑] + [Attack] → [Jump] → [↑] + [Attack] — long spear reach juggle', '[↓] + [Special] when surrounded — solar flare blasts everyone close'],
  bolt9: ['[→] + [Special] → [↓] + [Smash] — magnet pull drags them into a down smash', '[Special] at the ledge — rocket fist edge-guard', '[↓] + [Special] through their attack — armored overheat blast'],
};
const SPECIAL_DIR: Record<string, string> = { nspec: '[Special]', sspec: '[→] + [Special]', uspec: '[↑] + [Special]', dspec: '[↓] + [Special]' };

const stars = (n: number) => el('span', { class: 'lvl' }, '★'.repeat(n), el('span', { class: 'dim' }, '★'.repeat(3 - n)));
const trickCard = (t: Trick) => el('div', { class: 'trick' },
  el('div', { class: 'trick-head' }, el('b', {}, t.name), stars(t.lvl)),
  el('div', { class: 'trick-how' }, seq(t.how)),
  el('div', { class: 'muted' }, t.what),
  t.tip ? el('div', { class: 'trick-tip' }, '💡 ', t.tip) : null);

export function guideScreen(app: App, back: () => void, startTab: 'basics' | 'tricks' | 'fighters' = 'basics'): HTMLElement {
  let tab = startTab;
  let fighter = CHARACTERS[0].id;
  const tabs = el('div', { class: 'tabs' });
  const body = el('div', { class: 'guide-body' });
  const render = () => {
    tabs.innerHTML = '';
    for (const [id, label] of [['basics', 'Basics'], ['tricks', 'Tricks & Tech'], ['fighters', 'Fighter Moves & Combos']] as const) {
      tabs.append(btn(label, () => { tab = id; render(); }, `tab ${tab === id ? 'sel' : ''}`));
    }
    body.innerHTML = '';
    if (tab === 'basics') mount(body, el('div', { class: 'trick-grid' }, BASICS.map(trickCard)));
    if (tab === 'tricks') mount(body, el('p', { class: 'muted small' }, '★ easy · ★★ intermediate · ★★★ advanced. Try them in Practice — the combo counter shows when they work.'), el('div', { class: 'trick-grid' }, TRICKS.map(trickCard)));
    if (tab === 'fighters') {
      const c = charById(fighter);
      const unlocked = isCharUnlocked(c.id);
      mount(body,
        el('div', { class: 'fighter-pick' }, CHARACTERS.map((ch) => btn(ch.name, () => { fighter = ch.id; render(); }, `small ${ch.id === fighter ? 'sel' : ''}`))),
        el('div', { class: 'fighter-guide' },
          el('div', { class: 'fg-art' }, portraitCanvas(220, (ctx, w, h) => drawHeroCard(ctx, c, w, h), 250),
            unlocked ? btn(`Practice as ${c.name} ▶`, () => startPracticeAs(app, c.id), 'primary') : el('div', { class: 'muted small' }, `🔒 ${unlockHint(c.id)}`)),
          el('div', { class: 'fg-info' },
            el('h2', {}, c.name, el('span', { class: 'muted' }, ` — ${c.title}`)),
            el('p', { class: 'muted' }, c.blurb),
            el('div', { class: 'ratings' }, (['speed', 'power', 'weight', 'air'] as const).map((k) => el('span', {}, `${k[0].toUpperCase()}${k.slice(1)} `, el('b', {}, '■'.repeat(c.ratings[k]), el('span', { class: 'dim' }, '■'.repeat(5 - c.ratings[k])))))),
            el('h3', {}, 'Special moves'),
            el('div', { class: 'spec-list' }, ['nspec', 'sspec', 'uspec', 'dspec'].map((m) => el('div', { class: 'spec' }, seq(SPECIAL_DIR[m]), el('b', {}, c.moves[m].name)))),
            el('h3', {}, 'Combos & tricks'),
            el('ol', { class: 'combo-list' }, (COMBOS[c.id] ?? []).map((x) => el('li', {}, seq(x)))),
            el('h3', {}, 'Stats'),
            el('div', { class: 'muted small' }, `${c.stats.jumps} jumps · weight ${c.stats.weight} · run speed ${c.stats.run}`))));
    }
  };
  render();
  return el('div', { class: 'panel-screen guide-screen' },
    el('div', { class: 'screen-head' }, btn('◀ Back', back, 'small ghost'), el('h1', {}, 'MOVE GUIDE'), el('span', { class: 'count-pill' }, 'Keys 1 / Gamepad shown')),
    tabs, body);
}
