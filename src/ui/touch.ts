import { input } from '../core/input';
import { save } from '../core/save';

/**
 * On-screen touch controls for phones & tablets: a floating analog stick on the left half,
 * action buttons on the right. Feeds Keys 1 (P1). Multi-touch, no browser scrolling/zooming.
 */
export class TouchControls {
  private root: HTMLElement;
  private stickBase: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private btnTouches = new Map<number, string>();
  visible = false;

  static wanted() {
    const t = save.settings.touch;
    if (t === 'on') return true;
    if (t === 'off') return false;
    return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window;
  }

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'touch-ui hidden';
    this.root.innerHTML = `
      <div class="touch-stick-zone"></div>
      <div class="touch-stick"><div class="touch-knob"></div></div>
      <div class="touch-btns">
        <button data-a="attack" class="tb tb-attack">A<small>Attack</small></button>
        <button data-a="special" class="tb tb-special">B<small>Special</small></button>
        <button data-a="jump" class="tb tb-jump">▲<small>Jump</small></button>
        <button data-a="shield" class="tb tb-shield">◆<small>Shield</small></button>
        <button data-a="smash" class="tb tb-smash">★<small>Smash</small></button>
      </div>
      <button data-a="pause" class="tb tb-pause">❚❚</button>`;
    document.body.append(this.root);
    this.stickBase = this.root.querySelector('.touch-stick')!;
    this.knob = this.root.querySelector('.touch-knob')!;
    const opts = { passive: false } as AddEventListenerOptions;
    this.root.addEventListener('touchstart', (e) => this.onStart(e), opts);
    this.root.addEventListener('touchmove', (e) => this.onMove(e), opts);
    this.root.addEventListener('touchend', (e) => this.onEnd(e), opts);
    this.root.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
  }

  show(on: boolean) {
    on = on && TouchControls.wanted();
    if (on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.reset();
  }

  private reset() {
    const t = input.touch;
    t.x = t.y = 0; t.jump = t.attack = t.special = t.shield = t.smash = t.pause = false;
    this.stickId = null; this.btnTouches.clear();
    this.stickBase.classList.remove('active');
  }

  private setBtn(a: string, v: boolean) { (input.touch as any)[a] = v; this.root.querySelector(`[data-a="${a}"]`)?.classList.toggle('down', v); }

  private onStart(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
      const a = el?.closest('[data-a]')?.getAttribute('data-a');
      if (a) { this.btnTouches.set(t.identifier, a); this.setBtn(a, true); navigator.vibrate?.(8); continue; }
      if (t.clientX < window.innerWidth * 0.5 && this.stickId === null) {
        this.stickId = t.identifier; this.origin = { x: t.clientX, y: t.clientY };
        this.stickBase.style.left = `${t.clientX}px`; this.stickBase.style.top = `${t.clientY}px`;
        this.stickBase.classList.add('active');
        this.knob.style.transform = 'translate(-50%,-50%)';
      }
    }
  }

  private onMove(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        const R = 56;
        let dx = t.clientX - this.origin.x, dy = t.clientY - this.origin.y;
        const m = Math.hypot(dx, dy);
        if (m > R) { dx *= R / m; dy *= R / m; }
        const ix = dx / R, iy = dy / R;
        input.touch.x = Math.abs(ix) < 0.2 ? 0 : ix;
        input.touch.y = Math.abs(iy) < 0.2 ? 0 : iy;
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      } else if (this.btnTouches.has(t.identifier)) {
        // slide between buttons
        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        const a = el?.closest('[data-a]')?.getAttribute('data-a');
        const prev = this.btnTouches.get(t.identifier)!;
        if (a && a !== prev) { this.setBtn(prev, false); this.setBtn(a, true); this.btnTouches.set(t.identifier, a); }
      }
    }
  }

  private onEnd(e: TouchEvent) {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = null; input.touch.x = 0; input.touch.y = 0;
        this.stickBase.classList.remove('active');
      }
      const a = this.btnTouches.get(t.identifier);
      if (a) { this.btnTouches.delete(t.identifier); if (![...this.btnTouches.values()].includes(a)) this.setBtn(a, false); }
    }
  }
}
