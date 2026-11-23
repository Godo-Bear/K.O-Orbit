import type { Fighter } from './fighter';
import type { World } from './world';

export type Fx = 'hit' | 'fire' | 'elec' | 'ice' | 'slash' | 'dark' | 'wind';

export interface Hitbox {
  s: number; e: number; // active frames (inclusive, 1-based move frame)
  x: number; y: number; r: number; // offset from feet (x toward facing, y up negative) in px for a size-1 fighter
  dmg: number;
  ang: number; // launch angle in degrees, 0 = forward, 90 = up, 270 = down (spike)
  bkb: number; kbg: number;
  g?: number; // hit group: a victim can be hit once per group per move
  rehit?: number; // multi-hit interval in frames
  fx?: Fx;
  freeze?: number; // bonus hitstun (ice)
  lag?: number; // hitlag multiplier
}

export type Limb = 'armF' | 'armB' | 'legF' | 'legB' | 'both' | 'body' | 'spin';

export interface MoveDef {
  id: string;
  name: string;
  total: number;
  hitboxes: Hitbox[];
  limb?: Limb;
  air?: boolean; // aerial: landing during it causes landing lag
  landingLag?: number;
  charge?: number; // frame at which a held button charges (smash / chargeable special)
  chargeBtn?: 'attack' | 'special' | 'smash';
  maxCharge?: number;
  helpless?: boolean; // becomes helpless when finished in the air
  recovery?: boolean; // can grab ledge during
  slide?: boolean; // keeps momentum and can slide off ledges
  armor?: [number, number];
  invuln?: [number, number];
  reflect?: [number, number];
  counter?: [number, number];
  noGravity?: [number, number];
  update?: (f: Fighter, w: World, frame: number) => void;
  onLand?: (f: Fighter, w: World) => boolean; // return true if handled (custom landing)
  pose?: string; // visual pose hint
}

export interface CharStats {
  walk: number; run: number; air: number; airAccel: number;
  gravity: number; fall: number; fastFall: number;
  jump: number; shortHop: number; djump: number; jumps: number;
  weight: number; traction: number; size: number; power: number; jumpSquat: number;
}

export interface CharVisual {
  body: string; accent: string; skin: string; dark: string;
  head: 'round' | 'square' | 'helmet' | 'spiky';
  accessory: 'visor' | 'shoulders' | 'scarf' | 'antenna' | 'flame' | 'crystal' | 'sword' | 'horns';
  bulk: number; // limb thickness multiplier
  fx: Fx;
  // --- costume detail (high-fidelity rig) ---
  glove: string; boot: string; hair: string; eye: string;
  cape: string | null; // cape / long cloth colour
  emblem: 'star' | 'gear' | 'wind' | 'bolt' | 'flame' | 'snow' | 'crest' | 'void';
  shoulder: number; waist: number; // torso half-widths
  glow: string; // aura / energy colour
  armor?: string; // gold/rock armour pieces (pauldrons, chest plate, knee guards)
  chestPlate?: boolean;
  bareTorso?: boolean; // torso drawn in skin tone (Ember)
  cracks?: string; // glowing crack colour over body (Granite magma)
  fist?: number; // hand size multiplier
  hips?: number; // hip width bonus (silhouette)
  emblemColor?: string; // chest emblem colour (defaults to accent)
  skirt?: string; // dress / tasset colour (Glacia)
  tabard?: string; // front cloth panel (Omega)
  handFire?: [string, string]; // flame colours around fists (Ember / Omega)
  jointCol?: string; // knee & elbow guards
}

export interface CharDef {
  id: string;
  name: string;
  title: string;
  blurb: string;
  starter: boolean;
  stats: CharStats;
  visual: CharVisual;
  moves: Record<string, MoveDef>; // jab ftilt utilt dtilt dash fsmash usmash dsmash nair fair bair uair dair nspec sspec uspec dspec ledge getup
  ratings: { speed: number; power: number; weight: number; air: number }; // 1..5 for UI
}

export interface GameEvent {
  type: 'hit' | 'shieldhit' | 'shieldbreak' | 'ko' | 'jump' | 'djump' | 'land' | 'whiff' | 'reflect' | 'counter'
    | 'proj' | 'dodge' | 'ledge' | 'tech' | 'count' | 'go' | 'game' | 'charge' | 'clank' | 'respawn' | 'hazard';
  x: number; y: number;
  p?: number; // power / magnitude
  slot?: number; // fighter slot involved
  fx?: Fx;
  ang?: number;
  n?: number;
}

export interface MatchRules {
  mode: 'stock' | 'time' | 'stamina';
  stocks: number;
  timeSec: number; // 0 = no limit (stock/stamina)
  hp: number;
  stageId: string;
  hazard?: 'meteor' | 'none';
  gravityMul?: number;
  damageMul?: number;
  objective?: 'win' | 'survive';
}

export interface SlotConfig {
  slot: number; // 0..9 (determines color / P#)
  type: 'HUMAN' | 'CPU' | 'REMOTE';
  charId: string;
  cpuLevel: number;
  device?: string;
  team: number; // -1 FFA
  name?: string;
  scale?: number; // boss scale
  stocks?: number; // override
  hp?: number; // override
  armor?: boolean; // boss super armor
}
