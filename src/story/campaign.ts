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
  boss?: boolean;
  goal?: 'survive'; // win by still having a stock when the timer runs out
}

export const STORY: StoryStage[] = [
  {
    id: 's1', chapter: 'Chapter 1', title: 'First Contact', map: { x: 6, y: 82 },
    briefing: 'The Orbit Tournament has begun. Every hundred years the arenas circling the dying star Aurex open to challengers. Your first opponent is the iron titan Granite — slow, but every blow lands like a meteor.',
    objective: 'Defeat Granite (2 stocks).',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'crater' },
    enemies: [{ charId: 'brick', level: 2 }],
    stars: { damage: 60, time: 90 },
    reward: 'brick',
  },
  {
    id: 's2', chapter: 'Chapter 1', title: 'The Swarm', map: { x: 17, y: 64 },
    briefing: 'Word of a rookie spreads fast. Three challengers ambush you on the rooftops of Neon Metro, working together to knock you out of the ring.',
    objective: 'Survive a 3-on-1 brawl and KO them all (1 stock each). They take turns — one challenger at a time.',
    rules: { mode: 'stock', stocks: 1, timeSec: 0, hp: 150, stageId: 'metro', maxGangUp: 1 },
    playerStocks: 3,
    enemies: [{ charId: 'zephyr', level: 1, team: 1 }, { charId: 'nova', level: 2, team: 1 }, { charId: 'volt', level: 1, team: 1 }],
    stars: { damage: 130, time: 100 },
    reward: 'zephyr',
  },
  {
    id: 's3', chapter: 'Chapter 2', title: 'Trial by Fire', map: { x: 28, y: 82 },
    briefing: 'In the Ember Forge, the blaze brawler Ember tests every newcomer in a stamina duel. Burn through her health before she burns through yours.',
    objective: 'Stamina battle: reduce Ember\'s HP to 0 (150 HP).',
    rules: { mode: 'stamina', stocks: 1, timeSec: 0, hp: 150, stageId: 'forge' },
    enemies: [{ charId: 'ember', level: 4 }],
    stars: { damage: 80, time: 70 },
    reward: 'ember',
  },
  {
    id: 's4', chapter: 'Chapter 2', title: 'Meteor Shower', map: { x: 39, y: 62 },
    briefing: 'Aurex flares. Burning debris rains on the Nebula Drift while two rivals fight on. Dodge the meteors — they hit everyone.',
    objective: 'Win a 3-way timed battle (90s) under meteor hazards. Score the most KOs.',
    rules: { mode: 'time', stocks: 0, timeSec: 90, hp: 150, stageId: 'nebula', hazard: 'meteor', maxGangUp: 1 },
    enemies: [{ charId: 'brick', level: 4 }, { charId: 'ember', level: 4 }],
    stars: { damage: 120, time: 90 },
    reward: 'kaida',
  },
  {
    id: 's5', chapter: 'Chapter 3', title: 'Frozen Sovereign', map: { x: 50, y: 80 },
    briefing: 'Glacia rules Glacier Peak, where the air is thin, the ice is slick and you fall slower. Her frost lances freeze foes in place. Shatter her guard.',
    objective: 'Defeat Glacia (2 stocks) in low gravity.',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'glacier', gravityMul: 0.75 },
    enemies: [{ charId: 'glacia', level: 5 }],
    stars: { damage: 70, time: 100 },
    reward: 'glacia',
  },
  {
    id: 's6', chapter: 'Chapter 3', title: 'Last One Standing', map: { x: 61, y: 60 },
    briefing: 'The semifinal is a free-for-all high in the Verdant Canopy. Five fighters, one survivor. Every rival will turn on whoever is winning.',
    objective: 'Win a 6-player free-for-all (2 stocks).',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'canopy', maxGangUp: 2 },
    enemies: [{ charId: 'nova', level: 5 }, { charId: 'zephyr', level: 5 }, { charId: 'volt', level: 5 }, { charId: 'brick', level: 5 }, { charId: 'glacia', level: 5 }],
    stars: { damage: 140, time: 150 },
    reward: 'seraphine',
  },
  {
    id: 's7', chapter: 'Chapter 4', title: 'The Oathsworn', map: { x: 72, y: 78 },
    briefing: 'Rook, sworn guardian of the Sky Ruins, bars the way to the final arena. His blade reaches farther than you think, and he punishes reckless attacks.',
    objective: 'Defeat Rook (2 stocks). He takes reduced knockback.',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'ruins', damageMul: 1 },
    enemies: [{ charId: 'rook', level: 7, scale: 1.12 }],
    stars: { damage: 80, time: 110 },
    reward: 'rook',
  },
  {
    id: 's8', chapter: 'Finale', title: 'Orbit\'s End', map: { x: 86, y: 60 }, boss: true,
    briefing: 'In the Abyss Sanctum at the heart of the orbit waits Omega, the Void Sovereign — a giant who has never been ejected from the ring. He shrugs off weak hits. Strike hard, survive, and claim the crown of K.O Orbit.',
    objective: 'BOSS: Defeat giant Omega (stamina 260 HP, super armor). You have 3 stocks.',
    rules: { mode: 'stamina', stocks: 1, timeSec: 0, hp: 150, stageId: 'abyss' },
    playerStocks: 3,
    enemies: [{ charId: 'omega', level: 8, scale: 1.55, armor: true, hp: 260 }],
    stars: { damage: 150, time: 120 },
    reward: 'omega',
  },
  {
    id: 's9', chapter: 'Chapter 5', title: 'Tidebreakers', map: { x: 93, y: 34 },
    briefing: 'Omega has fallen, but the orbit still shakes. Beneath the waves of Coral Depths, Kaida and Pip have formed an unlikely team — and they want the champion\'s title.',
    objective: '2-on-1: defeat Kaida and Pip (1 stock each). They take turns. Floaty underwater gravity.',
    rules: { mode: 'stock', stocks: 1, timeSec: 0, hp: 150, stageId: 'reef', maxGangUp: 1 },
    playerStocks: 3,
    enemies: [{ charId: 'kaida', level: 5, team: 1 }, { charId: 'pip', level: 5, team: 1 }],
    stars: { damage: 110, time: 90 },
  },
  {
    id: 's10', chapter: 'Chapter 5', title: 'The Iron Colossus', map: { x: 79, y: 22 },
    briefing: 'Deep in the Clockwork Foundry, a scrap titan has been rebuilt to twice its size. Its armor shrugs off light hits — wait for openings and land your strongest attacks.',
    objective: 'BOSS: defeat giant Bolt-9 (stamina 240 HP, super armor). You have 3 stocks.',
    rules: { mode: 'stamina', stocks: 1, timeSec: 0, hp: 150, stageId: 'clockwork' },
    playerStocks: 3,
    enemies: [{ charId: 'bolt9', level: 6, scale: 1.45, armor: true, hp: 240 }],
    stars: { damage: 120, time: 110 },
    boss: true,
  },
  {
    id: 's11', chapter: 'Chapter 5', title: 'Eye of the Storm', map: { x: 65, y: 38 },
    briefing: 'A lightning storm traps you atop Thunder Spire with four restless challengers. You don\'t need to win — just still be standing when the storm passes.',
    objective: 'SURVIVE for 60 seconds against 4 fighters (you have 2 stocks). Two attack at a time.',
    rules: { mode: 'stock', stocks: 99, timeSec: 60, hp: 150, stageId: 'storm', maxGangUp: 2 },
    playerStocks: 2,
    enemies: [{ charId: 'volt', level: 4 }, { charId: 'zephyr', level: 4 }, { charId: 'ember', level: 4 }, { charId: 'brick', level: 4 }],
    stars: { damage: 80, time: 60 },
    goal: 'survive',
  },
  {
    id: 's12', chapter: 'Chapter 5', title: 'Mirror Match', map: { x: 51, y: 22 },
    briefing: 'At the Sakura Shrine, a reflection steps out of the still pond — wearing your face and knowing every one of your moves.',
    objective: 'Defeat a mirror copy of your own fighter (2 stocks).',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'shrine' },
    enemies: [{ charId: 'mirror', level: 6 }],
    stars: { damage: 80, time: 100 },
  },
  {
    id: 's13', chapter: 'Chapter 5', title: 'Wings of Dawn', map: { x: 37, y: 38 },
    briefing: 'Seraphine and Zephyr rule the skies above the ruins. Glacia offers to fight at your side — a team battle in thin, floaty air.',
    objective: 'TEAM BATTLE: you + Glacia vs Seraphine + Zephyr (2 stocks each). Light gravity.',
    rules: { mode: 'stock', stocks: 2, timeSec: 0, hp: 150, stageId: 'ruins', gravityMul: 0.85 },
    allies: [{ charId: 'glacia', level: 6 }],
    enemies: [{ charId: 'seraphine', level: 6, team: 1 }, { charId: 'zephyr', level: 6, team: 1 }],
    stars: { damage: 90, time: 120 },
  },
  {
    id: 's14', chapter: 'Finale II', title: 'The Last Orbit', map: { x: 20, y: 20 },
    briefing: 'Omega returns from the void with a rebuilt Bolt-9 at his side. Rook swears his blade to you for one final battle. Win this, and the orbit is yours forever.',
    objective: 'FINAL BOSS: you + Rook vs giant Omega (2 stocks, armor) + Bolt-9 (2 stocks).',
    rules: { mode: 'stock', stocks: 3, timeSec: 0, hp: 150, stageId: 'abyss', maxGangUp: 1 },
    allies: [{ charId: 'rook', level: 7 }],
    enemies: [{ charId: 'omega', level: 7, scale: 1.4, armor: true, stocks: 2, team: 1 }, { charId: 'bolt9', level: 6, stocks: 2, team: 1 }],
    stars: { damage: 110, time: 180 },
    boss: true,
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
