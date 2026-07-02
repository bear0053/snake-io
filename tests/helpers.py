"""Shared helpers for the snake-io regression suite. See tests/conftest.py for fixtures."""
import time

SAVE_KEY = "snakeio_save_v1"


def base_save(**overrides):
    """A minimal valid save object; pass e.g. highScores={...} to override a top-level key."""
    save = {
        "version": 1,
        "unlockedLevels": [1],
        "unlockedSkins": ["default"],
        "selectedSkin": "default",
        "highScores": {"classic": 0, "endless": 0, "byLevel": {}},
        "settings": {"musicOn": False, "sfxOn": False, "musicVolume": 0.6, "difficulty": "normal", "controlType": "auto"},
    }
    save.update(overrides)
    return save


def set_save(page, save_dict):
    """Writes a save object to localStorage and reloads so main.js picks it up fresh."""
    page.evaluate("(data) => localStorage.setItem('snakeio_save_v1', JSON.stringify(data))", save_dict)
    page.reload()
    page.wait_for_selector("#screen-menu:not(.hidden)")


def read_save(page):
    return page.evaluate("() => JSON.parse(localStorage.getItem('snakeio_save_v1'))")


def click_visible(page, selector):
    """Menus share ids like data-nav="screen-menu" across multiple hidden screens (every
    "Back" button uses it) - always scope clicks to whichever screen is actually visible."""
    page.click(f".screen:not(.hidden) {selector}")


def start_game(page, level_or_mode):
    """level_or_mode: a level id (int), or 'classic' / 'endless'."""
    page.evaluate("(id) => window.__debug.startGame(id)", level_or_mode)


def get_game(page):
    return page.evaluate("() => window.__debug.getGame()")


def eval_game(page, js_expression):
    """js_expression is a JS expression string operating on `g`, the current game object."""
    return page.evaluate(f"() => {{ const g = window.__debug.getGame(); return {js_expression}; }}")


def run_in_game(page, js_statements):
    """js_statements is a JS statement block (no return needed) operating on `g`."""
    page.evaluate(f"() => {{ const g = window.__debug.getGame(); {js_statements} }}")


def keep_alive(page):
    """Lets an unsteered snake survive indefinitely (classic/level boards have walls the
    default snake would otherwise wander into within a couple of seconds) so a test can
    wait out timers without the tick loop freezing on game.ended. See the `run` skill."""
    run_in_game(page, "g.level.mechanics.wraparound = true;")


def snapshot(page, js_expression):
    """Like eval_game, but for polling loops: reads whatever fields you need in ONE
    round-trip so they're consistent with each other (no tick can sneak in between
    reading two separate properties across two separate evaluate() calls)."""
    return page.evaluate(f"() => {{ const g = window.__debug.getGame(); return {js_expression}; }}")


def wait_until(page, condition_expr, timeout_ms=2000, interval_ms=20):
    """Polls a JS boolean expression (operating on `g`) until true or timeout, instead of
    guessing a fixed sleep duration. Tick timing is real wall-clock in the browser and a
    single game tick can be ~100-150ms, so fixed sleeps close to one tick are flaky -
    polling is the robust way to catch "the first moment X becomes true"."""
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        if snapshot(page, f"({condition_expr})"):
            return True
        page.wait_for_timeout(interval_ms)
    return False
