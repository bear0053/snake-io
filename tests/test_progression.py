"""Level completion rewards/unlocks, difficulty scaling, and high-score persistence."""
from helpers import base_save, click_visible, eval_game, read_save, run_in_game, set_save, start_game


def test_completing_a_level_unlocks_the_next_one_and_shows_stars(page):
    set_save(page, base_save())
    start_game(page, 1)  # Garden Grove
    page.wait_for_timeout(100)
    run_in_game(page, """
      g.objectiveProgress = g.level.objective.target - 1;
      const head = g.snake.segments[0];
      g.foods = [{x: head.x + 1, y: head.y, type: 'regular', points: 10, spawnedAt: performance.now(), expiresAt: performance.now()+9999, sparklePhase: 0}];
      g.obstacles = [];
      g.snake.direction = 'RIGHT';
      g.snake.pendingDirections = [];
    """)
    page.wait_for_timeout(300)
    assert page.is_visible("#screen-level-complete")
    assert "2 unlocked" in page.text_content("#lc-unlock") or "unlocked" in page.text_content("#lc-unlock")
    assert read_save(page)["unlockedLevels"] == [1, 2]


def test_classic_and_endless_high_scores_are_recorded_independently(page):
    set_save(page, base_save())
    start_game(page, "classic")
    page.wait_for_timeout(100)
    run_in_game(page, "g.score = 250; g.ended = true; g.endReason = 'wall';")
    page.wait_for_timeout(400)
    save_after_classic = read_save(page)
    assert save_after_classic["highScores"]["classic"] == 250
    assert save_after_classic["highScores"]["endless"] == 0

    click_visible(page, '[data-action="quit-to-menu"]')
    start_game(page, "endless")
    page.wait_for_timeout(100)
    run_in_game(page, "g.score = 600; g.ended = true; g.endReason = 'wall';")
    page.wait_for_timeout(400)
    save_after_endless = read_save(page)
    assert save_after_endless["highScores"]["endless"] == 600
    assert save_after_endless["highScores"]["classic"] == 250, "classic high score should be untouched"


def test_hard_difficulty_spawns_more_obstacles_than_easy(page):
    set_save(page, base_save(settings={"musicOn": False, "sfxOn": False, "musicVolume": 0.6, "difficulty": "easy", "controlType": "auto"}))
    start_game(page, 1)
    page.wait_for_timeout(100)
    easy_count = eval_game(page, "g.obstacles.length")

    set_save(page, base_save(settings={"musicOn": False, "sfxOn": False, "musicVolume": 0.6, "difficulty": "hard", "controlType": "auto"}))
    start_game(page, 1)
    page.wait_for_timeout(100)
    hard_count = eval_game(page, "g.obstacles.length")

    assert hard_count > easy_count, f"hard ({hard_count}) should spawn more obstacles than easy ({easy_count})"
