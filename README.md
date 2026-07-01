# 🐍 Snake Odyssey

A modern, multi-level take on the classic Snake game — built with vanilla HTML5, CSS, and JavaScript. No build step, no dependencies, no external assets: every visual and sound effect is drawn/synthesized at runtime.

**Play it live:** https://bear0053.github.io/snake-io/ *(once GitHub Pages is enabled in repo settings — see below)*

## Features (Phase 1)

- **Classic Mode** — endless play, beat your high score
- **Level Mode** — themed levels with objectives (Garden Grove is playable now; more themes coming)
- Smooth grid-based movement with keyboard (Arrow keys / WASD), swipe, and on-screen D-pad controls
- Food variety: regular, golden (bonus points), and poison
- Power-ups: Shield, Magnet, Double Points — each with HUD icons and countdown timers
- Unlockable snake skins (Default available now, Fire Snake unlocks after completing the Lava Cavern level)
- Full menu flow: Main Menu, Level Select, Snake Select, High Scores, Settings, How to Play, Pause, Game Over, Level Complete
- Procedural audio (sound effects + ambient music), independently toggleable
- Progress, high scores, unlocks, and settings saved via `localStorage`
- Responsive layout for desktop and mobile, with touch controls

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
  main.js            App entry point — boot, navigation, and event wiring
  state.js            Finite state machine for menu/game screens
  engine.js            Fixed-timestep game loop, movement, and tick logic
  entities.js          Snake, food, power-up, and obstacle data models
  levels.js             Level definitions (Garden Grove) and Classic Mode
  snakes.js             Snake skin registry and unlock conditions
  foods.js               Food type registry
  powerups.js             Power-up registry and active-effect handling
  collision.js             Wall / self / obstacle collision detection
  render.js                 Canvas drawing and per-theme visuals
  input.js                   Keyboard, swipe, and D-pad input handling
  audio.js                    Procedural sound effects and music
  storage.js                   localStorage save/load for progress and settings
  ui.js                         Screen population and HUD updates
  resize.js                      Responsive canvas sizing
```

## Roadmap

Phase 1 is a fully playable vertical slice. Planned next:

- Levels 2–6: Desert Dunes, Snowy Peaks, Jungle Ruins, Lava Cavern, Cyber Grid
- Remaining snake skins: Ice, Cyber, Golden
- Full power-up set: Slow Time, Ghost Mode
- Endless Mode
- Additional polish: level transitions, particle effects, achievements
