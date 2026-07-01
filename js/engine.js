import { Snake, makeFood, makePowerUp, makeObstacle, randomFreeCell, DIRS } from "./entities.js";
import { FOOD_TYPES, pickWeightedFoodType } from "./foods.js";
import { tickEffects, tryAbsorbCollision, hasActiveEffect, collectPowerUp } from "./powerups.js";
import { detectFatalCollision, wrapPosition } from "./collision.js";
import { applyDifficulty } from "./levels.js";
import { getSkin } from "./snakes.js";
import { AudioSys } from "./audio.js";

const MAX_POWERUPS_ON_BOARD = 2;
const LASER_CYCLE_MS = 1500;
const ENDLESS_RAMP_INTERVAL_MS = 10000;
const ENDLESS_MIN_SPEED = 60;
const ENDLESS_MAX_OBSTACLES = 24;
const FOOD_MIN_COUNT = 1;
const FOOD_MAX_COUNT = 3;
const FOOD_SPAWN_INTERVAL_MIN_MS = 1500;
const FOOD_SPAWN_INTERVAL_MAX_MS = 4000;

function randomFoodSpawnInterval() {
  return FOOD_SPAWN_INTERVAL_MIN_MS + Math.random() * (FOOD_SPAWN_INTERVAL_MAX_MS - FOOD_SPAWN_INTERVAL_MIN_MS);
}

export function createGame({ level, mode, skinId, difficulty }) {
  const adjLevel = applyDifficulty(level, difficulty);
  const snake = new Snake({ gridSize: adjLevel.gridSize, skinId });

  const game = {
    level: adjLevel,
    mode,
    difficulty,
    snake,
    foods: [],
    powerUps: [],
    obstacles: [],
    key: null,
    exit: null,
    hasKey: false,
    portals: [],
    score: 0,
    foodCollected: 0,
    startTime: performance.now(),
    elapsedMs: 0,
    objectiveProgress: 0,
    noHit: true,
    cellPx: 20,
    canvasCssSize: { width: 400, height: 400 },
    collisionFlash: { active: false, elapsedMs: 0, durationMs: 400 },
    levelTransition: { active: false, elapsedMs: 0, durationMs: 500 },
    powerUpTimer: 0,
    endlessRampTimer: 0,
    foodSpawnTimer: 0,
    nextFoodSpawnMs: randomFoodSpawnInterval(),
    ended: false,
    endReason: null,
    comboWindowMs: 2500,
    lastFoodAt: null,
    comboCount: 0
  };

  placeObstacles(game);
  spawnFood(game);
  if (adjLevel.objective?.type === "collect_key_reach_exit") spawnKeyAndExit(game);
  if (adjLevel.mechanics.portals) placePortals(game);
  return game;
}

function occupiedCells(game) {
  const extra = [];
  if (game.key) extra.push(game.key);
  if (game.exit) extra.push(game.exit);
  if (game.portals) extra.push(...game.portals);
  return [...game.snake.segments, ...game.obstacles, ...game.foods, ...game.powerUps, ...extra];
}

function resolveObstacleTypeDef(obstaclesDef, type) {
  return obstaclesDef.types.find(t => t.type === type);
}

function placeObstacles(game) {
  const { obstacles } = game.level;
  if (obstacles.placement === "fixed_layout" && obstacles.layout) {
    for (const o of obstacles.layout) {
      const typeDef = resolveObstacleTypeDef(obstacles, o.type);
      const obs = makeObstacle(o.x, o.y, o.type, typeDef?.dangerous ?? false);
      if (typeDef?.moving) initMovingObstacle(obs);
      game.obstacles.push(obs);
    }
    return;
  }
  for (const typeDef of obstacles.types) {
    for (let i = 0; i < typeDef.count; i++) {
      const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
      if (!cell) continue;
      const obs = makeObstacle(cell.x, cell.y, typeDef.type, typeDef.dangerous);
      if (typeDef.moving) initMovingObstacle(obs);
      game.obstacles.push(obs);
    }
  }
}

