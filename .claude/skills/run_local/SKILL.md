---
name: run_local
description: Start (or stop) a local HTTP server so the user can manually play/test snake-io in their own browser. Use when the user asks to run/start/serve the game locally, wants the localhost URL, or types /run_local. For automated browser-driven testing, use the `run` skill instead.
---

# Run Local

This is for the **user** to open the game in their own browser and play/test it manually — not for automated testing (that's the `run` skill, which drives a headless browser via Playwright and runs the `tests/` pytest suite).

The game is also live on GitHub Pages (see README) and pushed there after every commit, so a local server is only needed when testing changes that haven't been pushed yet, or when working offline.

## Start

From the `snake-io/` directory:

```bash
python -m http.server 8000 &
```

(Backgrounding with `&` is required — this command blocks otherwise.) Then tell the user: **open `http://localhost:8000` in your browser.**

Before starting, check nothing is already bound to that port:

```bash
netstat -ano | grep ":8000 " | grep LISTENING
```

If something's already there, reuse it (just give the user the URL) rather than starting a second instance on the same port — `python -m http.server` reads straight off disk, so an already-running instance is already serving the current code with no restart needed.

## Stop

Don't leave it running indefinitely once the user is done — find the exact PID bound to the port and kill only that process (never a blanket `taskkill //IM python.exe`, which could kill an unrelated Python process the user has running for something else):

```bash
netstat -ano | grep ":8000 " | grep LISTENING   # note the PID in the last column
taskkill //F //PID <that pid>
```

## Notes

- Multiple `http.server` instances can pile up across a long session if each "let's look at it locally" request starts a new one on a different port instead of reusing/stopping the last one — check for an existing instance first, and offer to stop it when the user indicates they're done testing locally (e.g., "I'll just check GitHub Pages from here").
- Same ES-module CORS restriction as everywhere else in this project: must be served over `http://`, not opened as `file://`.
