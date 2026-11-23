import { FixedLoop } from '../core/loop';
import { input } from '../core/input';
import { save, persist } from '../core/save';
import { PLAYER_COLORS, playerLabel } from '../core/constants';
import { synth } from '../audio/synth';
import { music, stageTrack, TRACKS } from '../audio/music';
import { Renderer } from '../render/renderer';
import { drawPortrait, drawHeroCard } from '../render/rig';
import { Session, type MatchConfig, type SessionKind } from '../game/session';
import { CHARACTERS, charById } from '../sim/characters';
import { STAGES } from '../sim/stages';
import type { SlotConfig } from '../sim/types';
import type { NetClient } from '../net/client';
import { recordClear, type StoryStage } from '../story/campaign';
import { el, btn, nav, toast, portraitCanvas, applyUiZoom, cycler } from './dom';
import { versusScreen } from './versus';
import { storyMapScreen } from './story';
import { onlineMenuScreen } from './online';
import { settingsScreen, controlsScreen, controlsGuide } from './options';
import { practiceScreen, DUMMY_MODES, DUMMY_PCTS } from './practice';

export class App {
  renderer: Renderer;
  loop: FixedLoop;
  ui: HTMLElement;
  session: Session | null = null;
  demo: Session | null = null;
  showHitboxes = false;
  net: NetClient | null = null;
  lastMatch: { kind: SessionKind; cfg: MatchConfig; back: () => void } | null = null;
  private pauseEl: HTMLElement | null = null;
  private stepHooks: (() => void)[] = [];

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    this.ui = document.getElementById('ui')!;
    this.renderer = new Renderer(canvas);
    this.renderer.setRenderScale(save.settings.renderScale);
    applyUiZoom();
    window.addEventListener('resize', applyUiZoom);
    this.loop = new FixedLoop(() => this.step(), (a) => this.draw(a));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F2') { e.preventDefault(); save.settings.showPerf = !save.settings.showPerf; persist(); }
      if (e.code === 'F4') { e.preventDefault(); this.showHitboxes = !this.showHitboxes; }
    });
    const unlock = () => synth.unlock();
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    window.addEventListener('gamepadconnected', (e: any) => toast(`🎮 Gamepad ${e.gamepad.index + 1} connected`));
    window.addEventListener('gamepaddisconnected', (e: any) => toast(`Gamepad ${e.gamepad.index + 1} disconnected`));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.session && this.session.kind === 'local' && !this.session.paused && this.session.world.phase === 'play') {
        this.session.paused = true; this.showPause();
      }
    });
    this.startDemo();
    this.loop.start();
    this.title();
  }

  onStep(fn: () => void) { this.stepHooks.push(fn); return () => { this.stepHooks = this.stepHooks.filter((f) => f !== fn); }; }

  private step() {
    input.poll();
    if (this.session) this.session.step();
    else if (this.demo) {
      this.demo.step();
      if (this.demo.world.phase === 'over') this.startDemo();
    }
    if (!this.session || this.session.paused || this.pauseEl) nav.pollPads();
    for (const h of this.stepHooks) h();
  }

  private draw(alpha: number) {
    const s = this.session ?? this.demo;
    if (!s) return;
    const perf = save.settings.showPerf ? {
      fps: this.loop.fps, stepMs: this.loop.stepMs, steps: this.loop.stepsLastFrame, renderMs: this.renderer.renderMs,
      latency: this.session?.net ? this.session.net.latency : null,
      net: this.session?.net ? `online ${this.session.kind} · room ${this.session.net.room} · ${this.session.net.peers.length} peers` : undefined,
    } : null;
    s.render(this.renderer, alpha, perf, this.showHitboxes);
  }

  startDemo() {
    const ids = CHARACTERS.map((c) => c.id);
    const n = 4 + Math.floor(Math.random() * 3);
    const slots: SlotConfig[] = Array.from({ length: n }, (_, i) => ({ slot: i, type: 'CPU', charId: ids[(i * 3 + Math.floor(Math.random() * 8)) % 8], cpuLevel: 6 + (i % 4), team: -1 }));
    const stage = STAGES[Math.floor(Math.random() * STAGES.length)];
    this.demo = new Session('demo', { rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: stage.id }, slots, seed: Math.floor(Math.random() * 1e6) });
    this.demo.world.phase = 'play';
    if (!this.session) this.renderer.resetCamera();
  }

  // ------------------------------------------------------------------ screen helpers
  show(content: HTMLElement, back: (() => void) | null, cls = '') {
    if (!this.session) music.play('menu');
    this.ui.innerHTML = '';
    this.ui.className = `ui-root ${cls}`;
    this.ui.append(content);
    nav.enabled = true;
    nav.attach(this.ui, back);
  }

  hideUi() { this.ui.innerHTML = ''; this.ui.className = 'ui-root hidden'; nav.enabled = false; nav.root = null; }

  title() {
    this.leaveNet();
    const go = () => { cleanup(); synth.unlock(); synth.menuSelect(); this.modes(); };
    const screen = el('div', { class: 'title-screen', on: { click: go } },
      el('div', { class: 'logo' }, el('span', { class: 'logo-ko' }, 'K.O'), el('span', { class: 'logo-orbit' }, 'ORBIT')),
      el('div', { class: 'tagline' }, 'A platform fighter for up to 10 players'),
      el('div', { class: 'press-start blink' }, 'PRESS START'),
      el('div', { class: 'title-hint' }, 'Enter · Click · Gamepad A / Start'),
    );
    const key = (e: KeyboardEvent) => { if (e.code === 'F2' || e.code === 'F4') return; if (e.key === 'Enter' || e.key === ' ' || e.code === 'KeyJ') go(); };
    window.addEventListener('keydown', key);
    const off = this.onStep(() => { const d = input.anyDevicePressed(); if (d && d.startsWith('pad')) go(); });
    const cleanup = () => { window.removeEventListener('keydown', key); off(); };
    this.show(screen, null, 'title');
  }

  modes() {
    const items: [string, string, () => void][] = [
      ['VERSUS', 'Local battles · up to 10 players & CPUs', () => this.versus()],
      ['STORY MODE', 'Climb the orbit and unlock fighters', () => this.story()],
      ['PRACTICE', 'Training dummy, combo counter & hitboxes', () => this.practice()],
      ['ONLINE', 'Room-code multiplayer · up to 10', () => this.online()],
      ['CONTROLS', 'Keybinds, gamepads & move guide', () => this.controls(() => this.modes())],
      ['SETTINGS', 'Audio, video, data', () => this.settings(() => this.modes())],
    ];
    const list = el('div', { class: 'mode-list' }, items.map(([t, d, f], i) => btn([el('span', { class: 'mode-title' }, t), el('span', { class: 'mode-desc' }, d)], f, `mode-btn m${i % 6}`, i === 0 ? { 'data-autofocus': '' } : {})));
    const screen = el('div', { class: 'panel-screen modes' },
      el('div', { class: 'logo small' }, el('span', { class: 'logo-ko' }, 'K.O'), el('span', { class: 'logo-orbit' }, 'ORBIT')),
      list,
      el('div', { class: 'footer-hint' }, '↑↓ / D-Pad to move · Enter / A to select · Esc / B to go back · F2 perf HUD'),
    );
    this.show(screen, () => this.title());
  }

  versus() { this.show(versusScreen(this), () => this.modes(), 'wide'); }
  story() { this.show(storyMapScreen(this), () => this.modes(), 'wide'); }
  practice() { this.show(practiceScreen(this), () => this.modes(), 'wide'); }
  online() { this.show(onlineMenuScreen(this), () => { this.leaveNet(); this.modes(); }); }
  settings(back: () => void) { this.show(settingsScreen(this, back), back); }
  controls(back: () => void) { this.show(controlsScreen(this, back), back, 'wide'); }

  leaveNet() { if (this.net) { this.net.close(); this.net = null; } }

  // ------------------------------------------------------------------ matches
  startMatch(kind: SessionKind, cfg: MatchConfig, back: () => void, net?: NetClient, myIndex = -1) {
    this.lastMatch = { kind, cfg, back };
    this.hideUi();
    this.closePause();
    const s = new Session(kind, cfg, net);
    s.myIndex = myIndex;
    s.onPause = () => this.showPause();
    s.onEnd = () => this.results(s, back);
    this.session = s;
    this.renderer.resetCamera();
    synth.unlock();
    const track = stageTrack(cfg.rules.stageId);
    music.play(track); music.setDucked(false);
    toast(`♪ ${TRACKS[track].name}`, 2200);
  }

  endSession() { this.session = null; this.closePause(); this.renderer.resetCamera(); music.setDucked(false); }

  showPause() {
    if (this.pauseEl) return;
    const s = this.session;
    if (!s) return;
    const online = s.kind === 'host' || s.kind === 'client';
    const resume = () => { this.closePause(); if (s) s.paused = false; };
    const quit = () => {
      this.closePause();
      if (online) this.leaveNet();
      const back = this.lastMatch?.back ?? (() => this.modes());
      this.endSession();
      back();
    };
    const guide = el('div', { class: 'pause-guide hidden' }, controlsGuide());
    const box = el('div', { class: 'pause-box' },
      el('h2', {}, online ? 'MENU' : 'PAUSED'),
      online ? el('p', { class: 'muted' }, 'Online matches keep running while this menu is open.') : null,
      btn('Resume', resume, 'wide-btn', { 'data-autofocus': '' }),
      s.cfg.practice ? el('div', { class: 'practice-pause' },
        btn('Reset Positions', () => { s.resetPositions(); resume(); }, 'wide-btn'),
        cycler('Dummy', DUMMY_MODES, s.cfg.practice.dummy, (v) => { s.cfg.practice!.dummy = v; }),
        cycler('Set dummy %', DUMMY_PCTS, s.cfg.practice.startPct, (v) => { s.cfg.practice!.startPct = v; s.world.fighters[1].percent = v; }),
        cycler('CPU Lvl', Array.from({ length: 9 }, (_, k) => ({ v: k + 1, label: String(k + 1) })), s.cfg.practice.level, (v) => { s.cfg.practice!.level = v; const b = s.brains[1]; if (b) b.level = v; }),
        btn(this.showHitboxes ? 'Hide Hitboxes (F4)' : 'Show Hitboxes (F4)', () => { this.showHitboxes = !this.showHitboxes; resume(); }, 'wide-btn')) : null,
      btn('Controls Guide', () => guide.classList.toggle('hidden'), 'wide-btn'),
      btn(online ? 'Leave Match' : 'Quit Match', quit, 'wide-btn danger'),
      guide,
    );
    this.pauseEl = el('div', { class: 'pause-overlay' }, box);
    music.setDucked(true);
    document.body.append(this.pauseEl);
    nav.enabled = true;
    nav.attach(this.pauseEl, resume);
  }

  closePause() {
    if (!this.pauseEl) return;
    this.pauseEl.remove(); this.pauseEl = null;
    music.setDucked(false);
    if (this.session) { nav.enabled = false; nav.root = null; }
  }

  results(s: Session, back: () => void) {
    const w = s.world;
    music.play('victory');
    const places = w.placements();
    const story = s.cfg.story;
    let storyBlock: HTMLElement | null = null;
    if (story) {
      const human = w.fighters.find((f) => s.cfg.slots[w.fighters.indexOf(f)].type === 'HUMAN')!;
      const myPlace = places.find((p) => p.slot === human.slot)?.place ?? 99;
      const won = myPlace === 1;
      if (won) {
        const secs = Math.round(w.frame / 60);
        let stars = 1;
        if (human.damageTaken <= story.stars.damage) stars++;
        if (secs <= story.stars.time) stars++;
        const unlocked = recordClear(story, stars);
        storyBlock = el('div', { class: 'story-result win' },
          el('h3', {}, 'STAGE CLEAR!'),
          el('div', { class: 'stars big' }, [1, 2, 3].map((k) => el('span', { class: k <= stars ? 'star on' : 'star' }, '★'))),
          el('div', { class: 'muted' }, `★ Clear  ·  ★ Take ≤ ${story.stars.damage} damage (${Math.round(human.damageTaken)})  ·  ★ Clear in ≤ ${story.stars.time}s (${secs}s)`),
          unlocked ? el('div', { class: 'unlock-banner' }, portraitCanvas(110, (c, wd, ht) => drawHeroCard(c, charById(unlocked), wd, ht), 130), el('div', {}, el('b', {}, 'NEW CHALLENGER UNLOCKED!'), el('div', {}, `${charById(unlocked).name} — ${charById(unlocked).title}`))) : null,
        );
        if (unlocked) { synth.unlockJingle(); toast(`🔓 ${charById(unlocked).name} unlocked!`, 4000); }
      } else {
        storyBlock = el('div', { class: 'story-result lose' }, el('h3', {}, 'DEFEATED'), el('div', { class: 'muted' }, 'Pick yourself up and try again.'));
      }
    }
    const rows = [...places].sort((a, b) => a.place - b.place).map((p) => {
      const f = w.fighters.find((x) => x.slot === p.slot)!;
      const tag = s.slotTags.get(f.slot) ?? playerLabel(f.slot);
      return el('tr', { style: `--pc:${PLAYER_COLORS[f.slot]}` },
        el('td', { class: 'place' }, ordinal(p.place)),
        el('td', {}, el('div', { class: 'res-fighter' }, portraitCanvas(40, (c, sz) => drawPortrait(c, f.char, sz / 2, sz * 0.12, sz * 1.15)), el('div', {}, el('b', { class: 'pc' }, tag), el('div', { class: 'muted' }, f.char.name)))),
        el('td', {}, String(f.kos)),
        el('td', {}, String(f.falls)),
        el('td', {}, String(f.sds)),
        el('td', {}, `${Math.round(f.damageDealt)}%`),
        el('td', {}, `${Math.round(f.damageTaken)}%`),
      );
    });
    const winner = places.filter((p) => p.place === 1).map((p) => w.fighters.find((f) => f.slot === p.slot)!);
    const winTxt = winner.length === 1 ? `${s.slotTags.get(winner[0].slot) ?? playerLabel(winner[0].slot)} WINS!` : winner.length > 1 && winner.every((f) => f.team === winner[0].team && f.team >= 0) ? 'TEAM VICTORY!' : 'DRAW!';
    const online = s.kind === 'host' || s.kind === 'client';
    const actions = el('div', { class: 'row-actions' },
      story ? btn('Continue', () => { this.endSession(); this.story(); }, 'primary', { 'data-autofocus': '' })
        : online ? btn('Back to Lobby', () => { this.endSession(); back(); }, 'primary', { 'data-autofocus': '' })
          : btn('Rematch', () => { const lm = this.lastMatch!; this.endSession(); this.startMatch(lm.kind, { ...lm.cfg, seed: Math.floor(Math.random() * 1e6) }, lm.back); }, 'primary', { 'data-autofocus': '' }),
      story ? btn('Retry', () => { const lm = this.lastMatch!; this.endSession(); this.startMatch(lm.kind, { ...lm.cfg, seed: Math.floor(Math.random() * 1e6) }, lm.back); }) : null,
      !online && !story ? btn('Character Select', () => { this.endSession(); back(); }) : null,
      btn('Main Menu', () => { this.endSession(); if (online) this.leaveNet(); this.modes(); }),
    );
    const screen = el('div', { class: 'panel-screen results' },
      el('div', { class: 'win-row' },
        winner.slice(0, 3).map((f) => el('div', { class: 'win-hero', style: `--pc:${PLAYER_COLORS[f.slot]}` }, portraitCanvas(200, (c, wd, ht) => drawHeroCard(c, f.char, wd, ht, w.frame), 230))),
        el('h1', { class: 'win-title', style: winner[0] ? `color:${PLAYER_COLORS[winner[0].slot]}` : '' }, winTxt)),
      storyBlock,
      el('div', { class: 'table-wrap' }, el('table', { class: 'results-table' },
        el('thead', {}, el('tr', {}, ['#', 'Fighter', 'KOs', 'Falls', 'SDs', 'Dealt', 'Taken'].map((h) => el('th', {}, h)))),
        el('tbody', {}, rows))),
      actions,
    );
    this.show(screen, null, 'wide');
  }
}

function ordinal(n: number) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`; }

export type { StoryStage };