function initMovingObstacle(obs) {
  obs.moving = true;
  obs.moveAccumulator = 0;
  obs.moveIntervalMs = 450;
  obs.dir = null;
}

function spawnFood(game) {
  const typeDef = pickWeightedFoodType(game.level.foodTypes);
  const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!cell) return;
  game.foods.push(makeFood(cell.x, cell.y, typeDef.type, typeDef.points));
}

function updateFoodLifecycle(game, stepMs) {
  const now = performance.now();
  game.foods = game.foods.filter(f => f.expiresAt > now);

  if (game.foods.length < FOOD_MIN_COUNT) {
    spawnFood(game);
    game.foodSpawnTimer = 0;
    game.nextFoodSpawnMs = randomFoodSpawnInterval();
    return;
  }
  if (game.foods.length >= FOOD_MAX_COUNT) return;

  game.foodSpawnTimer += stepMs;
  if (game.foodSpawnTimer >= game.nextFoodSpawnMs) {
    game.foodSpawnTimer = 0;
    game.nextFoodSpawnMs = randomFoodSpawnInterval();
    spawnFood(game);
  }
}

function spawnPowerUp(game) {
  if (!game.level.powerUpPool.length || game.powerUps.length >= MAX_POWERUPS_ON_BOARD) return;
  const type = game.level.powerUpPool[Math.floor(Math.random() * game.level.powerUpPool.length)];
  const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!cell) return;
  game.powerUps.push(makePowerUp(cell.x, cell.y, type));
}

function updatePowerUpLifecycle(game) {
  const now = performance.now();
  game.powerUps = game.powerUps.filter(p => p.expiresAt > now);
}

function spawnKeyAndExit(game) {
  const keyCell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (keyCell) game.key = { x: keyCell.x, y: keyCell.y };
  const exitCell = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (exitCell) game.exit = { x: exitCell.x, y: exitCell.y };
}

function placePortals(game) {
  const a = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!a) return;
  game.portals.push({ x: a.x, y: a.y });
  const b = randomFreeCell(game.level.gridSize, occupiedCells(game));
  if (!b) {
    game.portals.pop();
    return;
  }
  game.portals.push({ x: b.x, y: b.y });
}

function endGame(game, reason) {
  if (game.ended) return;
  game.ended = true;
  game.endReason = reason;
  game.collisionFlash.active = true;
  game.collisionFlash.elapsedMs = 0;
  AudioSys.playSfx("collision");
}

function completeLevel(game) {
  if (game.ended) return;
  game.ended = true;
  game.endReason = "objective";
  game.score += 100;
  if (game.noHit) game.score += 100;
  AudioSys.playLevelComplete();
}

function handleFoodCollected(game, food) {
  const foodDef = FOOD_TYPES[food.type];

  if (foodDef.isPoison) {
    AudioSys.playSfx("poison");
    game.noHit = false;
    const levelFoodDef = game.level.foodTypes.find(f => f.type === "poison");
    if (levelFoodDef?.endsGame) {
      endGame(game, "poison");
      return;
    }
    game.score = Math.max(0, game.score + food.points);
    return;
  }

  AudioSys.playSfx("food");
  game.foodCollected++;
  game.snake.pendingGrowth += foodDef.growth;

  const now = performance.now();
  game.comboCount = (game.lastFoodAt && now - game.lastFoodAt < game.comboWindowMs) ? game.comboCount + 1 : 0;
  game.lastFoodAt = now;
  const comboBonus = game.comboCount * 5;

  const multiplier = hasActiveEffect(game.snake, "double_points") ? 2 : 1;
  game.score += (food.points + comboBonus) * multiplier;

  if (game.level.objective?.type === "collect_food") {
    game.objectiveProgress++;
    if (game.objectiveProgress >= game.level.objective.target) {
      completeLevel(game);
    }
  }
}

