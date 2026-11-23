# K.O Orbit

A fast, responsive platform fighter for the browser. It renders sharply at 4K, runs on a fixed 60 Hz timestep, and supports **up to 10 players (P1–P10)** locally and online. There are 8 fighters, 5 stages, and an 8-stage Story Mode that unlocks 4 of the fighters.

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

## Engineering notes

- **No-lag loop:** the simulation steps at a fixed 60 Hz, separate from rendering. Frame delta is clamped to 100 ms and catch-up is capped at 6 steps, so alt-tabbing or a GC hitch never breaks physics. Rendering interpolates between steps.
- **4K / Retina:** the canvas backing store is `cssSize × devicePixelRatio` (up to 3×). Settings include a 75%/50% render-scale option for weaker GPUs.
- **Allocation-free hot paths:** particles (1,400) and projectiles (96) come from pre-allocated pools.
- **Perf HUD (F2):** shows FPS, render ms, sim step ms, steps per frame, entity counts, canvas size, and online role, room and RTT. **F4** shows hitboxes, hurtboxes and blast zones.
- **Online model:** the host is authoritative. Clients send input every frame, carrying the last 3 frames to survive packet loss. The host keeps a per-player jitter buffer: it drops excess frames (merging their button presses) and holds the last input when it runs dry. It applies an optional local input delay for fairness and streams compact snapshots at 30 Hz, including events for effects and audio. Clients interpolate between snapshots. The room cap is enforced at the relay (`full` error for the 11th player), in the lobby, and in `World`.

## Controls (all rebindable in *Controls*)

| Action | Keys 1 | Keys 2 | Gamepad |
|---|---|---|---|
| Move | WASD | Arrows | Left stick / D-pad |
| Jump | Space (or W with tap-jump) | Num0 / RShift (or ↑) | X / Y |
| Attack | J | Num1 / , | A |
| Special | K | Num2 / . | B |
| Shield / dodge | L | Num3 / / | LB / RB / LT / RT |
| Smash | I | Num5 / M | Right stick, or flick + A |
| Pause | Esc | Backspace | Start |

Up to 10 local players: two keyboard schemes plus any number of gamepads. In Versus, press **Start** on a gamepad to join. Menus work with the mouse, the keyboard (arrows, Enter, Esc) and gamepads (D-pad, A, B).
