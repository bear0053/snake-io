---
name: live_smoke_test
description: Drive a real Playwright browser against the locally-served frontend talking to the *live* deployed Firebase backend, to confirm auth, sessions, cloud saves, leaderboard, and achievements actually work end-to-end in production - not just that the deploy command succeeded. Use after deploying the backend, or whenever asked to verify Phase 3 cloud features work live/for real/in production.
---

# Live Smoke Test

For checking the deployed backend actually works, by driving the game the way a real
signed-up player would. This is **not** the persistent regression suite (`tests/`, see the
`run` skill) - that suite runs against local-only guest state and a `setGuestOverride`
debug hook, so it never touches the real Firebase backend. This skill is specifically for
after a `deploy_backend` run, or whenever something needs verifying against the real
`snake-odyssey` project instead of an emulator or a debug override.

## Why this exists

Several real bugs in this project only ever showed up here, never in the emulator suite or
local pytest suite:
- A Firestore composite index requirement that production enforces but the emulator
  doesn't (`FAILED_PRECONDITION` on `startGameSession`'s rate-limit query).
- CORS/network failures against an undeployed function (confirms graceful degradation
  actually degrades gracefully, not just in theory).
- Cross-session cloud persistence (sign out, sign back in, confirm progress survived) -
  nothing else in this repo checks that.

## Setup

Serve the frontend locally (it still calls the *real* deployed backend - only the static
files are local):

```bash
python -m http.server 8199   # any free port; check with netstat first per the run_local skill
```

Then drive it with Playwright (system Chrome, same as the `run` skill):

```python
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome")
    page = b.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://localhost:8199/index.html")
    page.wait_for_selector("#screen-menu:not(.hidden)")
    page.wait_for_timeout(1000)  # let the dynamic Firebase import resolve
    # ... drive the flow you're checking, see recipes below
    b.close()
```

## Test accounts

Always use the `smoketest-` email prefix (e.g. `smoketest-{int(time.time())}@example.com`)
so throwaway accounts are identifiable in the Firebase Console's Authentication tab later.
There is no automated cleanup for these (no admin credentials configured for the live
project in this environment) - mention how many you created in your final report so the
user can delete them if they want to, but don't worry about it otherwise; they're harmless.

## Recipes

**Sign up:**
```python
page.click("#menu-account-btn")
page.wait_for_selector("#screen-sign-in:not(.hidden)")
page.click('.screen:not(.hidden) [data-nav="screen-sign-up"]')
page.wait_for_selector("#screen-sign-up:not(.hidden)")
page.fill("#sign-up-name", "Smoke Tester")
page.fill("#sign-up-email", email)
page.fill("#sign-up-password", "test-password-123")
page.click('#screen-sign-up button[type="submit"]')
page.wait_for_selector("#screen-menu:not(.hidden)", timeout=15000)
page.wait_for_timeout(2500)  # let getOrCreatePlayerProfile + guest import settle
```

**Play a run with a specific score** (don't just wait and hope - the default snake dies
unsteered in ~1-2s, same gotcha as the `run` skill documents for the pytest suite):
```python
page.click('[data-action="play-classic"]')  # or play-endless
page.wait_for_selector("#hud:not(.hidden)", timeout=10000)
page.evaluate("() => { window.__debug.getGame().level.mechanics.wraparound = true; }")
page.wait_for_timeout(4000)  # real elapsed time - the backend validates score/food against
                              # server-measured session duration, so ending instantly gets
                              # correctly rejected as implausible, not a bug
page.evaluate('() => { const g = window.__debug.getGame(); g.score = 40; g.foodCollected = 4; g.ended = true; g.endReason = "wall"; }')
page.wait_for_selector("#screen-game-over:not(.hidden)", timeout=10000)
```
Then check `#go-score`, `#go-high-score`, `#go-cloud-note` (rejection reason, flagged
notice, or "X unlocked!"/"Achievement earned: X" messaging).

**Cross-session persistence** (sign out, sign back in, confirm progress survived):
```python
page.click("#menu-account-btn")
page.wait_for_selector("#screen-account:not(.hidden)")
page.click('[data-action="sign-out"]')
page.wait_for_timeout(1000)
# ... sign back in with the same email/password, then check #high-score-list etc.
```

**Leaderboard / Achievements**: navigate via `[data-action="nav-leaderboard"]` /
`[data-action="nav-achievements"]`, wait for the respective screen, then read
`#leaderboard-list` / `#achievement-list` `innerText`/`innerHTML`.

## If something looks wrong

Check the actual Cloud Function logs before assuming it's a frontend bug - the generic
user-facing error messages (spec-mandated, see backend/README.md) deliberately hide the
real reason:

```bash
export NODE_EXTRA_CA_CERTS="<see deploy_backend skill>"
firebase functions:log --project snake-odyssey --only <functionName> -n 20
```

## Cleanup

Kill the local server when done (find the PID on your port via `netstat`, same as the
`run_local` skill) - don't leave it running.
