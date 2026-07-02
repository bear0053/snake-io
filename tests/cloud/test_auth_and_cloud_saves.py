"""Real Firebase Auth + Cloud Functions + Firestore, via the local emulators (opt-in:
pytest --cloud). See tests/cloud/conftest.py for why this is separate from tests/*.py."""
from helpers import click_visible, keep_alive, run_in_game, sign_in, sign_out, sign_up, unique_email

PASSWORD = "test-password-123"


def test_guest_is_locked_out_of_level_mode_before_signing_in(page):
    page.click('[data-action="nav-level-select"]')
    page.wait_for_timeout(150)
    assert page.is_visible("#screen-feature-locked")
    assert not page.is_visible("#screen-level-select")


def test_sign_up_creates_a_profile_and_unlocks_level_mode(page):
    sign_up(page, unique_email(), PASSWORD)
    assert "Signed in as" in page.inner_text("#menu-account-label")

    page.click('[data-action="nav-level-select"]')
    page.wait_for_timeout(300)
    assert page.is_visible("#screen-level-select"), "a freshly signed-up account should have Level Mode unlocked"


def test_classic_run_is_validated_and_persists_across_sign_out_sign_in(page):
    email = unique_email()
    sign_up(page, email, PASSWORD)

    page.click('[data-action="play-classic"]')
    page.wait_for_selector("#hud:not(.hidden)", timeout=10000)
    keep_alive(page)
    page.wait_for_timeout(3000)  # real elapsed time - the backend validates score/food
                                  # against server-measured session duration
    run_in_game(page, "g.score = 40; g.foodCollected = 4; g.ended = true; g.endReason = 'wall';")
    page.wait_for_selector("#screen-game-over:not(.hidden)", timeout=10000)
    assert page.inner_text("#go-score") == "40"
    assert "First Bite" in page.inner_text("#go-cloud-note"), "first food ever eaten on this account should earn an achievement"

    click_visible(page, '[data-action="quit-to-menu"]')
    sign_out(page)
    assert "Playing as Guest" in page.inner_text("#menu-account-label")

    sign_in(page, email, PASSWORD)
    page.click('[data-nav="screen-high-scores"]')
    page.wait_for_timeout(300)
    assert "40" in page.inner_text("#high-score-list"), "the validated score should have followed the account back in"


def test_implausible_score_is_rejected_and_not_recorded(page):
    sign_up(page, unique_email(), PASSWORD)

    page.click('[data-action="play-classic"]')
    page.wait_for_selector("#hud:not(.hidden)", timeout=10000)
    # No realistic elapsed time and an absurd food count for the (near-zero) session
    # duration - the backend must reject this, not silently save it.
    run_in_game(page, "g.score = 999999; g.foodCollected = 50000; g.ended = true; g.endReason = 'wall';")
    page.wait_for_selector("#screen-game-over:not(.hidden)", timeout=10000)
    assert page.inner_text("#go-cloud-note") != "", "a rejection should explain why the run wasn't saved"

    click_visible(page, '[data-action="quit-to-menu"]')
    page.click('[data-nav="screen-high-scores"]')
    page.wait_for_timeout(300)
    assert "999999" not in page.inner_text("#high-score-list"), "a rejected run must never update the high score"
