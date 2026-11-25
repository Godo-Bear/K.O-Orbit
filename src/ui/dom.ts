import { synth } from '../audio/synth';
import { input, DEVICE_IDS } from '../core/input';

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any> & { class?: string; style?: string; on?: Record<string, (e: any) => void> };

/** Tiny hyperscript helper. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, any>)) e.addEventListener(ev, fn);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k in e && typeof v !== 'string') (e as any)[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return e;
}

/** Append children (skipping null/false) to an existing element. */
export function mount(parent: HTMLElement, ...children: Child[]) {
  const add = (c: Child) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else parent.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return parent;
}

/** Menu button (keyboard/gamepad focusable). */
export function btn(label: Child, onClick: () => void, cls = '', extra: Props = {}) {
  const b = el('button', { class: `btn ${cls}`, 'data-nav': '', ...extra }, label);
  b.addEventListener('click', (e) => { e.stopPropagation(); synth.unlock(); synth.menuSelect(); onClick(); });
  b.addEventListener('mouseenter', () => { if (document.activeElement !== b) b.focus({ preventScroll: true }); });
  return b;
}

/** ◀ value ▶ cycler, adjustable with left/right on keyboard & gamepad. */
export function cycler(label: string | null, values: { v: any; label: string; disabled?: boolean }[], current: any, onChange: (v: any) => void, cls = '') {
  let idx = Math.max(0, values.findIndex((x) => x.v === current));
  const val = el('span', { class: 'cyc-val' }, values[idx]?.label ?? '');
  const set = (dir: number) => {
    for (let n = 0; n < values.length; n++) {
      idx = (idx + dir + values.length) % values.length;
      if (!values[idx].disabled) break;
    }
    val.textContent = values[idx].label;
    synth.menuMove();
    onChange(values[idx].v);
  };
  const left = el('button', { class: 'cyc-arrow', tabindex: '-1', 'aria-label': 'previous' }, '◀');
  const right = el('button', { class: 'cyc-arrow', tabindex: '-1', 'aria-label': 'next' }, '▶');
  left.addEventListener('click', (e) => { e.stopPropagation(); set(-1); });
  right.addEventListener('click', (e) => { e.stopPropagation(); set(1); });
  const wrap = el('div', { class: `cycler ${cls}`, 'data-nav': '', 'data-lr': '', tabindex: '0', role: 'spinbutton' },
    label ? el('span', { class: 'cyc-label' }, label) : null, left, val, right);
  wrap.addEventListener('nav-lr', (e: any) => set(e.detail));
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(1); } });
  wrap.addEventListener('mouseenter', () => wrap.focus({ preventScroll: true }));
  return wrap;
}

export function slider(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, fmt = (v: number) => `${Math.round(v * 100)}%`) {
  const out = el('span', { class: 'cyc-val' }, fmt(value));
  const range = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), tabindex: '-1' }) as HTMLInputElement;
  range.value = String(value);
  range.addEventListener('input', () => { out.textContent = fmt(+range.value); onChange(+range.value); });
  const wrap = el('div', { class: 'cycler slider', 'data-nav': '', 'data-lr': '', tabindex: '0' }, el('span', { class: 'cyc-label' }, label), range, out);
  wrap.addEventListener('nav-lr', (e: any) => {
    range.value = String(Math.max(min, Math.min(max, +range.value + e.detail * step)));
    range.dispatchEvent(new Event('input'));
    synth.menuMove();
  });
  wrap.addEventListener('mouseenter', () => wrap.focus({ preventScroll: true }));
  return wrap;
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void) {
  return cycler(label, [{ v: false, label: 'OFF' }, { v: true, label: 'ON' }], value, onChange);
}

let toastTimer = 0;
export function toast(msg: string, ms = 2600) {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), ms);
}

