import { save, persist, resetProgress, resetControls, ACTIONS, ACTION_LABELS, keyLabel, PAD_BUTTON_NAMES, type Action } from '../core/save';
import { input } from '../core/input';
import { synth } from '../audio/synth';
import { music } from '../audio/music';
import { unlockAll } from '../story/campaign';
import { DIFFICULTIES } from './story';
import { DEVICE_IDS, deviceLabel } from '../core/input';
import { el, btn, cycler, slider, toggle, toast, mount } from './dom';
import type { App } from './app';

export function settingsScreen(app: App, back: () => void): HTMLElement {
  const s = save.settings;
  const set = (fn: () => void) => { fn(); persist(); synth.applyVolume(); music.applyVolume(); };
  let confirmReset = false;
  const resetBtn = btn('Reset Story Progress', () => {
    if (!confirmReset) { confirmReset = true; resetBtn.textContent = 'Press again to confirm reset'; return; }
    resetProgress(); toast('Progress reset — unlockable fighters are locked again'); confirmReset = false; resetBtn.textContent = 'Reset Story Progress';
  }, 'danger');
  const serverIn = el('input', { type: 'text', value: s.onlineServer, placeholder: '(same origin)', 'data-nav': '', class: 'text-in' }) as HTMLInputElement;
  serverIn.addEventListener('change', () => set(() => { s.onlineServer = serverIn.value.trim(); }));
  return el('div', { class: 'panel-screen settings' },
    el('div', { class: 'screen-head' }, btn('◀ Back', back, 'small ghost'), el('h1', {}, 'SETTINGS'), el('span', {})),
    el('div', { class: 'settings-grid' },
      el('h3', {}, 'Gameplay'),
      cycler('Story difficulty', DIFFICULTIES.map((x) => ({ v: x.v, label: x.label })), s.difficulty, (v) => set(() => { s.difficulty = v; })),
      el('p', { class: 'muted small' }, 'Easy: weaker CPUs and an extra life. Hard / Expert: smarter, tougher opponents (Expert also removes a life). Versus CPU levels are set per slot or with "All CPUs".'),
      cycler('Touch controls', [{ v: 'auto', label: 'Auto (phones & tablets)' }, { v: 'on', label: 'Always on' }, { v: 'off', label: 'Off' }], s.touch, (v) => set(() => { s.touch = v; })),
      el('h3', {}, 'Audio'),
      slider('Master volume', s.master, 0, 1, 0.05, (v) => set(() => { s.master = v; })),
      slider('Effects volume', s.sfx, 0, 1, 0.05, (v) => set(() => { s.sfx = v; })),
      slider('Music volume', s.music, 0, 1, 0.05, (v) => set(() => { s.music = v; })),
      toggle('Mute', s.muted, (v) => set(() => { s.muted = v; })),
      el('h3', {}, 'Video & Performance'),
      cycler('Fighter art', [{ v: 'illustrated', label: 'Illustrated (character art)' }, { v: 'rig', label: 'Animated vector rig' }], s.fighterStyle, (v) => set(() => { s.fighterStyle = v; })),
      cycler('Resolution', [{ v: 0, label: 'Auto — 4K, adapts to stay smooth' }, { v: 1, label: 'Native (always full)' }, { v: 0.75, label: '75%' }, { v: 0.5, label: '50% (fastest)' }], s.renderScale, (v) => set(() => { s.renderScale = v; app.renderer.setRenderScale(v); if (v === 0) app.adaptive.reset(); })),
      el('p', { class: 'muted small' }, 'Auto renders at your screen’s native sharpness up to 4K and briefly lowers the resolution only if the frame rate drops, then climbs back. Turn on the Perf HUD (F2) to see the live resolution.'),
      cycler('Visual intensity', [{ v: 2, label: 'Full' }, { v: 1, label: 'Reduced' }, { v: 0, label: 'Minimal' }], s.intensity, (v) => set(() => { s.intensity = v; })),
      el('p', { class: 'muted small' }, 'Reduced / Minimal tone down flashes, screen shake and particle density (defaults to Reduced when your OS requests reduced motion).'),
      toggle('Screen shake', s.screenShake, (v) => set(() => { s.screenShake = v; })),
      toggle('Perf / debug HUD (F2)', s.showPerf, (v) => set(() => { s.showPerf = v; })),
      el('h3', {}, 'Online'),
      el('label', { class: 'field' }, el('span', {}, 'Relay server URL (blank = this site)'), serverIn),
      cycler('Host input delay', [0, 1, 2, 3, 4, 6].map((n) => ({ v: n, label: `${n} frames` })), s.inputDelay, (v) => set(() => { s.inputDelay = v; })),
      el('h3', {}, 'Save Data'),
      btn('Unlock All Fighters & Stages', () => { unlockAll(); synth.unlockJingle(); toast('All fighters and story stages unlocked!'); }),
      resetBtn,
      btn('Reset Controls to Default', () => { resetControls(); toast('Controls reset'); }),
    ),
  );
}

