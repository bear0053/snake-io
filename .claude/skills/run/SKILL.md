---
name: run
description: Launch and test the Snake Odyssey game (snake-io) in a browser, and run its persistent pytest regression suite. Use when asked to run, start, test, verify, or screenshot the snake-io game, or to confirm a code change actually works.
---

# Running Snake Odyssey (snake-io)

Plain HTML/CSS/JS with ES modules, no build step, no dependencies. Must be served over `http://`, not opened as `file://` — browsers block ES module imports from the filesystem.

## Persistent regression suite (preferred)

There's a maintained pytest suite in `tests/` covering navigation, food/power-up spawn+expiry, level mechanics (delayed keys, portals, lasers, moving hazards, slippery ice, shield/ghost), skin unlocks, Odyssey Snake's Navigator's Luck, music-theme selection, and progression/high scores. Prefer running and extending this over writing a new throwaway script.

```bash
pip install pytest playwright   # one-time; do NOT run `playwright install` (see below)
cd snake-io
pytest tests/
```

`tests/conftest.py` starts its own dev server on a dedicated port (8123) and launches Chrome itself — no manual server setup needed. When you add a new mechanic, add a test alongside the existing ones in `tests/` rather than a one-off script in a scratch directory; `tests/helpers.py` has the shared utilities (see below).

## Cloud suite (opt-in: `pytest tests/ --cloud`)

`tests/cloud/` exercises real Firebase Auth + Cloud Functions + Firestore via the local
emulators - unlike the rest of `tests/`, which only fakes "authenticated" via
`window.__debug.setGuestOverride` (see below) and never touches the backend at all. It's
skipped by default so plain `pytest tests/` stays fast and dependency-free; pass `--cloud`
to run it (requires Node 20+, a JDK 21+, and the Firebase CLI - see `backend/README.md`).
It's slower (~2-3 minutes: emulator startup + warm-up + real network round-trips) and has
its own `tests/cloud/conftest.py` (separate `firebase_emulators` + `page` fixtures) and
`tests/helpers.py:sign_up`/`sign_in`/`sign_out`/`unique_email` helpers.

Two real bugs only ever surfaced through this suite, never through the debug-hook suite or
manual testing against production:
- **Game-loop re-entrancy** (`frontend/js/engine.js`): making `handleGameEnded` `async` (to
  await a backend call) meant `createGameLoop`'s frame callback could call `onEnded(game)`
  again on a later animation frame, before the first call's backend round-trip resolved -
  a second, unvalidated call would race ahead and record the raw score directly. Fixed
  with a `game.endNotified` guard so `onEnded` only ever fires once per game.
- **Concurrent auth-state sync** (`frontend/js/main.js`): Firebase can fire the
  `onAuthStateChanged` listener twice in quick succession for one sign-up (its own event,
  plus `signUpEmail`'s manual re-emit once `updateProfile` lands) - two overlapping
  `getOrCreatePlayerProfile()` calls could occasionally leave `SaveData` stuck in guest
  mode. Fixed with an in-flight guard (`authStateSyncInFlight`).

If you're debugging a `--cloud` failure, don't guess - check the real Cloud Function logs
(`firebase functions:log --only <name>`, see `deploy_backend` skill) or trace it directly
with a temporary `console.log` + a debug hook flag (`window.__debug.hasAuthApi` etc.),
exactly like the two bugs above were actually found. Both were invisible from reading the
code; they only showed up by tracing an actual failing run end to end.

## Manual/ad hoc driving

For quick one-off checks (a screenshot, eyeballing a new visual) that don't belong in the permanent suite, drive it directly:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")  # uses installed system Chrome
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: print("[pageerror]", e))
    page.on("console", lambda m: print(f"[console:{m.type}]", m.text) if m.type == "error" else None)

    page.goto("http://localhost:8000/index.html")  # serve first: python -m http.server 8000
    page.wait_for_selector("#screen-menu:not(.hidden)")
    page.click('[data-action="play-classic"]')
    page.wait_for_timeout(500)
    page.screenshot(path="snake.png")
    browser.close()
```

`chromium-cli` is not available in this environment, and Playwright's bundled Chromium is not pre-downloaded — `channel="chrome"` reuses the system-installed Chrome instead, no download needed. If `playwright` isn't installed: `pip install playwright`. Do **not** run `playwright install` — it downloads ~300MB of browsers that aren't needed here.

## Precise state inspection: the debug hook

`frontend/js/main.js` permanently exposes `window.__debug` — but **only** when served from `localhost`/`127.0.0.1` (see the bottom of that file); it's absent in production (GitHub Pages serves from a different hostname), so there's nothing to add or remove for testing anymore.

```js
window.__debug = {
  getGame: () => currentGame, startGame, currentMusicTheme, saveData: SaveData, StateMachine, States,
  setGuestOverride: (v) => { /* forces guest (v=true) or authenticated (v=false) UI state */ }
};
```

`tests/helpers.py` wraps this into `start_game()`, `eval_game()`, `run_in_game()`, `snapshot()`, and `wait_until()` — use those from pytest tests. For ad hoc scripts, call it directly:

```python
page.evaluate("window.__debug.startGame(6)")  # jump straight into level 6 (Cyber Grid)
page.evaluate("window.__debug.getGame().snake.segments[0]")  # exact head position
```

## Gotchas

- **Menu/pause/game-over screens share `data-nav`/`data-action` values.** Every screen's "Back" button uses `data-nav="screen-menu"`, so `page.click('[data-nav="screen-menu"]')` matches the first one in DOM order — which may be inside a *hidden* screen and time out. Always scope clicks to the visible screen: `page.click('.screen:not(.hidden) [data-nav="screen-menu"]')` (`tests/helpers.py:click_visible` does this for you).
- **The snake dies on its own if you don't steer it.** It starts at grid center moving RIGHT with no input; on a ~22-wide board it hits the wall in roughly 10-15 ticks (1-2 seconds). Once `game.ended` is true, the tick loop returns immediately every frame — which freezes *everything* (food/power-up expiration, laser cycles, moving hazards, elapsed time), not just the snake. `tests/helpers.py:keep_alive` sets `mechanics.wraparound = true` to sidestep this for tests that need the snake alive for several seconds.
- **A game that looks "frozen" after a `wait_for_timeout` is almost always this wall-death issue, not a real bug.** Check `game.ended` before concluding something in tick logic is broken.
- **A single game tick is real wall-clock time (~100-150ms), so a fixed sleep timed to land on "exactly one tick" is flaky** — a slow round-trip can let a second tick sneak in before you check (this bit the portal-teleport, shield, and ghost-mode tests during initial suite authoring — they now poll with `wait_until()`/`snapshot()` instead of guessing a sleep duration). Prefer polling for the condition you actually care about over sleeping a computed number of milliseconds.
- Food and power-ups expire on a random 2-10s timer (`expiresAt` field) and the board maintains 1-3 concurrent food items — expect entities to disappear and reshuffle on their own even if the player does nothing.

## One representative smoke test

Menu loads → Play Classic → canvas renders snake + HUD → keyboard input moves the snake → Pause/Resume → back to menu → Level Select/Snake Select/Settings/How to Play all open without console errors. This is `tests/test_navigation.py` in the persistent suite; `examples/smoke_test.py` is the same walkthrough as a standalone script if you just want to eyeball it once without pytest.
