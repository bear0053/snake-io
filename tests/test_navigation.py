"""Menu flow, basic play, pause/resume, and the wall-death path."""
from helpers import click_visible, set_authenticated


def test_menu_loads(page):
    assert page.is_visible("#screen-menu")


def test_all_menu_screens_open_and_return(page):
    screens = [
        "screen-snake-select",
        "screen-high-scores",
        "screen-settings",
        "screen-how-to-play",
    ]
    for screen_id in screens:
        page.click(f'[data-nav="{screen_id}"]')
        page.wait_for_timeout(150)
        assert page.is_visible(f"#{screen_id}"), f"{screen_id} did not open"
        click_visible(page, '[data-nav="screen-menu"]')
        page.wait_for_timeout(150)
        assert page.is_visible("#screen-menu"), f"did not return to menu from {screen_id}"


def test_guest_clicking_level_select_sees_locked_screen(page):
    page.click('[data-action="nav-level-select"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-feature-locked"), "guest should be shown the locked-feature screen"
    assert page.text_content("#feature-locked-title") == "Level Mode"
    assert not page.is_visible("#screen-level-select")

    click_visible(page, '[data-nav="screen-menu"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-menu")


def test_authenticated_player_can_open_level_select(page):
    set_authenticated(page)
    page.click('[data-action="nav-level-select"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-level-select")
    assert not page.is_visible("#screen-feature-locked")

    click_visible(page, '[data-nav="screen-menu"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-menu")


def test_guest_clicking_leaderboard_sees_locked_screen(page):
    page.click('[data-action="nav-leaderboard"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-feature-locked")
    assert page.text_content("#feature-locked-title") == "Leaderboard"

    click_visible(page, '[data-nav="screen-menu"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-menu")


def test_guest_clicking_achievements_sees_locked_screen(page):
    page.click('[data-action="nav-achievements"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-feature-locked")
    assert page.text_content("#feature-locked-title") == "Achievements"

    click_visible(page, '[data-nav="screen-menu"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-menu")


def test_authenticated_player_sees_achievements_screen_with_all_locked_on_fresh_profile(page):
    set_authenticated(page)
    page.click('[data-action="nav-achievements"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-achievements")
    cards = page.eval_on_selector_all(".card-list .card", "els => els.map(e => e.className)")
    assert len(cards) > 0
    assert all("locked" in c for c in cards), "a fresh profile should have no achievements earned yet"


def test_play_classic_shows_hud_and_moves_with_keyboard(page):
    page.click('[data-action="play-classic"]')
    page.wait_for_timeout(400)
    assert page.is_visible("#hud")
    length_before = page.text_content("#hud-length")

    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(300)
    page.keyboard.press("ArrowLeft")
    page.wait_for_timeout(300)

    # still alive and playing - the snake moved without crashing the tick loop
    assert page.is_visible("#hud")
    assert page.text_content("#hud-length") == length_before


def test_pause_and_resume(page):
    page.click('[data-action="play-classic"]')
    page.wait_for_timeout(200)
    page.click("#hud-pause-btn")
    page.wait_for_timeout(200)
    assert page.is_visible("#screen-pause")
    page.click('[data-action="resume"]')
    page.wait_for_timeout(200)
    assert not page.is_visible("#screen-pause")
    assert page.is_visible("#hud")


def test_unsteered_snake_dies_at_the_wall(page):
    """The default snake starts centered moving RIGHT with no input; on classic mode's
    22-wide board it should hit the wall and reach Game Over within a few seconds."""
    page.click('[data-action="play-classic"]')
    for _ in range(30):
        page.wait_for_timeout(200)
        if page.is_visible("#screen-game-over"):
            break
    assert page.is_visible("#screen-game-over")
    assert page.text_content("#go-time") is not None
