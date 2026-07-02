"""Skin unlock conditions and Odyssey Snake's unique mechanics.

Phase 3 gates all non-default skins to authenticated players, so these tests force
an authenticated state via set_authenticated() - see helpers.py."""
from helpers import base_save, click_visible, eval_game, keep_alive, run_in_game, set_authenticated, set_save, start_game, wait_until


def _card_classes(page):
    return page.eval_on_selector_all(".card-list .card", "els => els.map(e => e.className)")


def test_default_skin_unlocked_others_locked_on_fresh_save(page):
    set_save(page, base_save())
    click_visible(page, '[data-nav="screen-snake-select"]')
    page.wait_for_timeout(150)
    classes = _card_classes(page)
    assert "locked" not in classes[0], "Default should be unlocked"
    assert all("locked" in c for c in classes[1:]), "every other skin should start locked"


def test_fire_snake_unlocks_after_completing_lava_cavern(page):
    save = base_save(
        unlockedLevels=[1, 2, 3, 4, 5],
        highScores={"classic": 0, "endless": 0, "byLevel": {"5": {"score": 300, "stars": 3, "completed": True}}},
    )
    set_save(page, save)
    set_authenticated(page)
    click_visible(page, '[data-nav="screen-snake-select"]')
    page.wait_for_timeout(150)
    classes = _card_classes(page)
    assert "locked" not in classes[1], f"Fire Snake should be unlocked, card classes: {classes[1]}"


def test_golden_snake_requires_all_six_levels_completed(page):
    incomplete = base_save(
        unlockedLevels=[1, 2, 3, 4, 5, 6],
        highScores={"classic": 0, "endless": 0, "byLevel": {
            str(i): {"score": 100, "stars": 1, "completed": True} for i in range(1, 6)  # only 1-5, not 6
        }},
    )
    set_save(page, incomplete)
    set_authenticated(page)
    click_visible(page, '[data-nav="screen-snake-select"]')
    page.wait_for_timeout(150)
    assert "locked" in _card_classes(page)[4], "Golden Snake should still be locked with only 5/6 levels done"

    complete = base_save(
        unlockedLevels=[1, 2, 3, 4, 5, 6],
        highScores={"classic": 0, "endless": 0, "byLevel": {
            str(i): {"score": 100, "stars": 1, "completed": True} for i in range(1, 7)
        }},
    )
    set_save(page, complete)
    set_authenticated(page)
    click_visible(page, '[data-nav="screen-snake-select"]')
    page.wait_for_timeout(150)
    assert "locked" not in _card_classes(page)[4], "Golden Snake should unlock once all 6 levels are completed"


def test_odyssey_snake_unlocks_at_endless_score_500(page):
    set_save(page, base_save(highScores={"classic": 0, "endless": 499, "byLevel": {}}))
    set_authenticated(page)
    click_visible(page, '[data-nav="screen-snake-select"]')
    page.wait_for_timeout(150)
    assert "locked" in _card_classes(page)[5], "Odyssey Snake should be locked below 500"

    set_save(page, base_save(highScores={"classic": 0, "endless": 500, "byLevel": {}}))
    set_authenticated(page)
    click_visible(page, '[data-nav="screen-snake-select"]')
    page.wait_for_timeout(150)
    assert "locked" not in _card_classes(page)[5], "Odyssey Snake should unlock at exactly 500"


def test_guest_cannot_unlock_odyssey_snake_at_endless_score_500(page):
    set_save(page, base_save(highScores={"classic": 0, "endless": 500, "byLevel": {}}))
    click_visible(page, '[data-nav="screen-snake-select"]')
    page.wait_for_timeout(150)
    assert "locked" in _card_classes(page)[5], "Guests should never get a permanent unlock, even past the score threshold"


def test_navigators_luck_biases_the_next_non_poison_food(page):
    set_save(page, base_save(unlockedSkins=["default", "odyssey"], selectedSkin="odyssey"))
    set_authenticated(page)
    start_game(page, "classic")
    page.wait_for_timeout(100)
    keep_alive(page)
    assert eval_game(page, "g.snake.skinId") == "odyssey"

    # force the 40% roll to succeed
    page.evaluate("() => { window.__origRandom = Math.random; Math.random = () => 0.01; }")
    run_in_game(page, "g.navigatorsLuckTimer = 6000;")
    page.wait_for_timeout(150)
    assert eval_game(page, "g.navigatorsLuckPending") is True

    page.evaluate("() => { Math.random = window.__origRandom; }")
    head = eval_game(page, "g.snake.segments[0]")
    run_in_game(page, "g.foods = []; g.foodSpawnTimer = g.nextFoodSpawnMs;")
    # The consuming spawn only fires for a non-poison food type (~85% of spawns), and each
    # respawn cycle re-rolls the type for real (Math.random was restored above) - poll
    # rather than assume the very first spawn is the one that consumes the pending flag.
    assert wait_until(page, "g.navigatorsLuckPending === false", timeout_ms=10000), "luck flag was not consumed"

    # The most recently spawned food is the one whose spawn just consumed the pending
    # flag (consumption and push happen atomically in the same spawnFood() call) - earlier
    # entries may be unrelated poison spawns that didn't consume it.
    food = eval_game(page, "g.foods.at(-1)")
    dist = max(abs(food["x"] - head["x"]), abs(food["y"] - head["y"]))
    assert dist <= 5, f"food did not spawn within Navigator's Luck radius (dist={dist})"


def test_odyssey_food_pickup_triggers_golden_flash(page):
    set_save(page, base_save(unlockedSkins=["default", "odyssey"], selectedSkin="odyssey"))
    set_authenticated(page)
    start_game(page, "classic")
    page.wait_for_timeout(100)
    run_in_game(page, """
      const head = g.snake.segments[0];
      g.foods = [{x: head.x + 1, y: head.y, type: 'regular', points: 10, spawnedAt: performance.now(), expiresAt: performance.now()+9999, sparklePhase: 0}];
      g.snake.direction = 'RIGHT';
      g.snake.pendingDirections = [];
    """)
    page.wait_for_timeout(200)
    assert eval_game(page, "g.foodFlash.active") is True, "golden flash did not trigger for Odyssey Snake"
