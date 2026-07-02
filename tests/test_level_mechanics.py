"""Level-specific mechanics: delayed key spawns, teleport portals, lasers, moving hazards,
slippery ice, and the power-ups whose effect is a collision/movement rule change.

Timing note: a game tick is real wall-clock time (~100-150ms depending on level), so fixed
sleeps close to one tick are flaky - a slow round-trip can let a second tick sneak in. Tests
that care about "after exactly one tick" use wait_until()/snapshot() to poll for the first
moment a condition becomes true instead of guessing a sleep duration."""
from helpers import eval_game, keep_alive, run_in_game, set_save, snapshot, start_game, wait_until, base_save


def _pin(page, x=10, y=10):
    run_in_game(page, f"""
      g.snake.segments = [{{x:{x},y:{y}}}, {{x:{x-1},y:{y}}}, {{x:{x-2},y:{y}}}];
      g.snake.prevSegments = g.snake.segments.map(s => ({{...s}}));
    """)


def test_key_does_not_spawn_immediately_and_respects_delay_range(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))
    start_game(page, 6)  # Cyber Grid
    page.wait_for_timeout(100)
    assert eval_game(page, "g.key") is None
    delay = eval_game(page, "g.nextKeySpawnMs")
    assert 10000 <= delay <= 30000, f"initial key delay out of range: {delay}"


def test_key_spawns_expires_and_repeats_until_collected(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))
    start_game(page, 6)
    page.wait_for_timeout(100)
    keep_alive(page)

    run_in_game(page, "g.nextKeySpawnMs = 150;")
    page.wait_for_timeout(350)
    assert eval_game(page, "g.key") is not None, "key did not spawn after its delay elapsed"
    lifetime_remaining = eval_game(page, "g.key.expiresAt - performance.now()")
    assert 0 < lifetime_remaining <= 7000

    run_in_game(page, "g.key.expiresAt = performance.now() + 100;")
    page.wait_for_timeout(300)
    assert eval_game(page, "g.key") is None, "key did not disappear after its lifetime elapsed"
    next_delay = eval_game(page, "g.nextKeySpawnMs")
    assert 10000 <= next_delay <= 30000, "repeat-cycle delay out of range"


def test_collecting_key_and_reaching_exit_completes_level(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))
    start_game(page, 6)
    page.wait_for_timeout(100)
    keep_alive(page)
    run_in_game(page, "g.nextKeySpawnMs = 100;")
    page.wait_for_timeout(300)

    key = eval_game(page, "g.key")
    _pin(page, key["x"] - 1, key["y"])
    run_in_game(page, "g.snake.direction = 'RIGHT'; g.snake.pendingDirections = [];")
    page.wait_for_timeout(200)
    assert eval_game(page, "g.hasKey") is True

    exit_pos = eval_game(page, "g.exit")
    _pin(page, exit_pos["x"] - 1, exit_pos["y"])
    run_in_game(page, "g.snake.direction = 'RIGHT'; g.snake.pendingDirections = [];")
    page.wait_for_timeout(250)
    assert eval_game(page, "g.ended") is True
    assert eval_game(page, "g.endReason") == "objective"


def test_portal_teleports_to_its_pair(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))
    start_game(page, 6)
    page.wait_for_timeout(100)
    portal_a = eval_game(page, "g.portals[0]")
    portal_b = eval_game(page, "g.portals[1]")
    _pin(page, portal_a["x"] - 1, portal_a["y"])
    run_in_game(page, "g.snake.direction = 'RIGHT'; g.snake.pendingDirections = [];")

    # poll for the head landing exactly on portal B - the first tick teleports it there;
    # a fixed sleep risks a second tick already having moved it one cell further by the
    # time we check.
    reached = wait_until(page, f"g.snake.segments[0].x === {portal_b['x']} && g.snake.segments[0].y === {portal_b['y']}", timeout_ms=1000)
    assert reached, f"snake never landed on portal B ({portal_b}); last head: {eval_game(page, 'g.snake.segments[0]')}"


def test_portals_cycle_away_and_regenerate(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))
    start_game(page, "endless")
    page.wait_for_timeout(100)
    keep_alive(page)
    assert eval_game(page, "g.portals.length") == 2, "Endless mode should place a portal pair at start"

    run_in_game(page, "g.nextPortalCycleMs = 150;")
    page.wait_for_timeout(400)
    assert eval_game(page, "g.portals.length") == 0, "portals did not vanish on schedule"

    run_in_game(page, "g.nextPortalCycleMs = 150;")
    page.wait_for_timeout(400)
    assert eval_game(page, "g.portals.length") == 2, "portals did not regenerate after the cooldown"


def test_laser_toggles_between_safe_and_dangerous(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))
    start_game(page, 6)
    page.wait_for_timeout(100)
    keep_alive(page)

    states = set()
    for _ in range(4):
        _pin(page)  # keep the snake away from the laser cells between checks
        states.add(eval_game(page, "g.obstacles.find(o => o.type === 'laser').dangerous"))
        page.wait_for_timeout(600)
    assert states == {True, False}, f"laser never toggled both states: {states}"


