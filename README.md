# K.O Orbit

A fast, responsive platform fighter for the browser. It renders sharply at 4K, runs on a fixed 60 Hz timestep, and supports **up to 10 players (P1–P10)** locally and online. There are 12 fighters, 15 stages, a procedural soundtrack, a Practice mode, and an 8-stage Story Mode that unlocks 4 of the fighters.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (includes the online room relay)
npm run build      # type-check + production build into dist/
npm run test:sim   # headless 2- and 10-fighter matches on every stage, plus every move of every fighter
```

## Deploying to Cloudflare (the `main` branch)

The project deploys as a **Cloudflare Worker with static assets**. One deploy serves the game and the online relay. The relay is a Durable Object per room code and enforces the 10-player cap.

**Option A: connect the repo (recommended)**
1. Cloudflare dashboard → *Workers & Pages* → *Create* → *Import a repository* → pick this repo, branch `main`.
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy` (this is the default).
3. `wrangler.jsonc` already declares the assets directory (`dist`), the `RoomDO` Durable Object binding, and its migration. SQLite-backed Durable Objects work on the free plan.

**Option B: deploy from your machine**
```bash
npx wrangler login
npm run deploy
```

**Cloudflare Pages (static only):** you can also deploy `dist/` to Pages (build `npm run build`, output `dist`). Pages can't host the WebSocket relay, though. For online play there, deploy the Worker as well, then set *Settings → Online → Relay server URL* to the Worker's URL (for example `wss://ko-orbit.<you>.workers.dev`).

`npm run cf:dev` runs the Worker plus Durable Object locally under workerd.

## Project structure

```
src/
  core/        constants (MAX_PLAYERS=10, P1–P10 colors), fixed-timestep loop, input
               (keyboard + Gamepad API + rebinding capture), pure input frames, save data (localStorage), RNG
  sim/         deterministic simulation — no DOM
    fighter.ts   state machine: walk/dash/run, crouch, jumpsquat, short/full hop, multi-jump, fast-fall,
                 drop-through, ledge grab/climb/jump/roll/attack/drop, shields, shield stun/break,
                 spot dodge, rolls, air dodge, hitstun, tumble, tech, bounce, knockdown, getup
    world.ts     hit detection, knockback formula, DI, hitlag, shields, counters, armor, reflectors,
                 pooled projectiles, hazards, blast zones, respawns, stock/time/stamina rules, placements
    characters.ts 8 fighters: stats, frame data, 13 normals + ledge/getup attacks + 4 specials each
    stages.ts    5 stages: solid mains with ledges, soft platforms, moving platforms, blast zones
    ai.ts        CPU levels 1–9 (reaction, defense, tech, edge recovery, attack selection)
  render/      Canvas 2D renderer (devicePixelRatio aware), smooth camera, parallax backgrounds,
               procedural rigs and animations, pooled particles, HUD for 2–10 players, off-screen bubbles, perf HUD
  audio/       procedural Web Audio synth (hits, smashes, jumps, shields, KOs, countdown, menus)
  story/       campaign data, stars, unlock rewards, persistence
  net/         WebSocket room client and snapshot/input protocol
  game/        Session: local / demo / online host (authoritative) / online client
  ui/          DOM menus with keyboard, mouse and gamepad spatial navigation
worker/index.ts  Cloudflare Worker (serves dist/) + RoomDO Durable Object relay
vite.config.ts   dev/preview relay with the same protocol, so `npm run dev` supports online play
scripts/headless.ts  simulation smoke tests
```

## Modes

- **Versus:** local battles for 2–10 fighters with human and CPU slots, Stock, Time or Stamina rules, and optional teams.
- **Story Mode:** an 8-stage ladder with stars and fighter unlocks.
- **Practice:** a training dummy that can stand, shield, crouch, jump or fight back as a level 1–9 CPU. It has a combo counter, damage readouts, a frame readout, position reset and dummy % presets, and hitboxes on F4.
- **Online:** room-code play for up to 10 players.

## Unlocking fighters

You start with **Nova** and **Volt**. The other ten unlock as you play:

| Fighter | How to unlock |
|---|---|
| Granite | Clear Story stage 1 |
| Zephyr | Clear Story stage 2 |
| Ember | Clear Story stage 3 |
| Kaida | Clear Story stage 4 |
| Glacia | Clear Story stage 5 |
| Seraphine | Clear Story stage 6 |
| Rook | Clear Story stage 7 |
| Omega | Clear Story stage 8 |
| Pip | Finish 3 matches (Versus, Online or Story) |
| Bolt-9 | Finish 6 matches |

