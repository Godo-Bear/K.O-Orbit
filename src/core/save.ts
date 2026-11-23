/** Persistent save data (localStorage) — settings, story progress, unlocks, control bindings. */

export type Action = 'up' | 'down' | 'left' | 'right' | 'jump' | 'attack' | 'special' | 'shield' | 'smash' | 'pause';
export const ACTIONS: Action[] = ['up', 'down', 'left', 'right', 'jump', 'attack', 'special', 'shield', 'smash', 'pause'];
export const ACTION_LABELS: Record<Action, string> = {
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', jump: 'Jump', attack: 'Attack',
  special: 'Special', shield: 'Shield / Dodge', smash: 'Smash Attack', pause: 'Pause',
};

export interface KeyScheme { keys: Record<Action, string[]>; tapJump: boolean }
export interface PadScheme { buttons: Partial<Record<Action, number[]>>; tapJump: boolean; deadzone: number }

export interface Settings {
  master: number; sfx: number; music: number; muted: boolean;
  showPerf: boolean; screenShake: boolean; renderScale: number;
  onlineServer: string; playerName: string; inputDelay: number;
  intensity: number;
  fighterStyle: 'illustrated' | 'rig'; // illustrated = your character art; rig = animated vector rig // visual intensity: 2 full, 1 reduced, 0 minimal (flashes, shake, particles)
}

export interface StoryProgress { cleared: Record<string, number> } // stageId -> best stars (1..3)

export interface SaveData {
  version: number;
  settings: Settings;
  story: StoryProgress;
  unlocked: string[]; // unlocked fighter ids (beyond starters)
  kb: KeyScheme[]; // keyboard schemes (KB1, KB2)
  pad: PadScheme; // shared gamepad mapping (standard layout)
}

export const DEFAULT_KB: KeyScheme[] = [
  {
    tapJump: true,
    keys: {
      up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], jump: ['Space', 'WheelUp'],
      attack: ['KeyJ', 'Mouse0'], special: ['KeyK', 'Mouse2'], shield: ['KeyL', 'Mouse1'], smash: ['KeyI', 'WheelDown'], pause: ['Escape'],
    },
  },
  {
    tapJump: true,
    keys: {
      up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['Numpad0', 'ShiftRight'],
      attack: ['Numpad1', 'Comma'], special: ['Numpad2', 'Period'], shield: ['Numpad3', 'Slash'], smash: ['Numpad5', 'KeyM'], pause: ['Backspace'],
    },
  },
];

export const DEFAULT_PAD: PadScheme = {
  tapJump: true,
  deadzone: 0.25,
  // Standard Gamepad mapping: 0=A 1=B 2=X 3=Y 4=LB 5=RB 6=LT 7=RT 9=Start 12-15 dpad
  buttons: { jump: [2, 3], attack: [0], special: [1], shield: [4, 5, 6, 7], smash: [], pause: [9] },
};

const KEY = 'ko-orbit-save-v1';

function defaults(): SaveData {
  return {
    version: 2,
    settings: {
      master: 0.7, sfx: 0.9, music: 0.55, muted: false, showPerf: false, screenShake: true, renderScale: 1,
      onlineServer: '', playerName: 'Player', inputDelay: 2,
      fighterStyle: 'illustrated',
      intensity: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 2,
    },
    story: { cleared: {} },
    unlocked: [],
    kb: structuredClone(DEFAULT_KB),
    pad: structuredClone(DEFAULT_PAD),
  };
}

/** v2: add default mouse/scroll bindings to Keys 1 where the player hasn't used those slots. */
function migrateMouse(sd: SaveData) {
  const used = new Set(sd.kb.flatMap((k) => Object.values(k.keys).flat()));
  const add: [Action, string][] = [['attack', 'Mouse0'], ['special', 'Mouse2'], ['shield', 'Mouse1'], ['jump', 'WheelUp'], ['smash', 'WheelDown']];
  for (const [a, code] of add) {
    const ks = sd.kb[0].keys[a];
    if (!used.has(code) && ks.length < 2) ks.push(code);
  }
}

function load(): SaveData {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw);
    const out: SaveData = {
      ...d, ...p,
      settings: { ...d.settings, ...(p.settings || {}) },
      story: { cleared: { ...(p.story?.cleared || {}) } },
      unlocked: Array.isArray(p.unlocked) ? p.unlocked : [],
      kb: Array.isArray(p.kb) && p.kb.length === 2
        ? p.kb.map((s: KeyScheme, i: number) => ({ tapJump: s.tapJump ?? true, keys: { ...d.kb[i].keys, ...(s.keys || {}) } }))
        : d.kb,
      pad: { ...d.pad, ...(p.pad || {}), buttons: { ...d.pad.buttons, ...(p.pad?.buttons || {}) } },
    };
    if ((p.version ?? 1) < 2) migrateMouse(out);
    out.version = 2;
    return out;
  } catch {
    return d;
  }
}

export const save: SaveData = load();
queueMicrotask(() => persist()); // write back any migration

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

export function resetProgress() {
  save.story = { cleared: {} };
  save.unlocked = [];
  persist();
}

export function resetControls() {
  save.kb = structuredClone(DEFAULT_KB);
  save.pad = structuredClone(DEFAULT_PAD);
  persist();
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  const map: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', ShiftRight: 'RShift', ShiftLeft: 'LShift',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Escape: 'Esc', Backspace: 'Bksp', Enter: 'Enter',
    Mouse0: 'Left Click', Mouse1: 'Middle Click', Mouse2: 'Right Click', Mouse3: 'Mouse Back', Mouse4: 'Mouse Fwd',
    WheelUp: 'Scroll Up', WheelDown: 'Scroll Down',
    ControlLeft: 'LCtrl', ControlRight: 'RCtrl', AltLeft: 'LAlt', AltRight: 'RAlt', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=',
  };
  return map[code] ?? code;
}

export const PAD_BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'LS', 'RS', 'D↑', 'D↓', 'D←', 'D→', 'Home'];
