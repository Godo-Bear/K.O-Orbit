import { save, persist } from '../core/save';
import { CHARACTERS } from '../sim/characters';
import type { MatchRules } from '../sim/types';

export interface StoryEnemy { charId: string; level: number; scale?: number; armor?: boolean; stocks?: number; hp?: number; team?: number }

export interface StoryStage {
  id: string;
  chapter: string;
  title: string;
  briefing: string;
  objective: string;
  rules: MatchRules;
  playerStocks?: number;
  playerHp?: number;
  enemies: StoryEnemy[];
  allies?: StoryEnemy[];
  stars: { damage: number; time: number }; // ★2: take ≤ damage, ★3: clear in ≤ time seconds
  reward?: string; // fighter unlock
  map: { x: number; y: number }; // ladder node position (0..100)
}

export const STORY: StoryStage[] = [
  {
    id: 's1', chapter: 'Chapter 1', title: 'First Contact', map: { x: 8, y: 78 },
    briefing: 'The Orbit Tournament has begun. Every hundred years the arenas circling the dying star Aurex open to challengers. Your first opponent is the iron titan Granite — slow, but every blow lands like a meteor.',
    objective: 'Defeat Granite (2 stocks).',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'crater' },
    enemies: [{ charId: 'brick', level: 2 }],
    stars: { damage: 60, time: 90 },
    reward: 'brick',
  },
  {
    id: 's2', chapter: 'Chapter 1', title: 'The Swarm', map: { x: 22, y: 58 },
    briefing: 'Word of a rookie spreads fast. Three challengers ambush you on the rooftops of Neon Metro, working together to knock you out of the ring.',
    objective: 'Survive a 3-on-1 brawl and KO them all (1 stock each).',
    rules: { mode: 'stock', stocks: 1, timeSec: 0, hp: 150, stageId: 'metro' },
    playerStocks: 2,
    enemies: [{ charId: 'zephyr', level: 2, team: 1 }, { charId: 'nova', level: 2, team: 1 }, { charId: 'volt', level: 2, team: 1 }],
    stars: { damage: 90, time: 75 },
    reward: 'zephyr',
  },
  {
    id: 's3', chapter: 'Chapter 2', title: 'Trial by Fire', map: { x: 36, y: 72 },
    briefing: 'In the Ember Forge, the blaze brawler Ember tests every newcomer in a stamina duel. Burn through her health before she burns through yours.',
    objective: 'Stamina battle: reduce Ember\'s HP to 0 (150 HP).',
    rules: { mode: 'stamina', stocks: 1, timeSec: 0, hp: 150, stageId: 'forge' },
    enemies: [{ charId: 'ember', level: 4 }],
    stars: { damage: 80, time: 70 },
    reward: 'ember',
  },
  {
    id: 's4', chapter: 'Chapter 2', title: 'Meteor Shower', map: { x: 50, y: 48 },
    briefing: 'Aurex flares. Burning debris rains on the Nebula Drift while two rivals fight on. Dodge the meteors — they hit everyone.',
    objective: 'Win a 3-way timed battle (90s) under meteor hazards. Score the most KOs.',
    rules: { mode: 'time', stocks: 0, timeSec: 90, hp: 150, stageId: 'nebula', hazard: 'meteor' },
    enemies: [{ charId: 'brick', level: 4 }, { charId: 'ember', level: 4 }],
    stars: { damage: 120, time: 90 },
    reward: 'kaida',
  },
  {
    id: 's5', chapter: 'Chapter 3', title: 'Frozen Sovereign', map: { x: 62, y: 70 },
    briefing: 'Glacia rules Glacier Peak, where the air is thin, the ice is slick and you fall slower. Her frost lances freeze foes in place. Shatter her guard.',
    objective: 'Defeat Glacia (2 stocks) in low gravity.',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'glacier', gravityMul: 0.75 },
    enemies: [{ charId: 'glacia', level: 5 }],
    stars: { damage: 70, time: 100 },
    reward: 'glacia',
  },
  {
    id: 's6', chapter: 'Chapter 3', title: 'Last One Standing', map: { x: 74, y: 44 },
    briefing: 'The semifinal is a free-for-all high in the Verdant Canopy. Five fighters, one survivor. Every rival will turn on whoever is winning.',
    objective: 'Win a 6-player free-for-all (2 stocks).',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'canopy' },
    enemies: [{ charId: 'nova', level: 5 }, { charId: 'zephyr', level: 5 }, { charId: 'volt', level: 5 }, { charId: 'brick', level: 5 }, { charId: 'glacia', level: 5 }],
    stars: { damage: 140, time: 150 },
    reward: 'seraphine',
  },
  {
    id: 's7', chapter: 'Chapter 4', title: 'The Oathsworn', map: { x: 84, y: 66 },
    briefing: 'Rook, sworn guardian of the Sky Ruins, bars the way to the final arena. His blade reaches farther than you think, and he punishes reckless attacks.',
    objective: 'Defeat Rook (2 stocks). He takes reduced knockback.',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'ruins', damageMul: 1 },
    enemies: [{ charId: 'rook', level: 7, scale: 1.12 }],
    stars: { damage: 80, time: 110 },
    reward: 'rook',
  },
  {
    id: 's8', chapter: 'Finale', title: 'Orbit\'s End', map: { x: 94, y: 30 },
    briefing: 'In the Abyss Sanctum at the heart of the orbit waits Omega, the Void Sovereign — a giant who has never been ejected from the ring. He shrugs off weak hits. Strike hard, survive, and claim the crown of K.O Orbit.',
    objective: 'BOSS: Defeat giant Omega (stamina 260 HP, super armor). You have 3 stocks.',
    rules: { mode: 'stamina', stocks: 1, timeSec: 0, hp: 150, stageId: 'abyss' },
    playerStocks: 3,
    enemies: [{ charId: 'omega', level: 8, scale: 1.55, armor: true, hp: 260 }],
    stars: { damage: 150, time: 120 },
    reward: 'omega',
  },
];