Settings → Unlock All Fighters unlocks everything, and Reset Story Progress locks them again.

## Character art

Fighters can render with your **illustrated character art** (Settings → Fighter art) or as an animated vector rig.

**Cut-out puppets:** each character's art is sliced into a body and four limbs (arms and legs) with shoulder and hip pivots. Where the limbs covered the body, it is repainted with a shadowed fill. The pieces are driven by the same skeleton as the vector rig, so punches, kicks and sword swings move the real limbs, and striking limbs thrust out along their own axis. Limb pivots and outlines are listed in `RIGS` in `scripts/cutout.py`.

**Animation:** every pose (puppet and vector) runs through a slightly under-damped spring, so strikes snap out, overshoot a touch and settle, and transitions never pop.
The art is cut from the reference sheets in `art-src/` by `scripts/cutout.py`, which removes the background, keeps the main figure and exports `public/art/<id>_full.png`, `<id>_head.png` and a manifest. To add or replace art:

```bash
python3 scripts/cutout.py
```

The script needs Pillow. Fighters without art fall back to the vector rig automatically.

## Music

Every stage has its own procedurally composed theme. There are also menu and victory themes. Each track is a look-ahead Web Audio sequencer with drums, bass, pad, arpeggio and a seeded lead melody (`src/audio/music.ts`). The volume is under Settings → Music volume.

## Fighters

| Fighter | Look | Style |
|---|---|---|
| Nova, The Star Pilot | Fishbowl helmet with starfield glass and a gold star, royal-blue suit, white gloves and boots, jetpack | All-rounder: plasma shot, comet dash |
| Granite, The Walking Quarry | 7-ft rock golem, magma cracks, glowing eyes, giant stone fists | Heavyweight: armored charge, quake stomp |
| Zephyr, The Drifting Gale | Mint bodysuit, winged teal helmet, platinum hair, long pink scarf | Fast, 4 jumps: wind shuriken, counter |
| Volt, The Live Wire | Spiky gold hair, sky-blue goggles, gold armor, crackling sparks | Zoner: ball lightning, arc lash, reflector |
| Ember, The Hearth Brawler *(unlock)* | Ember skin, flame hair, flaming fists, gold "hearth core" belt | Rushdown: fireballs, flame wheel |
| Glacia, The Frost Sovereign *(unlock)* | Tall crystal crown, waist-length ice-white hair, crystal armor and skirt, snowflake cape | Control: freezing lances, crystal shield |
| Rook, The Oathsworn Knight *(unlock)* | Gold-trimmed great-helm with red plume, steel plate, sun crest, chainmail, red cape, glowing longsword | Sword reach: charge blade, riposte |
| Kaida, The Tide Dancer | Teal-and-white gi, coral sash, long ponytail, water rings | Fast martial artist: water whip, tide rush, bubble shield reflector |
| Pip, The Pocket Mage | Tiny bearded wizard on a flying spellbook, starry hat, crystal staff | Floaty zoner, 3 jumps: arcane bolt, blink, giant book drop |
| Seraphine, The Solar Saint | Golden wings, sun halo, white-and-gold armor, radiant spear | Long reach, 3 jumps: sun spear throw, wing dash, solar flare |
| Bolt-9, The Scrap Titan | Rusty orange robot, green eye, clamp hands, tank treads | Super-heavy: rocket fist, magnet pull, armored overheat blast |
| Omega, The Void Sovereign *(unlock)* | 7-ft void lord: great curved horns, glowing magenta eyes, spiked dark armor, void-ring emblem, purple-flame fists, tattered cape | Boss: warp strike, singularity |

## Engineering notes

- **No-lag loop:** the simulation steps at a fixed 60 Hz, separate from rendering. Frame delta is clamped to 100 ms and catch-up is capped at 6 steps, so alt-tabbing or a GC hitch never breaks physics. Rendering interpolates between steps.
- **4K without lag:** the default "Auto" resolution renders at the screen's native sharpness, capped at 4K (3840×2160 pixels).
  - A dynamic-resolution controller (`src/render/adaptive.ts`) watches real frame times and, only if the game drops below 60 FPS, lowers the render resolution in 10% steps (down to 50%). It climbs back once frames are smooth again, with exponential back-off so it never oscillates. Native, 75% and 50% can also be fixed in Settings.
  - Cost-saving measures:
    - Distant background layers render at half resolution on high-res screens.
    - Pre-built mip levels with bilinear sampling in-game, avoiding Chrome's slow high-quality resample path.
    - Static stage gradients are cached.
    - There are no full-screen backdrop blurs.
  - The Perf HUD (F2) shows the live resolution and scale.