function checkPickups(game, head) {
  const foodIdx = game.foods.findIndex(f => f.x === head.x && f.y === head.y);
  if (foodIdx !== -1) {
    const food = game.foods[foodIdx];
    game.foods.splice(foodIdx, 1);
    handleFoodCollected(game, food);
  }
  if (game.ended) return;

  const puIdx = game.powerUps.findIndex(p => p.x === head.x && p.y === head.y);
  if (puIdx !== -1) {
    const pu = game.powerUps[puIdx];
    game.powerUps.splice(puIdx, 1);
    collectPowerUp(game, pu.type);
    AudioSys.playSfx("powerup");
  }

  if (game.key && head.x === game.key.x && head.y === game.key.y) {
    game.key = null;
    game.hasKey = true;
    AudioSys.playSfx("powerup");
  }

  if (game.exit && game.hasKey && head.x === game.exit.x && head.y === game.exit.y) {
    completeLevel(game);
    return;
  }

  if (game.portals.length === 2) {
    const idx = game.portals.findIndex(p => p.x === head.x && p.y === head.y);
    if (idx !== -1) {
      const dest = game.portals[1 - idx];
      head.x = dest.x;
      head.y = dest.y;
      game.snake.segments[0].x = dest.x;
      game.snake.segments[0].y = dest.y;
    }
  }
}

function checkObjective(game) {
  const obj = game.level.objective;
  if (!obj || game.ended) return;
  if (obj.type === "survive_time") {
    game.objectiveProgress = Math.min(obj.target, Math.floor(game.elapsedMs / 1000));
    if (game.elapsedMs >= obj.target * 1000) completeLevel(game);
  } else if (obj.type === "reach_score") {
    game.objectiveProgress = Math.min(obj.target, game.score);
    if (game.score >= obj.target) completeLevel(game);
  } else if (obj.type === "collect_key_reach_exit") {
    game.objectiveProgress = game.hasKey ? 1 : 0;
  }
  // "collect_food" progress is tracked incrementally in handleFoodCollected.
}

function updateLasers(game) {
  if (!game.level.mechanics.lasers) return;
  const on = Math.floor(game.elapsedMs / LASER_CYCLE_MS) % 2 === 0;
  for (const obs of game.obstacles) {
    if (obs.type === "laser") obs.dangerous = on;
  }
}

function updateMovingHazards(game, stepMs) {
  if (!game.level.mechanics.movingHazards) return;
  const dirs = Object.values(DIRS);
  for (const obs of game.obstacles) {
    if (!obs.moving) continue;
    obs.moveAccumulator += stepMs;
    if (obs.moveAccumulator < obs.moveIntervalMs) continue;
    obs.moveAccumulator = 0;

    if (!obs.dir || Math.random() < 0.35) {
      obs.dir = dirs[Math.floor(Math.random() * dirs.length)];
    }
    const nx = obs.x + obs.dir.x;
    const ny = obs.y + obs.dir.y;
    const inBounds = nx >= 0 && ny >= 0 && nx < game.level.gridSize && ny < game.level.gridSize;
    const blocked = !inBounds ||
      game.obstacles.some(o => o !== obs && o.x === nx && o.y === ny) ||
      game.snake.segments.some(s => s.x === nx && s.y === ny);

    if (blocked) {
      obs.dir = dirs[Math.floor(Math.random() * dirs.length)];
      continue;
    }
    obs.x = nx;
    obs.y = ny;
  }
}

function updateEndlessRamp(game, stepMs) {
  if (game.mode !== "endless") return;
  game.endlessRampTimer += stepMs;
  if (game.endlessRampTimer < ENDLESS_RAMP_INTERVAL_MS) return;
  game.endlessRampTimer -= ENDLESS_RAMP_INTERVAL_MS;
  game.level.speed = Math.max(ENDLESS_MIN_SPEED, Math.round(game.level.speed * 0.92));
  if (game.obstacles.length < ENDLESS_MAX_OBSTACLES) {
    const cell = randomFreeCell(game.level.gridSize, occupiedCells(game));
    if (cell) game.obstacles.push(makeObstacle(cell.x, cell.y, "rock", true));
  }
}

