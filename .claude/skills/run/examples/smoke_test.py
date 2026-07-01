"""
Smoke test for Snake Odyssey (snake-io).

Prerequisites:
  - Serve the game first: `python -m http.server 8000` from the snake-io/ directory
  - `pip install playwright` (do NOT run `playwright install` - we use channel="chrome")

Usage:
  python smoke_test.py
"""

from playwright.sync_api import sync_playwright

URL = "http://localhost:8000/index.html"
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.on("pageerror", lambda e: (errors.append(str(e)), print(f"[pageerror] {e}")))
    page.on("console", lambda m: (errors.append(m.text), print(f"[console:{m.type}] {m.text}")) if m.type == "error" else None)

    page.goto(URL)
    page.wait_for_selector("#screen-menu:not(.hidden)")
    print("Menu loaded OK")

    # Play Classic
    page.click('[data-action="play-classic"]')
    page.wait_for_timeout(600)
    print("Clicked Play Classic")

    # Move via keyboard
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(400)
    page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(400)

    # Pause / Resume
    page.click("#hud-pause-btn")
    page.wait_for_timeout(300)
    print("Paused screen shown:", page.is_visible("#screen-pause"))
    page.click('[data-action="resume"]')
    page.wait_for_timeout(200)

    # Quit to menu
    page.click("#hud-pause-btn")
    page.wait_for_timeout(200)
    page.click('.screen:not(.hidden) [data-action="quit-to-menu"]')
    page.wait_for_timeout(300)
    print("Back at menu:", page.is_visible("#screen-menu"))

    # Walk every other menu screen and back (scope "Back" clicks to the visible screen -
    # every screen's Back button shares the same data-nav value)
    for nav_id, label in [
        ("screen-level-select", "Level select"),
        ("screen-snake-select", "Snake select"),
        ("screen-high-scores", "High scores"),
        ("screen-settings", "Settings"),
        ("screen-how-to-play", "How to play"),
    ]:
        page.click(f'[data-nav="{nav_id}"]')
        page.wait_for_timeout(200)
        print(f"{label} visible:", page.is_visible(f"#{nav_id}"))
        page.click('.screen:not(.hidden) [data-nav="screen-menu"]')
        page.wait_for_timeout(150)

    browser.close()

print("\n--- console/page errors ---")
print(errors if errors else "(none)")