// ------------------------------------------------------------------ spatial navigation
export class MenuNav {
  root: HTMLElement | null = null;
  onBack: (() => void) | null = null;
  enabled = true;
  private repeat = new Map<string, { dir: string; t: number }>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || !this.root || input.captureKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' && ['text', 'password'].includes((e.target as HTMLInputElement).type);
      if (e.key === 'Escape' || (e.key === 'Backspace' && !typing)) { if (this.onBack) { e.preventDefault(); synth.menuBack(); this.onBack(); } return; }
      if (typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      const dirs: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (dirs[e.key]) { e.preventDefault(); this.move(dirs[e.key]); }
    });
  }

  attach(root: HTMLElement, onBack: (() => void) | null, autofocus = true) {
    this.root = root; this.onBack = onBack;
    if (autofocus) requestAnimationFrame(() => this.focusFirst());
  }

  focusables(): HTMLElement[] {
    if (!this.root) return [];
    return Array.from(this.root.querySelectorAll<HTMLElement>('[data-nav]')).filter((e) => e.offsetParent !== null && !(e as HTMLButtonElement).disabled);
  }

  focusFirst() {
    const pref = this.root?.querySelector<HTMLElement>('[data-autofocus]');
    const f = pref && pref.offsetParent !== null ? pref : this.focusables()[0];
    f?.focus({ preventScroll: false });
  }

  move(dir: string) {
    const cur = document.activeElement as HTMLElement | null;
    const list = this.focusables();
    if (!cur || !list.includes(cur)) { this.focusFirst(); return; }
    if ((dir === 'left' || dir === 'right') && cur.hasAttribute('data-lr')) {
      cur.dispatchEvent(new CustomEvent('nav-lr', { detail: dir === 'left' ? -1 : 1 }));
      return;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLElement | null = null, bs = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      let primary = 0, secondary = 0;
      if (dir === 'up') { if (b.bottom > a.top + 4) continue; primary = -dy; secondary = Math.abs(dx); }
      if (dir === 'down') { if (b.top < a.bottom - 4) continue; primary = dy; secondary = Math.abs(dx); }
      if (dir === 'left') { if (b.right > a.left + 4) continue; primary = -dx; secondary = Math.abs(dy); }
      if (dir === 'right') { if (b.left < a.right - 4) continue; primary = dx; secondary = Math.abs(dy); }
      const s = primary + secondary * 2.2;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); synth.menuMove(); }
  }

  /** Gamepad menu navigation (called every sim tick while menus are active). */
  pollPads() {
    if (!this.enabled || !this.root || input.capturePad) return;
    for (const id of DEVICE_IDS) {
      if (!id.startsWith('pad')) continue;
      const f = input.get(id);
      const dir = f.y < -0.6 ? 'up' : f.y > 0.6 ? 'down' : f.x < -0.6 ? 'left' : f.x > 0.6 ? 'right' : '';
      const r = this.repeat.get(id) ?? { dir: '', t: 0 };
      if (dir) {
        if (r.dir !== dir) { r.dir = dir; r.t = 0; this.move(dir); }
        else if (++r.t > 20 && r.t % 6 === 0) this.move(dir);
      } else r.dir = '';
      this.repeat.set(id, r);
      if (f.attackP) {
        synth.unlock();
        const cur = document.activeElement as HTMLElement | null;
        if (cur && cur.hasAttribute('data-nav')) {
          if (cur.hasAttribute('data-lr')) cur.dispatchEvent(new CustomEvent('nav-lr', { detail: 1 }));
          else cur.click();
        } else this.focusFirst();
      }
      if (f.specialP && this.onBack) { synth.menuBack(); this.onBack(); }
    }
  }
}

export const nav = new MenuNav();

/** UI zoom applied on large / 4K viewports at 1× DPR so menus never look tiny. */
export function uiZoom() { return Math.max(1, Math.min(2.2, Math.min(window.innerWidth / 1600, window.innerHeight / 940))); }
export function applyUiZoom() { document.documentElement.style.setProperty('--ui-zoom', uiZoom().toFixed(3)); }

/** Small canvas (DPR × UI-zoom sharp) for portraits, thumbnails and hero art. */
export function portraitCanvas(size: number, draw: (ctx: CanvasRenderingContext2D, s: number, h: number) => void, height = size) {
  const c = el('canvas', { class: 'portrait', style: `width:${size}px;height:${height}px` }) as HTMLCanvasElement;
  const d = Math.min(4, (window.devicePixelRatio || 1) * uiZoom());
  c.width = Math.round(size * d); c.height = Math.round(height * d);
  const ctx = c.getContext('2d')!;
  ctx.scale(d, d);
  draw(ctx, size, height);
  return c;
}
