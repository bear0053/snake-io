---
name: cleanup
description: Review the whole snake-io codebase for technical debt, dead code, duplication, and inefficiencies accumulated across iterations, apply fixes, verify nothing broke, and keep README.md in sync with what the game actually does. Use when the user types /cleanup or asks to clean up, refactor, or address tech debt in the game code.
---

# Cleanup

This project was built in fast iterative passes (Phase 1 vertical slice, Phase 2 full level/skin/power-up rollout, the food/power-up spawn-and-expiration fix, and whatever's landed since). That kind of iteration is exactly what accumulates debt: leftover one-off code, duplicated logic that should live in one registry entry instead of several near-copies, functions written for a narrower Phase 1 need that never got generalized, and small per-frame inefficiencies from copy-pasted per-theme drawing code.

## Process

1. **Scope**: If there are uncommitted changes (`git diff` non-empty), that's the primary review target — you can lean on the built-in `simplify` skill for that pass (reuse/simplification/efficiency on a diff). If the tree is clean, this is a **whole-codebase** health pass over `frontend/js/` instead — read every file (they're all small, this is cheap) rather than relying on a diff.
2. Check specifically for:
   - **Dead code**: unused exports, functions never imported anywhere, unreachable branches, comments referencing mechanics that were since removed or renamed.
   - **Duplication across the registry system**: `render.js`'s per-theme obstacle/food drawing functions, `levels.js`'s per-level objects, and `powerups.js`'s registry entries are the most likely places copy-paste drift creeps in as new levels/skins/power-ups get added — look for near-identical blocks that should be parameterized instead of repeated.
   - **Leftover debug/test scaffolding**: `window.__debug` is a permanent, hostname-gated hook in `frontend/js/main.js` (see the `run` skill) — that one's intentional, don't remove it. Grep for stray `console.log` or other one-off instrumentation added during a debugging session instead.
   - **Inefficiency in the render/tick loop**: anything recomputed every frame that could be cached (gradients, lookups), redundant array scans in `engine.js`'s per-tick collision/pickup/lifecycle checks, or `occupiedCells()` being rebuilt more often than necessary.
   - **Inconsistent conventions**: naming drift between the Phase 1 food/power-up system and the Phase 2 additions (key/exit/portals/lasers), inconsistent use of `game.level.mechanics.*` flags, HUD/UI string formatting inconsistencies.
   - **Schema drift**: every level object in `levels.js` should share the same shape (a `mechanics` object with all flags present via `BASE_MECHANICS`, `foodTypes`, `obstacles`, `starThresholds`, etc.) — flag any level missing a field the others have.
3. Apply fixes directly — this skill cleans up, it doesn't just produce a report. Keep changes to refactors/deletions/consolidation only: no new features, no behavior a player would notice, unless a cleanup incidentally reveals a genuine bug — call that out explicitly rather than silently fixing it.
4. **Verify nothing broke.** Run the persistent regression suite: `pytest tests/` (see the `run` skill). It covers navigation, food/power-up spawn+expiry, level mechanics, skin unlocks, music, and progression. All tests must still pass. If a cleanup touched an area the suite doesn't cover yet, add a test for it rather than only eyeballing a screenshot — that's how the suite stays worth trusting. Spot-check anything visual you touched with a quick screenshot too.
5. **Update `README.md` to match current reality.** Every cleanup pass ends by re-reading the README against the actual feature set and fixing drift: the levels table (themes/objectives/mechanics), the skins table (unlock conditions, trail effects), the feature list (modes, food/power-up behavior, audio), and the project structure listing (new/renamed/removed files). Treat stale README content as the same kind of debt as stale code — a level, skin, or mechanic that changed in `js/` but not in the README is unfinished work, not a nitpick. Don't touch the Roadmap section's intent (still-future ideas) beyond removing anything that's since shipped.
6. Summarize what was removed/simplified and why, whether the README needed updates, and confirm `pytest tests/` passed, before considering the pass done.

## Guardrails

- This is a quality pass, not a feature pass — don't add abstractions "for the future," and don't rewrite working code that isn't actually duplicated, dead, or measurably inefficient just because it could be structured differently.
- Don't touch the registry-based extensibility pattern itself (`LEVELS`, `SKINS`, `FOOD_TYPES`, `POWER_UPS` as flat data arrays/objects consumed by generic engine code) — that's an intentional architectural decision, not tech debt.
- If a change is risky or would alter observable behavior, flag it to the user instead of applying it silently.
- Don't commit/push as part of this skill — that's a separate step (see the `push` skill) so the user can review the diff first.
