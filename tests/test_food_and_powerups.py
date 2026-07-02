"""Food/power-up spawn-count bounds and expiration (the 'poison forces a bad pickup' fix)."""
from helpers import eval_game, keep_alive, run_in_game, start_game


def test_food_count_stays_within_one_and_three(page):
    start_game(page, "classic")
    page.wait_for_timeout(100)
    keep_alive(page)

    counts = []
    for _ in range(10):
        page.wait_for_timeout(700)
        counts.append(eval_game(page, "g.foods.length"))

    assert all(1 <= c <= 3 for c in counts), f"food count left the 1-3 range: {counts}"
    assert max(counts) > 1, "food never spawned more than one at a time in 7s - multi-spawn may be broken"


def test_food_expires_and_is_removed(page):
    start_game(page, "classic")
    page.wait_for_timeout(100)
    keep_alive(page)

    # give every current food a short, known expiry, then confirm they're gone shortly after
    run_in_game(page, "g.foods.forEach(f => f.expiresAt = performance.now() + 200);")
    page.wait_for_timeout(500)
    remaining_old = eval_game(page, "g.foods.filter(f => f.expiresAt < performance.now()).length")
    assert remaining_old == 0, "expired food was not removed from the board"


def test_powerup_expires(page):
    start_game(page, "classic")
    page.wait_for_timeout(100)
    keep_alive(page)
    run_in_game(page, """
      g.powerUps.push({x: 3, y: 3, type: 'shield', spawnedAt: performance.now(), expiresAt: performance.now() + 300});
    """)
    assert eval_game(page, "g.powerUps.length") == 1
    page.wait_for_timeout(600)
    assert eval_game(page, "g.powerUps.length") == 0, "power-up did not expire"