function moveSnake(game, stepMs) {
  const snake = game.snake;
  snake.prevSegments = snake.segments.map(s => ({ ...s }));

  let dir;
  if (game.level.mechanics.slippery) {
    snake.slipTickCounter = (snake.slipTickCounter ?? 0) + 1;
    dir = (snake.slipTickCounter % 2 === 0 && snake.pendingDirections.length)
      ? snake.pendingDirections.shift()
      : snake.direction;
  } else {
    dir = snake.pendingDirections.shift() ?? snake.direction;
  }
  snake.direction = dir;

  let head = { x: snake.segments[0].x + DIRS[dir].x, y: snake.segments[0].y + DIRS[dir].y };
  if (game.level.mechanics.wraparound) head = wrapPosition(head, game.level.gridSize);

  const willGrow = snake.pendingGrowth > 0;
  const bodyToCheck = willGrow ? snake.segments : snake.segments.slice(0, -1);
  const obstaclesForCollision = hasActiveEffect(snake, "ghost") ? [] : game.obstacles;
  const collisionType = detectFatalCollision(head, game.level, bodyToCheck, obstaclesForCollision);

  if (collisionType) {
    if (tryAbsorbCollision(game)) return; // shield consumed, snake stays put this tick
    endGame(game, collisionType);
    return;
  }

  snake.segments.unshift(head);
  if (willGrow) {
    snake.pendingGrowth--;
    snake.prevSegments.unshift(snake.prevSegments[0]); // keep index alignment with grown segments for interpolation
  } else {
    snake.segments.pop();
  }

  const skin = getSkin(snake.skinId);
  if (skin.trailEffect) {
    const tail = snake.prevSegments.at(-1);
    if (tail) snake.trailParticles.push({ x: tail.x, y: tail.y, life: 1 });
  }
  snake.trailParticles.forEach(p => { p.life -= stepMs / 400; });
  snake.trailParticles = snake.trailParticles.filter(p => p.life > 0);

  checkPickups(game, head);
}

export function tickGame(game, stepMs) {
  if (game.ended) return;
  game.elapsedMs += stepMs;
  updateFoodLifecycle(game, stepMs);
  updatePowerUpLifecycle(game);
  game.powerUpTimer += stepMs;
  if (game.powerUpTimer >= game.level.powerUpSpawnRateMs) {
    game.powerUpTimer = 0;
    spawnPowerUp(game);
  }
  tickEffects(game, stepMs);
  updateLasers(game);
  updateMovingHazards(game, stepMs);
  updateEndlessRamp(game, stepMs);
  moveSnake(game, stepMs);
  if (!game.ended) checkObjective(game);
}

// --- Persistent RAF loop --------------------------------------------------

export function createGameLoop({ ctx, render, isActive, getStepMs, getGame, onEnded }) {
  let lastTime = 0;
  let accumulator = 0;

  function frame(timestamp) {
    requestAnimationFrame(frame);
    if (document.hidden || !isActive()) {
      lastTime = timestamp;
      return;
    }
    const delta = Math.min(timestamp - lastTime, 250); // clamp to avoid huge catch-up after tab switch
    lastTime = timestamp;
    accumulator += delta;
    const stepMs = getStepMs();
    const game = getGame();

    while (accumulator >= stepMs) {
      tickGame(game, stepMs);
      accumulator -= stepMs;
      if (game.ended) {
        accumulator = 0;
        onEnded(game);
        break;
      }
    }

    if (game.collisionFlash.active) {
      game.collisionFlash.elapsedMs += delta;
      if (game.collisionFlash.elapsedMs >= game.collisionFlash.durationMs) game.collisionFlash.active = false;
    }
    if (game.levelTransition.active) {
      game.levelTransition.elapsedMs += delta;
      if (game.levelTransition.elapsedMs >= game.levelTransition.durationMs) game.levelTransition.active = false;
    }

    render(game, accumulator / stepMs);
  }

  requestAnimationFrame(frame);
}
