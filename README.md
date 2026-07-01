# 🐍 Snake Odyssey

A modern, multi-level take on the classic Snake game — built with vanilla HTML5, CSS, and JavaScript. No build step, no dependencies, no external assets: every visual and sound effect is drawn/synthesized at runtime.

**Play it live:** https://bear0053.github.io/snake-io/

## Features

- **Classic Mode** — endless play on a simple board, beat your high score
- **Level Mode** — six themed levels, each with its own objective, hazards, and mechanics (see below)
- **Endless Mode** — speed and hazard density ramp up over time, with teleport portals that relocate throughout the run
- Smooth grid-based movement with keyboard (Arrow keys / WASD), swipe, and on-screen D-pad controls
- Food variety: regular, golden (bonus points), and poison — 1-3 items spawn on the board at once, each on a random 2-10s lifetime, so a poison spawn never forces your hand
- Full power-up set: Shield, Magnet, Double Points, Slow Time, and Ghost Mode, each with HUD icons, countdown timers, and their own expiration/fade-out
- Six unlockable snake skins, each with a distinct trail effect (see below)
- Full menu flow: Main Menu, Level Select, Snake Select, High Scores, Settings, How to Play, Pause, Game Over, Level Complete
- Procedural audio — a distinct musical motif per level/theme (and one for menus), independent music/SFX toggles, and a music volume slider
- Progress, high scores, unlocks, and settings saved via `localStorage`
- Responsive layout for desktop and mobile, with touch controls

### Levels

| # | Level | Theme | Objective | Signature mechanic |
|---|---|---|---|---|
| 1 | Garden Grove | Grass, apples | Collect 10 food | — |
| 2 | Desert Dunes | Sand, cacti | Collect 12 food | Sandstorm visual haze |
| 3 | Snowy Peaks | Ice | Survive 60s | Slippery movement (turns land every other tick) |
| 4 | Jungle Ruins | Vines, ruins | Reach a score goal | Moving bug hazards |
| 5 | Lava Cavern | Volcanic, lava pools | Collect 14 food | Fastest pace, harshest poison |
| 6 | Cyber Grid | Neon grid | Find the key, reach the exit | Toggling laser barriers + teleport portals |

The key on Cyber Grid (and any future key-based level) doesn't sit on the board waiting — it stays hidden for a random 10-30s, then appears for only 3-7s before vanishing again if uncollected, repeating until you grab one. Teleport portals (Cyber Grid and Endless Mode) work the same way: active for 15-25s, then a 3-8s cooldown before a new pair appears elsewhere.

### Snake Skins

| Skin | Unlocks | Notable trait |
|---|---|---|
| Default | Available from the start | — |
| Fire Snake | Complete Lava Cavern | Flame trail |
| Ice Snake | Complete Snowy Peaks | Frost trail |
| Cyber Snake | Complete Cyber Grid | Neon glow trail |
| Golden Snake | Complete all 6 levels | Sparkle trail |
| Odyssey Snake | Score 500+ in Endless Mode | Star-sparkle trail, golden flash on food pickup, and **Navigator's Luck** — every 6s there's a 40% chance the next non-poison food spawns closer to you |

## Tech Stack

Plain HTML5 Canvas + CSS3 + JavaScript (ES modules) — no frameworks, no bundler, no npm install. All artwork is drawn procedurally on `<canvas>` and all audio is synthesized with the Web Audio API, so the game runs entirely from static files.

## Running Locally

Because the game uses ES module imports (`<script type="module">`), it needs to be served over `http://` rather than opened directly as a `file://` URL (browsers block module imports from the filesystem).

```bash
# from the project root
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Controls

| Input | Action |
|---|---|
| Arrow keys / WASD | Steer the snake |
| Swipe (touch) | Steer the snake |
| On-screen D-pad (touch) | Steer the snake |
| Esc / Space | Pause / Resume |

## Project Structure

```
index.html          Page shell: canvas, HUD, and all menu/screen overlays
styles.css           Layout, HUD, D-pad, and responsive styling
js/
  main.js            App entry point — boot, navigation, event wiring, music-theme syncing
  state.js            Finite state machine for menu/game screens
  engine.js            Fixed-timestep game loop, movement, spawn/expiry cycles, tick logic
  entities.js          Snake, food, power-up, and obstacle data models
  levels.js             Level registry (all 6 levels), Classic/Endless pseudo-levels, difficulty scaling
  snakes.js             Snake skin registry and unlock conditions
  foods.js               Food type registry
  powerups.js             Power-up registry and active-effect handling
  collision.js             Wall / self / obstacle collision detection
  render.js                 Canvas drawing, per-theme visuals, cached backgrounds
  input.js                   Keyboard, swipe, and D-pad input handling
  audio.js                    Procedural SFX and per-theme music
  storage.js                   localStorage save/load for progress and settings
  ui.js                         Screen population and HUD updates
  resize.js                      Responsive canvas sizing
.claude/skills/
  run/                 How to serve and browser-test this project (Playwright + system Chrome)
  cleanup/             Whole-codebase tech-debt/quality review process
  push/                Commit + push shortcut with safety guardrails
```

Levels, skins, food types, and power-ups are each a flat data registry consumed by generic engine/render code — adding new content is a data addition, not a rewrite.

## Roadmap

Everything in the original design spec's core feature list is implemented. Ideas noted as optional future enhancements:

- Online leaderboard
- Daily challenge mode
- Multiplayer snake battle
- Boss levels
- Coins/shop system
- Achievements
- User accounts
- Progressive Web App install support