def test_moving_hazard_relocates_over_time(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))
    start_game(page, 4)  # Jungle Ruins
    page.wait_for_timeout(100)
    keep_alive(page)

    before = eval_game(page, "g.obstacles.filter(o => o.type === 'bug').map(o => ({x:o.x,y:o.y}))")
    # re-pin the snake into a safe corner repeatedly so an unsteered wander can't hit one of
    # Jungle Ruins' dangerous obstacles and freeze the tick loop mid-test (game.ended stops
    # every per-tick update, including hazard movement, so a stray death would make this
    # look like "hazards never move" when the real cause is unrelated).
    moved = False
    for _ in range(6):
        _pin(page, 2, 2)
        assert eval_game(page, "g.ended") is False, "snake died mid-test (unrelated to hazard movement)"
        page.wait_for_timeout(400)
        after = eval_game(page, "g.obstacles.filter(o => o.type === 'bug').map(o => ({x:o.x,y:o.y}))")
        if after != before:
            moved = True
            break
    assert moved, "no bug obstacle moved after 2.4s"


def test_slippery_ice_delays_turning_by_a_tick(page):
    set_save(page, base_save(unlockedLevels=[1, 2, 3, 4, 5, 6]))
    start_game(page, 3)  # Snowy Peaks (slippery)
    page.wait_for_timeout(100)
    _pin(page)
    run_in_game(page, "g.snake.direction = 'RIGHT'; g.snake.pendingDirections = []; g.snake.slipTickCounter = 0;")
    page.keyboard.press("ArrowUp")

    # the turn must NOT be immediate on slippery ice
    immediate = snapshot(page, "g.snake.direction") == "UP"
    assert not immediate, "slippery ice turned on the very first tick - delay is not being applied"

    # but it must still happen eventually (slippery delays turning, it doesn't block it)
    turned = wait_until(page, "g.snake.direction === 'UP'", timeout_ms=1500)
    assert turned, "snake never turned at all on slippery ice"


def test_garden_grove_turns_immediately_no_slip_delay(page):
    """Control case for the slippery test above: a non-slippery level should turn right away."""
    set_save(page, base_save())
    start_game(page, 1)  # Garden Grove (not slippery)
    page.wait_for_timeout(100)
    _pin(page)
    run_in_game(page, "g.snake.direction = 'RIGHT'; g.snake.pendingDirections = [];")
    page.keyboard.press("ArrowUp")
    turned = wait_until(page, "g.snake.direction === 'UP'", timeout_ms=500)
    assert turned, "a non-slippery level should turn within its very first tick"


def test_shield_absorbs_exactly_one_hit(page):
    start_game(page, "classic")
    page.wait_for_timeout(100)
    run_in_game(page, """
      const gs = g.level.gridSize;
      g.snake.activeEffects = [{type: 'shield', remainingMs: Infinity}];
      g.snake.segments = [{x: gs-1, y: 10}, {x: gs-2, y: 10}, {x: gs-3, y: 10}];
      g.snake.prevSegments = g.snake.segments.map(s => ({...s}));
      g.snake.direction = 'RIGHT';
      g.snake.pendingDirections = [];
    """)
    # poll for the moment the shield is consumed, reading it together with `ended` in the
    # SAME round-trip so the two values are consistent with each other (a naive two-step
    # check - wait, then read `ended`, then read `activeEffects` - risks a second real wall
    # hit landing in between the two separate reads, since the snake is still facing the
    # wall and the shield only protects against the first hit).
    deadline_state = None
    for _ in range(50):
        deadline_state = snapshot(page, "({ ended: g.ended, effects: g.snake.activeEffects.length })")
        if deadline_state["effects"] == 0:
            break
        page.wait_for_timeout(20)
    assert deadline_state["effects"] == 0, "shield was never consumed - collision may not have been detected"
    assert deadline_state["ended"] is False, "shield did not absorb the hit - game had already ended"


def test_ghost_mode_passes_through_a_dangerous_obstacle(page):
    start_game(page, "classic")
    page.wait_for_timeout(100)
    run_in_game(page, """
      g.snake.activeEffects = [{type: 'ghost', remainingMs: Infinity}];
      g.obstacles = [{x: 11, y: 10, type: 'rock', dangerous: true}];
      g.snake.segments = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
      g.snake.prevSegments = g.snake.segments.map(s => ({...s}));
      g.snake.direction = 'RIGHT';
      g.snake.pendingDirections = [];
    """)
    # ghost mode never expires here, so rather than pin an exact tick count, just confirm
    # the snake ends up past the obstacle's x position alive - proof it passed through it.
    passed_through = wait_until(page, "g.snake.segments[0].x > 11", timeout_ms=1000)
    assert passed_through, f"snake never passed x=11; last head: {eval_game(page, 'g.snake.segments[0]')}"
    assert eval_game(page, "g.ended") is False, "ghost mode did not prevent the obstacle collision"