export function controlsGuide(): HTMLElement {
  const k1 = save.kb[0].keys, k2 = save.kb[1].keys;
  const fmt = (ks: string[]) => ks.map(keyLabel).join(' / ') || '—';
  const pad = (a: Action) => (save.pad.buttons[a] || []).map((b) => PAD_BUTTON_NAMES[b] ?? `B${b}`).join(' / ') || '—';
  return el('div', { class: 'guide' },
    el('table', { class: 'guide-table' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Action'), el('th', {}, 'Keys 1'), el('th', {}, 'Keys 2'), el('th', {}, 'Gamepad'))),
      el('tbody', {},
        el('tr', {}, el('td', {}, 'Move'), el('td', {}, `${fmt(k1.up)} ${fmt(k1.left)} ${fmt(k1.down)} ${fmt(k1.right)}`), el('td', {}, `${fmt(k2.up)} ${fmt(k2.left)} ${fmt(k2.down)} ${fmt(k2.right)}`), el('td', {}, 'Left stick / D-Pad')),
        (['jump', 'attack', 'special', 'shield', 'smash', 'pause'] as Action[]).map((a) =>
          el('tr', {}, el('td', {}, ACTION_LABELS[a]), el('td', {}, fmt(k1[a])), el('td', {}, fmt(k2[a])), el('td', {}, a === 'smash' ? `Right stick${pad(a) !== '—' ? ' / ' + pad(a) : ''}` : pad(a)))),
      )),
    el('ul', { class: 'move-guide' },
      el('li', {}, el('b', {}, 'Mouse (Keys 1 default): '), 'Left click = attack, right click = special, middle click = shield, scroll up = jump, scroll down = smash. Rebind any mouse button or scroll direction in Controls.'),
      el('li', {}, el('b', {}, 'Dash: '), 'tap a direction (keyboard) or flick the stick. Hold to run.'),
      el('li', {}, el('b', {}, 'Tilts: '), 'Attack + direction. ', el('b', {}, 'Smash: '), 'Smash key + direction, right stick, or flick + Attack. Hold to charge.'),
      el('li', {}, el('b', {}, 'Specials: '), 'Special + neutral / side / up (recovery) / down.'),
      el('li', {}, el('b', {}, 'Aerials: '), 'Attack in the air — neutral, forward, back, up, down (spike!). Landing during one causes landing lag.'),
      el('li', {}, el('b', {}, 'Jump: '), 'tap for short hop, hold for full hop. Up also jumps when Tap-Jump is on. Press again in the air to double-jump.'),
      el('li', {}, el('b', {}, 'Fast-fall: '), 'tap down while falling. ', el('b', {}, 'Drop-through: '), 'tap down on a thin platform.'),
      el('li', {}, el('b', {}, 'Shield: '), 'hold Shield. + direction = roll, + down = spot dodge, in air = air dodge. Jump cancels shield.'),
      el('li', {}, el('b', {}, 'Tech: '), 'press Shield just before hitting the ground while launched.'),
      el('li', {}, el('b', {}, 'Ledge: '), 'grab automatically. Toward/Up = climb, Jump = ledge jump, Shield = roll, Attack = getup attack, Down/Away = drop.'),
    ),
  );
}

export function controlsScreen(app: App, back: () => void): HTMLElement {
  let tab: 'kb1' | 'kb2' | 'pad' | 'guide' = 'kb1';
  const body = el('div', { class: 'controls-body' });
  const tabs = el('div', { class: 'tabs' });
  let capturing: HTMLElement | null = null;

  const cancelCapture = () => { input.captureKey = null; input.capturePad = null; capturing?.classList.remove('capturing'); capturing = null; };

  const renderTabs = () => {
    tabs.innerHTML = '';
    for (const [id, label] of [['kb1', 'Keyboard 1'], ['kb2', 'Keyboard 2'], ['pad', 'Gamepads'], ['guide', 'Move Guide']] as const) {
      tabs.append(btn(label, () => { cancelCapture(); tab = id; renderTabs(); render(); }, `tab ${tab === id ? 'sel' : ''}`));
    }
  };

  const render = () => {
    body.innerHTML = '';
    if (tab === 'guide') { body.append(controlsGuide()); return; }
    if (tab === 'pad') {
      const ps = save.pad;
      const pads = input.connectedPads();
      mount(body,
        el('p', { class: 'muted' }, pads.length ? `Connected: ${pads.map((p) => `Pad ${p + 1}`).join(', ')}` : 'No gamepad detected — press any button on a controller to wake it up.'),
        el('p', { class: 'muted small' }, 'Movement uses the left stick / D-Pad; the right stick performs smash attacks. All gamepads share this mapping (standard layout).'),
        el('div', { class: 'bind-table' }, (['jump', 'attack', 'special', 'shield', 'smash', 'pause'] as Action[]).map((a) => {
          const list = ps.buttons[a] ?? [];
          return el('div', { class: 'bind-row' }, el('span', { class: 'bind-name' }, ACTION_LABELS[a]),
            [0, 1].map((slot) => {
              const b = btn(list[slot] !== undefined ? PAD_BUTTON_NAMES[list[slot]] ?? `B${list[slot]}` : '—', () => {
                cancelCapture(); capturing = b; b.classList.add('capturing'); b.textContent = 'Press a pad button…';
                input.capturePad = (code) => {
                  // remove this button from other actions to avoid conflicts
                  for (const k of Object.keys(ps.buttons) as Action[]) ps.buttons[k] = (ps.buttons[k] ?? []).filter((x) => x !== code);
                  const cur = [...(ps.buttons[a] ?? [])]; cur[slot] = code; ps.buttons[a] = cur.filter((x) => x !== undefined);
                  persist(); capturing = null; render();
                };
              }, 'bind-btn');
              return b;
            }),
            btn('Clear', () => { ps.buttons[a] = []; persist(); render(); }, 'small ghost'));
        })),
        toggle('Tap-jump (stick up jumps)', ps.tapJump, (v) => { ps.tapJump = v; persist(); }),
        slider('Stick deadzone', ps.deadzone, 0.05, 0.6, 0.05, (v) => { ps.deadzone = v; persist(); }),
      );
      return;
    }
    const idx = tab === 'kb1' ? 0 : 1;
    const sch = save.kb[idx];
    mount(body,
      el('p', { class: 'muted small' }, 'Click a binding (or select it and press Enter / A), then press the new key — or click a mouse button (left / right / middle / side) or move the scroll wheel. Each action has a primary and secondary binding. Conflicting bindings are removed from other actions in this scheme.'),
      el('div', { class: 'bind-table' }, ACTIONS.map((a) => el('div', { class: 'bind-row' },
        el('span', { class: 'bind-name' }, ACTION_LABELS[a]),
        [0, 1].map((slot) => {
          const code = sch.keys[a][slot];
          const b = btn(code ? keyLabel(code) : '—', () => {
            cancelCapture(); capturing = b; b.classList.add('capturing'); b.textContent = 'Press a key, click or scroll…';
            input.captureKey = (k) => {
              capturing = null;
              for (const other of ACTIONS) sch.keys[other] = sch.keys[other].filter((x) => x !== k);
              const cur = [...sch.keys[a]]; cur[slot] = k; sch.keys[a] = cur.filter(Boolean);
              persist(); synth.menuSelect(); render();
            };
          }, 'bind-btn');
          return b;
        }),
        btn('Clear', () => { sch.keys[a] = []; persist(); render(); }, 'small ghost'),
      ))),
      toggle('Tap-jump (Up jumps)', sch.tapJump, (v) => { sch.tapJump = v; persist(); }),
      toggle('Quick smash (tap direction + Attack)', !!sch.quickSmash, (v) => { sch.quickSmash = v; persist(); }),
      el('p', { class: 'muted small' }, 'Quick smash: press a direction and Attack together (within 4 frames) for a smash attack — like flicking a stick. Hold the direction first for a tilt.'),
    );
  };
  renderTabs(); render();
  // live input tester: shows what every device is pressing right now
  const tester = el('div', { class: 'input-tester' });
  const names: [keyof import('../core/inputFrame').InputFrame, string][] = [['jump', 'Jump'], ['attack', 'Attack'], ['special', 'Special'], ['shield', 'Shield'], ['smash', 'Smash']];
  const arrow = (x: number, y: number) => (Math.abs(x) < 0.2 && Math.abs(y) < 0.2 ? '·' : ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'][Math.round(((Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]);
  let tick = 0;
  const off = app.onStep(() => {
    if (!tester.isConnected) { off(); return; }
    if (++tick % 3) return;
    const pads = input.connectedPads().map((i) => `pad${i}`);
    const rows = DEVICE_IDS.filter((d) => d.startsWith('kb') || pads.includes(d)).map((d) => {
      const f = input.get(d);
      const held = names.filter(([k]) => f[k]).map(([, n]) => n);
      const active = held.length || Math.abs(f.x) > 0.2 || Math.abs(f.y) > 0.2;
      return `<div class="it-row ${active ? 'on' : ''}"><b>${deviceLabel(d)}</b><span class="it-dir">${arrow(f.x, f.y)}</span><span>${held.join(' · ') || '—'}</span></div>`;
    });
    tester.innerHTML = `<div class="it-title">Input test — press anything</div>${rows.join('')}`;
  });
  return el('div', { class: 'panel-screen controls' },
    el('div', { class: 'screen-head' }, btn('◀ Back', () => { cancelCapture(); back(); }, 'small ghost'), el('h1', {}, 'CONTROLS'),
      btn('Reset Defaults', () => { cancelCapture(); resetControls(); toast('Controls reset to defaults'); render(); }, 'small')),
    tabs, tester, body);
}
