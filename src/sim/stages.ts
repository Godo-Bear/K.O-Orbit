/** Stage definitions: solid mains with ledges, soft drop-through platforms, moving platforms. */

export interface PlatformDef {
  x1: number; x2: number; y: number;
  solid?: boolean; h?: number; // solid platforms have thickness and ledges
  move?: { ax: number; ay: number; period: number; phase?: number };
}

export interface StageDef {
  id: string;
  name: string;
  theme: 'station' | 'nebula' | 'crater' | 'ruins' | 'forge' | 'glacier' | 'metro' | 'canopy' | 'hyperlane' | 'abyss' | 'reef' | 'dunes' | 'storm' | 'clockwork' | 'shrine';
  gravity?: number; // stage gravity multiplier (underwater < 1)
  hazard?: import('./types').HazardKind; // stage hazard (Versus 'Hazards: ON')
  hazardText?: string;
  traction?: number; // ground friction multiplier (ice < 1)
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
    id: 'nebula', hazard: 'meteor', hazardText: 'Meteors rain from above — watch for the target rings.', name: 'Nebula Drift', theme: 'nebula',
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
    id: 'forge', hazard: 'lava', hazardText: 'Lava geysers erupt from the floor where it bubbles.', name: 'Ember Forge', theme: 'forge',
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
  {
    id: 'glacier', hazard: 'icicle', hazardText: 'Icicles fall wherever a shadow appears.', name: 'Glacier Peak', theme: 'glacier', traction: 0.35,
    desc: 'A frozen summit. The ice is slick — momentum carries.',
    platforms: [
      { x1: -660, x2: 660, y: 0, solid: true, h: 260 },
      { x1: -480, x2: -240, y: -200 },
      { x1: 240, x2: 480, y: -200 },
      { x1: -110, x2: 110, y: -400, move: { ax: 0, ay: 60, period: 300 } },
    ],
    blast: { l: -1700, r: 1700, t: -1350, b: 900 },
    sky: ['#0b2a4a', '#3d7fb8', '#cfe9ff'],
  },
  {
    id: 'metro', name: 'Neon Metro', theme: 'metro',
    desc: 'Rooftop brawl under the neon skyline. Billboards rise and fall.',
    platforms: [
      { x1: -780, x2: 780, y: 0, solid: true, h: 240 },
      { x1: -560, x2: -300, y: -230, move: { ax: 0, ay: 90, period: 400 } },
      { x1: 300, x2: 560, y: -230, move: { ax: 0, ay: 90, period: 400, phase: 0.5 } },
      { x1: -120, x2: 120, y: -430 },
    ],
    blast: { l: -1800, r: 1800, t: -1350, b: 900 },
    sky: ['#05020f', '#1c0b3a', '#5a1a6e'],
  },
  {
    id: 'canopy', name: 'Verdant Canopy', theme: 'canopy',
    desc: 'Ancient treetops with branches at every height.',
    platforms: [
      { x1: -620, x2: 620, y: 0, solid: true, h: 220 },
      { x1: -860, x2: -640, y: -120 },
      { x1: 640, x2: 860, y: -120 },
      { x1: -430, x2: -190, y: -260 },
      { x1: 190, x2: 430, y: -260 },
      { x1: -150, x2: 150, y: -440 },
    ],
    blast: { l: -1800, r: 1800, t: -1400, b: 900 },
    sky: ['#0e3b2a', '#3f8f5a', '#d8f3a6'],
  },
  {
    id: 'hyperlane', hazard: 'debris', hazardText: 'Space debris streaks across the deck — the arrow shows where.', name: 'Hyperlane Cruiser', theme: 'hyperlane',
    desc: 'The hull of a starship at warp. A cargo lift sweeps the deck.',
    platforms: [
      { x1: -720, x2: 720, y: 0, solid: true, h: 220 },
      { x1: -200, x2: 200, y: -280, move: { ax: 420, ay: 0, period: 540 } },
    ],
    blast: { l: -1750, r: 1750, t: -1350, b: 900 },
    sky: ['#000004', '#060a24', '#12204a'],
  },
  {
    id: 'abyss', name: 'Abyss Sanctum', theme: 'abyss',
    desc: 'Omega\'s void temple: a small altar flanked by floating islands.',
    platforms: [
      { x1: -480, x2: 480, y: 0, solid: true, h: 280 },
      { x1: -900, x2: -660, y: -40, solid: true, h: 110 },
      { x1: 660, x2: 900, y: -40, solid: true, h: 110 },
      { x1: -120, x2: 120, y: -260 },
    ],
    blast: { l: -1800, r: 1800, t: -1350, b: 900 },
    sky: ['#000000', '#12041f', '#3a0a4a'],
  },
  {
    id: 'reef', name: 'Coral Depths', theme: 'reef', gravity: 0.82,
    desc: 'A sunken arena among the coral. Floaty, buoyant jumps.',
    platforms: [
      { x1: -640, x2: 640, y: 0, solid: true, h: 240 },
      { x1: -470, x2: -230, y: -220, move: { ax: 0, ay: 45, period: 360 } },
      { x1: 230, x2: 470, y: -220, move: { ax: 0, ay: 45, period: 360, phase: 0.5 } },
      { x1: -130, x2: 130, y: -420 },
    ],
    blast: { l: -1750, r: 1750, t: -1400, b: 900 },
    sky: ['#032a4a', '#0a6d8f', '#4fd6c8'],
  },
  {
    id: 'dunes', hazard: 'wind', hazardText: 'Desert gusts push everyone sideways.', name: 'Desert Mirage', theme: 'dunes',
    desc: 'Sun-baked sandstone ruins. A flying carpet glides overhead.',
    platforms: [
      { x1: -760, x2: 760, y: 0, solid: true, h: 250 },
      { x1: -170, x2: 170, y: -270, move: { ax: 460, ay: 30, period: 600 } },
      { x1: -560, x2: -360, y: -150 },
      { x1: 360, x2: 560, y: -150 },
    ],
    blast: { l: -1800, r: 1800, t: -1350, b: 900 },
    sky: ['#f08a3c', '#ffc46b', '#ffe8b0'],
  },
  {
    id: 'storm', hazard: 'lightning', hazardText: 'Lightning strikes the glowing column.', name: 'Thunder Spire', theme: 'storm',
    desc: 'The top of a lightning tower above a raging storm.',
    platforms: [
      { x1: -540, x2: 540, y: 0, solid: true, h: 300 },
      { x1: -380, x2: -140, y: -240 },
      { x1: 140, x2: 380, y: -240 },
      { x1: -120, x2: 120, y: -460, move: { ax: 160, ay: 0, period: 420 } },
    ],
    blast: { l: -1700, r: 1700, t: -1400, b: 900 },
    sky: ['#0b0f1e', '#24304d', '#4a5878'],
  },
  {
    id: 'clockwork', name: 'Clockwork Foundry', theme: 'clockwork',
    desc: 'Brass gears turn as lifts cycle between floors.',
    platforms: [
      { x1: -700, x2: 700, y: 0, solid: true, h: 240 },
      { x1: -520, x2: -300, y: -200, move: { ax: 0, ay: 120, period: 300 } },
      { x1: 300, x2: 520, y: -200, move: { ax: 0, ay: 120, period: 300, phase: 0.5 } },
      { x1: -140, x2: 140, y: -380 },
    ],
    blast: { l: -1750, r: 1750, t: -1350, b: 900 },
    sky: ['#1c120a', '#4a2f17', '#a86b2c'],
  },
  {
    id: 'shrine', name: 'Sakura Shrine', theme: 'shrine',
    desc: 'A mountain shrine at dusk, petals on the wind.',
    platforms: [
      { x1: -680, x2: 680, y: 0, solid: true, h: 230 },
      { x1: -500, x2: -260, y: -210 },
      { x1: 260, x2: 500, y: -210 },
      { x1: -170, x2: 170, y: -400 },
    ],
    blast: { l: -1750, r: 1750, t: -1350, b: 900 },
    sky: ['#2a1a3d', '#c25a7c', '#ffc9a8'],
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
