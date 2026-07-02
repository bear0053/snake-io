"""Per-theme music selection and the settings screen (toggles + volume persistence)."""
from helpers import base_save, click_visible, read_save, set_save, start_game

LEVEL_THEMES = [(1, "garden"), (2, "desert"), (3, "snowy"), (4, "jungle"), (5, "lava"), (6, "cyber")]


def test_music_theme_matches_each_level_and_mode(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))

    for level_id, expected_theme in LEVEL_THEMES:
        start_game(page, level_id)
        page.wait_for_timeout(100)
        got = page.evaluate("() => window.__debug.currentMusicTheme()")
        assert got == expected_theme, f"level {level_id}: expected {expected_theme}, got {got}"
        start_game(page, "classic")  # reset to a safe state between checks

    start_game(page, "endless")
    page.wait_for_timeout(100)
    assert page.evaluate("() => window.__debug.currentMusicTheme()") == "cyber"


def test_menu_and_game_over_use_menu_theme(page):
    set_save(page, base_save())
    assert page.evaluate("() => window.__debug.currentMusicTheme()") == "menu"

    start_game(page, "classic")
    page.wait_for_timeout(100)
    assert page.evaluate("() => window.__debug.currentMusicTheme()") == "garden"


def test_music_toggle_and_volume_persist_across_reload(page):
    click_visible(page, '[data-nav="screen-settings"]')
    page.wait_for_timeout(150)

    page.click("#setting-music")
    assert read_save(page)["settings"]["musicOn"] is False
    page.click("#setting-music")
    assert read_save(page)["settings"]["musicOn"] is True

    page.eval_on_selector("#setting-music-volume", "el => { el.value = 25; el.dispatchEvent(new Event('input', {bubbles: true})); }")
    assert read_save(page)["settings"]["musicVolume"] == 0.25

    page.reload()
    page.wait_for_selector("#screen-menu:not(.hidden)")
    click_visible(page, '[data-nav="screen-settings"]')
    page.wait_for_timeout(150)
    assert page.eval_on_selector("#setting-music-volume", "el => el.value") == "25"
