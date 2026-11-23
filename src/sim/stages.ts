/** Stage definitions: solid mains with ledges, soft drop-through platforms, moving platforms. */

export interface PlatformDef {
  x1: number; x2: number; y: number;
  solid?: boolean; h?: number; // solid platforms have thickness and ledges
  move?: { ax: number; ay: number; period: number; phase?: number };
}

export interface StageDef {
  id: string;
  name: string;
  theme: 'station' | 'nebula' | 'crater' | 'ruins' | 'forge';
  platforms: PlatformDef[];
  blast: { l: number; r: number; t: number; b: number };
  sky: [string, string, string];
  desc: string;
}

export const STAGES: StageDef[] = [
  {
    id: 'station', name: 'Orbital Station', theme: 'station',
    desc: 'Classic tri-platform layout high above the planet.',
    platforms: [
      { x1: -720, x2: 720, y: 0, solid: true, h: 260 },
      { x1: -520, x2: -220, y: -230 },
      { x1: 220, x2: 520, y: -230 },
      { x1: -150, x2: 150, y: -440 },
    ],
    blast: { l: -1700, r: 1700, t: -1350, b: 900 },
    sky: ['#05061a', '#16114a', '#3a1c6e'],
  },
  {
    id: 'nebula', name: 'Nebula Drift', theme: 'nebula',
    desc: 'Drifting platforms ride the cosmic currents.',
    platforms: [
      { x1: -640, x2: 640, y: 0, solid: true, h: 220 },
      { x1: -170, x2: 170, y: -260, move: { ax: 380, ay: 0, period: 480 } },
      { x1: -120, x2: 120, y: -470, move: { ax: 0, ay: 120, period: 360, phase: 0.25 } },
    ],
    blast: { l: -1650, r: 1650, t: -1350, b: 900 },
    sky: ['#0a0220', '#3b0a4f', '#a3246b'],
  },
  {
    id: 'crater', name: 'Crater Arena', theme: 'crater',
    desc: 'A vast, flat proving ground. No tricks.',
    platforms: [{ x1: -880, x2: 880, y: 0, solid: true, h: 300 }],
    blast: { l: -1850, r: 1850, t: -1350, b: 900 },
    sky: ['#120b06', '#4a2410', '#d06a2a'],
  },
  {
    id: 'ruins', name: 'Sky Ruins', theme: 'ruins',
    desc: 'Crumbling sky temple with layers of ledges.',
    platforms: [
      { x1: -560, x2: 560, y: 0, solid: true, h: 240 },
      { x1: -820, x2: -600, y: -150 },
      { x1: 600, x2: 820, y: -150 },
      { x1: -420, x2: -140, y: -280 },
      { x1: 140, x2: 420, y: -280 },
      { x1: -120, x2: 120, y: -500, move: { ax: 260, ay: 0, period: 600 } },
    ],
    blast: { l: -1750, r: 1750, t: -1400, b: 900 },
    sky: ['#79b8ff', '#bfe2ff', '#fff3d6'],
  },
  {
    id: 'forge', name: 'Ember Forge', theme: 'forge',
    desc: 'Twin lifts rise and fall over a molten core.',
    platforms: [
      { x1: -600, x2: 600, y: 0, solid: true, h: 240 },
      { x1: -800, x2: -560, y: -220, move: { ax: 0, ay: 170, period: 420 } },
      { x1: 560, x2: 800, y: -220, move: { ax: 0, ay: 170, period: 420, phase: 0.5 } },
      { x1: -160, x2: 160, y: -300 },
    ],
    blast: { l: -1700, r: 1700, t: -1350, b: 900 },
    sky: ['#1a0303', '#5c0e08', '#ff5a1f'],
  },
];

export const stageById = (id: string) => STAGES.find((s) => s.id === id) ?? STAGES[0];

/** Runtime platform with current/previous positions (for moving platforms). */
export class Platform {
  x1: number; x2: number; y: number;
  px1: number; py: number; // previous
  dx = 0; dy = 0;
  solid: boolean; h: number;
  constructor(public def: PlatformDef, public index: number) {
    this.x1 = this.px1 = def.x1; this.x2 = def.x2; this.y = this.py = def.y;
    this.solid = !!def.solid; this.h = def.h ?? 0;
  }
  update(frame: number) {
    this.px1 = this.x1; this.py = this.y;
    const m = this.def.move;
    if (!m) { this.dx = this.dy = 0; return; }
    const t = (frame / m.period + (m.phase ?? 0)) * Math.PI * 2;
    const ox = Math.sin(t) * m.ax, oy = Math.sin(t) * m.ay;
    const nx1 = this.def.x1 + ox, ny = this.def.y + oy;
    this.dx = nx1 - this.x1; this.dy = ny - this.y;
    this.x1 = nx1; this.x2 = this.def.x2 + ox; this.y = ny;
  }
}