- **Art pipeline:** everything is procedural vector art, so it is sharp at any resolution.
  - **Fighters:** cel-shaded tapered limbs, ink outlines, rim/cel highlights, per-character costumes and heads, reactive capes, scarves and hair, and expressions for blinking, attacking and getting hurt. Platform surfaces use pattern tiles cached at 4 px per world unit.
  - **Backgrounds:** soft sky glows and aurora are baked into a quarter-resolution atmosphere layer and upscaled with one draw. Crisp silhouettes stay full-resolution vector. Foreground layers add depth.
  - **Camera and UI:** the world transform is pixel-snapped. The UI and HUD scale up on 4K and ultrawide screens.
- **Juice:** directional hit sparks, impact flashes, attack smear trails, dash speed lines, smash charge shake and glow, shield pulse and cracks, and KO screen-edge bursts. *Settings → Visual intensity* (Full / Reduced / Minimal, defaulting to Reduced under `prefers-reduced-motion`) tones down flashes, shake and particle counts.
- **Input buffer:** attack, special, jump and smash presses are buffered for 6 frames, so they come out the moment you can act.
- **Dev gallery:** open `/#gallery` to see every fighter in every key pose.
- **Allocation-free hot paths:** particles (1,400) and projectiles (96) come from pre-allocated pools.
- **Perf HUD (F2):** shows FPS, render ms, sim step ms, steps per frame, entity counts, canvas size, and online role, room and RTT. **F4** shows hitboxes, hurtboxes and blast zones.
- **Online model:** the host is authoritative. Clients send input every frame, carrying the last 3 frames to survive packet loss. The host keeps a per-player jitter buffer: it drops excess frames (merging their button presses) and holds the last input when it runs dry. It applies an optional local input delay for fairness and streams compact snapshots at 30 Hz, including events for effects and audio. Clients interpolate between snapshots. The room cap is enforced at the relay (`full` error for the 11th player), in the lobby, and in `World`.

## Controls (all rebindable in *Controls*)

| Action | Keys 1 | Keys 2 | Gamepad |
|---|---|---|---|
| Move | WASD | Arrows | Left stick / D-pad |
| Jump | Space / Scroll Up (or W with tap-jump) | Num0 / RShift (or ↑) | X / Y |
| Attack | J / Left Click | Num1 / , | A |
| Special | K / Right Click | Num2 / . | B |
| Shield / dodge | L / Middle Click | Num3 / / | LB / RB / LT / RT |
| Smash | I / Scroll Down | Num5 / M | Right stick, or flick + A |
| Pause | Esc | Backspace | Start |

**Touch controls:** phones and tablets get an on-screen floating stick plus Attack, Special, Jump, Shield, Smash and Pause buttons. They control P1 (Settings → Touch controls: Auto / On / Off).

**Feel:** inputs are buffered for 6 frames (attack, special, jump, smash, shield), with a 6-frame coyote-time jump after walking off a ledge. The optional **Quick smash** (per keyboard scheme) turns a direction tap plus Attack into a smash attack. The Controls screen has a live input tester for every keyboard and gamepad.

**Difficulty:** Story Mode has Easy / Normal / Hard / Expert, set in Settings or the story briefing. Easy lowers enemy CPU levels by 2 and gives an extra life. Hard raises them by 2. Expert raises them by 4, removes a life and gives stamina bosses 30% more HP. Versus has an "All CPUs" level setter, and the online lobby has a CPU level for added CPUs.

Any action can be bound to a key, a mouse button (left, right, middle, back, forward) or a scroll direction. During a match, the mouse and wheel act as game controls and the right-click menu is suppressed; in menus they behave normally. Key taps shorter than one frame are latched, so quick presses always register.

Up to 10 local players: two keyboard schemes plus any number of gamepads. In Versus, press **Start** on a gamepad to join. Menus work with the mouse, the keyboard (arrows, Enter, Esc) and gamepads (D-pad, A, B).