export function isStageUnlocked(i: number) { return i === 0 || !!save.story.cleared[STORY[i - 1].id]; }
export function isCharUnlocked(id: string) {
  const c = CHARACTERS.find((x) => x.id === id);
  return !!c && (c.starter || save.unlocked.includes(id));
}
export function unlockAll() {
  save.unlocked = CHARACTERS.filter((c) => !c.starter).map((c) => c.id);
  for (const s of STORY) save.story.cleared[s.id] = Math.max(1, save.story.cleared[s.id] ?? 0);
  persist();
}

/** Record a story clear; returns newly unlocked fighter id (if any). */
export function recordClear(stage: StoryStage, stars: number): string | null {
  const prev = save.story.cleared[stage.id] ?? 0;
  save.story.cleared[stage.id] = Math.max(prev, stars);
  let unlocked: string | null = null;
  if (stage.reward && !save.unlocked.includes(stage.reward)) { save.unlocked.push(stage.reward); unlocked = stage.reward; }
  persist();
  return unlocked;
}

export function totalStars() { return Object.values(save.story.cleared).reduce((a, b) => a + b, 0); }

/** Fighters unlocked by finishing matches in any mode (Versus, Online, Story, Practice doesn't count). */
export const MATCH_UNLOCKS: { id: string; n: number }[] = [{ id: 'pip', n: 3 }, { id: 'bolt9', n: 6 }];

/** Count a finished match; returns any fighters unlocked by it. */
export function recordMatch(): string[] {
  save.matches = (save.matches ?? 0) + 1;
  const got: string[] = [];
  for (const u of MATCH_UNLOCKS) if (save.matches >= u.n && !save.unlocked.includes(u.id)) { save.unlocked.push(u.id); got.push(u.id); }
  persist();
  return got;
}

/** Human-readable hint for how to unlock a fighter. */
export function unlockHint(id: string): string {
  const st = STORY.findIndex((x) => x.reward === id);
  if (st >= 0) return `Clear Story stage ${st + 1}: ${STORY[st].title}`;
  const m = MATCH_UNLOCKS.find((u) => u.id === id);
  if (m) return `Finish ${m.n} matches (${Math.min(m.n, save.matches ?? 0)}/${m.n})`;
  return '';
}
