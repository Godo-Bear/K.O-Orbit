import { save, type Action } from './save';

import { emptyInput, type InputFrame } from './inputFrame';
export * from './inputFrame';

export type DeviceId = string; // 'kb1' | 'kb2' | 'pad0'..'pad7'
export const DEVICE_IDS: DeviceId[] = ['kb1', 'kb2', 'pad0', 'pad1', 'pad2', 'pad3', 'pad4', 'pad5', 'pad6', 'pad7'];
export const deviceLabel = (d: DeviceId) => (d.startsWith('kb') ? `Keys ${d.slice(2)}` : `Pad ${+d.slice(3) + 1}`);

interface DevState { prev: InputFrame; hist: number[]; histY: number[]; rsPrev: number; }

class InputManager {
  private keys = new Set<string>();
  private devs = new Map<DeviceId, DevState>();
  private frames = new Map<DeviceId, InputFrame>();
  /** When set, the next key/button press is delivered here (for rebinding) and swallowed. */
  captureKey: ((code: string) => void) | null = null;
  capturePad: ((button: number) => void) | null = null;
  private padPrevButtons: boolean[][] = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.captureKey) { e.preventDefault(); e.stopImmediatePropagation(); const cb = this.captureKey; this.captureKey = null; cb(e.code); return; }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
      if (this.isGameKey(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private isGameKey(code: string) {
    if (code.startsWith('Arrow') || code === 'Space') return true;
    return save.kb.some((s) => Object.values(s.keys).some((ks) => ks.includes(code)));
  }

  isKeyDown(code: string) { return this.keys.has(code); }

  gamepads(): (Gamepad | null)[] {
    try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []); } catch { return []; }
  }

  connectedPads(): number[] {
    return this.gamepads().map((g, i) => (g && g.connected ? i : -1)).filter((i) => i >= 0);
  }

  /** Sample every device once per simulation tick. */
  poll() {
    const pads = this.gamepads();
    if (this.capturePad) {
      for (let i = 0; i < pads.length; i++) {
        const g = pads[i]; if (!g) continue;
        const prev = this.padPrevButtons[i] || [];
        for (let b = 0; b < g.buttons.length; b++) {
          if (g.buttons[b].pressed && !prev[b]) { const cb = this.capturePad; this.capturePad = null; cb(b); break; }
        }
        if (!this.capturePad) break;
      }
    }
    for (let i = 0; i < pads.length; i++) { const g = pads[i]; this.padPrevButtons[i] = g ? g.buttons.map((b) => b.pressed) : []; }
    for (const id of DEVICE_IDS) this.frames.set(id, this.sample(id, pads));
  }

  get(id: DeviceId): InputFrame { return this.frames.get(id) ?? emptyInput(); }

  private st(id: DeviceId): DevState {
    let s = this.devs.get(id);
    if (!s) { s = { prev: emptyInput(), hist: [0, 0, 0, 0], histY: [0, 0, 0, 0], rsPrev: 0 }; this.devs.set(id, s); }
    return s;
  }

  private sample(id: DeviceId, pads: (Gamepad | null)[]): InputFrame {
    const s = this.st(id);
    const f = emptyInput();
    let tapJump = true;
    let isPad = false;
    let rsx = 0, rsy = 0;
    if (id.startsWith('kb')) {
      const sch = save.kb[+id.slice(2) - 1];
      tapJump = sch.tapJump;
      const k = (a: Action) => sch.keys[a].some((c) => this.keys.has(c));
      f.x = (k('right') ? 1 : 0) - (k('left') ? 1 : 0);
      f.y = (k('down') ? 1 : 0) - (k('up') ? 1 : 0);
      f.jump = k('jump'); f.attack = k('attack'); f.special = k('special'); f.shield = k('shield'); f.smash = k('smash');
      f.pauseP = k('pause') && !s.prev.pauseP && !(s as any).pauseHeld;
      (s as any).pauseHeld = k('pause');
    } else {
      isPad = true;
      const g = pads[+id.slice(3)];
      const ps = save.pad;
      tapJump = ps.tapJump;
      if (g && g.connected) {
        const dz = ps.deadzone;
        let ax = g.axes[0] ?? 0, ay = g.axes[1] ?? 0;
        if (Math.hypot(ax, ay) < dz) { ax = 0; ay = 0; }
        const btn = (i: number) => !!g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.35);
        if (btn(12)) ay = -1; if (btn(13)) ay = 1; if (btn(14)) ax = -1; if (btn(15)) ax = 1;
        f.x = Math.max(-1, Math.min(1, ax)); f.y = Math.max(-1, Math.min(1, ay));
        const b = (a: Action) => (ps.buttons[a] || []).some(btn);
        f.jump = b('jump'); f.attack = b('attack'); f.special = b('special'); f.shield = b('shield'); f.smash = b('smash');
        const pause = b('pause');
        f.pauseP = pause && !(s as any).pauseHeld; (s as any).pauseHeld = pause;
        rsx = g.axes[2] ?? 0; rsy = g.axes[3] ?? 0;
        if (Math.hypot(rsx, rsy) < 0.3) { rsx = 0; rsy = 0; }
      }
    }
    const p = s.prev;
    f.jumpP = f.jump && !p.jump; f.attackP = f.attack && !p.attack; f.specialP = f.special && !p.special;
    f.shieldP = f.shield && !p.shield;
    f.smashP = f.smash && !p.smash;
    if (f.smashP) { f.sx = f.x; f.sy = f.y; }

    // flick / tap detection
    const hist = s.hist, histY = s.histY;
    const wasNeutralX = hist.some((v) => Math.abs(v) < 0.3);
    const wasNeutralY = histY.some((v) => v < 0.3);
    if (Math.abs(f.x) > 0.75 && Math.abs(p.x) <= 0.75 && wasNeutralX) f.dashTap = Math.sign(f.x);
    if (f.y > 0.7 && p.y <= 0.7 && wasNeutralY) f.downTap = true;
    const upTap = f.y < -0.7 && p.y >= -0.7 && histY.some((v) => v > -0.3);
    if (tapJump && upTap) { f.jumpP = true; }
    if (tapJump && f.y < -0.7) f.jump = f.jump || p.jump || upTap;

    // Smash-stick (right stick) on gamepads
    const rsMag = Math.hypot(rsx, rsy);
    if (isPad && rsMag > 0.7 && s.rsPrev <= 0.7) { f.smashP = true; f.sx = rsx; f.sy = rsy; }
    s.rsPrev = rsMag;
    // Analog flick + attack = smash (gamepads)
    if (isPad && f.attackP && !f.smashP && (Math.abs(f.x) > 0.75 || Math.abs(f.y) > 0.75)) {
      const flickedX = Math.abs(f.x) > 0.75 && hist.slice(-3).some((v) => Math.abs(v) < 0.3);
      const flickedY = Math.abs(f.y) > 0.75 && histY.slice(-3).some((v) => Math.abs(v) < 0.3);
      if (flickedX || flickedY) { f.smashP = true; f.attackP = false; f.sx = f.x; f.sy = f.y; }
    }
    hist.shift(); hist.push(f.x); histY.shift(); histY.push(f.y);
    s.prev = f;
    return f;
  }

  /** Any confirm / back / direction press from any device — used for menu navigation. */
  anyDevicePressed(): string | null {
    for (const id of DEVICE_IDS) {
      const f = this.get(id);
      if (f.attackP || f.jumpP || f.specialP || f.shieldP || f.smashP || f.pauseP) return id;
    }
    return null;
  }
}

export const input = new InputManager();
