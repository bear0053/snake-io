---
name: run
description: Launch and test the Snake Odyssey game (snake-io) in a browser. Use when asked to run, start, test, verify, or screenshot the snake-io game, or to confirm a code change actually works.
---

# Running Snake Odyssey (snake-io)

Plain HTML/CSS/JS with ES modules, no build step, no dependencies. Must be served over `http://`, not opened as `file://` — browsers block ES module imports from the filesystem.

## Start the dev server

From the `snake-io/` directory:

```bash
python -m http.server 8000 &
timeout 15 bash -c 'until curl -sf http://localhost:8000/index.html >/dev/null; do sleep 0.5; done'
```

Stop it with `pkill -f "http.server 8000"` (or kill the backgrounded PID) before relaunching on the same port.

## Drive it with Playwright

`chromium-cli` is not available in this environment, and Playwright's bundled Chromium browser is not pre-downloaded here. Use Playwright for Python with the **system-installed Chrome** instead — no download needed:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")  # uses installed system Chrome
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: print("[pageerror]", e))
    page.on("console", lambda m: print(f"[console:{m.type}]", m.text) if m.type == "error" else None)

    page.goto("http://localhost:8000/index.html")
    page.wait_for_selector("#screen-menu:not(.hidden)")
    page.click('[data-action="play-classic"]')
    page.wait_for_timeout(500)
    page.screenshot(path="snake.png")
    browser.close()
```

If `playwright` isn't installed yet: `pip install playwright`. Do **not** run `playwright install` — it downloads ~300MB of browsers that aren't needed since `channel="chrome"` reuses the system browser.

## Precise state inspection: the debug hook

For assertions that need exact game state (did the snake actually eat that food, did the shield absorb a hit, did the level complete) rather than just a screenshot, temporarily add one line to the end of `js/main.js`:

```js
window.__debug = { getGame: () => currentGame, startGame };
```

This exposes the live game object and the level launcher to `page.evaluate()`:

```python
page.evaluate("window.__debug.startGame(6)")  # jump straight into level 6 (Cyber Grid)
page.evaluate("window.__debug.getGame().snake.segments[0]")  # exact head position
page.evaluate("""() => {
  const g = window.__debug.getGame();
  g.foods.push({x: 5, y: 5, type: 'regular', points: 10, spawnedAt: performance.now(), expiresAt: performance.now()+9999, sparklePhase: 0});
}""")
```

**Always remove the `window.__debug = ...` line before committing** — it's a testing aid only, not part of the shipped game.

## Gotchas

- **Menu/pause/game-over screens share `data-nav`/`data-action` values.** Every screen's "Back" button uses `data-nav="screen-menu"`, so `page.click('[data-nav="screen-menu"]')` matches the first one in DOM order — which may be inside a *hidden* screen and time out. Always scope clicks to the visible screen: `page.click('.screen:not(.hidden) [data-nav="screen-menu"]')`.
- **The snake dies on its own if you don't steer it.** It starts at grid center moving RIGHT with no input; on a ~22-wide board it hits the wall in roughly 10-15 ticks (1-2 seconds). Once `game.ended` is true, the tick loop returns immediately every frame — which freezes *everything* (food/power-up expiration, laser cycles, moving hazards, elapsed time), not just the snake.
- **A game that looks "frozen" after a `wait_for_timeout` is almost always this wall-death issue, not a real bug.** Check `game.ended` before concluding something in tick logic is broken.
- To keep an unsteered snake alive for a multi-second test, set wraparound right after starting: `page.evaluate("window.__debug.getGame().level.mechanics.wraparound = true")`.
- Food and power-ups expire on a random 2-10s timer (`expiresAt` field) and the board maintains 1-3 concurrent food items — expect entities to disappear and reshuffle on their own even if the player does nothing.

## One representative smoke test

Menu loads → Play Classic → canvas renders snake + HUD → keyboard input moves the snake → Pause/Resume → back to menu → Level Select/Snake Select/Settings/How to Play all open without console errors. See `examples/smoke_test.py` for the full script.
