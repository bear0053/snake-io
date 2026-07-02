"""
Shared pytest fixtures for the snake-io regression suite.

Requires: pip install pytest playwright
Do NOT run `playwright install` - tests launch the system-installed Chrome via
channel="chrome" (see .claude/skills/run/SKILL.md for why).

Run with: pytest  (from the project root, or from tests/)
"""
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PORT = 8123
BASE_URL = f"http://localhost:{PORT}/index.html"


def _wait_for_server(url, timeout=15):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.2)
    return False


@pytest.fixture(scope="session")
def base_url():
    """Serves the game on a dedicated test port for the whole test session."""
    proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT)],
        cwd=str(PROJECT_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        if not _wait_for_server(BASE_URL):
            proc.terminate()
            raise RuntimeError(f"Dev server did not come up on port {PORT}")
        yield BASE_URL
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        yield b
        b.close()


@pytest.fixture
def page(browser, base_url):
    """A fresh browser context (fresh localStorage) per test, already on the main menu."""
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = context.new_page()
    pg.snake_console_errors = []
    pg.on("pageerror", lambda e: pg.snake_console_errors.append(str(e)))
    pg.on("console", lambda m: pg.snake_console_errors.append(m.text) if m.type == "error" else None)
    pg.goto(base_url)
    pg.wait_for_selector("#screen-menu:not(.hidden)")
    yield pg
    context.close()


@pytest.fixture(autouse=True)
def _no_console_errors(page):
    """Every test automatically fails if the page threw a JS error, unless it opts out."""
    yield
    assert page.snake_console_errors == [], f"Unexpected console/page errors: {page.snake_console_errors}"
